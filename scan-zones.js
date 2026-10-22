/* JO card zones. The card scanner (jo-scanner) loads nav.js from this site, and nav.js loads this file.
   Staff tag each section of the standard card once (JO number, date, client, metal, size, and any other label).
   Page 1 of a later scan sends the JO-number crop as ocrBase64 and the other crops as ocrFields [{id, label, image}].
   The full page still uploads as imageBase64. Code.gs checks the JO number on the JO crop only, and reads each
   other crop under its own label. Later pages stay full-page reads. No template = today's full-page read.
   Once a JO number box is saved, Scan JO can be tapped with the field blank. The number is read from that box
   before the page is filed. A missing or unclear read asks for the number. Typing one first uses that number.
   The shared template is a Script Property (paste/Code.gs.txt). Until that paste is deployed, a save stays on this phone. */
(function (root) {
'use strict';
if (root.OYPZones) return;

var KEY = 'oypScanZones';
var SHARED = 'oypScanZonesShared';
var TOKEN = 'oypScanToken';
var API = 'oypScanApi';
var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
var FIELDS = [
  ['jo', 'JO number'], ['due', 'Date due'], ['given', 'Date given'], ['client', 'Client'], ['phone', 'Phone'],
  ['item', 'Item'], ['metal', 'Metal'], ['karat', 'Karat'], ['size', 'Size'], ['stone', 'Stone'],
  ['weight', 'Weight'], ['price', 'Price'], ['notes', 'Notes']
];
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
function known(id) {
  for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i][0] === id) return FIELDS[i];
  return null;
}
function cleanLabel(s) {
  s = String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 24) s = s.slice(0, 24).trim();
  return /^[A-Za-z0-9][A-Za-z0-9 .\/#&'-]{0,23}$/.test(s) ? s : '';
}
function cleanZone(z) {
  if (!z) return null;
  var id = String(z.id || ''), label = cleanLabel(z.label), k = known(id);
  if (id === 'date') { id = 'due'; k = known('due'); label = 'Date due'; }
  else if (/^other([2-4])?$/.test(id)) { if (!label) label = id === 'other' ? 'Other' : 'Other ' + id.slice(5); id = 'x'; }
  else if (/^x(\d+)$/.test(id)) { if (!label) label = 'Other'; }
  else if (!k) return null;
  else label = k[1];
  var x = clamp(z.x, 0, 1), y = clamp(z.y, 0, 1), w = clamp(z.w, 0, 1), h = clamp(z.h, 0, 1);
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w < 0.02 || h < 0.02 || !label) return null;
  return { id: id, label: label, x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
}
function nextFreeX(used) { for (var i = 1; i <= 6; i++) if (!used[i]) return i; return 0; }
function cleanList(list) {
  var out = [], seen = {}, used = {};
  (list || []).forEach(function (z) {
    var c = cleanZone(z); if (!c) return;
    var xm = /^x(\d+)$/.exec(c.id);
    if (c.id === 'x' || xm) {
      var n = xm ? Number(xm[1]) : 0;
      if (n < 1 || n > 6 || used[n]) n = nextFreeX(used);
      if (!n) return;
      c.id = 'x' + n; used[n] = true;
    } else {
      if (seen[c.id]) return;
      seen[c.id] = true;
    }
    out.push(c);
  });
  return out;
}
function colorOf(id) {
  var palette = ['#9a7b2f', '#2f6f9a', '#3d6b4f', '#6b4f3d', '#5c4d7a', '#7a4d5c', '#3d5c6b', '#6b3d4f'];
  if (id === 'jo') return palette[0];
  var n = 0;
  for (var i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return palette[n % palette.length];
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
/* Chrome and Edge, on desktop and Android, cannot decode HEIC. Fetch this only for a .heic/.heif file.
   The bundle's global is an init function; calling it returns the object with HeifDecoder. */
var HEIC_DECODER = 'https://cdn.jsdelivr.net/npm/libheif-js@1.23.5/libheif-wasm/libheif-bundle.js';
var heicApi = null;
var heicLib = null;
function isHeic(file) {
  var name = String(file && file.name || '').toLowerCase();
  var type = String(file && file.type || '').toLowerCase();
  return /\.hei[cf]$/.test(name) || type.indexOf('image/heic') === 0 || type.indexOf('image/heif') === 0;
}
function loadHeicDecoder() {
  if (heicApi) return Promise.resolve(heicApi);
  if (heicLib) return heicLib;
  heicLib = new Promise(function (resolve, reject) {
    function take(api) {
      if (!api || !api.HeifDecoder) { heicLib = null; reject(new Error('decoder')); return; }
      heicApi = api;
      resolve(api);
    }
    function fromGlobal() {
      var lib = root.libheif;
      if (lib && lib.HeifDecoder) { take(lib); return; }
      if (typeof lib !== 'function') { heicLib = null; reject(new Error('decoder')); return; }
      Promise.resolve().then(function () { return lib(); }).then(take, function () { heicLib = null; reject(new Error('decoder')); });
    }
    if (root.libheif) { fromGlobal(); return; }
    var s = document.createElement('script');
    s.src = HEIC_DECODER;
    s.async = true;
    s.onload = fromGlobal;
    s.onerror = function () { heicLib = null; reject(new Error('decoder')); };
    (document.head || document.documentElement).appendChild(s);
  });
  return heicLib;
}
function heicToJpegUrl(file) {
  return loadHeicDecoder().then(function (lib) {
    return file.arrayBuffer().then(function (buf) {
      var images;
      try { images = new lib.HeifDecoder().decode(new Uint8Array(buf)); }
      catch (e) { throw new Error('decode'); }
      if (!images || !images.length) throw new Error('empty');
      var image = images[0];
      var w = image.get_width(), h = image.get_height();
      if (!w || !h) throw new Error('size');
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      var imageData = ctx.createImageData(w, h);
      return new Promise(function (resolve, reject) {
        try {
          image.display(imageData, function (displayData) {
            if (!displayData) { reject(new Error('display')); return; }
            try {
              ctx.putImageData(displayData, 0, 0);
              resolve(c.toDataURL('image/jpeg', 0.92));
            } catch (err) { reject(err); }
          });
        } catch (err) { reject(err); }
      });
    });
  });
}
function readDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var rd = new FileReader();
    rd.onload = function () { resolve(String(rd.result || '')); };
    rd.onerror = function () { reject(rd.error || new Error('read')); };
    rd.readAsDataURL(file);
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
    fields.forEach(function (z) {
      var b = cropFrom(img, z);
      if (b) extra.push({ id: z.id, label: z.label, image: b });
    });
    return { ocrBase64: joB64, ocrFields: extra };
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
    if (c.ocrFields && c.ocrFields.length) next.ocrFields = c.ocrFields;
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
      ? 'Saved for every phone. On page 1, the JO number comes from the JO number box, and each other label is read on its own.'
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
  var n = state.zones.length;
  if (!hasJo(state.zones)) return n ? n + ' card box' + (n > 1 ? 'es' : '') + ', no JO number' : '';
  return n === 1 ? 'JO number box' : n + ' card boxes';
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
    '.oztools button,.ozfile,.ozcustom{border:1px solid #ddd;background:#fff;border-radius:999px;padding:8px 12px;font:500 12px/1.2 Inter,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;color:#111}',
    '.ozcustom{display:inline-flex;align-items:center;gap:6px;cursor:text}',
    '.ozcustom input{text-transform:none;letter-spacing:0;font:15px Inter,Helvetica,sans-serif;border:0;padding:0;width:7.5em;background:transparent;color:#111}',
    '.oztools button.on{border-color:#d4af37;background:#faf8f1}',
    '.ozpick{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    '.ozsave,.ozghost{border-radius:999px;padding:10px 16px;font:500 12px/1 Inter,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.ozsave{background:#111;color:#fff;border:0}',
    '.ozsave:disabled{opacity:.45}',
    '.ozghost{background:#fff;color:#111;border:1px solid #ddd}',
    '.ozstage{position:relative;max-width:720px;border:1px solid #eee;border-radius:14px;overflow:hidden;background:#f6f4ee;touch-action:none}',
    '.ozstage canvas{width:100%;height:auto;display:block;touch-action:none;cursor:crosshair}',
    '.ozstage:not(.ozhas) canvas{cursor:pointer}',
    '.ozstage.ozhot{box-shadow:inset 0 0 0 2px #d4af37}',
    '.ozupload{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1}',
    '.ozstage.ozhas .ozupload{display:none}',
    '.ozlist{list-style:none;padding:0;margin:12px 0;max-width:720px}',
    '.ozlist li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 4px;border-bottom:1px solid #f1f1f1;font-size:14px}',
    '.ozlist li.on{background:#faf8f1}',
    '.ozlist button,.ozlink{background:none;border:0;padding:0;text-decoration:underline;cursor:pointer;font:500 11px Inter,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#111}',
    '.ozrow{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:8px}',
    '.ozstatus{font-size:14px;color:#333;max-width:720px;min-height:1.2em}',
    '.oztok{display:flex;flex-direction:column;gap:4px;margin:8px 0 0;max-width:360px;font-size:12px;letter-spacing:.06em;text-transform:uppercase}',
    '.oztok input{text-transform:none;letter-spacing:0;font:15px Inter,Helvetica,sans-serif;padding:8px 10px;border:1px solid #ddd;border-radius:10px}',
    '#joInput.oyp-ocr-hold{color:transparent}',
    '.ozask{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;padding:16px}',
    '.ozaskbox{background:#fff;border-radius:16px;padding:18px;width:100%;max-width:420px;display:flex;flex-direction:column;gap:10px}',
    '.ozaskbox b{font-family:"Libre Bodoni",Didot,serif;font-weight:500;font-size:22px}',
    '.ozaskbox p{margin:0;font-size:15px;line-height:1.4;color:#333}',
    '.ozaskbox input{border:1.5px solid #111;border-radius:12px;padding:12px;font:500 20px Inter,Helvetica,sans-serif;color:#111}',
    '.ozaskbox input.bad{border-color:#9a7b2f}',
    '.ozaskrow{display:flex;gap:8px}',
    '.ozaskrow button{flex:1}'
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
    + '<p class="oznote">Tag each section of the card once. Pick a label, then drag that box on a sample photo: JO number, date due, date given, client, phone, item, metal, karat, size, stone, weight, price, notes, or any other label you type. Page 1 reads the JO number only from the JO number box. Each other box is read on its own, under its label. Later pages of the same card are read in full. Drag a box to move it. Drag the corner to resize it. Drawing a label again replaces that box.</p>'
    + '<div class="oztools">' + FIELDS.map(function (f) { return '<button type="button" data-kind="' + f[0] + '"' + (f[0] === 'jo' ? ' class="on"' : '') + '>' + esc(f[1]) + '</button>'; }).join('')
    + '<button type="button" data-kind="x">Other label</button><label class="ozcustom">Label <input data-z="custom" maxlength="24" placeholder="Repair" aria-label="Label for another box"></label>'
    + '<button type="button" class="ozfile" data-z="change">Change photo</button>'
    + '<input class="ozpick" data-z="file" type="file" accept="image/*,.heic,.heif" tabindex="-1" aria-hidden="true"></div>'
    + '<div class="ozstage"><canvas aria-label="Drop a JO card photo here, or click to upload."></canvas>'
    + '<button type="button" class="ozsave ozupload" data-z="upload">Upload photo</button></div>'
    + '<ul class="ozlist"></ul>'
    + '<div class="ozrow"><button type="button" class="ozlink" data-z="clear">Clear boxes</button></div>'
    + '<label class="oztok">Scanner token<input type="password" data-z="token" autocomplete="off" spellcheck="false"></label>'
    + '<p class="ozstatus" aria-live="polite"></p>';
  var canvas = host.querySelector('canvas');
  var stage = host.querySelector('.ozstage');
  var uploadBtn = host.querySelector('[data-z="upload"]');
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

  function color(id) { return colorOf(id); }
  function nextCustomId() {
    var used = {};
    zones.forEach(function (z) { var m = /^x(\d+)$/.exec(z.id); if (m) used[Number(m[1])] = true; });
    var n = nextFreeX(used);
    return n ? 'x' + n : '';
  }
  function idForDraw() {
    if (kind !== 'x') return { id: kind, label: known(kind)[1] };
    var label = cleanLabel(host.querySelector('[data-z="custom"]').value);
    if (!label) return { error: 'Type a label for this box, then drag it.' };
    var match = null;
    FIELDS.forEach(function (f) { if (f[1].toLowerCase() === label.toLowerCase()) match = f[0]; });
    if (match) return { id: match, label: known(match)[1] };
    var existing = null;
    zones.forEach(function (z) { if (/^x\d+$/.test(z.id) && z.label.toLowerCase() === label.toLowerCase()) existing = z.id; });
    if (existing) return { id: existing, label: label };
    var id = nextCustomId();
    if (!id) return { error: 'Six extra labels already. Remove one to add another.' };
    return { id: id, label: label };
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
      var text = z.label, tw = g.measureText(text).width, th = Math.max(18, Math.round(W * 0.04));
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
      var prompt = 'Drop a JO card photo here, or click to upload.';
      var size = 22;
      g.fillStyle = '#666';
      g.font = '500 ' + size + 'px Inter, Helvetica, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      while (size > 14 && g.measureText(prompt).width > W - 48) {
        size -= 1;
        g.font = '500 ' + size + 'px Inter, Helvetica, sans-serif';
      }
      var cssH = stage.clientHeight || H;
      var btnH = uploadBtn && uploadBtn.offsetHeight ? uploadBtn.offsetHeight : 34;
      var textY = H / 2 - (btnH / 2 + 14) * (H / cssH);
      if (textY < size + 8) textY = size + 8;
      g.fillText(prompt, W / 2, textY);
      g.textAlign = 'start';
      g.textBaseline = 'alphabetic';
    }
    stage.classList.toggle('ozhas', !!img);
    canvas.setAttribute('aria-label', img ? 'Sample JO card. Drag a box on the photo.' : 'Drop a JO card photo here, or click to upload.');
  }
  function renderList() {
    list.innerHTML = zones.map(function (z, i) {
      return '<li class="' + (i === selected ? 'on' : '') + '" data-i="' + i + '"><span>' + esc(z.label) + '</span><button type="button" data-rm="' + i + '">Remove</button></li>';
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
  function upsert(id, rect, label) {
    var z = { id: id, label: label, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
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
    if (row) {
      selected = Number(row.getAttribute('data-i'));
      var z = zones[selected];
      if (z) { kind = known(z.id) ? z.id : 'x'; if (kind === 'x') host.querySelector('[data-z="custom"]').value = z.label; }
      renderList(); paint();
    }
  });
  host.querySelector('[data-z="custom"]').addEventListener('focus', function () { kind = 'x'; renderList(); });
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
      syncStart();
      host.dispatchEvent(new CustomEvent('oyp-zones-saved', { bubbles: true, detail: res }));
    });
  });
  host.querySelector('[data-z="clear"]').addEventListener('click', function () {
    if (!zones.length) return;
    if (!confirm('Clear the JO boxes?')) return;
    zones = []; selected = -1; dirty = true; paint(); renderList();
    setStatus('Boxes cleared here. Save to keep that.');
  });
  var file = host.querySelector('[data-z="file"]');
  var photoSeq = 0;
  function openPicker() { file.click(); }
  function readPhoto(f) {
    if (!f) return;
    var seq = ++photoSeq;
    var heic = isHeic(f);
    var keep = status.textContent;
    if (keep === 'Opening photo…' || keep === 'Could not open that photo.') keep = '';
    if (heic) setStatus('Opening photo…');
    var pending = heic ? heicToJpegUrl(f) : readDataUrl(f);
    pending.then(function (url) { return loadImage(url); }).then(function (im) {
      if (seq !== photoSeq) return;
      if (!im) { setStatus('Could not open that photo.'); return; }
      img = im;
      paint();
      if (heic && status.textContent === 'Opening photo…') setStatus(keep);
      host.dispatchEvent(new CustomEvent('oyp-zones-preview', { bubbles: true }));
    }, function () {
      if (seq !== photoSeq) return;
      setStatus('Could not open that photo.');
    });
  }
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    file.value = '';
    readPhoto(f);
  });
  uploadBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    openPicker();
  });
  host.querySelector('[data-z="change"]').addEventListener('click', openPicker);
  stage.addEventListener('click', function (e) {
    if (img) return;
    if (e.target && e.target.closest && e.target.closest('[data-z="upload"]')) return;
    openPicker();
  });
  var dragDepth = 0;
  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt || !dt.types) return false;
    for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    return false;
  }
  stage.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
    stage.classList.add('ozhot');
  });
  stage.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  stage.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) stage.classList.remove('ozhot');
  });
  stage.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    stage.classList.remove('ozhot');
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) readPhoto(files[0]);
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (!img) return;
    e.preventDefault();
    var p = point(e);
    var h = hit(p.x, p.y, p.W, p.H);
    if (h) {
      selected = h.i;
      drag = { mode: h.mode, i: h.i, ax: p.x, ay: p.y, z: { id: zones[h.i].id, label: zones[h.i].label, x: zones[h.i].x, y: zones[h.i].y, w: zones[h.i].w, h: zones[h.i].h } };
      dirty = true;
    } else {
      var draw = idForDraw();
      if (draw.error) { setStatus(draw.error); return; }
      var prev = null;
      zones.forEach(function (z) { if (z.id === draw.id) prev = { id: z.id, label: z.label, x: z.x, y: z.y, w: z.w, h: z.h }; });
      drag = { mode: 'draw', id: draw.id, label: draw.label, ax: p.x, ay: p.y, prev: prev, placed: false };
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
      upsert(drag.id, { x: x, y: y, w: Math.abs(p.x - drag.ax), h: Math.abs(p.y - drag.ay) }, drag.label);
      drag.placed = true;
      dirty = true;
    } else if (drag.mode === 'move') {
      var z = drag.z;
      var nx = clamp(z.x + (p.x - drag.ax), 0, 1 - z.w);
      var ny = clamp(z.y + (p.y - drag.ay), 0, 1 - z.h);
      zones[drag.i] = { id: z.id, label: z.label, x: nx, y: ny, w: z.w, h: z.h };
    } else if (drag.mode === 'resize') {
      var r = drag.z;
      var w = clamp(p.x - r.x, 0.02, 1 - r.x);
      var h = clamp(p.y - r.y, 0.02, 1 - r.y);
      zones[drag.i] = { id: r.id, label: r.label, x: r.x, y: r.y, w: w, h: h };
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
    host.dispatchEvent(new CustomEvent('oyp-zones-drawn', {
      bubbles: true,
      detail: zones.map(function (z) { return { id: z.id, label: z.label, x: z.x, y: z.y, w: z.w, h: z.h }; })
    }));
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
/* Once a JO number box exists, Scan JO with a blank field reads that box before the page is filed.
   The scanner itself still requires a non-empty field, so a blank tap is held as OCR until the read
   replaces it. A typed number is left alone and is the override. */
var HOLD = 'OCR';
var ocrChain = Promise.resolve('');
var lastFromCard = false;
var lastFiled = null;
var lastImage = '';
var lastThumb = '';

function normJo(s) {
  if (typeof root.normJO === 'function') return root.normJO(s);
  var m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})(?:\s?([A-Z])(?![A-Z0-9]))?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : String(s || '').trim().toUpperCase().replace(/^J\.?O\.?\s*#?\s*/, '');
}
function validJo(s) { return /^\d{2}-\d{3,4}[A-Z]?$/.test(normJo(s)); }
function joField() { return document.getElementById('joInput'); }
function dateTag() {
  var m = new Date(Date.now() + 8 * 36e5).toISOString();
  return m.slice(5, 7) + m.slice(8, 10) + m.slice(2, 4);
}
function say(t) {
  var n = document.getElementById('note');
  if (!n) return;
  n.textContent = t;
  n.classList.remove('hidden');
}
function holdOn() {
  var input = joField();
  if (!input) return;
  input.value = HOLD;
  input.classList.add('oyp-ocr-hold');
  if (!input.hasAttribute('data-oyp-ph')) input.setAttribute('data-oyp-ph', input.getAttribute('placeholder') || '');
  input.setAttribute('placeholder', 'Read from the card');
}
function clearHold() {
  var input = joField();
  if (!input || input.value !== HOLD) return;
  input.value = '';
  input.classList.remove('oyp-ocr-hold');
  if (input.hasAttribute('data-oyp-ph')) input.setAttribute('placeholder', input.getAttribute('data-oyp-ph'));
}
function fillJo(jo) {
  var input = joField();
  if (!input) return;
  input.classList.remove('oyp-ocr-hold');
  input.value = jo;
  if (input.hasAttribute('data-oyp-ph')) input.setAttribute('placeholder', input.getAttribute('data-oyp-ph'));
  var label = document.getElementById('joLabel');
  if (label) label.textContent = jo;
}
function syncStart() {
  if (typeof document === 'undefined' || !isScanner()) return;
  var help = document.querySelector('#startView .help');
  if (!help) return;
  if (!help.hasAttribute('data-oyp-help')) help.setAttribute('data-oyp-help', help.textContent);
  help.textContent = hasJo(state.zones)
    ? 'Tap Scan JO. The number is read from the card. Type a JO number first when you want to set it yourself.'
    : help.getAttribute('data-oyp-help');
}
function scan() { return root.__scan || null; }
function renameItem(item, jo) {
  var m = String(item.filename || '').match(/-p(\d+)-(\d{6}[a-z]?)\.jpe?g$/i);
  var page = m ? Number(m[1]) : (parseInt(item.page, 10) || 1);
  var tag = m ? m[2] : dateTag();
  var stamp = String(item.scan || '').split('@')[1] || Date.now().toString(36);
  item.jo = jo;
  item.page = page;
  item.filename = jo + '-p' + page + '-' + tag + '.jpg';
  item.scan = jo + '@' + stamp;
}
function syncState(item) {
  var sc = scan();
  if (!sc) return;
  if (sc.state) { sc.state.jo = item.jo; sc.state.scan = item.scan; }
  if (sc.photo && sc.photo.last && sc.photo.last.pg) {
    var pg = sc.photo.last.pg;
    if (pg.jo === HOLD || String(pg.filename || '').indexOf(HOLD + '-') === 0) {
      pg.jo = item.jo; pg.page = item.page; pg.filename = item.filename; pg.scan = item.scan;
    }
  }
}
function rollback(item) {
  var sc = scan();
  if (sc && sc.state && sc.state.jo === HOLD && sc.state.page > 0) {
    sc.state.page -= 1;
    var lab = document.getElementById('pageLabel');
    if (lab) lab.textContent = String(sc.state.page || 0);
  }
  if (sc && sc.photo && sc.photo.last && sc.photo.last.pg && sc.photo.last.pg.jo === HOLD && (!item || sc.photo.last.pg.page === item.page || sc.state.page === 0)) {
    sc.photo.last = null;
  }
  var box = document.getElementById('lastScan');
  if (box && sc && sc.photo && !sc.photo.last) box.classList.add('hidden');
}
function cropJo(dataUrl) {
  var jo = null;
  state.zones.forEach(function (z) { if (z.id === 'jo') jo = z; });
  if (!jo) return Promise.resolve('');
  var src = String(dataUrl || '');
  if (src.indexOf('data:') !== 0) src = 'data:image/jpeg;base64,' + src;
  return loadImage(src).then(function (img) { return img ? cropFrom(img, jo) : ''; });
}
function readJo(b64) {
  return root.fetch(api(), {
    method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ op: 'readJo', token: token(), ocrBase64: b64 })
  }).then(function (res) { return res.json(); }).catch(function () { return { ok: false, error: 'offline' }; });
}
function askJo(opts) {
  opts = opts || {};
  ensureCss();
  return new Promise(function (resolve) {
    var old = document.getElementById('oypJoAsk');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var host = document.createElement('div');
    host.id = 'oypJoAsk';
    host.className = 'oz ozask';
    host.setAttribute('role', 'dialog');
    var guess = opts.jo && validJo(opts.jo) ? normJo(opts.jo) : '';
    host.innerHTML = '<form class="ozaskbox"><b>' + esc(opts.title || 'Type the JO number') + '</b><p>' + esc(opts.msg || 'Type the JO number to save this page.') + '</p>'
      + '<input data-ask="jo" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="26-001" value="' + esc(guess) + '">'
      + '<div class="ozaskrow"><button type="button" class="ozghost" data-ask="cancel">' + esc(opts.cancel || "Don't save") + '</button><button type="submit" class="ozsave">Use this number</button></div></form>';
    document.body.appendChild(host);
    var input = host.querySelector('[data-ask="jo"]');
    var done = function (jo) {
      if (host.parentNode) host.parentNode.removeChild(host);
      resolve(jo || '');
    };
    host.addEventListener('click', function (e) {
      if (e.target === host || (e.target.closest && e.target.closest('[data-ask="cancel"]'))) done('');
    });
    host.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = normJo(input.value);
      if (!validJo(n)) { input.classList.add('bad'); input.focus(); return; }
      done(n);
    });
    setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 30);
  });
}
function reasonMsg(r) {
  if (!r || r.ok === false) return 'The number could not be read from the card. Type it to save this page.';
  var found = r.found || [];
  if (found.length > 1) return 'The box shows more than one number. Type the right one to save this page.';
  if (!r.jo) return 'No JO number was read from the box. Type it to save this page.';
  return 'The number in the box is unclear. Type it to save this page.';
}
function resolveJo(item) {
  lastFromCard = false;
  lastImage = item.image || lastImage;
  lastThumb = item.thumb || lastThumb;
  say('Reading the JO number…');
  return cropJo(item.image).then(function (b64) {
    if (!b64) return askJo({ msg: 'No JO number box on this photo. Type the JO number to save this page.' });
    return readJo(b64).then(function (r) {
      if (r && r.ok && r.jo && validJo(r.jo) && !r.low) { lastFromCard = true; return normJo(r.jo); }
      return askJo({ jo: r && r.jo, msg: reasonMsg(r) });
    });
  });
}
function fileAs(item, jo) {
  renameItem(item, jo);
  syncState(item);
  fillJo(jo);
  lastFiled = { id: '', jo: jo, page: item.page, filename: item.filename, scan: item.scan };
  return item;
}
function addCorrectBtn(box) {
  if (!box || !lastFiled || !lastFiled.jo || box.querySelector('[data-oyp-correct]')) return;
  var row = box.querySelector('.la') || box;
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'alt';
  b.setAttribute('data-oyp-correct', '1');
  b.textContent = 'Correct number';
  row.appendChild(b);
}
function refile(jo) {
  var sc = scan();
  var q = sc && sc.queue;
  if (!q || !lastImage) { say('Scan the page again under JO ' + jo + '.'); return Promise.resolve(null); }
  var prev = lastFiled || {};
  var it = prev.id && q.get ? q.get(prev.id) : null;
  if (it && (it.state === 'waiting' || it.state === 'failed' || !it.state) && q.remove) q.remove(it.id);
  else if (it && q.discard) q.discard(it.id);
  var page = (it && it.page) || prev.page || 1;
  var tagM = String(prev.filename || '').match(/-(\d{6}[a-z]?)\.jpe?g$/i);
  var tag = tagM ? tagM[1] : dateTag();
  var stamp = String(prev.scan || '').split('@')[1] || Date.now().toString(36);
  var item = { jo: jo, page: page, filename: jo + '-p' + page + '-' + tag + '.jpg', scan: jo + '@' + stamp, image: lastImage, thumb: lastThumb || '' };
  lastFiled = { id: '', jo: jo, page: page, filename: item.filename, scan: item.scan };
  if (sc.state) { sc.state.jo = jo; sc.state.scan = item.scan; }
  fillJo(jo);
  return Promise.resolve(q.add(item)).then(function (saved) {
    lastFiled.id = (saved && saved.id) || (jo + '|' + item.filename + '|' + item.scan);
    say('JO ' + jo + '.');
    addCorrectBtn(document.getElementById('lastScan'));
    return saved;
  });
}
function correct() {
  if (!lastFiled || !lastFiled.jo) return;
  askJo({ title: 'Correct the JO number', msg: 'This page will be filed as the number you type.', jo: lastFiled.jo, cancel: 'Cancel' }).then(function (jo) {
    if (!jo || jo === lastFiled.jo) return;
    refile(jo);
  });
}
function installQueue(sc) {
  var q = sc.queue;
  if (!q || !q.add || q.add.__oypOcr) return;
  var orig = q.add.bind(q);
  function wrapped(item) {
    if (!item || item.jo !== HOLD || !hasJo(state.zones)) return orig(item);
    var page = parseInt(item.page, 10) || 1;
    if (page === 1) ocrChain = resolveJo(item);
    else ocrChain = ocrChain.then(function (jo) { return jo || ''; });
    return ocrChain.then(function (jo) {
      if (!jo || !validJo(jo)) { rollback(item); if (page === 1) say('Page not saved.'); return null; }
      fileAs(item, jo);
      if (page === 1) say(lastFromCard ? ('JO ' + jo + ', from the card.') : ('JO ' + jo + '.'));
      return Promise.resolve(orig(item)).then(function (saved) {
        lastFiled.id = (saved && saved.id) || (item.jo + '|' + item.filename + '|' + item.scan);
        lastImage = item.image || lastImage;
        addCorrectBtn(document.getElementById('lastScan'));
        return saved;
      });
    });
  }
  wrapped.__oypOcr = true;
  q.add = wrapped;
}
function onScanClick(e) {
  if (!isScanner() || !hasJo(state.zones)) return;
  var t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#btnStart')) { clearHold(); return; }
  if (t.closest('#joInput')) { clearHold(); return; }
  var scanBtn = t.closest('#btnScanJO, #lnkGallery');
  if (!scanBtn) return;
  if (scanBtn.classList.contains('busy') || scanBtn.classList.contains('dis')) return;
  var n = normJo(joField() ? joField().value : '');
  if (n && n !== HOLD) return;
  holdOn();
}
function hookOcr() {
  if (typeof document === 'undefined' || !isScanner()) return;
  if (document.documentElement.getAttribute('data-oyp-ocr') === '1') return;
  document.documentElement.setAttribute('data-oyp-ocr', '1');
  document.addEventListener('click', onScanClick, true);
  var box = document.getElementById('lastScan');
  if (box && !box.__oypCorrect) {
    box.__oypCorrect = true;
    new MutationObserver(function () { addCorrectBtn(box); }).observe(box, { childList: true, subtree: true });
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-oyp-correct]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      correct();
    });
  }
  var n = 0;
  (function wait() {
    var sc = scan();
    if (sc && sc.queue && sc.queue.add) { installQueue(sc); syncStart(); return; }
    if (n++ < 50) setTimeout(wait, 120);
  })();
  root.addEventListener('oyp-zones-ready', syncStart);
}
function boot() {
  installFetch();
  if (typeof document === 'undefined') return;
  hookOcr();
  state.zones = readLocal();
  try { state.shared = localStorage.getItem(SHARED) === '1'; } catch (e) { state.shared = false; }
  ensureCss();
  syncStart();
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
