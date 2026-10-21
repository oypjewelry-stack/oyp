var TODO_AREAS = {
  admin: { appt: 1, prod: 1, pay: 1, quote: 1, cons: 1, stock: 1, msg: 1, shop: 1, rev: 1 },
  production_manager: { appt: 1, prod: 1, quote: 1, cons: 1, stock: 1, msg: 1, rev: 1 },
  accounting: { appt: 1, pay: 1, quote: 1 },
  staff: { prod: 1 }
};
var TODO_COL = [
  ['intake', 'Intake', ['intake', 'quote_deposit', 'receive_inspect', 'diagnose_quote', 'repair_intake', 'assess']],
  ['design', 'Design', ['design', 'approval', 'stone_sourcing', 'model']],
  ['casting', 'Casting', ['casting', 'bench', 'repair']],
  ['setting', 'Setting', ['stone_setting', 'stone_reset', 'engraving']],
  ['polishing', 'Polishing', ['pre_polish', 'final_polish', 'plating', 'clean_polish']],
  ['qc', 'QC', ['qc', 'photo', 'final_costing']],
  ['pickup', 'Pickup', ['notify', 'pickup']]
];
var TODO_HREF = { appt: '#/appts', prod: '#/production', pay: '#/payments', quote: '#/quotes', cons: '#/consignment', stock: '#/inventory', msg: '#dMsgs', shop: '#/shop', rev: '#/review' };
var TODO_TAG = { appt: 'Appointments', prod: 'Production', pay: 'Payments', quote: 'Quotes', cons: 'Consignment', stock: 'Stock', msg: 'Messages', shop: 'Shop', rev: 'To review' };

var TODO_MAX = 60; // lines sent to the card; the card shows 8 until Show all

function isTodoAction_(a) { return a === 'todoDone' || a === 'todoSnooze'; }

function handleTodo_(req, user) {
  if (!user) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (typeof DASH_ROLES !== 'undefined' && !DASH_ROLES[user.role]) return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  if (req.action === 'todoDone') return todoDismiss_(req, user, 'done');
  if (req.action === 'todoSnooze') return todoDismiss_(req, user, 'snooze');
  return { ok: false, error: 'Unknown action' };
}

/** Own read. The dashboard paints first; dash.js asks for this afterwards. Cached like dashboard (Fast.gs + DashCache.gs). */
function todoList_(req, user) {
  if (!user) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (typeof DASH_ROLES !== 'undefined' && !DASH_ROLES[user.role]) return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  var role = String(user.role || '');
  var can0 = DASH_ROLES[role], exec = typeof isExec_ === 'function' ? !!isExec_(user) : role === 'admin', can = {};
  Object.keys(can0).forEach(function (k) { can[k] = can0[k]; });
  can.prices = exec;
  var pack = dashTodo_({
    now: new Date(), role: role, exec: exec, can: can,
    read: function (name) {
      if (typeof dashRead_ !== 'function') return [];
      var rows = dashRead_(name, []); // private missing list: a gap here must not light the dashboard footer
      return Array.isArray(rows) ? rows : [];
    }
  });
  return { ok: true, items: pack.items, total: pack.total };
}

function dashTodo_(ctx) {
  ctx = ctx || {};
  var now = ctx.now instanceof Date ? ctx.now : new Date();
  var today = ctx.today || todoDay_(now);
  var role = String(ctx.role || 'staff');
  var areas = TODO_AREAS[role] || TODO_AREAS.staff;
  var money = !!ctx.exec;
  var can = ctx.can || {};
  var read = ctx.read || function (name) { return typeof dashRead_ === 'function' ? dashRead_(name, []) : []; };
  var memo = {}; // each tab is read once per build
  var take = function (name) { if (memo[name]) return memo[name]; try { var rows = read(name); return (memo[name] = Array.isArray(rows) ? rows : []); } catch (e) { return (memo[name] = []); } };
  var clients = ctx.clients;
  if (!clients) {
    clients = {};
    if (can.clients) take('Clients').forEach(function (c) { var id = String(c.client_id || ''); if (id) clients[id] = c; });
  }
  var jobs = Array.isArray(ctx.jobs) ? ctx.jobs : take('JobOrders');
  var hidden = todoHiddenMap_(take('Reminders'), now.getTime());
  var items = [];
  var push = function (it) { if (it && it.id && !hidden[it.id] && areas[it.area]) items.push(it); };
  if (areas.appt) todoAppts_(push, take, today, role);
  if (areas.prod || areas.rev) todoJobs_(push, jobs, take, clients, role, today, areas);
  if (areas.pay && can.payments !== false) todoPay_(push, jobs, take, clients, role, today, money);
  if (areas.quote) todoQuotes_(push, jobs, take, clients, role, today);
  if (areas.cons && can.consign !== false) todoCons_(push, take, jobs, clients, role, today, ctx.consignments);
  if (areas.stock) todoStock_(push, take, today);
  if (areas.msg) todoMsgs_(push, take, now.getTime());
  if (areas.shop) todoShop_(push, take);
  var rank = { today: 0, week: 1, idea: 2 };
  items.sort(function (a, b) { return (rank[a.bucket] - rank[b.bucket]) || ((b.late || 0) - (a.late || 0)) || String(a.text).localeCompare(String(b.text)); });
  var total = items.length;
  if (items.length > TODO_MAX) items = items.slice(0, TODO_MAX);
  return { items: items, total: total };
}

function todoAppts_(push, take, today, role) {
  var rows = take('Appointments'), hours = todoHours_(take), closed = todoClosed_(take('Holidays'));
  var booked = [], reqs = [], i, a;
  for (i = 0; i < rows.length; i++) {
    a = todoAppt_(rows[i]);
    if (!a) continue;
    if (a.status === 'booked') booked.push(a);
    else if (a.status === 'requested') reqs.push(a);
  }
  booked.forEach(function (v) {
    if (v.day !== today) return;
    push(todoItem_('appt-visit-' + v.id, 'appt', 'today', 0, 0, '', todoLine_(todoWho_(v.name, role), v.jo, todoType_(v.type).toLowerCase() + ' ' + todoWhen_(v.day, today, v.min) + '.'), TODO_HREF.appt, v.jo));
  });
  var tom = todoAdd_(today, 1), tomV = booked.filter(function (v) { return v.day === tom; }).sort(function (a, b) { return a.min - b.min; });
  if (tomV.length) {
    var word = tomV.length === 1 ? '1 appointment' : tomV.length + ' appointments';
    push(todoItem_('appt-tomorrow-' + tom, 'appt', 'week', 0, 0, '', 'Tomorrow: ' + word + (tomV.length === 1 ? ' at ' : ', first at ') + todoClock_(tomV[0].min) + '.', TODO_HREF.appt, ''));
  }
  var lateDay = todoAdd_(today, 6), rest = booked.filter(function (v) { return v.day > tom && v.day <= lateDay; }).sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : a.min - b.min; });
  if (rest.length) {
    push(todoItem_('appt-week-' + today, 'appt', 'week', 0, 0, '', rest.length + ' more appointment' + (rest.length === 1 ? '' : 's') + ' this week, first ' + todoWhen_(rest[0].day, today, rest[0].min) + '.', TODO_HREF.appt, ''));
  }
  reqs.forEach(function (v) {
    if (v.day < todoAdd_(today, -1) || v.day > todoAdd_(today, 14)) return;
    var fit = todoFit_(v, booked, hours, closed);
    var late = v.day < today ? 1 : 0;
    push(todoItem_('appt-req-' + v.id, 'appt', late || v.day <= today ? 'today' : 'week', late, 0, '', todoLine_(todoWho_(v.name, role), v.jo, 'requested a ' + todoType_(v.type).toLowerCase() + ' ' + todoWhen_(v.day, today, v.min) + '. ' + fit), TODO_HREF.appt, v.jo));
  });
}

function todoJobs_(push, jobs, take, clients, role, today, areas) {
  var stages = todoStageIndex_(take('JobStages'));
  var named = {}, qc = [], reviews = 0, i, j, jo, stg, days, due, col, who, since, stepDue, target;
  for (i = 0; i < jobs.length; i++) {
    j = jobs[i]; jo = todoJo_(j.jo); if (!jo) continue;
    if (String(j.status || '').toLowerCase() !== 'cancelled' && (String(j.review_state || '') === 'draft' || String(j.status || '').toLowerCase() === 'draft')) reviews++;
    if (!areas.prod || !todoMaking_(j)) continue;
    stg = stages[jo + '|' + String(j.current_stage || '')] || stages[jo] || {};
    since = stg.since || '';
    days = since ? todoDays_(since, today) : null;
    due = todoDay_(j.due_date);
    col = todoCol_(String(j.current_stage || ''));
    who = todoClient_(j, clients, role);
    stepDue = stg.target || '';
    target = todoDay_(j.prod_target);
    if (String(j.current_stage || '') === 'qc' && !(due && due < today)) qc.push({ jo: jo, who: who });
    if (due && due < today) {
      named[jo] = 1;
      push(todoItem_('prod-late-' + jo + '-' + due, 'prod', 'today', 1, 0, 'Late', todoLine_(who, jo, todoDayWord_(todoDays_(due, today)) + ' past promised date (' + col.label + ').'), '#/production', jo));
      continue;
    }
    if (stepDue && stepDue < today) {
      named[jo] = 1;
      push(todoItem_('prod-step-' + jo + '-' + stepDue, 'prod', 'today', 1, 0, 'Late', todoLine_(who, jo, col.label + ' was due ' + todoNice_(stepDue) + '.'), '#/production', jo));
      continue;
    }
    if (target && target < today && target !== due && col.key !== 'pickup') {
      named[jo] = 1;
      push(todoItem_('prod-target-' + jo + '-' + target, 'prod', 'today', 1, 0, 'Late', todoLine_(who, jo, 'target date was ' + todoNice_(target) + '.'), '#/production', jo));
      continue;
    }
    if (String(j.current_stage || '') === 'approval' && days != null && days >= 1) {
      named[jo] = 1;
      push(todoItem_('prod-approval-' + jo + '-' + since, 'prod', 'week', 0, 0, '', todoLine_(who, jo, 'CAD awaiting client approval (' + todoDayWord_(days) + ').'), '#/production', jo));
      continue;
    }
    if (days != null && days >= 5 && col.key !== 'pickup') {
      named[jo] = 1;
      push(todoItem_('prod-stuck-' + jo + '-' + col.key + '-' + since, 'prod', 'week', 0, 0, '', todoLine_(who, jo, 'stuck in ' + col.label + ' ' + todoDayWord_(days) + '.'), '#/production', jo));
    }
  }
  if (areas.prod) {
    qc = qc.filter(function (x) { return !named[x.jo]; });
    if (qc.length === 1) push(todoItem_('prod-qc-' + qc[0].jo, 'prod', 'week', 0, 0, '', todoLine_(qc[0].who, qc[0].jo, 'done and waiting for QC.'), '#/production', qc[0].jo));
    else if (qc.length) push(todoItem_('prod-qc-' + qc.map(function (x) { return x.jo; }).sort().join('-'), 'prod', 'week', 0, 0, '', qc.length + ' pieces done and waiting for QC.', '#/production', ''));
  }
  if (areas.rev && reviews) push(todoItem_('rev-draft-' + reviews, 'rev', 'today', 0, 0, '', reviews + ' scanned JO' + (reviews === 1 ? '' : 's') + ' waiting in To review.', '#/review', ''));
}

function todoPay_(push, jobs, take, clients, role, today, money) {
  var B = todoBalances_(jobs, take), pend = 0, picked = [], owe = 0, nodep = 0, i, j, jo, who, bal, col, pays = take('Payments');
  for (i = 0; i < pays.length; i++) if (String(pays[i].pay_id || '') !== '' && String(pays[i].status || '') === 'pending') pend++;
  if (pend) push(todoItem_('pay-confirm-' + pend, 'pay', 'today', 0, 0, '', pend + ' payment' + (pend === 1 ? '' : 's') + ' to confirm.', '#/payments', ''));
  for (i = 0; i < jobs.length; i++) {
    j = jobs[i]; jo = todoJo_(j.jo); if (!jo) continue;
    if (String(j.status || '').toLowerCase() === 'cancelled') continue;
    who = todoClient_(j, clients, role);
    bal = todoBal_(jo, B);
    col = todoCol_(String(j.current_stage || ''));
    var loc = String(j.location || '').toLowerCase();
    var pickedUp = String(j.status || '').toLowerCase() === 'picked_up' || loc === 'sold';
    if (pickedUp && bal != null && bal > 0.5) { picked.push(jo); owe += bal; continue; }
    if (!todoMaking_(j)) continue;
    var atPickup = loc === 'pickup' || col.key === 'pickup' || String(j.status || '').toLowerCase() === 'done';
    if (atPickup && bal != null && bal > 0.5) {
      push(todoItem_('pay-due-' + jo, 'pay', 'today', 0, 0, '', todoLine_(who, jo, 'ready for pickup, ' + (money ? todoPeso_(bal) + ' ' : '') + 'balance due.'), '#/payments', jo));
      continue;
    }
    if (!atPickup && nodep < 6 && (col.key === 'casting' || col.key === 'setting' || col.key === 'polishing' || col.key === 'qc') && !(B.paid[jo] > 0)) {
      nodep++;
      push(todoItem_('pay-nodeposit-' + jo, 'pay', 'week', 0, 0, '', todoLine_(who, jo, 'at ' + col.label + ' with no deposit recorded.'), '#/payments', jo));
    }
  }
  if (picked.length) {
    picked.sort();
    push(todoItem_('pay-picked-' + picked.join('-'), 'pay', 'week', 0, 0, '', picked.length + ' picked-up job' + (picked.length === 1 ? '' : 's') + ' still owe' + (picked.length === 1 ? 's' : '') + (money ? ' ' + todoPeso_(owe) : ' a balance') + '.', '#/payments', picked.length === 1 ? picked[0] : ''));
  }
}

function todoQuotes_(push, jobs, take, clients, role, today) {
  var rows = take('Quotes'), accepted = {}, sent = {}, i, q, jo, st, ver, at, days, who, jobBy = {};
  for (i = 0; i < jobs.length; i++) jobBy[todoJo_(jobs[i].jo)] = jobs[i];
  for (i = 0; i < rows.length; i++) {
    q = rows[i]; jo = todoJo_(q.jo); if (!jo) continue;
    st = String(q.status || '').toLowerCase(); ver = Number(q.version) || 0;
    if (st === 'accepted') { if (!accepted[jo] || ver >= accepted[jo]) accepted[jo] = ver; }
    if (st === 'sent') {
      at = todoDay_(q.sent_at || q.updated_at || q.created_at);
      if (!sent[jo] || ver >= sent[jo].ver) sent[jo] = { ver: ver, at: at, client: String(q.client || q.client_name || '') };
    }
  }
  Object.keys(sent).forEach(function (id) {
    if (accepted[id] && accepted[id] >= sent[id].ver) return;
    if (!sent[id].at) return;
    days = todoDays_(sent[id].at, today);
    if (!(days >= 5)) return;
    who = sent[id].client;
    if (!who && jobBy[id]) who = todoClient_(jobBy[id], clients, role);
    else who = todoWho_(who, role);
    push(todoItem_('quote-sent-' + id + '-v' + sent[id].ver, 'quote', 'week', 0, 0, '', todoLine_(who, id, 'quote sent ' + todoDayWord_(days) + ' ago, no approval yet.'), '#/quotes', id));
  });
}

function todoCons_(push, take, jobs, clients, role, today, preset) {
  var rows = Array.isArray(preset) ? preset : take('Consignment');
  var jobBy = {}, i, jid;
  for (i = 0; i < (jobs || []).length; i++) { jid = todoJo_(jobs[i].jo); if (jid) jobBy[jid] = jobs[i]; }
  var g = {}, r, id, slot, days, jo, late, st, dout, client;
  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    if (r.days_out == null) {
      st = String(r.status || '').trim().toLowerCase();
      if (st && st !== 'consigned' && st !== 'open' && st !== 'out') continue;
      dout = todoDay_(r.date_out);
      days = dout ? todoDays_(dout, today) : null;
      var due = todoDay_(r.due_back || r.due_date);
      late = due && today > due ? 1 : 0;
    } else {
      days = r.days_out;
      late = r.overdue ? 1 : 0;
    }
    if (days == null || !(Number(days) >= 14)) continue;
    id = String(r.consignment_id || r.item_id || '');
    if (!id) continue;
    jo = todoJo_(r.jo);
    slot = g[id] || (g[id] = { id: id, shop: role === 'staff' ? '' : String(r.consignee_name || r.consignee || ''), days: Number(days), n: 0, late: 0, jo: '', jos: 0, client: '', mixed: 0 });
    slot.n++;
    if (Number(days) > slot.days) slot.days = Number(days);
    if (late) slot.late = 1;
    if (jo) { slot.jos++; if (!slot.jo) slot.jo = jo; else if (slot.jo !== jo) slot.jo = ''; }
    if (!slot.shop && role !== 'staff') slot.shop = String(r.consignee_name || r.consignee || '');
    client = jo && jobBy[jo] ? todoClient_(jobBy[jo], clients, role) : todoWho_(r.client || '', role);
    if (client) { if (!slot.client) slot.client = client; else if (slot.client !== client) slot.mixed = 1; }
  }
  Object.keys(g).forEach(function (k) {
    var s = g[k], name = s.mixed ? '' : s.client, ref = s.n === 1 && s.jo ? s.jo : s.id;
    var rest = (s.shop ? 'with consignee ' + s.shop + ' ' : 'out ') + todoDayWord_(s.days) + (s.n > 1 ? ', ' + s.n + ' pieces' : '') + '.';
    push(todoItem_('cons-out-' + s.id, 'cons', s.late ? 'today' : 'week', s.late, 0, s.late ? 'Late' : '', todoLine_(name, ref, rest), '#/consignment', s.n === 1 ? (s.jo || '') : ''));
  });
}

function todoStock_(push, take, today) {
  var rows = take('Materials'), i, m, qty, min, name, unit, active;
  for (i = 0; i < rows.length; i++) {
    m = rows[i];
    active = String(m.active == null ? 'true' : m.active).toLowerCase();
    if (active === 'false' || active === '0') continue;
    qty = todoNum_(m.qty != null ? m.qty : m.quantity);
    min = todoNum_(m.min_qty != null ? m.min_qty : m.min);
    if (qty == null || min == null || !(qty <= min)) continue;
    name = String(m.name || m.material || 'Stock').trim();
    unit = String(m.unit || '').trim();
    push(todoItem_('stock-low-' + String(m.mat_id || name).replace(/\s+/g, '-') + '-' + qty, 'stock', 'today', 0, 0, '', name + ' below ' + todoQty_(min) + (unit ? ' ' + unit : '') + '.', '#/inventory', ''));
  }
  var rates = take('Rates').concat(take('PriceLog')), best = '', stamp = '', ri, code, day;
  for (ri = 0; ri < rates.length; ri++) {
    code = String(rates[ri].code || rates[ri].rate_code || rates[ri].name || rates[ri].material || '').toLowerCase();
    if (!/gold|xau|^au$/.test(code)) continue;
    day = todoDay_(rates[ri].updated_at || rates[ri].as_of || rates[ri].changed_at || rates[ri].at || rates[ri].date);
    if (day && (!best || day > best)) { best = day; stamp = day; }
  }
  if (stamp && todoDays_(stamp, today) >= 2) push(todoItem_('stock-gold-' + stamp, 'stock', 'week', 0, 0, '', 'Gold rate not updated in ' + todoDayWord_(todoDays_(stamp, today)) + '.', '#/prices', ''));
}

function todoMsgs_(push, take, nowMs) {
  var rows = take('ClientMessages'), open = [], i, r, at, st;
  for (i = 0; i < rows.length; i++) {
    r = rows[i]; st = String(r.status || 'open').toLowerCase();
    if (st && st !== 'open' && st !== 'new') continue;
    at = Date.parse(r.at || r.created_at || r.sent_at || '');
    if (!(at > 0) || nowMs - at < 24 * 36e5) continue;
    open.push(String(r.msg_id || r.message_id || r.id || i));
  }
  if (!open.length) return;
  open.sort();
  push(todoItem_('msg-wait-' + open.join('-'), 'msg', 'today', 0, 0, '', open.length + ' client message' + (open.length === 1 ? '' : 's') + ' unanswered over 24 h.', '#dMsgs', ''));
}

function todoShop_(push, take) {
  var rows = take('ShopItems'); if (!rows.length) rows = take('Shop');
  var bare = [], i, r, st, photo;
  for (i = 0; i < rows.length; i++) {
    r = rows[i]; st = String(r.status || '').toLowerCase();
    if (st !== 'listed' && st !== 'live' && st !== 'active') continue;
    photo = String(r.photo_file_ids || r.photo || r.photos || r.image || '').trim();
    if (photo) continue;
    bare.push(String(r.item_code || r.slug || r.title || i));
  }
  if (!bare.length) return;
  bare.sort();
  push(todoItem_('shop-nophoto-' + bare.join('-'), 'shop', 'idea', 0, 1, '', bare.length + ' live Shop listing' + (bare.length === 1 ? ' has' : 's have') + ' no photo.', '#/shop', ''));
}

function todoItem_(id, area, bucket, late, sug, flag, text, href, jo) {
  jo = jo || '';
  return { id: id, area: area, bucket: bucket, late: late ? 1 : 0, sug: sug ? 1 : 0, tag: TODO_TAG[area] || area, flag: flag || '', text: text, href: href || TODO_HREF[area] || '#/dashboard', jo: jo, open: jo ? 'Open ' + jo : '' };
}
function todoHiddenMap_(rows, nowMs) {
  var map = {}, i, r, id, st, until;
  for (i = 0; i < rows.length; i++) {
    r = rows[i];
    if (String(r.reminder_id || '').indexOf('td-') !== 0) continue;
    id = String(r.text || ''); st = String(r.status || '');
    if (st === 'done' && id) map[id] = 1;
    if (st === 'snoozed' && id) { until = Date.parse(r.snoozed_to || ''); if (until > nowMs) map[id] = 1; }
  }
  return map;
}
function todoDismiss_(req, user, kind) {
  var id = String(req.id || '').trim();
  if (!/^[\w.-]{3,120}$/.test(id)) return { ok: false, error: 'Unknown item' };
  if (typeof apptSheet_ !== 'function' || !apptSheet_('Reminders')) return { ok: false, error: 'Reminders are not set up yet. Run setupAppointments once.' };
  var until = kind === 'snooze' ? todoUntil_(String(req.until || '')) : '';
  if (kind === 'snooze' && !until) return { ok: false, error: 'Pick tomorrow, 3 days, or 1 week' };
  var rid = 'td-' + id.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 70);
  var rows = apptRowsOf_('Reminders'), hit = null, i;
  for (i = 0; i < rows.length; i++) if (String(rows[i].reminder_id) === rid || String(rows[i].text) === id) { hit = rows[i]; break; }
  var t = typeof now_ === 'function' ? now_() : new Date().toISOString();
  var obj = kind === 'done'
    ? { status: 'done', text: id, done_at: t, done_by: user.username, snoozed_to: '', pinged_at: 'skip' }
    : { status: 'snoozed', text: id, snoozed_to: until, pinged_at: 'skip', done_at: '', done_by: '' };
  var run = function () {
    if (hit) apptSet_('Reminders', hit._row, obj);
    else apptAppend_('Reminders', { reminder_id: rid, due_at: t, text: id, for_user: '', chat_id: '', status: obj.status, pinged_at: obj.pinged_at, snoozed_to: obj.snoozed_to || '', created_at: t, created_by: user.username, done_at: obj.done_at || '', done_by: obj.done_by || '' });
  };
  if (typeof withLock_ === 'function') withLock_(run); else run();
  if (typeof audit_ === 'function') audit_(user.username, kind === 'done' ? 'todoDone' : 'todoSnooze', id, req.device_id || '', kind === 'done' ? 'done' : until);
  return { ok: true, id: id, status: obj.status, until: until };
}
function todoUntil_(spec) {
  var now = new Date(), manila = new Date(now.getTime() + 8 * 36e5), day = manila.toISOString().slice(0, 10);
  if (spec === 'tomorrow') return todoAdd_(day, 1) + 'T08:00:00+08:00';
  if (spec === '3d') return new Date(now.getTime() + 3 * 864e5).toISOString();
  if (spec === '7d') return new Date(now.getTime() + 7 * 864e5).toISOString();
  return '';
}
function todoStageIndex_(rows) {
  var out = {}, i, r, jo, code, since, target, cur;
  for (i = 0; i < rows.length; i++) {
    r = rows[i]; if (String(r.status || '') !== 'doing') continue;
    jo = todoJo_(r.jo); code = String(r.stage_code || r.stage || ''); if (!jo) continue;
    since = todoDay_(r.started_at); target = todoDay_(r.target_date);
    var slot = out[jo + '|' + code];
    if (!slot || (since && (!slot.since || since >= slot.since))) out[jo + '|' + code] = { code: code, since: since, target: target };
    cur = out[jo];
    if (!cur || (since && (!cur.since || since >= cur.since))) out[jo] = { code: code, since: since, target: target };
  }
  return out;
}
function todoBalances_(jobs, take) {
  var pays = take('Payments'), quotes = take('Quotes'), paid = {}, price = {}, i, p, q, jo, st, ver, amt;
  for (i = 0; i < quotes.length; i++) {
    q = quotes[i]; jo = todoJo_(q.jo); if (!jo) continue;
    if (String(q.status || '').toLowerCase() !== 'accepted') continue;
    amt = todoNum_(q.amount); ver = Number(q.version) || 0;
    if (amt == null) continue;
    if (!price[jo] || ver >= price[jo].ver) price[jo] = { ver: ver, amt: amt };
  }
  for (i = 0; i < jobs.length; i++) {
    jo = todoJo_(jobs[i].jo); if (!jo || price[jo]) continue;
    amt = todoNum_(jobs[i].price != null && jobs[i].price !== '' ? jobs[i].price : jobs[i].total);
    if (amt != null) price[jo] = { ver: 0, amt: amt };
  }
  for (i = 0; i < pays.length; i++) {
    p = pays[i]; if (String(p.status || '') !== 'confirmed') continue;
    jo = todoJo_(p.jo); if (!jo) continue;
    paid[jo] = Math.round(((paid[jo] || 0) + (todoNum_(p.amount) || 0)) * 100) / 100;
  }
  return { paid: paid, price: price };
}
function todoBal_(jo, B) { if (!B.price[jo]) return null; return Math.round((B.price[jo].amt - (B.paid[jo] || 0)) * 100) / 100; }
function todoMaking_(j) {
  var st = String(j.status || '').toLowerCase(), loc = String(j.location || '').toLowerCase();
  if (st === 'cancelled' || st === 'picked_up') return false;
  if (loc === 'sold' || loc === 'archived' || loc === 'vault' || loc === 'showroom' || loc === 'consigned') return false;
  return true;
}
function todoCol_(code) {
  var i, c; for (i = 0; i < TODO_COL.length; i++) { c = TODO_COL[i]; if (c[2].indexOf(code) >= 0) return { key: c[0], label: c[1] }; }
  return { key: 'intake', label: 'Intake' };
}
function todoAppt_(r) {
  var st = String(r.status || 'booked').toLowerCase();
  if (st !== 'booked' && st !== 'requested') return null;
  var raw = r.start_at, ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw || ''));
  if (!(ms > 0)) return null;
  var local = new Date(ms + 8 * 36e5), end = r.end_at, ems = end instanceof Date ? end.getTime() : Date.parse(String(end || ''));
  var minutes = ems > ms ? Math.round((ems - ms) / 6e4) : (Number(r.minutes) || 60);
  return { id: String(r.appt_id || ms), status: st, day: local.toISOString().slice(0, 10), min: local.getUTCHours() * 60 + local.getUTCMinutes(), minutes: minutes, type: String(r.type || 'fitting'), staff: String(r.staff || ''), name: String(r.client_name || ''), jo: todoJo_(r.jo) };
}
function todoHm_(v) {
  var m = String(v == null ? '' : v).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  var h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function todoHours_(take) {
  var open = 9 * 60, close = 16 * 60, days = [1, 2, 3, 4, 5];
  if (typeof APPT !== 'undefined' && APPT) {
    if (APPT.OPEN_MIN) open = APPT.OPEN_MIN;
    if (APPT.CLOSE_MIN) close = APPT.CLOSE_MIN;
    if (APPT.DAYS && APPT.DAYS.length) days = APPT.DAYS.slice();
  }
  var rows = take ? take('Settings') : [], map = {}, i, k, d;
  for (i = 0; i < rows.length; i++) { k = String(rows[i].key || '').trim(); if (k && String(rows[i].value == null ? '' : rows[i].value).trim() !== '') map[k] = rows[i].value; }
  var o = todoHm_(map['store.open']), c = todoHm_(map['store.close']);
  if (o != null) open = o;
  if (c != null) close = c;
  if (map['store.days'] != null) {
    d = [];
    String(map['store.days']).split(',').forEach(function (x) { x = String(x).trim(); if (/^\d$/.test(x)) d.push(Number(x)); });
    if (d.length) days = d;
  }
  return { open: open, close: close, days: days };
}
function todoClosed_(rows) {
  var map = {}, i, day, st;
  for (i = 0; i < rows.length; i++) {
    day = todoDay_(rows[i].day); st = String(rows[i].status || '').toLowerCase();
    if (day && st === 'closed') map[day] = 1;
    if (day && st === 'open') map[day] = 0;
  }
  return map;
}
function todoFit_(v, booked, hours, closed) {
  var dow = new Date(v.day + 'T00:00:00Z').getUTCDay();
  var outside = closed[v.day] || hours.days.indexOf(dow) < 0 || v.min < hours.open || v.min + v.minutes > hours.close;
  var hit = function (b) { return b.day === v.day && b.min < v.min + v.minutes && v.min < b.min + b.minutes; };
  var clash = String(v.staff || '')
    ? booked.some(function (b) { return hit(b) && b.staff === v.staff && b.type === v.type; })
    : booked.some(hit); // no staff named: any booked visit on that time
  if (clash) return 'That time is already booked.';
  if (outside) return 'The store is closed then.';
  return 'The schedule is free.';
}
function todoClient_(j, clients, role) {
  if (role === 'staff') return '';
  var id = String(j.client_id || ''), rec = clients && clients[id];
  if (rec && rec.name) return String(rec.name).trim();
  return String(j.client_name || j.client || '').trim();
}
function todoWho_(name, role) { return role === 'staff' ? '' : String(name || '').trim(); }
function todoLine_(name, ref, rest) {
  var p = todoPiece_(name, ref);
  return p ? p + ': ' + rest : rest;
}
function todoPiece_(name, ref) {
  name = String(name || '').trim(); ref = String(ref || '').trim();
  if (name && ref) return name + ' · ' + ref;
  return name || ref;
}
function todoJo_(v) {
  if (v == null || v === '') return '';
  if (typeof jobKey_ === 'function') { try { var k = jobKey_(v); if (k) return String(k); } catch (e) {} }
  return String(v).trim();
}
function todoDay_(d) {
  if (d === '' || d == null) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.trim())) return d.trim().slice(0, 10);
  var x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return new Date(x.getTime() + 8 * 36e5).toISOString().slice(0, 10);
}
function todoDays_(a, b) { if (!a || !b) return null; return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
function todoAdd_(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function todoDow_(day) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day + 'T00:00:00Z').getUTCDay()]; }
function todoMon_(day) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(day.slice(5, 7)) - 1]; }
function todoNice_(day) { return todoMon_(day) + ' ' + Number(day.slice(8)); }
function todoWhen_(day, today, min) {
  var when = day === today ? 'today' : day === todoAdd_(today, 1) ? 'tomorrow' : todoDow_(day) + ' ' + todoNice_(day);
  return when + ' ' + todoClock_(min);
}
function todoClock_(min) { var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap; }
function todoType_(t) { var map = { fitting: 'Fitting', pickup: 'Pickup', appraisal: 'Appraisal', repair: 'Repair' }; return map[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Visit'); }
function todoNum_(v) { if (v == null || String(v).trim() === '') return null; var n = Number(String(v).replace(/[₱,\s]/g, '').replace(/php/ig, '')); return isFinite(n) ? n : null; }
function todoQty_(n) { var s = String(Math.round(n * 100) / 100); return s.replace(/\.0$/, ''); }
function todoPeso_(n) { return '₱' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function todoDayWord_(n) { n = Number(n) || 0; return n + ' day' + (n === 1 ? '' : 's'); }
