/* Who may see cost and price. Run: node sim/money-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }
function blocks(text) {
  const parts = text.split(/\nFIND\n/);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const cut = parts[i].split(/\nREPLACE WITH\n/);
    if (cut.length !== 2) throw new Error('block ' + i);
    out.push([cut[0].replace(/\n$/, ''), cut[1].replace(/\n$/, '')]);
  }
  return out;
}
function apply(src, patch, label) {
  blocks(patch).forEach(([find, repl], i) => {
    const n = src.split(find).length - 1;
    eq(n === 1, label + ' FIND ' + (i + 1) + ' is unique (' + n + ')');
    eq(read(label).includes(find) || src.includes(find), label + ' FIND ' + (i + 1) + ' is in the paste file');
    src = src.replace(find, () => repl);
  });
  return src;
}

const app = read('app.js');
const start = app.indexOf('function canSeeMoney');
const end = app.indexOf('function toast', start);
const box = {};
vm.createContext(box);
vm.runInContext(app.slice(start, end) + '\nthis.canSeeMoney=canSeeMoney; this.seeMoney=seeMoney; this.user=function(){return null;};', box);
const susan = { role: 'production_manager', username: 'susan' };
const ada = { role: 'admin', username: 'ada' };
const ann = { role: 'staff', username: 'ann' };
const bea = { role: 'accounting', username: 'bea' };
eq(box.canSeeMoney(ada) === true, 'admin may see money');
eq(box.canSeeMoney(susan) === false, 'Susan may not see money');
eq(box.canSeeMoney(ann) === false, 'staff may not see money');
eq(box.canSeeMoney(bea) === null, 'accounting is not switched by canSeeMoney');
eq(box.seeMoney(susan, true) === false, 'a server cost flag does not show Susan the cost');
eq(box.seeMoney(ada, true) === true, 'admin still sees a server cost flag');
eq(box.seeMoney(bea, true) === true && box.seeMoney(bea, false) === false, 'accounting keeps the flag the server sent');

const nav = require(path.join(root, 'nav.js'));
const ids = role => (nav.OFFICE_NAV[role] || []).map(n => n[0]);
eq(ids('production_manager').indexOf('estimate') < 0 && ids('production_manager').indexOf('balances') < 0, 'Susan has no Cost estimator or Balances');
eq(ids('admin').indexOf('estimate') >= 0 && ids('admin').indexOf('payments') >= 0, 'admin keeps the cost estimator and quotes');
eq(ids('accounting').join() === 'dashboard,todo,appts,jos,payments,quotes,balances,clients', 'accounting menu is unchanged');
eq(nav.MAT_PRICE_ROLES.admin && !nav.MAT_PRICE_ROLES.production_manager, 'only admin opens Material prices');

const inv = read('inv.js');
eq(inv.includes('ivMoney(can.cost)') && inv.includes('ivMoney(can.price)') && inv.includes("if ($('#mvCost')) move.unit_cost"), 'inventory money is gated and a hidden cost is not posted');
eq(inv.includes('fallback: !!can.cost'), 'JO photos still follow can.cost, not the money gate');
eq(read('review.js').includes('canSeeMoney() === false'), 'the review cost box is skipped');
eq(read('production.js').includes('canSeeMoney() === false'), 'labor cost and the labor rate are skipped');
eq(read('dash.js').includes('can.sales = false'), 'dashboard money tiles are turned off');
eq(read('consign.js').includes('if (prices()) row.value = it.value'), 'a consignment save omits value when she cannot see it');
eq(read('print.js').includes('priceHidden()'), 'a print preview can hide the price');
eq(read('estimate.js').includes('Costs, prices, and markups are not shown'), 'the cost estimator refuses the role');

apply(read('paste/Consignment.gs.txt'), read('paste/Consignment.gs.money.patch.txt'), 'paste/Consignment.gs.txt');
apply(read('paste/Todo.gs'), read('paste/Todo.gs.money.patch.txt'), 'paste/Todo.gs');
const money = read('paste/Money.gs');
eq(money.includes('function moneyHidden_') && money.includes('function stripMoney_') && money.includes('function rejectMoneyWrite_'), 'Money.gs strips reads and rejects writes');
eq(money.includes('invList_') && money.includes('jobReviewSave_') && money.includes('priceGet_'), 'Money.gs names the live functions that are not in the repo');

const gs = {};
vm.createContext(gs);
vm.runInContext(money, gs);
eq(gs.moneyHidden_(susan) && !gs.moneyHidden_(ada) && !gs.moneyHidden_(bea), 'the server hides money for Susan and staff, not admin or accounting');
const stripped = gs.stripMoney_({ ok: true, jobs: [{ jo: '26-426', cost: 10, price: 20, client: 'Elena' }], can: { cost: true, price: true } }, susan);
eq(stripped.jobs[0].cost == null && stripped.jobs[0].price == null && stripped.jobs[0].client === 'Elena' && stripped.can.cost === false, 'a list loses cost and price and keeps the client');
eq(gs.stripMoney_({ jobs: [{ cost: 10 }] }, ada).jobs[0].cost === 10, 'admin list is not stripped');
eq(gs.rejectMoneyWrite_({ set: { price: 20 } }, susan).code === 'FORBIDDEN', 'a price write is rejected');
eq(gs.rejectMoneyWrite_({ set: { client: 'Elena' } }, susan) == null, 'a save with no money field is allowed');
eq(gs.rejectMoneyWrite_({ item: { unit_cost: 5 } }, ada) == null, 'admin may write a cost');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('money sim ok');
