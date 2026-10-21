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
eq(index.includes('photos.js?v=2') && index.includes('inv.js?v=10') && index.includes('production.js?v=9') && index.includes('review.js?v=19') && index.includes('app.js?v=33') && index.includes('app.css?v=39'), 'changed files are cache-busted');
eq(fast.includes('photoThumbs: 1, photoFile: 1') && fast.includes('NOT added to FAST.CACHE'), 'Fast.gs keeps the new actions as fresh reads');
eq(steps.includes('PASTE_STEPS') && steps.includes('Manage deployments') && steps.includes('New version'), 'paste steps tell the owner to deploy a new version');

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
      (data.piece || []).forEach(jo => { piece[jo] = { id: 'f-' + jo, src: 'data:image/jpeg;base64,' + jo, found: true }; });
      const scan = {};
      (data.scan || []).forEach(s => { scan[s.id] = 'data:image/jpeg;base64,s' + s.id; });
      return Promise.resolve({ ok: true, size: data.size, piece, scan });
    }
    return Promise.resolve({ ok: false, error: 'Unknown action' });
  }
};
vm.createContext(ctx);
vm.runInContext(photos, ctx, { filename: 'photos.js' });
const P = ctx.window.OYPPhotos;
const rootEl = { isConnected: true, querySelectorAll: () => els };
P.watch(rootEl, {
  sel: '[data-th]',
  item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
  paint() {}
});
setTimeout(() => {
  const thumbs = calls.filter(c => c.action === 'photoThumbs' && c.data.size === 300);
  eq(thumbs.length === 1, 'visible tiles share one photoThumbs call');
  eq(thumbs[0] && thumbs[0].data.piece.join() === '26-101,26-102', 'that call names every visible JO');
  P.load({ jo: '26-101', kind: 'piece', size: 300, legacy: 'inv' }).then(src => {
    eq(src.indexOf('26-101') > 0, 'a repeat view is served from memory');
    eq(calls.filter(c => c.action === 'photoThumbs' && c.data.size === 300).length === 1, 'a cached tile does not call the server again');
    return P.load({ jo: '26-200', id: 'abc', kind: 'scan', size: 1600, legacy: 'prod' });
  }).then(() => {
    const med = calls.filter(c => c.data && c.data.size === 1600);
    eq(med.length === 1 && med[0].data.scan[0].id === 'abc', 'the medium image is a separate 1600 request');
    if (failed) { console.error(failed + ' failed'); process.exit(1); }
    console.log('ok photos');
  }).catch(err => { console.error(err); process.exit(1); });
}, 80);
