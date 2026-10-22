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
var HELP = 'oypScanInstruct';
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
/* The scanner (scan/app.js rotFor) applies EXIF once, then turns. Default "cw": a portrait page
   turns 90° clockwise and a landscape page stays. 180 is never skipped for a landscape page.
   none is always zero. ccw on a portrait page is three clockwise quarter-turns. Saved zones are
   normalized fractions of that frame, the same numbers cropFrom and cropZoneB64 apply. The editor
   opens on that same frame. Rotate adds clockwise steps on top; those are converted back before save. */
function scannerTurns(w, h) {
  w = Number(w) || 0; h = Number(h) || 0;
  var key = 'cw';
  try {
    var v = localStorage.getItem('oypScanRotate');
    if (v === 'cw' || v === 'ccw' || v === 'none' || v === '180') key = v;
  } catch (e) {}
  var rot = key === 'ccw' ? 3 : key === '180' ? 2 : key === 'none' ? 0 : 1;
  if ((key === 'cw' || key === 'ccw') && w > h) return 0;
  return rot;
}
function turnZone(zone, quarters) {
  var q = ((Number(quarters) || 0) % 4 + 4) % 4;
  var x = Number(zone && zone.x) || 0, y = Number(zone && zone.y) || 0;
  var w = Number(zone && zone.w) || 0, h = Number(zone && zone.h) || 0;
  var n = q === 1 ? { x: 1 - (y + h), y: x, w: h, h: w }
    : q === 2 ? { x: 1 - (x + w), y: 1 - (y + h), w: w, h: h }
    : q === 3 ? { x: y, y: 1 - (x + w), w: h, h: w }
    : { x: x, y: y, w: w, h: h };
  var o = { x: round4(n.x), y: round4(n.y), w: round4(n.w), h: round4(n.h) };
  if (zone && zone.id) o.id = zone.id;
  if (zone && zone.label) o.label = zone.label;
  return o;
}
function viewToStored(zone, viewTurns, scanTurns) {
  return turnZone(zone, ((Number(scanTurns) || 0) - (Number(viewTurns) || 0)));
}
function storedToView(zone, viewTurns, scanTurns) {
  return turnZone(zone, ((Number(viewTurns) || 0) - (Number(scanTurns) || 0)));
}
/* EXIF is applied to the stored samples exactly once. The opening turn then matches rotFor on those upright pixels. */
function exifQuarterTurns(orientation) {
  var o = Number(orientation) || 1;
  if (o === 3 || o === 4) return 2;
  if (o === 6 || o === 5) return 1;
  if (o === 8 || o === 7) return 3;
  return 0;
}
function readToken(el) {
  try {
    if (!el || el.value == null) return '';
    return String(el.value).replace(/^\s+|\s+$/g, '');
  } catch (e) { return ''; }
}
/* Enter or leaving the field stores the token. Boxes, or a save that never left this phone, are sent again. */
function tokenEntryPlan(value, zones, last) {
  var tok = readToken({ value: value });
  var localOnly = !!(last && (last.local || last.reason === 'no-token'));
  var hasBoxes = !!(zones && zones.length);
  return { token: tok, status: tok ? 'Token saved.' : '', resave: !!tok && (localOnly || hasBoxes) };
}
/* Green: shared with every phone. Amber: on this phone only. Red: the save did not stick. Grey: not saved yet. */
function presentSave(res, zones, err) {
  if (err) return { tone: 'bad', text: 'Could not save these boxes. Try again.', button: 'Save zones' };
  var text = saveMessage(res, zones);
  if (res && res.shared) return { tone: 'ok', text: text, button: 'Saved ✓' };
  if (res && /bad token/i.test(String(res.reason || ''))) return { tone: 'bad', text: text, button: 'Saved on this phone' };
  if (res && (res.local || res.reason)) return { tone: 'local', text: text, button: 'Saved on this phone' };
  if (!res || res.ok === false) return { tone: 'bad', text: text || 'Could not save these boxes. Try again.', button: 'Save zones' };
  return { tone: 'local', text: text, button: 'Saved on this phone' };
}
/* Touch on empty card scrolls unless Draw box is on, or the finger has held still for HOLD_MS.
   A second finger is a pinch and must not draw. Mouse and pen still draw on the first drag. */
var HOLD_MS = 300;
var MOVE_PX = 8;
function gestureBegin(opts) {
  opts = opts || {};
  if ((Number(opts.pointers) || 1) > 1) return 'pinch';
  if (opts.hit === 'resize' || opts.hit === 'move') return opts.hit;
  if (opts.drawMode) return 'draw';
  if (opts.pointerType === 'mouse' || opts.pointerType === 'pen') return 'draw';
  return 'pending';
}
function gestureAdvance(mode, dist, heldMs) {
  if (mode !== 'pending') return mode;
  if (dist > MOVE_PX) return 'scroll';
  if (heldMs >= HOLD_MS) return 'draw';
  return 'pending';
}
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
function instructWanted() { try { return localStorage.getItem(HELP) === '1'; } catch (e) { return false; } }
function setInstruct(on) { try { localStorage.setItem(HELP, on ? '1' : '0'); } catch (e) {} }
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
function u16(bytes, i, le) { return le ? bytes[i] + (bytes[i + 1] << 8) : (bytes[i] << 8) + bytes[i + 1]; }
function u32(bytes, i, le) {
  return le ? (bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16) + (bytes[i + 3] * 16777216))
    : ((bytes[i] * 16777216) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3]);
}
function tiffOrientation(bytes, start, end) {
  if (start + 8 > end) return 0;
  var le = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
  if (!le && !(bytes[start] === 0x4d && bytes[start + 1] === 0x4d)) return 0;
  var off = u32(bytes, start + 4, le);
  var ifd = start + off;
  if (ifd + 2 > end) return 0;
  var n = u16(bytes, ifd, le), i;
  for (i = 0; i < n; i++) {
    var e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(bytes, e, le) === 0x0112) return u16(bytes, e + 8, le) || 1;
  }
  return 0;
}
function jpegOrientation(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  var i = 2;
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) break;
    var marker = bytes[i];
    if (marker === 0xd9 || marker === 0xda) break;
    if (i + 3 >= bytes.length) break;
    var len = (bytes[i + 1] << 8) + bytes[i + 2];
    if (len < 2 || i + 1 + len > bytes.length) break;
    if (marker === 0xe1 && len > 8 && bytes[i + 3] === 0x45 && bytes[i + 4] === 0x78 && bytes[i + 5] === 0x69 && bytes[i + 6] === 0x66) {
      var o = tiffOrientation(bytes, i + 9, i + 1 + len);
      if (o) return o;
    }
    i += 1 + len;
  }
  return 1;
}
/* Stored JPEG samples, before any orientation. SOF height is at marker+4, width at marker+6. */
function jpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  var i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) break;
    var marker = bytes[i];
    if (marker === 0xd9 || marker === 0xda) break;
    if (i + 3 >= bytes.length) break;
    var len = (bytes[i + 1] << 8) + bytes[i + 2];
    if (len < 2 || i + 1 + len > bytes.length) break;
    var sof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (sof && i + 7 < bytes.length) return { w: (bytes[i + 6] << 8) + bytes[i + 7], h: (bytes[i + 4] << 8) + bytes[i + 5] };
    i += 1 + len;
  }
  return null;
}
/* Tag still to draw. A swap tag (5–8) whose bitmap axes already differ from the stored samples
   was oriented by the decoder. Applying it again turns the card a second time. */
function exifTagForPixels(width, height, orient, raw) {
  orient = Number(orient) || 1;
  if (orient < 2 || orient > 8) return 1;
  var swap = orient > 4;
  if (swap && raw && raw.w && raw.h && ((raw.w > raw.h) !== (width > height))) return 1;
  return orient;
}
/* Canvas sized for the oriented result. Transformations match the EXIF orientation tag. */
function orientedCanvas(source, width, height, orient) {
  orient = Number(orient) || 1;
  var c = document.createElement('canvas');
  var swap = orient > 4 && orient < 9;
  c.width = swap ? height : width;
  c.height = swap ? width : height;
  var g = c.getContext('2d');
  if (orient === 2) g.transform(-1, 0, 0, 1, width, 0);
  else if (orient === 3) g.transform(-1, 0, 0, -1, width, height);
  else if (orient === 4) g.transform(1, 0, 0, -1, 0, height);
  else if (orient === 5) g.transform(0, 1, 1, 0, 0, 0);
  else if (orient === 6) g.transform(0, 1, -1, 0, height, 0);
  else if (orient === 7) g.transform(0, -1, -1, 0, height, width);
  else if (orient === 8) g.transform(0, -1, 1, 0, 0, width);
  g.drawImage(source, 0, 0, width, height);
  return c;
}
function canvasToImage(c) {
  try { return loadImage(c.toDataURL('image/jpeg', 0.92)); }
  catch (e) { return Promise.resolve(null); }
}
/* EXIF exactly once (HEIC irot is applied by libheif display, and is not applied again).
   imageOrientation "none" keeps the stored samples so the tag is drawn here. If that option
   is ignored, a swap tag whose axes already moved is not drawn a second time. The from-image
   fallback trusts the browser for a 180° or mirror tag, which the size cannot reveal. */
function fileToOrientedImage(file) {
  if (isHeic(file)) return heicToJpegUrl(file).then(loadImage);
  if (typeof createImageBitmap !== 'function' || !file.arrayBuffer) return readDataUrl(file).then(loadImage);
  return file.arrayBuffer().then(function (buf) {
    var bytes = new Uint8Array(buf);
    var orient = jpegOrientation(bytes);
    var raw = jpegSize(bytes);
    var blob = new Blob([buf], { type: file.type || 'image/jpeg' });
    function finish(bitmap, fromImage) {
      var w = bitmap.width, h = bitmap.height;
      var tag = exifTagForPixels(w, h, orient, raw);
      if (fromImage && !(orient > 4 && orient < 9)) tag = 1;
      var c;
      if (tag === 1) {
        c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(bitmap, 0, 0);
      } else c = orientedCanvas(bitmap, w, h, tag);
      if (bitmap.close) bitmap.close();
      return canvasToImage(c);
    }
    return createImageBitmap(blob, { imageOrientation: 'none' }).then(function (bitmap) {
      return finish(bitmap, false);
    }, function () {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bitmap) {
        return finish(bitmap, true);
      }, function () { return readDataUrl(file).then(loadImage); });
    });
  });
}
/* The scanner crops to the card before cropFrom. PAGE_PX is scan/app.js MAX_PX. Crop off
   (oypScanCrop === '0') leaves the whole photo, which is also what a scan does then. */
var PAGE_PX = 1600;
var FINDING = 'Finding card edges…';
var NO_EDGES = 'Card edges not found. Boxes will be placed on the whole photo. Try a photo with all 4 card edges visible.';
var CV_URLS = ['https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js', 'https://docs.opencv.org/4.9.0/opencv.js'];
var cvReady = null;
var detectorP = null;
function cropWanted() {
  try { return localStorage.getItem('oypScanCrop') !== '0'; } catch (e) { return true; }
}
function loadCV() {
  if (root.cv && root.cv.Mat) return Promise.resolve(root.cv);
  if (cvReady) return cvReady;
  cvReady = new Promise(function (resolve, reject) {
    var i = 0;
    function tryNext() {
      if (i >= CV_URLS.length) { cvReady = null; reject(new Error('detector failed to load')); return; }
      var sc = document.createElement('script');
      sc.async = true;
      sc.src = CV_URLS[i++];
      function done(m) {
        try { delete m.then; } catch (e) {}
        if (typeof m.then === 'function') m.then = undefined;
        root.cv = m;
        resolve(m);
      }
      sc.onload = function () {
        var c = root.cv;
        if (!c) return tryNext();
        if (c.Mat) return done(c);
        if (typeof c.then === 'function') return c.then(done);
        c.onRuntimeInitialized = function () { done(root.cv); };
      };
      sc.onerror = function () { sc.remove(); tryNext(); };
      (document.head || document.documentElement).appendChild(sc);
    }
    tryNext();
  });
  return cvReady;
}
function detectorUrl() {
  var tags = document.getElementsByTagName('script'), i, src;
  for (i = tags.length - 1; i >= 0; i--) {
    src = tags[i].src || '';
    if (/scan-zones\.js/.test(src)) return src.replace(/scan-zones\.js(\?.*)?$/, 'scan/detector.js?v=20261022k');
  }
  return 'scan/detector.js?v=20261022k';
}
function loadDetector() {
  if (root.CardDetector && root.CardDetector.standardPage && root.CardDetector.warpQuad && root.CardDetector.fitStandard) return Promise.resolve(root.CardDetector);
  if (detectorP) return detectorP;
  detectorP = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = detectorUrl();
    s.onload = function () {
      if (root.CardDetector && root.CardDetector.standardPage) resolve(root.CardDetector);
      else { detectorP = null; reject(new Error('detector')); }
    };
    s.onerror = function () { detectorP = null; reject(new Error('detector')); };
    (document.head || document.documentElement).appendChild(s);
  });
  return detectorP;
}
function scaleToMax(source, maxPx) {
  var w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
  var s = Math.min(1, maxPx / Math.max(w, h));
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}
function detectQuadOn(cv, canvas) {
  var DW = 480, vw = canvas.width, vh = canvas.height;
  if (!vw || !vh) return null;
  var sc = DW / Math.max(vw, vh);
  var work = document.createElement('canvas');
  work.width = Math.max(1, Math.round(vw * sc));
  work.height = Math.max(1, Math.round(vh * sc));
  work.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, 0, work.width, work.height);
  var m = cv.imread(work);
  try {
    var r = root.CardDetector.detectQuad(cv, m, { size: DW });
    return r ? r.quad : null;
  } finally { m.delete(); }
}
function rotateTurns(c, turns) {
  turns = ((Number(turns) || 0) % 4 + 4) % 4;
  if (!turns) return c;
  var o = document.createElement('canvas');
  var side = turns % 2 === 1;
  o.width = side ? c.height : c.width;
  o.height = side ? c.width : c.height;
  var g = o.getContext('2d');
  g.translate(o.width / 2, o.height / 2);
  g.rotate(turns * Math.PI / 2);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}
/* EXIF image in, scanner frame out: detect, refine, warp, deskew, the scanner turn, then the
   fixed page size. Null when the card edges are not found. */
function cardPage(im) {
  return Promise.all([loadCV(), loadDetector()]).then(function () {
    var cv = root.cv;
    if (!cv || !cv.Mat || !root.CardDetector) return null;
    var src = scaleToMax(im, PAGE_PX);
    var q = null;
    try { q = detectQuadOn(cv, src); } catch (e) { return null; }
    if (!q) return null;
    try {
      var rm = cv.imread(src);
      q = root.CardDetector.refineQuad(cv, rm, root.CardDetector.order(q));
      rm.delete();
    } catch (e) { q = root.CardDetector.order(q); }
    q = root.CardDetector.order(q);
    var warped;
    try {
      var srcMat = cv.imread(src);
      var warpedMat = root.CardDetector.warpQuad(cv, srcMat, q, PAGE_PX);
      warped = document.createElement('canvas');
      cv.imshow(warped, warpedMat);
      srcMat.delete(); warpedMat.delete();
    } catch (e2) { return null; }
    try {
      var dm = cv.imread(warped);
      var d = root.CardDetector.deskew(cv, dm);
      cv.imshow(warped, d.mat);
      dm.delete(); d.mat.delete();
    } catch (e3) {}
    var turned = rotateTurns(warped, scannerTurns(warped.width, warped.height));
    return canvasToImage(root.CardDetector.fitStandard(turned, PAGE_PX));
  }).catch(function () { return null; });
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
function zoneOnScan(zone) {
  var extra = root.__oypZoneExtra || 0;
  if (!zone || !extra) return zone;
  return turnZone(zone, extra);
}
function crops(b64, zones) {
  var jo = null, fields = [];
  (zones || []).forEach(function (z) {
    var u = zoneOnScan(z);
    if (u.id === 'jo') jo = u; else fields.push(u);
  });
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
    '.ozbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;column-gap:calc(8px * var(--sp, 1));margin-bottom:calc(8px * var(--sp, 1))}',
    '.ozbar [data-z="close"]{grid-column:1;justify-self:start;min-width:0}',
    '.ozbar [data-z="save"]{grid-column:3;justify-self:end;min-width:0}',
    '.ozbar b{grid-column:2;justify-self:center;text-align:center;font-family:"Libre Bodoni",Didot,serif;font-weight:500;font-size:calc(22px * var(--fs, 1));white-space:nowrap}',
    '@media (max-width:480px){.ozbar b{font-size:calc(18px * var(--fs, 1))}.ozbar .ozghost,.ozbar .ozsave{height:calc(34px * var(--sp, 1));min-height:calc(34px * var(--sp, 1));padding:0 calc(10px * var(--sp, 1));letter-spacing:.04em}}',
    '.ozhelp{margin:0 0 calc(4px * var(--sp, 1));max-width:720px}',
    '.ozhelp summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:calc(8px * var(--sp, 1));width:100%;min-height:calc(34px * var(--sp, 1));margin:0;padding:0;font:500 calc(12px * var(--fs, 1))/1 Inter,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#111}',
    '.ozhelp summary::-webkit-details-marker,.ozhelp summary::marker{display:none;content:""}',
    '.ozhelp summary::before{content:"\\203A";display:inline-block;width:1em;font-size:calc(18px * var(--fs, 1));line-height:1;letter-spacing:0;text-align:center;transition:transform .15s}',
    '.ozhelp[open] summary::before{transform:rotate(90deg)}',
    '.ozhelp[open]{margin-bottom:calc(8px * var(--sp, 1))}',
    '.oznote{font-size:calc(14px * var(--fs, 1));line-height:1.35;color:#444;max-width:720px;margin:0 0 calc(8px * var(--sp, 1));padding:0 0 0 1.15em;list-style:disc}',
    '.oznote li{margin:0;padding:0}',
    '.oztools{display:flex;flex-wrap:wrap;gap:calc(8px * var(--sp, 1));margin:0 0 calc(12px * var(--sp, 1))}',
    '.oztools button,.ozfile,.ozcustom{border:1px solid #ddd;background:#fff;border-radius:999px;padding:calc(8px * var(--sp, 1)) calc(12px * var(--sp, 1));font:500 calc(12px * var(--fs, 1))/1.2 Inter,Helvetica,sans-serif;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;color:#111}',
    '.ozfile{height:calc(34px * var(--sp, 1));display:inline-flex;align-items:center;justify-content:center;padding:0 calc(12px * var(--sp, 1));box-sizing:border-box}',
    '.ozcustom{display:inline-flex;align-items:center;gap:6px;cursor:text}',
    '.ozcustom input{text-transform:none;letter-spacing:0;font:15px Inter,Helvetica,sans-serif;border:0;padding:0;width:7.5em;background:transparent;color:#111}',
    '.oztools button.on{border-color:#d4af37;background:#faf8f1}',
    '.ozpick{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    '.ozsave,.ozghost{border-radius:999px;padding:0 calc(16px * var(--sp, 1));min-height:calc(34px * var(--sp, 1));font:500 calc(12px * var(--fs, 1))/1 Inter,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
    '.ozsave{background:#111;color:#fff;border:0;white-space:nowrap}',
    '.ozsave:disabled{opacity:.45}',
    '.ozghost{background:#fff;color:#111;border:1px solid #ddd}',
    '.ozstage{position:relative;max-width:720px;border:1px solid #eee;border-radius:14px;overflow:hidden;background:#f6f4ee;touch-action:pan-y pinch-zoom}',
    '.ozstage canvas{width:100%;height:auto;display:block;touch-action:pan-y pinch-zoom;cursor:default;user-select:none;-webkit-user-select:none}',
    '.ozstage.ozdraw canvas,.ozstage.ozarm canvas{touch-action:pinch-zoom;cursor:crosshair}',
    '.ozstage:not(.ozhas) canvas{cursor:pointer}',
    '.ozstage.ozhot{box-shadow:inset 0 0 0 2px #d4af37}',
    '.ozupload{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1}',
    '.ozupload:active,.ozupload.is-down{transform:translate(-50%,-50%) scale(.97)}',
    '@media (prefers-reduced-motion:reduce){.ozupload:active,.ozupload.is-down{transform:translate(-50%,-50%);opacity:.72}}',
    '.ozstage.ozhas .ozupload{display:none}',
    '.ozhits{position:absolute;inset:0;z-index:2;pointer-events:none}',
    '.ozboxhit,.ozhandlehit{position:absolute;pointer-events:auto;touch-action:none;background:transparent}',
    '.ozhandlehit{width:calc(24px * var(--sp, 1));height:calc(24px * var(--sp, 1));transform:translate(-50%,-50%);border-radius:50%}',
    '.ozlist{list-style:none;padding:0;margin:12px 0;max-width:720px}',
    '.ozlist li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 4px;border-bottom:1px solid #f1f1f1;font-size:14px}',
    '.ozlist li.on{background:#faf8f1}',
    '.ozlist button,.ozlink{background:none;border:0;padding:0;text-decoration:underline;cursor:pointer;font:500 11px Inter,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#111}',
    '.ozrow{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:8px}',
    '.ozstatus{display:flex;align-items:flex-start;gap:calc(8px * var(--sp, 1));max-width:720px;min-height:1.2em;margin:0 0 calc(12px * var(--sp, 1));font:500 calc(13px * var(--fs, 1))/1.35 Inter,Helvetica,sans-serif;color:#333}',
    '.ozdot{width:calc(8px * var(--sp, 1));height:calc(8px * var(--sp, 1));border-radius:50%;margin-top:.35em;flex:0 0 auto;background:#8a8a8a}',
    '.ozstatus[data-tone="ok"] .ozdot{background:#1f7a4d}',
    '.ozstatus[data-tone="local"] .ozdot{background:#c4922a}',
    '.ozstatus[data-tone="bad"] .ozdot{background:#b42318}',
    '.ozstatus[data-tone="dirty"] .ozdot{background:#8a8a8a}',
    '.oztok{display:flex;flex-direction:column;gap:4px;margin:0 0 calc(12px * var(--sp, 1));max-width:360px;font:500 calc(12px * var(--fs, 1))/1.2 Inter,Helvetica,sans-serif;letter-spacing:.06em;text-transform:uppercase}',
    '.oztok input{text-transform:none;letter-spacing:0;font:calc(15px * var(--fs, 1)) Inter,Helvetica,sans-serif;padding:calc(8px * var(--sp, 1)) calc(10px * var(--sp, 1));border:1px solid #ddd;border-radius:10px}',
    '.oztok.ozneed input{border-color:#c4922a;box-shadow:0 0 0 3px rgba(196,146,42,.28)}',
    '.oztokchange{margin:0 0 calc(12px * var(--sp, 1));text-transform:none;letter-spacing:0;font:500 calc(13px * var(--fs, 1))/1.3 Inter,Helvetica,sans-serif;text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;color:#111}',
    '.oztokchange[hidden]{display:none}',
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
  var path = location.pathname || '';
  if (/jo-scanner/.test(path) || /(^|\/)scan(\/|$)/.test(path)) return true;
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
    var logout = menu.querySelector('[data-m="logout"]');
    if (settings) menu.insertBefore(a, settings);
    else if (logout) menu.insertBefore(a, logout);
    else menu.appendChild(a);
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
  var viewTurns = 1;
  var scanT = 0;
  var drawMode = false;
  var kind = 'jo';
  var selected = zones.findIndex(function (z) { return z.id === 'jo'; });
  var gesture = null;
  var pointers = {};
  var pinching = false;
  var holdTimer = null;
  var saveTimer = null;
  var dirty = false;
  var onKey = null;
  var paintWait = false;
  host.className = 'oz ' + (pop ? 'oz-pop' : 'oz-inline');
  host.innerHTML = (pop
    ? '<div class="ozbar"><button type="button" class="ozghost" data-z="close">Close</button><b>JO card zones</b><button type="button" class="ozsave" data-z="save">Save zones</button></div>'
    : '<div class="ozbar"><b>JO card zones</b><button type="button" class="ozsave" data-z="save">Save zones</button></div>')
    + '<p class="ozstatus" data-tone="dirty" aria-live="polite"><i class="ozdot" aria-hidden="true"></i><span class="ozmsg"></span></p>'
    + '<label class="oztok">Scanner token<input type="password" data-z="token" autocomplete="off" spellcheck="false"></label>'
    + '<button type="button" class="oztokchange" data-z="changetoken" hidden>Change token</button>'
    + '<details class="ozhelp"><summary>Instructions</summary><ul class="oznote">'
    + '<li>Pick a label, then draw its box on the sample photo.</li>'
    + '<li>Labels: JO number, date due, date given, client, phone, item, metal, karat, size, stone, weight, price, notes, or type your own.</li>'
    + '<li>Page 1 reads the JO number only from the JO number box. Other boxes are read under their own label.</li>'
    + '<li>Later pages of the card are read in full.</li>'
    + '<li>Tap Draw box, or press and hold, to add a box.</li>'
    + '<li>Drag a box to move it. Drag its corner to resize it.</li>'
    + '<li>Drawing a label again replaces its box.</li>'
    + '<li>Vertical photos turn upright on their own. Rotate turns it again.</li>'
    + '<li>The photo is trimmed to the card\'s edges, the same as a scan.</li>'
    + '<li>Swipe on the card to scroll the page.</li>'
    + '</ul></details>'
    + '<div class="oztools">' + FIELDS.map(function (f) { return '<button type="button" data-kind="' + f[0] + '"' + (f[0] === 'jo' ? ' class="on"' : '') + '>' + esc(f[1]) + '</button>'; }).join('')
    + '<button type="button" data-kind="x">Other label</button><label class="ozcustom">Label <input data-z="custom" maxlength="24" placeholder="Repair" aria-label="Label for another box"></label>'
    + '<button type="button" class="ozfile" data-z="rot" hidden aria-label="Rotate 90 degrees clockwise">Rotate</button>'
    + '<button type="button" class="ozfile" data-z="draw" hidden aria-pressed="false">Draw box</button>'
    + '<button type="button" class="ozfile" data-z="change" hidden>Change photo</button>'
    + '<input class="ozpick" data-z="file" type="file" accept="image/*,.heic,.heif" tabindex="-1" aria-hidden="true"></div>'
    + '<div class="ozstage"><canvas aria-label="Drop a JO card photo here, or click to upload."></canvas>'
    + '<div class="ozhits" hidden></div>'
    + '<button type="button" class="ozsave ozupload" data-z="upload">Upload photo</button></div>'
    + '<ul class="ozlist"></ul>'
    + '<div class="ozrow"><button type="button" class="ozlink" data-z="clear">Clear boxes</button></div>';
  var canvas = host.querySelector('canvas');
  var stage = host.querySelector('.ozstage');
  var hits = host.querySelector('.ozhits');
  var uploadBtn = host.querySelector('[data-z="upload"]');
  var changeBtn = host.querySelector('[data-z="change"]');
  var rotBtn = host.querySelector('[data-z="rot"]');
  var drawBtn = host.querySelector('[data-z="draw"]');
  var list = host.querySelector('.ozlist');
  var status = host.querySelector('.ozstatus');
  var msgEl = host.querySelector('.ozmsg');
  var tok = host.querySelector('[data-z="token"]');
  var tokLab = host.querySelector('.oztok');
  var changeTok = host.querySelector('[data-z="changetoken"]');
  var help = host.querySelector('.ozhelp');
  if (help) {
    help.open = instructWanted();
    help.addEventListener('toggle', function () { setInstruct(help.open); });
  }
  var lastSave = null;
  var appliedToken = token();
  var saveFlight = false;
  function copyZone(z) { return { id: z.id, label: z.label, x: z.x, y: z.y, w: z.w, h: z.h }; }
  function showToken() {
    if (!tok || !tokLab) return;
    var has = !!token();
    try { tok.value = has ? token() : ''; } catch (e) {}
    var hide = has && isScanner();
    tokLab.style.display = hide ? 'none' : '';
    if (changeTok) changeTok.hidden = !hide;
    if (has && !isScanner() && tokLab.firstChild) tokLab.firstChild.textContent = 'Scanner token (already on this computer) ';
  }
  showToken();
  function setStatus(text, tone) {
    if (!status) return;
    status.setAttribute('data-tone', tone || 'dirty');
    if (msgEl) msgEl.textContent = text || '';
  }
  if (hasJo(zones) && state.shared) setStatus('These boxes are already shared with every phone.', 'ok');
  else if (hasJo(zones)) setStatus('A JO box is saved on this phone. Save again after the Code.gs paste to share it.', 'local');
  else setStatus('No JO box yet. Scans read the whole card.', 'dirty');

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
  function screenScale() {
    var cssW = canvas.clientWidth || stage.clientWidth;
    if (!cssW) cssW = Math.min(720, ((root.innerWidth || 390) - 32));
    var fs = 1, sp = 1;
    try {
      var cs = getComputedStyle(host);
      var fsv = parseFloat(cs.getPropertyValue('--fs'));
      var spv = parseFloat(cs.getPropertyValue('--sp'));
      if (isFinite(fsv) && fsv > 0) fs = fsv;
      if (isFinite(spv) && spv > 0) sp = spv;
    } catch (e) {}
    return { px: (canvas.width || 1) / cssW, fs: fs, sp: sp };
  }
  function screenPx(n, kind) {
    var s = screenScale();
    return n * s.px * (kind === 'fs' ? s.fs : s.sp);
  }
  function fillRound(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fill();
  }
  function layoutHits() {
    if (!hits) return;
    if (!img) { hits.innerHTML = ''; hits.hidden = true; return; }
    hits.hidden = false;
    hits.innerHTML = zones.map(function (z, i) {
      var v = storedToView(z, viewTurns, scanT);
      var box = '<div class="ozboxhit" data-hit="move" data-i="' + i + '" style="left:' + (v.x * 100) + '%;top:' + (v.y * 100) + '%;width:' + (v.w * 100) + '%;height:' + (v.h * 100) + '%"></div>';
      var handle = '<div class="ozhandlehit" data-hit="resize" data-i="' + i + '" style="left:' + ((v.x + v.w) * 100) + '%;top:' + ((v.y + v.h) * 100) + '%"></div>';
      return box + handle;
    }).join('');
  }
  function paint() {
    var sw = img ? (img.naturalWidth || img.width) : 600;
    var sh = img ? (img.naturalHeight || img.height) : 400;
    var turns = img ? viewTurns : 0;
    var side = turns % 2;
    var W = side ? sh : sw;
    var H = side ? sw : sh;
    canvas.width = W; canvas.height = H;
    var g = canvas.getContext('2d');
    if (img) {
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(turns * Math.PI / 2);
      g.drawImage(img, -sw / 2, -sh / 2);
      g.restore();
    } else {
      g.fillStyle = '#f6f4ee';
      g.fillRect(0, 0, W, H);
    }
    var showTurns = img ? viewTurns : 0;
    var showScan = img ? scanT : 0;
    zones.forEach(function (z, i) {
      var v = storedToView(z, showTurns, showScan);
      var x = v.x * W, y = v.y * H, w = v.w * W, h = v.h * H, col = color(z.id);
      g.fillStyle = i === selected ? 'rgba(212,175,55,.18)' : 'rgba(255,255,255,.08)';
      g.fillRect(x, y, w, h);
      g.lineWidth = Math.max(2, Math.round(W / 280));
      g.strokeStyle = col;
      g.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
      var fontPx = Math.max(8, screenPx(12, 'fs'));
      var padX = screenPx(4, 'sp');
      var padY = screenPx(2, 'sp');
      var gap = screenPx(4, 'sp');
      var radius = screenPx(4, 'sp');
      g.font = '500 ' + fontPx + 'px Inter, Helvetica, sans-serif';
      var text = z.label;
      var tw = g.measureText(text).width;
      var tagW = tw + padX * 2;
      var tagH = fontPx + padY * 2;
      var tx = x;
      var ty = y - gap - tagH;
      if (ty < 0) ty = y + h + gap;
      if (tx + tagW > W) tx = Math.max(0, W - tagW);
      if (tx < 0) tx = 0;
      g.fillStyle = col;
      fillRound(g, tx, ty, tagW, tagH, radius);
      g.fillStyle = '#fff';
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillText(text, tx + padX, ty + tagH / 2);
      g.textBaseline = 'alphabetic';
      var hr = Math.max(2, screenPx(11, 'sp') / 2);
      g.beginPath();
      g.arc(x + w, y + h, hr, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.lineWidth = Math.max(1, screenPx(1.5, 'sp'));
      g.strokeStyle = '#fff';
      g.stroke();
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
    stage.classList.toggle('ozdraw', !!drawMode);
    if (changeBtn) changeBtn.hidden = !img;
    if (rotBtn) rotBtn.hidden = !img;
    if (drawBtn) drawBtn.hidden = !img;
    canvas.setAttribute('aria-label', img ? 'Sample JO card. A finger drag on empty card scrolls. Draw box, or press and hold, to add a box.' : 'Drop a JO card photo here, or click to upload.');
    layoutHits();
    if (img && !canvas.clientWidth && !paintWait) {
      paintWait = true;
      requestAnimationFrame(function () { paintWait = false; paint(); });
    }
  }
  function renderList() {
    list.innerHTML = zones.map(function (z, i) {
      return '<li class="' + (i === selected ? 'on' : '') + '" data-i="' + i + '"><span>' + esc(z.label) + '</span><button type="button" data-rm="' + i + '">Remove</button></li>';
    }).join('') || '<li><span>No boxes yet</span></li>';
    host.querySelectorAll('[data-kind]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-kind') === kind); });
  }
  function pointFrom(cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: clamp((cx - r.left) / (r.width || 1), 0, 1), y: clamp((cy - r.top) / (r.height || 1), 0, 1) };
  }
  function point(e) { return pointFrom(e.clientX, e.clientY); }
  function writeView(id, label, rect) {
    var stored = viewToStored({ id: id, label: label, x: rect.x, y: rect.y, w: rect.w, h: rect.h }, viewTurns, scanT);
    stored.id = id;
    stored.label = label;
    var i = zones.findIndex(function (q) { return q.id === id; });
    if (i >= 0) zones[i] = stored; else zones.push(stored);
    selected = zones.findIndex(function (q) { return q.id === id; });
  }
  function clearHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  }
  function releaseCapture(id) {
    try { if (stage.hasPointerCapture && stage.hasPointerCapture(id)) stage.releasePointerCapture(id); } catch (e) {}
  }
  function cancelGesture() {
    clearHold();
    if (!gesture) { stage.classList.remove('ozarm'); return; }
    releaseCapture(gesture.pointerId);
    if (gesture.mode === 'draw' && gesture.placed) {
      var i = zones.findIndex(function (z) { return z.id === gesture.id; });
      if (i >= 0) { if (gesture.prev) zones[i] = gesture.prev; else zones.splice(i, 1); }
      zones = cleanList(zones);
    } else if (gesture.origin && (gesture.mode === 'move' || gesture.mode === 'resize') && zones[gesture.i]) {
      zones[gesture.i] = gesture.origin;
    }
    gesture = null;
    stage.classList.remove('ozarm');
    paint();
    renderList();
  }
  function armPending() {
    if (!gesture || gesture.mode !== 'pending') return;
    var draw = idForDraw();
    if (draw.error) {
      setStatus(draw.error, 'dirty');
      clearHold();
      gesture = null;
      return;
    }
    var prev = null;
    zones.forEach(function (z) { if (z.id === draw.id) prev = copyZone(z); });
    gesture.mode = 'draw';
    gesture.id = draw.id;
    gesture.label = draw.label;
    gesture.prev = prev;
    gesture.placed = false;
    gesture.captured = true;
    stage.classList.add('ozarm');
    try { stage.setPointerCapture(gesture.pointerId); } catch (err) {}
  }
  function beginDraw(e, p) {
    var draw = idForDraw();
    if (draw.error) { setStatus(draw.error, 'dirty'); return; }
    var prev = null;
    zones.forEach(function (z) { if (z.id === draw.id) prev = copyZone(z); });
    gesture = { mode: 'draw', pointerId: e.pointerId, ax: p.x, ay: p.y, cx: e.clientX, cy: e.clientY, t0: Date.now(), id: draw.id, label: draw.label, prev: prev, placed: false, captured: false };
  }
  function beginAdjust(e, i, mode) {
    var z = zones[i];
    if (!z) return;
    var p = point(e);
    selected = i;
    gesture = { mode: mode, pointerId: e.pointerId, i: i, ax: p.x, ay: p.y, id: z.id, label: z.label, view: storedToView(z, viewTurns, scanT), origin: copyZone(z), captured: true };
    dirty = true;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
    paint();
    renderList();
  }
  function applyDrag(p) {
    if (!gesture) return;
    if (gesture.mode === 'draw') {
      if (Math.abs(p.x - gesture.ax) < 0.01 && Math.abs(p.y - gesture.ay) < 0.01) return;
      var x = Math.min(gesture.ax, p.x), y = Math.min(gesture.ay, p.y);
      writeView(gesture.id, gesture.label, { x: x, y: y, w: Math.abs(p.x - gesture.ax), h: Math.abs(p.y - gesture.ay) });
      gesture.placed = true;
      dirty = true;
    } else if (gesture.mode === 'move') {
      var vz = gesture.view;
      var nx = clamp(vz.x + (p.x - gesture.ax), 0, Math.max(0, 1 - vz.w));
      var ny = clamp(vz.y + (p.y - gesture.ay), 0, Math.max(0, 1 - vz.h));
      writeView(gesture.id, gesture.label, { x: nx, y: ny, w: vz.w, h: vz.h });
      dirty = true;
    } else if (gesture.mode === 'resize') {
      var rv = gesture.view;
      var w = clamp(p.x - rv.x, 0.02, Math.max(0.02, 1 - rv.x));
      var h = clamp(p.y - rv.y, 0.02, Math.max(0.02, 1 - rv.y));
      writeView(gesture.id, gesture.label, { x: rv.x, y: rv.y, w: w, h: h });
      dirty = true;
    }
  }
  function endDrag(e) {
    if (!gesture) return;
    if (e && e.pointerId !== gesture.pointerId) return;
    clearHold();
    releaseCapture(gesture.pointerId);
    var g = gesture;
    gesture = null;
    stage.classList.remove('ozarm');
    if (g.mode === 'pending' || g.mode === 'scroll' || g.mode === 'pinch') return;
    if (g.mode === 'draw') {
      var i = zones.findIndex(function (z) { return z.id === g.id; });
      if (g.placed && i >= 0) {
        var c = cleanZone(zones[i]);
        if (!c) { if (g.prev) zones[i] = g.prev; else zones.splice(i, 1); }
        else zones[i] = c;
      }
      zones = cleanList(zones);
      selected = zones.findIndex(function (z) { return z.id === g.id; });
      if (g.placed) setStatus('Unsaved changes.', 'dirty');
    } else if (g.mode === 'move' || g.mode === 'resize') {
      if (g.origin && zones[g.i]) {
        var c2 = cleanZone(zones[g.i]);
        if (c2) zones[g.i] = c2; else zones[g.i] = g.origin;
      }
      zones = cleanList(zones);
      selected = zones.findIndex(function (z) { return z.id === g.id; });
      setStatus('Unsaved changes.', 'dirty');
    }
    paint();
    renderList();
    host.dispatchEvent(new CustomEvent('oyp-zones-drawn', {
      bubbles: true,
      detail: zones.map(function (z) { return { id: z.id, label: z.label, x: z.x, y: z.y, w: z.w, h: z.h }; })
    }));
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
      setStatus(hasJo(zones) ? 'JO box still in place. Save to keep this.' : 'No JO box. Saving this makes scans read the whole card again.', 'dirty');
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
  var custom = host.querySelector('[data-z="custom"]');
  if (custom) custom.addEventListener('focus', function () { kind = 'x'; renderList(); });
  function commitToken() {
    var plan = tokenEntryPlan(tok ? tok.value : '', zones, lastSave);
    var changed = plan.token !== appliedToken;
    setToken(plan.token);
    appliedToken = plan.token;
    if (plan.token && tokLab) tokLab.classList.remove('ozneed');
    showToken();
    if (!plan.token) return;
    if (!changed && (saveFlight || (lastSave && lastSave.shared))) return;
    setStatus(plan.status, 'ok');
    if (!plan.resave || saveFlight) return;
    runSave({ keepStatus: true });
  }
  if (tok) {
    tok.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      commitToken();
    });
    tok.addEventListener('change', commitToken);
  }
  if (changeTok) changeTok.addEventListener('click', function () {
    if (tokLab) { tokLab.style.display = ''; tokLab.classList.remove('ozneed'); }
    changeTok.hidden = true;
    try { tok.focus(); tok.select(); } catch (e) {}
  });
  function focusToken() {
    if (!tokLab || !tok || !tok.isConnected) return;
    tokLab.classList.add('ozneed');
    tokLab.style.display = '';
    if (changeTok) changeTok.hidden = true;
    try { tok.focus(); tok.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
  }
  function finishSave(btn, res, err) {
    saveFlight = false;
    if (res) lastSave = res;
    if (!err) {
      zones = cleanList(state.zones);
      dirty = false;
    }
    var view = presentSave(res, zones, err);
    setStatus(view.text, view.tone);
    if (btn) {
      btn.disabled = false;
      btn.textContent = view.button;
      if (view.button !== 'Save zones') {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { if (btn.isConnected) btn.textContent = 'Save zones'; }, 2000);
      }
    }
    if (!readToken(host.querySelector('[data-z="token"]'))) focusToken();
    paint();
    renderList();
    syncStart();
    if (!err) host.dispatchEvent(new CustomEvent('oyp-zones-saved', { bubbles: true, detail: res }));
  }
  function runSave(opts) {
    opts = opts || {};
    if (saveFlight) return;
    saveFlight = true;
    var btn = host.querySelector('[data-z="save"]');
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      if (!opts.keepStatus) setStatus('Saving…', 'dirty');
      setToken(readToken(host.querySelector('[data-z="token"]')));
      appliedToken = token();
      Promise.resolve().then(function () { return saveZones(zones); }).then(function (res) {
        finishSave(btn, res, null);
      }, function (err) {
        finishSave(btn, null, err || new Error('save'));
      });
    } catch (err) {
      finishSave(btn, null, err);
    }
  }
  host.querySelector('[data-z="save"]').addEventListener('click', function () { runSave(); });
  host.querySelector('[data-z="clear"]').addEventListener('click', function () {
    if (!zones.length) return;
    if (!confirm('Clear the JO boxes?')) return;
    zones = []; selected = -1; dirty = true; paint(); renderList();
    setStatus('Boxes cleared here. Save to keep that.', 'dirty');
  });
  if (rotBtn) rotBtn.addEventListener('click', function () {
    viewTurns = (viewTurns + 1) % 4;
    paint();
  });
  if (drawBtn) drawBtn.addEventListener('click', function () {
    drawMode = !drawMode;
    stage.classList.toggle('ozdraw', drawMode);
    drawBtn.classList.toggle('on', drawMode);
    drawBtn.setAttribute('aria-pressed', drawMode ? 'true' : 'false');
  });
  var file = host.querySelector('[data-z="file"]');
  var photoSeq = 0;
  function openPicker() { file.click(); }
  function readPhoto(f) {
    if (!f) return;
    var seq = ++photoSeq;
    var heic = isHeic(f);
    var keepText = msgEl ? msgEl.textContent : '';
    var keepTone = status ? (status.getAttribute('data-tone') || 'dirty') : 'dirty';
    if (keepText === 'Opening photo…' || keepText === 'Could not open that photo.' || keepText === FINDING || keepText === NO_EDGES) keepText = '';
    if (heic) setStatus('Opening photo…', 'dirty');
    else if (cropWanted()) setStatus(FINDING, 'dirty');
    function showOriented(im) {
      img = im;
      viewTurns = scannerTurns(im.naturalWidth || im.width, im.naturalHeight || im.height);
      scanT = viewTurns;
      paint();
    }
    function finishPreview() {
      host.dispatchEvent(new CustomEvent('oyp-zones-preview', { bubbles: true }));
    }
    fileToOrientedImage(f).then(function (im) {
      if (seq !== photoSeq) return;
      if (!im) { setStatus('Could not open that photo.', 'bad'); return; }
      if (!cropWanted()) {
        showOriented(im);
        if (keepText) setStatus(keepText, keepTone);
        finishPreview();
        return;
      }
      setStatus(FINDING, 'dirty');
      cardPage(im).then(function (page) {
        if (seq !== photoSeq) return;
        if (!page) {
          showOriented(im);
          setStatus(NO_EDGES, 'local');
        } else {
          img = page;
          viewTurns = 0;
          scanT = 0;
          paint();
          if (keepText) setStatus(keepText, keepTone);
        }
        finishPreview();
      }, function () {
        if (seq !== photoSeq) return;
        showOriented(im);
        setStatus(NO_EDGES, 'local');
        finishPreview();
      });
    }, function () {
      if (seq !== photoSeq) return;
      setStatus('Could not open that photo.', 'bad');
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
  if (changeBtn) changeBtn.addEventListener('click', openPicker);
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
  function pointerCount() { return Object.keys(pointers).length; }
  stage.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pointerCount() > 1) { pinching = true; cancelGesture(); }
  }, true);
  stage.addEventListener('pointerup', function (e) { delete pointers[e.pointerId]; if (!pointerCount()) pinching = false; }, true);
  stage.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; if (!pointerCount()) pinching = false; }, true);
  canvas.addEventListener('pointerdown', function (e) {
    if (!img || pinching || pointerCount() > 1) return;
    var p = point(e);
    var mode = gestureBegin({ pointers: pointerCount() || 1, drawMode: drawMode, pointerType: e.pointerType || 'mouse' });
    if (mode === 'pinch') return;
    if (mode === 'draw') { beginDraw(e, p); return; }
    gesture = { mode: 'pending', pointerId: e.pointerId, ax: p.x, ay: p.y, cx: e.clientX, cy: e.clientY, t0: Date.now() };
    clearHold();
    holdTimer = setTimeout(function () { armPending(); }, HOLD_MS);
  });
  hits.addEventListener('pointerdown', function (e) {
    if (!img || pinching || pointerCount() > 1) return;
    var el = e.target.closest ? e.target.closest('[data-hit]') : null;
    if (!el) return;
    var mode = gestureBegin({ pointers: 1, hit: el.getAttribute('data-hit'), drawMode: drawMode, pointerType: e.pointerType || 'touch' });
    if (mode !== 'move' && mode !== 'resize') return;
    e.stopPropagation();
    beginAdjust(e, Number(el.getAttribute('data-i')), mode);
  });
  stage.addEventListener('pointermove', function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (!gesture || gesture.pointerId !== e.pointerId || pinching) return;
    if (gesture.mode === 'pending') {
      var dist = Math.hypot(e.clientX - gesture.cx, e.clientY - gesture.cy);
      var next = gestureAdvance(gesture.mode, dist, Date.now() - gesture.t0);
      if (next === 'scroll') {
        clearHold();
        gesture = null;
        stage.classList.remove('ozarm');
        return;
      }
      if (next === 'draw') armPending();
      if (!gesture || gesture.mode !== 'draw') return;
    }
    if (gesture.mode === 'draw' || gesture.mode === 'move' || gesture.mode === 'resize') {
      if (!gesture.captured) {
        try { stage.setPointerCapture(gesture.pointerId); } catch (err) {}
        gesture.captured = true;
      }
      e.preventDefault();
      applyDrag(point(e));
      paint();
    }
  });
  stage.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) { pinching = true; cancelGesture(); return; }
    if (gesture && gesture.mode === 'pending' && e.touches && e.touches[0]) {
      var t = e.touches[0];
      var dist = Math.hypot(t.clientX - gesture.cx, t.clientY - gesture.cy);
      if (gestureAdvance('pending', dist, Date.now() - gesture.t0) === 'scroll') {
        clearHold();
        gesture = null;
        stage.classList.remove('ozarm');
      }
      return;
    }
    if (!gesture) return;
    if (gesture.mode === 'draw' || gesture.mode === 'move' || gesture.mode === 'resize') e.preventDefault();
  }, { passive: false });
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  function close() {
    if (dirty && !confirm('Close without saving these boxes?')) return;
    clearHold();
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
  var t = String(s || '').toUpperCase().replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-').replace(/O/g, '0');
  var m = t.match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})(?:\s?([A-Z])(?![A-Z0-9]))?/);
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
    if (pg.held || pg.jo === HOLD || String(pg.filename || '').indexOf(HOLD + '-') === 0) {
      pg.jo = item.jo; pg.page = item.page; pg.filename = item.filename; pg.scan = item.scan; pg.held = false;
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
  state.zones.forEach(function (z) { if (z.id === 'jo') jo = zoneOnScan(z); });
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
function uprightCrop(b64) {
  var sc = scan();
  if (!b64 || !sc || typeof sc.uprightCrop !== 'function') return Promise.resolve(b64);
  return Promise.resolve(sc.uprightCrop(b64)).then(function (url) {
    if (!url) return b64;
    var i = String(url).indexOf(',');
    return i >= 0 ? String(url).slice(i + 1) : url;
  }).catch(function () { return b64; });
}
function handGuess(b64) {
  var sc = scan();
  if (!b64 || !sc || typeof sc.handReadJo !== 'function') return Promise.resolve('');
  return Promise.resolve(sc.handReadJo(b64)).catch(function () { return ''; });
}
function readZoneLocal(item) {
  return cropJo(item.image).then(function (b64) {
    if (!b64) return '';
    if (!item.joCrop) item.joCrop = 'data:image/jpeg;base64,' + b64;
    return handGuess(b64).then(function (g) {
      var sc = scan();
      var jo = sc && typeof sc.lookupJo === 'function' ? sc.lookupJo(g) : normJo(g);
      if (jo && validJo(jo)) { lastFromCard = true; return normJo(jo); }
      var guess = sc && typeof sc.currentGuess === 'function' ? sc.currentGuess() : '';
      item.joGuess = (guess && String(guess).trim()) || (g && String(g).trim()) || '';
      return '';
    });
  });
}
function resolveJo(item) {
  lastFromCard = false;
  lastImage = item.image || lastImage;
  lastThumb = item.thumb || lastThumb;
  var sc = scan();
  var pending = sc && sc.earlyRead;
  if (pending && typeof pending.then === 'function') {
    return Promise.resolve(pending).then(function (jo) {
      if (jo && validJo(jo)) { lastFromCard = true; return normJo(jo); }
      var guess = sc && typeof sc.currentGuess === 'function' ? sc.currentGuess() : '';
      if (guess) item.joGuess = String(guess).trim();
      return '';
    });
  }
  return readZoneLocal(item);
}
/* One filing for a JO that was just accepted. The toast, the page tile, the gold line,
   and the needs-JO counter are all read from this record, in that same turn. */
function joFiling(item, jo, fromCard) {
  item = item || {};
  jo = normJo(jo);
  var ok = validJo(jo);
  var named = { filename: item.filename, scan: item.scan, page: item.page, jo: item.jo };
  if (ok) renameItem(named, jo);
  return {
    jo: ok ? named.jo : '',
    page: named.page,
    filename: named.filename || '',
    scan: named.scan || '',
    prevScan: item.scan || '',
    clientId: item.clientId || '',
    held: !ok,
    queueState: ok ? 'waiting' : 'needsjo',
    fromCard: !!(fromCard && ok),
    toast: ok ? (fromCard ? ('JO ' + jo + ', from the card.') : ('JO ' + jo + '.')) : ''
  };
}
function stampOf(scan) {
  var s = String(scan || ''), i = s.indexOf('@');
  return i >= 0 ? s.slice(i + 1) : '';
}
function cardAccepted(snap) {
  var toast = String(snap && snap.toast || '');
  var m = toast.match(/^JO (\d{2}-\d{3,4}[A-Z]?), from the card\.$/);
  var jo = validJo(snap && snap.jo) ? normJo(snap.jo) : (m ? m[1] : '');
  if (!(jo && (snap.fromCard || m))) return '';
  return jo;
}
function knownJo(snap) {
  var from = cardAccepted(snap);
  if (from) return from;
  if (validJo(snap && snap.jo)) return normJo(snap.jo);
  var typed = String(snap && snap.toast || '').match(/^JO (\d{2}-\d{3,4}[A-Z]?)\.$/);
  return typed ? typed[1] : '';
}
/* Tile, gold line, and counter for the capture screen. A from-the-card toast is part of
   the same record, so the readout cannot still say reading or needs-JO. */
function joStatus(snap) {
  snap = snap || {};
  var toast = String(snap.toast || '');
  var jo = knownJo(snap);
  var accepted = !!jo;
  var pages = (snap.pages || []).map(function (p) { return Object.assign({}, p); });
  var rows = (snap.rows || []).map(function (r) { return Object.assign({}, r); });
  if (accepted) {
    pages.forEach(function (p) {
      var mine = (snap.clientId && p.clientId === snap.clientId) || p.page === snap.page;
      if (!(p.held || p.jo === HOLD || mine)) return;
      if (p.held || p.jo === HOLD) { p.held = false; if (!validJo(p.jo)) p.jo = jo; }
      if (mine) {
        p.held = false; p.jo = jo;
        if (snap.scan) p.scan = snap.scan;
        if (snap.filename) p.filename = snap.filename;
      } else if (snap.scan && (p.scan === snap.prevScan || p.jo === jo)) p.scan = snap.scan;
    });
    var stamp = stampOf(snap.scan) || stampOf(snap.prevScan);
    rows.forEach(function (r) {
      var mine = r.state === 'needsjo' && ((snap.clientId && r.clientId === snap.clientId) || r.scan === snap.prevScan || (stamp && stampOf(r.scan) === stamp) || (r.scan === snap.scan && (r.jo === HOLD || r.jo === jo)));
      if (!mine) return;
      r.state = 'waiting'; r.jo = jo; r.held = false;
      if (snap.scan) r.scan = snap.scan;
      if (snap.filename && (r.page === snap.page || (snap.clientId && r.clientId === snap.clientId))) r.filename = snap.filename;
    });
    var covered = function (p) {
      return rows.some(function (r) {
        return (p.clientId && r.clientId === p.clientId) || (r.scan && r.scan === p.scan && r.filename === p.filename) || (r.scan && r.scan === p.scan && r.page === p.page);
      });
    };
    pages.forEach(function (p) {
      if (p.held || covered(p)) return;
      rows.push({ state: 'waiting', jo: p.jo || jo, page: p.page, filename: p.filename, scan: p.scan, clientId: p.clientId || '' });
    });
  }
  var online = snap.online !== false;
  var asking = !!snap.asking && !accepted;
  var reading = !!snap.reading && !jo;
  var saving = !!snap.saving;
  function matchRow(pg) {
    var i, x;
    for (i = 0; i < rows.length; i++) { x = rows[i]; if (x.scan === pg.scan && x.filename === pg.filename) return x; }
    for (i = 0; i < rows.length; i++) { x = rows[i]; if (pg.scan && x.scan === pg.scan && x.page === pg.page) return x; }
    return null;
  }
  var tiles = pages.map(function (pg) {
    var it = matchRow(pg);
    if (!it) return (pg.held && asking) ? { cls: 'mm', t: 'Type JO' } : (pg.held || pg.jo === HOLD) ? { cls: 'busy', t: 'Reading…' } : { cls: 'busy', t: 'Waiting' };
    if (it.state === 'needsjo') return { cls: 'err', t: 'Type JO' };
    if (it.state === 'uploading') return { cls: 'busy', t: 'Uploading…' };
    if (it.state === 'waiting') return { cls: 'queued', t: online ? (it.error ? 'Retrying' : 'Waiting') : 'Offline' };
    if (it.state === 'saved') return { cls: 'ok', t: 'Saved' };
    if (it.state === 'mismatch') return { cls: 'mm', t: 'Check JO' };
    if (it.state === 'failed') return { cls: 'err', t: 'Failed', retry: it.id };
    return { cls: 'queued', t: it.state || '' };
  });
  var held = pages.some(function (p) { return p.held; });
  var pendingTiles = tiles.filter(function (s) { return s.cls === 'busy' || s.cls === 'queued'; }).length + (saving ? 1 : 0);
  var failedTiles = tiles.filter(function (s) { return s.retry; }).length;
  var line = held ? (asking ? 'This photo stays here until you tap Save.' : 'Saved, reading JO…')
    : (!pages.length && !saving) ? ''
    : failedTiles ? (failedTiles + (failedTiles > 1 ? ' pages failed' : ' page failed'))
    : pendingTiles ? (pendingTiles === 1 ? '1 page still uploading' : pendingTiles + ' pages still uploading')
    : (pages.length ? 'All saved' : '');
  var lineCls = failedTiles ? ' err' : (pendingTiles || held) ? ' busy' : pages.length ? ' ok' : '';
  var joLine = asking ? 'Type the JO number' : jo ? ('JO ' + jo) : ((pages.length || saving || reading) ? 'Saved, reading JO…' : '');
  var pending = 0, needs = 0, failed = 0;
  rows.forEach(function (r) {
    if (r.state === 'waiting' || r.state === 'uploading') pending++;
    else if (r.state === 'needsjo' && !validJo(r.jo)) needs++;
    else if (r.state === 'failed') failed++;
  });
  var counter = pending ? (pending + ' uploading') : needs ? (needs === 1 ? '1 needs JO' : needs + ' need JO') : failed ? (failed + ' failed') : '';
  return {
    toast: toast, joLine: joLine, line: line, lineCls: lineCls, tiles: tiles,
    counter: counter, counterErr: !!(needs || failed), counterBusy: !!(pending && !needs && !failed)
  };
}
function applyFiling(item, filing) {
  var clientId = item.clientId || '';
  var prevName = item.filename;
  var prevScan = item.scan;
  item.jo = filing.jo;
  item.page = filing.page;
  item.filename = filing.filename;
  item.scan = filing.scan;
  item.held = false;
  if (item.needsJo) item.needsJo = false;
  syncState(item);
  var sc = scan();
  if (sc && sc.cap) { sc.cap.asking = false; sc.cap.reading = false; }
  var pages = (sc && sc.cap && sc.cap.pages) || [];
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    var mine = (clientId && p.clientId === clientId) || p.filename === prevName || (p.scan === prevScan && p.page === filing.page);
    if (mine) { p.jo = filing.jo; p.page = filing.page; p.filename = filing.filename; p.scan = filing.scan; p.held = false; }
    else if (p.held || p.jo === HOLD) { p.held = false; if (!validJo(p.jo)) p.jo = filing.jo; if (p.scan === prevScan) p.scan = filing.scan; }
  }
  fillJo(filing.jo);
}
function fileAs(item, jo, fromCard, announce) {
  var sc0 = scan();
  if (sc0 && typeof sc0.fileHeld === 'function') sc0.fileHeld(jo); // bind every held page before the toast
  var filing = joFiling(item, jo, fromCard);
  applyFiling(item, filing);
  var sc = scan();
  if (sc && sc.cap) sc.cap.filing = filing;
  try {
    if (sc && typeof sc.renderQueue === 'function') sc.renderQueue();
    else if (sc && typeof sc.renderCapture === 'function') sc.renderCapture();
  } catch (e) { console.error(e); }
  if (announce) say(filing.toast);
  if (sc && sc.cap && sc.cap.filing === filing) sc.cap.filing = null;
  lastFiled = { id: '', jo: filing.jo, page: filing.page, filename: filing.filename, scan: filing.scan };
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
    if (!item || item.boundJo || item.jo !== HOLD || !hasJo(state.zones)) return orig(item);
    var page = parseInt(item.page, 10) || 1;
    if (page === 1) ocrChain = resolveJo(item);
    else ocrChain = ocrChain.then(function (jo) { return jo || ''; });
    return ocrChain.then(function (jo) {
      if (!jo || !validJo(jo)) {
        if (page === 1) {
          say('JO not read, tap Correct number');
          var scMiss = scan();
          if (scMiss && typeof scMiss.capStep === 'function') scMiss.capStep({ id: 'scan', text: 'JO not read, tap Correct number', state: 'err' });
        }
        item.held = true;
        item.jo = HOLD;
        return orig(item);
      }
      fileAs(item, jo, page === 1 && lastFromCard, page === 1);
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

root.OYPZones = {
  mount: mount, open: open, prepare: prepare, zones: function () { return state.zones.slice(); }, summary: summary, saveMessage: saveMessage,
  scannerTurns: scannerTurns, turnZone: turnZone, viewToStored: viewToStored, storedToView: storedToView,
  exifQuarterTurns: exifQuarterTurns, jpegOrientation: jpegOrientation, jpegSize: jpegSize, exifTagForPixels: exifTagForPixels, readToken: readToken, tokenEntryPlan: tokenEntryPlan, presentSave: presentSave, instructWanted: instructWanted, joFiling: joFiling, joStatus: joStatus,
  cardPage: cardPage, cropWanted: cropWanted, PAGE_PX: PAGE_PX, FINDING: FINDING, NO_EDGES: NO_EDGES,
  gestureBegin: gestureBegin, gestureAdvance: gestureAdvance, HOLD_MS: HOLD_MS
};
boot();
})(typeof window !== 'undefined' ? window : globalThis);
