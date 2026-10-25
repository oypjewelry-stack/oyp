/* Label bitmaps, QR payload, and the print queue.
   Run: node sim/print-sim.js
   jsqr is installed for this run only (npm --no-save). It is not a site dependency. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }

global.qrcode = require(path.join(root, 'vendor/qrcode.js'));
const L = require(path.join(root, 'print-label.js'));
let jsqr;
try { jsqr = require('jsqr'); } catch (e) { jsqr = require('/tmp/jsqr-mod/node_modules/jsqr'); }

function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function decode(img) {
  const hit = jsqr(img.data, img.width, img.height);
  if (hit && hit.data) return hit.data;
  const box = img.qrBox;
  if (!box) return '';
  const size = box.size + 8;
  const x0 = Math.max(0, box.x - 4), y0 = Math.max(0, box.y - 4);
  const w = Math.min(size, img.width - x0), h = Math.min(size, img.height - y0);
  const crop = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) crop.set(img.data.subarray((y0 + y) * img.width * 4 + x0 * 4, (y0 + y) * img.width * 4 + (x0 + w) * 4), y * w * 4);
  const again = jsqr(crop, w, h);
  return again && again.data || '';
}
function tailWhite(img) {
  for (let y = img.labelH; y < img.height; y++) {
    const i = y * img.width * 4;
    for (let x = 0; x < img.width; x++) if (img.data[i + x * 4] !== 255) return false;
  }
  return true;
}
function noName(img) {
  const text = img.lines.join(' ');
  return !/ELENA|TAN|SANTOS/i.test(text);
}

let draw = true;
try { L.render({ kind: 'jo_card', model: 'B1', jo: '26-287', due: '2026-10-21' }); }
catch (e) { draw = false; console.log('skip label bitmaps: ' + (e && e.message || e) + '. Install @napi-rs/canvas to draw them.'); }

const card = { kind: 'jo_card', jo: '26-287', due: '2026-10-21' };
const tag = { kind: 'jewelry_tag', jo: '26-287', karat: '18k', metal: 'gold', stone: 'diamond', size: '6', weight: '4.2' };
if (draw) {
[['B31', 600, 164], ['B1', 384, 72]].forEach(([model, head, ox]) => {
  const a = L.render(Object.assign({ model, client: 'Elena Tan' }, card));
  const b = L.render(Object.assign({ model }, card));
  const c = L.render(Object.assign({ model, client: 'Maria Santos' }, card));
  eq(a.width === head && a.height === 160 && a.offsetX === ox && a.labelW === 240 && a.labelH === 160 && a.tail === 0, model + ' JO card is ' + head + '×160, label 240×160, offset ' + ox);
  eq(same(a.data, b.data) && same(a.data, c.data), model + ' JO card pixels ignore the client name');
  eq(noName(a) && a.lines[0] === '26-287' && a.lines.indexOf('DUE 21 OCT') >= 0, model + ' JO card text is the JO and the due date');
  eq(a.qrBox && a.qrBox.size >= L.px(16) && a.qrBox.size <= a.labelH - L.px(1) * 2, model + ' JO card QR fills the 20 mm height down to the margins');
  eq(clearMargin(a), model + ' JO card ink stays about 1 mm inside the edges');
  eq(decode(a) === '26-287', model + ' JO card QR is 26-287');
  const t = L.render(Object.assign({ model, client: 'Elena Tan' }, tag));
  const t2 = L.render(Object.assign({ model }, tag));
  eq(t.width === head && t.height === 560 && t.offsetX === ox && t.labelW === 240 && t.labelH === 200 && t.tail === 360, model + ' jewelry tag is ' + head + '×560, head 240×200, tail 360');
  eq(same(t.data, t2.data), model + ' jewelry tag pixels ignore the client name');
  eq(noName(t) && t.lines.indexOf('26-287') >= 0 && t.lines.indexOf('GOLD') >= 0 && t.lines.indexOf('18K') >= 0 && t.lines.indexOf('diamond') >= 0 && t.lines.indexOf('4.2g') >= 0 && t.lines.indexOf('18K GOLD') < 0 && t.lines.indexOf('SIZE 6') < 0 && t.lines.indexOf('ELENA') < 0, model + ' jewelry tag prints the JO, metal, karat, stone, and weight');
  eq(tailWhite(t), model + ' jewelry tag tail is blank');
  eq(readableTag(t) && decode(t) === '26-287', model + ' jewelry tag reads upright with the tail to the right, and the QR is 26-287');
});

const noted = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', description: 'thin band', metal: 'yellow gold', client: 'Elena Tan' });
eq(noName(noted) && noted.lines.indexOf('thin band') >= 0 && noted.lines.indexOf('YELLOW GOLD') >= 0 && noted.lines.indexOf('THIN BAND') < 0 && noted.lines.indexOf('ELENA') < 0, 'the item name prints as stored, the metal prints on the spread row, and the client name does not');
const wide = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', name: 'a very long description of this finished piece that cannot fit on one line of the tag', client: 'Elena Tan' });
eq(noName(wide) && wide.lines.some(s => s.indexOf('...') >= 0) && wide.lines.indexOf('ELENA') < 0, 'a name that does not fit is ellipsized and the client name stays off');
const stones = 'Cubic Zirconia 1.25mm x 30 Cubic Zirconia 2.75mm x 3 Round Brilliant 3.00mm x 12 Baguette 4.00mm x 8 Marquise 5mm x 4 and a center stone that keeps going past the third line';
const longStones = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', stones: stones, client: 'Elena Tan' });
const stoneLines = longStones.lines.filter(s => /Cubic|Brilliant|Baguette|Marquise|center|\.\.\./.test(s));
eq(noName(longStones) && stoneLines.length >= 2 && stoneLines.length <= 3 && stoneLines.some(s => s.indexOf('...') >= 0), 'long stones wrap to at most three lines and the last one ellipsizes');
function clearMargin(img) {
  const m = L.px(1), x0 = img.offsetX;
  for (let y = 0; y < img.labelH; y++) for (let x = 0; x < img.labelW; x++) {
    const edge = x < m || x >= img.labelW - m || y < m || y >= img.labelH - m;
    if (!edge) continue;
    if (img.data[(y * img.width + x0 + x) * 4] !== 255) return false;
  }
  return true;
}
/* Readable cable label: flag on the left, blank tail on the right, dashed fold through the middle. */
function paperPx(img, x, y) {
  if (!img.paper || x < 0 || y < 0 || x >= img.paperW || y >= img.paperH) return 255;
  return img.paper[(y * img.paperW + x) * 4];
}
function readableTag(img) {
  if (img.paperW !== 560 || img.paperH !== 240) return false;
  for (let y = 0; y < img.paperH; y++) for (let x = img.labelH; x < img.paperW; x++) if (paperPx(img, x, y) !== 255) return false;
  const fold = 120;
  let dash = 0, gap = 0;
  for (let x = 8; x < 192; x++) { if (paperPx(img, x, fold) === 0) dash++; else gap++; }
  if (dash < 40 || gap < 20) return false;
  const box = img.qrBox;
  if (!box) return false;
  return box.y >= img.labelH - box.size - L.px(2);
}
eq(clearMargin(wide) && clearMargin(longStones), 'tag ink stays about 1 mm inside the flag edges');
function sideMargins(img) {
  const x0 = img.offsetX;
  let left = -1, right = -1;
  for (let x = 0; x < img.labelW; x++) for (let y = 0; y < img.labelH; y++) {
    if (img.data[(y * img.width + x0 + x) * 4] === 0) {
      if (left < 0) left = x;
      right = x;
    }
  }
  return { left: left, right: img.labelW - 1 - right };
}
function sameMargin(img, msg) {
  const m = sideMargins(img);
  eq(m.left >= 0 && Math.abs(m.left - m.right) <= 1, msg);
}
sameMargin(L.render({ kind: 'jo_card', model: 'B31', jo: '26-287', due: '2026-10-21' }), 'B31 JO card left and right ink margins match');
sameMargin(L.render({ kind: 'jo_card', model: 'B31', jo: '26-1287', due: '2026-10-21' }), 'a long JO card keeps equal side margins');
const fullTag = L.render({
  kind: 'jewelry_tag', model: 'B1', price: 11500, name: 'Silver Necklace', item_type: 'Earring',
  metal: 'Gold', karat: '14KWG', stones: 'Cubic Zirconia 1.25mm x 30 Cubic Zirconia 2.75mm x 3',
  weight: 7, jo: '26-002', sku: '18-498', location: 'A.R3', client: 'Elena Tan'
});
const noPrice = L.render({
  kind: 'jewelry_tag', model: 'B1', name: 'Silver Necklace', item_type: 'Earring',
  metal: 'Gold', karat: '14KWG', stones: 'Cubic Zirconia 1.25mm x 30 Cubic Zirconia 2.75mm x 3',
  weight: 7, jo: '26-002', sku: '18-498', location: 'A.R3'
});
eq(readableTag(fullTag) && fullTag.lines.indexOf('₱11,500.00') === 0 && fullTag.lines.indexOf('Silver Necklace') >= 0 && fullTag.lines.indexOf('EARRING') >= 0 && fullTag.lines.indexOf('GOLD') >= 0 && fullTag.lines.indexOf('14KWG') >= 0 && fullTag.lines.indexOf('7g') >= 0 && fullTag.lines.indexOf('26-002') >= 0 && fullTag.lines.indexOf('18-498') >= 0 && fullTag.lines.indexOf('A.R3') >= 0 && fullTag.lines.indexOf('ELENA') < 0 && decode(fullTag) === '26-002', 'a full tag matches the template fields and leaves the client name off');
const readTag = L.render({ kind: 'jewelry_tag', model: 'B1', price: 18500, name: 'Oval sapphire ring', item_type: 'Ring', metal: 'Gold', karat: '18K', stones: 'Sapphire', weight: '20', jo: '26-287', sku: '18-498', location: 'Showroom' });
eq(readTag.specPx === 16 && readTag.joPx === 14 && readTag.qrBox && readTag.qrBox.size >= L.px(9) && readTag.qrBox.size <= L.px(10) && readTag.lines.indexOf('Sapphire') >= 0 && readTag.lines.indexOf('26-287') >= 0 && readTag.lines.indexOf('Showroom') >= 0 && readTag.lines.indexOf('20g') >= 0 && readTag.lines.indexOf('₱18,500.00') >= 0 && readTag.lines.indexOf('Oval sapphire ring') >= 0 && readTag.lines.indexOf('GOLD') >= 0 && decode(readTag) === '26-287', 'a short stone, JO, location, and weight print larger, and the price, description, and metal stay');
function paperGray(img) {
  let gray = 0;
  const d = img.paper || [];
  for (let i = 0; i < d.length; i += 4) if (d[i] !== 0 && d[i] !== 255) gray++;
  return gray;
}
function fringe(img) {
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i];
    if (r > 160 && r < 250) n++;
  }
  return n;
}
const crispPrev = L.preview(readTag, { scale: 4 });
const softPrev = L.preview(readTag, { scale: 4, smooth: true });
eq(paperGray(readTag) === 0, 'the jewelry bitmap is true black on white at 203 dpi');
eq(fringe(crispPrev) * 20 < fringe(softPrev), 'a jewelry preview stays nearest-neighbour unless smoothing is requested');
const longTag = L.render({ kind: 'jewelry_tag', model: 'B1', price: 125000, name: 'Oval sapphire cluster ring with a hidden gallery and a two-line description', item_type: 'Necklace', metal: 'Yellow gold', karat: '18KWG', stones: 'Oval sapphire 2.40ct with tapered baguette shoulders and a hidden halo', weight: '12345', jo: '26-1234A', sku: 'SKU-998877', location: 'Philippine Showroom Vault' });
const longLoc = longTag.lines.filter(s => /Philippine|Showroom|Vault/.test(s));
eq(longTag.lines.indexOf('26-1234A') >= 0 && longTag.lines.indexOf('12345g') >= 0 && longLoc.length === 2 && longLoc.join(' ') === 'Philippine Showroom Vault' && longLoc.every(s => s.indexOf('...') < 0) && longTag.joPx === 14 && longTag.specPx >= 11 && longTag.specPx <= 16 && longTag.lines.some(s => s.indexOf('...') >= 0) && decode(longTag) === '26-1234A' && clearMargin(longTag), 'a long stone, a long location, a 5-digit weight, and a long description stay on the tag');
function outsideFlaps(img) {
  const rects = L.flapRects(img);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4] !== 0) continue;
    let inside = false;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) inside = true;
    }
    if (!inside) return { x: x, y: y };
  }
  return null;
}
function flapInk(img) {
  const x0 = img.offsetX, mid = L.px(15);
  let left = 0, right = 0, minY = img.labelH, maxY = 0;
  for (let y = 0; y < img.labelH; y++) for (let x = 0; x < img.labelW; x++) {
    if (img.data[(y * img.width + x0 + x) * 4] !== 0) continue;
    if (x < mid) left++; else right++;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { left: left, right: right, span: maxY - minY };
}
const flaps = flapInk(fullTag);
eq(!outsideFlaps(fullTag) && tailWhite(fullTag), 'no black pixel falls outside the two flap rectangles');
eq(!outsideFlaps(readTag) && !outsideFlaps(longTag) && tailWhite(readTag) && tailWhite(longTag), 'the larger stone, JO, location, weight, and QR stay inside the flaps');
eq(flaps.left > 40 && flaps.right > 40 && flaps.span > L.px(15), 'each flap carries ink along the feed, not a strip across the top');
function paperReads(img, jo) {
  const view = L.paperView(img);
  const H = img.labelW, flag = img.labelH;
  let black = 0, match = 0, mirrored = 0, x, y, py;
  for (y = 0; y < H; y++) for (x = 0; x < flag; x++) {
    if (paperPx(img, x, y) !== 0) continue;
    black++;
    const px = H - 1 - y;
    py = x;
    if (view.data[(py * view.width + px) * 4] === 0) match++;
    if (view.data[(x * view.width + y) * 4] === 0) mirrored++;
  }
  const hit = jsqr(view.data, view.width, view.height);
  return black > 200 && match === black && mirrored < black * 0.4 && hit && hit.data === jo;
}
eq(paperReads(fullTag, '26-002'), 'the paper view is the design turned onto the label, and its QR reads 26-002');
eq(fullTag.height === L.px(25) + L.px(45) && fullTag.labelH === L.px(25) && fullTag.tail === L.px(45), 'the bitmap is the 25 mm flaps plus the 45 mm tail, and the gap stays with the printer');
function packed(img) {
  let bits = '';
  for (let i = 0; i < img.data.length; i += 4) bits += img.data[i] < 128 ? '1' : '0';
  return bits;
}
const layItem = { kind: 'jewelry_tag', model: 'B1', price: 11500, name: 'Silver Necklace', item_type: 'Earring', metal: 'Gold', karat: '14KWG', stones: 'Cubic Zirconia 1.25mm x 30', weight: 7, jo: '26-002', sku: '18-498', location: 'A.R3', client: 'Elena Tan' };
const layBase = L.normalizeLayout('jewelry_tag', null);
const lay0 = L.render(Object.assign({ layout: layBase }, layItem));
const layPrice = JSON.parse(JSON.stringify(layBase));
layPrice.price.x = 40;
layPrice.price.y = 8;
const lay1 = L.render(Object.assign({ layout: layPrice }, layItem));
const layQr = JSON.parse(JSON.stringify(layBase));
layQr.qr.x = 40;
layQr.qr.y = 8;
layQr.qr.qr = 14;
const lay2 = L.render(Object.assign({ layout: layQr }, layItem));
eq(packed(lay0) !== packed(lay1) && lay1.lines.indexOf('₱11,500.00') >= 0 && lay1.lines.indexOf('ELENA') < 0, 'the encoded bitmap changes when the layout moves the price');
eq(packed(lay0) !== packed(lay2) && lay2.qrBox && lay0.qrBox && lay2.qrBox.size > lay0.qrBox.size && decode(lay2) === '26-002', 'the encoded bitmap changes when the layout enlarges the QR');
eq(paperPx(lay0, 8, 120) === 0 && paperPx(lay0, 12, 120) === 255 && paperPx(lay0, 300, 40) === 255 && decode(lay0) === '26-002', 'the default layout keeps the NIIMBOT fold, a blank tail, and a scannable QR');
eq(!outsideFlaps(lay0), 'a saved layout still keeps every black pixel inside the flap rectangles');
const cardLay = L.normalizeLayout('jo_card', null);
const cardA = L.render({ kind: 'jo_card', model: 'B31', jo: '26-002', due: '2026-10-27', layout: cardLay });
const cardMoved = JSON.parse(JSON.stringify(cardLay));
cardMoved.jo.y = 14;
const cardB = L.render({ kind: 'jo_card', model: 'B31', jo: '26-002', due: '2026-10-27', layout: cardMoved });
eq(packed(cardA) !== packed(cardB) && cardA.lines.indexOf('26-002') >= 0 && cardA.lines.indexOf('DUE 27 OCT') >= 0 && decode(cardA) === '26-002', 'the encoded JO bitmap changes when that layout moves the JO');
eq(!noPrice.lines.some(s => s.indexOf('₱') >= 0 || s.indexOf('0.00') >= 0 || s.indexOf('11,500') >= 0) && noPrice.lines.indexOf('Silver Necklace') >= 0 && noPrice.lines.indexOf('26-002') >= 0, 'a missing price stays blank');
const shiftedTag = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-002', shiftX: L.px(0.5), shiftY: L.px(-1) });
const stillTag = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-002' });
eq(shiftedTag.offsetX === stillTag.offsetX + L.px(0.5) && shiftedTag.qrBox.y === stillTag.qrBox.y - L.px(1), 'a saved offset still moves the jewelry tag on the head');
const cal = L.render({ kind: 'cal_tag', model: 'B31' });
eq(cal.width === 600 && cal.height === 560 && cal.lines.length === 0 && cal.qr === '', 'calibration has no JO text and no name');
function darkAt(img, x, y) { return img.data[(y * img.width + x) * 4] === 0; }
eq(cal.offsetX === 164 && darkAt(cal, cal.offsetX + 20, 0) && !darkAt(cal, cal.offsetX + 20, 4), 'the B31 calibration border is 2 mm left of the head centre and 0.5 mm up');
const calB1 = L.render({ kind: 'cal_jo', model: 'B1' });
eq(calB1.offsetX === 72 && darkAt(calB1, calB1.offsetX + 4, 4), 'B1 calibration stays centred on its head');

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
}
function png(img) {
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset, img.width * img.height * 4).copy(raw, y * (img.width * 4 + 1) + 1, y * img.width * 4, (y + 1) * img.width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const outDir = path.join(root, 'sim/out');
fs.mkdirSync(outDir, { recursive: true });
[['b31-jo-card', L.render(Object.assign({ model: 'B31', client: 'Elena Tan' }, card))],
 ['b1-jo-card', L.render(Object.assign({ model: 'B1', client: 'Elena Tan' }, card))],
 ['b1-jewelry-tag', L.render(Object.assign({ model: 'B1', client: 'Elena Tan' }, tag))],
 ['b31-jewelry-tag', L.render(Object.assign({ model: 'B31', client: 'Elena Tan' }, tag))],
 ['b31-cal-jo', L.render({ kind: 'cal_jo', model: 'B31' })],
 ['b1-cal-tag', L.render({ kind: 'cal_tag', model: 'B1' })]].forEach(([name, img]) => {
  fs.writeFileSync(path.join(outDir, name + '.png'), png(img));
});
eq(fs.existsSync(path.join(outDir, 'b31-jo-card.png')), 'PNG renders were written');
const letterJos = ['26-287B', '26-287', '11-520', '26-1234A'];
const letterImgs = {};
letterJos.forEach(jo => {
  const cardImg = L.render({ kind: 'jo_card', model: 'B31', jo: jo, due: '2026-10-21' });
  const tagImg = L.render({ kind: 'jewelry_tag', model: 'B1', jo: jo });
  letterImgs[jo] = { card: cardImg, tag: tagImg };
  const full = s => s === jo && s.indexOf('...') < 0;
  eq(cardImg.lines[0] && full(cardImg.lines[0]) && cardImg.lines.every(s => s.indexOf('...') < 0) && clearMargin(cardImg) && cardImg.qr === jo && decode(cardImg) === jo, 'B31 JO card ' + jo + ' fits, stays inside the margin, and the QR is ' + jo);
  eq(tagImg.lines[0] && full(tagImg.lines[0]) && tagImg.lines.every(s => s.indexOf('...') < 0) && clearMargin(tagImg) && tagImg.qr === jo && decode(tagImg) === jo, 'B1 jewelry tag ' + jo + ' fits, stays inside the margin, and the QR is ' + jo);
  fs.writeFileSync(path.join(outDir, 'b31-jo-card-' + jo + '.png'), png(cardImg));
  fs.writeFileSync(path.join(outDir, 'b1-jewelry-tag-' + jo + '.png'), png(tagImg));
});
const px287 = letterImgs['26-287'].card.joPx, pxB = letterImgs['26-287B'].card.joPx, pxA = letterImgs['26-1234A'].card.joPx, pxShort = letterImgs['11-520'].card.joPx;
eq(pxShort > px287 && px287 > 19 && px287 < 21 && px287 > pxB && pxB > pxA && pxA >= 12 && pxA < 16, 'a JO card keeps today\'s size when the line fits, and shrinks a 7-character JO plus a letter');
eq(letterImgs['26-1234A'].tag.lines.indexOf('26-1234A') >= 0 && letterImgs['26-287'].tag.lines.indexOf('26-287') >= 0 && letterImgs['26-1234A'].tag.joPx > 0 && letterImgs['26-1234A'].tag.joPx <= letterImgs['26-287'].tag.joPx, 'a jewelry tag keeps the whole JO, and a longer JO does not grow');
const base = L.render(Object.assign({ model: 'B31' }, card));
const moved = L.render(Object.assign({ model: 'B31', shiftX: L.px(0.5), shiftY: L.px(-1) }, card));
eq(moved.offsetX === base.offsetX + L.px(0.5) && moved.qrBox.y === base.qrBox.y - L.px(1), 'a saved offset moves the JO card on the head');
eq(base.offsetX === Math.round((600 - 240) / 2) + L.px(-2) && L.placeBias('B31').y === L.px(-0.5) && L.placeBias('B1').x === 0, 'a B31 label sits 2 mm left of the 600 px head centre and 0.5 mm up');
const cardView = L.preview(base, { scale: 4, smooth: true });
const tagView = L.preview(L.render(Object.assign({ model: 'B1' }, tag)), { scale: 4, smooth: true });
const pad = L.px(4) * 4, rad = L.px(2) * 4;
function pxAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
const corner = pxAt(cardView, 0, 0);
const paper = pxAt(cardView, pad + rad + 8, pad + 6);
const outside = pxAt(cardView, pad + 1, pad + 1);
eq(cardView.width === (240 + L.px(4) * 2) * 4 && cardView.height === (160 + L.px(4) * 2) * 4 && tagView.width === (240 + L.px(4) * 2) * 4 && tagView.height === (L.px(25) + L.px(8) + L.px(4) * 2) * 4, 'a preview is the label, with gray around it');
eq(corner[0] < 180 && corner[0] > 100 && paper[0] > 250 && outside[0] < 180, 'the sticker is a white rounded rectangle on mid-gray');
const shown = L.render(Object.assign({ model: 'B1' }, tag));
eq(tagView.tail === 360 && paperPx(shown, 8, 120) === 0 && paperPx(shown, 12, 120) === 255 && paperPx(shown, 300, 40) === 255, 'the jewelry preview keeps the flaps and a short tail stub, with a printed dashed fold and a blank tail');
const shifted = L.preview(moved, { scale: 1, smooth: false });
const still = L.preview(base, { scale: 1, smooth: false });
function inkX(img) {
  let min = img.width;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4] < 40 && x < min) min = x;
  return min;
}
eq(inkX(shifted) > inkX(still), 'a horizontal offset moves the ink inside the sticker preview');
}

const ctx = { console, Math, Date, String, Object, Array, Number, JSON, LockService: {}, SpreadsheetApp: {} };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(read('paste/PrintQueue.gs'), ctx);
const rows = [];
const a1 = ctx.printRowsEnqueue_(rows, '26-287', 'jo_card', 'scanner', '2026-10-21T00:00:00.000Z', false);
const a2 = ctx.printRowsEnqueue_(rows, '26 287', 'jo_card', 'scanner', '2026-10-21T00:01:00.000Z', false);
eq(a1.created && !a2.created && rows.length === 1 && a2.item.print_id === a1.item.print_id, 'a second enqueue of the same JO card does not add a row');
const letterRows = [];
const lb = ctx.printRowsEnqueue_(letterRows, '26-287', 'jo_card', 'scanner', '2026-10-21T00:00:00.000Z', false);
const lB = ctx.printRowsEnqueue_(letterRows, '26-287B', 'jo_card', 'scanner', '2026-10-21T00:01:00.000Z', false);
const lB2 = ctx.printRowsEnqueue_(letterRows, '26-287B', 'jo_card', 'scanner', '2026-10-21T00:02:00.000Z', false);
eq(ctx.printNormJo_('26-287B') === '26-287B' && ctx.printNormJo_('26-287') === '26-287' && lb.created && lB.created && !lB2.created && letterRows.length === 2 && lb.item.jo === '26-287' && lB.item.jo === '26-287B', '26-287B stays a different queue row from 26-287');
ctx.printRowsMark_(rows, a1.item.print_id, 'printed', 'd-a', 'ada', '2026-10-21T00:02:00.000Z');
const a3 = ctx.printRowsEnqueue_(rows, '26-287', 'jo_card', 'scanner', '2026-10-21T00:03:00.000Z', false);
eq(!a3.created && a3.skipped && rows.length === 1 && rows.filter(r => r.status === 'queued').length === 0, 'enqueue after a printed row does not queue another');
const a4 = ctx.printRowsEnqueue_(rows, '26-287', 'jo_card', 'ada', '2026-10-21T00:04:00.000Z', true);
eq(a4.created && rows.filter(r => r.status === 'queued').length === 1 && rows.length === 2, 'reprint after a printed row queues one new row');
const failedOnly = [{ print_id: 'pq-f', jo: '26-336', kind: 'jo_card', status: 'failed', error: 'Timeout waiting response (waited for e4)', device_id: 'd-a', printed_at: 't', printed_by: 'ada' }];
const again = ctx.printRowsMark_(failedOnly, 'pq-f', 'requeue', 'd-b', 'rosanna', '2026-10-21T00:07:00.000Z');
eq(again.ok && again.requeued && again.item.print_id === 'pq-f' && again.item.status === 'queued' && again.item.error === '' && failedOnly.length === 1, 'print again requeues the same failed row');
const dup = ctx.printRowsEnqueue_(failedOnly, '26-336', 'jo_card', 'rosanna', '2026-10-21T00:08:00.000Z', true);
eq(!dup.created && dup.item.print_id === 'pq-f' && failedOnly.length === 1, 'reprint does not add a row when that JO card is already queued');
const failedReprint = [{ print_id: 'pq-f2', jo: '26-336', kind: 'jo_card', status: 'failed', error: 'x' }];
const rpFailed = ctx.printRowsEnqueue_(failedReprint, '26-336', 'jo_card', 'rosanna', '2026-10-21T00:09:00.000Z', true);
eq(rpFailed.requeued && !rpFailed.created && rpFailed.item.print_id === 'pq-f2' && rpFailed.item.status === 'queued' && failedReprint.length === 1, 'reprint of a failed row requeues it instead of adding one');
const mixed = [
  { print_id: 'pq-p', jo: '26-336', kind: 'jo_card', status: 'printed' },
  { print_id: 'pq-f3', jo: '26-336', kind: 'jo_card', status: 'failed', error: 'x' }
];
const rpMix = ctx.printRowsEnqueue_(mixed, '26-336', 'jo_card', 'rosanna', '2026-10-21T00:10:00.000Z', true);
eq(rpMix.requeued && rpMix.item.print_id === 'pq-f3' && mixed.length === 2 && mixed.filter(r => r.status === 'queued').length === 1, 'reprint dedupes against an existing failed row for the same JO and kind');
const both = [
  { print_id: 'pq-q', jo: '26-336', kind: 'jo_card', status: 'queued' },
  { print_id: 'pq-f4', jo: '26-336', kind: 'jo_card', status: 'failed', error: 'x' }
];
const keepQueued = ctx.printRowsMark_(both, 'pq-f4', 'requeue', 'd-a', 'rosanna', '2026-10-21T00:11:00.000Z');
eq(keepQueued.ok && keepQueued.item.print_id === 'pq-q' && both[1].status === 'failed' && both.length === 2, 'print again does not queue a second row when one is already waiting');
const cancelled = ctx.printRowsMark_([{ print_id: 'pq-f5', jo: '26-336', kind: 'jo_card', status: 'failed', error: 'x' }], 'pq-f5', 'cancelled', 'd-a', 'rosanna', '2026-10-21T00:12:00.000Z');
eq(cancelled.ok && cancelled.item.status === 'cancelled', 'a failed row can be cancelled');
const c1 = ctx.printRowsClaim_(rows, a4.item.print_id, 'd-a', '2026-10-21T00:05:00.000Z');
const c2 = ctx.printRowsClaim_(rows, a4.item.print_id, 'd-b', '2026-10-21T00:05:30.000Z');
eq(c1.ok && c1.claimed && !c2.ok && c2.code === 'TAKEN' && a4.item.device_id === 'd-a', 'two devices cannot claim the same sticker');
const c3 = ctx.printRowsClaim_(rows, a4.item.print_id, 'd-a', '2026-10-21T00:06:00.000Z');
eq(c3.ok && c3.claimed, 'the same device can claim again');
a4.item.printed_at = '2026-10-21T00:00:00.000Z';
const c4 = ctx.printRowsClaim_(rows, a4.item.print_id, 'd-b', '2026-10-21T00:04:00.000Z');
eq(c4.ok && a4.item.device_id === 'd-b', 'a claim older than 3 minutes can be taken');
eq(ctx.printIsFinal_('pickup') && ctx.printIsFinal_('notify') && ctx.printIsFinal_('for_pickup') && ctx.printIsFinal_('', { final: true }), 'pickup, notify, and an explicit final flag are the last step');
eq(!ctx.printIsFinal_('qc') && !ctx.printIsFinal_('') && !ctx.printIsFinal_('', { next: '' }), 'QC and an empty next are not the last step');
const listed = ctx.printRowsList_(rows);
eq(listed.every(r => r.status === 'queued' || r.status === 'failed') && listed.some(r => r.jo === '26-287'), 'the queue list is queued and failed rows');
const bare = ctx.printRowsEnqueue_([], '26-287', 'jewelry_tag', 'ada', '2026-10-21T00:00:00.000Z', false);
eq(bare.ok && bare.item.jo === '26-287' && !('client' in bare.item), 'a queued row does not store a client name');
const idRows = [];
const made = ctx.printRowsEnqueue_(idRows, '26-510', 'jo_card', 'ada', '2026-10-22T00:00:00.000Z', true, true, 'pq-client1', 'dev-a');
eq(made.created && made.item.print_id === 'pq-client1' && made.item.device_id === 'dev-a' && made.item.printed_at === '2026-10-22T00:00:00.000Z' && idRows.length === 1, 'a client print id is stored and claimed by that station');
const replay = ctx.printRowsEnqueue_(idRows, '26-510', 'jo_card', 'ada', '2026-10-22T00:00:01.000Z', true, true, 'pq-client1', 'dev-a');
eq(!replay.created && replay.replay && replay.item.print_id === 'pq-client1' && idRows.length === 1, 'the same client print id does not add a row');
const otherStation = ctx.printRowsClaim_(idRows, 'pq-client1', 'dev-b', '2026-10-22T00:00:02.000Z');
eq(!otherStation.ok && otherStation.code === 'TAKEN', 'another station cannot claim a sticker this station already sent');
const junk = ctx.printRowsEnqueue_([], '26-511', 'jo_card', 'ada', '2026-10-22T00:00:00.000Z', true, true, '../etc/passwd', 'dev-a');
eq(junk.created && junk.item.print_id.indexOf('pq-') === 0 && junk.item.print_id !== '../etc/passwd' && !junk.item.device_id, 'a print id that is not pq- is ignored');
const queuedFirst = [{ print_id: 'pq-oldrow', jo: '26-512', kind: 'jo_card', status: 'queued', device_id: '', printed_at: '' }];
const adopt = ctx.printRowsEnqueue_(queuedFirst, '26-512', 'jo_card', 'ada', '2026-10-22T00:00:00.000Z', true, true, 'pq-newid1', 'dev-a');
eq(!adopt.created && adopt.item.print_id === 'pq-oldrow' && queuedFirst.length === 1, 'a waiting row is reused instead of storing a second id');

// Sheet side: specs and the on-screen name come from one JobOrders read and one Clients read; a Date due prints as a day.
let jobReads = 0;
ctx.jobRows_ = function (name) {
  jobReads++;
  if (name === 'JobOrders') return [{ jo: '26-287', client_id: 'c-1', metal: 'yellow gold', karat: '18k', weight_g: 3.2, stone_type: 'diamond', stone_size: '0.5ct', size: '6', due_date: new Date(2026, 9, 27), price: 11500, description: 'Silver Necklace', item_type: 'earring', sku: '18-498', location: 'A.R3', stones: 'Cubic Zirconia 1.25mm x 30' }];
  if (name === 'Clients') return [{ client_id: 'c-1', name: 'Elena Tan' }];
  return [];
};
const look = ctx.printLookup_();
const d1 = ctx.printDecorate_({ print_id: 'pq-1', jo: '26-287', kind: 'jewelry_tag', status: 'queued' }, look);
const d2 = ctx.printDecorate_({ print_id: 'pq-2', jo: '26-287', kind: 'jo_card', status: 'queued' }, look);
eq(jobReads === 2 && d1.client === 'Elena Tan' && d2.client === 'Elena Tan', 'the queue reads JobOrders and Clients once and shows the name on screen');
eq(d1.due_date === '2026-10-27' && d1.metal === 'yellow gold' && d1.stone_size === '0.5ct' && d1.price === '11500' && d1.description === 'Silver Necklace' && d1.item_type === 'earring' && d1.sku === '18-498' && d1.location === 'A.R3' && d1.stones === 'Cubic Zirconia 1.25mm x 30', 'a Date due is a day, and the tag fields are joined');
if (draw) {
  const r1 = L.render(Object.assign({ model: 'B1', kind: 'jewelry_tag' }, { jo: d1.jo, price: d1.price, description: d1.description, item_type: d1.item_type, karat: d1.karat, metal: d1.metal, weight: d1.weight_g, stones: d1.stones, stone: d1.stone_type, stone_size: d1.stone_size, sku: d1.sku, location: d1.location, size: d1.size }));
  const r2 = L.render({ model: 'B1', kind: 'jewelry_tag', jo: d1.jo, price: d1.price, description: d1.description, item_type: d1.item_type, karat: d1.karat, metal: d1.metal, weight: d1.weight_g, stones: d1.stones, stone: d1.stone_type, stone_size: d1.stone_size, sku: d1.sku, location: d1.location, size: d1.size, client: d1.client });
  eq(same(r1.data, r2.data) && noName(r2) && r2.lines.indexOf('₱11,500.00') >= 0 && r2.lines.indexOf('Silver Necklace') >= 0 && r2.lines.indexOf('EARRING') >= 0 && r2.lines.indexOf('A.R3') >= 0 && r2.lines.indexOf('18-498') >= 0, 'a decorated row prints the tag fields and ignores the client name');
  const card2 = L.render({ model: 'B31', kind: 'jo_card', jo: '26-287', due: d1.due_date });
  eq(card2.lines.indexOf('DUE 27 OCT') >= 0, 'a JO card due line reads DUE 27 OCT');
}
let locks = 0;
ctx.withLock_ = function (fn) { locks++; return fn(); };
const sheetRows = [];
ctx.printReadRows_ = function () { return { sh: null, rows: sheetRows, head: ctx.PRINT_COLS }; };
ctx.printWriteRow_ = function (pack, row) { row._w = 1; };
ctx.printAfterMove_({ jo: '26-287', to: 'pickup' }, { ok: true, jo: '26-287', to: 'notify' }, { username: 'susan' });
eq(locks === 0 && sheetRows.length === 1 && sheetRows[0].kind === 'jewelry_tag', 'a move into Pickup queues a tag without taking the lock again');
ctx.printAfterMove_({ jo: '26-288', to: 'qc' }, { ok: true, jo: '26-288', to: 'qc' }, { username: 'susan' });
eq(sheetRows.length === 1, 'a move into QC queues nothing');
ctx.printEnqueue_('26-290', 'jo_card', 'scanner', {});
eq(locks === 1 && sheetRows.length === 2, 'a scan enqueue takes the lock once');
const codePatch = read('paste/Code.gs.print.patch.txt'), pq = read('paste/PrintQueue.gs');
eq(codePatch.indexOf("Bad token' });\n    if (req.op === 'printQueue'") >= 0 && codePatch.indexOf('deletePage') < 0, 'scanner print ops sit before fastBump_, so a poll keeps the page cache');
eq(pq.indexOf('clearContents') < 0, 'PrintQueue never clears the tab');
eq(read('print.js').indexOf('Promise.resolve(task.printEnd())') >= 0 && read('print.js').includes('withTimeout(Promise.resolve(task.printEnd())'), 'printEnd runs after every print task and cannot hold the queue');

const app = read('app.js'), index = read('staff/index.html'), fast = read('paste/Fast.gs.print.patch.txt'), dash = read('paste/DashCache.gs.print.patch.txt');
const cached = app.slice(app.indexOf('const CACHED'), app.indexOf('const READS'));
eq(/printQueue:\s*1/.test(app) && !/printQueue/.test(cached), 'printQueue is a client read and is not cached');
eq(!/printMark\s*:\s*1/.test(app) && !/printEnqueue\s*:\s*1/.test(app) && !/printReprint\s*:\s*1/.test(app), 'print writes are not client reads');
eq(fast.includes('priceJobCost: 1, printQueue: 1') && !fast.includes('dashboard: 1, printQueue'), 'Fast READS gains printQueue and FAST.CACHE does not');
eq(dash.includes('listUsers: 1, printQueue: 1') && !dash.includes("action !== 'printQueue'"), 'DashCache READS gains printQueue and the dashboard spec does not');
eq(index.includes('print.js?v=34') && index.includes('print-label.js?v=16') && index.includes('nav.js?v=72') && index.includes('app.js?v=43') && index.includes('settings.js?v=22') && index.includes('print.css?v=22') && index.includes('app.css?v=65') && index.includes('settings.css?v=11') && index.includes('inv.js?v=32') && index.includes('production.js?v=15') && index.includes('production.css?v=12') && index.includes('photos.js?v=16') && index.includes('review.js?v=23') && index.includes('count.js?v=3') && index.includes('count.css?v=2') && read('print.js').includes('print.css?v=22') && read('sim/swipe-preview.html').includes('print.css?v=22'), 'print assets are cache-busted');
eq(read('nav.js').includes('print-label.js?v=16') && read('nav.js').includes('print.js?v=34') && read('nav.js').includes('scan-zones.js?v=21') && read('nav.js').includes('menuHtml'), 'the scanner injects the current label renderer');
eq(read('staff/print-test.html').includes('print.js?v=34') && read('staff/print-test.html').includes('print-label.js?v=16') && read('staff/print-test.html').includes('print.css?v=22') && read('staff/print-test.html').includes('nav.js?v=72') && read('staff/print-test.html').includes('app.css?v=65'), 'print test loads the same print assets');
function assetVer(src, file) {
  const m = String(src).match(new RegExp(file.replace(/\./g, '\\.') + '\\?v=(\\d+)'));
  return m ? m[1] : '';
}
const printVer = (read('print.js').match(/var PRINT_JS = (\d+)/) || [])[1];
eq(printVer && printVer === assetVer(read('nav.js'), 'print.js') && printVer === assetVer(read('staff/index.html'), 'print.js') && printVer === assetVer(read('staff/print-test.html'), 'print.js'), 'nav.js injects the same print.js version the print station loads');
eq(read('print.js').includes("console.log('[oyp-print] print.js v' + PRINT_JS)") && read('print.js').includes('id="prBuild">print.js v\' + PRINT_JS'), 'the print station logs and shows its print.js version');
const { execFileSync } = require('child_process');
function gitShow(rel) {
  try { return execFileSync('git', ['show', 'origin/main:' + rel], { encoding: 'utf8' }); }
  catch (e) { return ''; }
}
const mainNav = gitShow('nav.js');
if (mainNav && mainNav !== read('nav.js')) {
  eq(assetVer(read('staff/index.html'), 'nav.js') !== assetVer(gitShow('staff/index.html'), 'nav.js'), 'nav.js changed since main, so staff/index.html bumps nav.js');
  eq(assetVer(read('staff/print-test.html'), 'nav.js') !== assetVer(gitShow('staff/print-test.html'), 'nav.js'), 'nav.js changed since main, so the print test bumps nav.js');
  eq(assetVer(read('scan/index.html'), 'nav.js') !== assetVer(gitShow('scan/index.html'), 'nav.js'), 'nav.js changed since main, so the scanner bumps the absolute nav.js URL');
}
eq(read('print.js').includes('offsetMm') && read('staff/print-test.html').includes('prOff'), 'offsets are saved per model and shown on the print test page');
eq(/\.oyp-prevstage canvas,\.oyp-prevbig\{[^}]*image-rendering:pixelated/.test(read('print.css')) && /\.oyp-qprev\{[^}]*image-rendering:pixelated/.test(read('print.css')) && read('print.js').includes('{ scale: 4, smooth: false }') && !read('print.js').includes('smooth: true'), 'preview canvases keep the 203 dpi pixels crisp');
eq(read('staff/print-test.html').includes('OYPLabel.preview') && read('print.js').includes('oyp-qprev'), 'print test and the queue preview the sticker, not the printhead');
const testPage = read('staff/print-test.html'), testCss = read('print.css');
const b31At = testPage.indexOf('B31 Printer for 30x20 - Test'), b1Card = testPage.indexOf('B1 Printer for 30x20 - Test'), b1Tag = testPage.indexOf('B1 Printer for Jewelry Tag - Test');
eq(b31At > 0 && testPage.indexOf('B31 calibration') > b31At && b1Card > testPage.indexOf('B31 calibration') && b1Tag > b1Card && testPage.indexOf('B1 calibration') > b1Tag, 'print test titles name the B31 card, the B1 card, and the B1 jewelry tag');
eq(testCss.includes('grid-template-columns:1fr 1fr') && testCss.includes('.pr-stage') && testCss.includes('justify-content:center') && /max-width:800px/.test(testCss), 'print test is two equal columns and stacks below an iPad portrait');
eq(testPage.includes('class="top"') && testPage.includes('id="btnMenu"') && testPage.includes('class="logo"') && !testPage.includes('printChip') && !index.includes('printChip') && testPage.includes('class="office"') && testPage.includes('id="side"') && testPage.includes('class="side"') && testPage.includes('OYPNav.sideHtml') && testPage.includes('app.css?v=65') && testPage.includes('OYPNav.menuHtml'), 'print test uses the staff header and the same left menu, with no printer pill');
eq(read('print.js').includes('Print queue not set up yet') && read('print.js').includes('No stickers waiting') && read('print.js').includes('class="pill sm"') && read('print.js').includes('class="dchip') && read('print.js').includes('class="setp') && read('print.js').includes('class="cn"') && read('print.js').includes('whomenu') && read('print.css').includes(':where(') && !read('print.css').includes('.oyp-pr-btn') && testPage.includes("'dcard'") && testPage.includes("'dtitle'") && testPage.includes('class="setbox" id="printQueue"'), 'print controls use the staff cards, pills, rows, and menu');
eq(read('print.js').includes('Open in Chrome or Edge to connect a printer') && read('print.js').includes("iPad can't connect a printer. Stickers wait in the print queue.") && read('print.js').includes('Connect by Bluetooth') && read('print.js').includes('Connect by USB') && read('print.js').includes('aria-label="Close"') && read('print.js').includes("e.key !== 'Escape'"), 'Safari sees how to connect, and the queue panel can close');
eq(testPage.indexOf('<h2>Print queue</h2>') < testPage.indexOf('<h2>Settings</h2>') && testPage.indexOf('<h2>Settings</h2>') < testPage.indexOf('<h2>Label alignment</h2>') && testPage.indexOf('<h2>Printer</h2>') < 0, 'print test leads with the queue, then settings, then label alignment');
eq(read('print.js').includes('id="prDark"') && read('print.css').includes('#prDark .pill.sm{min-width:32px;text-align:center;font-family:var(--head,\'Libre Bodoni\',Georgia,serif);font-size:var(--d-btnout-fp,calc(18px*var(--hs)));font-weight:var(--d-btnout-g,500)}') && read('print.css').includes('#prDark .pill.sm:not(.outline){border:1px solid #111}'), 'each darkness number is the same font and size, at least 32 px wide');
eq(testPage.includes('class="pr-sec"') && testCss.includes('.pr-sec + .pr-sec{margin-top:calc(22px * var(--sp,1))}') && testCss.includes('.pr-page h2{margin:0 0 calc(8px * var(--sp,1))}') && testCss.includes('.pr-copy{display:flex;flex-direction:column;gap:calc(22px * var(--sp,1))}') && testCss.includes('.pr-page .pr-copy p.muted{margin:0;max-width:none}') && testCss.includes('.pr-page #printSet .setbox + p.muted{margin:calc(8px * var(--sp,1)) 0 0;max-width:none}') && testCss.includes('.pr-page .setbox{max-width:none;width:100%}'), 'print test sections share one width and the staff spacing steps');
eq(read('settings.css').includes('.setbox + .setbox{margin-top:calc(14px*var(--sp))}') && read('staff/print-test.html').includes('settings.css?v=11') && read('staff/index.html').includes('settings.css?v=11'), 'stacked set boxes keep the 14px card gap');
eq(read('print.js').includes('labelOpts') && !/client:\s*item\.client/.test(read('print.js')), 'the printer payload builder does not copy the client name');
const navMod = require(path.join(root, 'nav.js'));
const adminUser = { role: 'admin', username: 'ada', display_name: 'Ada' };
const adminMenu = navMod.menuHtml(adminUser, '', 'index.html');
const adminSide = navMod.sideHtml(adminUser, '', 'index.html');
eq(adminMenu.includes('>Settings</a><a data-oyp-printer="1" role="button" tabindex="0" title="Printer not connected">Printer<span class="oyp-pr-dot"'), 'Printer sits directly under Settings in the phone menu');
eq(adminSide.includes('>Settings</a><a data-oyp-printer="1"') && adminSide.includes('class="sidenav"') && adminSide.includes('id="whoBtn"'), 'the desktop side menu matches, with the account block');
eq(adminMenu.includes('>Printer<span class="oyp-pr-dot"') && !adminMenu.includes('pill') && adminMenu.includes('Dashboard') && adminMenu.indexOf('Card scanner') < 0, 'Printer is a plain menu row for a signed-in admin');
eq(navMod.menuHtml(null, '', 'index.html').indexOf('Card scanner') >= 0, 'a signed-out menu is the card scanner link');
const pmMenu = navMod.menuHtml({ role: 'production_manager', username: 'sue', display_name: 'Sue' }, '', '');
const staffMenu = navMod.menuHtml({ role: 'staff', username: 'ann', display_name: 'Ann' }, '', '');
const acctMenu = navMod.menuHtml({ role: 'accounting', username: 'bea', display_name: 'Bea' }, '', '');
eq(pmMenu.includes('data-oyp-printer') && staffMenu.includes('data-oyp-printer') && acctMenu.includes('data-oyp-printer'), 'every role menu that can print includes Printer');
eq(read('app.js').includes('printerItemHtml') && read('app.js').includes("k === 'settings'"), 'the desktop staff menu adds Printer under Settings');
eq(read('print.js').includes('>CANCEL</button>') && read('print.js').includes('class="pill sm outline" data-q="cancel"') && !read('print.js').includes('class="lnk" data-q="cancel"'), 'Cancel is the same outline pill as Reprint');
eq(read('print.js').includes('JO sticker') && read('print.js').includes('Jewelry tag') && read('print.js').includes("'prAutoJo'") && read('print.js').includes("'prAutoTag'") && read('print.js').includes('class="settog"') && read('print.js').includes('data-q="drain"') && read('print.js').includes('>Print queued</button>') && !read('print.js').includes('On: new JO cards and finished tags are queued and printed.'), 'JO sticker and jewelry tag each have an auto-print switch');
eq(read('print.js').includes('postMessage(1)') && read('print.js').includes('new WorkerFn') && read('print.js').includes('setInterval(pollTick, POLL)') && read('print.js').includes('MODEL_TASKS') && !/visibilityState === 'hidden'/.test(read('print.js')), 'hidden tabs keep polling from a worker, with setInterval only as a fallback');
eq(read('print.js').includes('data-q="again"') && read('print.js').includes('class="muted oyp-qerr"') && !read('print.js').includes('chip gold') && read('print.js').includes('Printer did not respond'), 'a failed row prints again, shows why, and uses the shared chip');
eq(read('print.js').includes('startHeartbeat') && read('print.js').includes('getDevices') && read('print.js').includes('authorizedDevice') && read('print.js').includes('Printer disconnected. Tap Printer to reconnect'), 'a dropped Bluetooth link heartbeats and reconnects without the picker');
eq(read('print.css').includes('.oyp-pr-dot.busy{background:#a37b12}') && read('print.js').includes('Reconnecting') && read('print.js').includes('Printing'), 'the menu dot is red, green, or amber, with a title');
eq(read('paste/PrintQueue.gs').includes("op === 'requeue'") && read('paste/PrintQueue.gs').includes('res.requeued') && read('paste/PrintQueue.gs.requeue.patch.txt').includes('printRowReset_'), 'the sheet requeues a failed row in place');
eq(read('print.js').includes('kindsByModel') && read('print.css').includes('.oyp-pr-dot{') && read('print.css').includes('.oyp-pr-dot.on{'), 'kinds are stored per model, and the menu dot has a connected color');
eq(read('print.js').includes('function printerMarks') && read('print.js').includes('function connectSlot') && read('print.js').includes('authorizedPort') && read('print.js').includes('data-slot-act') && read('print.css').includes('.oyp-pr-name') && read('print.css').includes('.oyp-pr-pair'), 'each set-up printer has a model name and its own connect row');
eq(read('print.css').includes('.oyp-pr-status::before') && read('print.css').includes('width:1px;height:14px') && read('print.css').includes('background:#ccc') && read('print.css').includes('padding-left:10px') && read('print.js').includes('class="oyp-pr-status"') && !read('print.js').includes("'>|'") && !read('print.js').includes('Printer|'), 'the menu divider is a 1px line before the first printer name');
eq(pq.includes('String(req.mark || req.op || \'\')') && !pq.includes('String(req.op || req.mark || \'\')'), 'printMark prefers mark over op');
ctx.printDecorate_ = function (item) { return item; };
const marked = ctx.printMark_({ op: 'printMark', mark: 'cancelled', print_id: sheetRows[0].print_id, device_id: 'd-x' }, { username: 'scanner' });
eq(marked.ok && marked.item && marked.item.status === 'cancelled', 'a scanner printMark with op printMark still cancels when mark is cancelled');
eq(codePatch.includes('req.printJo !== false') && codePatch.includes('req.printTag !== false') && codePatch.includes("printEnqueue_(full, 'jo_card', 'scanner', {})") && codePatch.includes("printEnqueue_(full, 'jewelry_tag', 'scanner', {})") && !codePatch.includes("printEnqueue_(jo,") && !read('print.js').includes('imageBase64'), 'Code.gs queues both stickers from the full JO, letter included, and the page does not enqueue a scan');
eq(read('production.js').includes('function joScan') && read('production.js').includes("#/production/jo/' + encodeURIComponent") && read('review.js').includes('function joBits') && read('review.js').includes('function headJo') && read('inv.js').includes('function ivFindScan') && read('inv.js').includes('p.base + p.letter'), 'a scanned 26-287B opens that JO in inventory, production, and the JO list');
const revBag = {};
ctx.CacheService = { getScriptCache() { return { get(k) { return Object.prototype.hasOwnProperty.call(revBag, k) ? revBag[k] : null; }, put(k, v) { revBag[k] = String(v); } }; } };
const revFull = ctx.printQueue_({}, { username: 'ada' });
const revBrief = ctx.printQueue_({ brief: 1 }, { username: 'ada' });
eq(revFull.ok && revFull.rev === '1' && Array.isArray(revFull.items) && revBrief.brief === true && revBrief.rev === '1' && !revBrief.items, 'a brief printQueue is the rev and does not list rows');
const revBefore = ctx.printRevRead_();
ctx.printEnqueue_('26-291', 'jo_card', 'ada', {});
eq(ctx.printRevRead_() !== revBefore, 'creating a row bumps the rev');
const revHeld = ctx.printRevRead_();
ctx.printEnqueue_('26-291', 'jo_card', 'ada', {});
eq(ctx.printRevRead_() === revHeld, 'a duplicate enqueue does not bump the rev');
const propBag = {};
ctx.PropertiesService = { getScriptProperties() { return { getProperty(k) { return Object.prototype.hasOwnProperty.call(propBag, k) ? propBag[k] : null; }, setProperty(k, v) { propBag[k] = String(v); } }; } };
propBag.print_auto = '0';
const rowsBeforeOff = sheetRows.length;
const scanOff = ctx.printEnqueue_('26-400', 'jo_card', 'scanner', {});
ctx.printAfterMove_({ jo: '26-401', to: 'pickup' }, { ok: true, to: 'notify' }, { username: 'susan' });
eq(scanOff.ok && scanOff.skipped && scanOff.auto.jo_card === false && scanOff.auto.jewelry_tag === false && sheetRows.length === rowsBeforeOff, 'auto off queues nothing from a scan or a pickup move');
const manualOff = ctx.printEnqueue_('26-400', 'jo_card', 'ada', { reprint: true });
eq(manualOff.created && sheetRows.length === rowsBeforeOff + 1, 'a manual reprint still queues when auto is off');
const setOn = ctx.printAutoSet_({ on: 0 }, { username: 'ada' });
const setBack = ctx.printAutoSet_({ on: 1 }, { username: 'ada' });
eq(setOn.auto.jo_card === false && setOn.auto.jewelry_tag === false && setBack.ok && setBack.auto.jo_card === true && setBack.auto.jewelry_tag === true && ctx.printAutoOn_(), 'a missing per-kind switch follows the old print_auto value');
const onlyTag = ctx.printAutoSet_({ kind: 'jo_card', on: 0 }, { username: 'ada' });
const scanJoOff = ctx.printEnqueue_('26-410', 'jo_card', 'scanner', {});
const tagStill = ctx.printEnqueue_('26-411', 'jewelry_tag', 'susan', {});
eq(onlyTag.auto.jo_card === false && onlyTag.auto.jewelry_tag === true && scanJoOff.skipped && tagStill.created, 'turning off JO sticker still queues a jewelry tag');
ctx.printAutoSet_({ kind: 'jo_card', on: 1 }, { username: 'ada' });
function scanEnqueue(jo, req) {
  const out = [];
  if ((parseInt(req && req.page, 10) || 1) !== 1) return out;
  if (req.printJo !== false) out.push(ctx.printEnqueue_(jo, 'jo_card', 'scanner', {}));
  if (req.printTag !== false) out.push(ctx.printEnqueue_(jo, 'jewelry_tag', 'scanner', {}));
  return out;
}
const bothScan = scanEnqueue('26-420', { page: 1 });
const bothAgain = scanEnqueue('26-420', {});
eq(bothScan.length === 2 && bothScan[0].created && bothScan[0].item.kind === 'jo_card' && bothScan[1].created && bothScan[1].item.kind === 'jewelry_tag' && bothAgain[0].created === false && bothAgain[1].created === false, 'a page-1 scan queues both stickers, and a second scan does not duplicate them');
const tagOnly = scanEnqueue('26-421', { printJo: false, printTag: true });
const cardOnly = scanEnqueue('26-422', { printJo: true, printTag: false });
const noneScan = scanEnqueue('26-423', { printJo: false, printTag: false });
const page2 = scanEnqueue('26-424', { page: 2, printJo: true, printTag: true });
eq(tagOnly.length === 1 && tagOnly[0].created && tagOnly[0].item.kind === 'jewelry_tag' && cardOnly.length === 1 && cardOnly[0].item.kind === 'jo_card' && noneScan.length === 0 && page2.length === 0, 'printJo and printTag each skip one sticker, and a later page queues nothing');
ctx.printRowsMark_(sheetRows, tagOnly[0].item.print_id, 'printed', 'd-a', 'ada', '2026-10-21T01:00:00.000Z');
const tagRows = sheetRows.filter(r => r.jo === '26-421').length;
ctx.printAfterMove_({ jo: '26-421', to: 'pickup' }, { ok: true, to: 'notify' }, { username: 'susan' });
eq(sheetRows.filter(r => r.jo === '26-421').length === tagRows, 'Pickup skips a jewelry tag that was already printed');
const scanOn = ctx.printEnqueue_('26-402', 'jo_card', 'scanner', {});
eq(scanOn.created, 'auto on queues a scan again');
propBag.print_auto = '0';
propBag.print_auto_jo_card = '0';
propBag.print_auto_jewelry_tag = '0';
const batchJobs = [{ jo: '26-280' }, { jo: '26-281' }, { jo: '26-283A' }, { jo: '26-283' }, { jo: '26-300' }, { jo: '26-301' }, { jo: '25-290' }];
ctx.jobRows_ = function (name) { return name === 'JobOrders' ? batchJobs : []; };
const batchWrites = [];
const batchSheet = {
  getLastRow() { return 4; },
  getRange(row, col, numRows, numCols) {
    return { setNumberFormat() { return this; }, setValues(lines) { batchWrites.push({ row, col, numRows, numCols, lines }); }, getValues() { return [[]]; } };
  }
};
ctx.printReadRows_ = function () { return { sh: batchSheet, rows: sheetRows, head: ctx.PRINT_COLS }; };
const beforeBatch = sheetRows.length;
const preview = ctx.printEnqueueBatch_({ from: '26-280', to: '26-300', kind: 'jo_card', preview: 1 }, { username: 'ada' });
const ordered = ctx.printBatchJobs_({ from: '26-280', to: '26-300', kind: 'jewelry_tag' });
eq(preview.ok && preview.preview && preview.count === 5 && preview.jos.join(',') === '26-280,26-281,26-283,26-283A,26-300' && batchWrites.length === 0 && sheetRows.length === beforeBatch, 'a range preview counts existing JOs and writes nothing');
const oneMiss = ctx.printEnqueueBatch_({ from: '26-283B', to: '26-283B', kind: 'jo_card', preview: 1 }, { username: 'ada' });
const oneHit = ctx.printEnqueueBatch_({ from: '26-280', to: '26-280', kind: 'jewelry_tag', preview: 1 }, { username: 'ada' });
eq(oneMiss.ok && oneMiss.preview && oneMiss.jos.indexOf('26-283B') < 0 && oneMiss.jos.indexOf('26-283') >= 0 && oneMiss.jos.indexOf('26-283A') >= 0 && batchWrites.length === 0, 'a single number lists the JOs that exist and does not write');
eq(oneHit.ok && oneHit.jos.join(',') === '26-280', 'a single existing number is the only JO in that preview');
eq(ordered.ok && ordered.jobs.map(j => j.jo).join(',') === '26-280,26-281,26-283,26-283A,26-300', 'a range keeps JO order and skips missing numbers');
const ranged = ctx.printEnqueueBatch_({ from: '26-280', to: '26-300', kind: 'jo_card' }, { username: 'ada' });
eq(ranged.ok && ranged.queued === 5 && ranged.auto.jo_card === false && batchWrites.length === 1 && batchWrites[0].lines.length === 5 && batchWrites[0].numRows === 5, 'a manual range queues while auto-print is off, in one setValues');
const rangedAgain = ctx.printEnqueueBatch_({ from: '26-280', to: '26-300', kind: 'jo_card' }, { username: 'ada' });
eq(rangedAgain.ok && rangedAgain.queued === 0 && rangedAgain.skipped === 5 && batchWrites.length === 1, 'a second range skips stickers already queued');
const listedBatch = ctx.printEnqueueBatch_({ items: [{ jo: '26-280', kind: 'jo_card' }, { jo: '26-280', kind: 'jo_card' }, { jo: '26-310', kind: 'jewelry_tag' }] }, { username: 'ada' });
eq(listedBatch.ok && listedBatch.queued === 1 && listedBatch.skipped === 1 && batchWrites.length === 2 && batchWrites[1].lines.length === 1, 'a list queues one new sticker and skips the duplicate');
sheetRows.push({ print_id: 'pq-failb', jo: '26-320', kind: 'jo_card', status: 'failed', error: 'x', _r: 3 });
const failWrites = batchWrites.length;
const requeued = ctx.printEnqueueBatch_({ items: [{ jo: '26-320', kind: 'jo_card' }] }, { username: 'ada' });
const failRow = sheetRows.find(r => r.print_id === 'pq-failb');
eq(requeued.queued === 1 && failWrites === batchWrites.length && failRow.status === 'queued' && failRow._w === 1 && sheetRows.filter(r => r.jo === '26-320').length === 1, 'a failed row in a batch is requeued in place');
const tooMany = [];
for (let n = 0; n < 201; n++) tooMany.push({ jo: '26-' + String(1000 + n), kind: 'jo_card' });
const capRows = sheetRows.length;
const capped = ctx.printEnqueueBatch_({ items: tooMany }, { username: 'ada' });
eq(capped.ok === false && capped.code === 'CAP' && capped.count === 201 && batchWrites.length === failWrites && sheetRows.length === capRows, 'more than 200 stickers are refused and nothing is written');
eq(read('inv.js').includes('id="ivChoose"') && read('inv.js').includes('Print stickers (${n})') && read('inv.js').includes('askPrint') && read('inv.js').includes('ivPrintJo') && !read('inv.js').includes('#ivScan') && !read('inv.js').includes('id="ivScan"') && read('inv.js').includes('Search or scan JO, client, 18k, sapphire…') && read('inv.js').includes('ivScanCommit') && read('inv.js').includes('ivQFast') && read('inv.js').includes('ivFullJo') && read('production.js').includes('id="pChoose"') && read('production.js').includes('Print stickers (${S.sel.size})') && read('production.js').includes('askPrint') && read('production.js').includes('joShown') && read('app.css').includes('.iv.choose .ivck') && !read('app.css').includes('.ivcard:hover .ivck') && read('print.js').includes('Print a range') && read('print.js').includes('preview: 1') && read('print.js').includes("'printEnqueueBatch'") && read('print.js').includes('data-oyp-ask') && read('print.js').includes('printJo(item.kind') && read('print.css').includes('transition:transform 50ms') && read('settings.js').includes('id="printRange"') && testPage.includes('id="printRange"'), 'lists stay clear until Select, and a range shows its count before it queues');
eq(read('inv.js').includes('class="ivmore"') && !read('inv.js').includes('class="ivmenu"') && read('inv.js').includes('OYP.popover') && read('inv.js').includes("label: 'Print'") && read('inv.js').includes("label: 'Details'") && read('inv.js').includes("label: 'Move location'") && read('inv.js').includes("label: 'Delete'") && read('inv.js').includes("confirm('Delete ") && read('inv.js').includes('p.base + p.letter') && read('app.js').includes('function popover') && read('app.css').includes('.oyp-pop{position:fixed') && read('app.css').includes('z-index:80') && read('todo.js').includes('OYP.popover'), 'the inventory menu floats above the card, and the to-do menu uses the same popover');
eq(testPage.includes("textContent = 'Download'") && testPage.includes("textContent = 'PRINT'") && !testPage.includes('DOWNLOAD PNG') && testPage.includes("png.className = 'pill sm outline'") && testPage.includes("go.className = 'pill sm'") && testCss.includes('.oyp-pr-acts .pill.sm.outline,.oyp-qbtns .pill.sm.outline{align-self:stretch;display:inline-flex;align-items:center;justify-content:center;font-family:var(--head,\'Libre Bodoni\',Georgia,serif);font-size:var(--d-btnsm-fp,calc(14px*var(--hs)));font-weight:var(--d-btnsm-g,500);letter-spacing:0;border-width:1px;padding-top:calc(9px*var(--sp) - 1px)'), 'Download matches Print in size and stays an outline');

function bootPrint(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const calls = [];
  const intervals = [];
  const workers = [];
  let vis = opts.visibility || 'visible';
  const doc = {
    readyState: 'complete',
    get visibilityState() { return vis; },
    documentElement: { getAttribute(name) { return name === 'data-oyp-scanner' ? '0' : null; } },
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementsByTagName() { return []; },
    createElement() {
      const el = { className: '', rel: '', href: '', width: 0, height: 0, style: {}, setAttribute() {}, appendChild() {}, click() {}, remove() {} };
      el.getContext = function () {
        return { fillStyle: '#fff', imageSmoothingEnabled: false, fillRect() {}, drawImage() {} };
      };
      return el;
    },
    _listeners: {},
    addEventListener(name, fn) {
      (this._listeners[name] || (this._listeners[name] = [])).push(fn);
    }
  };
  function WorkerCtor() {
    if (opts.workerFails) throw new Error('no worker');
    this.onmessage = null;
    workers.push(this);
  }
  WorkerCtor.prototype.terminate = function () {};
  const nextModel = (opts.models || ['B1']).slice();
  const nextName = (opts.names || []).slice();
  const tasks = [];
  const encodes = [];
  const logs = [];
  const timeline = [];
  let vnow = 0;
  const lag = opts.lag || null;
  const clients = [];
  const connects = [];
  const notes = [];
  const held = [];
  const pages = (opts.pages || []).slice();
  const timers = [];
  let timerSeq = 1;
  let gattConnects = 0;
  function fakeSet(fn, ms) {
    const id = timerSeq++;
    timers.push({ id: id, fn: fn, ms: ms || 0, on: true });
    return id;
  }
  function fakeClear(id) { timers.forEach(function (t) { if (t.id === id) t.on = false; }); }
  function flush(limit) {
    let guard = 0, fired = true;
    while (fired && guard++ < 40) {
      fired = false;
      timers.slice().forEach(function (t) {
        if (t.on && t.ms <= limit) { t.on = false; fired = true; t.fn(); }
      });
    }
  }
  function poke(limit) {
    timers.slice().forEach(function (t) {
      if (t.on && t.ms <= limit) { t.on = false; t.fn(); }
    });
  }
  function Task(name) { this.name = name; tasks.push(name); }
  Task.prototype.printInit = function () { return Promise.resolve(); };
  Task.prototype.printPage = function () {
    timeline.push({ ev: 'send', t: vnow });
    const step = pages.length ? pages.shift() : 'ok';
    if (step === 'e4') return Promise.reject(new Error('Timeout waiting response (waited for e4)'));
    if (step === 'hang') return new Promise(function () {});
    if (step === 'hold') return new Promise(function (resolve) { held.push({ mark: 'page', resolve: resolve }); });
    const sendMs = lag ? lag.send : 0;
    if (!sendMs) return Promise.resolve();
    const started = vnow;
    return new Promise(function (resolve) {
      fakeSet(function () {
        vnow = Math.max(vnow, started + sendMs);
        timeline.push({ ev: 'paper', t: started + sendMs });
        resolve();
      }, sendMs);
    });
  };
  Task.prototype.waitForFinished = function () { return Promise.resolve(); };
  Task.prototype.printEnd = function () {
    if (opts.endHangs) return new Promise(function () {});
    return Promise.resolve();
  };
  function Client() {
    var self = this;
    clients.push(this);
    this.beats = 0;
    this._on = {};
    this.pages = [];
    this.protocol = {
      newPrintTask: function (name) {
        var task = new Task(name);
        var page = task.printPage;
        task.printPage = function (encoded, n) {
          self.pages.push(encoded);
          return page.call(task, encoded, n);
        };
        return task;
      }
    };
  }
  Client.prototype.connect = function (options) {
    connects.push(options || null);
    const name = nextName.length ? nextName.shift() : ((options && options.authorizedDevice && options.authorizedDevice.name) || '');
    const info = name ? { deviceName: name } : undefined;
    if (opts.holdConnect && connects.length > (opts.holdConnectAfter || 0)) {
      return new Promise(function (resolve) { held.push({ mark: 'connect', resolve: function () { resolve(info); } }); });
    }
    return Promise.resolve(info);
  };
  Client.prototype.disconnect = function () {
    const self = this;
    return Promise.resolve().then(function () { self.emit('disconnect'); });
  };
  Client.prototype.on = function (name, fn) { this._on[name] = fn; };
  Client.prototype.emit = function (name) { if (this._on[name]) this._on[name](); };
  Client.prototype.startHeartbeat = function () {
    this.beats += 1;
    if (this.heartbeatTimer) return;
    /* A plain flag. A real interval here would keep the sim process alive after the asserts. */
    this.heartbeatTimer = { on: true, ms: 2000 };
  };
  Client.prototype.stopHeartbeat = function () {
    this.heartbeatTimer = 0;
  };
  Client.prototype.getPrintTaskType = function () { return opts.found || ''; };
  Client.prototype.getPrinterInfo = function () { return { protocolVersion: opts.protocol == null ? 4 : opts.protocol }; };
  Client.prototype.getModelMetadata = function () {
    const model = nextModel.length ? nextModel.shift() : 'B31';
    return { model: model, printheadPixels: model === 'B31' ? 600 : 384, printDirection: 'top' };
  };
  let ble = opts.bluetooth || {};
  if (opts.reconnect || opts.devices || opts.grantDevices) {
    const rawDevices = opts.grantDevices || opts.devices || [{
      id: 'bt-b31', name: 'B31',
      gatt: { connected: true, connect: function () { return Promise.resolve(); } }
    }];
    const devices = rawDevices.map(function (d) {
      const gatt = (d && d.gatt) || {};
      const raw = gatt.connect;
      return Object.assign({}, d, {
        gatt: Object.assign({}, gatt, {
          connect: function () {
            gattConnects += 1;
            return raw ? raw.call(gatt) : Promise.resolve();
          }
        })
      });
    });
    ble = {
      getDevices: function () {
        if (opts.reconnect === 'missing') return Promise.resolve([]);
        return Promise.resolve(devices);
      }
    };
  }
  const sandbox = {
    console: { log() { logs.push(Array.prototype.join.call(arguments, ' ')); }, error() { console.error.apply(console, arguments); } },
    performance: { now: () => (lag ? vnow : Date.now()) },
    Math, Date, String, Object, Array, Number, JSON, Promise, Uint8Array, parseInt, isFinite,
    setTimeout: opts.manualTime ? fakeSet : setTimeout,
    clearTimeout: opts.manualTime ? fakeClear : clearTimeout,
    setInterval(fn, ms) { intervals.push({ fn: fn, ms: ms }); return intervals.length; },
    clearInterval() {},
    document: doc,
    navigator: {
      userAgent: 'Mozilla/5.0 Chrome/120.0', platform: 'Win32', maxTouchPoints: 0, bluetooth: ble,
      serial: opts.serialPorts ? { getPorts: function () { return Promise.resolve(opts.serialPorts); } } : {}
    },
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; }
    },
    fetch(url, init) {
      const body = JSON.parse(init.body);
      calls.push(body);
      let data = { ok: true, items: [] };
      if (body.action === 'printQueue' || body.op === 'printQueue') {
        data = JSON.parse(JSON.stringify(opts.queue || { ok: true, items: [] }));
        if (opts.rev != null) data.rev = String(opts.rev);
      }
      if (body.action === 'printEnqueue' || body.op === 'printEnqueue' || body.action === 'printReprint' || body.op === 'printReprint') {
        data = { ok: true, created: true, item: { print_id: opts.aliasId || body.print_id || ('pq-n' + calls.length), jo: body.jo, kind: body.kind, status: 'queued' } };
      }
      if (body.mark === 'claim') {
        if (opts.taken) data = { ok: false, code: 'TAKEN', error: 'Another printer has this sticker' };
        else {
          const found = ((opts.queue && opts.queue.items) || []).filter(function (it) { return it.print_id === body.print_id; })[0] || {};
          data = { ok: true, claimed: true, item: { print_id: body.print_id, status: 'queued', kind: found.kind || 'jo_card', jo: found.jo || body.jo || '26-336', current_stage: found.current_stage || '' } };
        }
      }
      if (body.mark === 'requeue') data = { ok: true, requeued: true, item: { print_id: body.print_id, status: 'queued', kind: 'jo_card', jo: '26-336', error: '' } };
      if (body.mark === 'printed' || body.mark === 'failed' || body.mark === 'cancelled') data = { ok: true };
      if ((body.action === 'printQueue' || body.op === 'printQueue') && (body.brief === 1 || body.brief === '1' || body.brief === true)) {
        if (opts.brief) data = { ok: true, brief: true, rev: opts.rev == null ? null : String(opts.rev), auto: opts.auto !== false };
        else if (!opts.queue) data = { ok: true, items: [] };
      }
      const res = { json() { return Promise.resolve(data); }, clone() { return { json() { return Promise.resolve(data); } }; } };
      const scriptMs = lag ? lag.script : 0;
      const scriptCall = body.action === 'printEnqueue' || body.op === 'printEnqueue' || body.action === 'printReprint' || body.op === 'printReprint' || body.mark === 'claim' || body.mark === 'printed' || body.mark === 'failed';
      function finishScript() {
        if (scriptMs) vnow = Math.max(vnow, (finishScript.started || 0) + scriptMs);
        timeline.push({ ev: 'fetch-done', action: body.action || body.op || '', mark: body.mark || '', t: scriptMs ? (finishScript.started || 0) + scriptMs : vnow });
        return res;
      }
      if (opts.holdEnqueue && (body.action === 'printEnqueue' || body.op === 'printEnqueue')) {
        return new Promise(resolve => { held.push({ mark: 'enqueue', resolve: () => resolve(finishScript()) }); });
      }
      if (opts.holdClaim && body.mark === 'claim') return new Promise(resolve => { held.push({ mark: 'claim', resolve: () => resolve(res) }); });
      if (opts.holdPrinted && body.mark === 'printed') return new Promise(resolve => { held.push({ mark: 'printed', resolve: () => resolve(res) }); });
      if (scriptMs && scriptCall) {
        finishScript.started = vnow;
        return new Promise(resolve => { fakeSet(() => resolve(finishScript()), scriptMs); });
      }
      return Promise.resolve(res);
    },
    Worker: WorkerCtor,
    Blob: function BlobCtor(parts) { this.parts = parts; },
    URL: { createObjectURL() { return 'blob:tick'; }, revokeObjectURL() {} },
    MutationObserver: function () { this.observe = function () {}; },
    crypto: { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = i + 1; return a; } }
  };
  sandbox.niimbluelib = {
    Utils: { isBluetoothSupported() { return true; }, isSerialSupported() { return true; } },
    NiimbotBluetoothClient: Client,
    NiimbotSerialClient: Client,
    printTasks: { B1: 1, D110M_V4: 1 },
    findPrintTask: function (model, version) { return opts.found || (version >= 4 ? 'D110M_V4' : undefined); },
    ImageEncoder: { encodeCanvas: function (c) { encodes.push(c && c.width); if (lag && lag.render) vnow += lag.render; return { cols: c.width, rows: c.height, rowsData: [] }; } },
    PageColorType: { SingleColor: 0 },
    LabelType: { WithGaps: 1 }
  };
  if (opts.drive) {
    sandbox.OYPLabel = {
      ready: Promise.resolve(),
      HEADS: { B31: 600, B1: 384 },
      px: function (n) { return Math.round(n * 8); },
      render: function () { return { width: opts.canvasWidth || 600, height: 160, labelW: 240, labelH: 160, offsetX: 180, tail: 0, lines: [], qr: '26-336' }; },
      toCanvas: function (r) { return { width: r.width, height: r.height }; }
    };
  }
  sandbox.OYP = { toast: function (t) { notes.push(String(t)); } };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('print.js'), sandbox, { filename: 'print.js' });
  return {
    sandbox, store, calls, workers, intervals, tasks, encodes, logs, clients, connects, notes, timeline, now: function () { return vnow; }, gatt: function () { return gattConnects; }, poke: poke,
    release(mark) { held.filter(h => h.mark === mark).forEach(h => h.resolve()); },
    flush: flush, setVis: function (v) { vis = v; }
  };
}
function drain() {
  let p = Promise.resolve();
  for (let i = 0; i < 80; i++) p = p.then(function () {});
  return p;
}
const queued = { ok: true, items: [{ print_id: 'pq-1', jo: '26-336', kind: 'jo_card', status: 'queued' }] };
drain().then(function () {
  const hidden = bootPrint({
    visibility: 'hidden',
    models: ['B1', 'B31'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ model: 'B1', kinds: { jo_card: false, jewelry_tag: true }, auto: true }) }
  });
  hidden.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const savedB1 = JSON.parse(hidden.store.oypPrint);
    eq(savedB1.kinds == null && savedB1.kindsByModel.B1 && savedB1.kindsByModel.B1.jo_card === false && savedB1.kindsByModel.B1.jewelry_tag === true, 'an old kinds choice stays on the B1 it was saved for');
    eq(!hidden.calls.some(b => b.mark === 'claim'), 'a B1 that does not print JO cards does not claim one');
    hidden.sandbox.OYPPrint.connect('bluetooth');
    return drain();
  }).then(function () {
    const saved = JSON.parse(hidden.store.oypPrint);
    const claim = hidden.calls.filter(b => b.mark === 'claim').pop();
    eq(saved.kindsByModel.B31 && saved.kindsByModel.B31.jo_card === true && saved.kindsByModel.B1.jo_card === false, 'a later B31 keeps its own JO-card default');
    eq(claim && claim.op === 'printMark' && claim.mark === 'claim' && !('op' in claim && claim.op !== 'printMark') && !claim.session, 'a hidden tab still claims, and the scanner body keeps op printMark');
    eq(hidden.workers.length === 1 && !hidden.intervals.some(i => i.ms === 1000) && read('print.js').includes('var POLL = 1000'), 'the worker timer runs and the fallback interval does not');
    const beforePoll = hidden.calls.filter(b => b.op === 'printQueue' || b.action === 'printQueue').length;
    if (hidden.workers[0]) {
      hidden.workers[0].onmessage();
      hidden.workers[0].onmessage();
      hidden.workers[0].onmessage();
      hidden.workers[0].onmessage();
    }
    return drain().then(function () {
      const mid = hidden.calls.filter(b => b.op === 'printQueue' || b.action === 'printQueue').length;
      eq(mid === beforePoll, 'a hidden tab skips four of every five polls');
      if (hidden.workers[0]) hidden.workers[0].onmessage();
      return drain().then(function () {
        eq(hidden.calls.filter(b => b.op === 'printQueue' || b.action === 'printQueue').length >= beforePoll + 1, 'the fifth hidden tick polls again');
      });
    });
  });
}).then(function () {
  const staff = bootPrint({
    visibility: 'hidden',
    models: ['B31'],
    queue: queued,
    store: { oypSession: 'sess-1', oypPrint: JSON.stringify({ auto: true, model: 'B31' }) }
  });
  staff.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const claim = staff.calls.find(b => b.mark === 'claim');
    eq(claim && claim.action === 'printMark' && claim.session === 'sess-1' && claim.mark === 'claim' && !('op' in claim), 'a signed-in page sends action printMark and mark claim');
  });
}).then(function () {
  const fallback = bootPrint({
    visibility: 'visible',
    workerFails: true,
    models: ['B31'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31' }) }
  });
  fallback.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    eq(fallback.workers.length === 0 && fallback.intervals.some(i => i.ms === 1000) && !fallback.intervals.some(i => i.ms === 15000), 'setInterval polls every second only when the worker cannot start');
  });
}).then(function () {
  const e4 = bootPrint({
    models: ['B31'],
    drive: true,
    found: 'D110M_V4',
    pages: ['e4', 'ok'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'auto' }) }
  });
  e4.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const saved = JSON.parse(e4.store.oypPrint);
    eq(e4.tasks[0] === 'B1' && e4.tasks[1] === 'D110M_V4' && e4.tasks.length === 2, 'a B31 starts on the B1 page size, and an e4 timeout retries D110M_V4 once');
    eq(saved.taskByModel && saved.taskByModel.B31 === 'D110M_V4' && saved.task === 'auto', 'Auto remembers the task that finished and leaves the manual choice alone');
    eq(e4.calls.some(b => b.mark === 'printed') && !e4.calls.some(b => b.mark === 'failed'), 'the retry is not marked failed');
    eq(e4.notes.indexOf('Printing…') >= 0 && e4.notes.indexOf('Printed') >= 0, 'a print says when it starts and when it finishes');
  });
}).then(function () {
  const manual = bootPrint({
    models: ['B31'],
    drive: true,
    found: 'D110M_V4',
    pages: ['e4', 'ok'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'D110M_V4' }) }
  });
  manual.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const saved = JSON.parse(manual.store.oypPrint);
    eq(manual.tasks.length === 1 && manual.tasks[0] === 'D110M_V4', 'a manual print mode does not switch tasks after e4');
    eq(saved.task === 'D110M_V4' && !saved.taskByModel.B31, 'the manual choice is kept');
    eq(manual.calls.some(b => b.mark === 'failed' && b.error === 'Printer did not respond'), 'the failed row stores a readable reason');
    eq(manual.notes.some(t => t.indexOf('Turn the printer off and on') >= 0), 'a timeout tells them to power the printer off and on');
  });
}).then(function () {
  const hung = bootPrint({
    models: ['B31'],
    drive: true,
    manualTime: true,
    pages: ['hang', 'ok'],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, model: 'B31', task: 'D110M_V4' }) }
  });
  hung.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    hung.sandbox.OYPPrint.printJo('jo_card', '26-336', { reprint: true });
    return drain();
  }).then(function () {
    eq(hung.tasks.length === 1, 'the first print reached the printer');
    hung.sandbox.OYPPrint.printJo('jo_card', '26-337', { reprint: true });
    return drain();
  }).then(function () {
    eq(hung.tasks.length === 1, 'the next print waits while the first job is still hung');
    hung.flush(120000);
    return drain();
  }).then(function () {
    hung.flush(120000);
    return drain();
  }).then(function () {
    hung.flush(120000);
    return drain();
  }).then(function () {
    eq(hung.tasks.length === 2, 'a timed-out job releases the chain and the next print starts');
  });
}).then(function () {
  const link = bootPrint({
    models: ['B31'],
    reconnect: true,
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, model: 'B31' }) }
  });
  link.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    eq(link.clients[0] && link.clients[0].beats >= 1, 'connecting starts the niimbluelib heartbeat');
    link.clients[0].emit('disconnect');
    return drain();
  }).then(function () {
    const again = link.connects.filter(function (c) { return c && c.authorizedDevice && c.authorizedDevice.id === 'bt-b31'; });
    eq(link.gatt() >= 1 && again.length === 1, 'a drop reconnects with getDevices and gatt.connect, without the picker');
    eq(!link.notes.some(t => t.indexOf('Printer disconnected') >= 0), 'a quiet reconnect does not ask them to tap Printer');
    eq(link.clients[link.clients.length - 1].beats >= 1, 'the new link starts a heartbeat too');
  });
}).then(function () {
  const lost = bootPrint({
    models: ['B31'],
    reconnect: 'missing',
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, model: 'B31' }) }
  });
  lost.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    lost.clients[0].emit('disconnect');
    return drain();
  }).then(function () {
    eq(lost.notes.indexOf('Printer disconnected. Tap Printer to reconnect') >= 0, 'when the browser cannot reconnect, the toast says to tap Printer');
    lost.notes.length = 0;
    lost.sandbox.OYPPrint.connect('bluetooth');
    return drain();
  }).then(function () {
    const live = lost.clients[lost.clients.length - 1];
    lost.sandbox.OYPPrint.disconnect();
    return drain().then(function () {
      eq(!lost.notes.some(t => t.indexOf('Printer disconnected') >= 0) && live.beats >= 1, 'Disconnect is intentional and does not toast');
    });
  });
}).then(function () {
  const fast = bootPrint({
    models: ['B31'],
    drive: true,
    found: 'D110M_V4',
    pages: ['ok'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'auto' }) }
  });
  fast.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const saved = JSON.parse(fast.store.oypPrint);
    eq(fast.tasks.length === 1 && fast.tasks[0] === 'B1' && saved.taskByModel.B31 === 'B1', 'Auto prints a B31 with the B1 task and does not try D110M_V4');
    eq(fast.logs.some(l => l.indexOf('[oyp-print] claim ') === 0) && fast.logs.some(l => l.indexOf('[oyp-print] render ') === 0) && fast.logs.some(l => l.indexOf('[oyp-print] send ') === 0 && l.indexOf(' B1') > 0) && fast.logs.some(l => l.indexOf('[oyp-print] waitForFinished ') === 0), 'claim, render, send, and waitForFinished are logged');
  });
}).then(function () {
  const remembered = bootPrint({
    models: ['B31'],
    drive: true,
    pages: ['e4', 'ok'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'auto', taskByModel: { B31: 'D110M_V4' } }) }
  });
  remembered.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    eq(remembered.tasks[0] === 'D110M_V4' && remembered.tasks[1] === 'B1', 'a remembered task still wins, and e4 falls back the other way');
  });
}).then(function () {
  const overlap = bootPrint({
    holdEnqueue: true,
    drive: true,
    models: ['B31'],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, model: 'B31', task: 'B1' }) }
  });
  overlap.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    overlap.sandbox.OYPPrint.printJo('jo_card', '26-336', { reprint: true });
    return drain();
  }).then(function () {
    eq(overlap.encodes.length === 1 && overlap.tasks.length === 1 && overlap.tasks[0] === 'B1', 'the label is sent without waiting for the queue');
    eq(!overlap.calls.some(b => b.mark === 'printed') && !overlap.calls.some(b => b.mark === 'claim'), 'the tap does not claim, and the printed mark waits for the log');
    overlap.sandbox.OYPPrint.printJo('jo_card', '26-336', { reprint: true });
    return drain();
  }).then(function () {
    eq(overlap.tasks.length === 1 && overlap.notes.indexOf('That sticker is already printing') >= 0, 'a second tap of the same sticker does not print again');
    overlap.release('enqueue');
    return drain();
  }).then(function () {
    const printed = overlap.calls.filter(b => b.mark === 'printed');
    const enq = overlap.calls.filter(b => b.action === 'printEnqueue' || b.op === 'printEnqueue');
    eq(printed.length === 1 && enq.length === 1 && printed[0].print_id === enq[0].print_id && /^pq-/.test(enq[0].print_id), 'the log is marked printed with the client print id');
  });
}).then(function () {
  const pair = bootPrint({
    holdPrinted: true,
    drive: true,
    models: ['B31'],
    queue: { ok: true, items: [
      { print_id: 'pq-a', jo: '26-336', kind: 'jo_card', status: 'queued' },
      { print_id: 'pq-b', jo: '26-337', kind: 'jo_card', status: 'queued' }
    ] },
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'B1' }) }
  });
  pair.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    eq(pair.tasks.length === 2 && pair.calls.filter(b => b.mark === 'printed').length >= 1, 'the next sticker starts before the printed mark returns');
  });
}).then(function () {
  const watch = bootPrint({
    brief: true,
    rev: '5',
    models: ['B31'],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, model: 'B31' }) }
  });
  watch.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const full = watch.calls.filter(b => (b.action === 'printQueue' || b.op === 'printQueue') && !b.brief).length;
    watch.workers[0].onmessage();
    return drain().then(function () {
      const full2 = watch.calls.filter(b => (b.action === 'printQueue' || b.op === 'printQueue') && !b.brief).length;
      eq(watch.calls.some(b => b.brief) && full2 === full, 'an unchanged rev does not read the queue again');
    });
  });
}).then(function () {
  const slow = bootPrint({
    models: ['B31'],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, model: 'B31' }) }
  });
  slow.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const n = slow.calls.filter(b => b.action === 'printQueue' || b.op === 'printQueue').length;
    slow.workers[0].onmessage();
    return drain().then(function () {
      slow.workers[0].onmessage();
      slow.workers[0].onmessage();
      return drain().then(function () {
        const n2 = slow.calls.filter(b => b.action === 'printQueue' || b.op === 'printQueue').length;
        eq(n2 === n + 2, 'without a brief rev, a visible station reads the queue every 3rd tick');
      });
    });
  });
}).then(function () {
  const held = bootPrint({
    models: ['B31'],
    drive: true,
    queue: { ok: true, auto: false, items: [{ print_id: 'pq-1', jo: '26-336', kind: 'jo_card', status: 'queued' }] },
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'B1' }) }
  });
  held.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    eq(!held.calls.some(b => b.mark === 'claim'), 'auto off does not start a queued sticker');
    held.sandbox.OYPPrint.printQueued();
    return drain();
  }).then(function () {
    eq(held.calls.some(b => b.mark === 'claim') && held.tasks[0] === 'B1', 'Print queued prints the waiting rows when auto is off');
  });
}).then(function () {
  const both = bootPrint({
    drive: true,
    models: ['B31', 'B1'],
    queue: { ok: true, auto: true, items: [
      { print_id: 'pq-card', jo: '26-336', kind: 'jo_card', status: 'queued' },
      { print_id: 'pq-tag', jo: '26-337', kind: 'jewelry_tag', status: 'queued' }
    ] },
    store: { oypPrint: JSON.stringify({ auto: true, task: 'auto' }) }
  });
  both.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    both.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
    return drain();
  }).then(function () {
    const claims = both.calls.filter(b => b.mark === 'claim');
    const card = claims.find(b => b.print_id === 'pq-card');
    const tag = claims.find(b => b.print_id === 'pq-tag');
    const marks = both.sandbox.OYPPrint.printerMarks();
    eq(card && card.device_id.slice(-2) !== '-2' && tag && tag.device_id.slice(-2) === '-2', 'the JO card and the jewelry tag are claimed by different printers');
    eq(both.tasks.length === 2 && both.tasks[0] === 'B1' && both.tasks[1] === 'B1', 'both printers send on the B1 task');
    eq(marks.indexOf('B31') >= 0 && marks.indexOf('B1') >= 0 && marks.indexOf('oyp-pr-name') >= 0, 'the menu names B31 and B1');
  });
}).then(function () {
  const taken = bootPrint({
    taken: true,
    drive: true,
    models: ['B31'],
    queue: queued,
    store: { oypPrint: JSON.stringify({ auto: true, model: 'B31', task: 'B1' }) }
  });
  taken.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    eq(taken.tasks.length === 0 && !taken.calls.some(b => b.mark === 'failed') && !taken.notes.some(t => /another printer/i.test(t)), 'a sticker another printer already claimed is left alone');
  });
}).then(function () {
  function dev(id) {
    return { id: id, gatt: { connected: false, connect: function () { return Promise.resolve(); } } };
  }
  const restored = bootPrint({
    reconnect: 'pair',
    devices: [dev('bt-b31'), dev('bt-b1')],
    models: ['B31', 'B1'],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, links: [
      { transport: 'bluetooth', btId: 'bt-b31', model: 'B31' },
      { transport: 'bluetooth', btId: 'bt-b1', model: 'B1' }
    ] }) }
  });
  return drain().then(function () {
    const marks = restored.sandbox.OYPPrint.printerMarks();
    const allowed = restored.connects.filter(c => c && c.authorizedDevice);
    eq(restored.gatt() >= 2 && restored.clients.length >= 2 && allowed.length >= 2, 'a reload reconnects each permitted printer without the picker');
    eq(marks.indexOf('B31') >= 0 && marks.indexOf('B1') >= 0 && !restored.notes.some(t => t.indexOf('Printer disconnected') >= 0), 'both models show, and a quiet reconnect does not toast');
  });
}).then(function () {
  const usb = bootPrint({
    serialPorts: [{ id: 'usb-b1' }],
    models: ['B1'],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false, links: [
      null,
      { transport: 'serial', btId: '', model: 'B1' }
    ] }) }
  });
  return drain().then(function () {
    const port = usb.connects.find(c => c && c.authorizedPort);
    eq(port && port.authorizedPort.id === 'usb-b1' && usb.sandbox.OYPPrint.printerMarks().indexOf('B1') >= 0 && !usb.notes.some(t => t.indexOf('Printer disconnected') >= 0), 'a permitted USB printer reconnects with getPorts');
  });
}).then(function () {
  function linkHost(sandbox) {
    const host = {
      innerHTML: '',
      _attr: {},
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attr, name) ? this._attr[name] : null; },
      setAttribute(name, value) { this._attr[name] = String(value); }
    };
    const prev = sandbox.document.getElementById;
    sandbox.document.getElementById = function (id) { return id === 'prLinks' ? host : prev(id); };
    return host;
  }
  function linkRows(html) { return String(html || '').split('class="setrow pr-link"').slice(1); }
  const blank = { oypPrint: JSON.stringify({ auto: false }) };
  const none = bootPrint({ queue: { ok: true, items: [] }, store: blank });
  const noneHost = linkHost(none.sandbox);
  none.sandbox.OYPPrint.mountSettings({ innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } });
  const noneRows = linkRows(noneHost.innerHTML);
  eq(noneRows.length === 1 && noneRows[0].indexOf('>Printer<') >= 0 && noneRows[0].indexOf('Not connected') >= 0 && noneRows[0].indexOf('data-slot="0"') >= 0 && noneRows[0].indexOf('data-slot-act="connect"') >= 0 && noneRows[0].indexOf('Second printer') < 0, 'none connected keeps a single printer row');
  const one = bootPrint({ models: ['B1'], queue: { ok: true, items: [] }, store: blank });
  const oneHost = linkHost(one.sandbox);
  one.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const oneRows = linkRows(oneHost.innerHTML);
    eq(oneRows.length === 2 && oneRows[0].indexOf('>B1<') >= 0 && oneRows[0].indexOf('data-slot="0"') >= 0 && oneRows[1].indexOf('Second printer') >= 0 && oneRows[1].indexOf('Not connected') >= 0 && oneRows[1].indexOf('data-slot="1"') >= 0 && oneRows[1].indexOf('data-slot="0"') < 0 && oneRows[1].indexOf('data-slot-act="connect"') >= 0 && oneRows[1].indexOf('>Bluetooth<') >= 0 && oneRows[1].indexOf('>USB<') >= 0, 'one connected printer shows a second-printer row on the free slot');
    eq(one.notes.indexOf('B1 connected.') >= 0, 'connecting confirms with the model name');
    const both = bootPrint({ models: ['B1', 'B31'], queue: { ok: true, items: [] }, store: blank });
    const bothHost = linkHost(both.sandbox);
    both.sandbox.OYPPrint.connect('bluetooth');
    return drain().then(function () {
      both.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
      return drain();
    }).then(function () {
      const bothRows = linkRows(bothHost.innerHTML);
      eq(bothRows.length === 2 && bothHost.innerHTML.indexOf('Second printer') < 0 && bothRows[0].indexOf('>B1<') >= 0 && bothRows[1].indexOf('>B31<') >= 0, 'both connected printers leave no extra row');
      eq(both.notes.indexOf('B31 connected.') >= 0, 'the second printer confirms by name');
      const mid = bootPrint({
        holdConnect: true,
        holdConnectAfter: 1,
        models: ['B1', 'B31'],
        queue: { ok: true, items: [] },
        store: blank
      });
      const midHost = linkHost(mid.sandbox);
      mid.sandbox.OYPPrint.connect('bluetooth');
      return drain().then(function () {
        eq(linkRows(midHost.innerHTML).length === 2 && midHost.innerHTML.indexOf('Second printer') >= 0, 'the second-printer row is there before its connect starts');
        mid.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
        eq(midHost.innerHTML.indexOf('Second printer') < 0 && midHost.innerHTML.indexOf('>B1<') >= 0, 'the second-printer row hides while that connect is in progress');
        mid.release('connect');
        return drain();
      }).then(function () {
        eq(midHost.innerHTML.indexOf('Second printer') < 0 && midHost.innerHTML.indexOf('>B31<') >= 0 && mid.notes.indexOf('B31 connected.') >= 0, 'finishing that connect names B31 and does not bring the extra row back');
      });
    });
  });
}).then(function () {
  function mixedItems() {
    return [
      { print_id: 'pq-tag', jo: '26-363', kind: 'jewelry_tag', status: 'queued', client: 'Ada' },
      { print_id: 'pq-card', jo: '26-363', kind: 'jo_card', status: 'queued', current_stage: 'intake', client: 'Ada' },
      { print_id: 'pq-in', jo: '26-364', kind: 'intake', status: 'queued', current_stage: 'intake', client: 'Ada' }
    ];
  }
  function claimFor(box, id) {
    return box.calls.filter(function (b) { return b.mark === 'claim' && b.print_id === id; }).pop();
  }
  function onPeer(body) { return !!(body && String(body.device_id || '').slice(-2) === '-2'); }
  function watchQueue(box) {
    const host = { innerHTML: '', querySelectorAll() { return []; }, setAttribute() {} };
    box.sandbox.document.querySelectorAll = function (sel) {
      if (sel === '[data-oyp-q]') return [host];
      return [];
    };
    return host;
  }
  const stale = {
    auto: true,
    task: 'auto',
    kindsByModel: {
      B1: { jo_card: true, jewelry_tag: true },
      B31: { jo_card: true, jewelry_tag: false }
    }
  };
  const split = bootPrint({
    drive: true,
    models: ['B1', 'B31'],
    pages: ['hold', 'hold'],
    queue: { ok: true, auto: true, items: mixedItems() },
    store: { oypPrint: JSON.stringify(stale) }
  });
  split.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    split.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
    return drain();
  }).then(function () {
    const tag = claimFor(split, 'pq-tag'), card = claimFor(split, 'pq-card'), intake = claimFor(split, 'pq-in');
    const saved = JSON.parse(split.store.oypPrint);
    eq(tag && !onPeer(tag) && card && onPeer(card) && !intake, 'with the B1 in the first slot, the tag stays on the B1 and the JO card starts on the B31');
    eq(split.tasks.length === 2 && split.encodes.indexOf(384) >= 0 && split.encodes.indexOf(600) >= 0, 'the B1 and the B31 drain at the same time');
    eq(saved.kindsByModel.B1.jo_card === false && saved.kindsByModel.B1.jewelry_tag === true, 'a stale B1 map cannot keep JO stickers');
    split.release('page');
    return drain();
  }).then(function () {
    const intake = claimFor(split, 'pq-in');
    const widths = split.encodes.filter(function (w) { return w === 384; });
    eq(intake && onPeer(intake) && widths.length === 1 && split.encodes.filter(function (w) { return w === 600; }).length === 2, 'the intake sticker waits for the B31, then prints there after the JO card');
    const held = bootPrint({
      drive: true,
      models: ['B1'],
      queue: { ok: true, auto: true, items: mixedItems() },
      store: { oypPrint: JSON.stringify(stale) }
    });
    const host = watchQueue(held);
    held.sandbox.OYPPrint.connect('bluetooth');
    return drain().then(function () {
      eq(claimFor(held, 'pq-tag') && !claimFor(held, 'pq-card') && !claimFor(held, 'pq-in'), 'a missing B31 does not send JO stickers to the B1');
      eq(held.notes.indexOf('Connect the B31 to print JO stickers') >= 0 && host.innerHTML.indexOf('Connect the B31 to print JO stickers') >= 0 && host.innerHTML.indexOf('pq-card') >= 0 && host.innerHTML.indexOf('pq-in') >= 0, 'JO stickers stay queued with Connect the B31 to print JO stickers');
      const named = bootPrint({
        drive: true,
        models: ['B1', 'B1'],
        names: ['B1-4C2A', 'NIIMBOT B31'],
        queue: { ok: true, auto: true, items: mixedItems() },
        store: { oypPrint: JSON.stringify({ auto: true, task: 'auto' }) }
      });
      named.sandbox.OYPPrint.connect('bluetooth');
      return drain().then(function () {
        named.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
        return drain();
      }).then(function () {
        const tag = claimFor(named, 'pq-tag'), card = claimFor(named, 'pq-card'), intake = claimFor(named, 'pq-in');
        const marks = named.sandbox.OYPPrint.printerMarks();
        eq(marks.indexOf('B31') >= 0 && marks.indexOf('B1') >= 0, 'a B31 that answers as a B1 is named from the Bluetooth device');
        eq(tag && !onPeer(tag) && card && onPeer(card) && intake && onPeer(intake), 'JO cards and intake stickers follow the B31 name, not the slot or the model id');
      });
    });
  });
}).then(function () {
  function claimFor(box, id) {
    return box.calls.filter(function (b) { return b.mark === 'claim' && b.print_id === id; }).pop();
  }
  function onPeer(body) { return !!(body && String(body.device_id || '').slice(-2) === '-2'); }
  function watchQueue(box) {
    const host = { innerHTML: '', querySelectorAll() { return []; }, setAttribute() {} };
    box.sandbox.document.querySelectorAll = function (sel) {
      if (sel === '[data-oyp-q]') return [host];
      return [];
    };
    return host;
  }
  const live = [
    { print_id: 'pq-tag', jo: '26-363', kind: 'jewelry_tag', status: 'queued', client: 'Ada' },
    { print_id: 'pq-card', jo: '26-363', kind: 'jo_card', status: 'queued', current_stage: 'intake', client: 'Ada' }
  ];
  const staleMode = {
    auto: true,
    task: 'B1',
    model: 'B1',
    kindsByModel: {
      B1: { jo_card: true, jewelry_tag: true },
      B31: { jo_card: true, jewelry_tag: true }
    },
    links: [
      { model: 'B1', btId: 'bt-b31' },
      { model: 'B1', btId: 'bt-b1' }
    ]
  };
  const both = bootPrint({
    drive: true,
    models: ['B1', 'B1'],
    names: ['B31-HB03011342', 'B1-HC17121009'],
    pages: ['hold', 'hold'],
    queue: { ok: true, auto: true, items: live },
    store: { oypPrint: JSON.stringify(staleMode) }
  });
  const bothHost = watchQueue(both);
  both.sandbox.OYPPrint.connect('bluetooth');
  both.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
  return drain().then(function () {
    const tag = claimFor(both, 'pq-tag'), card = claimFor(both, 'pq-card');
    const saved = JSON.parse(both.store.oypPrint);
    const slot0 = saved.links[0], slot1 = saved.links[1];
    eq(slot0 && slot0.model === 'B31' && slot1 && slot1.model === 'B1' && saved.task === 'B1', 'the Bluetooth names B31-HB03011342 and B1-HC17121009 override a saved print mode of B1');
    eq(tag && onPeer(tag) && card && !onPeer(card), 'with both printers connected, the jewelry tag stays on the B1 and the JO card stays on the B31');
    eq(both.encodes.indexOf(384) >= 0 && both.encodes.indexOf(600) >= 0, 'the tag uses the B1 head and the JO card uses the B31 head');
    eq(bothHost.innerHTML.indexOf('B31-HB03011342') >= 0 && bothHost.innerHTML.indexOf('model B31') >= 0 && bothHost.innerHTML.indexOf('B1-HC17121009') >= 0 && bothHost.innerHTML.indexOf('model B1') >= 0 && bothHost.innerHTML.indexOf('saved jewelry tag ignored') >= 0, 'the print station shows each slot name, model, connection, and kinds');
    const onlyB31 = bootPrint({
      drive: true,
      models: ['B1'],
      names: ['B31-HB03011342'],
      queue: { ok: true, auto: true, items: live },
      store: { oypPrint: JSON.stringify(staleMode) }
    });
    const b31Host = watchQueue(onlyB31);
    onlyB31.sandbox.OYPPrint.connect('bluetooth');
    return drain().then(function () {
      eq(claimFor(onlyB31, 'pq-card') && !onPeer(claimFor(onlyB31, 'pq-card')) && !claimFor(onlyB31, 'pq-tag'), 'a B31 with a saved jewelry-tag flag still does not print the tag');
      eq(b31Host.innerHTML.indexOf('id="prHold"') >= 0 && b31Host.innerHTML.indexOf('Connect the B1 to print jewelry tags') >= 0 && b31Host.innerHTML.indexOf('pq-tag') >= 0, 'a held jewelry tag stays in the queue with Connect the B1 to print jewelry tags');
      const onlyB1 = bootPrint({
        drive: true,
        models: ['B1'],
        names: ['B1-HC17121009'],
        queue: { ok: true, auto: true, items: live },
        store: { oypPrint: JSON.stringify(staleMode) }
      });
      const b1Host = watchQueue(onlyB1);
      onlyB1.sandbox.OYPPrint.connect('bluetooth');
      return drain().then(function () {
        eq(claimFor(onlyB1, 'pq-tag') && !claimFor(onlyB1, 'pq-card'), 'a saved B31 jewelry-tag flag does not move the JO card onto the B1');
        eq(b1Host.innerHTML.indexOf('id="prHold"') >= 0 && b1Host.innerHTML.indexOf('Connect the B31 to print JO stickers') >= 0 && b1Host.innerHTML.indexOf('pq-card') >= 0 && b1Host.innerHTML.indexOf('class="oyp-qhold"') >= 0, 'a held JO card stays visible in the queue with Connect the B31 to print JO stickers');
      });
    });
  });
}).then(function () {
  const flagText = 'To reconnect automatically, turn on chrome://flags/#enable-web-bluetooth-new-permissions-backend and relaunch Chrome';
  function settingsHost() {
    return {
      innerHTML: '',
      querySelector(sel) {
        if (sel === '#prFlagCopy' && this.innerHTML.indexOf('id="prFlagCopy"') >= 0) return { onclick: null };
        return null;
      },
      querySelectorAll() { return []; }
    };
  }
  const hint = bootPrint({
    bluetooth: {},
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false }) }
  });
  const hintHost = settingsHost();
  hint.sandbox.OYPPrint.mountSettings(hintHost);
  eq(hintHost.innerHTML.indexOf(flagText) >= 0 && hintHost.innerHTML.indexOf('id="prFlagCopy"') >= 0, 'Settings names the Chrome flag when getDevices is missing');
  eq(hint.sandbox.OYPPrint.printerMarks().indexOf('oyp-pr-status') < 0, 'a printer with no name has no divider');
  const watches = { b1: 0, b31: 0 };
  let b31Fails = 0, otherHits = 0, plainHits = 0;
  function granted(id, name, connect, watchKey) {
    return {
      id: id,
      name: name,
      watchAdvertisements: function () {
        if (watchKey) watches[watchKey] += 1;
        return Promise.resolve();
      },
      gatt: { connect: connect }
    };
  }
  const auto = bootPrint({
    manualTime: true,
    models: ['B1', 'B1', 'B1'],
    grantDevices: [
      granted('bt-b31', 'B31-2291', function () {
        b31Fails += 1;
        if (b31Fails === 1) return Promise.reject(new Error('out of range'));
        return Promise.resolve();
      }, 'b31'),
      granted('bt-b1', 'B1-4C2A', function () { return Promise.resolve(); }, 'b1'),
      granted('bt-b31', 'B31-2291', function () { return Promise.resolve(); }, 'b31'),
      granted('bt-other', 'B21-1', function () { otherHits += 1; return Promise.resolve(); }),
      granted('bt-plain', 'B31', function () { plainHits += 1; return Promise.resolve(); })
    ],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false }) }
  });
  const pr = { innerHTML: '', _p: '', getAttribute() { return this._p; }, setAttribute(n, v) { if (n === 'data-paint') this._p = v; } };
  const row = { innerHTML: '', title: '', _p: '', getAttribute() { return this._p; }, setAttribute(n, v) { if (n === 'data-paint') this._p = v; } };
  auto.sandbox.document.getElementById = function (id) { return id === 'prLinks' ? pr : null; };
  auto.sandbox.document.querySelectorAll = function (sel) { return sel === '[data-oyp-printer]' ? [row] : []; };
  return drain().then(function () {
    const saved = JSON.parse(auto.store.oypPrint);
    const links = saved.links || [];
    const b1 = links.filter(function (l) { return l && l.btId === 'bt-b1' && l.model === 'B1'; });
    const b31 = links.filter(function (l) { return l && l.btId === 'bt-b31' && l.model === 'B31'; });
    eq(b1.length === 1 && b31.length === 1 && links.filter(Boolean).length === 2, 'granted B1 and B31 attach to different slots, named from the device');
    eq(auto.notes.indexOf('B1 reconnected') >= 0 && auto.notes.indexOf('B31 reconnected') < 0, 'a granted printer that answers confirms with B1 reconnected');
    eq(!auto.notes.some(function (t) { return t.indexOf('Could not connect') >= 0 || t.indexOf('Printer disconnected') >= 0; }), 'an out-of-range printer does not raise an error toast');
    eq(pr.innerHTML.indexOf('id="prAutoNote"') >= 0 && pr.innerHTML.indexOf('B31 is off or out of range') >= 0 && pr.innerHTML.indexOf('Off or out of range') >= 0, 'the status line says the B31 is off or out of range');
    eq(auto.gatt() === 2 && watches.b1 === 1 && watches.b31 === 1 && otherHits === 0 && plainHits === 0 && auto.clients.length === 1, 'only B1- and B31- names are tried, and a duplicate id is skipped');
    auto.flush(2999);
    return drain();
  }).then(function () {
    eq(auto.notes.indexOf('B31 reconnected') < 0 && auto.clients.length === 1, 'the retry waits the full 3 seconds');
    auto.flush(3000);
    return drain();
  }).then(function () {
    const saved = JSON.parse(auto.store.oypPrint);
    const links = (saved.links || []).filter(Boolean);
    const ids = links.map(function (l) { return l.btId; }).sort();
    eq(auto.notes.indexOf('B31 reconnected') >= 0 && ids.join(',') === 'bt-b1,bt-b31' && links.some(function (l) { return l.btId === 'bt-b31' && l.model === 'B31'; }), 'after 3 seconds the B31 reconnects on its own slot');
    eq(auto.clients.length === 2 && watches.b31 === 2 && otherHits === 0 && plainHits === 0, 'the retry does not open a second copy or a printer that was not granted');
    const marks = auto.sandbox.OYPPrint.printerMarks();
    eq(marks.indexOf('oyp-pr-status') >= 0 && marks.indexOf('B31') >= 0 && marks.indexOf('B1') >= 0 && marks.indexOf('|') < 0 && row.innerHTML.indexOf('Printer<span class="oyp-pr-status">') === 0 && row.innerHTML.indexOf('|') < 0, 'the menu row groups the names after Printer and does not use a bar character');
    const before = auto.clients.length;
    (auto.sandbox.document._listeners.visibilitychange || []).forEach(function (fn) { fn(); });
    return drain().then(function () {
      eq(auto.clients.length === before && auto.gatt() === 3, 'showing the page again does not attach a printer that is already connected');
      const b31Client = auto.clients.filter(function (c, i) {
        const opts = auto.connects[i];
        return opts && opts.authorizedDevice && opts.authorizedDevice.id === 'bt-b31';
      }).pop();
      b31Client.emit('disconnect');
      return drain();
    });
  }).then(function () {
    const saved = JSON.parse(auto.store.oypPrint);
    const links = (saved.links || []).filter(Boolean);
    eq(auto.notes.filter(function (t) { return t === 'B31 reconnected'; }).length === 2 && auto.clients.length === 3, 'turning the B31 off reconnects it the same way');
    eq(!auto.notes.some(function (t) { return t.indexOf('Printer disconnected') >= 0; }) && links.filter(function (l) { return l.btId === 'bt-b31' && l.model === 'B31'; }).length === 1 && links.filter(function (l) { return l.btId === 'bt-b1'; }).length === 1, 'that drop stays on the B31 and leaves the B1 where it is');
    const ready = bootPrint({
      grantDevices: [granted('bt-b1', 'B1-4C2A', function () { return Promise.resolve(); })],
      queue: { ok: true, items: [] },
      store: { oypPrint: JSON.stringify({ auto: false }) }
    });
    const readyHost = settingsHost();
    return drain().then(function () {
      ready.sandbox.OYPPrint.mountSettings(readyHost);
      eq(readyHost.innerHTML.indexOf(flagText) < 0, 'the flag hint stays hidden once getDevices exists');
    });
  });
}).then(function () {
  let b31Tries = 0;
  const dropped = { n: 0 };
  const stuck = bootPrint({
    manualTime: true,
    models: ['B1', 'B1', 'B1', 'B1', 'B1'],
    grantDevices: [
      {
        id: 'bt-b31',
        name: 'B31-HB03011342',
        watchAdvertisements: function () { return Promise.resolve(); },
        gatt: {
          connect: function () {
            b31Tries += 1;
            if (b31Tries === 1) return new Promise(function () {});
            return Promise.resolve();
          },
          disconnect: function () { dropped.n += 1; }
        }
      },
      {
        id: 'bt-b1',
        name: 'B1-HC17121009',
        watchAdvertisements: function () { return Promise.resolve(); },
        gatt: { connect: function () { return Promise.resolve(); }, disconnect: function () {} }
      }
    ],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false }) }
  });
  const pr = { innerHTML: '', _p: '', getAttribute() { return this._p; }, setAttribute(name, value) { if (name === 'data-paint') this._p = value; } };
  stuck.sandbox.document.getElementById = function (id) { return id === 'prLinks' ? pr : null; };
  return drain().then(function () {
    eq(stuck.logs.indexOf('[oyp-print] print.js v33') >= 0, 'the print station logs the print.js version');
    eq(pr.innerHTML.indexOf('id="prBuild"') >= 0 && pr.innerHTML.indexOf('print.js v33') >= 0, 'the print station shows the print.js version');
    eq(stuck.clients.length === 1 && stuck.notes.indexOf('B1 reconnected') >= 0 && pr.innerHTML.indexOf('>B1<') >= 0 && pr.innerHTML.indexOf('data-slot-act="disconnect"') >= 0 && pr.innerHTML.indexOf('Reconnecting') >= 0 && pr.innerHTML.indexOf('>Retry<') >= 0, 'a stuck B31 connect does not block the B1, and Reconnecting keeps Retry');
    const live = stuck.clients[0];
    eq(live.beats >= 1 && live.heartbeatTimer, 'the idle B1 heartbeat is running');
    const beats = live.beats;
    live.heartbeatTimer = 0;
    stuck.workers[0].onmessage();
    eq(live.heartbeatTimer && live.beats === beats + 1, 'a stopped idle heartbeat is started again');
    live.emit('disconnect');
    return drain();
  }).then(function () {
    eq(stuck.clients.length === 2 && stuck.notes.filter(function (t) { return t === 'B1 reconnected'; }).length >= 2 && b31Tries === 1, 'a disconnect while idle reconnects that slot while the other attempt is still stuck');
    stuck.poke(9999);
    return drain();
  }).then(function () {
    eq(dropped.n === 0 && stuck.notes.indexOf('B31 reconnected') < 0 && b31Tries === 1, 'the stuck connect is still inside the 10 second budget');
    stuck.poke(10000);
    return drain();
  }).then(function () {
    eq(dropped.n >= 1 && pr.innerHTML.indexOf('>Retry<') >= 0 && stuck.notes.indexOf('B31 reconnected') < 0, 'at 10 seconds the link disconnects and shows Retry');
    eq(stuck.logs.some(function (l) { return l.indexOf('[oyp-print] link gatt.connect ') === 0 && l.indexOf('10000ms') >= 0 && l.indexOf('timed out') >= 0; }), 'the timeout is logged with its 10000 ms budget');
    stuck.poke(3000);
    return drain();
  }).then(function () {
    const saved = JSON.parse(stuck.store.oypPrint);
    const links = (saved.links || []).filter(Boolean);
    eq(stuck.notes.indexOf('B31 reconnected') >= 0 && links.some(function (l) { return l.btId === 'bt-b31' && l.model === 'B31'; }) && links.some(function (l) { return l.btId === 'bt-b1' && l.model === 'B1'; }) && stuck.clients.length === 3, 'the next retry connects the B31 and leaves the B1 up');
  });
}).then(function () {
  let tries = 0;
  const tapped = bootPrint({
    manualTime: true,
    models: ['B1', 'B1', 'B1'],
    grantDevices: [
      {
        id: 'bt-b31',
        name: 'B31-HB03011342',
        watchAdvertisements: function () { return Promise.resolve(); },
        gatt: {
          connect: function () {
            tries += 1;
            if (tries === 1) return new Promise(function () {});
            return Promise.resolve();
          },
          disconnect: function () {}
        }
      },
      {
        id: 'bt-b1',
        name: 'B1-HC17121009',
        watchAdvertisements: function () { return Promise.resolve(); },
        gatt: { connect: function () { return Promise.resolve(); } }
      }
    ],
    queue: { ok: true, items: [] },
    store: { oypPrint: JSON.stringify({ auto: false }) }
  });
  return drain().then(function () {
    const btn = {
      getAttribute(name) {
        if (name === 'data-slot-act') return 'retry';
        if (name === 'data-slot') return '0';
        return null;
      },
      closest(sel) { return sel === '[data-slot-act]' ? btn : null; }
    };
    (tapped.sandbox.document._listeners.click || []).forEach(function (fn) {
      fn({ target: btn, preventDefault() {} });
    });
    return drain();
  }).then(function () {
    eq(tries === 2 && tapped.notes.indexOf('B31 reconnected') >= 0 && tapped.clients.length === 2, 'Retry cancels the stuck attempt and connects on the next try');
  });
}).then(function () {
  const lag = { script: 400, send: 120, render: 30 };
  const store = { oypPrint: JSON.stringify({ auto: false, model: 'B31', task: 'B1' }) };
  const oldBox = bootPrint({
    lag: lag, manualTime: true, drive: true, models: ['B31'],
    queue: { ok: true, items: [] }, store: store
  });
  oldBox.sandbox.OYPPrint.connect('bluetooth');
  return drain().then(function () {
    const t0 = oldBox.now();
    const marks = {};
    const legacy = oldBox.sandbox.fetch('https://example.test', { method: 'POST', body: JSON.stringify({ action: 'printEnqueue', jo: '26-500', kind: 'jo_card', print_id: 'pq-legacy1' }) })
      .then(function (res) { return res.json(); })
      .then(function () {
        marks.enqueue = oldBox.now() - t0;
        const claim = oldBox.sandbox.fetch('https://example.test', { method: 'POST', body: JSON.stringify({ action: 'printMark', mark: 'claim', print_id: 'pq-legacy1' }) });
        oldBox.sandbox.niimbluelib.ImageEncoder.encodeCanvas({ width: 384, height: 10 });
        marks.renderAt = oldBox.now() - t0;
        return claim.then(function (res) { return res.json(); }).then(function () {
          marks.claimDone = oldBox.now() - t0;
          const task = oldBox.clients[0].protocol.newPrintTask('B1');
          marks.sendAt = oldBox.now() - t0;
          return task.printInit().then(function () { return task.printPage({}); }).then(function () {
            marks.paper = oldBox.now() - t0;
            return marks;
          });
        });
      });
    oldBox.flush(400);
    return drain().then(function () {
      oldBox.flush(400);
      return drain().then(function () {
        oldBox.flush(120);
        return drain().then(function () { return legacy; });
      });
    });
  }).then(function (marks) {
    eq(marks.enqueue === 400 && marks.renderAt === 430 && marks.claimDone === 800 && marks.sendAt === 800 && marks.paper === 920, 'the old path measures enqueue 400, claim 400, render 30 overlapped, send 120');
    const neu = bootPrint({
      lag: lag, manualTime: true, drive: true, models: ['B31'], aliasId: 'pq-serverrow1',
      queue: { ok: true, items: [] }, store: store
    });
    neu.sandbox.OYPPrint.connect('bluetooth');
    return drain().then(function () {
      neu.sandbox.OYPPrint.printJo('jo_card', '26-501', { reprint: true });
      return drain();
    }).then(function () {
      const send = neu.timeline.filter(function (e) { return e.ev === 'send'; }).pop();
      eq(send && send.t === 30 && !neu.timeline.some(function (e) { return e.ev === 'fetch-done' && e.action === 'printEnqueue'; }) && neu.tasks.length === 1, 'the printer starts at 30ms, while enqueue is still in flight');
      neu.flush(120);
      return drain().then(function () {
        const paper = neu.timeline.filter(function (e) { return e.ev === 'paper'; }).pop();
        eq(paper && paper.t === 150, 'paper is out at 150ms, render 30 plus send 120');
        neu.flush(400);
        return drain();
      });
    }).then(function () {
      const enq = neu.timeline.filter(function (e) { return e.ev === 'fetch-done' && e.action === 'printEnqueue'; }).pop();
      const printed = neu.calls.filter(function (b) { return b.mark === 'printed'; });
      const sent = neu.calls.filter(function (b) { return b.action === 'printEnqueue' || b.op === 'printEnqueue'; });
      eq(enq && enq.t === 400 && printed.length === 1 && printed[0].print_id === 'pq-serverrow1' && sent[0].print_id !== 'pq-serverrow1', 'enqueue finishes at 400ms and the existing row is the one marked printed');
      eq(marks.sendAt - 30 === 770 && marks.paper - 150 === 770, 'tap to printer is 800ms before and 30ms after; tap to paper is 920ms before and 150ms after');
    });
  });
}).then(function () {
  const onlyTag = { print_id: 'pq-only-tag', jo: '26-363', kind: 'jewelry_tag', status: 'queued', client: 'Ada' };
  const slot2 = bootPrint({
    drive: true,
    models: ['B1'],
    names: ['B1-HC17121009'],
    queue: { ok: true, auto: true, items: [onlyTag] },
    store: { oypPrint: JSON.stringify({ auto: true, task: 'B1' }) }
  });
  slot2.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
  return drain().then(function () {
    eq(slot2.clients.length === 1 && slot2.clients[0].pages.length === 1 && !slot2.notes.some(function (t) { return t.indexOf('protocol') >= 0; }), 'slot 1 is null and the jewelry tag is written on the slot 2 B1');
    const both = bootPrint({
      drive: true,
      models: ['B1', 'B1'],
      names: ['B31-HB03011342', 'B1-HC17121009'],
      queue: { ok: true, auto: false, items: [Object.assign({}, onlyTag)] },
      store: { oypPrint: JSON.stringify({ auto: false, task: 'B1', kindsByModel: { B31: { jo_card: true, jewelry_tag: true }, B1: { jo_card: false, jewelry_tag: true } } }) }
    });
    both.sandbox.OYPPrint.connect('bluetooth');
    both.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
    return drain().then(function () {
      both.sandbox.OYPPrint.printQueued();
      return drain();
    }).then(function () {
      const wroteB31 = both.logs.some(function (line) { return line.indexOf('[oyp-print] write') >= 0 && line.indexOf('name=B31-') >= 0; });
      const wroteB1 = both.logs.some(function (line) { return line.indexOf('[oyp-print] write') >= 0 && line.indexOf('btId=') >= 0 && line.indexOf('name=B1-HC17121009') >= 0 && line.indexOf('client=') >= 0 && line.indexOf('model=B1') >= 0; });
      eq(both.clients.length === 2 && both.clients[1].pages.length === 1 && both.clients[0].pages.length === 0 && wroteB1 && !wroteB31, 'with both connected, the tag bytes reach only the B1 mock');
      const tap = bootPrint({
        drive: true,
        models: ['B1', 'B1'],
        names: ['B31-HB03011342', 'B1-HC17121009'],
        queue: { ok: true, auto: false, items: [] },
        store: { oypPrint: JSON.stringify({ auto: false, task: 'B1' }) }
      });
      tap.sandbox.OYPPrint.connect('bluetooth');
      tap.sandbox.OYPPrint.connectSlot(1, 'bluetooth');
      return drain().then(function () {
        tap.sandbox.OYPPrint.printJo('jewelry_tag', '26-370', { reprint: true });
        return drain();
      }).then(function () {
        eq(tap.clients.length === 2 && tap.clients[1].pages.length === 1 && tap.clients[0].pages.length === 0, 'instant print writes the tag to the B1 client and not the B31');
      });
    });
  });
}).then(function () {
  function armKind(env) {
    const sheets = [];
    env.sandbox.document.createElement = function () {
      const el = { className: '', id: '', textContent: '', style: {}, children: [], attrs: {}, parentNode: null, onclick: null };
      el.setAttribute = function (k, v) { el.attrs[k] = String(v); };
      el.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; };
      el.appendChild = function (child) { el.children.push(child); child.parentNode = el; return child; };
      el.remove = function () {
        const p = el.parentNode;
        if (p && p.children) {
          const i = p.children.indexOf(el);
          if (i >= 0) p.children.splice(i, 1);
        }
        const s = sheets.indexOf(el);
        if (s >= 0) sheets.splice(s, 1);
      };
      return el;
    };
    env.sandbox.document.body.appendChild = function (el) { sheets.push(el); el.parentNode = env.sandbox.document.body; return el; };
    env.sandbox.document.getElementById = function (id) {
      function walk(n) {
        if (!n) return null;
        if (n.id === id) return n;
        const kids = n.children || [];
        for (let i = 0; i < kids.length; i++) { const found = walk(kids[i]); if (found) return found; }
        return null;
      }
      for (let i = 0; i < sheets.length; i++) { const found = walk(sheets[i]); if (found) return found; }
      return null;
    };
    env.sheets = sheets;
    return env;
  }
  function press(env, kind) {
    function walk(n) {
      if (n && n.attrs && n.attrs['data-kind'] === kind) return n;
      const kids = (n && n.children) || [];
      for (let i = 0; i < kids.length; i++) { const found = walk(kids[i]); if (found) return found; }
      return null;
    }
    const btn = walk(env.sheets[env.sheets.length - 1]);
    btn.onclick({ stopPropagation: function () {} });
  }
  function batch(env) {
    return env.calls.filter(function (b) { return b.op === 'printEnqueueBatch' || b.action === 'printEnqueueBatch'; }).pop();
  }
  function find(env, attr, val) {
    function walk(n) {
      if (n && n.attrs && n.attrs[attr] === val) return n;
      const kids = (n && n.children) || [];
      for (let i = 0; i < kids.length; i++) { const found = walk(kids[i]); if (found) return found; }
      return null;
    }
    for (let i = 0; i < env.sheets.length; i++) { const found = walk(env.sheets[i]); if (found) return found; }
    return null;
  }
  function click(env, attr, val) {
    const el = find(env, attr, val);
    if (!el || typeof el.onclick !== 'function') throw new Error('missing ' + attr + '=' + val);
    el.onclick({ stopPropagation: function () {} });
    return el;
  }
  function fieldTexts(env) {
    const out = [];
    function walk(n) {
      if (n && n.attrs && n.attrs['data-field']) out.push(n.attrs['data-field'] + '=' + (n.value || ''));
      const kids = (n && n.children) || [];
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
    }
    env.sheets.forEach(walk);
    return out;
  }
  const prevCss = (read('print.css').split('.oyp-prev{')[1] || '');
  eq(prevCss.includes('.oyp-prevnav{') && prevCss.includes('.oyp-prevthumb{') && prevCss.includes('.oyp-prevfield input') && prevCss.includes('.oyp-prevbtn{') && prevCss.includes('.oyp-prevsave input') && prevCss.includes('min-height:44px') && prevCss.includes('min-width:34px') && prevCss.includes('min-height:34px'), 'preview controls are at least 34px');
  const layCss = (read('print.css').split('.oyp-lay{')[1] || '');
  eq(layCss.includes('.oyp-layhandle{') && layCss.includes('min-width:34px') && layCss.includes('min-height:44px') && layCss.includes('.oyp-laybtn{') && layCss.includes('.oyp-laypick{'), 'layout editor controls are at least 34px');
  eq(read('print.js').includes('Edit layout') && read('print.js').includes('printLayoutSet') && read('print.js').includes('id="prLayTag"') && read('print.js').includes('id="prLayCard"') && read('print.js').includes('o.layout'), 'the layout editor is on the preview and in Settings, and the print uses the saved layout');
  eq(!read('print.js').includes('printItemSave') && !read('print.js').includes('jobReviewSave') && read('print.js').split('openPreview(').length === 4, 'the preview does not call a save action; the kind choice and Print one open it');
  eq(read('paste/PrintItemSave.gs').includes("action !== 'printItemSave'") && read('paste/PrintItemSave.gs').includes('jo is the row key') && read('paste/SETUP-print.txt').includes('PrintItemSave.gs'), 'the item save script is written for the next paste and is not wired');
  eq(read('paste/PrintLayout.gs').includes("a !== 'printLayout' && a !== 'printLayoutSet'") && read('paste/PrintLayout.gs').includes('print_layout') && read('paste/SETUP-print.txt').includes('PrintLayout.gs') && !read('paste/PrintQueue.gs').includes('printLayoutSet'), 'the layout script is a separate paste and the queue file does not claim it');
  const tag = armKind(bootPrint({
    queue: { ok: true, items: [], spec: { client: 'Ada Lopez', price: '11500', description: 'Silver Necklace', item_type: 'Earring', metal: 'Gold', karat: '14K', stones: 'Cubic Zirconia', weight_g: '7', sku: '18-498', location: 'A.R3' } }
  }));
  const pending = tag.sandbox.OYPPrint.askPrint(['26-287B', '26-288', '26-289']);
  const primary = (function walk(n) {
    if (n && n.attrs && n.attrs['aria-current'] === 'true') return n;
    const kids = (n && n.children) || [];
    for (let i = 0; i < kids.length; i++) { const found = walk(kids[i]); if (found) return found; }
    return null;
  })(tag.sheets[0]);
  eq(!!primary && primary.attrs['data-kind'] === 'jewelry_tag' && primary.className === 'pill sm' && primary.textContent === 'Jewelry tag', 'Jewelry tag is the preselected primary');
  press(tag, 'jewelry_tag');
  eq(!batch(tag) && tag.sheets.some(function (s) { return s.id === 'oypPrev'; }), 'choosing Jewelry tag opens the preview and does not queue');
  return drain().then(function () {
    const save = find(tag, 'data-save', 'item');
    const note = find(tag, 'data-save-note', '1');
    const count = tag.sandbox.document.getElementById('oypPrevCount');
    const fields = fieldTexts(tag).join(',');
    const nums = [];
    (function walk(n) {
      if (n && n.className === 'oyp-prevnum') nums.push(n.textContent);
      ((n && n.children) || []).forEach(walk);
    })(tag.sheets[0]);
    eq(!!find(tag, 'id', 'oypPrev') || tag.sheets.some(function (s) { return s.id === 'oypPrev'; }), 'the preview sheet is open');
    eq(count && count.textContent === '1 / 3' && nums.join(',') === '1,2,3' && find(tag, 'data-print', 'all').textContent === 'Print all (3)' && find(tag, 'data-print', 'one').textContent === 'Print this one', 'the strip is numbered, the counter is 1 / 3, and both print buttons are there');
    eq(save && save.disabled === true && save.attrs.disabled === 'disabled' && note && note.textContent.indexOf('this print only') >= 0, 'Save to item is disabled, and the note says this print only');
    eq(fields.indexOf('price=11500') >= 0 && fields.indexOf('name=Silver Necklace') >= 0 && fields.indexOf('type=Earring') >= 0 && fields.indexOf('metal=Gold') >= 0 && fields.indexOf('karat=14K') >= 0 && fields.indexOf('stones=Cubic Zirconia') >= 0 && fields.indexOf('weight=7') >= 0 && fields.indexOf('jo=26-287B') >= 0 && fields.indexOf('sku=18-498') >= 0 && fields.indexOf('location=A.R3') >= 0 && fields.indexOf('Ada Lopez') < 0, 'the tag fields load from the item, and the client name is not one of them');
    eq(find(tag, 'data-nav', 'prev').disabled === true, 'previous is disabled on the first tag');
    eq(!batch(tag) && !tag.calls.some(function (b) { return b.action === 'printItemSave' || b.op === 'printItemSave' || b.action === 'jobReviewSave'; }), 'the kind choice still has not queued or saved');
    click(tag, 'data-nav', 'next');
    eq(count.textContent === '2 / 3' && find(tag, 'data-page', '2').attrs['aria-current'] === 'true' && fieldTexts(tag).join(',').indexOf('jo=26-288') >= 0, 'next moves to item 2 of 3');
    const name = find(tag, 'data-field', 'name');
    name.value = 'Pearl Stud';
    name.oninput();
    eq(name.value === 'Pearl Stud', 'the name field keeps the edit');
    click(tag, 'data-print', 'all');
    return pending.then(function () {
      const body = batch(tag);
      const kinds = body && body.items.map(function (it) { return it.kind; }).join(',');
      const jos = body && body.items.map(function (it) { return it.jo; }).join(',');
      const extra = body && body.items.some(function (it) { return it.price || it.name || it.client; });
      const edited = tag.sandbox.OYPPrint.labelOpts({ jo: '26-288', kind: 'jewelry_tag', price: '1', description: 'Sheet name', client: 'Ada Lopez' });
      const untouched = tag.sandbox.OYPPrint.labelOpts({ jo: '26-287B', kind: 'jewelry_tag', price: '9', description: 'Sheet name' });
      const otherKind = tag.sandbox.OYPPrint.labelOpts({ jo: '26-288', kind: 'jo_card' });
      eq(body && body.items.length === 3 && kinds === 'jewelry_tag,jewelry_tag,jewelry_tag' && jos === '26-287B,26-288,26-289' && !extra && tag.notes.indexOf('Queued 3 jewelry tags') >= 0, 'Print all queues only jewelry tags, and keeps the JO letter');
      eq(edited.name === 'Pearl Stud' && edited.description === '' && String(edited.price) === '1' && !('client' in edited) && untouched.name === '' && untouched.description === 'Sheet name' && otherKind.jo === '26-288', 'the name edit applies to this tag only, and a JO sticker of the same JO is left alone');
      const card = armKind(bootPrint({}));
      const cardPending = card.sandbox.OYPPrint.askPrint(['26-287B']);
      press(card, 'jo_card');
      return drain().then(function () {
        eq(!batch(card) && find(card, 'data-sticker-kind', '1').textContent === 'JO sticker' && fieldTexts(card).some(function (s) { return s.indexOf('jo=26-287B') === 0; }) && find(card, 'data-save', 'item').disabled === true, 'JO sticker opens the same preview and does not queue yet');
        const joField = find(card, 'data-field', 'jo');
        joField.value = '26-999';
        joField.oninput();
        click(card, 'data-print', 'one');
        return cardPending.then(function () {
          const cardBody = batch(card);
          const printed = card.sandbox.OYPPrint.labelOpts({ jo: '26-287B', kind: 'jo_card', metal: 'Gold' });
          const tagSame = card.sandbox.OYPPrint.labelOpts({ jo: '26-287B', kind: 'jewelry_tag', metal: 'Gold' });
          eq(cardBody && cardBody.items.length === 1 && cardBody.items[0].kind === 'jo_card' && cardBody.items[0].jo === '26-287B' && card.notes.indexOf('Queued 1 JO sticker') >= 0 && printed.jo === '26-999' && tagSame.jo === '26-287B', 'Print this one queues the JO sticker, and the JO edit is print-only');
          const both = armKind(bootPrint({}));
          const bothPending = both.sandbox.OYPPrint.askPrint(['26-287B', '26-288']);
          press(both, 'both');
          return drain().then(function () {
            eq(!batch(both) && both.sandbox.document.getElementById('oypPrevCount').textContent === '1 / 4', 'Both opens one page per sticker and does not queue yet');
            click(both, 'data-print', 'all');
            return bothPending.then(function () {
              const bothBody = batch(both);
              const got = bothBody && bothBody.items.map(function (it) { return it.jo + ':' + it.kind; }).join(',');
              eq(got === '26-287B:jewelry_tag,26-287B:jo_card,26-288:jewelry_tag,26-288:jo_card' && both.notes.indexOf('Queued 2 jewelry tags and 2 JO stickers') >= 0, 'Both queues one jewelry tag and one JO sticker per JO');
              const cancel = armKind(bootPrint({}));
              const cancelPending = cancel.sandbox.OYPPrint.askPrint(['26-287B']);
              press(cancel, 'cancel');
              return cancelPending.then(function (r) {
                eq(r == null && !batch(cancel) && cancel.notes.length === 0, 'Cancel queues nothing');
                const back = armKind(bootPrint({}));
                const backPending = back.sandbox.OYPPrint.askPrint(['26-287B']);
                press(back, 'jewelry_tag');
                return drain().then(function () {
                  click(back, 'data-print', 'cancel');
                  return backPending.then(function (closed) {
                    eq(closed == null && !batch(back) && back.notes.length === 0, 'closing the preview queues nothing');
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}).then(function () {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('print-sim passed');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
