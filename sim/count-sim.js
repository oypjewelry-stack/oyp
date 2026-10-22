/* Inventory count: 200 wedge reads against a mocked countLoad, and the sheet writes.
   Run: node sim/count-sim.js
   Reads are matched on the phone. Finish is the first write of last_counted / count_status.
   Linking 26-287B does not touch 26-287 or 26-287A. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}

const Count = require(path.join(root, 'count.js'));

function epcOf(n) { return 'E2801160' + n.toString(16).padStart(16, '0'); }
function spaced(hex) { return hex.replace(/(.{2})/g, '$1 ').trim(); }
function coloned(hex) { return hex.replace(/(.{4})/g, '$1:').replace(/:$/, ''); }

const items = [];
for (let i = 1; i <= 50; i++) {
  const letter = i % 5 === 0 ? 'B' : (i % 5 === 1 ? 'A' : '');
  items.push({
    id: 'IT' + i,
    item_id: 'IT' + i,
    jo: '26-' + String(400 + i) + letter,
    description: 'Piece ' + i,
    client: i % 2 ? 'Elena Tan' : 'Ana Cruz',
    location: 'vault',
    epc: i <= 35 ? epcOf(i) : '',
    photo: i % 4 === 0 ? 'https://oypjewelry.com/assets/stickers/lola.webp' : ''
  });
}
const reads = [];
for (let i = 1; i <= 35; i++) {
  const e = epcOf(i);
  reads.push(e.toLowerCase());
  reads.push(spaced(e));
  reads.push(coloned(e));
}
for (let i = 1; i <= 25; i++) {
  const e = epcOf(1000 + i);
  reads.push(e);
  reads.push(spaced(e).toLowerCase());
}
for (let i = 1; i <= 20; i++) reads.push(epcOf(2000 + i));
for (let i = 0; i < 25; i++) reads.push(coloned(epcOf(1001)));
eq(reads.length === 200, 'the harness feeds 200 wedge reads');
eq(reads.some((r, i) => r.replace(/[\s:]/g, '').toUpperCase() === epcOf(1) && reads.filter(x => x.replace(/[\s:\-]/g, '').toUpperCase() === epcOf(1)).length > 1), 'the 200 include duplicate reads of a known EPC');
eq(reads.some(r => r.replace(/[\s:\-]/g, '').toUpperCase() === epcOf(1001).toUpperCase()), 'the 200 include unknown EPCs');

const session = Count.openSession(items);
let dupSlip = 0, newSlip = 0, accepted = 0;
reads.forEach(raw => {
  const before = Count.counts(session);
  const res = Count.applyRead(session, raw);
  const after = Count.counts(session);
  if (!res.accepted) {
    if (after.found !== before.found || after.missing !== before.missing || after.unknown !== before.unknown || after.read !== before.read) dupSlip++;
  } else {
    accepted++;
    if (after.read !== before.read + 1) newSlip++;
  }
});
eq(dupSlip === 0, 'a duplicate read does not change found, missing, or unknown');
eq(newSlip === 0 && accepted === 80, 'each new EPC increments the live counter at once (' + accepted + ' new)');
const tallied = Count.counts(session);
eq(tallied.found === 35 && tallied.unknown === 45 && tallied.missing === 15 && tallied.read === 80, 'found 35, unknown 45, missing 15 after 200 reads (' + JSON.stringify(tallied) + ')');
const again = Count.counts(session);
Count.applyRead(session, spaced(epcOf(3)));
Count.applyRead(session, '');
Count.applyRead(session, '26-287B');
Count.applyRead(session, 'not-a-tag');
eq(JSON.stringify(Count.counts(session)) === JSON.stringify(again), 'another duplicate, a blank enter, and a JO do not move the counts');
const foundB = Count.buckets(session).found.filter(x => /B$/.test(x.item.jo));
eq(foundB.length > 0 && foundB.every(x => x.item.jo === Count.normJo(x.item.jo)) && foundB.some(x => x.item.photo), 'a found JO keeps its letter, and a photo stays on the item');
eq(!Count.applyRead.toString().includes('call(') && !Count.applyRead.toString().includes('countFinish') && !Count.applyRead.toString().includes('await'), 'dedupe is client-side and does not call Finish');

const linkItems = [
  { id: 'base', item_id: 'base', jo: '26-287', description: 'Old version', client: 'Elena Tan', epc: '', photo: '' },
  { id: 'a', item_id: 'a', jo: '26-287A', description: 'Version A', client: 'Ana Cruz', epc: '', photo: '' },
  { id: 'b', item_id: 'b', jo: '26-287B', description: 'Sapphire ring', client: 'Elena Tan', epc: '', photo: 'https://oypjewelry.com/assets/stickers/lola.webp' }
];
eq(Count.searchItems(linkItems, '26-287B').map(it => it.jo).join() === '26-287B', 'search by the full JO 26-287B returns that letter only');
eq(Count.searchItems(linkItems, '26-287').map(it => it.jo).sort().join() === '26-287,26-287A,26-287B', 'a search without a letter lists each version with its letter');
const linked = Count.openSession(linkItems);
const fresh = epcOf(9);
eq(Count.applyRead(linked, fresh).accepted && Count.counts(linked).unknown === 1 && Count.counts(linked).missing === 3, 'an unlinked tag is unknown until it is linked');
eq(Count.linkLocal(linked, 'b', fresh) && Count.counts(linked).found === 1 && Count.counts(linked).unknown === 0 && Count.counts(linked).missing === 2, 'linking the scanned EPC moves it from unknown to found');
eq(Count.buckets(linked).found[0].item.jo === '26-287B', 'the found row is 26-287B');
eq(Count.linkedText('26-287B') === 'Linked to 26-287B', 'the confirmation reads Linked to 26-287B');
eq(Count.linkConfirm('26-287B') === 'Link this tag to 26-287B?', 'linking asks before it saves');
const noSave = Count.decideFinish(1, 2, () => false);
eq(noSave === null, 'canceling the save writes nothing');
let asked = [];
const keep = Count.decideFinish(1, 2, msg => { asked.push(msg); return asked.length === 1; });
eq(keep && keep.save && keep.mark_missing === false && asked.length === 2 && /missing/.test(asked[1]), 'canceling the missing question still saves found, and does not mark missing');
asked = [];
const both = Count.decideFinish(1, 0, msg => { asked.push(msg); return true; });
eq(both && both.mark_missing === false && asked.length === 1, 'with nothing missing, Finish does not ask to mark items missing');
const payload = Count.finishPayload(linked, false);
eq(payload.mark_missing === false && payload.missing.length === 0 && payload.found.length === 1 && payload.found[0].jo === '26-287B', 'the finish body omits missing rows until that confirm is accepted');
eq(Count.finishPayload(linked, true).missing.length === 2, 'after the missing confirm, those rows are in the finish body');

['E28011600000000000000001', 'e2 80 11 60 00 00 00 00 00 00 00 01', 'E280:1160:0000:0000:0000:0001'].forEach(v => {
  eq(Count.normEpc(v) === 'E28011600000000000000001', 'EPC ' + JSON.stringify(v) + ' normalizes to the same hex');
});
eq(Count.normEpc('26-287B') === '' && Count.normJo('26-287b') === '26-287B' && Count.normJo('26287B') === '26-287B', 'a JO is not an EPC, and the letter stays on the JO');

function makeSheet(matrix) {
  const data = matrix.map(row => row.slice());
  function ensure(r, c) {
    while (data.length < r) data.push([]);
    while (data[r - 1].length < c) data[r - 1].push('');
  }
  return {
    getLastRow() {
      let last = 0;
      for (let r = 0; r < data.length; r++) if (data[r].some(v => v !== '' && v != null)) last = r + 1;
      return last;
    },
    getLastColumn() {
      let last = 0;
      data.forEach(row => { for (let c = 0; c < row.length; c++) if (row[c] !== '' && row[c] != null) last = Math.max(last, c + 1); });
      return last;
    },
    getRange(r, c, numRows, numCols) {
      if (numRows == null) numRows = 1;
      if (numCols == null) numCols = 1;
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < numRows; i++) {
            const line = [];
            for (let j = 0; j < numCols; j++) {
              const row = data[r - 1 + i] || [];
              line.push(row[c - 1 + j] == null ? '' : row[c - 1 + j]);
            }
            out.push(line);
          }
          return out;
        },
        setValue(v) { ensure(r, c); data[r - 1][c - 1] = v; }
      };
    },
    _data: data
  };
}
function snap(sheet) { return JSON.parse(JSON.stringify(sheet._data)); }
function col(sheet, name) {
  const head = sheet._data[0].map(h => String(h).trim().toLowerCase());
  const i = head.indexOf(name.toLowerCase());
  if (i < 0) throw new Error('missing column ' + name);
  return i;
}
function cell(sheet, rowIndex, name) {
  const i = col(sheet, name);
  const row = sheet._data[rowIndex] || [];
  return row[i] == null ? '' : row[i];
}

const headers = ['item_id', 'jo', 'description', 'client', 'location', 'status', 'photo', 'on_hand'];
const records = [
  ['IT-B', '26-287B', 'Sapphire ring', 'Elena Tan', 'vault', 'in_stock', 'https://example.com/ring.jpg', ''],
  ['IT-A', '26-287A', 'Band', 'Ana Cruz', 'shop', 'in_stock', '', ''],
  ['IT-BASE', '26-287', 'Old version', 'Elena Tan', 'vault', 'in_stock', '', ''],
  ['IT-SOLD', '26-100', 'Sold ring', 'Otto Vila', 'sold', 'sold', '', ''],
  ['IT-CON', '26-280', 'Out', 'Elena Tan', 'consigned', 'consigned', '', ''],
  ['IT-WORK', '26-301', 'In making', 'Pia Gomez', 'working', 'in_stock', '', ''],
  ['IT-FORCE', '26-302B', 'Forced', 'Ken Uy', 'working', 'in_stock', '', 'yes'],
  ['IT-OUT', '26-303', 'Not here', 'Bea Lim', 'vault', 'in_stock', '', 'no'],
  ['', '', 'blank', '', '', '', '', ''],
  ['IT-EPC', '26-304A', 'Already waiting', 'Elena Tan', 'vault', 'in_stock', '', '']
];
const sheet = makeSheet([headers.slice()].concat(records.map(r => r.slice())));
const before = snap(sheet);
const audits = [];
const gs = vm.createContext({
  ss_: () => ({ getSheetByName: name => name === 'Items' ? sheet : null }),
  withLock_: fn => fn(),
  now_: () => '2026-10-22T08:00:00.000Z',
  audit_: function () { audits.push([].slice.call(arguments)); }
});
vm.runInContext(read('paste/InventoryCount.gs'), gs, { filename: 'paste/InventoryCount.gs' });
['E28011600000000000000001', 'e2 80 11 60 00 00 00 00 00 00 00 01', 'E280:1160:0000:0000:0000:0001'].forEach(v => {
  eq(gs.countEpc_(v) === 'E28011600000000000000001', 'sheet EPC ' + JSON.stringify(v) + ' matches the phone');
});
eq(gs.countJo_('26-287B') === '26-287B' && gs.countJo_('26-287') === '26-287' && gs.countJo_('26-287B') !== gs.countJo_('26-287'), 'the sheet keeps the JO letter');

const user = { username: 'thea', role: 'staff' };
const loaded = gs.handleCount_({ action: 'countLoad' }, user);
eq(loaded.ok && loaded.items.length === 5, 'countLoad returns the five on-hand rows (' + (loaded.items && loaded.items.length) + ')');
const byId = {};
loaded.items.forEach(it => { byId[it.id] = it; });
eq(byId['IT-B'] && byId['IT-B'].jo === '26-287B' && byId['IT-B'].client === 'Elena Tan' && byId['IT-B'].photo === 'https://example.com/ring.jpg' && byId['IT-B'].epc === '', '26-287B comes back with its letter, client, and photo');
eq(byId['IT-FORCE'] && byId['IT-FORCE'].jo === '26-302B' && !byId['IT-SOLD'] && !byId['IT-WORK'] && !byId['IT-OUT'] && !byId['IT-CON'], 'on-hand follows location, status, and an explicit on_hand cell');
eq(sheet._data[0].filter(h => String(h).toLowerCase() === 'epc').length === 1, 'the EPC header is added once');
eq(sheet._data[0].indexOf('EPC') >= 0 && sheet._data[0].indexOf('last_counted') >= 0 && sheet._data[0].indexOf('count_status') >= 0, 'EPC, last_counted, and count_status headers are added');
let overwritten = 0;
records.forEach((row, i) => {
  row.forEach((v, c) => { if (sheet._data[i + 1][c] !== before[i + 1][c]) overwritten++; });
});
eq(overwritten === 0, 'adding headers does not overwrite any data cell');
eq(records.every((row, i) => cell(sheet, i + 1, 'last_counted') === '' && cell(sheet, i + 1, 'count_status') === '' && cell(sheet, i + 1, 'epc') === ''), 'countLoad does not write last_counted, status, or EPC data');
const mid = snap(sheet);
const againLoad = gs.handleCount_({ action: 'countLoad' }, user);
eq(againLoad.ok && sheet._data[0].filter(h => String(h).toLowerCase() === 'epc').length === 1 && JSON.stringify(sheet._data) === JSON.stringify(mid), 'a second load does not add another EPC header or touch data');

const link = gs.handleCount_({ action: 'linkEpc', jo: '26-287B', id: 'IT-B', epc: 'e280 1160 0000 0000 0000 b001' }, user);
eq(link.ok && link.message === 'Linked to 26-287B' && link.jo === '26-287B', 'linkEpc confirms Linked to 26-287B');
eq(cell(sheet, 1, 'epc') === 'E2801160000000000000B001', 'the EPC is stored as hex on 26-287B');
eq(cell(sheet, 2, 'epc') === '' && cell(sheet, 3, 'epc') === '', '26-287A and 26-287 are not given that tag');
eq(cell(sheet, 1, 'description') === 'Sapphire ring' && cell(sheet, 1, 'status') === 'in_stock' && cell(sheet, 1, 'client') === 'Elena Tan' && cell(sheet, 1, 'photo') === 'https://example.com/ring.jpg' && cell(sheet, 1, 'last_counted') === '', 'linking writes the EPC cell and leaves the rest of the row');
const refused = gs.handleCount_({ action: 'linkEpc', jo: '26-287', epc: 'E2801160000000000000B001' }, user);
eq(refused.ok === false && /26-287B/.test(refused.error) && cell(sheet, 3, 'epc') === '', 'a tag already on 26-287B is not written onto 26-287');

const foundOnly = gs.handleCount_({
  action: 'countFinish',
  found: [{ id: 'IT-A', jo: '26-287A' }],
  missing: [{ id: 'IT-BASE', jo: '26-287' }],
  mark_missing: false,
  unknown: ['E2801160FFFFFFFFFFFFFFFF']
}, user);
eq(foundOnly.ok && foundOnly.found === 1 && foundOnly.missing === 0 && foundOnly.at === '2026-10-22T08:00:00.000Z', 'finish saves the found row and skips missing when that was not confirmed');
eq(cell(sheet, 2, 'count_status') === 'found' && cell(sheet, 2, 'last_counted') === '2026-10-22T08:00:00.000Z' && cell(sheet, 2, 'status') === 'in_stock', 'the found row gets last_counted and count_status, and its status cell stays');
eq(cell(sheet, 3, 'count_status') === '' && cell(sheet, 3, 'last_counted') === '', 'an unconfirmed missing row is not written');
eq(sheet._data.length === before.length, 'an unknown EPC does not add a row');
const marked = gs.handleCount_({
  action: 'countFinish',
  found: [],
  missing: [{ id: 'IT-BASE', jo: '26-287' }, { id: 'IT-B', jo: '26-287B' }],
  mark_missing: true
}, user);
eq(marked.ok && marked.missing === 2 && cell(sheet, 3, 'count_status') === 'missing' && cell(sheet, 1, 'count_status') === 'missing', 'after confirmation, missing rows are marked missing');
eq(cell(sheet, 3, 'description') === 'Old version' && cell(sheet, 1, 'epc') === 'E2801160000000000000B001', 'marking missing does not clear the description or the EPC');

const held = makeSheet([['item_id', 'jo', 'epc', 'status'], ['IT-9', '26-299C', 'abc', 'in_stock']]);
const heldBefore = snap(held);
gs.ss_ = () => ({ getSheetByName: name => name === 'Items' ? held : null });
const denied = gs.handleCount_({ action: 'countFinish', found: [{ id: 'IT-9' }], mark_missing: true, missing: [{ id: 'IT-9' }] }, { username: 'books', role: 'accounting' });
eq(denied.code === 'FORBIDDEN' && JSON.stringify(held._data) === JSON.stringify(heldBefore), 'accounting cannot write a count');
eq(String(held._data[0][2]) === 'epc', 'an existing epc header is left as it is');
const reused = gs.handleCount_({ action: 'linkEpc', jo: '26-299C', epc: 'E28011600000000000000009' }, { username: 'thea', role: 'admin' });
eq(reused.ok && reused.message === 'Linked to 26-299C' && held._data[0].filter(h => String(h).toLowerCase() === 'epc').length === 1 && held._data[1][2] === 'E28011600000000000000009', 'link uses the existing epc column and does not add a second one');

const src = read('count.js');
const css = read('count.css');
const navSrc = read('nav.js');
const app = read('app.js');
const index = read('staff/index.html');
const nav = require(path.join(root, 'nav.js'));
eq(css.includes('.ic button.pill{') && css.includes('height:34px') && css.includes('min-height:34px'), 'count buttons are 34px');
eq(read('app.css').includes('transition:transform 50ms') && read('app.css').includes('button.is-down') && navSrc.includes("classList.add('is-down')") && navSrc.includes("addEventListener('pointerdown'"), 'the 50ms press still lands on pointerdown');
eq(src.includes('id="icWedge"') && src.includes('inputmode="none"') && src.includes('applyRead(ST.session, raw)'), 'a hidden field takes the wedge, and the read is applied on the phone');
eq(src.includes("call('countFinish'") && src.includes("call('linkEpc'") && src.split("call('countFinish'").length === 2 && src.split("call('linkEpc'").length === 2, 'Finish and Link tag are the only writes');
eq(src.includes('decideFinish(') && src.includes('confirm(msg)') && src.includes('linkConfirm(jo)'), 'every save asks first');
eq(index.includes('count.js?v=2') && index.includes('count.css?v=2') && index.includes('nav.js?v=53') && index.includes('app.css?v=50') && index.indexOf('count.js?v=2') < index.indexOf('app.js?v=35'), 'the count page is loaded with the staff app');
eq(src.includes('\\u00a0\\u00b7\\u00a0') && css.includes('.ic .piece .psep{display:inline-block;white-space:pre}') && css.includes('.ic .piece{flex-direction:row'), 'a card title keeps spaces around the dot');
eq(app.includes("page === 'count'") && app.includes('countLoad: 1') && app.includes("cur0 === 'count'"), 'the count page is routed, and countLoad does not clear the page cache');
const staffMenu = nav.menuHtml({ role: 'staff', username: 'thea', display_name: 'Thea' }, 'count', '');
eq(staffMenu.indexOf('Inventory count') > staffMenu.indexOf('Appointments') && staffMenu.indexOf('Inventory count') < staffMenu.indexOf('Log out') && /data-logout>Log out<\/button>\s*$/.test(staffMenu), 'staff menu names come first and Log out stays last');
const side = nav.sideHtml({ role: 'admin', username: 'desk', display_name: 'Desk' }, 'count', '');
eq(side.indexOf('Inventory count') > 0 && side.indexOf('Inventory count') < side.indexOf('class="who"') && side.indexOf('Log out') > side.indexOf('Inventory count'), 'the left menu lists Inventory count above the name, and Log out is after the names');
eq(nav.OFFICE_NAV.admin.some(n => n[0] === 'count' && n[1] === 'Inventory count') && nav.OFFICE_NAV.production_manager.some(n => n[0] === 'count') && nav.OFFICE_NAV.staff.some(n => n[0] === 'count') && !nav.OFFICE_NAV.accounting.some(n => n[0] === 'count'), 'admin, production manager, and staff get the page');
eq(read('paste/InventoryCount.gs').includes('isCountAction_') && read('paste/InventoryCount.gs').includes('handleCount_') && read('paste/SETUP-inventory-count.txt').includes('countLoad') && read('paste/SETUP-inventory-count.txt').includes('New version'), 'the paste file and the setup steps name the three actions');
eq(!read('paste/Fast.gs.count.patch.txt').includes('FAST.CACHE') || read('paste/Fast.gs.count.patch.txt').includes('NOT added to FAST.CACHE'), 'countLoad is not added to the fast cache');
eq(read('paste/Fast.gs.count.patch.txt').includes('matHistory: 1, countLoad: 1,') && read('paste/Fast.gs.count.patch.txt').includes('Do not add linkEpc or countFinish') && read('paste/DashCache.gs.count.patch.txt').includes('listUsers: 1, countLoad: 1,') && read('paste/DashCache.gs.count.patch.txt').includes('Do not add linkEpc'), 'the read patches add countLoad only, and they say to leave the writes off');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all checks passed');
