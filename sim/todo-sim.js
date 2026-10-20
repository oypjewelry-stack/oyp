/* Stubbed To do run. Fake Sheet rows, no network. Proves each area, role gates,
   the 5-day stuck rule, a Requested appointment, name-first labels, and that
   Done / Snooze / apptRequest are writes (absent from the read caches). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const TODAY = '2026-10-20';
const NOW = new Date('2026-10-20T10:30:00Z'); // 6:30 PM PHT
const fails = [];
function check(cond, msg, extra) {
  if (cond) return;
  fails.push(msg + (extra != null ? '\n    ' + extra : ''));
}
function texts(pack) { return (pack.items || []).map(it => it.text); }
function has(pack, re) { return texts(pack).some(t => re.test(t)); }
function one(pack, re) { return texts(pack).find(t => re.test(t)) || ''; }

const sheets = {
  Appointments: [
    { appt_id: 'ap-today', status: 'booked', start_at: '2026-10-20T14:00:00+08:00', end_at: '2026-10-20T15:00:00+08:00', type: 'fitting', staff: 's1', client_name: 'Maria Santos', jo: '26-288' },
    { appt_id: 'ap-tom', status: 'booked', start_at: '2026-10-21T10:00:00+08:00', end_at: '2026-10-21T11:00:00+08:00', type: 'pickup', staff: 's1', client_name: 'Otto Vila', jo: '' },
    { appt_id: 'ap-fri', status: 'booked', start_at: '2026-10-23T11:00:00+08:00', end_at: '2026-10-23T12:00:00+08:00', type: 'appraisal', staff: 's2', client_name: 'Pia Gomez', jo: '' },
    { appt_id: 'ap-free', status: 'requested', start_at: '2026-10-22T15:00:00+08:00', end_at: '2026-10-22T16:00:00+08:00', type: 'fitting', staff: 's2', client_name: 'Ana Ruiz', jo: '' },
    { appt_id: 'ap-clash', status: 'requested', start_at: '2026-10-20T14:00:00+08:00', end_at: '2026-10-20T15:00:00+08:00', type: 'fitting', staff: 's1', client_name: 'Bea Lim', jo: '' },
    { appt_id: 'ap-sun', status: 'requested', start_at: '2026-10-25T10:00:00+08:00', end_at: '2026-10-25T11:00:00+08:00', type: 'fitting', staff: 's2', client_name: 'Carlo Vega', jo: '' },
    { appt_id: 'ap-cx', status: 'cancelled', start_at: '2026-10-20T11:00:00+08:00', end_at: '2026-10-20T12:00:00+08:00', type: 'repair', staff: 's1', client_name: 'Nina Old', jo: '26-199' },
    { appt_id: 'ap-nostaff', status: 'requested', start_at: '2026-10-20T14:30:00+08:00', end_at: '2026-10-20T15:00:00+08:00', type: 'pickup', staff: '', client_name: 'No Staff', jo: '' },
    { appt_id: 'ap-free2', status: 'requested', start_at: '2026-10-22T11:00:00+08:00', end_at: '2026-10-22T12:00:00+08:00', type: 'pickup', staff: '', client_name: 'Free Person', jo: '' }
  ],
  Holidays: [],
  JobStages: [
    { jo: '26-287', status: 'doing', stage_code: 'stone_setting', started_at: '2026-10-14', target_date: '' },
    { jo: '26-266', status: 'doing', stage_code: 'pre_polish', started_at: '2026-10-15', target_date: '' },
    { jo: '26-265', status: 'doing', stage_code: 'pre_polish', started_at: '2026-10-16', target_date: '' },
    { jo: '26-220', status: 'doing', stage_code: 'stone_setting', started_at: '2026-10-18', target_date: '' },
    { jo: '26-201', status: 'doing', stage_code: 'approval', started_at: '2026-10-16', target_date: '' },
    { jo: '26-210', status: 'doing', stage_code: 'qc', started_at: '2026-10-18', target_date: '' },
    { jo: '26-301', status: 'doing', stage_code: 'design', started_at: '2026-10-19', target_date: '2026-10-18' },
    { jo: '26-302', status: 'doing', stage_code: 'casting', started_at: '2026-10-19', target_date: '' },
    { jo: '26-299', status: 'doing', stage_code: 'pickup', started_at: '2026-10-01', target_date: '' },
    { jo: '26-100', status: 'doing', stage_code: 'stone_setting', started_at: '2026-07-12', target_date: '' }
  ],
  Quotes: [
    { jo: '26-260', status: 'sent', version: 1, sent_at: '2026-10-15', client: 'Elena Tan', amount: 90000 },
    { jo: '26-261', status: 'sent', version: 1, sent_at: '2026-10-16', client: 'Too Soon', amount: 1000 },
    { jo: '26-262', status: 'sent', version: 1, sent_at: '2026-10-01', client: 'Replaced', amount: 1000 },
    { jo: '26-262', status: 'accepted', version: 2, sent_at: '2026-10-10', client: 'Replaced', amount: 1000 }
  ],
  Payments: [
    { pay_id: 'p-pend', status: 'pending', jo: '26-240', amount: 5000 },
    { pay_id: 'p-287', status: 'confirmed', jo: '26-287', amount: 10000 },
    { pay_id: 'p-266', status: 'confirmed', jo: '26-266', amount: 1000 },
    { pay_id: 'p-265', status: 'confirmed', jo: '26-265', amount: 1000 },
    { pay_id: 'p-220', status: 'confirmed', jo: '26-220', amount: 1000 },
    { pay_id: 'p-210', status: 'confirmed', jo: '26-210', amount: 1000 },
    { pay_id: 'p-302', status: 'confirmed', jo: '26-302', amount: 1000 },
    { pay_id: 'p-299', status: 'confirmed', jo: '26-299', amount: 5000 },
    { pay_id: 'p-250', status: 'confirmed', jo: '26-250', amount: 2000 }
  ],
  Materials: [
    { mat_id: 'grain-18k', name: '18k yellow casting grain', qty: 12, min_qty: 20, unit: 'g', active: 'true' },
    { mat_id: 'dead', name: 'Old wire', qty: 0, min_qty: 5, unit: 'g', active: 'false' }
  ],
  Rates: [{ code: 'gold', updated_at: '2026-10-17' }],
  PriceLog: [],
  ClientMessages: [
    { msg_id: 'm1', status: 'open', at: '2026-10-18T10:00:00Z' },
    { msg_id: 'm2', status: 'open', at: '2026-10-20T09:00:00Z' },
    { msg_id: 'm3', status: 'handled', at: '2026-10-01T00:00:00Z' }
  ],
  ShopItems: [
    { item_code: 'ring-a', status: 'listed', photo_file_ids: '' },
    { item_code: 'ring-b', status: 'listed', photo_file_ids: 'file1' }
  ],
  Reminders: [
    { reminder_id: 'rm-9', text: 'prod-stuck-26-287-setting-2026-10-14', status: 'done', chat_id: '99', snoozed_to: '', _row: 0 }
  ]
};

const jobs = [
  { jo: '26-287', status: 'in_progress', current_stage: 'stone_setting', due_date: '2026-10-28', client_name: 'Elena Tan', location: 'working', price: 80000 },
  { jo: '26-266', status: 'in_progress', current_stage: 'pre_polish', due_date: '2026-11-02', client_name: 'Liza Ong', location: 'working', price: 20000 },
  { jo: '26-265', status: 'in_progress', current_stage: 'pre_polish', due_date: '2026-11-02', client_name: 'Maria Santos', location: 'working', price: 15000 },
  { jo: '26-220', status: 'in_progress', current_stage: 'stone_setting', due_date: '2026-10-18', client_name: 'Paolo Reyes', location: 'working', price: 30000 },
  { jo: '26-201', status: 'in_progress', current_stage: 'approval', due_date: '2026-11-01', client_name: 'Mia Cruz', location: 'working', price: 40000 },
  { jo: '26-210', status: 'in_progress', current_stage: 'qc', due_date: '2026-11-01', client_name: 'Noah Lim', location: 'working', price: 25000 },
  { jo: '26-301', status: 'in_progress', current_stage: 'design', due_date: '2026-11-01', client_name: 'Ivy Tan', location: 'working', price: 18000 },
  { jo: '26-302', status: 'in_progress', current_stage: 'casting', due_date: '2026-11-05', prod_target: '2026-10-19', client_name: 'Ken Uy', location: 'working', price: 22000 },
  { jo: '26-299', status: 'in_progress', current_stage: 'pickup', due_date: '2026-11-01', client_name: 'Ready Cole', location: 'pickup', price: 5000 },
  { jo: '26-100', status: 'in_progress', current_stage: 'stone_setting', due_date: '', client_name: 'Vault Vera', location: 'vault', price: 99999 },
  { jo: '26-240', status: 'in_progress', current_stage: 'pickup', due_date: '2026-10-20', client_name: 'Ana Cruz', location: 'pickup', price: 45000 },
  { jo: '26-250', status: 'picked_up', current_stage: 'pickup', due_date: '2026-10-01', client_name: 'Owen Paz', location: 'sold', price: 12000 },
  { jo: '26-270', status: 'in_progress', current_stage: 'casting', due_date: '2026-11-08', client_name: 'Vera Santos', location: 'working', price: 80000 },
  { jo: '26-260', status: 'in_progress', current_stage: '', due_date: '', client_name: 'Elena Tan', location: 'vault', price: 90000 },
  { jo: '26-230', status: 'draft', review_state: 'draft', current_stage: '', client_name: 'Draft One', location: '' },
  { jo: '26-231', status: 'draft', review_state: 'draft', current_stage: '', client_name: 'Draft Two', location: '' },
  { jo: '26-280', status: 'in_progress', current_stage: '', due_date: '', client_name: 'Elena Tan', location: 'consigned', price: 0 }
];
const consignments = [
  { consignment_id: 'CS-261002-01', consignee: 'Ana R.', days_out: 18, overdue: 0, jo: '26-280', item_id: 'IT1' },
  { consignment_id: 'CS-short', consignee: 'New Shop', days_out: 10, overdue: 0, jo: '26-281', item_id: 'IT2' }
];

global.apptSheet_ = name => name === 'Reminders' || name === 'Appointments';
global.apptRowsOf_ = () => sheets.Reminders;
global.apptSet_ = (tab, row, obj) => Object.assign(sheets.Reminders[row], obj);
global.apptAppend_ = (tab, obj) => { obj._row = sheets.Reminders.length; sheets.Reminders.push(obj); };
global.withLock_ = fn => fn();
global.audit_ = () => {};
global.now_ = () => NOW.toISOString();

vm.runInThisContext(fs.readFileSync(path.join(root, 'paste/Todo.gs'), 'utf8'), { filename: 'paste/Todo.gs' });

function run(role, exec, can) {
  return dashTodo_({
    now: NOW, today: TODAY, role, exec: !!exec, can: can || {},
    jobs, clients: {}, consignments,
    read: name => sheets[name] || []
  });
}
const CAN = {
  admin: { payments: true, consign: true, sales: true, clients: true },
  production_manager: { payments: false, consign: true, sales: false, clients: true },
  accounting: { payments: true, consign: false, sales: false, clients: true },
  staff: { payments: false, consign: false, sales: false, clients: false }
};

const admin = run('admin', true, CAN.admin);
const pm = run('production_manager', false, CAN.production_manager);
const acct = run('accounting', false, CAN.accounting);
const staff = run('staff', false, CAN.staff);

const adminText = texts(admin).join('\n');
check(has(admin, /^Elena Tan · 26-287: stuck in Setting 6 days\.$/), 'admin stuck 6 days, name first (a non-td reminder with the same text does not hide it)', adminText);
check(has(admin, /^Liza Ong · 26-266: stuck in Polishing 5 days\.$/), 'admin stuck at exactly 5 days', adminText);
check(!has(admin, /26-265/), '4 days in a stage is not a bullet', adminText);
check(!has(admin, /stuck in Pickup/), 'pickup is not stuck', adminText);
check(!has(admin, /26-299/), 'a long pickup stage is not listed', adminText);
check(!has(admin, /[Vv]ault/), 'no vault line', adminText);
check(!has(admin, /26-100/), 'vault JO is not listed', adminText);
check(!/margin|SRP/i.test(adminText + texts(pm).join(' ') + texts(acct).join(' ') + texts(staff).join(' ')), 'no margin or SRP');
check(has(admin, /₱45,000/), 'admin sees the pickup balance', adminText);
check(has(admin, /₱10,000/), 'admin sees what picked-up jobs still owe', adminText);
check(!/₱/.test(texts(pm).join(' ')), 'production manager sees no pesos', texts(pm).join('\n'));
check(!/₱/.test(texts(acct).join(' ')), 'accounting sees no pesos', texts(acct).join('\n'));
check(!/₱/.test(texts(staff).join(' ')), 'staff see no pesos', texts(staff).join('\n'));
check(has(admin, /^Maria Santos · 26-288: fitting today 2:00 PM\.$/), 'booked visit today', adminText);
check(has(admin, /^Tomorrow: 1 appointment at 10:00 AM\.$/), 'tomorrow summary', adminText);
check(has(admin, /^1 more appointment this week, first Fri Oct 23 11:00 AM\.$/), 'rest of the week', adminText);
check(has(admin, /^Ana Ruiz: requested a fitting Thu Oct 22 3:00 PM\. The schedule is free\.$/), 'requested, schedule free', adminText);
check(has(admin, /^Bea Lim: requested a fitting today 2:00 PM\. That time is already booked\.$/), 'requested, already booked', adminText);
check(has(admin, /^Carlo Vega: requested a fitting Sun Oct 25 10:00 AM\. The store is closed then\.$/), 'requested, store closed', adminText);
check(!has(admin, /Nina Old/), 'cancelled visit is not a to-do', adminText);
check(has(admin, /^Paolo Reyes · 26-220: 2 days past promised date \(Setting\)\.$/), 'past promised date', adminText);
check(has(admin, /^Mia Cruz · 26-201: CAD awaiting client approval \(4 days\)\.$/), 'CAD approval', adminText);
check(has(admin, /^Noah Lim · 26-210: done and waiting for QC\.$/), 'QC', adminText);
check(has(admin, /^Ivy Tan · 26-301: Design was due Oct 18\.$/), 'step target date', adminText);
check(has(admin, /^Ken Uy · 26-302: target date was Oct 19\.$/), 'JO target date', adminText);
check(has(admin, /^2 scanned JOs waiting in To review\.$/), 'to review', adminText);
check(has(admin, /^1 payment to confirm\.$/), 'payment to confirm', adminText);
check(has(admin, /^Ana Cruz · 26-240: ready for pickup, ₱45,000 balance due\.$/), 'pickup balance line', adminText);
check(has(admin, /^Vera Santos · 26-270: at Casting with no deposit recorded\.$/), 'no deposit', adminText);
check(has(admin, /^1 picked-up job still owes ₱10,000\.$/), 'picked up still owes', adminText);
check(has(admin, /^Elena Tan · 26-260: quote sent 5 days ago, no approval yet\.$/), 'quote at 5 days', adminText);
check(!has(admin, /Too Soon|26-261/), 'quote at 4 days is quiet', adminText);
check(!has(admin, /Replaced|26-262/), 'an accepted later version is quiet', adminText);
check(has(admin, /^Elena Tan · 26-280: with consignee Ana R\. 18 days\.$/), 'consignment names the jewelry client, not the consignee', adminText);
check(!has(admin, /^Ana R\. ·/), 'the consignee is not in the client slot', adminText);
check(has(admin, /^No Staff: requested a pickup today 2:30 PM\. That time is already booked\.$/), 'a request with no staff flags any overlapping visit', adminText);
check(has(admin, /^Free Person: requested a pickup Thu Oct 22 11:00 AM\. The schedule is free\.$/), 'a request with no staff is free when nothing overlaps', adminText);
check(!has(admin, /CS-short|26-281/), 'consignment under 14 days is quiet', adminText);
check(has(admin, /^18k yellow casting grain below 20 g\.$/), 'low stock', adminText);
check(!has(admin, /Old wire/), 'inactive material is quiet', adminText);
check(has(admin, /^Gold rate not updated in 3 days\.$/), 'gold rate', adminText);
check(has(admin, /^1 client message unanswered over 24 h\.$/), 'client message', adminText);
check(has(admin, /^1 live Shop listing has no photo\.$/), 'shop photo', adminText);
check((admin.items.find(it => /no photo/.test(it.text)) || {}).bucket === 'idea', 'shop line is a suggestion');
check((admin.items.find(it => /no photo/.test(it.text)) || {}).sug === 1, 'shop line is marked as a suggestion');

const areas = items => [...new Set(items.map(it => it.area))].sort().join(',');
check(areas(pm.items).split(',').indexOf('pay') < 0 && areas(pm.items).split(',').indexOf('shop') < 0, 'PM has no payments and no shop', areas(pm.items));
check(has(pm, /Elena Tan · 26-287/), 'PM sees the stuck piece with the client name', texts(pm).join('\n'));
check(!has(pm, /no photo/), 'PM has no shop line');
check(areas(acct.items) === 'appt,pay,quote', 'accounting is appointments, payments, quotes', areas(acct.items));
check(has(acct, /ready for pickup, balance due/), 'accounting payment line has no amount', texts(acct).join('\n'));
check(!has(acct, /stuck in/), 'accounting has no production lines');
check(areas(staff.items) === 'prod', 'staff are production only', areas(staff.items) + '\n' + texts(staff).join('\n'));
check(has(staff, /^26-287: stuck in Setting 6 days\.$/), 'staff piece line has no client name', texts(staff).join('\n'));
check(!/Elena|Maria|Ana |Liza|Paolo|Mia |Noah|Ivy|Ken |Vera|Vault/.test(texts(staff).join(' ')), 'staff texts name nobody', texts(staff).join('\n'));

admin.items.filter(it => it.jo && / · \d{2}-\d{3}/.test(it.text)).forEach(it => {
  check(/^.+ · \d{2}-\d{3}/.test(it.text), 'name before JO: ' + it.text);
});

sheets.Reminders[0].text = 'call-maria';
const stuckId = (admin.items.find(it => /26-287: stuck/.test(it.text)) || {}).id;
check(stuckId === 'prod-stuck-26-287-setting-2026-10-14', 'episode id includes the stage and the since date', stuckId);
const done = todoDismiss_({ id: stuckId }, { username: 'admin' }, 'done');
check(done.ok === true && done.status === 'done', 'done writes a reminder', JSON.stringify(done));
const row = sheets.Reminders.find(r => r.text === stuckId);
check(row && String(row.reminder_id).indexOf('td-') === 0 && row.status === 'done' && row.chat_id === '' && row.pinged_at === 'skip', 'dismissal is not an open bot ping', JSON.stringify(row));
const afterDone = run('admin', true, CAN.admin);
check(!has(afterDone, /26-287: stuck/), 'done hides that episode', texts(afterDone).join('\n'));
sheets.JobStages.find(s => s.jo === '26-287').started_at = '2026-10-13';
const episode = run('admin', true, CAN.admin);
check(has(episode, /^Elena Tan · 26-287: stuck in Setting 7 days\.$/), 'a new since-date shows again', texts(episode).join('\n'));

const quoteId = (admin.items.find(it => /26-260: quote/.test(it.text)) || {}).id;
const snooze = todoDismiss_({ id: quoteId, until: '3d' }, { username: 'admin' }, 'snooze');
check(snooze.ok === true && snooze.status === 'snoozed' && snooze.until, 'snooze writes a until time', JSON.stringify(snooze));
check(!has(run('admin', true, CAN.admin), /26-260: quote/), 'snooze hides the line');
sheets.Reminders.find(r => r.text === quoteId).snoozed_to = '2026-10-19T00:00:00Z';
check(has(run('admin', true, CAN.admin), /26-260: quote sent 5 days/), 'after the snooze the line is back if the quote is still sent');
check(todoDismiss_({ id: 'x' }, { username: 'admin' }, 'done').ok === false, 'a short id is rejected');
check(todoDismiss_({ id: quoteId, until: 'nope' }, { username: 'admin' }, 'snooze').ok === false, 'an unknown snooze length is rejected');

const patch = fs.readFileSync(path.join(root, 'paste/Appointments.gs.patch.txt'), 'utf8');
const fn = patch.slice(patch.indexOf('function apptStartMin_'));
const reqRows = [];
const savedAppend = global.apptAppend_;
global.apptAppend_ = (tab, row) => { if (tab === 'Appointments') reqRows.push(row); else savedAppend(tab, row); };
global.APPT = { TAB: 'Appointments', MIN_MIN: { fitting: 60, pickup: 30, appraisal: 60, repair: 60 }, DEFAULT_MIN: 60 };
global.randHex_ = () => 'abc12345';
global.apptIso_ = (day, min) => day + 'T' + String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0') + ':00+08:00';
global.apptHm_ = v => { const p = String(v).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };
let parsedCmd = '';
global.apptParse_ = cmd => { parsedCmd = cmd; const name = String(cmd).trim().split(/\s+/).slice(0, 2).join(' '); return { name, day: '2026-10-22', start: 14 * 60, type: 'fitting', minutes: 60 }; };
global.apptToday_ = () => TODAY;
global.apptOut_ = x => x;
vm.runInThisContext(fn, { filename: 'Appointments.gs.patch.txt' });
const filed = apptRequest_({ day: '2026-10-22', start: '15:00', type: 'fitting', client: { name: 'Ana Ruiz' }, source: 'portal' }, { username: 'portal' });
check(filed.ok === true && filed.status === 'requested', 'apptRequest files a request', JSON.stringify(filed));
check(reqRows[0] && reqRows[0].status === 'requested' && reqRows[0].event_id === '' && reqRows[0].source === 'portal', 'request has no calendar event', JSON.stringify(reqRows[0]));
check(apptStartMin_('14:00') === 840 && apptStartMin_(840) === 840, 'start accepts a clock or minutes');
const bot = apptBotRequest_('request Ana Ruiz Thu 2pm', {}, 'tessa');
check(bot && bot[0] && /stays Requested/.test(bot[0].text), 'Tessa files a request', JSON.stringify(bot));
check(parsedCmd === 'Ana Ruiz Thu 2pm' && reqRows[reqRows.length - 1].client_name === 'Ana Ruiz', 'the leading request word is stripped before the name', parsedCmd + ' / ' + (reqRows[reqRows.length - 1] && reqRows[reqRows.length - 1].client_name));
check(/confirming = old && \(jobStr_\(old\.status\) \|\| 'booked'\) === 'requested'/.test(patch), 'confirming a request runs the outside-hours warning');
check(/!confirming && same && old && Number\(old\.minutes\) === minutes/.test(patch), 'an unchanged booked time is not asked again');

const closedEarly = dashTodo_({
  now: NOW, today: TODAY, role: 'admin', exec: true, can: CAN.admin, jobs: [], clients: {}, consignments: [],
  read: n => n === 'Settings' ? [{ key: 'store.open', value: '10:00' }, { key: 'store.close', value: '15:00' }, { key: 'store.days', value: '1,2,3,4,5' }]
    : n === 'Appointments' ? [{ appt_id: 'ap-early', status: 'requested', start_at: '2026-10-22T09:30:00+08:00', end_at: '2026-10-22T10:30:00+08:00', type: 'fitting', staff: 's2', client_name: 'Early Bird', jo: '' }]
    : []
});
check(has(closedEarly, /^Early Bird: requested a fitting Thu Oct 22 9:30 AM\. The store is closed then\.$/), 'store hours come from Settings', texts(closedEarly).join('\n'));
const openDefault = dashTodo_({
  now: NOW, today: TODAY, role: 'admin', exec: true, can: CAN.admin, jobs: [], clients: {}, consignments: [],
  read: n => n === 'Appointments' ? [{ appt_id: 'ap-early', status: 'requested', start_at: '2026-10-22T09:30:00+08:00', end_at: '2026-10-22T10:30:00+08:00', type: 'fitting', staff: 's2', client_name: 'Early Bird', jo: '' }] : []
});
check(has(openDefault, /The schedule is free\.$/), 'empty Settings falls back to 9:00–4:00', texts(openDefault).join('\n'));

const N = 500;
const bigJobs = [], bigStages = [], bigClients = [];
for (let i = 0; i < N; i++) {
  const jo = '26-' + String(1000 + i);
  const late = i < 8;
  bigJobs.push({ jo, status: 'in_progress', current_stage: 'stone_setting', due_date: late ? '2026-10-01' : '2026-11-20', client_id: 'c' + i, client_name: 'Client ' + i, location: 'working', price: 10000 });
  bigStages.push({ jo, status: 'doing', stage_code: 'stone_setting', started_at: late ? '2026-10-18' : (i % 3 === 0 ? '2026-10-01' : '2026-10-18'), target_date: '' });
  bigClients.push({ client_id: 'c' + i, name: 'Client ' + i });
}
const bigSheets = {
  JobOrders: bigJobs, JobStages: bigStages, Clients: bigClients, Appointments: sheets.Appointments, Holidays: [],
  Quotes: [], Payments: [], Materials: [], Rates: [], PriceLog: [], ClientMessages: [], ShopItems: [], Reminders: [],
  Consignment: [{ consignment_id: 'CS-261002-01', consignee: 'Ana R.', status: 'out', date_out: '2026-10-04', jo: '26-1000' }], Settings: []
};
const reads = {};
const t0 = process.hrtime.bigint();
const big = dashTodo_({
  now: NOW, today: TODAY, role: 'admin', exec: true, can: CAN.admin,
  read: name => { reads[name] = (reads[name] || 0) + 1; return bigSheets[name] || []; }
});
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
check(big.items.length === 60 && big.total > 60, 'payload is capped at 60 and total keeps the rest', big.items.length + ' of ' + big.total);
check(big.items[0].bucket === 'today' && big.items[0].late === 1, 'most urgent line is first', big.items[0] && big.items[0].text);
check(Object.keys(reads).every(k => reads[k] === 1), 'each tab is read once', JSON.stringify(reads));
check(big.items.some(it => /26-1000: with consignee Ana R\./.test(it.text)), 'sheet consignment uses the jewelry client');
const timing = { jo: N, ms: Math.round(ms * 10) / 10, tabs: reads, items: big.items.length, total: big.total, note: 'in-memory cache miss: the builder ran with no CacheService hit; sheet I/O is not included' };

['todoDone', 'todoSnooze', 'apptRequest'].forEach(action => {
  check(!new RegExp(action + '\\s*:').test(fs.readFileSync(path.join(root, 'app.js'), 'utf8')), action + ' is not a client read');
});
check(/todoList:\s*1/.test(fs.readFileSync(path.join(root, 'app.js'), 'utf8')), 'the client caches todoList');
function findBlocks(src) {
  const lines = src.split('\n'), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== 'FIND' && !/\bFIND$/.test(lines[i].trim())) continue;
    const buf = [];
    for (i++; i < lines.length; i++) {
      if (lines[i].trim() === 'REPLACE WITH' || lines[i].trim() === '') break;
      buf.push(lines[i]);
    }
    if (buf.length) blocks.push(buf.join('\n'));
  }
  return blocks;
}
const live = {
  'paste/Fast.gs.patch.txt': '/home/ubuntu/.cursor/projects/workspace/uploads/Fast.gs_c843.txt',
  'paste/DashCache.gs.patch.txt': '/home/ubuntu/.cursor/projects/workspace/uploads/DashCache.gs_1b65.txt',
  'paste/DashWarm.gs.patch.txt': '/home/ubuntu/.cursor/projects/workspace/uploads/DashWarm.gs_54d5.txt',
  'paste/Auth.gs.patch.txt': '/home/ubuntu/.cursor/projects/workspace/uploads/Auth.gs_a8cf.txt',
  'paste/Appointments.gs.patch.txt': '/home/ubuntu/.cursor/projects/workspace/uploads/Appointments.gs_6f55.txt'
};
Object.entries(live).forEach(([rel, abs]) => {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  const host = fs.readFileSync(abs, 'utf8');
  findBlocks(src).forEach(block => check(host.indexOf(block) >= 0, path.basename(rel) + ' FIND is in the live file', block.slice(0, 140)));
  ['todoDone', 'todoSnooze', 'apptRequest'].forEach(action => check(src.indexOf(action + ': 1') < 0, action + ' is not added to ' + path.basename(rel)));
});
['paste/Fast.gs.patch.txt', 'paste/DashCache.gs.patch.txt', 'paste/DashWarm.gs.patch.txt', 'paste/Auth.gs.patch.txt'].forEach(rel => {
  check(fs.readFileSync(path.join(root, rel), 'utf8').indexOf('todoList') >= 0, rel + ' names todoList');
});
const dashSrc = fs.readFileSync(path.join(root, 'dash.js'), 'utf8');
check(/SEC_ORDER = \['todo',/.test(dashSrc), 'To do is the first dashboard section');
check(dashSrc.indexOf("'todoDone'") >= 0 && dashSrc.indexOf("'todoSnooze'") >= 0, 'the card calls the write actions');
check(dashSrc.indexOf("call('todoList')") >= 0, 'the card loads todoList after paint');
check(dashSrc.indexOf('TODO_VIS = 8') >= 0 && dashSrc.indexOf('Show all (') >= 0, 'the card shows 8 lines and Show all');
check(dashSrc.indexOf('r.todo') < 0, 'the dashboard answer no longer carries To do');
const setup = fs.readFileSync(path.join(root, 'paste/SETUP.txt'), 'utf8');
check(/todoList/.test(setup) && /Customer-portal appointment requests are not wired/.test(setup), 'setup names todoList and leaves the portal for later');
check(!fs.existsSync(path.join(root, 'paste/Dashboard.gs.patch.txt')), 'Dashboard.gs is not patched');

const preview = {
  ok: true,
  generated_at: '2026-10-20T18:30:00+08:00',
  counts: { active_jobs: 8, pending_work: 4, pending_breakdown: { reviews: 2, past_due: 1, payments: 1 }, consigned_out: 1, overdue_consignments: 0, month_sales: 486300 },
  board: [
    { key: 'setting', label: 'Setting', count: 1, cards: [{ jo: '26-287', description: 'Emerald ring', client: 'Elena Tan', stage: 'stone_setting', due: '2026-10-28', late: 0, type: 'custom', review: 0 }] },
    { key: 'polishing', label: 'Polishing', count: 1, cards: [{ jo: '26-266', description: 'Band', client: 'Liza Ong', stage: 'pre_polish', due: '2026-11-02', late: 0, type: 'custom', review: 0 }] }
  ],
  can: { sales: true, consign: true, payments: true, prices: true, clients: true },
  sales: { month: '2026-10', months: [{ month: '2026-09', total: 210000 }, { month: '2026-10', total: 486300 }] },
  overdue_days: 30,
  consignments: consignments.filter(c => c.days_out >= 14),
  payments: [],
  missing: []
};
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out/admin.json'), JSON.stringify(preview));
fs.writeFileSync(path.join(__dirname, 'out/todo.json'), JSON.stringify({ ok: true, items: admin.items, total: admin.total }));
fs.writeFileSync(path.join(__dirname, 'out/todo-timing.json'), JSON.stringify(timing, null, 2));

if (fails.length) {
  console.error(fails.length + ' failed\n' + fails.join('\n'));
  process.exit(1);
}
console.log('ok ' + admin.items.length + ' admin lines, ' + pm.items.length + ' pm, ' + acct.items.length + ' accounting, ' + staff.items.length + ' staff');
console.log('todoList cache miss, ' + N + ' JOs: ' + timing.ms + ' ms, ' + big.total + ' lines, sent ' + big.items.length + ', tabs ' + Object.keys(reads).length);
texts(admin).forEach(t => console.log(' · ' + t));
