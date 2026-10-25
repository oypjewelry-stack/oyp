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
eq(index.includes('photos.js?v=9'), 'photos.js cache number is bumped');
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
      const piece = {};
      (dataBody.piece || []).forEach(jo => {
        if (jo === '26-426') piece[jo] = { id: 'real426', src: 'data:image/jpeg;base64,REAL426', found: true };
        else if (jo === '26-427') piece[jo] = { id: 'c427', src: 'data:image/jpeg;base64,NEW427', found: false, sketch: true };
        else if (jo === '26-429') piece[jo] = { id: 'new429', src: 'data:image/jpeg;base64,NEW429', found: false, sketch: true };
        else if (jo === '26-425') piece[jo] = { id: 'c425', src: 'data:image/jpeg;base64,OTHER425', found: false, sketch: true };
        else piece[jo] = { id: 'f-' + jo, src: 'data:image/jpeg;base64,' + jo, found: true };
      });
      return Promise.resolve({ ok: true, size: dataBody.size, piece: piece, scan: {}, cards: {}, drawing: {} });
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

  console.log('MEASURE preloadMs=' + preloadMs.toFixed(2) + ' peekMs=' + peekMs.toFixed(3) + ' loadMs=' + loadMs.toFixed(3) + ' loadCalls=0 revMs=' + revMs.toFixed(2) + ' revCalls=1 coldMs=' + coldMs.toFixed(2) + ' coldCalls=1 cursors=' + cursors + ' gets=' + gets);
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('photo-cache-sim passed');
})().catch(err => { console.error(err); process.exit(1); });
