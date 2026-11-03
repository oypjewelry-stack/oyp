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

const money = read('paste/Money.gs');
eq(money.includes('function moneyHidden_') && money.includes('function stripMoney_') && money.includes('function rejectMoneyWrite_') && money.includes('function moneyPrepare_') && money.includes('function moneyOut_') && money.includes('function moneyUser_'), 'Money.gs prepares writes and strips the doPost copy');
const authPatch = read('paste/Auth.gs.money.patch.txt');
const authFinds = blocks(authPatch);
eq(authFinds.length === 1 && authFinds[0][0] === '  var out = handleAction_(req);', 'the Auth patch has one FIND, the doPost assignment');
eq(authPatch.includes('find the line in doPost that contains handleAction_(') && authPatch.includes('Do not rename handleAction_'), 'the fallback is the line in doPost that contains handleAction_(');
eq(authPatch.includes('moneyPrepare_(req, s.user)'), 'moneyPrepare_ stays at the top of handleAction_');
const quoted = [];
fs.readdirSync(path.join(root, 'paste')).forEach(name => {
  if (name === 'Auth.gs.money.patch.txt') return;
  read('paste/' + name).split('\n').forEach(line => {
    if (line.includes('handleAction_(')) quoted.push(name + ': ' + line.trim());
  });
});
eq(quoted.length === 0, 'no other paste file quotes a doPost line that calls handleAction_');

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

const invList = { ok: true, can: { cost: true, price: true, edit: true }, jobs: [
  { jo: '26-426', client: 'Elena Tan', description: 'Sapphire cuff', location: 'vault', status: 'active', weight_g: 12.5, on_hand: true, cost: 4200, price: 12800, margin_pct: 67 }
]};
const board = { ok: true, can: { costs: true, all: true }, labor_cost: 900, board: [
  { key: 'qc', label: 'QC', count: 1, cards: [{ jo: '26-418', description: 'Plain band', status: 'active', weight_g: 4, stage: 'qc', due: '2026-11-01' }] }
], sessions: [{ worker: 'Romy', minutes: 30, status: 'done', cost: 150 }] };
const mats = { ok: true, can: { cost: true, edit: true }, items: [
  { mat_id: 'm1', name: '18k yellow gold', kind: 'metal', unit: 'g', qty: 20, location: 'vault', active: true, last_cost: 3450, stock_cost: 69000 }
]};
const dash = { ok: true, can: { sales: true, prices: true, payments: true, consign: true, clients: true }, counts: { active_jobs: 2, month_sales: 50000 },
  payments: [{ jo: '26-426', amount: 1000, status: 'confirmed', date: '2026-10-01' }],
  consignments: [{ jo: '26-380', description: 'Chain', consignee: 'Ana', status: 'out', value: 9000 }] };
const hidden = {
  inv: gs.stripMoney_(JSON.parse(JSON.stringify(invList)), susan),
  board: gs.stripMoney_(JSON.parse(JSON.stringify(board)), susan),
  mats: gs.stripMoney_(JSON.parse(JSON.stringify(mats)), susan),
  dash: gs.stripMoney_(JSON.parse(JSON.stringify(dash)), susan)
};
const job = hidden.inv.jobs[0];
eq(job.jo === '26-426' && job.client === 'Elena Tan' && job.status === 'active' && job.weight_g === 12.5 && job.location === 'vault' && job.cost == null && job.price == null && job.margin_pct == null, 'invList keeps the piece and drops cost, price, and margin');
eq(hidden.inv.can.edit === true && hidden.inv.can.cost === false && hidden.inv.can.price === false, 'invList keeps edit and turns the money flags off');
const card = hidden.board.board[0].cards[0];
eq(card.jo === '26-418' && card.description === 'Plain band' && card.status === 'active' && card.weight_g === 4 && card.stage === 'qc' && hidden.board.labor_cost == null && hidden.board.sessions[0].cost == null && hidden.board.sessions[0].minutes === 30 && hidden.board.sessions[0].status === 'done', 'the production board keeps the job and the hours and drops labor cost');
eq(hidden.board.can.all === true && hidden.board.can.costs === false, 'production keeps the worker tools and hides the cost flag');
const metal = hidden.mats.items[0];
eq(metal.name === '18k yellow gold' && metal.kind === 'metal' && metal.qty === 20 && metal.unit === 'g' && metal.active === true && metal.last_cost == null && metal.stock_cost == null, 'materials keeps the stock row and drops last cost');
eq(hidden.mats.can.edit === true && hidden.mats.can.cost === false, 'materials keeps edit and hides cost');
eq(hidden.dash.counts.active_jobs === 2 && hidden.dash.counts.month_sales == null && hidden.dash.payments[0].amount == null && hidden.dash.payments[0].status === 'confirmed' && hidden.dash.consignments[0].value == null && hidden.dash.consignments[0].consignee === 'Ana' && hidden.dash.can.clients === true && hidden.dash.can.sales === false, 'the dashboard keeps counts and names and drops sales, amounts, and consignment value');
eq(gs.stripMoney_(JSON.parse(JSON.stringify(invList)), ada).jobs[0].price === 12800 && gs.stripMoney_(JSON.parse(JSON.stringify(dash)), bea).payments[0].amount === 1000, 'admin and accounting responses are not stripped');

const prices = { ok: true, can: { prices: true }, items: [{ name: '18k yellow gold', unit: 'g', rate: 3450, markup: 2.5 }], markups: { standard: 2.2 } };
const consign = { ok: true, can: { prices: true, consign: true }, items: [
  { jo: '26-380', description: 'Chain', consignee: 'Ana', status: 'out', weight_g: 6, value: 9000 }
]};
const shared = {};
function dcacheRead_(action, build) {
  if (shared[action]) return JSON.parse(shared[action]);
  const full = build();
  shared[action] = JSON.stringify(full);
  return full;
}
function handleAction_(req, s) {
  const user = (s && s.user) || gs.moneyUser_(req, s);
  const denied = gs.moneyPrepare_(req, user);
  if (denied) return denied;
  if (req.action === 'invList') return dcacheRead_('invList', () => JSON.parse(JSON.stringify(invList)));
  if (req.action === 'prodBoard') return dcacheRead_('prodBoard', () => JSON.parse(JSON.stringify(board)));
  if (req.action === 'matList') return dcacheRead_('matList', () => JSON.parse(JSON.stringify(mats)));
  if (req.action === 'priceGet') return dcacheRead_('priceGet', () => JSON.parse(JSON.stringify(prices)));
  if (req.action === 'consignList') return dcacheRead_('consignList', () => JSON.parse(JSON.stringify(consign)));
  if (req.action === 'dashboard') return dcacheRead_('dashboard', () => JSON.parse(JSON.stringify(dash)));
  if (req.action === 'invSave') return { ok: true, saved: true };
  return { ok: false, error: 'Unknown action' };
}
function doPost(req, s) {
  const out = gs.moneyOut_(req, s || null, handleAction_(req, s));
  return JSON.parse(JSON.stringify(out));
}
gs.sessionFrom_ = req => {
  if (req && req.session === 'susan') return { user: susan };
  if (req && req.session === 'bea') return { user: bea };
  return null;
};
const susanInv = doPost({ action: 'invList' }, { user: susan });
const stored = JSON.parse(shared.invList);
eq(susanInv.jobs[0].jo === '26-426' && susanInv.jobs[0].weight_g === 12.5 && susanInv.jobs[0].status === 'active' && susanInv.jobs[0].cost == null && susanInv.jobs[0].price == null, 'doPost strips the inventory answer');
eq(stored.jobs[0].cost === 4200 && stored.jobs[0].price === 12800, 'the shared cache still holds the full inventory answer');
const adaInv = doPost({ action: 'invList' }, { user: ada });
eq(adaInv.jobs[0].price === 12800 && adaInv.jobs[0].cost === 4200 && JSON.parse(shared.invList).jobs[0].price === 12800, 'admin reads the shared cache with cost and price, and the cache is not rewritten stripped');
const susanBoard = doPost({ action: 'prodBoard' }, { user: susan });
eq(susanBoard.board[0].cards[0].stage === 'qc' && susanBoard.sessions[0].minutes === 30 && susanBoard.labor_cost == null && susanBoard.sessions[0].cost == null && JSON.parse(shared.prodBoard).labor_cost === 900, 'doPost strips the production board and leaves the cached labor cost');
const susanMats = doPost({ action: 'matList' }, { user: susan });
eq(susanMats.items[0].qty === 20 && susanMats.items[0].unit === 'g' && susanMats.items[0].last_cost == null && JSON.parse(shared.matList).items[0].stock_cost === 69000, 'doPost strips materials and leaves the cached stock cost');
const susanPrice = doPost({ action: 'priceGet' }, { user: susan });
eq(susanPrice.items[0].name === '18k yellow gold' && susanPrice.items[0].unit === 'g' && susanPrice.items[0].rate == null && susanPrice.markups == null && JSON.parse(shared.priceGet).items[0].rate === 3450, 'doPost strips rates and markups and leaves the cached price row');
const susanConsign = doPost({ action: 'consignList' }, { user: susan });
eq(susanConsign.items[0].jo === '26-380' && susanConsign.items[0].status === 'out' && susanConsign.items[0].weight_g === 6 && susanConsign.items[0].value == null && JSON.parse(shared.consignList).items[0].value === 9000, 'doPost strips consignment value and leaves the cached value');
const susanDash = doPost({ action: 'dashboard' }, { user: susan });
eq(susanDash.counts.active_jobs === 2 && susanDash.counts.month_sales == null && susanDash.payments[0].status === 'confirmed' && susanDash.payments[0].amount == null && JSON.parse(shared.dashboard).payments[0].amount === 1000, 'doPost strips the dashboard and leaves the cached amount');
const beaDash = doPost({ action: 'dashboard', session: 'bea' }, null);
eq(beaDash.payments[0].amount === 1000 && beaDash.counts.month_sales === 50000, 'accounting, resolved with sessionFrom_, still receives the dashboard money');
const denied = doPost({ action: 'invSave', set: { price: 20, client: 'Elena' } }, { user: susan });
eq(denied.code === 'FORBIDDEN' && !shared.invSave, 'a money write is rejected at the top of handleAction_ and is not cached');
const kept = { jobs: [{ jo: '26-426', cost: 5 }] };
const sent = gs.moneyOut_({ action: 'invList' }, { user: susan }, kept);
eq(kept.jobs[0].cost === 5 && sent.jobs[0].cost == null && sent.jobs[0].jo === '26-426', 'moneyOut_ strips a copy and leaves the cached object alone');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('money sim ok');
