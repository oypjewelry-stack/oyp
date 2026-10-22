/* The JO read and the held page can finish in either order.
   Run: node sim/jo-read-sim.js
   Once the card names the JO, a page stored as needsjo is bound and uploads,
   a page not stored yet is stored already named, and a plain re-process is not put back on hold.
   The sticker key is the capture stamp, so a rename does not print it twice. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Q = require('../scan/queue.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok ', m); };
function queue() {
  let puts = 0;
  const raw = Q.memoryStore();
  const store = { all: () => raw.all(), put: async x => { puts++; return raw.put(x); }, del: id => raw.del(id), _map: raw._map };
  const seen = [];
  const q = Q.create({ store, online: () => false, send: async () => { throw new Error('should not upload'); },
    onChange: api => { seen.push({ needsjo: api.counts().needsjo, puts }); } });
  return { q, store, seen, puts: () => puts };
}
const nameFor = it => '26-287B-p' + it.page + '-102226.jpg';

(async () => {
  ok(Q.sameCapture('OCR@abc', '26-287B@abc') && !Q.sameCapture('OCR@abc', 'OCR@other'), 'one capture shares a stamp; a different stamp does not');

  { // read finishes before the page is enqueued
    const plan = Q.cardJoPlan({ jo: '26-287B', scan: 'OCR@abc', pages: [], rows: [], stickerFor: '' });
    ok(plan.known && plan.enqueueHeld === false && plan.bind === false && plan.clearReading && plan.sticker, 'read first: store the page under the JO, nothing to bind yet');
    ok(plan.newScan === '26-287B@abc' && plan.stickerKey === 'abc|26-287B', 'read first: the scan and the sticker keep the capture stamp');
    const r = queue();
    const row = await r.q.add({ jo: plan.jo, filename: '26-287B-p1-102226.jpg', scan: plan.newScan, page: 1, image: 'img', held: plan.enqueueHeld });
    ok(row.state === 'waiting' && r.q.counts().needsjo === 0, 'read first: the page is waiting to upload');
    const again = Q.cardJoPlan({ jo: '26-287B', scan: '26-287B@abc', pages: [{ jo: '26-287B', held: false }], rows: r.q.list(), stickerFor: plan.stickerKey });
    ok(again.sticker === false && again.stickerKey === plan.stickerKey && again.release === false, 'read first: renaming the scan does not print a second sticker');
    const heldOn = await r.q.add({ jo: '26-287B', filename: '26-287B-p1-102226.jpg', scan: '26-287B@abc', page: 1, image: 'img', held: true });
    ok(heldOn.state === 'waiting' && r.q.counts().needsjo === 0, 'a page already renamed to the card JO is waiting even if held was left on');
  }

  { // read finishes after the page was enqueued as needsjo
    const r = queue();
    await r.q.add({ jo: 'OCR', filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc', page: 1, image: 'img', held: true, clientId: 'c1' });
    await r.q.add({ jo: 'OCR', filename: 'OCR-p2-102226.jpg', scan: 'OCR@abc', page: 2, image: 'img2', held: true, clientId: 'c2' });
    ok(r.q.counts().needsjo === 2, 'read later: both pages sit as needs JO while the number is blank');
    const plan = Q.cardJoPlan({ jo: '26-287B', scan: 'OCR@abc', pages: [{ held: true, jo: 'OCR' }, { held: true, jo: 'OCR' }], rows: r.q.list(), stickerFor: '' });
    ok(plan.bind && plan.release && plan.clearReading && plan.held === false && plan.sticker, 'read later: bind every held page and clear the reading state');
    const putsAtBind = r.puts();
    const mark = r.seen.length;
    const bound = await r.q.bindJo('OCR@abc', '26-287B', plan.newScan, nameFor);
    const cleared = r.seen.slice(mark).filter(s => s.needsjo === 0);
    ok(bound && cleared.length > 0 && cleared[0].puts === putsAtBind, 'read later: needs JO drops before the rename is written to the phone');
    const rows = r.q.list();
    ok(rows.length === 2 && rows.every(x => x.state === 'waiting' && x.jo === '26-287B' && x.scan === '26-287B@abc') && r.q.counts().needsjo === 0, 'read later: both pages are waiting under the card JO');
    ok(rows.map(x => x.clientId).sort().join() === 'c1,c2', 'read later: the bound pages are the same photos');
    ok(![...r.store._map.keys()].some(k => String(k).indexOf('OCR') === 0), 'read later: the unread row is gone from the phone');
    ok(await r.q.bindJo('OCR@abc', '26-287B', plan.newScan, nameFor) === false, 'read later: binding again finds nothing still held');
  }

  { // the row was renamed to the new scan but left needsjo; bindJo from the old scan still finds it
    const r = queue();
    await r.q.add({ jo: 'OCR', filename: 'OCR-p1-102226.jpg', scan: '26-287B@abc', page: 1, image: 'img', held: true });
    await r.q.add({ jo: 'OCR', filename: 'OCR-p1-102226.jpg', scan: 'OCR@other', page: 1, image: 'other', held: true });
    const plan = Q.cardJoPlan({ jo: '26-287B', scan: 'OCR@abc', pages: [], rows: r.q.list(), stickerFor: '' });
    ok(plan.bind, 'a needsjo row already under the renamed scan is still this capture');
    await r.q.bindJo('OCR@abc', '26-287B', '26-287B@abc', nameFor);
    const mine = r.q.list().filter(x => x.scan === '26-287B@abc');
    const other = r.q.list().find(x => x.scan === 'OCR@other');
    ok(mine.length === 1 && mine[0].state === 'waiting' && mine[0].jo === '26-287B', 'stamp match binds the renamed row from the old scan id');
    ok(other && other.state === 'needsjo' && r.q.counts().needsjo === 1, 'a different capture stays needs JO');
  }

  { // plain page, re-processed once the detector loads
    const r = queue();
    await r.q.add({ jo: 'OCR', filename: 'OCR-p1-102226.jpg', scan: 'OCR@abc', page: 1, image: 'plain', held: true, plain: true, clientId: 'plain1' });
    const row = r.q.list()[0];
    ok(row.state === 'needsjo' && row.plain, 'a plain page with no JO is held');
    const unknown = Q.reprocessPlan(row, '');
    ok(unknown.held === true && unknown.bind === false && unknown.plain === false, 're-process with no JO keeps the page held');
    const known = Q.reprocessPlan(row, '26-287B');
    ok(known.held === false && known.bind === true && known.jo === '26-287B' && known.plain === false, 're-process after the card JO binds that page');
    await r.q.add(Object.assign({}, row, { image: 'enhanced', plain: false, held: known.held }));
    ok(r.q.list().length === 1 && r.q.list()[0].clientId === 'plain1' && r.q.counts().needsjo === 1, 're-process keeps the same photo until it is bound');
    await r.q.bindJo(row.scan, known.jo, '26-287B@abc', nameFor);
    const done = r.q.list()[0];
    ok(r.q.list().length === 1 && done.state === 'waiting' && done.plain === false && done.jo === '26-287B' && done.clientId === 'plain1' && r.q.counts().needsjo === 0, 're-processed plain page uploads as the card JO');
  }

  ok(!Q.cardJoPlan({ jo: 'OCR', scan: 'OCR@abc' }).known, 'OCR is not a JO number');

  const app = fs.readFileSync(path.join(__dirname, '../scan/app.js'), 'utf8');
  const zones = fs.readFileSync(path.join(__dirname, '../scan-zones.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../scan/index.html'), 'utf8');
  const heldFn = app.slice(app.indexOf('function fileHeld'), app.indexOf('function askForJo'));
  const early = app.slice(app.indexOf('function startEarlyRead'), app.indexOf('function enhanceCanvas'));
  const fileAs = zones.slice(zones.indexOf('function fileAs'), zones.indexOf('function addCorrectBtn'));
  ok(app.includes('function acceptCardJo') && early.includes('acceptCardJo(jo)'), 'the early read files the JO when it wins');
  ok(heldFn.indexOf('stickersSoon(jo)') < heldFn.indexOf('p.held = false') && heldFn.indexOf('stickersSoon(jo)') < heldFn.indexOf('queue.bindJo'), 'the sticker prints once, before the held page is cleared');
  ok(heldFn.includes('queue.bindJo(oldScan'), 'filing a held page binds the capture it was stored under');
  ok(app.includes('OYPQueue.reprocessPlan') && app.includes('if (plan.bind) fileHeld(plan.jo)') && app.includes('boundJo: plan.bind ? plan.jo : \'\''), 're-process of a plain page binds when the JO is known, and does not start another card read');
  ok(zones.includes('item.boundJo'), 'a re-processed page is stored without waiting on a second JO read');
  ok(app.includes("if ((p.held || p.jo === 'OCR') && realJO(state.jo)) fileHeld(realJO(state.jo))"), 'a page enqueued while the read is in flight is bound when that add finishes');
  ok(fileAs.indexOf('fileHeld(jo)') !== -1 && fileAs.indexOf('fileHeld(jo)') < fileAs.indexOf('say('), 'the zone read binds the held page before the toast');
  ok(/app\.js\?v=20261022n/.test(html) && /queue\.js\?v=20261022n/.test(html), 'app.js and queue.js cache-busts are v20261022n');
  ok(Q.realJo('26–363') === '26-363' && Q.realJo('26-36O') === '26-360' && Q.realJo('26 - 363') === '26-363' && Q.realJo('26-363b') === '26-363B', 'JO lookup treats a dash, a spaced hyphen, O, and a revision letter as the number');
  ok(Q.label({ state: 'saved', jo: '26-363', joTyped: true }, true) === 'Saved to 26-363 (JO typed in)', 'a typed save says where it went');
  ok(Q.label({ state: 'saved', jo: '26-363', verified: false }, true) === 'Saved to 26-363', 'a saved page does not say the JO was missing');
  let steps = Q.capSteps([], { id: 'scan', text: 'Scanning JO number…', state: 'run' });
  steps = Q.capSteps(steps, { id: 'scan', text: 'JO 26-363 read', state: 'ok' });
  steps = Q.capSteps(steps, { id: 'up', text: 'Uploading page 1…', state: 'run' });
  steps = Q.capSteps(steps, { id: 'up', text: 'Uploaded', state: 'ok' });
  steps = Q.capSteps(steps, { id: 'send', text: 'Stickers queued for 26-363', state: 'ok' });
  ok(steps.length === 3 && steps.map(s => s.text).join(' | ') === 'JO 26-363 read | Uploaded | Stickers queued for 26-363' && steps[0].state === 'ok', 'the capture line keeps the latest three steps and ticks the JO line done');
  const arm = app.slice(app.indexOf('function armScanStep'), app.indexOf("addEventListener('pointerdown', armScanStep)"));
  ok(arm.includes('Scanning JO number…') && arm.indexOf('await') < 0 && app.includes("pointerdown', armScanStep"), 'the first step is set on the shutter tap, before any wait');
  ok(app.includes('Stickers queued for ') && app.includes("kinds.push('jo_card')") && app.includes("kinds.push('jewelry_tag')") && !app.includes('if (later || filed || state.page > 1) return'), 'a known JO queues the B31 card and the B1 tag');
  console.log('jo-read tests passed:', n);
})().catch(e => { console.error(e); process.exit(1); });
