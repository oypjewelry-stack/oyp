/* Cached inventory thumbs and sketch stand-ins paint from memory.
   A second load of a stand-in does not call the server. The list still rechecks the tiles on screen in one batch.
   Run: node sim/photo-cache-sim.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const photos = read('photos.js');
const fast = read('paste/PhotoFast.gs');
const index = read('staff/index.html');

eq(photos.includes('openCursor') && photos.includes("'sk:'") && photos.includes('SKETCH_MAX_W = 480') && photos.includes("toDataURL('image/jpeg', 0.8)"), 'a stand-in is stored by JO and source file, shrunk to 480px jpeg 0.8');
eq(photos.includes('14 * 24 * 60 * 60 * 1000') && photos.includes('sketchStale') && photos.includes('dropStandIn'), 'stand-ins expire after 14 days and a real photo drops the stand-in');
eq(photos.includes("rootMargin: '800px'") && photos.includes('i < 16') && photos.includes("img.decoding = 'async'") && photos.includes('queueMicrotask'), 'the first tiles start on a microtask, look 800px ahead, and decode async');
eq(photos.includes("MEM.set('sketch:'") && photos.includes('!item.sketch') && photos.includes("MEM.set('jo:'"), 'a stand-in stays off the profile key');
eq(index.includes('photos.js?v=16'), 'photos.js cache number is bumped');
eq(photos.includes('SHARP_CAP = 900') && photos.includes("toDataURL('image/jpeg', 0.82)") && photos.includes('SHARP_RUN_MAX = 1') && photos.includes('SHARP_MEM_MAX = 12') && photos.includes('SHARP_IDB_MAX = 80') && photos.includes('QuotaExceeded'), 'list tiles upgrade to a device-pixel JPEG capped at 900');
eq(photos.includes('function sharpTier') && photos.includes('need <= 300') && photos.includes('need <= 600') && photos.includes('cropSketch(src)') && photos.includes("addEventListener('resize'") && photos.includes("addEventListener('orientationchange'"), 'tiers are 300, 600 and 900, and a resize measures the tiles again');
eq(photos.includes('PRE_WAIT = 300') && photos.includes('function preReady'), 'a stuck IndexedDB open releases the list after 300ms');
eq(fast.includes('return n >= 1000 ? PF.MED : PF.TILE') && fast.includes('if (!px) px = PF.TILE'), 'PhotoFast still serves the 300px tile for a list stand-in');

const data = new Map();
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const WHITE = 'data:image/jpeg;base64,WHITE428';
const SKETCH = 'data:image/jpeg;base64,SKETCH425';
function putSeed(key, val) { data.set(key, val); }
putSeed('sk:26-425|c425', { src: SKETCH, jo: '26-425', id: 'c425', at: now - DAY, sketch: true, size: 300 });
putSeed('sk:26-426|file426', { src: 'data:image/jpeg;base64,OLD426', jo: '26-426', id: 'file426', at: now - DAY, sketch: true, size: 300 });
putSeed('sk:26-427|old427', { src: 'data:image/jpeg;base64,OLD427', jo: '26-427', id: 'old427', at: now - 15 * DAY, sketch: true, size: 300 });
putSeed('sk:26-428|white428', { src: WHITE, jo: '26-428', id: 'white428', at: now - 2 * DAY, sketch: true, size: 300 });
putSeed('sk:26-429|old429', { src: 'data:image/jpeg;base64,OLD429', jo: '26-429', id: 'old429', at: now - DAY, sketch: true, size: 300 });
putSeed('jo:26-500|300', 'data:image/jpeg;base64,REAL500');
putSeed('f500|300', 'data:image/jpeg;base64,REAL500');

let cursors = 0, gets = 0;
function makeStore() {
  return {
    openCursor() {
      cursors++;
      const keys = [...data.keys()];
      let i = 0;
      const req = {};
      const step = () => {
        if (i >= keys.length) { req.result = null; if (req.onsuccess) req.onsuccess(); return; }
        const key = keys[i++];
        req.result = { key: key, value: data.get(key), continue() { queueMicrotask(step); } };
        if (req.onsuccess) req.onsuccess();
      };
      queueMicrotask(step);
      return req;
    },
    get(key) {
      gets++;
      const req = {};
      queueMicrotask(() => { req.result = data.has(key) ? data.get(key) : undefined; if (req.onsuccess) req.onsuccess(); });
      return req;
    },
    put(value, key) { data.set(key, value); },
    delete(key) { data.delete(key); }
  };
}
const idb = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        transaction() { return { objectStore: () => makeStore() }; }
      };
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  }
};

const calls = [];
let coldAt = 0, revAt = 0;
let live = 0, maxLive = 0;
const spans = [];
const store = {};
const ctx = {
  setTimeout, clearTimeout, Promise, Map, queueMicrotask, performance, Date,
  indexedDB: idb,
  IntersectionObserver: class {
    constructor(cb, opt) { this.cb = cb; this.margin = opt && opt.rootMargin; ctx._margin = this.margin; }
    observe(el) { ctx._observed++; }
    unobserve() {}
    disconnect() {}
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  }
};
ctx._observed = 0;
ctx._margin = '';
ctx.window = ctx;
ctx.window.OYP = {
  call(action, dataBody) {
    calls.push({ action: action, data: dataBody, at: performance.now() });
    if (action === 'photoThumbs') {
      if (!revAt && dataBody.piece && dataBody.piece.indexOf('26-426') >= 0) revAt = performance.now();
      if (!coldAt && dataBody.piece && dataBody.piece.indexOf('c0') >= 0) coldAt = performance.now();
      const big = dataBody.size >= 1000;
      const piece = {};
      (dataBody.piece || []).forEach(jo => {
        if (jo === 'ubad') piece[jo] = { id: 'id-ubad', src: 'data:image/jpeg;base64,W300H225ubad', found: true };
        else if (jo === 'usk') piece[jo] = { id: 'id-usk', src: big ? 'data:image/jpeg;base64,W1600H1200usk' : 'data:image/jpeg;base64,W300H206usk', found: false, sketch: true };
        else if (/^u\d+$/.test(jo)) piece[jo] = { id: 'id-' + jo, src: big ? 'data:image/jpeg;base64,W1600H1200' + jo : 'data:image/jpeg;base64,W300H225' + jo, found: true };
        else if (jo === '26-426') piece[jo] = { id: 'real426', src: 'data:image/jpeg;base64,REAL426', found: true };
        else if (jo === '26-427') piece[jo] = { id: 'c427', src: 'data:image/jpeg;base64,NEW427', found: false, sketch: true };
        else if (jo === '26-429') piece[jo] = { id: 'new429', src: 'data:image/jpeg;base64,NEW429', found: false, sketch: true };
        else if (jo === '26-425') piece[jo] = { id: 'c425', src: 'data:image/jpeg;base64,OTHER425', found: false, sketch: true };
        else piece[jo] = { id: 'f-' + jo, src: 'data:image/jpeg;base64,' + jo, found: true };
      });
      const payload = { ok: true, size: dataBody.size, piece: piece, scan: {}, cards: {}, drawing: {} };
      if (big && dataBody.piece && dataBody.piece.indexOf('ubad') >= 0) payload.ok = false;
      if (!big) return Promise.resolve(payload);
      live++;
      if (live > maxLive) maxLive = live;
      const span = { jo: (dataBody.piece || []).slice().join(), n: (dataBody.piece || []).length, start: performance.now(), end: 0 };
      spans.push(span);
      return new Promise(res => setTimeout(() => { live--; span.end = performance.now(); res(payload); }, 40));
    }
    return Promise.resolve({ ok: false, error: 'Unknown action' });
  }
};
vm.createContext(ctx);
const tPre = performance.now();
vm.runInContext(photos, ctx, { filename: 'photos.js' });
const P = ctx.window.OYPPhotos;

function tile(jo) { return { dataset: { th: jo }, isConnected: true }; }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await P.ready;
  const preloadMs = performance.now() - tPre;
  const tPeek = performance.now();
  const peeked = P.peek({ jo: '26-425', kind: 'piece', size: 300, fallback: true });
  const peekMs = performance.now() - tPeek;
  eq(typeof peeked === 'string' && peeked === SKETCH && calls.length === 0, 'preload fills MEM synchronously');
  eq(cursors === 1 && gets === 0, 'preload is one cursor pass and not a get per tile (' + cursors + ' cursors, ' + gets + ' gets)');
  eq(P.peek({ jo: '26-428', kind: 'piece', size: 300, fallback: true }) === WHITE, 'a cached white stand-in is instant');
  eq(P.peek({ jo: '26-500', kind: 'piece', size: 300 }) === 'data:image/jpeg;base64,REAL500', 'a cached product thumb is instant');
  eq(P.peek({ jo: '26-425', kind: 'piece', size: 300 }) === '', 'a stand-in is not returned as the profile');
  store['oypPhJ:26-900'] = 'real900';
  store['oypPh:real900'] = 'data:image/jpeg;base64,REAL900';
  eq(P.peek({ jo: '26-900', kind: 'piece', size: 300, fallback: true }) === 'data:image/jpeg;base64,REAL900' && calls.length === 0, 'localStorage still answers when IndexedDB has no profile');

  const tLoad = performance.now();
  const again = await P.load({ jo: '26-425', kind: 'piece', size: 300, fallback: true });
  const loadMs = performance.now() - tLoad;
  eq(again === SKETCH && calls.length === 0, 'second load of a stand-in does no network call');
  eq(!store['oypPhJ:26-425'] && !store['oypPh:c425'], 'the stand-in is not written to the profile cache');

  const paints = [];
  const tiles = [tile('26-425'), tile('26-426'), tile('26-427'), tile('26-429')];
  const tWatch = performance.now();
  P.watch({ isConnected: true, querySelectorAll: () => tiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv', fallback: true }),
    paint(el, src) { paints.push({ jo: el.dataset.th, src: src, calls: calls.length }); }
  });
  await wait(40);
  const revMs = revAt ? revAt - tWatch : -1;
  const first = jo => paints.filter(p => p.jo === jo);
  eq(first('26-425')[0] && first('26-425')[0].src === SKETCH && first('26-425')[0].calls === 0, 'the cached stand-in is painted before any network call');
  eq(first('26-425').length === 1 && first('26-425')[0].src === SKETCH, 'a fresh stand-in keeps its cleaned image when the file id is unchanged');
  eq(calls.length === 1 && calls[0].action === 'photoThumbs' && calls[0].data.piece.slice().sort().join() === '26-425,26-426,26-427,26-429', 'tiles on screen share one photoThumbs revalidate');
  eq(first('26-426').some(p => p.src.indexOf('REAL426') > 0) && P.peek({ jo: '26-426', kind: 'piece', size: 300, fallback: true }).indexOf('REAL426') > 0, 'a real photo replaces a cached stand-in');
  eq(!data.has('sk:26-426|file426') && data.get('jo:26-426|300') && String(data.get('jo:26-426|300')).indexOf('REAL426') > 0, 'the cached stand-in record is dropped');
  const now426 = P.peek({ jo: '26-426', kind: 'piece', size: 300 });
  eq(now426.indexOf('REAL426') > 0 && now426.indexOf('OLD426') < 0, 'peek returns the real photo after the stand-in is dropped');
  eq(first('26-427').some(p => p.src.indexOf('NEW427') > 0) && P.peek({ jo: '26-427', kind: 'piece', size: 300, fallback: true }).indexOf('NEW427') > 0, 'a stale stand-in is revalidated');
  const rec427 = data.get('sk:26-427|c427');
  eq(!!rec427 && rec427.jo === '26-427' && rec427.id === 'c427' && rec427.sketch === true && rec427.at > now - DAY && !data.has('sk:26-427|old427'), 'the refreshed stand-in keeps jo, file id, and a new timestamp');
  eq(P.peek({ jo: '26-429', kind: 'piece', size: 300, fallback: true }).indexOf('NEW429') > 0 && !data.has('sk:26-429|old429'), 'a changed source file id recomputes the stand-in');
  eq(ctx._margin === '800px', 'the list looks 800px ahead');

  const coldTiles = [];
  for (let i = 0; i < 20; i++) coldTiles.push(tile('c' + i));
  const before = calls.length;
  ctx._observed = 0;
  const tCold = performance.now();
  P.watch({ isConnected: true, querySelectorAll: () => coldTiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint() {}
  });
  await wait(40);
  const coldCalls = calls.slice(before).filter(c => c.action === 'photoThumbs');
  const coldMs = coldAt ? coldAt - tCold : -1;
  eq(coldCalls.length === 1 && coldCalls[0].data.piece.length === 16 && coldCalls[0].data.piece[0] === 'c0' && coldCalls[0].data.piece.indexOf('c16') < 0, 'the first 16 tiles leave in one photoThumbs call');
  eq(ctx._observed === 4, 'tiles after the first 16 wait for the intersection observer');
  eq(coldMs >= 0 && coldMs < 20, 'the first batch does not wait 30ms (' + coldMs.toFixed(2) + 'ms)');
  eq(gets === 0, 'a warm preload never does a per-tile IndexedDB read');

  const stuckCalls = [];
  let openReq = null;
  const sctx = {
    setTimeout, clearTimeout, Promise, Map, queueMicrotask, performance, Date,
    indexedDB: { open() { openReq = {}; return openReq; } },
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  };
  sctx.window = sctx;
  sctx.window.OYP = {
    call(action, body) {
      stuckCalls.push({ action: action, data: body, at: performance.now() });
      const piece = {};
      (body.piece || []).forEach(jo => { piece[jo] = { id: 'f-' + jo, src: 'data:image/jpeg;base64,' + jo, found: true }; });
      return Promise.resolve({ ok: true, size: body.size, piece: piece, scan: {}, cards: {}, drawing: {} });
    }
  };
  vm.createContext(sctx);
  vm.runInContext(photos, sctx, { filename: 'photos.js' });
  const S = sctx.window.OYPPhotos;
  const stuckTiles = [];
  for (let i = 0; i < 16; i++) stuckTiles.push({ dataset: { th: 's' + i }, isConnected: true });
  const tStuck = performance.now();
  S.watch({ isConnected: true, querySelectorAll: () => stuckTiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint() {}
  });
  let hungMs = -1;
  for (let i = 0; i < 24; i++) {
    if (stuckCalls.length) { hungMs = stuckCalls[0].at - tStuck; break; }
    await wait(25);
  }
  const hung = stuckCalls.filter(c => c.action === 'photoThumbs');
  eq(openReq && !openReq.result && hung.length === 1 && hung[0].data.piece.length === 16 && hung[0].data.piece[0] === 's0' && hungMs >= 250 && hungMs < 350, 'a stuck IndexedDB open still requests the first 16 tiles within 350ms (' + hungMs.toFixed(0) + 'ms)');
  const laterTiles = [];
  for (let i = 0; i < 16; i++) laterTiles.push({ dataset: { th: 'm' + i }, isConnected: true });
  const tLater = performance.now();
  const beforeLater = stuckCalls.length;
  S.watch({ isConnected: true, querySelectorAll: () => laterTiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint() {}
  });
  let laterMs = -1;
  for (let i = 0; i < 12; i++) {
    if (stuckCalls.length > beforeLater) { laterMs = stuckCalls[beforeLater].at - tLater; break; }
    await wait(20);
  }
  const later = stuckCalls.slice(beforeLater).filter(c => c.action === 'photoThumbs');
  eq(later.length === 1 && later[0].data.piece.length === 16 && laterMs >= 0 && laterMs < 80, 'later tiles do not wait on the stuck open again (' + laterMs.toFixed(0) + 'ms)');
  const lateSrc = 'data:image/jpeg;base64,LATE777';
  openReq.result = {
    objectStoreNames: { contains: () => true },
    transaction() {
      return {
        objectStore() {
          return {
            openCursor() {
              const req = {};
              const rows = [{ key: 'sk:26-777|p777', value: { src: lateSrc, jo: '26-777', id: 'p777', at: Date.now(), sketch: true, size: 300 } }];
              let n = 0;
              const step = () => {
                if (n >= rows.length) { req.result = null; if (req.onsuccess) req.onsuccess(); return; }
                const row = rows[n++];
                req.result = { key: row.key, value: row.value, continue() { queueMicrotask(step); } };
                if (req.onsuccess) req.onsuccess();
              };
              queueMicrotask(step);
              return req;
            }
          };
        }
      };
    }
  };
  if (openReq.onsuccess) openReq.onsuccess();
  await wait(30);
  eq(S.peek({ jo: '26-777', kind: 'piece', size: 300, fallback: true }) === lateSrc, 'a late preload still fills memory');

  eq(P.sharpTier(76, 3) === 0 && P.sharpTier(76, 2) === 0 && P.sharpTier(100, 3) === 0, 'a 76px phone tile stays on the 300px thumb, including at DPR 3');
  eq(P.sharpTier(350, 1) === 600, 'a 350px tile at DPR 1 needs 350 device px, so the 600 tier');
  eq(P.sharpTier(350, 2) === 900 && P.sharpTier(500, 2) === 900 && P.sharpTier(200, 2) === 600 && P.sharpTier(0, 2) === 0, 'a 350px tile at DPR 2 needs 700 device px, so the 900 tier');
  ctx.devicePixelRatio = 2;
  ctx.Uint8Array = Uint8Array;
  ctx.Uint8ClampedArray = Uint8ClampedArray;
  ctx.Float32Array = Float32Array;
  ctx.Int32Array = Int32Array;
  ctx.Uint32Array = Uint32Array;
  ctx.ImageData = function ImageData(data, w, h) { this.data = data; this.width = w; this.height = h; };
  ctx.Image = class {
    set src(v) {
      this._src = v;
      const m = /OUT(\d+)x(\d+)/.exec(v) || /W(\d+)H(\d+)/.exec(v);
      this.naturalWidth = m ? +m[1] : 1600;
      this.naturalHeight = m ? +m[2] : 1200;
      this.width = this.naturalWidth;
      this.height = this.naturalHeight;
      queueMicrotask(() => { if (this.onload) this.onload(); });
    }
    get src() { return this._src || ''; }
  };
  ctx.document = {
    createElement() {
      const c = { width: 0, height: 0 };
      c.getContext = () => ({
        drawImage() {}, fillRect() {}, fillStyle: '',
        getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
        putImageData() {}
      });
      c.toDataURL = (type, q) => 'data:image/jpeg;base64,OUT' + c.width + 'x' + c.height + 'q' + q;
      return c;
    }
  };
  ctx.sketchClean = function (data, w, h) {
    const ow = Math.max(1, Math.round(w * 0.4));
    const oh = Math.max(1, Math.round(h * 0.5));
    return { confident: true, out: { w: ow, h: oh, data: new Uint8ClampedArray(ow * oh * 4) } };
  };
  function wide(jo) { return { dataset: { th: jo }, isConnected: true, clientWidth: 350 }; }
  const sharpPaints = [];
  const sharpTiles = [wide('u0'), wide('u1'), wide('u2'), wide('usk')];
  const beforeSharp = calls.length;
  P.watch({ isConnected: true, querySelectorAll: () => sharpTiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv', fallback: true }),
    paint(el, src, item) { sharpPaints.push({ jo: el.dataset.th, src: src, at: performance.now(), sketch: !!(item && item.sketch) }); }
  });
  const upgraded = await (async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) {
      const ready = ['u0', 'u1', 'u2', 'usk'].every(jo => sharpPaints.filter(p => p.jo === jo).length >= 2);
      if (ready) return true;
      await wait(15);
    }
    return ['u0', 'u1', 'u2', 'usk'].every(jo => sharpPaints.filter(p => p.jo === jo).length >= 2);
  })();
  eq(upgraded, 'each on-screen tile paints a thumbnail and then a sharper image');
  ['u0', 'u1', 'u2', 'usk'].forEach(jo => {
    const rows = sharpPaints.filter(p => p.jo === jo);
    const span = spans.filter(s => s.jo === jo)[0];
    eq(!!rows[0] && rows[0].src.indexOf('OUT700') < 0 && span && rows[0].at <= span.start, jo + ' keeps the thumbnail until its sharper image is ready');
  });
  eq(sharpPaints.filter(p => p.jo === 'usk')[0].sketch === true && sharpPaints.filter(p => p.jo === 'u0')[0].sketch === false, 'the thumbnail paint already knows a stand-in from a product photo');
  eq(sharpPaints.filter(p => p.jo === 'u0').pop().src === 'data:image/jpeg;base64,OUT900x675q0.82', 'a 350px tile at DPR 2 is downscaled to the 900 tier at jpeg 0.82');
  eq(sharpPaints.filter(p => p.jo === 'usk').pop().src === 'data:image/jpeg;base64,OUT640x600q0.82', 'a stand-in is cleaned from the 1600px page and is not upscaled or capped at 480');
  const bigCalls = calls.slice(beforeSharp).filter(c => c.action === 'photoThumbs' && c.data.size >= 1000);
  eq(bigCalls.length === 4 && bigCalls.every(c => c.data.piece.length === 1), 'each tile asks for the 1600px image once');
  eq(maxLive === 1 && spans.length >= 4 && spans.every((s, i) => i === 0 || s.start >= spans[i - 1].end - 1), 'sharper images are fetched one at a time (' + maxLive + ' in flight)');
  const rec0 = data.get('shjo:u0|900');
  const recS = data.get('shsk:usk|900');
  eq(!!rec0 && rec0.sharp === true && rec0.tier === 900 && rec0.src.indexOf('OUT900x675q0.82') >= 0, 'the real photo tier is stored in IndexedDB');
  eq(!!recS && recS.sharp === true && recS.sketch === true && recS.id === 'id-usk' && recS.tier === 900, 'the stand-in tier key includes the JO and the pixel size');
  const afterFirst = spans.length;
  const againTiles = [wide('u0'), wide('u1'), wide('u2'), wide('usk')];
  P.watch({ isConnected: true, querySelectorAll: () => againTiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv', fallback: true }),
    paint(el, src) { sharpPaints.push({ jo: el.dataset.th, src: src, at: performance.now(), again: true }); }
  });
  await wait(50);
  eq(spans.length === afterFirst, 'a revisit in the same session paints the cached tier with no new network call');
  eq(sharpPaints.some(p => p.again && p.jo === 'u0' && p.src.indexOf('OUT900x675q0.82') >= 0), 'the cached real photo is the one painted on revisit');

  const revisitCalls = [];
  const rctx = {
    setTimeout, clearTimeout, Promise, Map, queueMicrotask, performance, Date,
    Uint8Array, Uint8ClampedArray, Float32Array, Int32Array, Uint32Array,
    indexedDB: idb,
    devicePixelRatio: 2,
    IntersectionObserver: ctx.IntersectionObserver,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  rctx.window = rctx;
  rctx.window.OYP = {
    call(action, body) {
      revisitCalls.push({ action: action, data: body });
      return Promise.resolve({ ok: false, error: 'should not be called' });
    }
  };
  vm.createContext(rctx);
  vm.runInContext(photos, rctx, { filename: 'photos.js' });
  const R = rctx.window.OYPPhotos;
  await R.ready;
  const revisitPaints = [];
  R.watch({ isConnected: true, querySelectorAll: () => [wide('u0'), wide('usk')] }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv', fallback: true }),
    paint(el, src) { revisitPaints.push({ jo: el.dataset.th, src: src }); }
  });
  const revisitOk = await (async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) {
      const u0 = revisitPaints.filter(p => p.jo === 'u0').pop();
      const usk = revisitPaints.filter(p => p.jo === 'usk').pop();
      if (u0 && usk && u0.src.indexOf('OUT900x675') >= 0 && usk.src.indexOf('OUT640x600') >= 0) return true;
      await wait(15);
    }
    return false;
  })();
  const revisitBig = revisitCalls.filter(c => c.action === 'photoThumbs' && c.data && c.data.size >= 1000);
  eq(revisitOk && revisitBig.length === 0, 'a later visit reads the tier from IndexedDB and does not request the 1600px image');

  const badPaints = [];
  const badBefore = spans.length;
  P.watch({ isConnected: true, querySelectorAll: () => [wide('ubad')] }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint(el, src) { badPaints.push(src); }
  });
  await wait(200);
  eq(badPaints.length >= 1 && badPaints.every(s => s.indexOf('W300H225ubad') >= 0) && spans.length === badBefore + 1, 'a failed upgrade leaves the 300px image');
  const badSpans = spans.length;
  P.watch({ isConnected: true, querySelectorAll: () => [wide('ubad')] }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint(el, src) { badPaints.push(src); }
  });
  await wait(80);
  eq(spans.length === badSpans && badPaints.every(s => s.indexOf('OUT') < 0), 'a failed tile is not asked again');

  ctx.devicePixelRatio = 3;
  const smallBefore = spans.length;
  P.watch({ isConnected: true, querySelectorAll: () => [{ dataset: { th: 'u76' }, isConnected: true, clientWidth: 76 }] }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint() {}
  });
  await wait(100);
  eq(spans.length === smallBefore, 'a 76px tile at DPR 3 does not download a larger image');

  ctx.devicePixelRatio = 1;
  const d1Before = spans.length;
  const d1Paints = [];
  const u350el = { dataset: { th: 'u350' }, isConnected: true, clientWidth: 350 };
  P.watch({ isConnected: true, querySelectorAll: () => [u350el] }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint(el, src) { d1Paints.push(src); }
  });
  const d1Ok = await (async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 1000) {
      if (d1Paints.some(s => s.indexOf('OUT600x450q0.82') >= 0)) return true;
      await wait(15);
    }
    return false;
  })();
  eq(d1Ok && spans.length === d1Before + 1 && data.get('shjo:u350|600') && data.get('shjo:u350|600').tier === 600, 'a 350px tile at DPR 1 upgrades once to the 600 tier');

  u350el.isConnected = false;
  ctx._ev = {};
  ctx.addEventListener = (name, fn) => { (ctx._ev[name] = ctx._ev[name] || []).push(fn); };
  ctx.removeEventListener = () => {};
  ctx.dispatchEvent = ev => { (ctx._ev[ev.type] || []).slice().forEach(fn => fn(ev)); };
  ctx.devicePixelRatio = 3;
  const grown = { dataset: { th: 'urs' }, isConnected: true, clientWidth: 76 };
  const growRoot = { isConnected: true, querySelectorAll: () => [grown] };
  const growBefore = spans.length;
  const growPaints = [];
  P.watch(growRoot, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint(el, src) { growPaints.push({ w: el.clientWidth, src: src }); }
  });
  await wait(120);
  eq(spans.length === growBefore && growPaints.length >= 1 && growPaints.every(p => p.src.indexOf('OUT') < 0), 'the mobile width paints only the 300px thumb');
  grown.clientWidth = 350;
  ctx.devicePixelRatio = 2;
  ctx.dispatchEvent(new Event('resize'));
  const grownOk = await (async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      if (growPaints.some(p => p.src.indexOf('OUT900x675q0.82') >= 0)) return true;
      await wait(20);
    }
    return false;
  })();
  eq(grownOk && spans.filter(s => s.jo === 'urs').length === 1, 'widening the same tile from 76px to 350px at DPR 2 downloads the 900 tier once');

  const oldCalls = [];
  const octx = {
    setTimeout, clearTimeout, Promise, Map, queueMicrotask, performance, Date,
    indexedDB: { open() { const req = {}; queueMicrotask(() => { req.result = { objectStoreNames: { contains: () => true }, transaction() { return { objectStore() { return { openCursor() { const r = {}; queueMicrotask(() => { r.result = null; if (r.onsuccess) r.onsuccess(); }); return r; }, get() { const r = {}; queueMicrotask(() => { r.result = undefined; if (r.onsuccess) r.onsuccess(); }); return r; }, put() {}, delete() {} }; } }; } }; if (req.onsuccess) req.onsuccess(); }); return req; } },
    devicePixelRatio: 2,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  };
  octx.window = octx;
  octx.window.OYP = {
    call(action, body) {
      oldCalls.push({ action: action, data: body });
      if (action === 'photoThumbs' && body.size >= 1000) return Promise.resolve({ ok: false, error: 'Unknown action' });
      const piece = {};
      (body.piece || []).forEach(jo => { piece[jo] = { id: 'id-' + jo, src: 'data:image/jpeg;base64,W300H225' + jo, found: true }; });
      return Promise.resolve({ ok: true, size: body.size, piece: piece, scan: {}, cards: {}, drawing: {} });
    }
  };
  vm.createContext(octx);
  vm.runInContext(photos, octx, { filename: 'photos.js' });
  const O = octx.window.OYPPhotos;
  await O.ready;
  const oldPaints = [];
  const oldTiles = [wide('o0'), wide('o1'), wide('o2')];
  O.watch({ isConnected: true, querySelectorAll: () => oldTiles }, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint(el, src) { oldPaints.push({ jo: el.dataset.th, src: src }); }
  });
  await wait(200);
  const oldBig = oldCalls.filter(c => c.action === 'photoThumbs' && c.data.size >= 1000);
  eq(oldBig.length === 1 && oldPaints.length === 3 && oldPaints.every(p => p.src.indexOf('W300H225') >= 0), 'without PhotoFast the list stays on the 300px image after one probe');

  console.log('MEASURE preloadMs=' + preloadMs.toFixed(2) + ' peekMs=' + peekMs.toFixed(3) + ' loadMs=' + loadMs.toFixed(3) + ' loadCalls=0 revMs=' + revMs.toFixed(2) + ' revCalls=1 coldMs=' + coldMs.toFixed(2) + ' coldCalls=1 cursors=' + cursors + ' gets=' + gets + ' hungMs=' + hungMs.toFixed(0) + ' laterMs=' + laterMs.toFixed(0));
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('photo-cache-sim passed');
})().catch(err => { console.error(err); process.exit(1); });
