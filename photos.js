/* Staff photo cache. Lists use a 300px thumbnail. Opening a photo shows that thumbnail at once, then a 1600px image.
   The full Drive file loads only from Open original. Repeat views are kept in memory, IndexedDB, and (small thumbs) localStorage.
   A page-2 stand-in (cleaned drawing, or a white card when there is no drawing) is stored in IndexedDB too, keyed by the JO and the source page file.
   At startup every cached thumb is copied into memory in one pass, so the list can paint before any network call.
   One photoThumbs call covers the tiles on screen. Until PhotoFast.gs is pasted, the old invThumbs / prodPhoto / jobPhoto calls are used. */
(() => {
'use strict';
const MEM = new Map();
const FLY = new Map();
const WAIT = [];
const REV = [];
const OBS = [];
const PRE = { p: null, done: false };
const SKETCH_AGE = 14 * 24 * 60 * 60 * 1000;
const SKETCH_MAX_W = 480;
let timer = 0, mode = '', firstBatch = true, revSoon = false;

const memKey = (id, size) => id + '|' + size;
const flyKey = item => (item.kind === 'piece' && !item.id ? 'piece:' + item.jo : (item.id || item.jo)) + '|' + item.kind + '|' + item.size;

function ls() { try { return window.localStorage; } catch (e) { return null; } }
function lsGet(id) {
  const s = ls(); if (!s || !id) return '';
  try { return s.getItem('oypPh:' + id) || ''; } catch (e) { return ''; }
}
function lsPut(id, jo, src) {
  const s = ls(); if (!s || !id || !src || src.length > 70000) return;
  try {
    let order = JSON.parse(s.getItem('oypPhO') || '[]');
    if (!Array.isArray(order)) order = [];
    order = order.filter(x => x !== id);
    order.push(id);
    while (order.length > 36) s.removeItem('oypPh:' + order.shift());
    s.setItem('oypPhO', JSON.stringify(order));
    s.setItem('oypPh:' + id, src);
    if (jo) s.setItem('oypPhJ:' + jo, id);
  } catch (e) {}
}
function db() {
  if (db.p) return db.p;
  if (!window.indexedDB) return Promise.reject();
  db.p = new Promise((res, rej) => {
    const r = window.indexedDB.open('oyp-photos', 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('ph')) d.createObjectStore('ph'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return db.p;
}
function idbGet(id, size) {
  if (!id || !window.indexedDB) return Promise.resolve('');
  return new Promise(res => {
    let done = false;
    const finish = v => { if (done) return; done = true; res(v || ''); };
    setTimeout(() => finish(''), 250); // a stuck IndexedDB must not block the thumbnail
    db().then(d => new Promise(r => {
      try {
        const q = d.transaction('ph', 'readonly').objectStore('ph').get(id + '|' + size);
        q.onsuccess = () => r(typeof q.result === 'string' ? q.result : '');
        q.onerror = () => r('');
      } catch (e) { r(''); }
    })).then(finish).catch(() => finish(''));
  });
}
function idbPut(id, size, src) {
  if (!id || !src || !window.indexedDB) return;
  db().then(d => {
    try { d.transaction('ph', 'readwrite').objectStore('ph').put(src, id + '|' + size); } catch (e) {}
  }).catch(() => {});
}
function idbPutRaw(key, val) {
  if (!key || val == null || !window.indexedDB) return;
  db().then(d => {
    try { d.transaction('ph', 'readwrite').objectStore('ph').put(val, key); } catch (e) {}
  }).catch(() => {});
}
function idbDel(key) {
  if (!key || !window.indexedDB) return;
  db().then(d => {
    try { d.transaction('ph', 'readwrite').objectStore('ph').delete(key); } catch (e) {}
  }).catch(() => {});
}
function primeRecord(key, val) {
  if (val && typeof val === 'object') {
    if (val.sketch && val.jo && val.src) {
      const size = val.size || 300;
      MEM.set('sketch:' + val.jo + '|' + size, val.src);
      if (val.id) MEM.set('sketchid:' + val.jo, val.id);
      if (val.at) MEM.set('sketchat:' + val.jo, val.at);
      MEM.set('sketchkey:' + val.jo, key);
    }
    return;
  }
  if (typeof val === 'string' && val) MEM.set(key, val);
}
function prime() {
  if (PRE.p) return PRE.p;
  if (!window.indexedDB) { PRE.done = true; PRE.p = Promise.resolve(); return PRE.p; }
  PRE.p = db().then(d => new Promise(res => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; PRE.done = true; res(); };
    try {
      const tx = d.transaction('ph', 'readonly');
      const req = tx.objectStore('ph').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { done(); return; }
        primeRecord(String(cur.key), cur.value);
        try { cur.continue(); } catch (e) { done(); }
      };
      req.onerror = done;
      tx.onabort = done;
    } catch (e) { done(); }
  })).catch(() => { PRE.done = true; });
  return PRE.p;
}
/* Page 2 front of the JO card. The design sketch is the right-hand DESIGN panel, below the
   DESIGN heading and inside the box rules. Tuned on a landscape 26-425 page-2 scan.
   Page 1 is never passed here: only a stand-in (sketch:true, page 2 front) is cropped. */
const SKETCH_ROI = { x: 0.613, y: 0.242, w: 0.347, h: 0.490 };
const SKETCH_CROP = new Map();
function sketchLuma(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
/* rgba: Uint8Array or array of r,g,b,a. Returns {x,y,w,h} in source pixels, or null when the panel has no ink. */
function sketchBox(rgba, w, h) {
  w = w | 0; h = h | 0;
  if (!rgba || w < 40 || h < 40) return null;
  const x0 = Math.max(0, Math.min(w - 2, Math.round(w * SKETCH_ROI.x)));
  const y0 = Math.max(0, Math.min(h - 2, Math.round(h * SKETCH_ROI.y)));
  const x1 = Math.max(x0 + 2, Math.min(w, Math.round(w * (SKETCH_ROI.x + SKETCH_ROI.w))));
  const y1 = Math.max(y0 + 2, Math.min(h, Math.round(h * (SKETCH_ROI.y + SKETCH_ROI.h))));
  const rw = x1 - x0, rh = y1 - y0;
  const step = rw * rh > 900000 ? 4 : rw * rh > 250000 ? 3 : 2;
  const samples = [];
  for (let y = 0; y < rh; y += step) {
    const row = (y0 + y) * w;
    for (let x = 0; x < rw; x += step) samples.push(sketchLuma(rgba[(row + x0 + x) * 4], rgba[(row + x0 + x) * 4 + 1], rgba[(row + x0 + x) * 4 + 2]));
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  const paper = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.92))] || 240;
  const darkCut = paper * 0.80;
  const ink = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    const row = (y0 + y) * w;
    const dest = y * rw;
    for (let x = 0; x < rw; x++) {
      const i = (row + x0 + x) * 4;
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      const lum = sketchLuma(r, g, b);
      const span = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < darkCut || (span > 32 && lum < paper * 0.98)) ink[dest + x] = 1;
    }
  }
  for (let y = 0; y < rh; y++) {
    let n = 0, dest = y * rw;
    for (let x = 0; x < rw; x++) n += ink[dest + x];
    if (n > rw * 0.55) for (let x = 0; x < rw; x++) ink[dest + x] = 0;
  }
  for (let x = 0; x < rw; x++) {
    let n = 0;
    for (let y = 0; y < rh; y++) n += ink[y * rw + x];
    if (n > rh * 0.55) for (let y = 0; y < rh; y++) ink[y * rw + x] = 0;
  }
  const seen = new Uint8Array(rw * rh);
  const minA = Math.max(16, Math.round(rw * rh * 0.0001));
  const stack = [];
  let bx0 = rw, by0 = rh, bx1 = -1, by1 = -1, any = false;
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    let area = 0, minx = rw, miny = rh, maxx = 0, maxy = 0;
    while (stack.length) {
      const p = stack.pop();
      area++;
      const x = p % rw, y = (p / rw) | 0;
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
      if (x > 0 && ink[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x + 1 < rw && ink[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && ink[p - rw] && !seen[p - rw]) { seen[p - rw] = 1; stack.push(p - rw); }
      if (y + 1 < rh && ink[p + rw] && !seen[p + rw]) { seen[p + rw] = 1; stack.push(p + rw); }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1;
    if (area < minA) continue;
    if (bh <= 3 && bw > rw * 0.62) continue;
    if (bw <= 3 && bh > rh * 0.62) continue;
    any = true;
    if (minx < bx0) bx0 = minx;
    if (miny < by0) by0 = miny;
    if (maxx > bx1) bx1 = maxx;
    if (maxy > by1) by1 = maxy;
  }
  if (!any || bx1 < bx0 || by1 < by0) return null;
  const pad = Math.max(8, Math.round(Math.min(rw, rh) * 0.035));
  let ox = x0 + bx0 - pad, oy = y0 + by0 - pad, ow = bx1 - bx0 + 1 + pad * 2, oh = by1 - by0 + 1 + pad * 2;
  if (ox < x0) { ow -= x0 - ox; ox = x0; }
  if (oy < y0) { oh -= y0 - oy; oy = y0; }
  if (ox + ow > x1) ow = x1 - ox;
  if (oy + oh > y1) oh = y1 - oy;
  if (ow < 8 || oh < 8) return null;
  return { x: ox, y: oy, w: ow, h: oh };
}
/* The detail frame shows the cleaned canvas, which already has white margins.
   sketchBox is only the fallback box passed into sketchClean. It is not drawn. */
function sketchFrame(box) {
  const x = box.x, y = box.y, w = box.w, h = box.h;
  return { x: x, y: y, w: w, h: h, cw: w, ch: h, dx: 0, dy: 0 };
}
function whiteStandIn() {
  const blank = document.createElement('canvas');
  blank.width = 4;
  blank.height = 3;
  const bg = blank.getContext('2d');
  bg.fillStyle = '#fff';
  bg.fillRect(0, 0, 4, 3);
  return blank.toDataURL('image/jpeg', 0.92);
}
function cropSketch(src) {
  if (!src || typeof document === 'undefined' || !document.createElement) return Promise.resolve('');
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
        if (!sw || !sh) { resolve(whiteStandIn()); return; }
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#fff';
        g.fillRect(0, 0, sw, sh);
        g.drawImage(img, 0, 0);
        const data = g.getImageData(0, 0, sw, sh).data;
        const res = typeof sketchClean === 'function' ? sketchClean(data, sw, sh, sketchBox) : { confident: false };
        if (res && res.confident && res.out) {
          const out = document.createElement('canvas');
          out.width = res.out.w;
          out.height = res.out.h;
          out.getContext('2d').putImageData(new ImageData(res.out.data, res.out.w, res.out.h), 0, 0);
          resolve(out.toDataURL('image/jpeg', 0.92));
          return;
        }
        // Text-only cards (no drawing) stay white. Not the old ink crop, and not the raw page.
        resolve(whiteStandIn());
      } catch (e) { resolve(whiteStandIn()); }
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}
function presentSketch(jo, src) {
  const prev = SKETCH_CROP.get(jo);
  if (prev && prev.len >= src.length && prev.src) return Promise.resolve(prev.src);
  return cropSketch(src).then(out => {
    // A white stand-in is a real result and is cached, so a text-only card is not shown raw.
    const use = out || src;
    const again = SKETCH_CROP.get(jo);
    if (!again || src.length >= again.len) SKETCH_CROP.set(jo, { len: src.length, src: use });
    const kept = SKETCH_CROP.get(jo);
    return kept && kept.src ? kept.src : use;
  }).catch(() => src);
}
function sketchStale(jo) {
  const at = MEM.get('sketchat:' + jo) || 0;
  return !at || (Date.now() - at) > SKETCH_AGE;
}
function dropStandIn(jo) {
  if (!jo) return;
  MEM.delete('sketch:' + jo + '|300');
  MEM.delete('sketch:' + jo + '|1600');
  const key = MEM.get('sketchkey:' + jo);
  const id = MEM.get('sketchid:' + jo);
  MEM.delete('sketchid:' + jo);
  MEM.delete('sketchat:' + jo);
  MEM.delete('sketchkey:' + jo);
  SKETCH_CROP.delete(jo);
  if (key) idbDel(key);
  if (id) idbDel('sk:' + jo + '|' + id);
  idbDel('sk:' + jo + '|');
}
function forgetProfile(jo) {
  if (!jo) return;
  MEM.delete('jo:' + jo + '|300');
  idbDel('jo:' + jo + '|300');
  const s = ls();
  if (!s) return;
  try {
    const id = s.getItem('oypPhJ:' + jo) || '';
    if (id) s.removeItem('oypPh:' + id);
    s.removeItem('oypPhJ:' + jo);
    if (id) {
      let order = JSON.parse(s.getItem('oypPhO') || '[]');
      if (!Array.isArray(order)) order = [];
      s.setItem('oypPhO', JSON.stringify(order.filter(x => x !== id)));
    }
  } catch (e) {}
}
function shrinkStandIn(src) {
  if (!src || typeof document === 'undefined' || !document.createElement) return Promise.resolve(src || '');
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const sw = img.naturalWidth || img.width || 0;
        const sh = img.naturalHeight || img.height || 0;
        if (!sw || !sh) { resolve(src); return; }
        const w = sw > SKETCH_MAX_W ? SKETCH_MAX_W : sw;
        const h = sw > SKETCH_MAX_W ? Math.max(1, Math.round(sh * (w / sw))) : sh;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.8));
      } catch (e) { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}
function persistSketch(jo, id, src) {
  const at = Date.now();
  MEM.set('sketchat:' + jo, at);
  const key = 'sk:' + jo + '|' + (id || '');
  const prev = MEM.get('sketchkey:' + jo);
  if (prev && prev !== key) idbDel(prev);
  MEM.set('sketchkey:' + jo, key);
  shrinkStandIn(src).then(small => {
    idbPutRaw(key, { src: small || src, jo: jo, id: id || '', at: at, sketch: true, size: 300 });
  }).catch(() => {});
}
function remember(item, src) {
  if (!src) return;
  const size = item.size;
  // A page-2 stand-in is not the JO's profile. The cleaned image (or the white card) is stored on its own key.
  if (item.sketch && item.jo) {
    MEM.set('sketch:' + item.jo + '|' + size, src);
    if (size === 300 && item.id) MEM.set('sketchid:' + item.jo, item.id);
    if (size === 300) persistSketch(item.jo, item.id || '', src);
    return;
  }
  if (item.kind === 'piece' && item.jo && !item.sketch) dropStandIn(item.jo);
  if (item.id) {
    MEM.set(memKey(item.id, size), src);
    idbPut(item.id, size, src);
    if (size === 300) lsPut(item.id, item.kind === 'piece' ? item.jo : '', src);
  }
  if (item.kind === 'piece' && item.jo && size === 300 && !item.sketch) {
    MEM.set('jo:' + item.jo + '|300', src);
    idbPutRaw('jo:' + item.jo + '|300', src);
  }
}
function peek(item) {
  const size = item.size;
  if (item.sketch && item.jo && MEM.has('sketch:' + item.jo + '|' + size)) return MEM.get('sketch:' + item.jo + '|' + size);
  if (item.id && MEM.has(memKey(item.id, size))) return MEM.get(memKey(item.id, size));
  if (item.kind === 'piece' && size === 300 && item.jo && MEM.has('jo:' + item.jo + '|300')) return MEM.get('jo:' + item.jo + '|300');
  if (size === 300) {
    let id = item.id;
    const s = ls();
    if (!id && item.kind === 'piece' && item.jo && s) {
      try { id = s.getItem('oypPhJ:' + item.jo) || ''; } catch (e) { id = ''; }
    }
    const src = id ? lsGet(id) : '';
    if (src) {
      item.id = item.id || id;
      MEM.set(memKey(id, 300), src);
      if (item.jo) MEM.set('jo:' + item.jo + '|300', src);
      return src;
    }
  }
  if (item.fallback && item.kind === 'piece' && size === 300 && !item.id && item.jo && MEM.has('sketch:' + item.jo + '|300') && !MEM.has('jo:' + item.jo + '|300')) {
    item.sketch = true;
    const sid = MEM.get('sketchid:' + item.jo);
    if (sid) item.id = sid;
    return MEM.get('sketch:' + item.jo + '|300');
  }
  return '';
}
function finish(w, src) {
  const done = s => {
    if (s) remember(w.item, s);
    w.resolve(s || '');
    FLY.delete(w.key || flyKey(w.item));
  };
  // Page 1 is never sketch. Open original (size original) stays the page scan.
  if (src && w.item && w.item.sketch && w.item.jo && w.item.size !== 'original') {
    presentSketch(w.item.jo, src).then(done).catch(() => done(src));
    return;
  }
  done(src);
}
async function legacy(size, ws) {
  const piece = ws.filter(w => w.item.kind === 'piece');
  const scan = ws.filter(w => w.item.kind !== 'piece');
  for (let i = 0; i < piece.length; i += 12) {
    const part = piece.slice(i, i + 12);
    let r = null;
    try { r = await window.OYP.call('invThumbs', { jos: part.map(w => w.item.jo) }); } catch (e) { r = null; }
    part.forEach(w => finish(w, r && r.ok && r.thumbs ? (r.thumbs[w.item.jo] || '') : ''));
  }
  await Promise.all(scan.map(async w => {
    const action = w.item.legacy === 'job' ? 'jobPhoto' : 'prodPhoto';
    const body = { jo: w.item.jo, file_id: w.item.id };
    if (size === 1600 || size === 'original') body.size = 'full';
    else if (w.item.legacy === 'job') body.size = 'thumb';
    let r = null;
    try { r = await window.OYP.call(action, body); } catch (e) { r = null; }
    finish(w, (r && r.src) || '');
  }));
}
async function send(size, ws) {
  if (mode === 'old') return legacy(size, ws);
  if (size === 'original') {
    const w = ws[0];
    let r = null;
    try { r = await window.OYP.call('photoFile', { jo: w.item.jo, id: w.item.id || '', kind: w.item.kind, size: 'original' }); } catch (e) { r = null; }
    if (!r || r.error === 'Unknown action') { mode = 'old'; return legacy(size, ws); }
    if (r.id) w.item.id = r.id;
    finish(w, r.src || '');
    return;
  }
  const piece = [], scan = [], drawing = [], fallback = [];
  ws.forEach(w => {
    if (w.item.kind === 'piece') {
      piece.push(w.item.jo);
      if (w.item.fallback) fallback.push(w.item.jo);
    } else if (w.item.kind === 'drawing' && !w.item.id) drawing.push(w.item.jo);
    else if (w.item.id) scan.push({ jo: w.item.jo, id: w.item.id, card: w.item.kind === 'card' ? 1 : 0, drawing: w.item.kind === 'drawing' ? 1 : 0 });
  });
  const body = { size, piece, scan };
  if (fallback.length) body.fallback = fallback;
  if (drawing.length) body.drawing = drawing;
  let r = null;
  try { r = await window.OYP.call('photoThumbs', body); } catch (e) { r = null; }
  if (!r || r.error === 'Unknown action') { mode = 'old'; return legacy(size, ws); }
  if (!r.ok) { ws.forEach(w => finish(w, '')); return; }
  const missed = [];
  ws.forEach(w => {
    if (w.item.kind === 'piece') {
      const row = r.piece && r.piece[w.item.jo];
      if (row && row.src && !row.sketch) {
        w.item.sketch = false;
        dropStandIn(w.item.jo);
      }
      if (w.rev && row && row.sketch && row.src && row.id && MEM.get('sketchid:' + w.item.jo) === row.id && !sketchStale(w.item.jo)) {
        w.item.sketch = true;
        w.item.id = row.id;
        w.resolve(MEM.get('sketch:' + w.item.jo + '|' + (w.item.size || 300)) || '');
        return;
      }
      if (row && row.sketch) {
        w.item.sketch = true;
        if (w.rev) forgetProfile(w.item.jo);
        if (row.id && MEM.get('sketchid:' + w.item.jo) && MEM.get('sketchid:' + w.item.jo) !== row.id) SKETCH_CROP.delete(w.item.jo);
        if (sketchStale(w.item.jo)) SKETCH_CROP.delete(w.item.jo);
      }
      if (row && row.src) { w.item.id = row.id || w.item.id; finish(w, row.src); }
      else if (row && row.found === false) finish(w, '');
      else missed.push(w);
    } else if (w.item.kind === 'drawing' && !w.item.id) {
      const row = r.drawing && r.drawing[w.item.jo];
      const first = Array.isArray(row) ? row[0] : row;
      if (first && first.src) { w.item.id = first.id || w.item.id; finish(w, first.src); }
      else finish(w, '');
    } else {
      const src = r.scan && w.item.id ? r.scan[w.item.id] : '';
      finish(w, src || '');
    }
  });
  if (missed.length) await legacy(size, missed);
}
async function flush() {
  const batch = WAIT.splice(0, WAIT.length);
  if (!batch.length) return;
  const pending = [];
  await Promise.all(batch.map(async w => {
    const hit = peek(w.item);
    if (hit) { finish(w, hit); return; }
    if (!PRE.done) {
      const idb = await idbGet(w.item.id, w.item.size);
      if (idb) { finish(w, idb); return; }
    }
    pending.push(w);
  }));
  const by = new Map();
  pending.forEach(w => {
    const k = w.item.size;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(w);
  });
  await Promise.all([...by.entries()].map(([size, ws]) => send(size, ws)));
}
function schedule() {
  if (firstBatch) {
    if (timer) return;
    const fire = () => { timer = 0; firstBatch = false; flush(); };
    if (typeof queueMicrotask === 'function') { timer = 1; queueMicrotask(fire); }
    else if (typeof requestAnimationFrame === 'function') timer = requestAnimationFrame(fire);
    else timer = setTimeout(fire, 0);
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(flush, 30);
}
function runRev() {
  revSoon = false;
  const batch = REV.splice(0, REV.length);
  if (!batch.length) return;
  const by = new Map();
  const seen = new Set();
  batch.forEach(b => {
    const item = Object.assign({}, b.item);
    const k = flyKey(item);
    if (seen.has(k)) return;
    seen.add(k);
    const shown = b.shown || '';
    const w = {
      item: item, el: b.el, opt: b.opt, rev: true, key: 'rev|' + k,
      resolve: src => {
        if (!src || src === shown || !b.el || b.el.isConnected === false || !b.opt) return;
        b.opt.paint(b.el, src, item);
      }
    };
    const size = item.size;
    if (!by.has(size)) by.set(size, []);
    by.get(size).push(w);
  });
  Promise.all([...by.entries()].map(([size, ws]) => send(size, ws))).catch(() => {});
}
function queueRev(el, item, shown, opt) {
  REV.push({ el: el, item: item, shown: shown, opt: opt });
  if (revSoon) return;
  revSoon = true;
  if (typeof queueMicrotask === 'function') queueMicrotask(runRev);
  else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(runRev);
  else setTimeout(runRev, 0);
}
function load(item) {
  item = Object.assign({ kind: 'scan', size: 300, legacy: 'prod' }, item);
  const hit = peek(item);
  if (hit) return Promise.resolve(hit);
  const k = flyKey(item);
  if (FLY.has(k)) return FLY.get(k);
  let resolve;
  const p = new Promise(r => { resolve = r; });
  FLY.set(k, p);
  WAIT.push({ item, resolve, key: k });
  schedule();
  return p;
}
function watch(root, opt) {
  if (!root) return;
  for (let i = OBS.length - 1; i >= 0; i--) {
    if (OBS[i].root === root || !OBS[i].root.isConnected) { OBS[i].io.disconnect(); OBS.splice(i, 1); }
  }
  const go = () => {
    const IO = window.IntersectionObserver;
    const nodes = root.querySelectorAll(opt.sel);
    const list = [];
    for (let i = 0; i < nodes.length; i++) list.push(nodes[i]);
    const startLoad = (el, item) => load(item).then(src => { if (el.isConnected !== false) opt.paint(el, src || '', item); });
    let io = null;
    if (IO) {
      io = new IO(entries => entries.forEach(en => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const item = opt.item(en.target);
        const src = peek(item);
        if (src) {
          opt.paint(en.target, src, item);
          queueRev(en.target, item, src, opt);
          return;
        }
        startLoad(en.target, item);
      }), { rootMargin: '800px' });
      OBS.push({ root: root, io: io });
    }
    list.forEach((el, i) => {
      const item = opt.item(el);
      const src = peek(item);
      const eager = !io || i < 16;
      if (src) {
        opt.paint(el, src, item);
        if (eager) queueRev(el, item, src, opt);
        else io.observe(el);
        return;
      }
      if (eager) startLoad(el, item);
      else io.observe(el);
    });
  };
  if (PRE.p) PRE.p.then(go).catch(go);
  else go();
}
function prefetch(jo, ids, kind, legacy) {
  (Array.isArray(ids) ? ids : [ids]).forEach(id => { if (id) load({ jo, id, kind: kind || 'scan', size: 1600, legacy: legacy || 'prod' }); });
}
function stage(el, o) {
  if (!el) return;
  o = o || {};
  el.classList.add('phstage');
  while (el.firstChild) el.removeChild(el.firstChild);
  const img = document.createElement('img');
  img.alt = o.alt || '';
  img.decoding = 'async';
  img.className = 'phblur';
  const quiet = o.empty === '';
  const lab = document.createElement('span');
  lab.className = 'lab phlab';
  lab.textContent = quiet ? '' : 'Loading photo…';
  lab.hidden = quiet;
  const orig = document.createElement('button');
  orig.type = 'button';
  orig.className = 'lnk phorig';
  orig.textContent = 'Open original';
  el.appendChild(lab);
  el.appendChild(orig);
  if (o.tools) {
    const bar = document.createElement('div');
    bar.className = 'phtools';
    bar.innerHTML = o.tools;
    el.appendChild(bar);
  }
  let sharp = false, shown = false;
  const show = async (src, blur) => {
    if (!src || (sharp && blur)) return;
    let s = src;
    try { if (o.turn) s = await o.turn(src); } catch (e) { s = src; }
    if (!s || (sharp && blur) || !el.isConnected) return;
    if (!blur) sharp = true;
    if (!shown) { el.insertBefore(img, el.firstChild); shown = true; }
    img.src = s;
    img.classList.toggle('phblur', !!blur);
    lab.hidden = true;
  };
  const base = { jo: o.jo, id: o.id || '', kind: o.kind || 'scan', legacy: o.legacy || 'prod', fallback: !!o.fallback, sketch: false };
  const thumbItem = Object.assign({}, base, { size: 300 });
  const thumb = peek(thumbItem);
  if (thumb) show(thumb, true);
  const sharpen = src => {
    if (src) return show(src, false);
    sharp = true;
    if (img.parentNode) img.classList.remove('phblur');
    else if (!quiet) { lab.hidden = false; lab.textContent = o.empty || 'Photo not found'; }
  };
  const mark = () => {
    if (thumbItem.sketch) {
      base.sketch = true;
      base.id = thumbItem.id || base.id;
      base.kind = 'card';
      el.classList.add('sketch');
    } else if (base.fallback) {
      base.sketch = false;
      el.classList.remove('sketch');
    }
    if (base.fallback && typeof o.noted === 'function') o.noted(base);
  };
  // A page-2 stand-in is cleaned before it is shown. Page 1 is not a stand-in.
  load(thumbItem).then(src => {
    if (src) show(src, true);
    if (base.fallback && base.kind === 'piece') {
      mark();
      return load(Object.assign({}, base, { size: 1600 })).then(sharpen);
    }
  });
  if (!(base.fallback && base.kind === 'piece')) load(Object.assign({}, base, { size: 1600 })).then(sharpen);
  orig.onclick = async e => {
    if (e) e.stopPropagation();
    orig.disabled = true;
    orig.textContent = 'Opening…';
    const src = await load(Object.assign({}, base, { size: 'original' }));
    orig.disabled = false;
    if (src) { await show(src, false); orig.textContent = 'Original'; }
    else orig.textContent = 'Open original';
  };
  if (o.wire) o.wire(el);
}
function pageLabel(pages, p) {
  const n = (pages || []).filter(x => x && x.page === p.page).length;
  const side = n > 1 && p.side === 'b' ? ' back' : n > 1 && p.side === 'a' ? ' front' : '';
  return 'Page ' + p.page + side;
}
function extras(jo, opt) {
  opt = opt || {};
  const body = { size: 300, piece: [], scan: [] };
  if (opt.drawing) body.drawing = [jo];
  if (opt.cards) body.cards = [jo];
  return window.OYP.call('photoThumbs', body).then(r => {
    const drawing = (r && r.ok && r.drawing && r.drawing[jo]) || [];
    const cards = (r && r.ok && r.cards && r.cards[jo]) || [];
    const scan = (r && r.scan) || {};
    cards.forEach(c => {
      c.src = scan[c.id] || '';
      if (c.src) remember({ id: c.id, jo, kind: 'card', size: 300 }, c.src);
    });
    drawing.forEach(d => { if (d && d.src) remember({ id: d.id, jo, kind: 'drawing', size: 300 }, d.src); });
    return { drawing: drawing.filter(d => d && d.id), cards };
  }).catch(() => ({ drawing: [], cards: [] }));
}
prime();
window.OYPPhotos = { load, watch, prefetch, stage, peek, extras, pageLabel, sketchBox, sketchFrame, cropSketch, SKETCH_ROI, ready: PRE.p };
})();
