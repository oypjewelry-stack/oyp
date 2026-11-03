/* Admin delete of a consignment sheet. Run: node sim/consign-delete-sim.js */
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
function apply(src, patch) {
  blocks(patch).forEach(([find, repl], i) => {
    const n = src.split(find).length - 1;
    eq(n === 1, 'FIND ' + (i + 1) + ' is unique (' + n + ')');
    src = src.replace(find, () => repl);
  });
  return src;
}

const live = read('paste/Consignment.gs.txt');
const patch = read('paste/Consignment.gs.delete.patch.txt');
const patched = apply(live, patch);
eq(patched.includes("consignDelete: 1") && patched.includes('consignDelete: consignDelete_'), 'consignDelete is a known action');
eq(patched.includes("audit_(by, 'consignClose'"), 'closing a sheet is still recorded');
eq(patched.includes('prev_location') && patched.includes("back === 'consigned'") === false || patched.includes("if (!back || back === 'consigned') back = 'vault'"), 'a consigned piece is sent back to prev_location');

const page = read('consign.js');
eq(page.includes('An admin can delete a sheet') && !page.includes('Nothing on this page is deleted'), 'the intro no longer says nothing is deleted');
eq(page.includes("confirm('Delete ' + id + ' for ' + who + '? The sheet is removed. Pieces still out go back to where they were.')"), 'delete asks, and names the CS number and the consignee');
eq(page.includes('data-csmore') && page.includes('id="csDelete"') && page.includes("label: 'Delete'"), 'delete is in the sheet menu and on the detail view');
eq(page.includes("U.role === 'admin'") && page.includes(', 10000)'), 'only an admin sees delete, and undo stays up for 10 seconds');
eq(read('staff/index.html').includes('consign.js?v=13') && read('staff/index.html').includes('consign.css?v=12'), 'consign.js and consign.css are cache-busted');

function world(opts) {
  const lines = (opts.lines || []).map(r => Object.assign({}, r));
  const jobs = (opts.jobs || []).map((r, i) => Object.assign({ _row: i + 2 }, r));
  const logs = [];
  const audits = [];
  const deleted = opts.deleted ? { appends: [], appendRow(row) { this.appends.push(row); } } : null;
  const auditLog = opts.auditLog ? { appends: [], appendRow(row) { this.appends.push(row); } } : null;
  const book = {
    getSheetByName(name) {
      if (name === 'Consignment') return {
        deleteRow(n) {
          const at = lines.findIndex(r => r._row === n);
          if (at >= 0) lines.splice(at, 1);
          lines.forEach((r, i) => { r._row = i + 2; });
        }
      };
      if (name === 'JobOrders') return {};
      if (name === 'Deleted') return deleted;
      if (name === 'AuditLog') return auditLog;
      if (name === 'Audit') return null;
      return null;
    }
  };
  lines.forEach((r, i) => { r._row = i + 2; });
  const sandbox = {
    console,
    CONSIGN_COLS: null,
    isExec_: u => !!(u && u.role === 'admin'),
    withLock_: fn => fn(),
    now_: () => '2026-11-03T08:00:00.000Z',
    audit_: function () { audits.push([].slice.call(arguments)); },
    jobStr_: v => String(v == null ? '' : v).trim(),
    jobKey_: v => String(v == null ? '' : v).trim(),
    jobHeader_: () => ['ci_id', 'consignment_id', 'consignee_name', 'status', 'jo', 'prev_location'],
    jobRows_: name => {
      if (name === 'Consignment') return lines.map(r => Object.assign({}, r));
      if (name === 'JobOrders') return jobs.map(r => Object.assign({}, r));
      return [];
    },
    jobSet_: (tab, row, ch) => {
      if (tab !== 'JobOrders') return;
      const hit = jobs.find(j => j._row === row);
      if (hit) Object.assign(hit, ch);
    },
    jobAppend_: (tab, obj) => {
      if (tab !== 'Consignment') return;
      lines.push(Object.assign({ _row: lines.length + 2 }, obj));
    },
    ss_: () => book
  };
  vm.createContext(sandbox);
  vm.runInContext(patched, sandbox, { filename: 'Consignment.gs' });
  return { sandbox, lines, jobs, logs, audits, deleted, auditLog };
}

const ada = { role: 'admin', username: 'ada' };
const susan = { role: 'production_manager', username: 'susan' };
const baseLines = [
  { ci_id: 'ci-1', consignment_id: 'CS-261002-01', consignee_name: 'Ana R.', status: 'consigned', jo: '26-280', prev_location: 'vault', description: 'Sapphire cuff' },
  { ci_id: 'ci-2', consignment_id: 'CS-261002-01', consignee_name: 'Ana R.', status: 'returned', jo: '26-281', prev_location: 'showroom', description: 'Plain band' }
];
const baseJobs = [
  { jo: '26-280', location: 'consigned', status: 'active' },
  { jo: '26-281', location: 'vault', status: 'active' }
];

const open = world({ lines: baseLines, jobs: baseJobs });
const denied = open.sandbox.handleConsign_({ action: 'consignDelete', consignment_id: 'CS-261002-01' }, susan);
eq(denied.code === 'FORBIDDEN' && open.lines.length === 2 && open.jobs[0].location === 'consigned', 'a production manager cannot delete a sheet');

const gone = open.sandbox.handleConsign_({ action: 'consignDelete', consignment_id: 'CS-261002-01' }, ada);
eq(gone.ok === true && gone.logged === false && gone.removed === 2 && gone.consignee === 'Ana R.' && gone.rows && gone.rows.length === 2, 'with no Deleted or audit tab the response keeps the rows');
eq(open.lines.length === 0 && open.jobs[0].location === 'vault' && open.jobs[1].location === 'vault', 'the consigned piece goes back to vault and the returned piece stays');
eq(open.audits.some(a => a[1] === 'consignDelete' && a[2] === 'CS-261002-01'), 'the delete is audited');
const back = open.sandbox.handleConsign_({ action: 'consignDelete', restore: gone.rows }, ada);
eq(back.ok === true && back.restored === 2 && open.lines.length === 2 && open.lines[0].consignment_id === 'CS-261002-01' && open.jobs[0].location === 'consigned' && open.jobs[1].location === 'vault', 'undo puts the sheet back and the consigned piece out again');

const shared = world({
  lines: baseLines.concat([{ ci_id: 'ci-9', consignment_id: 'CS-261003-02', consignee_name: 'Bea', status: 'consigned', jo: '26-280', prev_location: 'showroom' }]),
  jobs: baseJobs
});
const part = shared.sandbox.consignDelete_({ consignment_id: 'CS-261002-01' }, ada);
eq(part.ok === true && shared.lines.length === 1 && shared.lines[0].consignment_id === 'CS-261003-02' && shared.jobs[0].location === 'consigned', 'a JO still out on another sheet stays consigned');

const logged = world({ lines: baseLines, jobs: baseJobs, deleted: true });
const hid = logged.sandbox.consignDelete_({ consignment_id: 'CS-261002-01' }, ada);
eq(hid.ok === true && hid.logged === true && hid.rows == null && logged.deleted.appends.length === 1, 'a Deleted tab receives the rows and the response does not need a copy');
const dumped = JSON.parse(logged.deleted.appends[0][4]);
eq(dumped.length === 2 && dumped[0].jo === '26-280' && dumped[1].status === 'returned', 'the Deleted row is the sheet JSON');

const auditOnly = world({ lines: baseLines, jobs: baseJobs, auditLog: true });
const viaAudit = auditOnly.sandbox.consignDelete_({ consignment_id: 'CS-261002-01' }, ada);
eq(viaAudit.logged === true && auditOnly.auditLog.appends.length === 1 && viaAudit.rows == null, 'AuditLog is used when there is no Deleted tab');

const missing = world({ lines: [], jobs: baseJobs });
eq(missing.sandbox.consignDelete_({ consignment_id: 'CS-261002-01' }, ada).error === 'No such sheet', 'a missing sheet is refused');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('consign delete sim ok');
