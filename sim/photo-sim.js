/* Photo lists are one batched call, cached by file id. Run: node sim/photo-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } }

const gs = read('paste/PhotoFast.gs');
const photos = read('photos.js');
const inv = read('inv.js');
const prod = read('production.js');
const review = read('review.js');
const app = read('app.js');
const index = read('staff/index.html');
const fast = read('paste/Fast.gs.photo.patch.txt');
const steps = read('paste/SETUP-photos.txt');

eq((gs.match(/f\.getBlob\(/g) || []).length === 1, 'the full Drive file is read in one place');
eq(gs.includes('function pfOriginal_'), 'that place is the original-size fetch');
eq(gs.includes('=s') && gs.includes('thumbnailLink') && gs.includes('getOAuthToken'), 'thumbnails use thumbnailLink at a chosen size with the script token');
eq(gs.includes('CacheService') && gs.includes('pf1:'), 'thumbnails are cached by file id and size');
eq(gs.includes('95000'), 'a cache value stays under the 100KB limit');
eq(!/oauthScopes|auth\/drive\.readonly|spreadsheets/.test(gs), 'PhotoFast adds no scopes');
eq(gs.includes('product_photo_file_id') && gs.includes('OcrLog'), 'piece photos are not card scans');
eq(!inv.includes('slice(0, 60)'), 'inventory no longer stops at 60 tiles');
eq(inv.includes('OYPPhotos.watch') && inv.includes('OYPPhotos.stage'), 'inventory tiles are lazy and the sheet opens through the photo stage');
eq(prod.includes("size: 300") && prod.includes('prefetch') && prod.includes('OYPPhotos.stage'), 'production cards are 300px and the JO prefetches the medium image');
eq(review.includes('1600') && review.includes('Open original') === false && review.includes('.phorig'), 'review keeps its own wording, asks for 1600, and leaves Open original clicks alone');
eq(review.includes("size: sz") && review.includes('prefetch'), 'review loads through the shared cache and prefetches');
eq(photos.includes('indexedDB') && photos.includes('localStorage') && photos.includes('photoThumbs') && photos.includes('Open original'), 'the client caches and still has Open original');
eq(app.includes('photoThumbs: 1') && app.includes('photoFile: 1'), 'photo reads do not clear the page cache');
const cached = app.slice(app.indexOf('const CACHED'), app.indexOf('const READS'));
eq(!/photoThumbs|photoFile/.test(cached), 'photo answers are not stored with the page cache');
eq(index.includes('photos.js?v=6') && index.includes('inv.js?v=22') && index.includes('production.js?v=15') && index.includes('review.js?v=23') && index.includes('app.js?v=40') && index.includes('app.css?v=56') && index.includes('nav.js?v=66'), 'changed files are cache-busted');
eq(fast.includes('photoThumbs: 1, photoFile: 1') && fast.includes('NOT added to FAST.CACHE'), 'Fast.gs keeps the new actions as fresh reads');
eq(steps.includes('PASTE_STEPS') && steps.includes('Manage deployments') && steps.includes('New version'), 'paste steps tell the owner to deploy a new version');
eq(steps.includes('Replace that file') && steps.includes('Page 1 is never') && steps.includes('drawings folder'), 'the new paste steps replace PhotoFast and describe the stand-in');
eq(gs.includes("['cad', 'drawings']") && gs.includes("['product', 'photos', 'piece']"), 'drawings sit beside cad, and the profile walks product, photos, and piece');
eq(gs.includes('pfj2:') && gs.includes('pfc2:') && gs.includes('CARD: 90') && gs.includes('MISS: 600'), 'a missing product photo is cached for 10 minutes and a card list for 90 seconds');
eq(gs.includes("cards[i].page === 2 && cards[i].side === 'a'"), 'the stand-in is page 2 front');
eq(/\$\{can\.cost \? `<div class="ivjoph"[^`]*JO photos/.test(inv) && inv.includes('Sketch from JO card') && inv.includes('fallback: !!can.cost'), 'JO photos and the stand-in follow the cost gate');
eq(photos.includes("MEM.set('sketch:'") && photos.includes('!item.sketch'), 'a stand-in is kept for this visit and is not stored as the profile');
eq(review.includes('id="rvJoPh"') && review.includes("kind: 'card'") && review.includes('Open original') === false, 'the JO card lists Drive scans without an OcrLog row');
eq(read('app.css').includes('.ivph.big.sketch{aspect-ratio:auto;height:auto;display:block;background:#fff}') && read('app.css').includes('.ivph.big.phstage.sketch>img{position:static;inset:auto;width:100%;height:auto;object-fit:contain;background:#fff}') && read('app.css').includes('.iview.sketch{background:#fff}'), 'the sketch frame follows the crop on white, and the viewer matches');
eq(photos.includes('function sketchBox') && photos.includes('function sketchFrame') && photos.includes('presentSketch') && photos.includes('SKETCH_ROI') && !photos.includes('SKETCH_FRAME'), 'a page-2 stand-in is cropped to the ink and is not stretched to the old frame');
eq(inv.includes("root.className = 'iview' + (o.sketch ? ' sketch' : '')"), 'a sketch opens in the white viewer');
const cardClick = inv.slice(inv.indexOf('el.onclick = e =>'), inv.indexOf('ivWireSheet(main);'));
eq(cardClick.includes('ivMountSheet(main)') && !cardClick.includes('ivOpenCard'), 'tapping an inventory item stays on Inventory');
eq(inv.includes('>REVIEW<') && inv.includes('function ivOpenViewer') && inv.includes('OYPReview.mount') && inv.includes("review: ['REVIEW'") && inv.includes("debug: ['DEBUG'"), 'a pending JO is reviewed in Inventory and a photo opens large');
eq(read('app.js').includes("cur0 === 'review'") && read('app.js').includes("cur0 === 'look'") && read('nav.js').includes('data-ncount="review"') && !read('nav.js').includes("['review', 'To review']") && !read('nav.js').includes("['look', 'Needs a look']"), 'old review and look links open Inventory and the menu count sits on Inventory');
eq(review.includes('function bindJob') && review.includes('mark_reviewed: mark') && review.includes('async function mount(host'), 'inline review uses the review page save');
eq(!read('count.js').includes('fallback'), 'inventory count does not ask for a card scan');
['track.js', 'my/my.js', 'shop/shop.js'].forEach(f => eq(!read(f).includes('photoThumbs'), f + ' does not ask for staff photos'));

const bag = {};
const cache = {
  get: k => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
  put: (k, v) => { bag[k] = String(v); },
  remove: k => { delete bag[k]; },
  getAll: keys => {
    const o = {};
    (keys || []).forEach(k => { if (bag[k] != null) o[k] = bag[k]; });
    return o;
  },
  putAll: obj => { Object.keys(obj || {}).forEach(k => { bag[k] = String(obj[k]); }); }
};
const clearBag = () => { Object.keys(bag).forEach(k => { delete bag[k]; }); };
const files = {};
function jpeg() {
  return { getContentType: () => 'image/jpeg', getBytes: () => [255, 216, 255, 217] };
}
function makeFile(id, name, mime) {
  const f = {
    getId: () => id,
    getName: () => name,
    getMimeType: () => mime || 'image/jpeg',
    isTrashed: () => false,
    getSize: () => 120,
    getThumbnail: jpeg,
    getBlob: jpeg
  };
  files[id] = f;
  return f;
}
function iter(list) {
  let i = 0;
  return { hasNext: () => i < list.length, next: () => list[i++] };
}
function makeFolder(spec) {
  return {
    getFiles: () => iter(spec.files),
    getFoldersByName: name => iter(spec.subs[name] ? [spec.subs[name]] : [])
  };
}
const folders = {
  fold425: makeFolder({ files: [
    makeFile('c4251a01', '26-425-1a.jpg'),
    makeFile('c4251b01', '26-425-1b.jpg'),
    makeFile('c4252a01', '26-425-2A.JPG'),
    makeFile('note42501', 'notes.txt', 'text/plain'),
    makeFile('rand42501', 'random.jpg'),
    makeFile('check4251', 'CHECK-26-425-2a.jpg')
  ], subs: {} }),
  fold500: makeFolder({ files: [makeFile('c5002a01', '26-500-2a.jpg')], subs: {} }),
  fold700: makeFolder({ files: [makeFile('c7002a01', '26-700-2a.jpg')], subs: { product: makeFolder({ files: [makeFile('prod70001', 'ring.jpg')], subs: {} }) } }),
  fold800: makeFolder({ files: [makeFile('c8001a01', '26-800-1a.jpg'), makeFile('c8002a01', '26-800-2a.jpg')], subs: { cad: makeFolder({ files: [makeFile('cad800001', 'design.png', 'image/png')], subs: {} }) } }),
  fold900: makeFolder({ files: [makeFile('c9002a01', '26-900-2a.jpg')], subs: { drawings: makeFolder({ files: [makeFile('draw90001', 'hand.jpg')], subs: {} }) } }),
  fold410: makeFolder({ files: [makeFile('c4101a01', '26-410-1a.jpg'), makeFile('c4101b01', '26-410-1b.jpg')], subs: {} }),
  fold501: makeFolder({ files: [makeFile('c5011a01', '26-501-1a.jpg'), makeFile('c5012a01', '26-501-2a.jpg')], subs: {} })
};
makeFile('prod50001', 'product.jpg');
const jobs = [
  { jo: '26-425', drive_folder_id: 'fold425', product_photo_file_id: '' },
  { jo: '26-500', drive_folder_id: 'fold500', product_photo_file_id: 'prod50001' },
  { jo: '26-700', drive_folder_id: 'fold700' },
  { jo: '26-800', drive_folder_id: 'fold800' },
  { jo: '26-900', drive_folder_id: 'fold900' },
  { jo: '26-410', drive_folder_id: 'fold410' },
  { jo: '26-501', drive_folder_id: 'fold501', product_photo_file_id: 'c5011a01' }
];
const gsBox = {
  DriveApp: {
    getFolderById: id => { if (!folders[id]) throw new Error('missing folder'); return folders[id]; },
    getFileById: id => { if (!files[id]) throw new Error('missing file'); return files[id]; }
  },
  CacheService: { getScriptCache: () => cache },
  UrlFetchApp: {
    fetchAll: reqs => (reqs || []).map(() => ({
      getResponseCode: () => 200,
      getHeaders: () => ({ 'Content-Type': 'image/jpeg' }),
      getBlob: jpeg
    }))
  },
  ScriptApp: { getOAuthToken: () => 'tok' },
  Utilities: { base64Encode: bytes => Buffer.from(bytes).toString('base64') },
  jobRows_: name => (name === 'JobOrders' ? jobs : []),
  isExec_: () => false
};
vm.createContext(gsBox);
vm.runInContext(gs, gsBox, { filename: 'PhotoFast.gs' });
const admin = { username: 'a', role: 'admin' };
const pm = { username: 'p', role: 'production_manager' };
const accounting = { username: 'c', role: 'accounting' };
const staff = { username: 's', role: 'staff' };
const client = { username: 'u', role: 'client' };
function thumbs(user, body) {
  return gsBox.handlePhotoFast_(Object.assign({ action: 'photoThumbs', size: 300 }, body), user);
}
eq(gsBox.PF.CARD === 90 && gsBox.PF.MISS === 600, 'card lists expire in 90 seconds and a folder miss in 10 minutes');
clearBag();
const hand = thumbs(admin, { piece: ['26-425'], fallback: ['26-425'], cards: ['26-425'] });
const cell = hand.piece['26-425'];
eq(hand.ok && cell.sketch && cell.id === 'c4252a01' && cell.id !== 'c4251a01' && String(cell.src).indexOf('data:image/jpeg;base64,') === 0, '26-425 uses page 2 front as the stand-in');
eq(hand.cards['26-425'].map(c => c.page + c.side).join() === '1a,1b,2a', 'root card scans include the back');
eq(hand.cards['26-425'].every(c => c.id !== 'check4251' && c.id !== 'rand42501' && c.id !== 'note42501'), 'notes, loose images, and CHECK files are not card scans');
eq(thumbs(pm, { piece: ['26-425'], fallback: ['26-425'] }).piece['26-425'].id === 'c4252a01', 'a production manager gets the same stand-in');
function noCards(user, msg) {
  const r = thumbs(user, { piece: ['26-425'], fallback: ['26-425'], cards: ['26-425'], scan: [{ jo: '26-425', id: 'c4251a01', card: 1 }] });
  eq(r.ok && !r.piece['26-425'].sketch && r.piece['26-425'].src === '' && !r.cards['26-425'] && !r.scan['c4251a01'], msg);
}
noCards(accounting, 'accounting sees no card scan and no stand-in');
noCards(staff, 'staff sees no card scan and no stand-in');
noCards(client, 'a client role sees no card scan and no stand-in');
eq(gsBox.handlePhotoFast_({ action: 'photoThumbs', piece: ['26-425'], fallback: ['26-425'] }, null).code === 'NO_SESSION', 'a signed-out caller gets nothing');
const denied = gsBox.handlePhotoFast_({ action: 'photoFile', kind: 'card', jo: '26-425', id: 'c4251a01', size: 300 }, accounting);
eq(denied.code === 'FORBIDDEN', 'accounting cannot open a card scan');
const opened = gsBox.handlePhotoFast_({ action: 'photoFile', kind: 'card', jo: '26-425', id: 'c4252a01', size: 1600 }, admin);
eq(opened.ok && String(opened.src).indexOf('data:image/') === 0, 'a cost role can open page 2');
eq(gsBox.handlePhotoFast_({ action: 'photoFile', kind: 'piece', jo: '26-425', id: 'c4252a01', size: 300 }, admin).src === '', 'kind piece refuses the page 2 scan');
eq(gsBox.handlePhotoFast_({ action: 'photoFile', kind: 'piece', jo: '26-425', id: 'c4251a01', size: 300 }, admin).src === '', 'kind piece refuses page 1');
clearBag();
cache.put('pfj2:26-500', JSON.stringify({ ids: [], found: false }));
const col = thumbs(admin, { piece: ['26-500'], fallback: ['26-500'], cards: ['26-500'] });
eq(col.piece['26-500'].id === 'prod50001' && !col.piece['26-500'].sketch, 'product_photo_file_id replaces the stand-in on the next call');
clearBag();
const folderPhoto = thumbs(admin, { piece: ['26-700'], fallback: ['26-700'] });
eq(folderPhoto.piece['26-700'].id === 'prod70001' && !folderPhoto.piece['26-700'].sketch, 'a file in product is the profile');
clearBag();
const cad = thumbs(admin, { piece: ['26-800'], fallback: ['26-800'], drawing: ['26-800'], cards: ['26-800'] });
eq(cad.piece['26-800'].sketch && cad.piece['26-800'].id === 'c8002a01' && cad.piece['26-800'].id !== 'c8001a01', 'a cad file is not the profile and page 1 is never the stand-in');
eq(cad.drawing['26-800'].some(d => d.id === 'cad800001' && String(d.src).indexOf('data:image/') === 0), 'a cad file is returned as a drawing');
clearBag();
const drawn = thumbs(admin, { piece: ['26-900'], fallback: ['26-900'], drawing: ['26-900'] });
eq(drawn.drawing['26-900'].some(d => d.id === 'draw90001'), 'a drawings folder is the same photo type as cad');
eq(drawn.piece['26-900'].sketch && drawn.piece['26-900'].id === 'c9002a01', 'a drawing is not the stand-in profile');
clearBag();
const nob = thumbs(admin, { piece: ['26-410'], fallback: ['26-410'], cards: ['26-410'] });
eq(!nob.piece['26-410'].sketch && !nob.piece['26-410'].id && nob.cards['26-410'].length === 2, 'page 1 alone is listed and is not a profile');
clearBag();
const named = thumbs(admin, { piece: ['26-501'], fallback: ['26-501'] });
eq(named.piece['26-501'].sketch && named.piece['26-501'].id === 'c5012a01', 'a card id stored as the product photo is not the profile');
clearBag();
cache.put('pfj1:26-425', JSON.stringify({ ids: [], found: false }));
eq(thumbs(admin, { piece: ['26-425'], fallback: ['26-425'] }).piece['26-425'].id === 'c4252a01', 'the old 10-minute miss does not hide the stand-in');
clearBag();
cache.put('pfc2:26-425', JSON.stringify({ cards: [] }));
cache.put('pfj2:26-425', JSON.stringify({ ids: [], found: false }));
const held = thumbs(admin, { piece: ['26-425'], fallback: ['26-425'], cards: ['26-425'] });
eq(!held.piece['26-425'].id && !held.piece['26-425'].sketch && held.cards['26-425'].length === 0, 'a new page 2 waits out the short card cache');
eq(JSON.parse(cache.get('pfj2:26-425')).found === false, 'the product-folder miss stays cached on its own');
delete bag['pfc2:26-425'];
eq(thumbs(admin, { piece: ['26-425'], fallback: ['26-425'] }).piece['26-425'].id === 'c4252a01', 'the stand-in shows once that card cache is gone');
clearBag();
gsBox.isExec_ = u => !!(u && u.role === 'executive');
eq(thumbs({ username: 'e', role: 'executive' }, { piece: ['26-425'], fallback: ['26-425'] }).piece['26-425'].sketch, 'an executive who can see costs gets the stand-in');
gsBox.isExec_ = () => false;
clearBag();
const plain = thumbs({ username: 'e', role: 'executive' }, { piece: ['26-425'], fallback: ['26-425'], cards: ['26-425'] });
eq(!plain.piece['26-425'].sketch && !plain.cards['26-425'], 'that role gets neither when isExec_ says no');

const calls = [];
const store = {};
const els = [
  { dataset: { th: '26-101' }, isConnected: true, classList: { add() {}, contains() { return false; } }, style: {}, querySelector() { return null; }, insertAdjacentHTML() {} },
  { dataset: { th: '26-102' }, isConnected: true, classList: { add() {}, contains() { return false; } }, style: {}, querySelector() { return null; }, insertAdjacentHTML() {} }
];
const ctx = {
  setTimeout, clearTimeout, Promise, Map,
  indexedDB: undefined,
  IntersectionObserver: class {
    constructor(cb) { this.cb = cb; }
    observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
    unobserve() {}
    disconnect() {}
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  }
};
ctx.window = ctx;
ctx.window.OYP = {
  call(action, data) {
    calls.push({ action, data });
    if (action === 'photoThumbs') {
      const piece = {};
      (data.piece || []).forEach(jo => {
        if (data.fallback && data.fallback.indexOf(jo) >= 0 && jo === '26-425') piece[jo] = { id: 'c4252a01', src: 'data:image/jpeg;base64,sketch425', found: false, sketch: true };
        else piece[jo] = { id: 'f-' + jo, src: 'data:image/jpeg;base64,' + jo, found: true };
      });
      const scan = {};
      (data.scan || []).forEach(s => { scan[s.id] = 'data:image/jpeg;base64,s' + s.id; });
      const cards = {};
      (data.cards || []).forEach(jo => {
        const list = jo === '26-425' ? [{ id: 'c4251a01', page: 1, side: 'a' }, { id: 'c4251b01', page: 1, side: 'b' }, { id: 'c4252a01', page: 2, side: 'a' }] : [];
        cards[jo] = list;
        list.forEach(c => { scan[c.id] = 'data:image/jpeg;base64,' + c.id; });
      });
      const drawing = {};
      (data.drawing || []).forEach(jo => { drawing[jo] = []; });
      return Promise.resolve({ ok: true, size: data.size, piece, scan, cards, drawing });
    }
    return Promise.resolve({ ok: false, error: 'Unknown action' });
  }
};
vm.createContext(ctx);
vm.runInContext(photos, ctx, { filename: 'photos.js' });
const P = ctx.window.OYPPhotos;
function paintSketch(w, h, blobs) {
  const px = new Uint8Array(w * h * 4);
  px.fill(255);
  blobs.forEach(b => {
    const [x, y, bw, bh, r, g, bl] = b;
    for (let yy = y; yy < y + bh && yy < h; yy++) {
      for (let xx = x; xx < x + bw && xx < w; xx++) {
        if (xx < 0 || yy < 0) continue;
        const i = (yy * w + xx) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = bl; px[i + 3] = 255;
      }
    }
  });
  return px;
}
eq(P.sketchBox(paintSketch(200, 200, []), 200, 200) === null, 'a blank page-2 panel has no sketch');
{
  const roi = P.SKETCH_ROI;
  const W = 400, H = 300;
  const x0 = Math.round(W * roi.x), y0 = Math.round(H * roi.y);
  const blank = P.sketchBox(paintSketch(W, H, [
    [x0 + 8, 4, 80, 8, 10, 10, 10],
    [x0 + 4, y0 + 90, 2, 2, 0, 0, 0]
  ]), W, H);
  eq(blank === null, 'a header above the design panel and a speck are not a sketch');
  const ink = P.sketchBox(paintSketch(W, H, [
    [x0 + 8, 4, 90, 10, 10, 10, 10],
    [x0 + 12, y0 + 18, 36, 12, 20, 20, 20],
    [x0 + 48, y0 + 70, 16, 16, 230, 190, 30],
    [x0 + 6, y0 + 120, 2, 2, 0, 0, 0]
  ]), W, H);
  const inside = ink && ink.x >= x0 && ink.y >= y0 && ink.x + ink.w <= Math.round(W * (roi.x + roi.w)) + 1 && ink.y + ink.h <= Math.round(H * (roi.y + roi.h)) + 1;
  const covers = ink && ink.x <= x0 + 12 && ink.y <= y0 + 18 && ink.x + ink.w >= x0 + 64 && ink.y + ink.h >= y0 + 86;
  eq(!!ink && inside && covers, 'the crop keeps the handwriting and the yellow bead and drops the header and the speck');
  const wide = P.sketchFrame({ x: 10, y: 40, w: 300, h: 80 }, { x: 0, y: 0, w: 400, h: 220 });
  eq(wide.x === 10 && wide.y === 40 && wide.w === 300 && wide.h === 80 && wide.cw === 300 && wide.ch === 80 && wide.dx === 0 && wide.dy === 0, 'a wide sketch is not grown into the page around it');
  const tall = P.sketchFrame({ x: 4, y: 8, w: 40, h: 90 }, { x: 0, y: 0, w: 200, h: 200 });
  eq(tall.x === 4 && tall.y === 8 && tall.w === 40 && tall.h === 90 && tall.cw === 40 && tall.ch === 90 && tall.dx === 0 && tall.dy === 0, 'a tall sketch stays tall so the frame can match it');
  const square = P.sketchFrame({ x: 2, y: 3, w: 100, h: 96 });
  eq(Math.abs(square.cw / square.ch - 100 / 96) < 0.001 && square.w === 100 && square.h === 96, 'a near-square sketch keeps its own aspect');
}
eq(P.pageLabel([{ page: 1, side: 'a' }, { page: 1, side: 'b' }, { page: 2, side: 'a' }], { page: 1, side: 'b' }) === 'Page 1 back', 'two sides name the back');
eq(P.pageLabel([{ page: 1, side: 'a' }, { page: 1, side: 'b' }, { page: 2, side: 'a' }], { page: 2, side: 'a' }) === 'Page 2', 'a single side is just the page');
const rootEl = { isConnected: true, querySelectorAll: () => els };
P.watch(rootEl, {
  sel: '[data-th]',
  item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
  paint() {}
});
let sketchAt = 0;
setTimeout(() => {
  const thumbs = calls.filter(c => c.action === 'photoThumbs' && c.data.size === 300);
  eq(thumbs.length === 1, 'visible tiles share one photoThumbs call');
  eq(thumbs[0] && thumbs[0].data.piece.join() === '26-101,26-102', 'that call names every visible JO');
  eq(thumbs[0] && thumbs[0].data.fallback == null, 'a tile with a real photo does not ask for a stand-in');
  P.load({ jo: '26-101', kind: 'piece', size: 300, legacy: 'inv' }).then(src => {
    eq(src.indexOf('26-101') > 0, 'a repeat view is served from memory');
    eq(calls.filter(c => c.action === 'photoThumbs' && c.data.size === 300).length === 1, 'a cached tile does not call the server again');
    return P.load({ jo: '26-200', id: 'abc', kind: 'scan', size: 1600, legacy: 'prod' });
  }).then(() => {
    const med = calls.filter(c => c.data && c.data.size === 1600);
    eq(med.length === 1 && med[0].data.scan[0].id === 'abc', 'the medium image is a separate 1600 request');
    sketchAt = calls.filter(c => c.action === 'photoThumbs').length;
    return P.load({ jo: '26-425', kind: 'piece', size: 300, fallback: true });
  }).then(src => {
    eq(src.indexOf('sketch425') > 0, 'a page-2 stand-in is shown');
    eq(!store['oypPhJ:26-425'] && !store['oypPh:c4252a01'], 'the stand-in is not stored as the JO profile');
    const asked = calls.filter(c => c.action === 'photoThumbs');
    eq(asked.length === sketchAt + 1 && asked[asked.length - 1].data.fallback.join() === '26-425', 'the stand-in is one fallback request');
    return P.load({ jo: '26-425', kind: 'piece', size: 300, fallback: true });
  }).then(src => {
    eq(src.indexOf('sketch425') > 0 && calls.filter(c => c.action === 'photoThumbs').length === sketchAt + 1, 'a remembered stand-in does not call again');
    store['oypPhJ:26-426'] = 'real42601';
    store['oypPh:real42601'] = 'data:image/jpeg;base64,real426';
    return P.load({ jo: '26-426', kind: 'piece', size: 300, fallback: true });
  }).then(src => {
    eq(src.indexOf('real426') > 0, 'a saved product photo wins over a stand-in');
    eq(!calls.some(c => c.data && c.data.piece && c.data.piece.indexOf('26-426') >= 0), 'a saved product photo does not ask for a card');
    return P.extras('26-425', { drawing: true, cards: true });
  }).then(x => {
    eq(x.cards.length === 3 && x.cards[2].src.indexOf('c4252a01') > 0, 'JO photos come back with the card list');
    eq(P.pageLabel(x.cards, x.cards[1]) === 'Page 1 back', 'the card list names page 1 back');
    eq(!store['oypPhJ:26-425'], 'a card thumb does not claim the profile');
    if (failed) { console.error(failed + ' failed'); process.exit(1); }
    console.log('ok photos');
  }).catch(err => { console.error(err); process.exit(1); });
}, 80);
