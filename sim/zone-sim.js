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

/* A landscape EXIF result is already the scanner frame. A second clockwise turn is the old bug. */
const raw = blank(30, 60);
setRect(raw, 0, 0, 10, 10, RED);
const oriented = rot90cw(raw);
eq(oriented.w === 60 && oriented.h === 30, 'EXIF orientation 6 on portrait samples is landscape');
eq(Z.scannerTurns(oriented.w, oriented.h) === 0, 'the oriented landscape page is the scanner frame');
const exifBox = redBounds(oriented);
const exifStored = Z.viewToStored(exifBox, 0, 0);
eq(Math.abs(exifStored.x - exifBox.x) < 0.001 && crop(oriented, exifStored).ratio > 0.9, 'an already-landscape EXIF result is not turned again');
const exifAgain = rot90cw(oriented);
eq(crop(oriented, redBounds(exifAgain)).ratio < 0.5, 'a second clockwise turn misses the marker');
eq(crop(oriented, Z.viewToStored(redBounds(exifAgain), 1, 0)).ratio > 0.9, 'Rotate still converts that extra turn back to the scanner frame');

/* iPhone: landscape sensor pixels, EXIF 6. One application is the portrait she sees. rotFor turns that once. */
const sensor = blank(80, 40);
const afterExif = rot90cw(sensor);
eq(afterExif.w === 40 && afterExif.h === 80, 'EXIF 6 on landscape sensor pixels is the portrait file');
eq(Z.exifTagForPixels(80, 40, 6, { w: 80, h: 40 }) === 6, 'raw landscape pixels still need the EXIF 6 turn');
eq(Z.exifTagForPixels(40, 80, 6, { w: 80, h: 40 }) === 1, 'a decoder that already swapped axes is not tagged again');
eq(Z.exifTagForPixels(40, 80, 6, null) === 6, 'without a stored size the tag is still applied');
eq(Z.exifTagForPixels(40, 80, 3, { w: 40, h: 80 }) === 3, 'a 180 tag is not dropped just because the axes match');
setRect(afterExif, 4, 8, 12, 20, RED);
const phoneUpright = rot90cw(afterExif);
eq(Z.scannerTurns(afterExif.w, afterExif.h) === 1, 'the EXIF-applied portrait turns once, matching rotFor');
const phoneBox = redBounds(phoneUpright);
const phoneStored = Z.viewToStored(phoneBox, 1, 1);
eq(Math.abs(phoneStored.x - phoneBox.x) < 0.001 && Math.abs(phoneStored.y - phoneBox.y) < 0.001, 'the opening view is the scanner crop');
eq(crop(phoneUpright, phoneStored).ratio > 0.9, 'a box on the upright card crops the scanner frame');
eq(crop(phoneUpright, redBounds(rot90cw(phoneUpright))).ratio < 0.5, 'turning the upright card again misses the marker');
eq(Z.exifTagForPixels(3024, 4032, 1, { w: 3024, h: 4032 }) === 1, 'the stripped 3024x4032 portrait is not turned by EXIF');
eq(Z.scannerTurns(3024, 4032) === 1 && Z.scannerTurns(4032, 3024) === 0, 'that portrait turns once and the landscape copy does not');

localStorage.setItem('oypScanRotate', 'none');
eq(Z.scannerTurns(40, 80) === 0 && Z.scannerTurns(80, 40) === 0, 'scanner setting none never turns');
localStorage.setItem('oypScanRotate', '180');
eq(Z.scannerTurns(80, 40) === 2 && Z.scannerTurns(40, 80) === 2, 'scanner setting 180 still turns a landscape page');
localStorage.setItem('oypScanRotate', 'ccw');
eq(Z.scannerTurns(40, 80) === 3 && Z.scannerTurns(80, 40) === 0, 'scanner setting ccw matches rotFor');
localStorage.removeItem('oypScanRotate');
eq(Z.scannerTurns(40, 80) === 1, 'an unset scanner rotation is clockwise');

function jpegWithOrientation(orient) {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, (orient >> 8) & 255, orient & 255, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00].concat(tiff);
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255].concat(payload, [0xff, 0xd9]));
}
function jpegWithSize(w, h, orient) {
  const app = jpegWithOrientation(orient);
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x01, 0x01, 0x11, 0x00];
  const out = new Uint8Array(app.length - 2 + sof.length + 2);
  out.set(app.subarray(0, app.length - 2), 0);
  out.set(sof, app.length - 2);
  out[out.length - 2] = 0xff; out[out.length - 1] = 0xd9;
  return out;
}
eq(Z.jpegOrientation(jpegWithOrientation(6)) === 6, 'JPEG APP1 orientation is read before the view turn');
eq(Z.jpegOrientation(jpegWithOrientation(1)) === 1, 'orientation 1 is left as 1');
const sized = jpegWithSize(4032, 3024, 6);
eq(Z.jpegSize(sized).w === 4032 && Z.jpegSize(sized).h === 3024, 'SOF size is the stored samples, not the EXIF view');
eq(Z.jpegOrientation(sized) === 6, 'orientation and SOF are both read');
eq(Z.exifTagForPixels(Z.jpegSize(sized).w, Z.jpegSize(sized).h, 6, Z.jpegSize(sized)) === 6, 'EXIF 6 on those stored samples is still due');
eq(Z.exifQuarterTurns(6) === 1 && Z.exifQuarterTurns(8) === 3 && Z.exifQuarterTurns(3) === 2 && Z.exifQuarterTurns(1) === 0, 'EXIF quarter turns');
const realPaths = [
  process.env.ZONE_PHOTO,
  '/tmp/zone-portrait.jpg',
  '/cursor/stores/bot/grok-bot/agents/efcd9558-016b-4dea-89dc-d6bac9133134/attachments/01M5GY7MHSH8FQR3XBVT26PB4E.jpg'
];
const realPath = realPaths.find(function (p) { return p && fs.existsSync(p); });
if (realPath) {
  const realBytes = fs.readFileSync(realPath);
  const realSize = Z.jpegSize(realBytes);
  eq(!!realSize && realSize.w === 3024 && realSize.h === 4032, 'the attached portrait is 3024x4032');
  eq(Z.jpegOrientation(realBytes) === 1, 'the attached file has no orientation tag');
  eq(Z.exifTagForPixels(realSize.w, realSize.h, 1, realSize) === 1, 'the attached pixels are not tagged again');
} else console.log('ok real portrait file not on this machine; synthetic 3024x4032 covered it');

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
const rejected = { ok: true, local: true, reason: 'Bad token' };
const rejectedView = Z.presentSave(rejected, joZones, null);
eq(rejectedView.tone === 'bad' && rejectedView.text === Z.saveMessage(rejected, joZones) && /token was not accepted/.test(rejectedView.text), 'a rejected token turns the dot red');
const again = Z.tokenEntryPlan(' abc ', joZones, noTok);
eq(again.token === 'abc' && again.status === 'Token saved.' && again.resave === true, 'Enter after a local save stores the token and sends the boxes');
eq(Z.tokenEntryPlan('abc', [], null).status === 'Token saved.' && Z.tokenEntryPlan('abc', [], null).resave === false, 'a token with no boxes only confirms it was saved');
eq(Z.tokenEntryPlan('abc', joZones, { ok: true, shared: true }).resave === true, 'boxes already on the page are saved again with the token');
eq(Z.tokenEntryPlan('   ', joZones, noTok).resave === false && Z.tokenEntryPlan('   ', [], null).status === '', 'a blank token is not treated as saved');
eq(Z.tokenEntryPlan('abc', [], { ok: true, local: true, reason: 'offline' }).resave === true, 'a save that stayed on this phone is sent again');

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
eq(zonesSrc.includes('viewTurns = scannerTurns('), 'the opening turn follows the scanner');
eq(zonesSrc.includes('viewTurns = 0') && zonesSrc.includes('scanT = 0'), 'a found card is already the scanner frame');
eq(zonesSrc.includes('function exifTagForPixels'), 'EXIF is applied only when the pixels are still the stored samples');
eq(zonesSrc.includes('isHeic(file)) return heicToJpegUrl'), 'a HEIC is oriented by libheif, not by a second JPEG tag');
eq(/function rotFor\(c\) \{ const k = rotation\(\); return \(k === 'cw' \|\| k === 'ccw'\) && c\.width > c\.height \? 'none' : k; \}/.test(app), 'rotFor still skips only cw and ccw on a landscape page');
eq(app.includes('function applyJpegOrient') && app.includes('return applyJpegOrient(c, orient, raw)'), 'the scanner draws a missed EXIF tag once before rotFor');
eq(app.includes('if (isHeic(file)) return heicToCanvas(file)'), 'a HEIC scan is not given a JPEG orientation on top of irot');
eq(app.includes('CardDetector.fitStandard'), 'a warped scan is resized to the standard page');
eq(app.includes('cvSoon(') && app.includes('CV_WAIT_MS = 6000') && app.includes('function detectorReady') && !app.includes('do not wait on the detector'), 'a scan waits for OpenCV before it saves, up to 6s');
eq(app.includes('function stickersSoon') && app.includes("op: 'printEnqueue'"), 'the page-1 sticker is queued from the JO number and does not wait on enhance');
eq(app.includes('p.plain = true') && app.includes('function reprocessPlain'), 'a page saved with no detector is marked and reprocessed later');
const detSrc = read('scan/detector.js');
eq((detSrc.match(/const CARD_RATIO = 217\.5 \/ 136/g) || []).length === 1 && !/1\.55/.test(detSrc), 'the card aspect is the measured 217.5/136');
const det = require(path.join(root, 'scan/detector.js'));
const std = det.standardPage(1600);
eq(Math.abs(det.CARD_RATIO - 217.5 / 136) < 1e-12 && std[0] === 1600 && std[1] === 1000 && std[1] === Math.round(1600 / det.CARD_RATIO), 'every warped page is 1600 by round(1600/ratio)');
const wide = det.cardSize([[0, 0], [200, 0], [200, 100], [0, 100]], 1600);
const tall = det.cardSize([[0, 0], [100, 0], [100, 200], [0, 200]], 1600);
eq(wide[0] === std[0] && wide[1] === std[1] && tall[0] === std[1] && tall[1] === std[0], 'a sideways quad uses the same page on its side');
eq(Z.PAGE_PX === 1600 && Z.cropWanted() === true, 'the editor crops to the card unless this phone turned crop off');
localStorage.setItem('oypScanCrop', '0');
eq(Z.cropWanted() === false, 'crop off leaves the whole photo');
localStorage.removeItem('oypScanCrop');
eq(Z.FINDING === 'Finding card edges…' && Z.NO_EDGES.indexOf('all 4 card edges visible') > 0, 'the editor says when edges are missing');
eq(read('nav.js').includes('scan-zones.js?v=21'), 'scan-zones cache bust is v21');
eq(zonesSrc.includes('grid-template-columns:1fr auto 1fr') && zonesSrc.includes('.ozbar b{grid-column:2;justify-self:center') && zonesSrc.includes('.ozbar [data-z="close"]{grid-column:1') && zonesSrc.includes('.ozbar [data-z="save"]{grid-column:3'), 'the zone title is centered on the bar');
eq(zonesSrc.includes('@media (max-width:480px){.ozbar b{font-size:calc(18px * var(--fs, 1))}') && zonesSrc.includes('height:calc(34px * var(--sp, 1))') && !/ellipsis/.test(zonesSrc), 'a narrow bar uses an 18px title and 34px buttons, with the full words');
eq(zonesSrc.includes('<ul class="oznote">') && zonesSrc.includes('Pick a label, then draw its box on the sample photo.') && zonesSrc.includes('Swipe on the card to scroll the page.') && zonesSrc.includes('.oznote li{margin:0;padding:0}') && !zonesSrc.includes('Tag each section of the card once'), 'the zone help is a short bulleted list');
eq(zonesSrc.includes('<details class="ozhelp"><summary>Instructions</summary>') && zonesSrc.includes('min-height:calc(34px * var(--sp, 1))') && zonesSrc.includes('text-transform:uppercase') && zonesSrc.includes('content:"\\\\203A"'), 'instructions is a 34px small-caps header with a chevron');
localStorage.removeItem('oypScanInstruct');
eq(Z.instructWanted() === false, 'instructions start closed, including the first visit');
localStorage.setItem('oypScanInstruct', '1');
eq(Z.instructWanted() === true, 'an opened instructions list is remembered');
localStorage.setItem('oypScanInstruct', '0');
eq(Z.instructWanted() === false, 'a closed instructions list is remembered');
localStorage.removeItem('oypScanInstruct');
eq(zonesSrc.includes('>Change token</button>') && zonesSrc.includes('data-z="changetoken"'), 'a saved token stays hidden behind Change token');
eq(zonesSrc.includes("if (e.key !== 'Enter') return;\n      e.preventDefault();\n      e.stopPropagation();\n      commitToken();"), 'Enter in the token field saves it and does not submit the page');
eq(read('staff/index.html').includes('nav.js?v=63') && read('staff/print-test.html').includes('nav.js?v=63'), 'staff pages load nav.js v63');
eq(read('scan/index.html').includes('https://oypjewelry.com/nav.js?v=63') && read('scan/index.html').includes('app.js?v=20261022s') && read('scan/index.html').includes('detector.js?v=20261022k') && read('scan/index.html').includes('queue.js?v=20261022n'), 'the scanner page keeps the production nav host at v63');

const heldPage = { clientId: 'c1', jo: 'OCR', held: true, page: 1, filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc' };
const filing = Z.joFiling(heldPage, '26-287b', true);
eq(filing.toast === 'JO 26-287B, from the card.' && filing.jo === '26-287B' && filing.held === false && filing.queueState === 'waiting' && filing.fromCard === true, 'accepting the card JO files it once, as a waiting page');
const filedItem = { jo: filing.jo, filename: filing.filename, scan: filing.scan, held: filing.held, page: filing.page, clientId: 'c1' };
eq(!(filedItem.held || filedItem.needsJo || !filedItem.jo || filedItem.jo === 'OCR'), 'the page handed to the queue is not a needs-JO row');
const stale = Z.joStatus({
  jo: 'OCR', scan: filing.scan, prevScan: 'OCR@abc', filename: filing.filename, page: 1, clientId: 'c1',
  fromCard: true, toast: filing.toast, asking: false, reading: true, saving: false, online: true,
  pages: [heldPage],
  rows: [{ clientId: 'c1', jo: 'OCR', state: 'needsjo', page: 1, filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc' }]
});
function stillReading(v) {
  return v.joLine === 'Saved, reading JO…' || v.line === 'Saved, reading JO…' || /needs JO/.test(v.counter) || v.tiles.some(function (t) { return t.t === 'Reading…' || t.t === 'Type JO'; });
}
eq(stale.toast === 'JO 26-287B, from the card.' && stale.joLine === 'JO 26-287B' && stale.tiles[0].t === 'Uploading…' && stale.line === '1 page still uploading' && stale.counter === '1 uploading' && !stale.counterErr, 'the tile, the gold line, and the counter update with the toast');
eq(!stillReading(stale), 'the toast never sits on a reading or needs-JO state');
const settled = Z.joStatus({
  jo: filing.jo, scan: filing.scan, toast: filing.toast, fromCard: true, online: true,
  filename: filing.filename, page: filing.page, clientId: 'c1', prevScan: 'OCR@abc',
  pages: [filedItem], rows: [{ clientId: 'c1', jo: filing.jo, state: 'waiting', page: 1, filename: filing.filename, scan: filing.scan }]
});
eq(!stillReading(settled) && settled.tiles[0].t === 'Uploading…' && settled.counter === '1 uploading', 'once the page is filed, the same readout stays consistent');
const reading = Z.joStatus({
  jo: 'OCR', toast: 'Reading the JO number…', reading: true, online: true,
  pages: [heldPage], rows: []
});
eq(reading.joLine === '' && reading.line === '' && reading.tiles[0].t === 'Reading…' && reading.counter === '', 'while the JO is being read, the header and the amber line stay clear');
eq(app.includes("text: 'Saved, reading JO…'"), 'the step list is the one place that says the page is saved and the JO is being read');
const unread = Z.joStatus({
  jo: 'OCR', scan: 'OCR@abc', reading: true, asking: false, online: true,
  pages: [heldPage],
  rows: [
    { clientId: 'c1', jo: 'OCR', state: 'needsjo', page: 1, filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc' },
    { clientId: 'c2', jo: 'OCR', state: 'needsjo', page: 1, filename: 'OCR-p1-102225.jpg', scan: 'OCR@earlier' }
  ]
});
eq(unread.counter === '1 needs JO' && unread.tiles[0].t === 'Reading…' && unread.joLine === '' && unread.line === '', 'a page still being read is left out of the count; an earlier unread page still counts');
const finished = Z.joStatus({
  jo: 'OCR', scan: 'OCR@abc', reading: false, asking: true, online: true,
  pages: [heldPage],
  rows: [{ clientId: 'c1', jo: 'OCR', state: 'needsjo', page: 1, filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc' }]
});
eq(finished.counter === '1 needs JO' && finished.counterErr === true && finished.tiles[0].t === 'Type JO' && finished.joLine === 'Type the JO number' && finished.line === 'This photo stays here until you tap Save.', 'once the read finishes with no JO, that page counts');
const typedJo = Z.joStatus({
  jo: '26-363', scan: '26-363@abc', prevScan: 'OCR@abc', toast: 'JO 26-363.', fromCard: false, online: true,
  filename: '26-363-p1-102226.jpg', page: 1, clientId: 'c1',
  pages: [{ clientId: 'c1', jo: '26-363', held: false, page: 1, filename: '26-363-p1-102226.jpg', scan: '26-363@abc' }],
  rows: [
    { clientId: 'c1', jo: '26-363', state: 'saved', page: 1, filename: '26-363-p1-102226.jpg', scan: '26-363@abc' },
    { clientId: 'c9', jo: 'OCR', state: 'needsjo', page: 1, filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc' }
  ]
});
eq(typedJo.counter.indexOf('needs JO') < 0 && typedJo.tiles[0].t === 'Saved', 'a typed JO on this card is not still 1 needs JO');
const otherJo = Z.joStatus({
  jo: '26-363', scan: '26-363@abc', toast: 'JO 26-363.', fromCard: false, online: true,
  pages: [{ jo: '26-363', held: false, page: 1, filename: 'a.jpg', scan: '26-363@abc' }],
  rows: [
    { jo: '26-363', state: 'saved', page: 1, filename: 'a.jpg', scan: '26-363@abc' },
    { jo: 'OCR', state: 'needsjo', page: 1, filename: 'b.jpg', scan: 'OCR@other' }
  ]
});
eq(otherJo.counter === '1 needs JO' && otherJo.counterErr === true, 'a different page that truly has no JO still counts');
const fileAsSrc = zonesSrc.slice(zonesSrc.indexOf('function fileAs'), zonesSrc.indexOf('function addCorrectBtn'));
eq(fileAsSrc.indexOf('fileHeld(jo)') !== -1 && fileAsSrc.indexOf('fileHeld(jo)') < fileAsSrc.indexOf('say('), 'the held pages are bound before the toast');
eq(fileAsSrc.indexOf('renderQueue') !== -1 && fileAsSrc.indexOf('say(') !== -1 && fileAsSrc.indexOf('renderQueue') < fileAsSrc.indexOf('say('), 'the toast is set in the same turn as the capture render');
eq(app.includes('OYPZones.joStatus(captureSnap())') && app.includes('captureView'), 'the page tile, the gold line, and the counter share one readout');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('zone-sim passed');
