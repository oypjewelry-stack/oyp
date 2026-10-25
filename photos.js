/* Staff photo cache. Lists use a 300px thumbnail. Opening a photo shows that thumbnail at once, then a 1600px image.
   The full Drive file loads only from Open original. Repeat views are kept in memory, IndexedDB, and (small thumbs) localStorage.
   One photoThumbs call covers the tiles on screen. Until PhotoFast.gs is pasted, the old invThumbs / prodPhoto / jobPhoto calls are used. */
(() => {
'use strict';
const MEM = new Map();
const FLY = new Map();
const WAIT = [];
const OBS = [];
let timer = 0, mode = '';

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
        q.onsuccess = () => r(q.result || '');
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
/* Page 2 front of the JO card. The design sketch is the right-hand DESIGN panel, below the
   DESIGN heading and inside the box rules. Tuned on a landscape 26-425 page-2 scan.
   Page 1 is never passed here: only a stand-in (sketch:true, page 2 front) is cropped. */
const SKETCH_ROI = { x: 0.613, y: 0.242, w: 0.347, h: 0.490 };
const SKETCH_FRAME = 4 / 3; // the profile frame (.ivph is 4/3). The crop is padded out to this with white.
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
function sketchLimit(sw, sh) {
  const x0 = Math.max(0, Math.min(sw - 2, Math.round(sw * SKETCH_ROI.x)));
  const y0 = Math.max(0, Math.min(sh - 2, Math.round(sh * SKETCH_ROI.y)));
  const x1 = Math.max(x0 + 2, Math.min(sw, Math.round(sw * (SKETCH_ROI.x + SKETCH_ROI.w))));
  const y1 = Math.max(y0 + 2, Math.min(sh, Math.round(sh * (SKETCH_ROI.y + SKETCH_ROI.h))));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/* Grow the ink box toward the 4/3 profile frame, staying inside the design panel.
   Whatever is still short is white on the canvas, so the frame has no empty band and the ink is not clipped. */
function sketchFrame(box, limit) {
  const A = SKETCH_FRAME;
  let x = box.x, y = box.y, w = box.w, h = box.h;
  const L = limit && limit.w > 0 && limit.h > 0 ? limit : { x: 0, y: 0, w: x + w, h: y + h };
  const right = L.x + L.w, bottom = L.y + L.h;
  if (w > 0 && h > 0 && w / h < A) {
    const want = Math.min(L.w, Math.round(h * A));
    const grow = Math.max(0, want - w);
    let left = Math.min(Math.max(0, x - L.x), Math.floor(grow / 2));
    let extra = Math.min(Math.max(0, right - (x + w)), grow - left);
    if (left + extra < grow) left = Math.min(Math.max(0, x - L.x), grow - extra);
    x -= left;
    w += left + extra;
  } else if (w > 0 && h > 0 && w / h > A) {
    const want = Math.min(L.h, Math.round(w / A));
    const grow = Math.max(0, want - h);
    let up = Math.min(Math.max(0, y - L.y), Math.floor(grow / 2));
    let down = Math.min(Math.max(0, bottom - (y + h)), grow - up);
    if (up + down < grow) up = Math.min(Math.max(0, y - L.y), grow - down);
    y -= up;
    h += up + down;
  }
  let cw = w, ch = h, dx = 0, dy = 0;
  if (w > 0 && h > 0 && Math.abs(w / h - A) > 0.001) {
    if (w / h < A) { cw = Math.max(w, Math.round(h * A)); dx = Math.floor((cw - w) / 2); }
    else { ch = Math.max(h, Math.round(w / A)); dy = Math.floor((ch - h) / 2); }
  }
  return { x: x, y: y, w: w, h: h, cw: cw, ch: ch, dx: dx, dy: dy };
}
function cropSketch(src) {
  if (!src || typeof document === 'undefined' || !document.createElement) return Promise.resolve('');
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
        if (!sw || !sh) { resolve(''); return; }
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#fff';
        g.fillRect(0, 0, sw, sh);
        g.drawImage(img, 0, 0);
        const box = sketchBox(g.getImageData(0, 0, sw, sh).data, sw, sh);
        if (!box) { resolve(''); return; }
        const frame = sketchFrame(box, sketchLimit(sw, sh));
        const out = document.createElement('canvas');
        out.width = frame.cw; out.height = frame.ch;
        const og = out.getContext('2d');
        og.fillStyle = '#fff';
        og.fillRect(0, 0, frame.cw, frame.ch);
        og.drawImage(c, frame.x, frame.y, frame.w, frame.h, frame.dx, frame.dy, frame.w, frame.h);
        resolve(out.toDataURL('image/jpeg', 0.92));
      } catch (e) { resolve(''); }
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}
function presentSketch(jo, src) {
  const prev = SKETCH_CROP.get(jo);
  if (prev && prev.len >= src.length && prev.src) return Promise.resolve(prev.src);
  return cropSketch(src).then(out => {
    const use = out || src;
    const again = SKETCH_CROP.get(jo);
    if (!again || src.length >= again.len) SKETCH_CROP.set(jo, { len: src.length, src: use });
    const kept = SKETCH_CROP.get(jo);
    return kept && kept.src ? kept.src : use;
  }).catch(() => src);
}
function remember(item, src) {
  if (!src) return;
  const size = item.size;
  // A page-2 stand-in is not the JO's profile. Keep the cropped sketch for this visit only.
  if (item.sketch && item.jo) {
    MEM.set('sketch:' + item.jo + '|' + size, src);
    if (size === 300 && item.id) MEM.set('sketchid:' + item.jo, item.id);
    return;
  }
  if (item.id) {
    MEM.set(memKey(item.id, size), src);
    idbPut(item.id, size, src);
    if (size === 300) lsPut(item.id, item.kind === 'piece' ? item.jo : '', src);
  }
  if (item.kind === 'piece' && item.jo && size === 300 && !item.sketch) MEM.set('jo:' + item.jo + '|300', src);
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
  if (src && w.item && w.item.sketch && w.item.jo) {
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
      if (row && row.sketch) w.item.sketch = true;
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
    const idb = await idbGet(w.item.id, w.item.size);
    if (idb) { finish(w, idb); return; }
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
function schedule() { clearTimeout(timer); timer = setTimeout(flush, 30); }
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
  const IO = window.IntersectionObserver;
  const paint = (el, item) => load(item).then(src => { if (el.isConnected !== false) opt.paint(el, src || '', item); });
  if (!IO) { root.querySelectorAll(opt.sel).forEach(el => paint(el, opt.item(el))); return; }
  const io = new IO(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    paint(en.target, opt.item(en.target));
  }), { rootMargin: '400px' });
  OBS.push({ root, io });
  root.querySelectorAll(opt.sel).forEach(el => {
    const item = opt.item(el);
    const src = peek(item);
    if (src) { opt.paint(el, src, item); return; }
    io.observe(el);
  });
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
  img.className = 'phblur';
  const lab = document.createElement('span');
  lab.className = 'lab phlab';
  lab.textContent = 'Loading photo…';
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
    const place = () => {
      if (!el.classList.contains('sketch') || !img.naturalWidth || !img.naturalHeight) return;
      const box = el.getBoundingClientRect();
      const frame = box.width > 0 && box.height > 0 ? box.width / box.height : SKETCH_FRAME;
      const aspect = img.naturalWidth / img.naturalHeight;
      img.style.objectFit = Math.abs(aspect - frame) < 0.012 ? 'cover' : 'contain';
    };
    if (img.complete) place();
    else img.addEventListener('load', place, { once: true });
  };
  const base = { jo: o.jo, id: o.id || '', kind: o.kind || 'scan', legacy: o.legacy || 'prod', fallback: !!o.fallback, sketch: false };
  const thumbItem = Object.assign({}, base, { size: 300 });
  const thumb = peek(thumbItem);
  if (thumb) show(thumb, true);
  const sharpen = src => {
    if (src) return show(src, false);
    sharp = true;
    if (img.parentNode) img.classList.remove('phblur');
    else { lab.hidden = false; lab.textContent = o.empty || 'Photo not found'; }
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
  // A page-2 stand-in is cropped to the design sketch before it is shown. Page 1 is not a stand-in.
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
window.OYPPhotos = { load, watch, prefetch, stage, peek, extras, pageLabel, sketchBox, sketchFrame, cropSketch, SKETCH_ROI, SKETCH_FRAME };
})();
