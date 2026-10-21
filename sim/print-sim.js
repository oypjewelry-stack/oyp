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

const card = { kind: 'jo_card', jo: '26-287', due: '2026-10-21' };
const tag = { kind: 'jewelry_tag', jo: '26-287', karat: '18k', metal: 'gold', stone: 'diamond', size: '6', weight: '4.2' };
[['B31', 600, 180], ['B1', 384, 72]].forEach(([model, head, ox]) => {
  const a = L.render(Object.assign({ model, client: 'Elena Tan' }, card));
  const b = L.render(Object.assign({ model }, card));
  const c = L.render(Object.assign({ model, client: 'Maria Santos' }, card));
  eq(a.width === head && a.height === 160 && a.offsetX === ox && a.labelW === 240 && a.labelH === 160 && a.tail === 0, model + ' JO card is ' + head + '×160, label 240×160, offset ' + ox);
  eq(same(a.data, b.data) && same(a.data, c.data), model + ' JO card pixels ignore the client name');
  eq(noName(a) && a.lines[0] === '26-287' && a.lines.indexOf('DUE 21 OCT') >= 0, model + ' JO card text is the JO and the due date');
  eq(decode(a) === '26-287', model + ' JO card QR is 26-287');
  const t = L.render(Object.assign({ model, client: 'Elena Tan' }, tag));
  const t2 = L.render(Object.assign({ model }, tag));
  eq(t.width === head && t.height === 560 && t.offsetX === ox && t.labelW === 240 && t.labelH === 200 && t.tail === 360, model + ' jewelry tag is ' + head + '×560, head 240×200, tail 360');
  eq(same(t.data, t2.data), model + ' jewelry tag pixels ignore the client name');
  eq(noName(t) && t.lines[0] === '26-287' && t.specPx === 22 && t.lines.indexOf('18K GOLD') >= 0 && t.lines.indexOf('DIAMOND') >= 0 && t.lines.indexOf('SIZE 6 4.2 G') >= 0, model + ' jewelry tag is the JO plus specs at 22 px');
  eq(tailWhite(t), model + ' jewelry tag tail is blank');
  eq(decode(t) === '26-287', model + ' jewelry tag QR is 26-287');
});

const long = L.render({ kind: 'jewelry_tag', model: 'B1', jo: '26-287', metal: 'yellow gold', karat: '18k', client: 'Elena Tan' });
eq(long.specPx >= 16 && long.specPx < 22 && noName(long) && long.lines.some(s => s.indexOf('18K') === 0), 'a long spec shrinks but stays at least 16 px, still with no name');
const cal = L.render({ kind: 'cal_tag', model: 'B31' });
eq(cal.width === 600 && cal.height === 560 && cal.lines.length === 0 && cal.qr === '', 'calibration has no JO text and no name');

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

const ctx = { console, Math, Date, String, Object, Array, Number, JSON, LockService: {}, SpreadsheetApp: {} };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(read('paste/PrintQueue.gs'), ctx);
const rows = [];
const a1 = ctx.printRowsEnqueue_(rows, '26-287', 'jo_card', 'scanner', '2026-10-21T00:00:00.000Z', false);
const a2 = ctx.printRowsEnqueue_(rows, '26 287', 'jo_card', 'scanner', '2026-10-21T00:01:00.000Z', false);
eq(a1.created && !a2.created && rows.length === 1 && a2.item.print_id === a1.item.print_id, 'a second enqueue of the same JO card does not add a row');
ctx.printRowsMark_(rows, a1.item.print_id, 'printed', 'd-a', 'ada', '2026-10-21T00:02:00.000Z');
const a3 = ctx.printRowsEnqueue_(rows, '26-287', 'jo_card', 'scanner', '2026-10-21T00:03:00.000Z', false);
eq(!a3.created && a3.skipped && rows.length === 1 && rows.filter(r => r.status === 'queued').length === 0, 'enqueue after a printed row does not queue another');
const a4 = ctx.printRowsEnqueue_(rows, '26-287', 'jo_card', 'ada', '2026-10-21T00:04:00.000Z', true);
eq(a4.created && rows.filter(r => r.status === 'queued').length === 1 && rows.length === 2, 'reprint after a printed row queues one new row');
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
const r1 = L.render(Object.assign({ model: 'B1', kind: 'jewelry_tag' }, { jo: d1.jo, karat: d1.karat, metal: d1.metal, weight: d1.weight_g, stone: d1.stone_type, stone_size: d1.stone_size, size: d1.size }));
const r2 = L.render({ model: 'B1', kind: 'jewelry_tag', jo: d1.jo, karat: d1.karat, metal: d1.metal, weight: d1.weight_g, stone: d1.stone_type, stone_size: d1.stone_size, size: d1.size, client: d1.client });
eq(same(r1.data, r2.data) && noName(r2), 'a decorated row prints the same pixels with or without the name');
const card2 = L.render({ model: 'B31', kind: 'jo_card', jo: '26-287', due: d1.due_date });
eq(card2.lines.indexOf('DUE 27 OCT') >= 0, 'a JO card due line reads DUE 27 OCT');
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
eq(read('print.js').indexOf('printEnd ? Promise.resolve(task.printEnd())') >= 0, 'printEnd runs after every print task');

const app = read('app.js'), index = read('staff/index.html'), fast = read('paste/Fast.gs.print.patch.txt'), dash = read('paste/DashCache.gs.print.patch.txt');
const cached = app.slice(app.indexOf('const CACHED'), app.indexOf('const READS'));
eq(/printQueue:\s*1/.test(app) && !/printQueue/.test(cached), 'printQueue is a client read and is not cached');
eq(!/printMark\s*:\s*1/.test(app) && !/printEnqueue\s*:\s*1/.test(app) && !/printReprint\s*:\s*1/.test(app), 'print writes are not client reads');
eq(fast.includes('priceJobCost: 1, printQueue: 1') && !fast.includes('dashboard: 1, printQueue'), 'Fast READS gains printQueue and FAST.CACHE does not');
eq(dash.includes('listUsers: 1, printQueue: 1') && !dash.includes("action !== 'printQueue'"), 'DashCache READS gains printQueue and the dashboard spec does not');
eq(index.includes('print.js?v=1') && index.includes('print-label.js?v=1') && index.includes('nav.js?v=13') && index.includes('app.js?v=29') && index.includes('settings.js?v=18') && index.includes('print.css?v=1'), 'print assets are cache-busted');
eq(read('print.js').includes('labelOpts') && !/client:\s*item\.client/.test(read('print.js')), 'the printer payload builder does not copy the client name');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('print-sim passed');
