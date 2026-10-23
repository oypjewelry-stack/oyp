/* Scanned cards on Needs a look. Run: node sim/joinbox-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } }

const nav = require(path.join(root, 'nav.js'));
const J = require(path.join(root, 'joinbox.js'));
const app = read('app.js');
const index = read('staff/index.html');
const scanApp = read('scan/app.js');
const scanHtml = read('scan/index.html');

function keys(role) { return (nav.OFFICE_NAV[role] || []).map(n => n[0]).join(','); }
eq(keys('admin').includes('review,look,scanner'), 'Needs a look sits between To review and Scanner for admin');
eq(keys('production_manager').includes('review,look,scanner'), 'a production manager gets Needs a look in the same place');
eq(keys('accounting').indexOf('look') < 0 && keys('staff').indexOf('look') < 0, 'accounting and staff do not get the page');
eq(nav.NAV.admin.some(n => n[0] === 'look' && n[1] === 'Needs a look'), 'the shared scanner menu links to the same page');
const ada = { role: 'admin', username: 'ada', display_name: 'Ada' };
const menu = nav.menuHtml(ada, 'look', '');
const side = nav.sideHtml(ada, 'look', '');
eq(menu.includes('>Needs a look') && menu.includes('href="#/look"') && menu.includes('data-ncount="look"') && menu.includes('class="on"'), 'the phone menu names Needs a look and reserves a count');
eq(side.includes('Needs a look') && side.includes('data-ncount="look"'), 'the desktop menu reserves the same count');
eq(nav.menuHtml({ role: 'staff', username: 'ann', display_name: 'Ann' }, '', '').indexOf('Needs a look') < 0, 'staff menu stays without Needs a look');
eq(menu.indexOf('Needs a look') > menu.indexOf('To review') && menu.indexOf('Needs a look') < menu.indexOf('>Scanner<'), 'Needs a look is after To review');

eq(app.includes("page === 'look'") && app.includes('OYPJoInbox.render') && app.includes('OYPJoInbox.refreshBadge') && app.includes("page === 'look' ? 'NEEDS A LOOK'"), 'the back office routes Needs a look');
eq(app.includes('joInboxList: 1') && app.includes('joInboxPhoto: 1') && app.includes('joInboxStatus: 1'), 'list, photo, and status are reads');
eq(!/joInboxConfirm\s*:/.test(app) && !/joInboxFix\s*:/.test(app) && !/joInboxDiscard\s*:/.test(app) && !/joInboxPush\s*:/.test(app), 'confirm, fix, discard, and push stay writes so the page cache clears');
eq(index.includes('joinbox.js?v=1') && index.includes('joinbox.css?v=1') && index.includes('nav.js?v=63') && index.includes('app.js?v=37'), 'the new page and nav.js are cache-busted');
eq(read('staff/print-test.html').includes('nav.js?v=63') && scanHtml.includes('https://oypjewelry.com/nav.js?v=63'), 'print test and the scanner load the same nav.js');
eq(scanApp.includes("grp('Needs a look', bad)") && scanApp.includes('class="jocrop"') && scanApp.includes('function openJoView'), 'the scanner Needs a look rows, crop, and zoom viewer are unchanged');

eq(J.isMissing({ ok: false, error: 'Unknown action' }) && J.isMissing({ ok: false, error: 'Unknown action: joInboxList' }) && !J.isMissing({ ok: false, error: 'Not allowed', code: 'FORBIDDEN' }) && !J.isMissing({ ok: true }), 'an unknown action is the missing backend, and a refusal is not');
const top = J.cropRect(1000, 620, null);
eq(top.x === 0 && top.y === 0 && top.w === 1000 && Math.abs(top.h - 620 / 3) < 1e-9, 'no crop hint uses the top third of the card');
const box = J.cropRect(1000, 1000, [100, 200, 300, 400]);
eq(Math.abs(box.x - 140) < 1e-9 && Math.abs(box.y - 40) < 1e-9 && Math.abs(box.w - 320) < 1e-9 && Math.abs(box.h - 320) < 1e-9, 'a crop hint is padded by about 30 percent');
const clipped = J.cropRect(1000, 1000, [0, 0, 100, 100]);
eq(clipped.x === 0 && clipped.y === 0 && clipped.w > 100 && clipped.h > 100 && clipped.x + clipped.w <= 1000, 'padding that would leave the photo is clipped to the image');

eq(J.normJo('26–246') === '26-246' && J.normJo('26-36O') === '26-360' && J.normJo('26-287B') === '26-287B' && J.normJo('nope') === '', 'JO text is normalized the same way as a scan');
eq(J.actionFor('26-246', '26-246').act === 'confirm' && J.actionFor('26-363', '26-246').act === 'fix' && J.actionFor('26-363', '26-246').jo === '26-363', 'an untouched guess confirms, and an edit fixes');
eq(J.actionFor('', '26-246').act === '' && J.actionFor('26-363', '').act === 'fix', 'an empty box does not file, and a typed number with no guess is a fix');

const full = {
  card_id: 'ji-1', suggested_jo: '26-246', client_name: 'Ana Cruz', client_phone: '09171234567',
  fields: {
    jewelry_type: 'RING', metal: 'GOLD', metal_color: 'yellow', karat: '18K', weight_g: 7.11,
    stones: [{ type: 'Kyanite', shape: 'oval', count: 1, carat_total: 11.655 }],
    jo_date_written: '10-2-26', client_name: 'Ana Cruz', client_phone: '09171234567',
    tag_price: 85000, retail_price: 92000, actual_cost: 41000, sold_price: null
  }
};
const rows = J.fieldRows(full);
const labels = rows.map(r => r.label);
eq(labels.indexOf('Type') < labels.indexOf('Metal') && labels.indexOf('Metal') < labels.indexOf('Client') && labels.indexOf('Client') < labels.indexOf('Date') && labels.indexOf('Date') < labels.indexOf('Tag price'), 'auto fields follow type, metal, client, date, then prices');
eq(rows.find(r => r.label === 'Weight').value === '7.11 g' && rows.find(r => r.label === 'Stones').value.indexOf('Kyanite oval 11.655ct') >= 0 && rows.find(r => r.label === 'Tag price').value.indexOf('85,000') >= 0, 'weight, stones, and prices are readable');
eq(!rows.some(r => r.label === 'Sold'), 'a null price is not shown');
const hidden = JSON.parse(JSON.stringify(full));
delete hidden.client_phone;
delete hidden.fields.client_phone;
delete hidden.fields.tag_price;
delete hidden.fields.retail_price;
delete hidden.fields.sold_price;
const pm = J.fieldRows(hidden);
eq(pm.some(r => r.label === 'Type') && pm.some(r => r.label === 'Actual cost') && !pm.some(r => r.label === 'Phone') && !pm.some(r => r.label === 'Tag price' || r.label === 'Retail'), 'a response with prices and phone removed does not invent them');
eq(!J.fieldRows({ card_id: 'ji-2', fields: null, client_name: '' }).length, 'a card with nothing read has no auto rows');

const html = J.pageHtml({
  cards: [Object.assign({ status: 'check', decision: 'disagree', ocr: { read: '27-240', confidence: 'low' }, gemini: { read: '26-246', confidence: 'medium' }, flags: ['readers disagree'], jo_box: [58, 340, 219, 660], jo_box_side: 'a', pages: [{ side: 'a' }, { side: 'b', blank: true }] }, full)],
  counts: { check: 1, unpushed: 2 }, total: 1
});
eq(html.includes('Scanned cards') && html.includes('Drive OCR') && html.includes('27-240') && html.includes('Gemini') && html.includes('26-246') && html.includes('✓ Confirm') && html.includes('data-act="discard"') && html.includes('>auto<') && html.includes('Send to To review') && html.includes('2 filed cards'), 'a held card shows both reads, the guess, confirm, discard, auto fields, and unpushed cards');
eq(J.pageHtml({ missing: true }).includes('Scanner backend not set up yet'), 'a missing backend says so in plain language');
eq(J.pageHtml({ cards: [], counts: { check: 0, unpushed: 0 }, total: 0 }).includes('No cards waiting'), 'an empty queue has its own state');
eq(J.pageHtml({ error: 'No connection. Check the internet and try again.' }).includes('Try again') && J.pageHtml({ error: 'No connection. Check the internet and try again.' }).indexOf('Unknown action') < 0, 'a network error can be retried');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('ok');
