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
  eq(noName(t) && t.lines.length === 1 && t.lines[0] === '26-287' && t.specPx === 0 && t.lines.indexOf('18K GOLD') < 0 && t.lines.indexOf('ELENA') < 0, model + ' jewelry tag is the QR and the JO');
  eq(tailWhite(t), model + ' jewelry tag tail is blank');
  eq(landscape(t), model + ' jewelry tag reads landscape, QR on the left and text on the right');
  eq(decode(t) === '26-287', model + ' jewelry tag QR is 26-287');
});

const noted = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', description: 'thin band', metal: 'yellow gold', client: 'Elena Tan' });
eq(noted.specPx >= 16 && noted.joPx > noted.specPx && noName(noted) && noted.lines.indexOf('THIN BAND') >= 0 && noted.lines.indexOf('YELLOW') < 0 && noted.lines.indexOf('ELENA') < 0, 'a description prints under the JO, and the metal and the client name do not');
const long = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', description: 'thin gold band', client: 'Elena Tan' });
eq(long.specPx >= 16 && long.specPx < L.SPEC_PX && long.joPx > long.specPx && noName(long) && long.lines.indexOf('THIN GOLD BAND') >= 0, 'a description shrinks but stays at least 16 px, still smaller than the JO, still with no name');
const wide = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', description: 'a very long description of this finished piece that cannot fit', client: 'Elena Tan' });
eq(wide.specPx >= 14 && wide.joPx > wide.specPx && noName(wide) && wide.lines.some(s => s.indexOf('...') >= 0), 'a description that still does not fit is ellipsized and stays off the edge');
function clearMargin(img) {
  const m = L.px(1), x0 = img.offsetX;
  for (let y = 0; y < img.labelH; y++) for (let x = 0; x < img.labelW; x++) {
    const edge = x < m || x >= img.labelW - m || y < m || y >= img.labelH - m;
    if (!edge) continue;
    if (img.data[(y * img.width + x0 + x) * 4] !== 255) return false;
  }
  return true;
}
/* Text sits beside the QR, not under it, and stays inside the head. */
function landscape(img) {
  const box = img.qrBox;
  if (!box || box.x > img.offsetX + L.px(1) + 1) return false;
  const right = box.x + box.size;
  let ink = false;
  for (let y = 0; y < img.labelH; y++) {
    for (let x = right + 2; x < img.offsetX + img.labelW - L.px(1); x++) {
      if (img.data[(y * img.width + x) * 4] === 0) ink = true;
    }
  }
  for (let y = box.y + box.size + 2; y < img.labelH; y++) {
    for (let x = img.offsetX; x < right - 4; x++) {
      if (img.data[(y * img.width + x) * 4] === 0) return false;
    }
  }
  return ink;
}
eq(clearMargin(long) && clearMargin(wide), 'spec ink stays about 1 mm inside the 30 mm edges');
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
sameMargin(L.render(Object.assign({ model: 'B1' }, tag)), 'B1 jewelry tag left and right ink margins match');
sameMargin(L.render(Object.assign({ model: 'B1', jo: '26-1287' }, tag)), 'a long jewelry tag keeps equal side margins');
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
eq(letterImgs['26-1234A'].tag.joPx >= 18 && letterImgs['26-287'].tag.joPx >= letterImgs['26-287B'].tag.joPx, 'a jewelry tag keeps the JO at least as large as today when a letter still fits');
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
const foldY = pad + tagView.labelH * 4;
const fold = pxAt(tagView, pad + Math.round(tagView.labelW * 4 / 2), foldY);
const above = pxAt(tagView, pad + Math.round(tagView.labelW * 4 / 2), foldY - 8);
eq(cardView.width === (240 + L.px(4) * 2) * 4 && cardView.height === (160 + L.px(4) * 2) * 4 && tagView.height === (560 + L.px(4) * 2) * 4, 'a preview is the label, with gray around it');
eq(corner[0] < 180 && corner[0] > 100 && paper[0] > 250 && outside[0] < 180, 'the sticker is a white rounded rectangle on mid-gray');
eq(tagView.tail === 360 && fold[0] < above[0] - 8, 'the jewelry preview draws a faint fold between the head and the tail');
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

// Sheet side: specs and the on-screen name come from one JobOrders read and one Clients read; a Date due prints as a day.
let jobReads = 0;
ctx.jobRows_ = function (name) {
  jobReads++;
  if (name === 'JobOrders') return [{ jo: '26-287', client_id: 'c-1', metal: 'yellow gold', karat: '18k', weight_g: 3.2, stone_type: 'diamond', stone_size: '0.5ct', size: '6', due_date: new Date(2026, 9, 27) }];
  if (name === 'Clients') return [{ client_id: 'c-1', name: 'Elena Tan' }];
  return [];
};
const look = ctx.printLookup_();
const d1 = ctx.printDecorate_({ print_id: 'pq-1', jo: '26-287', kind: 'jewelry_tag', status: 'queued' }, look);
const d2 = ctx.printDecorate_({ print_id: 'pq-2', jo: '26-287', kind: 'jo_card', status: 'queued' }, look);
eq(jobReads === 2 && d1.client === 'Elena Tan' && d2.client === 'Elena Tan', 'the queue reads JobOrders and Clients once and shows the name on screen');
eq(d1.due_date === '2026-10-27' && d1.metal === 'yellow gold' && d1.stone_size === '0.5ct', 'a Date due is a day, specs are joined');
if (draw) {
  const r1 = L.render(Object.assign({ model: 'B1', kind: 'jewelry_tag' }, { jo: d1.jo, karat: d1.karat, metal: d1.metal, weight: d1.weight_g, stone: d1.stone_type, stone_size: d1.stone_size, size: d1.size }));
  const r2 = L.render({ model: 'B1', kind: 'jewelry_tag', jo: d1.jo, karat: d1.karat, metal: d1.metal, weight: d1.weight_g, stone: d1.stone_type, stone_size: d1.stone_size, size: d1.size, client: d1.client });
  eq(same(r1.data, r2.data) && noName(r2), 'a decorated row prints the same pixels with or without the name');
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
eq(index.includes('print.js?v=18') && index.includes('print-label.js?v=10') && index.includes('nav.js?v=40') && index.includes('app.js?v=34') && index.includes('settings.js?v=20') && index.includes('print.css?v=13') && index.includes('app.css?v=45') && index.includes('settings.css?v=10') && index.includes('inv.js?v=13') && index.includes('production.js?v=13') && index.includes('production.css?v=11') && index.includes('photos.js?v=2') && index.includes('review.js?v=20'), 'print assets are cache-busted');
eq(read('nav.js').includes('print-label.js?v=10') && read('nav.js').includes('print.js?v=18') && read('nav.js').includes('scan-zones.js?v=11') && read('nav.js').includes('menuHtml'), 'the scanner injects the current label renderer');
eq(read('staff/print-test.html').includes('print.js?v=18') && read('staff/print-test.html').includes('print-label.js?v=10') && read('staff/print-test.html').includes('print.css?v=13') && read('staff/print-test.html').includes('nav.js?v=40') && read('staff/print-test.html').includes('app.css?v=45'), 'print test loads the same print assets');
eq(read('print.js').includes('offsetMm') && read('staff/print-test.html').includes('prOff'), 'offsets are saved per model and shown on the print test page');
eq(read('staff/print-test.html').includes('OYPLabel.preview') && read('print.js').includes('oyp-qprev'), 'print test and the queue preview the sticker, not the printhead');
const testPage = read('staff/print-test.html'), testCss = read('print.css');
const b31At = testPage.indexOf('B31 Printer for 30x20 - Test'), b1Card = testPage.indexOf('B1 Printer for 30x20 - Test'), b1Tag = testPage.indexOf('B1 Printer for Jewelry Tag - Test');
eq(b31At > 0 && testPage.indexOf('B31 calibration') > b31At && b1Card > testPage.indexOf('B31 calibration') && b1Tag > b1Card && testPage.indexOf('B1 calibration') > b1Tag, 'print test titles name the B31 card, the B1 card, and the B1 jewelry tag');
eq(testCss.includes('grid-template-columns:1fr 1fr') && testCss.includes('.pr-stage') && testCss.includes('justify-content:center') && /max-width:800px/.test(testCss), 'print test is two equal columns and stacks below an iPad portrait');
eq(testPage.includes('class="top"') && testPage.includes('id="btnMenu"') && testPage.includes('class="logo"') && !testPage.includes('printChip') && !index.includes('printChip') && testPage.includes('class="office"') && testPage.includes('id="side"') && testPage.includes('class="side"') && testPage.includes('OYPNav.sideHtml') && testPage.includes('app.css?v=45') && testPage.includes('OYPNav.menuHtml'), 'print test uses the staff header and the same left menu, with no printer pill');
eq(read('print.js').includes('Print queue not set up yet') && read('print.js').includes('No stickers waiting') && read('print.js').includes('class="pill sm"') && read('print.js').includes('class="dchip') && read('print.js').includes('class="setp') && read('print.js').includes('class="cn"') && read('print.js').includes('whomenu') && read('print.css').includes(':where(') && !read('print.css').includes('.oyp-pr-btn') && testPage.includes("'dcard'") && testPage.includes("'dtitle'") && testPage.includes('class="setbox" id="printQueue"'), 'print controls use the staff cards, pills, rows, and menu');
eq(read('print.js').includes('Open in Chrome or Edge to connect a printer') && read('print.js').includes("iPad can't connect a printer. Stickers wait in the print queue.") && read('print.js').includes('Connect by Bluetooth') && read('print.js').includes('Connect by USB') && read('print.js').includes('aria-label="Close"') && read('print.js').includes("e.key !== 'Escape'"), 'Safari sees how to connect, and the queue panel can close');
eq(testPage.indexOf('<h2>Print queue</h2>') < testPage.indexOf('<h2>Settings</h2>') && testPage.indexOf('<h2>Settings</h2>') < testPage.indexOf('<h2>Label alignment</h2>') && testPage.indexOf('<h2>Printer</h2>') < 0, 'print test leads with the queue, then settings, then label alignment');
eq(read('print.js').includes('id="prDark"') && read('print.css').includes('#prDark .pill.sm{min-width:32px;text-align:center;font-family:var(--head,\'Libre Bodoni\',Georgia,serif);font-size:var(--d-btnout-fp,calc(18px*var(--hs)));font-weight:var(--d-btnout-g,500)}') && read('print.css').includes('#prDark .pill.sm:not(.outline){border:1px solid #111}'), 'each darkness number is the same font and size, at least 32 px wide');
eq(testPage.includes('class="pr-sec"') && testCss.includes('.pr-sec + .pr-sec{margin-top:calc(22px * var(--sp,1))}') && testCss.includes('.pr-page h2{margin:0 0 calc(8px * var(--sp,1))}') && testCss.includes('.pr-copy{display:flex;flex-direction:column;gap:calc(22px * var(--sp,1))}') && testCss.includes('.pr-page .pr-copy p.muted{margin:0;max-width:none}') && testCss.includes('.pr-page #printSet .setbox + p.muted{margin:calc(8px * var(--sp,1)) 0 0;max-width:none}') && testCss.includes('.pr-page .setbox{max-width:none;width:100%}'), 'print test sections share one width and the staff spacing steps');
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
eq(preview.ok && preview.preview && preview.count === 5 && batchWrites.length === 0 && sheetRows.length === beforeBatch, 'a range preview counts existing JOs and writes nothing');
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
eq(read('inv.js').includes('id="ivChoose"') && read('inv.js').includes('Print stickers (${n})') && read('inv.js').includes("jewelry_tag' : 'jo_card'") && !read('inv.js').includes('#ivScan') && !read('inv.js').includes('id="ivScan"') && read('inv.js').includes('Search or scan JO, client, 18k, sapphire…') && read('inv.js').includes('ivScanCommit') && read('inv.js').includes('ivQFast') && read('inv.js').includes('ivFullJo') && read('production.js').includes('id="pChoose"') && read('production.js').includes('Print stickers (${S.sel.size})') && read('production.js').includes("kind: 'jo_card'") && read('app.css').includes('.iv.choose .ivck') && !read('app.css').includes('.ivcard:hover .ivck') && read('print.js').includes('Print a range') && read('print.js').includes('preview: 1') && read('print.js').includes("'printEnqueueBatch'") && read('settings.js').includes('id="printRange"') && testPage.includes('id="printRange"'), 'lists stay clear until Select, and a range shows its count before it queues');
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
    addEventListener() {}
  };
  function WorkerCtor() {
    if (opts.workerFails) throw new Error('no worker');
    this.onmessage = null;
    workers.push(this);
  }
  WorkerCtor.prototype.terminate = function () {};
  const nextModel = (opts.models || ['B1']).slice();
  const tasks = [];
  const encodes = [];
  const logs = [];
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
  function Task(name) { this.name = name; tasks.push(name); }
  Task.prototype.printInit = function () { return Promise.resolve(); };
  Task.prototype.printPage = function () {
    const step = pages.length ? pages.shift() : 'ok';
    if (step === 'e4') return Promise.reject(new Error('Timeout waiting response (waited for e4)'));
    if (step === 'hang') return new Promise(function () {});
    return Promise.resolve();
  };
  Task.prototype.waitForFinished = function () { return Promise.resolve(); };
  Task.prototype.printEnd = function () {
    if (opts.endHangs) return new Promise(function () {});
    return Promise.resolve();
  };
  function Client() { clients.push(this); this.beats = 0; this._on = {}; }
  Client.prototype.connect = function (options) { connects.push(options || null); return Promise.resolve(); };
  Client.prototype.disconnect = function () {
    const self = this;
    return Promise.resolve().then(function () { self.emit('disconnect'); });
  };
  Client.prototype.on = function (name, fn) { this._on[name] = fn; };
  Client.prototype.emit = function (name) { if (this._on[name]) this._on[name](); };
  Client.prototype.startHeartbeat = function () { this.beats += 1; };
  Client.prototype.getPrintTaskType = function () { return opts.found || ''; };
  Client.prototype.getPrinterInfo = function () { return { protocolVersion: opts.protocol == null ? 4 : opts.protocol }; };
  Client.prototype.protocol = { newPrintTask: function (name) { return new Task(name); } };
  Client.prototype.getModelMetadata = function () {
    const model = nextModel.length ? nextModel.shift() : 'B31';
    return { model: model, printheadPixels: model === 'B31' ? 600 : 384, printDirection: 'top' };
  };
  let ble = opts.bluetooth || {};
  if (opts.reconnect || opts.devices) {
    const rawDevices = opts.devices || [{
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
    performance: { now: () => Date.now() },
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
        data = { ok: true, created: true, item: { print_id: 'pq-n' + calls.length, jo: body.jo, kind: body.kind, status: 'queued' } };
      }
      if (body.mark === 'claim') {
        if (opts.taken) data = { ok: false, code: 'TAKEN', error: 'Another printer has this sticker' };
        else data = { ok: true, claimed: true, item: { print_id: body.print_id, status: 'queued', kind: 'jo_card', jo: body.jo || '26-336' } };
      }
      if (body.mark === 'requeue') data = { ok: true, requeued: true, item: { print_id: body.print_id, status: 'queued', kind: 'jo_card', jo: '26-336', error: '' } };
      if (body.mark === 'printed' || body.mark === 'failed' || body.mark === 'cancelled') data = { ok: true };
      if ((body.action === 'printQueue' || body.op === 'printQueue') && (body.brief === 1 || body.brief === '1' || body.brief === true)) {
        if (opts.brief) data = { ok: true, brief: true, rev: opts.rev == null ? null : String(opts.rev), auto: opts.auto !== false };
        else if (!opts.queue) data = { ok: true, items: [] };
      }
      const res = { json() { return Promise.resolve(data); }, clone() { return { json() { return Promise.resolve(data); } }; } };
      if (opts.holdClaim && body.mark === 'claim') return new Promise(resolve => { held.push({ mark: 'claim', resolve: () => resolve(res) }); });
      if (opts.holdPrinted && body.mark === 'printed') return new Promise(resolve => { held.push({ mark: 'printed', resolve: () => resolve(res) }); });
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
    ImageEncoder: { encodeCanvas: function (c) { encodes.push(c && c.width); return { cols: c.width, rows: c.height, rowsData: [] }; } },
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
    sandbox, store, calls, workers, intervals, tasks, encodes, logs, clients, connects, notes, gatt: function () { return gattConnects; },
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
    eq(hidden.workers.length === 1 && !hidden.intervals.some(i => i.ms === 5000), 'the worker timer runs and the fallback interval does not');
    if (hidden.workers[0]) hidden.workers[0].onmessage();
    return drain().then(function () {
      eq(hidden.calls.filter(b => b.op === 'printQueue' || b.action === 'printQueue').length >= 2, 'a worker tick polls again while the tab is hidden');
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
    eq(fallback.workers.length === 0 && fallback.intervals.some(i => i.ms === 5000) && !fallback.intervals.some(i => i.ms === 15000), 'setInterval polls every 5 seconds only when the worker cannot start');
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
    holdClaim: true,
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
    eq(overlap.encodes.length === 1 && overlap.tasks.length === 0, 'the label is encoded while the claim is still in flight');
    overlap.release('claim');
    return drain();
  }).then(function () {
    eq(overlap.tasks.length === 1 && overlap.tasks[0] === 'B1', 'the claim then sends the bitmap that was already encoded');
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
        eq(n2 === n + 2, 'without a brief rev, the station reads the queue every 15 seconds');
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
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('print-sim passed');
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
