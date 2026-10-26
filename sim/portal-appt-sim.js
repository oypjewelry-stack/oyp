/* Customer portal appointment requests. Proves the live-file patches apply, a customer only
   sees their own rows, a request is status requested / source portal, hours and clashes stay
   off the customer answer, and the write is not listed as a read. Run: node sim/portal-appt-sim.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const live = p => fs.readFileSync(p, 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } }

function blocks(text) {
  const lines = text.split('\n'), marks = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === 'FIND' || /\bFIND$/.test(t)) marks.push(['find', i]);
    else if (t === 'REPLACE WITH') marks.push(['repl', i]);
  }
  const out = [];
  for (let m = 0; m < marks.length; m++) {
    if (marks[m][0] !== 'find') continue;
    const repl = marks[m + 1];
    if (!repl || repl[0] !== 'repl') throw new Error('FIND without REPLACE WITH');
    const next = marks[m + 2];
    const find = lines.slice(marks[m][1] + 1, repl[1]).join('\n').replace(/\n+$/, '');
    let put = lines.slice(repl[1] + 1, next ? next[1] : lines.length).join('\n').replace(/\n+$/, '');
    put = put.replace(/\n+\d+\.\s[^\n]*$/, '');
    out.push([find, put]);
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

const portalLive = live('/home/ubuntu/.cursor/projects/workspace/uploads/Portal.gs_639d.txt');
const fastLive = live('/home/ubuntu/.cursor/projects/workspace/uploads/Fast.gs_c843.txt');
const dashLive = live('/home/ubuntu/.cursor/projects/workspace/uploads/DashCache.gs_1b65.txt');
const portal = apply(portalLive, live(path.join(root, 'paste/Portal.gs.patch.txt')), 'Portal');
const fast = apply(apply(fastLive, live(path.join(root, 'paste/Fast.gs.patch.txt')), 'Fast todo'), live(path.join(root, 'paste/Fast.gs.portal.patch.txt')), 'Fast portal');
const dcache = apply(apply(dashLive, live(path.join(root, 'paste/DashCache.gs.patch.txt')), 'DashCache todo'), live(path.join(root, 'paste/DashCache.gs.portal.patch.txt')), 'DashCache portal');

eq(portal.indexOf("source: 'portal'") >= 0, 'request source is portal');
eq(portal.indexOf('MailApp') < 0 && portal.indexOf('GmailApp') < 0 && portal.indexOf('sendEmail') < 0, 'portal patch sends no email');
eq(portal.indexOf('apptSave_') < 0 && portal.indexOf('apptEvCreate_') < 0, 'portal patch does not book or invite');
eq(fast.indexOf('portalAppts: 1') >= 0, 'portalAppts is a Fast read');
eq(fast.indexOf('portalApptRequest') < 0, 'portalApptRequest stays out of Fast');
eq(!/CACHE:[^}]*portalAppts/.test(fast), 'portalAppts is not in FAST.CACHE');
eq(dcache.indexOf('portalAppts: 1') >= 0, 'portalAppts is a DashCache read');
eq(dcache.indexOf('portalApptRequest') < 0, 'portalApptRequest stays out of DashCache');
eq(live(path.join(root, 'my/index.html')).indexOf('my.js?v=4') >= 0, 'my.js version bumped');
eq(live(path.join(root, 'my/index.html')).indexOf('cust.css?v=9') >= 0, 'cust.css version bumped');
eq(live(path.join(root, 'my/my.js')).indexOf('Requested, waiting for confirmation') < 0, 'the waiting phrase comes from the server label');
eq(live(path.join(root, 'my/my.js')).indexOf('Request sent.') >= 0, 'the customer is told the request was sent');

const rows = [];
const posts = [];
let bumps = 0;
const elena = { customer_id: 'cu-1', client_id: 'cl-1', full_name: 'Elena Tan', email: 'elena@example.com', mobile: '09171234567', status: 'active' };
const APPT = { OPEN_MIN: 10 * 60, CLOSE_MIN: 15 * 60, DAYS: [1, 2, 3, 4, 5], MIN_MIN: { fitting: 60, pickup: 60, repair: 60, appraisal: 15 }, STEP_MIN: 15, EARLIEST_MIN: 7 * 60, LATEST_MIN: 18 * 60, TYPES_OFF: {} };
function pad(n) { return (n < 10 ? '0' : '') + n; }
function apptIso_(day, min) { return day + 'T' + pad(Math.floor(min / 60)) + ':' + pad(min % 60) + ':00+08:00'; }
function apptMs_(v) { const t = new Date(String(v || '')).getTime(); return isNaN(t) ? NaN : t; }
function apptLocal_(ms) { const d = new Date(ms + 8 * 36e5); return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() }; }
function apptDow_(day) { return new Date(day + 'T00:00:00Z').getUTCDay(); }
function apptClock_(min) { let h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ap; }
function apptDayLab_(day) { return day; }
function apptTypeLab_(t) { return { fitting: 'Fitting', pickup: 'Pickup', appraisal: 'Appraisal', repair: 'Repair' }[t] || t; }
function apptHoursTxt_() { return 'Mon–Fri, 10AM–3PM'; }
function apptStartMin_(v) { const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
function apptOutside_(day, start, minutes) {
  if (APPT.DAYS.indexOf(apptDow_(day)) < 0) return 'closed';
  if (start < APPT.OPEN_MIN || start + minutes > APPT.CLOSE_MIN) return 'closed';
  return null;
}
function apptRule_(type, day, start, minutes) {
  if (!APPT.MIN_MIN[type]) return { ok: false, code: 'BAD_TYPE' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isFinite(start)) return { ok: false, code: 'BAD_TIME' };
  if (minutes % 15 || start % 15) return { ok: false, code: 'BAD_TIME' };
  if (apptMs_(apptIso_(day, start)) < Date.now()) return { ok: false, code: 'PAST' };
  return null;
}
function apptRequest_(req) {
  const row = { appt_id: 'ap-' + (rows.length + 1), status: 'requested', source: req.source, type: req.type, start_at: apptIso_(req.day, req.start), end_at: apptIso_(req.day, req.start + req.minutes),
    client_id: req.client.client_id, client_name: req.client.name, client_email: req.client.email, client_phone: req.client.phone, notes: req.notes, created_by: req.actor, event_id: '' };
  rows.push(row);
  return { ok: true, appt_id: row.appt_id, status: 'requested' };
}
rows.push({ appt_id: 'ap-other', status: 'requested', source: 'portal', type: 'fitting', start_at: apptIso_('2026-10-22', 11 * 60), end_at: apptIso_('2026-10-22', 12 * 60), client_id: 'cl-9', client_name: 'Ana Ruiz', client_email: 'ana@example.com', client_phone: '09180000000', notes: 'Ana private note', created_by: 'cust:cu-9' });
rows.push({ appt_id: 'ap-booked-other', status: 'booked', source: 'backoffice', type: 'pickup', start_at: apptIso_('2026-10-22', 10 * 60), end_at: apptIso_('2026-10-22', 11 * 60), client_id: 'cl-9', client_name: 'Ana Ruiz', client_email: 'ana@example.com', client_phone: '09180000000', notes: 'staff note', created_by: 'owner', event_id: 'ev-1' });
rows.push({ appt_id: 'ap-elena-booked', status: 'booked', source: 'backoffice', type: 'pickup', start_at: apptIso_('2026-10-23', 10 * 60), end_at: apptIso_('2026-10-23', 11 * 60), client_id: 'cl-1', client_name: 'Elena Tan', client_email: 'elena@example.com', client_phone: '09171234567', notes: 'bring the ring', created_by: 'owner', event_id: 'ev-2' });

const sandbox = {
  APPT, apptIso_, apptMs_, apptLocal_, apptDow_, apptClock_, apptDayLab_, apptTypeLab_, apptHoursTxt_, apptStartMin_, apptOutside_, apptRule_, apptRequest_,
  apptRows_: () => rows,
  settingsApply_: () => {},
  custSession_: () => ({ c: elena }),
  botPost_: text => { posts.push(text); return { ok: true }; },
  fastBump_: () => { bumps++; },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  console
};
vm.createContext(sandbox);
vm.runInContext(portal, sandbox, { filename: 'Portal.gs' });

const list = sandbox.ptAppts_({ session: 'tok' });
eq(list.ok === true && list.setup === true, 'list ok');
eq(list.appts.length === 1, 'only Elena\'s confirmed visit is listed, got ' + list.appts.length);
eq(list.appts[0].label === 'Confirmed' && list.appts[0].time === '10AM', 'confirmed shows Confirmed and the time');
eq(JSON.stringify(list).indexOf('Ana') < 0 && JSON.stringify(list).indexOf('cl-9') < 0 && JSON.stringify(list).indexOf('staff note') < 0, 'list hides the other customer');
eq(!list.appts.some(a => a.staff || a.client_name), 'list has no staff and no client name field');
eq(list.hours && list.hours.open === 10 * 60 && list.hours.label.indexOf('10AM') >= 0, 'shop hours come from settings, not from other bookings');

const sent = sandbox.ptApptRequest_({ session: 'tok', type: 'fitting', day: '2026-10-22', start: '13:00', note: 'Size check' });
eq(sent.ok === true && sent.sent === true, 'free time is sent');
eq(Object.keys(sent).sort().join() === 'ok,sent', 'the customer answer is only that it was sent, keys ' + Object.keys(sent).join());
eq(rows[rows.length - 1].status === 'requested' && rows[rows.length - 1].source === 'portal' && rows[rows.length - 1].created_by === 'cust:cu-1', 'saved as requested from the portal');
eq(rows[rows.length - 1].event_id === '', 'no calendar event');
eq(posts.length === 1 && posts[0].indexOf('Elena Tan') >= 0 && posts[0].indexOf('From the customer portal') >= 0 && posts[0].indexOf('Ana') < 0, 'telegram heads-up is the portal path and names only this customer');
eq(bumps === 1, 'the write bumps the cache once');

const clash = sandbox.ptApptRequest_({ session: 'tok', type: 'fitting', day: '2026-10-22', start: '10:00', note: '' });
eq(clash.ok === false && clash.code === 'UNAVAILABLE' && clash.error.indexOf('Ana') < 0 && clash.error.indexOf('booked') < 0, 'a clash is one sentence with no other booking');
eq(rows.filter(r => r.created_by === 'cust:cu-1').length === 1, 'a clash is not saved');

const early = sandbox.ptApptRequest_({ session: 'tok', type: 'fitting', day: '2026-10-22', start: '08:00', note: '' });
eq(early.ok === false && early.code === 'UNAVAILABLE' && early.error === clash.error, 'outside shop hours uses the same sentence');

const sun = sandbox.ptApptRequest_({ session: 'tok', type: 'fitting', day: '2026-10-25', start: '11:00', note: '' });
eq(sun.ok === false && sun.code === 'UNAVAILABLE', 'a closed day is not saved');

sandbox.ptApptRequest_({ session: 'tok', type: 'repair', day: '2026-10-22', start: '14:00', note: 'second' });
sandbox.ptApptRequest_({ session: 'tok', type: 'appraisal', day: '2026-10-23', start: '14:00', note: 'third' });
const fourth = sandbox.ptApptRequest_({ session: 'tok', type: 'pickup', day: '2026-10-26', start: '11:00', note: 'fourth' });
eq(fourth.ok === false && fourth.code === 'LIMIT', 'a fourth open request is refused');
eq(rows.filter(r => r.created_by === 'cust:cu-1' && r.status === 'requested').length === 3, 'three open requests stay on file');

const again = sandbox.ptAppts_({ session: 'tok' });
eq(again.appts.length === 4, 'confirmed plus three of her own requests');
eq(again.appts.filter(a => a.status === 'requested').every(a => a.label === 'Requested, waiting for confirmation' && !a.time), 'waiting rows use the waiting phrase and hide a confirmed time');
eq(JSON.stringify(again).indexOf('Ana') < 0, 'her list still omits Ana');

const wrapped = sandbox.portalAction_({ action: 'portalApptRequest', session: 'tok', type: 'fitting', day: '2026-10-22', start: '13:00', note: 'again' });
eq(wrapped && wrapped.code === 'LIMIT' && JSON.stringify(wrapped).indexOf('Ana') < 0, 'the action name reaches portalAction_ and still hides other bookings');
eq(sandbox.PORTAL_ACTIONS.portalAppts === 1 && sandbox.PORTAL_ACTIONS.portalApptRequest === 1, 'both action names are registered');

sandbox.custSession_ = () => ({ c: { customer_id: 'cu-2', client_id: '', full_name: 'No Link', email: 'nolink@example.com', mobile: '09189999999', status: 'pending' } });
const none = sandbox.ptAppts_({ session: 'tok2' });
eq(none.appts.length === 0, 'an unlinked customer does not see Elena or Ana');

fs.writeFileSync('/tmp/Portal.patched.js', portal);
fs.writeFileSync('/tmp/my.checked.js', live(path.join(root, 'my/my.js')));

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('ok portal appointment requests');
