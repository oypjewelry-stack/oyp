/* JO card zones. The card scanner (jo-scanner) loads nav.js from this site, and nav.js loads this file.
   Staff draw the JO-number box once on a sample photo. Page 1 of a later scan sends that crop as ocrBase64
   (and optional date / other crops as ocrFieldsBase64). The full page still uploads as imageBase64.
   Code.gs runs the JO-number check on the JO crop only, so a date elsewhere on the card is not a JO number.
   Later pages stay full-page reads: they are not the form, and the JO box would miss. No template = today's full-page read.
   The shared template is a Script Property (paste/Code.gs.txt). Until that paste is deployed, a save stays on this phone. */
(function (root) {
'use strict';
if (root.OYPZones) return;

var KEY = 'oypScanZones';
var SHARED = 'oypScanZonesShared';
var TOKEN = 'oypScanToken';
var API = 'oypScanApi';
var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
var COLOR = { jo: '#9a7b2f', date: '#2f6f9a', other: '#555555' };
var state = { zones: [], shared: false };
var editors = 0;
var refreshP = Promise.resolve();

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function clamp(n, a, b) { n = Number(n); if (!isFinite(n)) n = 0; return n < a ? a : n > b ? b : n; }
function round4(n) { return Math.round(n * 10000) / 10000; }
function kindOf(id) {
  if (id === 'jo' || id === 'date') return id;
  if (id === 'other' || /^other[2-4]$/.test(id)) return 'other';
  return '';
}
function labelOf(id) {
  if (id === 'jo') return 'JO number';
  if (id === 'date') return 'Date';
  if (id === 'other') return 'Other';
  var m = /^other([2-4])$/.exec(id);
  return m ? 'Other ' + m[1] : id;
}
function cleanZone(z) {
  if (!z || !kindOf(String(z.id || ''))) return null;
  var x = clamp(z.x, 0, 1), y = clamp(z.y, 0, 1), w = clamp(z.w, 0, 1), h = clamp(z.h, 0, 1);
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w < 0.02 || h < 0.02) return null;
  return { id: String(z.id), x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
}
function cleanList(list) {
  var out = [], seenJo = false, seenDate = false, nOther = 0;
  (list || []).forEach(function (z) {
    var c = cleanZone(z); if (!c) return;
    var k = kindOf(c.id);
    if (k === 'jo') { if (seenJo) return; seenJo = true; c.id = 'jo'; }
    else if (k === 'date') { if (seenDate) return; seenDate = true; c.id = 'date'; }
    else {
      nOther += 1; if (nOther > 4) return;
      c.id = nOther === 1 ? 'other' : 'other' + nOther;
    }
    out.push(c);
  });
  return out;
}
function readLocal() {
  try { return cleanList(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return []; }
}
function writeLocal(zones) {
  try { localStorage.setItem(KEY, JSON.stringify(zones)); } catch (e) {}
}
function api() { try { return localStorage.getItem(API) || DEFAULT_API; } catch (e) { return DEFAULT_API; } }
function token() { try { return localStorage.getItem(TOKEN) || ''; } catch (e) { return ''; } }
function setToken(v) { try { if (v) localStorage.setItem(TOKEN, v); else localStorage.removeItem(TOKEN); } catch (e) {} }
function zonesUrl() { var u = api(); return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'zones=1'; }
function hasJo(zones) { return (zones || []).some(function (z) { return z.id === 'jo'; }); }

function loadImage(src) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = src.indexOf('data:') === 0 ? src : 'data:image/jpeg;base64,' + src;
  });
}
function cropFrom(img, zone) {
  try {
    var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    var x = Math.round(zone.x * sw), y = Math.round(zone.y * sh);
    var w = Math.round(zone.w * sw), h = Math.round(zone.h * sh);
    if (x < 0) x = 0; if (y < 0) y = 0;
    if (x + w > sw) w = sw - x; if (y + h > sh) h = sh - y;
    if (w < 8 || h < 8) return '';
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);
    var url = c.toDataURL('image/jpeg', 0.85);
    var i = url.indexOf(',');
    return i >= 0 ? url.slice(i + 1) : '';
  } catch (e) { return ''; }
}
function crops(b64, zones) {
  var jo = null, fields = [];
  zones.forEach(function (z) { if (z.id === 'jo') jo = z; else fields.push(z); });
  if (!jo) return Promise.resolve(null);
  return loadImage(b64).then(function (img) {
    if (!img) return null;
    var joB64 = cropFrom(img, jo);
    if (!joB64) return null;
    var extra = [];
    fields.forEach(function (z) { var b = cropFrom(img, z); if (b) extra.push(b); });
    return { ocrBase64: joB64, ocrFieldsBase64: extra };
  });
}
/* Page 1 only. The bytes in imageBase64 stay the full upright page. */
function prepare(body) {
  if (!body || !body.imageBase64 || body.op) return Promise.resolve(body);
  var page = parseInt(body.page, 10) || 1;
  if (page !== 1) return Promise.resolve(body);
  var zones = state.zones;
  if (!hasJo(zones)) return Promise.resolve(body);
  return crops(body.imageBase64, zones).then(function (c) {
    if (!c || !c.ocrBase64) return body;
    var next = {};
    Object.keys(body).forEach(function (k) { next[k] = body[k]; });
    next.ocrBase64 = c.ocrBase64;
    if (c.ocrFieldsBase64 && c.ocrFieldsBase64.length) next.ocrFieldsBase64 = c.ocrFieldsBase64;
    return next;
  });
}
function installFetch() {
  if (!root.fetch || root.fetch.__oypZones) return;
  var orig = root.fetch;
  function wrapped(input, init) {
    var opts = init || {};
    var raw = opts.body;
    var method = String(opts.method || 'GET').toUpperCase();
    if (method !== 'POST' || typeof raw !== 'string') return orig.apply(this, arguments);
    var body;
    try { body = JSON.parse(raw); } catch (e) { return orig.apply(this, arguments); }
    if (!body || !body.imageBase64 || body.op) return orig.apply(this, arguments);
    var ctx = this;
    return prepare(body).then(function (next) {
      if (!next || next === body || !next.ocrBase64) return orig.call(ctx, input, init);
      var copy = {};
      Object.keys(opts).forEach(function (k) { copy[k] = opts[k]; });
      copy.body = JSON.stringify(next);
      return orig.call(ctx, input, copy);
    });
  }
  wrapped.__oypZones = true;
  root.fetch = wrapped;
}
function refresh() {
  return root.fetch(zonesUrl(), { method: 'GET', redirect: 'follow' }).then(function (res) { return res.json(); }).then(function (r) {
    if (editors) return;
    if (!r || !Array.isArray(r.zones)) return;
    state.zones = cleanList(r.zones);
    state.shared = true;
    writeLocal(state.zones);
    try { localStorage.setItem(SHARED, '1'); } catch (e) {}
  }).catch(function () {});
}
function saveZones(zones) {
  state.zones = cleanList(zones);
  writeLocal(state.zones);
  var tok = token();
  if (!tok) return Promise.resolve({ ok: true, local: true, reason: 'no-token' });
  return root.fetch(api(), {
    method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ op: 'saveZones', token: tok, zones: state.zones })
  }).then(function (res) { return res.json(); }).then(function (r) {
    if (r && r.ok && r.saved) {
      state.shared = true;
      try { localStorage.setItem(SHARED, '1'); } catch (e) {}
      if (Array.isArray(r.zones)) { state.zones = cleanList(r.zones); writeLocal(state.zones); }
      return { ok: true, shared: true };
    }
    state.shared = false;
    try { localStorage.removeItem(SHARED); } catch (e2) {}
    return { ok: true, local: true, reason: (r && r.error) || 'not-saved' };
  }).catch(function () {
    state.shared = false;
    return { ok: true, local: true, reason: 'offline' };
  });
}
function saveMessage(res, zones) {
  var jo = hasJo(zones);
  if (res && res.shared) {
    return jo
      ? 'Saved for every phone. On page 1, the JO number is read only from the JO box.'
      : 'Cleared for every phone. Scans read the whole card again.';
  }
  if (res && res.reason === 'no-token') return 'Saved on this phone. Add the scanner token to share the boxes with every phone.';
  if (res && /bad token/i.test(res.reason || '')) return 'Saved on this phone. The scanner token was not accepted, so other phones still have the previous boxes.';
  if (res && res.local) return jo
    ? 'Saved on this phone. Other phones get it after the Code.gs paste. Until then, scans still read the whole card.'
    : 'Cleared on this phone. Until the Code.gs paste is deployed, other phones are unchanged.';
  return 'Saved on this phone.';
}
function summary() {
  return hasJo(state.zones) ? 'JO box set' : '';
}

function ensureCss() {
  if (document.getElementById('oyp-zones-css')) return;
  var s = document.createElement('style');
  s.id = 'oyp-zones-css';
  s.textContent = [
    '.oz{font-family:Inter,Helvetica,sans-serif;color:#111;background:#fff;box-sizing:border-box}',
    '.oz *,.oz *::before,.oz *::after{box-sizing:border-box}',
    '.oz-pop{position:fixed;inset:0;z-index:10000;overflow:auto;padding:16px 16px 40px;background:#fff}',
    '.oz-inline{margin-top:8px}',
    '.ozbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}',
    '.ozbar b{font-family:"Libre Bodoni",Didot,serif;font-weight:500;font-size:22px;flex:1 0 160px}',
    '.oznote{font-size:14px;line-height:1.45;color:#444;max-width:720px;margin:0 0 12px}',
    '.oztools{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}',
    '.oztools button,.ozfile{border:1px solid #ddd;background:#fff;border-radius:999px;padding:8px 14px;font:500 12px/1.2 Inter,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;color:#111}',
    '.oztools button.on{border-color:#d4af37;background:#faf8f1}',
    '.ozfile input{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.ozsave,.ozghost{border-radius:999px;padding:10px 16px;font:500 12px/1 Inter,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.ozsave{background:#111;color:#fff;border:0}',
    '.ozsave:disabled{opacity:.45}',
    '.ozghost{background:#fff;color:#111;border:1px solid #ddd}',
    '.ozstage{position:relative;max-width:720px;border:1px solid #eee;border-radius:14px;overflow:hidden;background:#f6f4ee;touch-action:none}',
    '.ozstage canvas{width:100%;height:auto;display:block;touch-action:none;cursor:crosshair}',
    '.ozlist{list-style:none;padding:0;margin:12px 0;max-width:720px}',
    '.ozlist li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 4px;border-bottom:1px solid #f1f1f1;font-size:14px}',
    '.ozlist li.on{background:#faf8f1}',
    '.ozlist button,.ozlink{background:none;border:0;padding:0;text-decoration:underline;cursor:pointer;font:500 11px Inter,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#111}',
    '.ozrow{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:8px}',
    '.ozstatus{font-size:14px;color:#333;max-width:720px;min-height:1.2em}',
    '.oztok{display:flex;flex-direction:column;gap:4px;margin:8px 0 0;max-width:360px;font-size:12px;letter-spacing:.06em;text-transform:uppercase}',
    '.oztok input{text-transform:none;letter-spacing:0;font:15px Inter,Helvetica,sans-serif;padding:8px 10px;border:1px solid #ddd;border-radius:10px}'
  ].join('');
  document.head.appendChild(s);
}
function isScanner() {
  var el = document.documentElement;
  if (el && el.getAttribute('data-oyp-scanner') === '1') return true;
  if (el && el.getAttribute('data-oyp-scanner') === '0') return false;
  if (/jo-scanner/.test(location.pathname || '')) return true;
  return !!(document.getElementById('btnMenu') && document.getElementById('menu') && !document.getElementById('vOffice'));
}
function hookMenu() {
  if (!isScanner()) return;
  var menu = document.getElementById('menu');
  if (!menu || menu.getAttribute('data-oz-hook')) return;
  menu.setAttribute('data-oz-hook', '1');
  function inject() {
    if (menu.querySelector('[data-oz]')) return;
    if (!menu.children.length) return;
    var a = document.createElement('a');
    a.href = '#';
    a.setAttribute('data-m', 'zones');
    a.setAttribute('data-oz', '1');
    a.textContent = 'JO card zones';
    var settings = menu.querySelector('[data-m="settings"]');
    if (settings) menu.insertBefore(a, settings); else menu.appendChild(a);
  }
  new MutationObserver(inject).observe(menu, { childList: true, attributes: true, attributeFilter: ['class'] });
  menu.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-oz]') : null;
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    menu.classList.add('hidden');
    open();
  }, true);
  inject();
}

function Editor(host, pop) {
  editors += 1;
  var zones = cleanList(state.zones);
  var img = null;
  var kind = 'jo';
  var selected = zones.findIndex(function (z) { return z.id === 'jo'; });
  var drag = null;
  var dirty = false;
  var onKey = null;
  host.className = 'oz ' + (pop ? 'oz-pop' : 'oz-inline');
  host.innerHTML = (pop
    ? '<div class="ozbar"><button type="button" class="ozghost" data-z="close">Close</button><b>JO card zones</b><button type="button" class="ozsave" data-z="save">Save zones</button></div>'
    : '<div class="ozbar"><b>JO card zones</b><button type="button" class="ozsave" data-z="save">Save zones</button></div>')
    + '<p class="oznote">Draw a box around the JO number on a sample photo. Page 1 reads the JO number from that box only, so a date written somewhere else on the card stays out of the JO check. A date box and other boxes are optional: they are read for the due date, the date given, and the karat. Later pages of the same card are read in full. Drag a box to move it. Drag the corner to resize it.</p>'
    + '<div class="oztools"><button type="button" data-kind="jo" class="on">JO number</button><button type="button" data-kind="date">Date</button><button type="button" data-kind="other">Other</button>'
    + '<label class="ozfile">Sample photo<input type="file" accept="image/*"></label></div>'
    + '<div class="ozstage"><canvas aria-label="Sample JO card. Drag a box on the photo."></canvas></div>'
    + '<ul class="ozlist"></ul>'
    + '<div class="ozrow"><button type="button" class="ozlink" data-z="clear">Clear boxes</button></div>'
    + '<label class="oztok">Scanner token<input type="password" data-z="token" autocomplete="off" spellcheck="false"></label>'
    + '<p class="ozstatus" aria-live="polite"></p>';
  var canvas = host.querySelector('canvas');
  var list = host.querySelector('.ozlist');
  var status = host.querySelector('.ozstatus');
  var tok = host.querySelector('[data-z="token"]');
  var tokLab = host.querySelector('.oztok');
  function showToken() {
    var has = !!token();
    tok.value = has ? token() : '';
    tokLab.style.display = has && isScanner() ? 'none' : '';
    if (has && !isScanner()) tokLab.firstChild.textContent = 'Scanner token (already on this computer) ';
  }
  showToken();
  function setStatus(t) { status.textContent = t || ''; }
  if (hasJo(zones) && state.shared) setStatus('These boxes are already shared with every phone.');
  else if (hasJo(zones)) setStatus('A JO box is saved on this phone. Save again after the Code.gs paste to share it.');
  else setStatus('No JO box yet. Scans read the whole card.');

  function color(id) { return COLOR[kindOf(id)] || COLOR.other; }
  function nextOtherId() {
    var used = {};
    zones.forEach(function (z) { if (kindOf(z.id) === 'other') used[z.id] = true; });
    var ids = ['other', 'other2', 'other3', 'other4'];
    for (var i = 0; i < ids.length; i++) if (!used[ids[i]]) return ids[i];
    return '';
  }
  function paint() {
    var W = img ? (img.naturalWidth || img.width) : 600;
    var H = img ? (img.naturalHeight || img.height) : 400;
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    if (img) g.drawImage(img, 0, 0, W, H);
    else { g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, W, H); }
    var hs = Math.max(16, Math.round(Math.min(W, H) * 0.045));
    zones.forEach(function (z, i) {
      var x = z.x * W, y = z.y * H, w = z.w * W, h = z.h * H, col = color(z.id);
      g.fillStyle = i === selected ? 'rgba(212,175,55,.18)' : 'rgba(255,255,255,.08)';
      g.fillRect(x, y, w, h);
      g.lineWidth = Math.max(2, Math.round(W / 280));
      g.strokeStyle = col;
      g.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
      g.font = '600 ' + Math.max(14, Math.round(W * 0.028)) + 'px Inter, Helvetica, sans-serif';
      var text = labelOf(z.id), tw = g.measureText(text).width, th = Math.max(18, Math.round(W * 0.04));
      g.fillStyle = col;
      g.fillRect(x, y, Math.min(w, tw + 12), th);
      g.fillStyle = '#fff';
      g.fillText(text, x + 6, y + th - 6);
      g.fillStyle = '#fff';
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.fillRect(x + w - hs, y + h - hs, hs, hs);
      g.strokeRect(x + w - hs, y + h - hs, hs, hs);
    });
    if (!img) {
      g.fillStyle = '#666';
      g.font = '500 22px Inter, Helvetica, sans-serif';
      g.fillText('Choose a sample photo, then drag the JO number box.', 24, H / 2);
    }
  }
  function renderList() {
    list.innerHTML = zones.map(function (z, i) {
      return '<li class="' + (i === selected ? 'on' : '') + '" data-i="' + i + '"><span>' + esc(labelOf(z.id)) + '</span><button type="button" data-rm="' + i + '">Remove</button></li>';
    }).join('') || '<li><span>No boxes yet</span></li>';
    host.querySelectorAll('[data-kind]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-kind') === kind); });
  }
  function point(e) {
    var r = canvas.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / (r.width || 1), 0, 1), y: clamp((e.clientY - r.top) / (r.height || 1), 0, 1), W: canvas.width || 600, H: canvas.height || 400 };
  }
  function hit(fx, fy, W, H) {
    var hs = Math.max(16, Math.round(Math.min(W, H) * 0.045));
    var hx = hs / W, hy = hs / H;
    for (var i = zones.length - 1; i >= 0; i--) {
      var z = zones[i];
      if (Math.abs(fx - (z.x + z.w)) <= hx && Math.abs(fy - (z.y + z.h)) <= hy) return { i: i, mode: 'resize' };
    }
    for (var j = zones.length - 1; j >= 0; j--) {
      var q = zones[j];
      if (fx >= q.x && fx <= q.x + q.w && fy >= q.y && fy <= q.y + q.h) return { i: j, mode: 'move' };
    }
    return null;
  }
  function upsert(id, rect) {
    var z = { id: id, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    var i = zones.findIndex(function (q) { return q.id === id; });
    if (i >= 0) zones[i] = z; else zones.push(z);
    selected = zones.findIndex(function (q) { return q.id === id; });
  }
  paint();
  renderList();

  host.addEventListener('click', function (e) {
    var k = e.target.closest ? e.target.closest('[data-kind]') : null;
    if (k) { kind = k.getAttribute('data-kind'); renderList(); return; }
    var rm = e.target.closest ? e.target.closest('[data-rm]') : null;
    if (rm) {
      var i = Number(rm.getAttribute('data-rm'));
      zones.splice(i, 1);
      zones = cleanList(zones);
      if (selected >= zones.length) selected = zones.length - 1;
      dirty = true;
      paint(); renderList();
      setStatus(hasJo(zones) ? 'JO box still in place. Save to keep this.' : 'No JO box. Saving this makes scans read the whole card again.');
      return;
    }
    var row = e.target.closest ? e.target.closest('.ozlist li[data-i]') : null;
    if (row) { selected = Number(row.getAttribute('data-i')); var z = zones[selected]; if (z) kind = kindOf(z.id); renderList(); paint(); }
  });
  host.querySelector('[data-z="token"]').addEventListener('change', function () { setToken(tok.value.trim()); showToken(); });
  host.querySelector('[data-z="save"]').addEventListener('click', function () {
    var btn = host.querySelector('[data-z="save"]');
    btn.disabled = true;
    setStatus('Saving…');
    setToken(tok.value.trim());
    saveZones(zones).then(function (res) {
      zones = cleanList(state.zones);
      dirty = false;
      btn.disabled = false;
      paint(); renderList();
      setStatus(saveMessage(res, zones));
      host.dispatchEvent(new CustomEvent('oyp-zones-saved', { bubbles: true, detail: res }));
    });
  });
  host.querySelector('[data-z="clear"]').addEventListener('click', function () {
    if (!zones.length) return;
    if (!confirm('Clear the JO boxes?')) return;
    zones = []; selected = -1; dirty = true; paint(); renderList();
    setStatus('Boxes cleared here. Save to keep that.');
  });
  var file = host.querySelector('input[type="file"]');
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      loadImage(String(rd.result)).then(function (im) {
        img = im;
        paint();
        host.dispatchEvent(new CustomEvent('oyp-zones-preview', { bubbles: true }));
      });
    };
    rd.readAsDataURL(f);
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (!img) return;
    e.preventDefault();
    var p = point(e);
    var h = hit(p.x, p.y, p.W, p.H);
    if (h) {
      selected = h.i;
      drag = { mode: h.mode, i: h.i, ax: p.x, ay: p.y, z: { id: zones[h.i].id, x: zones[h.i].x, y: zones[h.i].y, w: zones[h.i].w, h: zones[h.i].h } };
      dirty = true;
    } else {
      var id = kind === 'other' ? nextOtherId() : kind;
      if (!id) { setStatus('Four other boxes already. Remove one to add another.'); return; }
      var prev = null;
      zones.forEach(function (z) { if (z.id === id) prev = { id: z.id, x: z.x, y: z.y, w: z.w, h: z.h }; });
      drag = { mode: 'draw', id: id, ax: p.x, ay: p.y, prev: prev, placed: false };
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    paint(); renderList();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = point(e);
    if (drag.mode === 'draw') {
      if (Math.abs(p.x - drag.ax) < 0.01 && Math.abs(p.y - drag.ay) < 0.01) return;
      var x = Math.min(drag.ax, p.x), y = Math.min(drag.ay, p.y);
      upsert(drag.id, { x: x, y: y, w: Math.abs(p.x - drag.ax), h: Math.abs(p.y - drag.ay) });
      drag.placed = true;
      dirty = true;
    } else if (drag.mode === 'move') {
      var z = drag.z;
      var nx = clamp(z.x + (p.x - drag.ax), 0, 1 - z.w);
      var ny = clamp(z.y + (p.y - drag.ay), 0, 1 - z.h);
      zones[drag.i] = { id: z.id, x: nx, y: ny, w: z.w, h: z.h };
    } else if (drag.mode === 'resize') {
      var r = drag.z;
      var w = clamp(p.x - r.x, 0.02, 1 - r.x);
      var h = clamp(p.y - r.y, 0.02, 1 - r.y);
      zones[drag.i] = { id: r.id, x: r.x, y: r.y, w: w, h: h };
    }
    paint();
  });
  function endDrag() {
    if (!drag) return;
    if (drag.mode === 'draw') {
      var i = zones.findIndex(function (z) { return z.id === drag.id; });
      if (!drag.placed) { /* a tap on empty card leaves the boxes as they were */ }
      else if (i >= 0) {
        var c = cleanZone(zones[i]);
        if (!c) {
          if (drag.prev) zones[i] = drag.prev; else zones.splice(i, 1);
        } else zones[i] = c;
      }
    } else if (drag.i >= 0 && zones[drag.i]) {
      var c2 = cleanZone(zones[drag.i]);
      if (c2) zones[drag.i] = c2;
    }
    zones = cleanList(zones);
    selected = drag && drag.id ? zones.findIndex(function (z) { return z.id === drag.id; }) : selected;
    if (selected < 0 && drag && drag.z) selected = zones.findIndex(function (z) { return z.id === drag.z.id; });
    drag = null;
    paint(); renderList();
    host.dispatchEvent(new CustomEvent('oyp-zones-drawn', { bubbles: true }));
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  function close() {
    if (dirty && !confirm('Close without saving these boxes?')) return;
    document.removeEventListener('keydown', onKey);
    editors -= 1;
    if (host.parentNode) host.parentNode.removeChild(host);
  }
  var closeBtn = host.querySelector('[data-z="close"]');
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (pop) {
    onKey = function (e) { if (e.key === 'Escape') close(); };
    host.__oypKey = onKey;
    document.addEventListener('keydown', onKey);
  }
  host.__oypClose = close;
}

function open() {
  ensureCss();
  refreshP.then(function () {
    var old = document.getElementById('oypZonePop');
    if (old) {
      if (old.__oypKey) document.removeEventListener('keydown', old.__oypKey);
      if (editors > 0) editors -= 1;
      if (old.parentNode) old.parentNode.removeChild(old);
    }
    var host = document.createElement('div');
    host.id = 'oypZonePop';
    document.body.appendChild(host);
    Editor(host, true);
  });
}
function mount(host) {
  if (!host) return;
  ensureCss();
  refreshP.then(function () {
    if (!host.isConnected) return;
    host.innerHTML = '';
    Editor(host, false);
  });
}
function boot() {
  installFetch();
  if (typeof document === 'undefined') return;
  state.zones = readLocal();
  try { state.shared = localStorage.getItem(SHARED) === '1'; } catch (e) { state.shared = false; }
  ensureCss();
  if (document.getElementById('menu')) hookMenu();
  else document.addEventListener('DOMContentLoaded', hookMenu);
  refreshP = refresh().then(function () {
    root.dispatchEvent(new Event('oyp-zones-ready'));
  }, function () {
    root.dispatchEvent(new Event('oyp-zones-ready'));
  });
}

root.OYPZones = { mount: mount, open: open, prepare: prepare, zones: function () { return state.zones.slice(); }, summary: summary, saveMessage: saveMessage };
boot();
})(typeof window !== 'undefined' ? window : globalThis);
