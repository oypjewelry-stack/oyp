/* JO card zones: scanner-frame crops, save notes, and touch gestures. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
vm.runInThisContext(read('scan-zones.js'), { filename: 'scan-zones.js' });
const Z = global.OYPZones;
eq(!!Z && Z.HOLD_MS === 300, 'zones export includes the touch hold');

function blank(w, h, rgba) {
  const d = new Uint8Array(w * h * 4);
  const c = rgba || [255, 255, 255, 255];
  for (let i = 0; i < w * h; i++) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = c[3]; }
  return { w: w, h: h, d: d };
}
function setRect(img, x, y, w, h, rgba) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const i = (yy * img.w + xx) * 4;
    img.d[i] = rgba[0]; img.d[i + 1] = rgba[1]; img.d[i + 2] = rgba[2]; img.d[i + 3] = 255;
  }
}
/* 90° clockwise, independent of turnZone. (x, y) -> (h - 1 - y, x). */
function rot90cw(img) {
  const w = img.w, h = img.h, nw = h, nh = w;
  const d = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = h - 1 - y, ny = x;
    const s = (y * w + x) * 4, t = (ny * nw + nx) * 4;
    d[t] = img.d[s]; d[t + 1] = img.d[s + 1]; d[t + 2] = img.d[s + 2]; d[t + 3] = img.d[s + 3];
  }
  return { w: nw, h: nh, d: d };
}
function isRed(img, x, y) {
  const i = (y * img.w + x) * 4;
  return img.d[i] > 200 && img.d[i + 1] < 40 && img.d[i + 2] < 40;
}
function redBounds(img) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!isRed(img, x, y)) continue;
    n++;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0 / img.w, y: y0 / img.h, w: (x1 - x0 + 1) / img.w, h: (y1 - y0 + 1) / img.h, n: n };
}
function crop(img, zone) {
  let x = Math.round(zone.x * img.w), y = Math.round(zone.y * img.h);
  let w = Math.round(zone.w * img.w), h = Math.round(zone.h * img.h);
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > img.w) w = img.w - x;
  if (y + h > img.h) h = img.h - y;
  let red = 0;
  const n = Math.max(0, w) * Math.max(0, h);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (isRed(img, xx, yy)) red++;
  return { red: red, n: n, ratio: n ? red / n : 0 };
}
const RED = [220, 0, 0, 255];

const land = blank(80, 40);
setRect(land, 10, 4, 20, 8, RED);
eq(Z.scannerTurns(land.w, land.h) === 0, 'a landscape page is already the scanner frame');
const landView = rot90cw(land);
const landBox = redBounds(landView);
eq(landBox.n === 20 * 8, 'the marker survives a clockwise turn');
const landStored = Z.viewToStored(landBox, 1, 0);
eq(crop(land, landStored).ratio > 0.9, 'a box drawn on the clockwise view crops the marker on the original');
eq(crop(land, landBox).ratio < 0.5, 'saving the view box without converting misses the marker');
[0, 1, 2, 3].forEach(function (turns) {
  let view = land;
  for (let i = 0; i < turns; i++) view = rot90cw(view);
  const box = redBounds(view);
  const stored = Z.viewToStored(box, turns, 0);
  eq(crop(land, stored).ratio > 0.9, 'rotate tap ' + turns + ' still crops the marker');
  eq(Math.abs(stored.x - 10 / 80) < 0.03 && Math.abs(stored.y - 4 / 40) < 0.03, 'rotate tap ' + turns + ' stores the scanner rect');
});

const file = blank(40, 80);
const upright = rot90cw(file);
setRect(upright, 8, 6, 16, 10, RED);
eq(Z.scannerTurns(file.w, file.h) === 1, 'a portrait phone photo turns once, matching rotFor');
const upBox = redBounds(upright);
const upStored = Z.viewToStored(upBox, 1, 1);
eq(Math.abs(upStored.x - upBox.x) < 0.001 && Math.abs(upStored.y - upBox.y) < 0.001, 'portrait view and scanner frame are the same turn');
eq(crop(upright, upStored).ratio > 0.9, 'a box on the upright portrait view crops the upright scan');
const existing = { x: 8 / 80, y: 6 / 40, w: 16 / 80, h: 10 / 40 };
eq(crop(upright, existing).ratio > 0.9, 'an existing saved zone still crops the same pixels');

const raw = blank(30, 60);
setRect(raw, 0, 0, 10, 10, RED);
const oriented = rot90cw(raw);
eq(oriented.w === 60 && oriented.h === 30, 'EXIF orientation 6 turns the file clockwise before the editor');
eq(Z.scannerTurns(oriented.w, oriented.h) === 0, 'the oriented landscape page is the scanner frame');
const exifView = rot90cw(oriented);
const exifStored = Z.viewToStored(redBounds(exifView), 1, 0);
eq(crop(oriented, exifStored).ratio > 0.9, 'a box on the editor view crops the EXIF-oriented image');

function jpegWithOrientation(orient) {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, (orient >> 8) & 255, orient & 255, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00].concat(tiff);
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255].concat(payload, [0xff, 0xd9]));
}
eq(Z.jpegOrientation(jpegWithOrientation(6)) === 6, 'JPEG APP1 orientation is read before the view turn');
eq(Z.exifQuarterTurns(6) === 1 && Z.exifQuarterTurns(8) === 3 && Z.exifQuarterTurns(3) === 2 && Z.exifQuarterTurns(1) === 0, 'EXIF quarter turns');

eq(Z.readToken(null) === '' && Z.readToken({ value: ' ab ' }) === 'ab', 'a missing token field does not throw');
const joZones = [{ id: 'jo', label: 'JO number', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }];
const noTok = { ok: true, local: true, reason: 'no-token' };
const noView = Z.presentSave(noTok, joZones, null);
eq(noView.tone === 'local' && noView.button === 'Saved on this phone' && noView.text === Z.saveMessage(noTok, joZones), 'no token still shows the amber note');
const offline = { ok: true, local: true, reason: 'offline' };
const offView = Z.presentSave(offline, joZones, null);
eq(offView.tone === 'local' && offView.text === Z.saveMessage(offline, joZones), 'a failed fetch that saved locally is amber');
const shared = { ok: true, shared: true };
const okView = Z.presentSave(shared, joZones, null);
eq(okView.tone === 'ok' && okView.button === 'Saved ✓' && okView.text === Z.saveMessage(shared, joZones), 'a shared save is green');
const badView = Z.presentSave(null, joZones, new Error('save'));
eq(badView.tone === 'bad' && badView.button === 'Save zones' && /Could not save/.test(badView.text), 'an exception is red');

let sample = [{ id: 'jo', x: 0.2 }];
const swipe = Z.gestureAdvance('pending', 40, 50);
if (swipe !== 'scroll') sample[0].x = 0;
eq(swipe === 'scroll' && sample[0].x === 0.2, 'a fast swipe scrolls and leaves the zones unchanged');
eq(Z.gestureAdvance('pending', 2, 300) === 'draw', 'a 300ms hold starts a box');
eq(Z.gestureAdvance('pending', 2, 100) === 'pending', 'a short hold does not draw yet');
eq(Z.gestureBegin({ drawMode: true, pointerType: 'touch' }) === 'draw', 'draw mode draws on the first drag');
eq(Z.gestureBegin({ hit: 'resize', pointerType: 'touch', drawMode: false }) === 'resize', 'a handle still resizes');
eq(Z.gestureBegin({ hit: 'move', pointerType: 'touch' }) === 'move', 'a box still moves');
eq(Z.gestureBegin({ pointers: 2, drawMode: true, pointerType: 'touch' }) === 'pinch', 'a second finger is a pinch');
eq(Z.gestureBegin({ pointerType: 'mouse' }) === 'draw' && Z.gestureBegin({ pointerType: 'pen' }) === 'draw', 'mouse and pen still draw immediately');
eq(Z.gestureBegin({ pointerType: 'touch' }) === 'pending', 'a finger on empty card waits');

const zonesSrc = read('scan-zones.js');
eq(zonesSrc.includes('touch-action:pan-y pinch-zoom'), 'empty photo scrolls vertically and still pinches');
eq(zonesSrc.includes('touch-action:pinch-zoom'), 'draw mode does not block pinch-zoom');
eq(/\.ozboxhit,\.ozhandlehit\{[^}]*touch-action:none/.test(zonesSrc), 'only boxes and handles take the finger');
eq(zonesSrc.includes('data-z="draw"') && zonesSrc.includes('Draw box') && zonesSrc.includes('height:calc(34px * var(--sp, 1))'), 'Draw box is a 34px pill');
eq(zonesSrc.includes('insertBefore(a, settings)') && zonesSrc.includes('insertBefore(a, logout)'), 'JO card zones cannot land after Log out');

const nav = require(path.join(root, 'nav.js'));
const tail = nav.scannerTailHtml({ pending: 2, failed: 1, printTest: 'https://oypjewelry.com/staff/print-test.html', logoutHref: 'https://oypjewelry.com/staff/#/logout' });
const order = ['Pending uploads', 'Scanner settings', 'Print test', 'Log out'].map(function (s) { return tail.indexOf(s); });
eq(order.every(function (n) { return n >= 0; }) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3], 'scanner menu tail order');
eq(/data-m="logout">Log out<\/a>\s*$/.test(tail), 'Log out is the last scanner row');
eq(tail.indexOf('badge') > 0 && tail.indexOf('>3<') > 0, 'pending badge counts failed too');
const unsigned = nav.scannerTailHtml({});
eq(unsigned.indexOf('Log out') < 0 && unsigned.indexOf('Print test') > unsigned.indexOf('Scanner settings'), 'unsigned scanner menu has no Log out');
const menu = nav.menuHtml({ role: 'admin', username: 'desk', display_name: 'Desk' }, 'dashboard', '');
eq(/data-logout>Log out<\/button>\s*$/.test(menu), 'back-office Log out stays last');
const app = read('scan/app.js');
const build = app.slice(app.indexOf('function buildMenu'), app.indexOf('const menu'));
eq(build.indexOf('Open the scanner from the back-office') < build.indexOf('scannerTailHtml'), 'the unsigned note stays above the scanner rows');
eq(build.indexOf('>Print test</a>') < build.indexOf('>Log out</a>'), 'the offline menu still prints before Log out');
eq(read('nav.js').includes('scan-zones.js?v=6'), 'scan-zones cache bust is v6');
eq(read('staff/index.html').includes('nav.js?v=34') && read('staff/print-test.html').includes('nav.js?v=34'), 'staff pages load nav.js v34');
eq(read('scan/index.html').includes('https://oypjewelry.com/nav.js?v=34') && read('scan/index.html').includes('app.js?v=20261022b'), 'the scanner page keeps the production nav host at v34');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('zone-sim passed');
