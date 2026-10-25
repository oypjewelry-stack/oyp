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
function remember(item, src) {
  if (!src) return;
  const size = item.size;
  // A page-2 stand-in is not the JO's profile. Keep it for this visit only, never under the JO key.
  if (item.sketch && item.jo && size === 300) {
    MEM.set('sketch:' + item.jo + '|300', src);
    if (item.id) MEM.set('sketchid:' + item.jo, item.id);
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
  if (src) remember(w.item, src);
  w.resolve(src || '');
  FLY.delete(w.key || flyKey(w.item));
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
  // Page 2 is a whole card. Its orientation is not fixed, so the stand-in is not cropped here.
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
window.OYPPhotos = { load, watch, prefetch, stage, peek, extras, pageLabel };
})();
