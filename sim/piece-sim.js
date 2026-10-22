/* Name · JO. Proves the live-file patches apply, names stay off roles that may not see clients,
   and the consignee is not used as the client. Run: node sim/piece-sim.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const live = p => fs.readFileSync(p, 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } }

function blocks(text) {
  const parts = text.split(/\nFIND\n/);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const cut = parts[i].split(/\nREPLACE WITH\n/);
    if (cut.length !== 2) throw new Error('patch block ' + i + ' has no REPLACE WITH');
    out.push([cut[0].replace(/\n$/, ''), cut[1].replace(/\n$/, '')]);
  }
  return out;
}
function apply(src, patch, label) {
  blocks(patch).forEach(([find, repl], i) => {
    const n = src.split(find).length - 1;
    eq(n === 1, label + ' find ' + (i + 1) + ' matches ' + n + ' times');
    src = src.replace(find, repl);
  });
  blocks(patch).forEach(([find, repl], i) => {
    const left = src.split(find).length - 1;
    const inside = repl.split(find).length - 1;
    eq(left === inside, label + ' find ' + (i + 1) + ' left ' + left + ', kept inside the replacement ' + inside);
  });
  return src;
}

const consignLive = live('/home/ubuntu/.cursor/projects/workspace/uploads/Consignment.gs_616d.txt');
const dashLive = live('/home/ubuntu/.cursor/projects/workspace/uploads/Dashboard.gs_f834.txt');
eq(consignLive === live(path.join(root, 'paste/Consignment.gs.txt')), 'paste Consignment.gs.txt is the live file');
const consignPatched = apply(consignLive, live(path.join(root, 'paste/Consignment.gs.patch.txt')), 'Consignment');
const dashPatched = apply(dashLive, live(path.join(root, 'paste/Dashboard.gs.name.patch.txt')), 'Dashboard');
eq(consignPatched.indexOf('consignAttachNames_(res, user)') >= 0, 'list stamps names');
eq(dashPatched.indexOf('can.clients ? clients : null') >= 0, 'dashboard passes clients only when the role may see them');
eq(dashPatched.indexOf('todoDone') < 0 && consignPatched.indexOf('FAST.READS') < 0, 'patches add no cache-list edits');

const DASH_ROLES = {
  admin: { clients: true }, production_manager: { clients: true }, accounting: { clients: true }, staff: { clients: false }
};
const sheets = {
  Clients: [
    { client_id: 'cl-1', name: 'Elena Tan' },
    { client_id: 'cl-2', name: 'Maria Cristina Belmonte Santos' }
  ],
  JobOrders: [
    { jo: '26-287', client_id: 'cl-1', description: 'Diamond ring', status: 'active', location: 'vault' },
    { jo: '26-301', client_id: 'cl-2', description: 'Long name piece', status: 'active', location: 'vault' },
    { jo: '26-265', client_id: '', description: 'No client', status: 'active', location: 'vault' },
    { jo: '', client_id: 'cl-1', description: 'Blank JO', status: 'active', location: 'vault' }
  ]
};
const sandbox = {
  DASH_ROLES,
  console,
  ss_: () => ({ getSheetByName: name => sheets[name] ? {} : null }),
  jobRows_: name => (sheets[name] || []).map(r => Object.assign({}, r)),
  jobStr_: v => String(v == null ? '' : v).trim(),
  jobKey_: v => String(v == null ? '' : v).trim()
};
vm.createContext(sandbox);
vm.runInContext(consignPatched, sandbox, { filename: 'Consignment.gs' });

eq(sandbox.consignMayName_({ role: 'admin' }) === true, 'admin may see names');
eq(sandbox.consignMayName_({ role: 'production_manager' }) === true, 'production manager may see names');
eq(sandbox.consignMayName_({ role: 'accounting' }) === true, 'accounting may see names');
eq(sandbox.consignMayName_({ role: 'staff' }) === false, 'staff may not see names');
eq(sandbox.consignMayName_(null) === false, 'no user, no name');

function namesOf(role, q) {
  const r = sandbox.consignSearch_({ q: q || '26' }, { role: role });
  eq(r.ok === true, 'search ok for ' + role);
  const by = {};
  r.hits.forEach(h => { by[h.jo] = h; });
  return by;
}
const adminHits = namesOf('admin');
eq(adminHits['26-287'] && adminHits['26-287'].client === 'Elena Tan', 'search stamps Elena Tan on 26-287');
eq(adminHits['26-301'] && adminHits['26-301'].client === 'Maria Cristina Belmonte Santos', 'search stamps the long name');
eq(adminHits['26-265'] && !Object.prototype.hasOwnProperty.call(adminHits['26-265'], 'client'), 'a JO with no client gets no client field');
eq(!adminHits[''], 'a blank JO is not a hit');
const staffHits = namesOf('staff');
eq(staffHits['26-287'] && !Object.prototype.hasOwnProperty.call(staffHits['26-287'], 'client'), 'staff search has no client name');

const res = {
  sheets: [{ items: [{ jo: '26-287', description: 'Diamond ring' }, { jo: '26-265' }, { item_id: 'TAG-1' }] }],
  loose: [{ jo: '26-301', description: 'Loose' }, { jo: '26-265' }]
};
sandbox.consignAttachNames_(res, { role: 'production_manager' });
eq(res.sheets[0].items[0].client === 'Elena Tan', 'sheet item gets the jewelry client');
eq(!res.sheets[0].items[1].client, 'sheet item without a client stays blank');
eq(!res.sheets[0].items[2].client, 'an item with no JO is not named');
eq(res.loose[0].client === 'Maria Cristina Belmonte Santos', 'loose row gets the client');
const hidden = { sheets: [{ items: [{ jo: '26-287' }] }], loose: [] };
sandbox.consignAttachNames_(hidden, { role: 'staff' });
eq(!hidden.sheets[0].items[0].client, 'staff list is not stamped');

vm.runInContext(dashPatched, sandbox, { filename: 'Dashboard.gs' });
sandbox.dashRead_ = function (name) { return name === 'Consignment' ? [{
  status: 'consigned', jo: '26-287', description: 'Diamond ring', item_id: 'IT-1',
  consignee_name: "Rustan's", consignment_id: 'CS-1', date_out: '2026-09-01'
}] : []; };
const jobs = [{ jo: '26-287', client_id: 'cl-1', location: 'showroom' }];
const named = sandbox.dashConsign_('2026-10-20', 30, false, jobs, [], { 'cl-1': { name: 'Elena Tan' } });
eq(named.consignments[0].client === 'Elena Tan', 'drill payload carries the jewelry client');
eq(named.consignments[0].consignee === "Rustan's", 'consignee stays the consignee');
const unnamed = sandbox.dashConsign_('2026-10-20', 30, false, jobs, [], null);
eq(!unnamed.consignments[0].client, 'no client map means no client field');

const app = live(path.join(root, 'app.js'));
const slice = app.slice(app.indexOf('function pieceName'), app.indexOf('window.OYP = { call'));
const ui = {};
vm.createContext(ui);
vm.runInContext('const esc = s => String(s == null ? "" : s).replace(/[&<>"\']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" })[c]);\n' + slice + '\nthis.piece = piece;', ui);
const html = ui.piece('Elena Tan', '26-287');
eq(html.indexOf('Elena Tan') < html.indexOf('26-287'), 'name comes before the JO');
eq(html.indexOf('class="pname"') >= 0 && html.indexOf('class="pjo"') >= 0, 'name and JO are separate');
eq(html.indexOf('title="Elena Tan · 26-287"') >= 0, 'full label is the title');
const joOnly = ui.piece('', '26-265');
eq(joOnly.indexOf('pname') < 0 && joOnly.indexOf('26-265') >= 0, 'no name means the JO alone');
eq(ui.piece({ name: 'Elena Tan' }, '26-287').indexOf('Elena Tan') >= 0, 'a client object uses its name');
eq(ui.piece(null, '') === '', 'nothing to show is empty');

function has(file, needle) { eq(live(path.join(root, file)).indexOf(needle) >= 0, file + ' has ' + needle); }
has('dash.js', 'window.OYP.piece(j.client, j.jo)');
has('dash.js', 'with: c.consignee');
has('inv.js', 'window.OYP.piece(j.client, j.jo)');
has('production.js', 'window.OYP.piece(c.client, id)');
has('review.js', 'window.OYP.piece(j.client, j.jo)');
has('consign.js', 'function pieceBits');
has('staff/index.html', 'app.css?v=46');
has('staff/index.html', 'app.js?v=34');
has('staff/index.html', 'dash.js?v=33');
has('staff/index.html', 'inv.js?v=13');
has('staff/index.html', 'production.js?v=13');
has('staff/index.html', 'production.css?v=11');
has('staff/index.html', 'consign.js?v=11');
has('staff/index.html', 'consign.css?v=10');
has('staff/index.html', 'review.js?v=20');
const consignSrc = live(path.join(root, 'consign.js'));
eq(/pieceBits\(it, printing \? \{ joOnly: true \} : null\)/.test(consignSrc), 'a printed consignment sheet is the JO only');
eq(/pieceBits\(it, \{ joOnly: true \}\)/.test(consignSrc), 'the return slip is the JO only');
eq(/if \(opts && opts\.joOnly\)/.test(consignSrc), 'print markup does not call the name label');
eq(live(path.join(root, 'consign.css')).indexOf('.cs .piece .pname,.cs .piece .psep{display:none!important}') >= 0, 'a browser print hides the jewelry client');
eq(live(path.join(root, 'consign.css')).indexOf('text-overflow:clip') < 0, 'print does not expand the client name');
eq(live(path.join(root, 'dash.js')).indexOf('client: c.consignee') < 0, 'a consignee is not labeled as the client');
eq(live(path.join(root, 'app.css')).indexOf('.kcard .kjo{height:') >= 0, 'board title slot has a fixed height');
eq(live(path.join(root, 'production.css')).indexOf('height:calc(46px*var(--hs))') >= 0, 'phone production cards reserve two title lines');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('ok name · JO');
