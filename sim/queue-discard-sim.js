/* Remove a waiting page, and an unread (needsjo) page, from the scanner queue.
   Run: node sim/queue-discard-sim.js
   Page 1 of an unread scan is the only row with the JO box, so discarding it also removes the other unread pages of that scan. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Q = require('../scan/queue.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok ', m); };
const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 20; i++) await tick(); }
function rig() {
  const store = Q.memoryStore(), changes = [];
  const q = Q.create({ store, online: () => false, send: async () => { throw new Error('should not upload'); },
    onChange: () => changes.push(q.counts()) });
  return { store, q, changes };
}
const page = (jo, p, extra) => Object.assign({ jo, page: p, filename: jo + '-p' + p + '.jpg', image: 'data:image/jpeg;base64,AAAA', thumb: 't', scan: (extra && extra.scan) || (jo + '@s') }, extra);

(async () => {
  { // waiting: gone from the phone, nothing sent to Drive
    const r = rig();
    await r.q.add(page('26-287', 2));
    await r.q.add(page('26-100', 1, { scan: '26-100@other' }));
    await settle();
    const id = r.q.list().find(x => x.jo === '26-287').id;
    const before = r.changes.length;
    const x = await r.q.discard(id);
    ok(x.phase === 'removed' && x.also === 0, 'waiting page: removed, and no other page goes with it');
    ok(!r.q.get(id) && r.q.counts().waiting === 1 && r.q.counts().total === 1, 'waiting page: gone from the list; the other JO stays');
    ok(r.store._map.size === 1, 'waiting page: gone from the phone store');
    ok(r.changes.length > before && r.changes[r.changes.length - 1].pending === 1, 'waiting page: the count changes as soon as it is removed');
    ok(Q.removePrompt(r.q.list()[0], 0) === 'Remove page 1 of JO 26-100? It hasn\'t uploaded, so the photo will be gone from this phone.', 'waiting confirm says the photo leaves this phone');
    ok(Q.removePrompt({ state: 'waiting', jo: '26-287', page: 2 }, 0) === 'Remove page 2 of JO 26-287? It hasn\'t uploaded, so the photo will be gone from this phone.', 'confirm for a page that has not uploaded');
  }
  { // needsjo page 1 takes the rest of that unread scan; a later page removed alone leaves the JO box
    const r = rig();
    await r.q.add(page('OCR', 1, { held: true, scan: 'OCR@s1', filename: 'OCR-p1.jpg' }));
    await r.q.add(page('OCR', 2, { held: true, scan: 'OCR@s1', filename: 'OCR-p2.jpg' }));
    await r.q.add(page('OCR', 3, { held: true, scan: 'OCR@s1', filename: 'OCR-p3.jpg' }));
    await r.q.add(page('OCR', 1, { held: true, scan: 'OCR@other', filename: 'OCR-p1b.jpg' }));
    await r.q.add(page('26-287', 2, { scan: '26-287@w' }));
    await settle();
    ok(r.q.counts().needsjo === 4 && r.q.counts().waiting === 1, 'unread pages stay on the phone and do not upload');
    const later = r.q.list().find(x => x.scan === 'OCR@s1' && x.page === 2);
    const one = await r.q.discard(later.id);
    ok(one.phase === 'removed' && one.also === 0 && r.q.list().some(x => x.scan === 'OCR@s1' && x.page === 1) && r.q.list().some(x => x.scan === 'OCR@s1' && x.page === 3), 'removing a later unread page leaves page 1 and its JO box');
    const front = r.q.list().find(x => x.scan === 'OCR@s1' && x.page === 1);
    ok(Q.extraNeedsjo(front, r.q.list()).length === 1, 'one unread page is still waiting on page 1');
    ok(Q.removePrompt(front, 1) === 'Remove page 1 of JO not read? It hasn\'t uploaded, so the photo will be gone from this phone, and its other page.', 'confirm for one other unread page');
    const x = await r.q.discard(front.id);
    ok(x.phase === 'removed' && x.also === 1, 'removing unread page 1 also removes the page that was waiting on it');
    ok(!r.q.list().some(x => x.scan === 'OCR@s1'), 'that unread scan is gone');
    ok(r.q.list().some(x => x.scan === 'OCR@other') && r.q.counts().needsjo === 1 && r.q.counts().waiting === 1, 'a different unread scan, and a waiting page, stay');
    ok(r.q.counts().total === 2 && r.store._map.size === 2, 'only those two rows are still stored on the phone');
  }
  { // three unread pages: the confirm names both of the others
    const r = rig();
    await r.q.add(page('OCR', 1, { held: true, scan: 'OCR@g', filename: 'OCR-p1.jpg' }));
    await r.q.add(page('OCR', 2, { held: true, scan: 'OCR@g', filename: 'OCR-p2.jpg' }));
    await r.q.add(page('OCR', 3, { held: true, scan: 'OCR@g', filename: 'OCR-p3.jpg' }));
    await settle();
    const front = r.q.list().find(x => x.page === 1);
    const n = Q.extraNeedsjo(front, r.q.list()).length;
    ok(n === 2 && Q.removePrompt(front, n) === 'Remove page 1 of JO not read? It hasn\'t uploaded, so the photo will be gone from this phone, and its 2 other pages.', 'confirm says the other two pages go too');
    const before = r.q.counts();
    const x = await r.q.discard(front.id);
    ok(x.also === 2 && r.q.counts().needsjo === 0 && r.q.counts().total === 0 && before.needsjo === 3, 'needsjo removal: all three leave, and the count drops to none');
  }
  ok(Q.removePrompt({ state: 'saved', jo: '26-287', page: 2 }, 0) === 'Remove page 2 of JO 26-287? Its copy in Drive goes to the trash.', 'saved confirm says the Drive copy goes to the trash');
  ok(Q.removePrompt({ state: 'uploading', jo: '26-287', page: 2 }, 0) === 'Remove page 2 of JO 26-287? It is uploading. If a copy lands in Drive, that copy goes to the trash.', 'uploading confirm says a copy that lands is trashed');
  ok(Q.removePrompt({ state: 'failed', jo: '26-287', page: 4 }, 0).indexOf('hasn\'t uploaded') > 0, 'a failed page was not uploaded');

  const app = fs.readFileSync(path.join(__dirname, '../scan/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../scan/style.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../scan/index.html'), 'utf8');
  ok(/const sw = \(withJO \|\| \(it\.state !== 'failed' && !needs\)\)/.test(app), 'every Pending uploads row can swipe; the page strip still skips failed and unread rows');
  ok(/const rm = withJO \? '' :/.test(app) && /data-retry=/.test(app), 'failed rows keep Retry; the page strip still has its own Remove');
  ok(/class="qx" data-discard=/.test(app) && /aria-label="Remove"/.test(app) && /commitDiscard\(it\)/.test(app), 'the desktop × uses the same confirm and discard as a swipe');
  ok(/bindRowSwipe\(\$\('qList'\)\)/.test(app) && /bindRowSwipe\(\$\('pages'\)\)/.test(app), 'Pending uploads uses the same swipe as the page strip');
  ok(/classList\.contains\('editing'\)/.test(app) && /#qList \.jofix input/.test(app), 'swipe stays off while the JO box is being edited');
  ok(/button, input, textarea/.test(app), 'a tap on the JO box or Save does not start a swipe');
  ok(/#qList li\[data-sw\]/.test(css) && /touch-action:manipulation/.test(css), 'Pending uploads rows use the same swipe styling, and the JO box keeps its own touch');
  ok(/@media \(hover:hover\) and \(pointer:fine\)/.test(css) && /#qList \.qx\{display:none\}/.test(css) && /width:34px;height:34px/.test(css), 'the × is a 34px corner target, and only on a fine pointer');
  ok(/app\.js\?v=20261025d/.test(html) && /queue\.js\?v=20261022n/.test(html) && /style\.css\?v=20261022m/.test(html), 'cache-busts are above the main versions');
  ok(/nav\.js\?v=69/.test(html) && /detector\.js\?v=20261022k/.test(html), 'nav.js is v69 and the detector matches the measured card');
  ok(/#capView \.jobar\{display:grid/.test(css) && /#capView \.jobar strong\{grid-column:2/.test(css) && /#capView #capCount\{grid-column:3/.test(css) && /margin:0 0 8px/.test(css) && !/#capView #capCount\{position:absolute/.test(css), 'the page count sits on the header row, with the sticker row below it');
  console.log('queue-discard tests passed:', n);
})().catch(e => { console.error(e); process.exit(1); });
