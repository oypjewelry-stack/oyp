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
eq(keys('admin').includes('consignment,scanner') && keys('admin').indexOf('look') < 0 && keys('admin').indexOf('review') < 0, 'Needs a look and To review are not their own pages');
eq(keys('production_manager').includes('consignment,scanner') && keys('production_manager').indexOf('look') < 0 && keys('production_manager').indexOf('review') < 0, 'a production manager has the same menu, without a Needs a look page');
eq(keys('accounting').indexOf('look') < 0 && keys('staff').indexOf('look') < 0, 'accounting and staff do not get the page');
eq(!nav.NAV.admin.some(n => n[0] === 'look'), 'the shared scanner menu has no Needs a look page');
const ada = { role: 'admin', username: 'ada', display_name: 'Ada' };
const menu = nav.menuHtml(ada, 'jos', '');
const side = nav.sideHtml(ada, 'jos', '');
eq(menu.indexOf('Needs a look') < 0 && menu.indexOf('href="#/look"') < 0 && menu.includes('data-ncount="review"') && menu.includes('href="#/jos"') && menu.includes('class="on"'), 'the phone menu count sits on Inventory');
eq(side.indexOf('Needs a look') < 0 && side.includes('data-ncount="review"'), 'the desktop menu count sits on Inventory');
eq(nav.menuHtml({ role: 'staff', username: 'ann', display_name: 'Ann' }, '', '').indexOf('Needs a look') < 0, 'staff menu stays without Needs a look');
eq(menu.indexOf('Consignment') < menu.indexOf('>Scanner<') && menu.indexOf('>To review<') < 0, 'Consignment stays before Scanner and To review is gone');

eq(app.includes("cur0 === 'look'") && !app.includes("page === 'look'") && app.includes('OYPJoInbox.refreshBadge') && !app.includes('OYPJoInbox.render'), 'old Needs a look links leave the menu and the badge still refreshes');
const ids = role => keys(role).split(',');
eq(ids('admin').indexOf('prices') < 0 && ids('production_manager').indexOf('prices') < 0 && ids('admin').indexOf('inventory') >= 0 && ids('production_manager').indexOf('inventory') >= 0, 'Material prices is a tab on Materials, not its own menu item');
eq(nav.menuHtml(ada, 'inventory', '').indexOf('Material prices') < 0 && nav.menuHtml(ada, 'inventory', '').includes('>Materials<'), 'the phone menu names Materials once');
eq(nav.MAT_PRICE_ROLES.admin && nav.MAT_PRICE_ROLES.production_manager && !nav.MAT_PRICE_ROLES.accounting && !nav.MAT_PRICE_ROLES.staff, 'only a role that had Material prices can open the Prices tab');
eq(keys('accounting') === 'dashboard,todo,appts,jos,payments,quotes,balances,clients' && keys('staff') === 'home,todo,appts,count,scanner', 'accounting and staff menus stay as they were');
eq(['count', 'appts', 'scanner', 'consignment', 'estimate', 'payments'].every(k => ids('admin').indexOf(k) >= 0), 'Inventory count, Appointments, Scanner, Consignment, Cost estimator, and Quotes / payments stay');
eq(app.includes("cur0 === 'prices'") && app.includes('oypMatView') && app.includes("history.replaceState(null, '', '#/inventory')") && !app.includes("page === 'prices'"), 'an old Material prices link opens Materials on the Prices tab');
eq(read('inv.js').includes('data-mtab="stock"') && read('inv.js').includes('data-mtab="prices"') && read('inv.js').includes('OYPPrices.render') && read('inv.js').includes('function renderMats'), 'Stock and Prices reuse the materials list and the prices page');
eq(!scanApp.includes("['prices', 'Material prices']"), 'the scanner fallback menu drops Material prices');
eq(app.includes('joInboxList: 1') && app.includes('joInboxPhoto: 1') && app.includes('joInboxStatus: 1'), 'list, photo, and status are reads');
eq(!/joInboxConfirm\s*:/.test(app) && !/joInboxFix\s*:/.test(app) && !/joInboxDiscard\s*:/.test(app) && !/joInboxPush\s*:/.test(app), 'confirm, fix, discard, and push stay writes so the page cache clears');
eq(index.includes('joinbox.js?v=3') && index.includes('joinbox.css?v=3') && index.includes('nav.js?v=66') && index.includes('app.js?v=41'), 'the new page and nav.js are cache-busted');
eq(read('staff/print-test.html').includes('nav.js?v=66') && scanHtml.includes('https://oypjewelry.com/nav.js?v=66'), 'print test and the scanner load the same nav.js');
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

// Check for scans (joInboxRun)
eq(J.runText({ ok: true, filed: 3, check: 1, blank: 2, problem: 0, more: false, waiting: false, fields: { left: 0 } }).text === 'Filed 3 pages, 1 needs a look, 2 blank backs', 'a run says what it filed, held, and sorted as blank backs');
eq(J.runText({ ok: true, filed: 1, check: 2, blank: 0 }).text === 'Filed 1 page, 2 need a look', 'singular and plural are right');
eq(J.runText({ ok: true, filed: 0, check: 0, blank: 0, problem: 0, more: false, fields: { left: 0 } }).text === 'No new scans', 'nothing to file says No new scans');
eq(J.runText({ ok: true, filed: 6, check: 0, blank: 4, more: true, fields: { left: 0 } }).text === 'Filed 6 pages, 4 blank backs. More cards waiting, click again.', 'cards still waiting say so');
eq(J.runText({ ok: true, filed: 0, check: 0, blank: 0, more: true }).text === 'More cards waiting, click again.', 'more with nothing filed yet still says click again');
eq(J.runText({ ok: true, filed: 2, check: 0, blank: 0, more: false, fields: { left: 16 } }).text === 'Filed 2 pages. Still reading the details of 16 cards.', 'cards still waiting for their details are mentioned');
eq(J.runText({ ok: true, waiting: true, message: 'The scanner is still sending pages. Try again in a few seconds.' }).text.includes('still sending'), 'the scanner still sending shows the server message');
eq(J.runText({ ok: true, problem: 2 }).text.includes('2 files could not be read'), 'files that are not JPEG are named');
eq(J.runError({ ok: false, code: 'BUSY', error: 'A check is already running, try again in a minute' }).text === 'A check is already running. Try again in a minute.', 'BUSY is plain');
eq(J.runError({ ok: false, code: 'FORBIDDEN', error: 'Not allowed' }).text.includes('admins and production managers'), 'FORBIDDEN is plain');
eq(J.runError({ ok: false, error: 'Unknown action' }).text === 'Needs the latest script paste' && J.runError({ ok: false, code: 'UNKNOWN_ACTION' }).text === 'Needs the latest script paste', 'an old deployment says Needs the latest script paste');
eq(J.runError({ ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }).text.includes('No connection') && J.runError(null).text === 'Could not check for scans', 'other errors show their message');
const page = J.pageHtml({ cards: [], counts: { check: 0 }, total: 0 });
eq(page.includes('id="jiRunBtn"') && page.includes('data-act="run"') && page.includes('>Check for scans<') && page.indexOf('jiRunBtn') < page.indexOf('Scanned cards the scanner'), 'the button sits in the page header, before the list');
eq(!J.pageHtml({ forbidden: true }).includes('jiRunBtn') && J.pageHtml({ missing: true }).includes('jiRunBtn'), 'no button for a role that is not allowed; a missing backend still lets the button explain it');
eq(index.includes('joinbox.js?v=3') && read('sim/joinbox-preview.html').includes('joinbox.js?v=3'), 'joinbox.js and joinbox.css are cache-busted');
eq(!/joInboxRun\s*:/.test(app), 'joInboxRun stays a write: the page cache clears after a run');
(async function () {
  const vm = require('vm');
  const session = {};
  const priceCalls = [];
  function hostEl() {
    return { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; } };
  }
  function mainEl() {
    const host = hostEl();
    const buttons = [];
    const main = {
      _html: '',
      querySelector(sel) { return sel === '#matBody' && this._html.indexOf('id="matBody"') >= 0 ? host : null; },
      querySelectorAll(sel) {
        if (sel !== '[data-mtab]') return [];
        buttons.length = 0;
        const re = /data-mtab="(stock|prices)"/g; let m;
        while ((m = re.exec(this._html))) buttons.push({ dataset: { mtab: m[1] }, onclick: null });
        return buttons.slice();
      }
    };
    Object.defineProperty(main, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); } });
    return { main, host, buttons };
  }
  const ctx = {
    window: {}, document: { addEventListener() {} }, addEventListener() {},
    sessionStorage: { getItem: k => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); }, removeItem: k => { delete session[k]; } },
    location: { hash: '#/inventory' }, innerWidth: 1200,
    OYPNav: nav,
    OYP: { here: () => () => true, esc: s => String(s == null ? '' : s), call: async a => { priceCalls.push(a); return { ok: false, error: 'stopped' }; }, toast() {} },
    OYPPrices: { render(el) { priceCalls.push('render:' + (el && el === ctx._host ? 'host' : 'other')); el.innerHTML = '<div class="prices"><h2>Material prices</h2></div>'; return Promise.resolve(); } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('inv.js'), ctx);
  session.oypMatView = 'prices';
  const both = mainEl(); ctx._host = both.host;
  await ctx.OYPInv.renderMats(both.main, { role: 'admin' });
  eq(both.main.innerHTML.includes('>Stock<') && both.main.innerHTML.includes('>Prices<') && both.main.innerHTML.includes('class="fchip tap on" data-mtab="prices"') && both.host.innerHTML.includes('Material prices') && priceCalls.indexOf('matList') < 0, 'an old prices hand-off shows the Prices tab and the prices page');
  const stockBtn = both.buttons.find(b => b.dataset.mtab === 'stock');
  ctx.location.hash = '#/prices/log';
  stockBtn.onclick();
  eq(ctx.location.hash === '#/inventory', 'Stock leaves a prices subpage for Materials');
  priceCalls.length = 0;
  const only = mainEl();
  await ctx.OYPInv.renderMats(only.main, { role: 'accounting' });
  eq(only.main.innerHTML.indexOf('data-mtab') < 0 && priceCalls[0] === 'matList' && only.main.innerHTML.includes('<h2>Materials</h2>'), 'a role that never had Material prices sees only the stock page');
  const calls = [];
  let answer = { ok: true, filed: 3, check: 1, blank: 2, problem: 0, more: false, waiting: false, fields: { left: 0 } }, gate = null;
  globalThis.OYP = { call: async function (a, d) {
    calls.push(a);
    if (a === 'joInboxRun') { if (gate) await gate; return answer; }
    if (a === 'joInboxList') return { ok: true, cards: [], counts: { check: 1 }, total: 0 };
    if (a === 'joInboxStatus') return { ok: true, counts: { check: 1 } };
    return { ok: false };
  }, user: function () { return { role: 'admin' }; }, esc: function (x) { return String(x); }, toast: function () {} };
  let open; gate = new Promise(function (ok) { open = ok; });
  const first = J.runScans(), second = J.runScans();
  open(); await first; await second;
  eq(calls.filter(a => a === 'joInboxRun').length === 1, 'a second click while a check runs does not send a second request');
  eq(calls.join() === 'joInboxRun,joInboxList,joInboxStatus', 'after a run the list and the badge are refreshed: ' + calls.join());
  calls.length = 0; gate = null; answer = { ok: false, code: 'BUSY', error: 'busy' };
  await J.runScans();
  eq(calls.join() === 'joInboxRun', 'BUSY does not reload the list');
  calls.length = 0; answer = { ok: true, waiting: true, message: 'The scanner is still sending pages.', filed: 0 };
  await J.runScans();
  eq(calls.join() === 'joInboxRun', 'scanner still sending: nothing to reload');
  calls.length = 0; answer = { ok: true, filed: 0, check: 0, blank: 0, problem: 0, more: false, fields: { left: 0 } };
  await J.runScans();
  eq(calls.join() === 'joInboxRun,joInboxList,joInboxStatus', 'a run is allowed again once the last one is done');
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('ok');
})();
