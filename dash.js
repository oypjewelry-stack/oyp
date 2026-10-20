/* OYP back office: business dashboard (#/dashboard). Data comes from the 'dashboard' action (Dashboard.gs),
   which already strips what the signed-in role may not see; this file only draws what it gets. */
(() => {
'use strict';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = n => '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
const short = n => { n = Number(n) || 0; return n >= 1e6 ? '₱' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? '₱' + Math.round(n / 1e3) + 'k' : peso(n); };
const day = d => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return MON[m - 1] + ' ' + dd; };
const monthName = k => MON[Number(k.slice(5, 7)) - 1];
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
// What a stage code means on the bench (staff wording). Unknown codes fall back to the code with spaces.
const STAGE = { intake: 'Intake', quote_deposit: 'Quote & deposit', receive_inspect: 'Receive & inspect', diagnose_quote: 'Diagnose & quote', repair_intake: 'Repair intake',
  assess: 'Assessing', design: 'Design', approval: 'Waiting for approval', stone_sourcing: 'Sourcing stones', model: 'Model / wax', casting: 'Casting', bench: 'Bench work',
  repair: 'Repair work', stone_setting: 'Stone setting', stone_reset: 'Stone reset', engraving: 'Engraving', pre_polish: 'Pre-polish', final_polish: 'Final polish',
  plating: 'Plating', clean_polish: 'Clean & polish', qc: 'Quality check', photo: 'Product photo', final_costing: 'Final costing', notify: 'Client notified', pickup: 'Waiting for pickup' };
const stageLabel = c => STAGE[c] || (c ? String(c).replace(/_/g, ' ') : 'Not started');
const ago = d => { if (!d) return ''; const n = Math.round((Date.now() - Date.parse(d + 'T00:00:00+08:00')) / 864e5); return n <= 0 ? 'today' : plural(n, 'day'); };
// Drill-downs: #/dashboard/<kind>/<key>. The dashboard response is kept so a list opens without reloading;
// per-JO lists that the dashboard does not carry (locations, sales, pending, consigned JOs) come once from dashDrill (DashboardDrill.gs).
const D = { r: null, cc: null, x: null, at: 0, user: null, ordOn: false };
// Section order on this device, per signed-in name. Empty = today's order. Design settings are the shared look, not a per-person preference, so this stays in localStorage.
const SEC_ORDER = ['msgs', 'loc', 'sales', 'board', 'consign', 'pay', 'inq'];
const ordKey = u => 'oypDashOrder:' + (u && u.username || 'device');
function readOrder(u) {
  try { const a = JSON.parse(localStorage.getItem(ordKey(u)) || 'null'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && SEC_ORDER.includes(x)) : null; }
  catch (e) { return null; }
}
function writeOrder(u, ids) {
  const present = ids.filter(id => SEC_ORDER.includes(id));
  const def = SEC_ORDER.filter(id => present.includes(id));
  try { if (!present.length || present.join() === def.join()) localStorage.removeItem(ordKey(u)); else localStorage.setItem(ordKey(u), JSON.stringify(present)); } catch (e) {}
}
function arrangeList(canon, ids, saved) { // saved null = canon order. An id that appears later slots in where it sits in canon.
  const present = new Set(ids), extra = ids.filter(id => canon.indexOf(id) < 0);
  if (!saved || !saved.length) return canon.filter(id => present.has(id)).concat(extra);
  const out = [];
  saved.forEach(id => { if (present.has(id) && out.indexOf(id) < 0) out.push(id); });
  canon.forEach((id, i) => {
    if (!present.has(id) || out.indexOf(id) >= 0) return;
    let at = out.length;
    for (let j = i + 1; j < canon.length; j++) { const k = out.indexOf(canon[j]); if (k >= 0) { at = k; break; } }
    out.splice(at, 0, id);
  });
  extra.forEach(id => { if (out.indexOf(id) < 0) out.push(id); });
  return out;
}
function arrange(ids, saved) { return arrangeList(SEC_ORDER, ids, saved); }
// Location tiles: order and hidden names on this device, per signed-in name. Empty = the row the server sends.
const locStoreKey = u => 'oypDashLoc:' + (u && u.username || 'device');
function locCanon(list) { // today's row: every place except "no location yet", then that one at the end when it has a count
  const keys = [];
  (list || []).forEach(l => { if (l && l.key && l.key !== 'unset' && keys.indexOf(l.key) < 0) keys.push(l.key); });
  const unset = (list || []).find(l => l && l.key === 'unset');
  if (unset && unset.count) keys.push('unset');
  return keys;
}
function readLocPref(u) {
  try {
    const o = JSON.parse(localStorage.getItem(locStoreKey(u)) || 'null');
    if (!o || typeof o !== 'object') return null;
    return {
      order: Array.isArray(o.order) ? o.order.filter(x => typeof x === 'string') : [],
      hide: Array.isArray(o.hide) ? o.hide.filter(x => typeof x === 'string') : []
    };
  } catch (e) { return null; }
}
function writeLocPref(u, order, hide, canon) {
  const ord = [], h = [];
  order.forEach(k => { if (ord.indexOf(k) < 0) ord.push(k); });
  hide.forEach(k => { if (h.indexOf(k) < 0) h.push(k); });
  try {
    if (ord.join() === canon.join() && !h.length) localStorage.removeItem(locStoreKey(u));
    else localStorage.setItem(locStoreKey(u), JSON.stringify({ order: ord, hide: h }));
  } catch (e) {}
}
function loadLoc(list, u) {
  const canon = locCanon(list), byKey = {};
  (list || []).forEach(l => { if (l && l.key) byKey[l.key] = l; });
  let order = canon.slice(); const hide = new Set();
  if (D.ordOn) {
    const p = readLocPref(u);
    if (p) { order = arrangeList(canon, canon, p.order); p.hide.forEach(k => { if (canon.indexOf(k) >= 0) hide.add(k); }); }
  }
  D.loc = { canon: canon, order: order, hide: hide, byKey: byKey };
}
function locName(l) { return l.key === 'unset' ? 'No location yet' : (l.label || l.key); }
function locTile(esc, l, on) {
  const arch = l.key === 'archived', unset = l.key === 'unset', name = locName(l);
  const cls = 'lc tap' + (l.key === 'working' ? ' cur' : '') + (arch ? ' arch' : '') + (unset ? ' gold' : '');
  const href = unset ? '#/review' : '#/dashboard/loc/' + esc(l.key);
  const title = arch ? ' title="JO on record, no physical piece · not counted as on hand"' : '';
  const link = `<a class="${cls}" href="${href}"${title}><b>${l.count}</b><span class="lab">${esc(name)} ›</span></a>`;
  if (!on) return link;
  const n = esc(name);
  return `<div class="lctile" data-lkey="${esc(l.key)}">${link}<span class="lcord"><button type="button" class="dmove" data-lup aria-label="Move ${n} earlier" title="Move earlier">←</button><button type="button" class="dmove" data-ldn aria-label="Move ${n} later" title="Move later">→</button><span class="dgrip lgrip" role="button" tabindex="0" aria-label="Drag to move ${n}" title="Drag to reorder">⋮⋮</span><button type="button" class="dmove" data-lhide aria-label="Hide ${n}" title="Hide">✕</button></span></div>`;
}
function paintLoc(main, esc) {
  const row = main.querySelector('#locRow');
  if (!row || !D.loc) return;
  const show = D.loc.order.filter(k => !D.loc.hide.has(k) && D.loc.byKey[k]);
  row.innerHTML = show.map(k => locTile(esc, D.loc.byKey[k], D.ordOn)).join('') || (D.ordOn ? '<p class="muted">Every location tile is hidden.</p>' : '');
  const hid = main.querySelector('#locHid');
  if (hid) {
    const keys = D.loc.order.filter(k => D.loc.hide.has(k) && D.loc.byKey[k]);
    hid.hidden = !keys.length;
    hid.innerHTML = keys.map(k => `<button type="button" class="fchip" data-lshow="${esc(k)}">Show ${esc(locName(D.loc.byKey[k]))}</button>`).join('');
  }
  const rst = main.querySelector('#dLocReset');
  if (rst) rst.hidden = !readLocPref(D.user);
  [...row.querySelectorAll('[data-lkey]')].forEach((t, i, all) => {
    const L = t.querySelector('[data-lup]'), R = t.querySelector('[data-ldn]');
    if (L) L.disabled = i === 0; if (R) R.disabled = i === all.length - 1;
  });
}
function saveLoc(u) {
  const prev = readLocPref(u);
  const base = prev && prev.order.length ? prev.order : D.loc.canon;
  const ord = arrangeList(base, base.concat(D.loc.order), D.loc.order);
  const hide = new Set(D.loc.hide);
  if (prev) prev.hide.forEach(k => { if (D.loc.canon.indexOf(k) < 0) hide.add(k); });
  writeLocPref(u, ord, hide, D.loc.canon);
}
function ordBar(esc, label) {
  if (!D.ordOn) return '';
  const n = esc(label);
  return `<span class="dord"><button type="button" class="dmove" data-dup aria-label="Move ${n} up" title="Move up">↑</button><button type="button" class="dmove" data-ddn aria-label="Move ${n} down" title="Move down">↓</button><span class="dgrip" role="button" tabindex="0" aria-label="Drag to move ${n}" title="Drag to reorder">⋮⋮</span></span>`;
}
/* Sales card ranges. Monthly is the chart the dashboard already had (last 6 months of confirmed payments).
   Daily, weekly, and annual use each JO's sale date and full sale amount from dashDrill, so a range's number is the sum of its bars. */
const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const addD = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = day => new Date(day + 'T00:00:00Z').getUTCDay();
const mondayOf = day => addD(day, -((dow(day) + 6) % 7));
function salesView() {
  if (!D.salesView) { let s = ''; try { s = localStorage.getItem('oypDashSalesView') || ''; } catch (e) {} D.salesView = s === 'day' || s === 'week' || s === 'year' ? s : 'month'; }
  return D.salesView;
}
function saleRows() { // null = the sales list has not come back; [] = it is not available
  if (!D.x) return null;
  if (!D.x.ok || !Array.isArray(D.x.sales)) return [];
  return D.x.sales.map(s => ({ date: String(s.date || '').slice(0, 10), amount: Number(s.amount) || 0 })).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.date));
}
function salesSpec(view) {
  const today = todayPH(), rows = saleRows();
  if (view === 'month') {
    const months = (D.r && D.r.sales && D.r.sales.months) || [];
    return { view, caption: 'Last 6 months · confirmed payments', hint: 'Tap a month to see the JOs sold.', bars: months.map((m, i, a) => ({ key: m.month, label: monthName(m.month), value: Number(m.total) || 0, href: '#/dashboard/sales/' + m.month, cur: i === a.length - 1, title: 'JOs sold in ' + monthName(m.month) })) };
  }
  if (rows == null) return { wait: true };
  if (!rows.length) return { caption: '', hint: '', bars: [], empty: 'Daily, weekly, and annual use the sales list. That list is not on the server yet, so those views have no bars. Monthly still shows confirmed payments.' };
  if (view === 'day') {
    const start = addD(today, -13), bars = [];
    for (let d = start; d <= today; d = addD(d, 1)) bars.push({ key: d, label: String(Number(d.slice(8))), value: 0, cur: d === today, title: day(d) });
    rows.forEach(s => { const b = bars.find(x => x.key === s.date); if (b) b.value += s.amount; });
    return { view, caption: 'Last 14 days · ' + day(start) + '–' + day(today) + ' · full sale amount', hint: 'Each bar is one day. This is the sale amount, counted on the sale date.', bars };
  }
  if (view === 'week') {
    const thisMon = mondayOf(today), start = addD(thisMon, -7 * 7), bars = [];
    for (let i = 0; i < 8; i++) { const d = addD(start, i * 7); bars.push({ key: d, label: Number(d.slice(8)) + ' ' + MON[Number(d.slice(5, 7)) - 1], value: 0, cur: d === thisMon, title: 'Week of ' + day(d) }); }
    rows.forEach(s => { const b = bars.find(x => x.key === mondayOf(s.date)); if (b) b.value += s.amount; });
    return { view, caption: 'Last 8 weeks · full sale amount', hint: 'Weeks start on Monday. This is the sale amount, counted on the sale date.', bars };
  }
  const y0 = Number(today.slice(0, 4)), years = rows.map(s => Number(s.date.slice(0, 4))).filter(y => y > 1900 && y <= y0);
  let lo = years.length ? Math.min.apply(null, years) : y0; if (y0 - lo > 5) lo = y0 - 5;
  const bars = []; for (let y = lo; y <= y0; y++) bars.push({ key: String(y), label: String(y), value: 0, cur: y === y0, title: String(y) });
  rows.forEach(s => { const b = bars.find(x => x.key === s.date.slice(0, 4)); if (b) b.value += s.amount; });
  return { view, caption: (lo === y0 ? y0 : lo + '–' + y0) + ' · full sale amount', hint: 'Each bar is a calendar year. This is the sale amount, counted on the sale date.', bars };
}
function salesBody(esc, view) {
  const spec = salesSpec(view);
  if (spec.wait) return '<p class="muted">Loading the day-by-day sales…</p>';
  if (spec.empty) return `<p class="muted">${esc(spec.empty)}</p>`;
  const max = Math.max(1, ...spec.bars.map(b => b.value)), total = spec.bars.reduce((t, b) => t + b.value, 0);
  const bars = spec.bars.map(b => { const h = spec.view === 'month' || b.value ? Math.max(2, Math.round(b.value / max * 100)) : 0;
    const inner = `<span class="v">${esc(spec.view === 'month' || b.value ? short(b.value) : '—')}</span><i style="height:${h}%"></i><span class="lab">${esc(b.label)}</span>`;
    return b.href ? `<a class="bar tap${b.cur ? ' cur' : ''}" href="${esc(b.href)}" title="${esc(b.title)}">${inner}</a>` : `<div class="bar${b.cur ? ' cur' : ''}" title="${esc(b.title)}">${inner}</div>`; }).join('');
  return `<p class="salesum"><b>${esc(peso(total))}</b><span class="muted">${esc(spec.caption)}</span></p><div class="bars">${bars}</div><p class="muted dhint">${esc(spec.hint)}</p>`;
}
function paintSales(main, esc) { const box = main.querySelector('#saleBody'); if (box) box.innerHTML = salesBody(esc, salesView()); }
function ensureSales() { if (D.x) return Promise.resolve(D.x); if (!D.salesP) D.salesP = extra().then(x => x, () => null).then(x => { D.salesP = null; return x; }); return D.salesP; }
function wireSales(main, esc) {
  main.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => {
    D.salesView = b.dataset.sv; try { localStorage.setItem('oypDashSalesView', D.salesView); } catch (e) {}
    main.querySelectorAll('[data-sv]').forEach(x => { const on = x.dataset.sv === D.salesView; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    paintSales(main, esc);
    if (D.salesView !== 'month' && !D.x) ensureSales().then(() => { if (window.OYP.here()()) paintSales(main, esc); });
  });
}

async function render(main, u, fresh) {
  const { call, esc } = window.OYP, live = window.OYP.here(); // live(): still on this route (app.js)
  const drill = (location.hash.match(/^#\/dashboard\/(\w+)(?:\/([\w-]+))?/) || []).slice(1);
  if (drill[0] && D.r && !fresh && Date.now() - D.at < 5 * 60e3) return drillPage(main, u, drill[0], drill[1] || '');
  main.innerHTML = '<h2>Dashboard</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  // portalSteps {inbox:1}: client approvals / questions (Portal.gs v3; admin + production manager). An older Portal.gs answers without
  // "inbox" -> no card. (portalSteps, not a new action name, so a server without v3 never sees an unknown action.)
  const pin = u && (u.role === 'admin' || u.role === 'production_manager');
  const [r, cc, pi] = await Promise.all([call('dashboard'), call('contactList'), pin ? call('portalSteps', { inbox: 1 }) : null]); // contactList: JobContact.gs (absent before that paste -> no tile)
  if (!live()) return; // the user went to another page while this loaded: leave it alone
  if (r && r.ok) { D.r = r; D.cc = cc; D.x = null; D.at = Date.now(); }
  if (drill[0] && r && r.ok) return drillPage(main, u, drill[0], drill[1] || '');
  const noCC = new Set(cc && cc.ok ? cc.missing_jos : []);
  if (!r || !r.ok) {
    main.innerHTML = `<h2>Dashboard</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for the dashboard yet.' : (r && r.error) || 'Could not load')}</p>`; return;
  }
  const c = r.counts, can = r.can, pb = c.pending_breakdown;
  D.user = u; D.ordOn = !!(u && u.role === 'admin');
  const when = new Date(r.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const pendNote = [pb.reviews && pb.reviews + ' to review', pb.past_due && pb.past_due + ' past due', pb.payments && plural(pb.payments, 'payment') + ' to confirm'].filter(Boolean).join(' · ') || 'All clear';
  const tile = (lab, val, note, cls = '', href = '') => href ? `<a class="kpi kpilink tap ${cls}" href="${href}"><span class="lab">${esc(lab)} ›</span><b>${esc(val)}</b><small>${esc(note || '')}</small></a>`
    : `<div class="kpi ${cls}"><span class="lab">${esc(lab)}</span><b>${esc(val)}</b><small>${esc(note || '')}</small></div>`;
  let h = `<div class="dhead"><h2>Dashboard</h2><span class="dheadacts">${D.ordOn ? '<button class="lnk" id="dOrdReset" hidden>Reset order</button>' : ''}<button class="lnk" id="dRef">Refresh</button></span></div><p class="muted">${esc(when)} PHT</p>
  <div class="kpis">${tile('Active jobs', c.active_jobs, r.locations ? 'being worked on' : plural(r.board.reduce((s, b) => s + b.count, 0), 'open job'), '', '#/dashboard/active')}
  ${tile('Pending work', c.pending_work, pendNote, c.pending_work ? 'warn' : '', '#/dashboard/pending')}
  ${can.consign ? tile('Consigned out', c.consigned_out, plural(new Set((r.consignments || []).map(x => x.consignee)).size, 'consignee'), '', '#/dashboard/consigned') : ''}
  ${can.consign ? tile('Overdue', c.overdue_consignments, 'out over ' + r.overdue_days + ' days', c.overdue_consignments ? 'gold' : '', '#/dashboard/overdue') : ''}
  ${can.sales ? tile(monthName(r.sales.month) + ' sales', peso(c.month_sales), 'confirmed payments', '', '#/dashboard/sales/' + r.sales.month) : ''}
  ${cc && cc.ok ? `<a class="kpi ${cc.missing ? 'gold' : ''} kpilink" href="#/review" id="dNoCC" title="${esc(cc.missing ? 'No mobile or email on file: ' + cc.missing_jos.join(', ') : '')}"><span class="lab">No client contact</span><b>${esc(cc.missing)}</b><small>${esc(cc.missing ? 'of ' + cc.total + ' JOs · can\'t track their order' : 'every JO has a mobile or email')}</small></a>` : ''}</div>${D.ordOn ? '<p class="muted dordhint">Arrows move a section up or down. Drag the grip. The order is saved on this device.</p>' : ''}`;

  const parts = {};
  const ib = pi && pi.ok && pi.inbox; D.inbox = ib || null;
  if (ib && ib.items.length) parts.msgs = inboxCard(ib, esc);
  if (r.locations) {
    loadLoc(r.locations, u);
    parts.loc = `<section class="dcard" data-dsec="loc"><div class="dtitle"><span class="dname">${ordBar(esc, 'Location')}<h3>Location</h3></span><span class="dlocacts"><span class="lab">All JOs${c.on_hand != null ? ' · ' + plural(c.on_hand, 'piece') + ' on hand' : ''}</span>${D.ordOn ? '<button type="button" class="lnk" id="dLocReset" hidden>Reset</button>' : ''}</span></div><div class="locrow${D.ordOn ? ' edit' : ''}" id="locRow"></div>${D.ordOn ? '<div class="lchide" id="locHid" hidden></div><p class="muted lhint">Arrows set the flow. Drag the grip. ✕ hides a tile.</p>' : ''}</section>`;
  }

  if (can.sales) {
    const sv = salesView();
    parts.sales = `<section class="dcard" data-dsec="sales"><div class="dtitle"><span class="dname">${ordBar(esc, 'Sales')}<h3>Sales</h3></span><span class="lab">Admin only</span></div>
      <div class="seg salestog" role="tablist" aria-label="Sales range">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Annual']].map(([k, l]) => `<button type="button" role="tab" data-sv="${k}" class="${sv === k ? 'on' : ''}" aria-selected="${sv === k ? 'true' : 'false'}">${l}</button>`).join('')}</div>
      <div id="saleBody"></div></section>`;
  }

  parts.board = `<section class="dcard" data-dsec="board"><div class="dtitle"><span class="dname">${ordBar(esc, 'Job board')}<h3>Job board</h3></span><span class="lab">${r.locations ? 'Being worked on · ' : ''}By stage · late first</span></div><div class="kanban">${r.board.map(col => `
    <div class="kcol"><a class="khead tap" href="#/dashboard/stage/${esc(col.key)}"><span class="lab">${esc(col.label)} ›</span><span class="kn">${col.count}</span></a>${col.cards.map(j => `
      <div class="kcard tap${j.late ? ' late' : ''}" data-jo="${esc(j.jo)}"><div class="kjo">${esc(j.jo)}${j.review ? '<span class="dot" title="Needs review"></span>' : ''}</div>
      <div class="kd">${esc(j.description || '—')}</div>${j.client ? `<div class="kc">${esc(j.client)}</div>` : ''}
      <div class="kf">${j.due ? `<span class="chip ${j.late ? 'gold' : ''}">${j.late ? 'Late · ' : 'Due '}${esc(day(j.due))}</span>` : ''}${j.type === 'repair' ? '<span class="chip">Repair</span>' : ''}${j.review ? '<span class="chip">Review</span>' : ''}${noCC.has(j.jo) ? '<span class="chip nocc" title="No client mobile or email">No contact</span>' : ''}</div></div>`).join('') || '<div class="kempty">—</div>'}</div>`).join('')}</div></section>`;

  if (can.consign) {
    const L = r.consignments || [];
    const owedSlot = (u && u.role === 'admin') ? '<div class="kpis dcowed" id="dConsignOwed" hidden></div>' : '';
    parts.consign = `<section class="dcard" data-dsec="consign"><div class="dtitle"><span class="dname">${ordBar(esc, 'Consignment')}<h3>Consignment</h3></span><span class="csdash"><span class="lab">Items out · oldest first</span><a class="lnk" href="#/consignment">Open</a></span></div>${owedSlot}${L.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Item</span></th><th><span class="lab">With</span></th><th class="hm"><span class="lab">Out since</span></th><th><span class="lab">Days</span></th>${can.prices ? '<th class="hm r"><span class="lab">Value</span></th>' : ''}</tr></thead><tbody>${L.slice(0, 12).map(x => `
      <tr class="${x.overdue ? 'od' : ''}"><td><b class="cn">${esc(x.description || x.item_id)}</b><br><span class="muted">${esc(x.item_id)}${x.jo ? ' · JO ' + esc(x.jo) : ''}</span></td><td>${esc(x.consignee || '—')}<br><span class="muted">${esc(x.consignment_id)}</span></td>
      <td class="hm">${esc(day(x.date_out))}</td><td>${x.overdue ? `<span class="chip gold">${x.days_out}<span class="hm"> · Overdue</span></span>` : esc(x.days_out == null ? '—' : x.days_out)}</td>${can.prices ? `<td class="hm r">${x.value ? esc(peso(x.value)) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${(r.missing || []).includes('Consignment') ? 'Consignment isn\'t set up yet.' : 'Nothing out on consignment.'}</p>`}</section>`;
  }

  if (can.payments) {
    const P = r.payments || [];
    parts.pay = `<section class="dcard" data-dsec="pay"><div class="dtitle"><span class="dname">${ordBar(esc, 'Recent payments')}<h3>Recent payments</h3></span><span class="lab">Only confirmed ones count</span></div>${P.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Date</span></th><th><span class="lab">JO</span></th><th class="hm"><span class="lab">From</span></th><th class="hm"><span class="lab">Method</span></th><th class="r"><span class="lab">Amount</span></th><th><span class="lab">Status</span></th></tr></thead><tbody>${P.map(p => `
      <tr><td>${esc(day(p.date))}</td><td>${esc(p.jo)}</td><td class="hm">${esc(p.payer)}</td><td class="hm">${esc(p.method)}${p.source === 'telegram' ? ' <span class="muted">· Telegram</span>' : ''}</td><td class="r">${esc(peso(p.amount))}</td>
      <td><span class="chip ${p.status === 'pending' ? 'gold' : ''}">${esc(p.status === 'pending' ? 'To confirm' : p.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments yet.</p>'}</section>`;
  }

  if ('inquiries' in r) parts.inq = `<section class="dcard soon" id="dInq" data-dsec="inq"><div class="dtitle"><span class="dname">${ordBar(esc, 'Email inquiries')}<h3>Email inquiries</h3></span><span class="lab">Coming soon</span></div><p class="muted">Emails about a job will show here, matched to their JO. Replies go out only when you press Send.</p></section>`;
  h += `<div id="dsecs">${arrange(Object.keys(parts), D.ordOn ? readOrder(u) : null).map(id => parts[id]).join('')}</div>`;
  const miss = (r.missing || []).filter(t => !{ Settings: 1, Items: 1, Consignees: 1, Consignments: 1, ConsignmentItems: 1 }[t]); // Settings is optional. Items is inventory. Only a missing Consignment tab is a consignment warning.
  if (miss.length) h += `<p class="muted dmiss">Not set up in the Sheet yet: ${miss.map(esc).join(', ')}</p>`;
  main.innerHTML = h;
  main.querySelector('#dRef').onclick = () => render(main, u, true);
  if (r.locations) { paintLoc(main, esc); wireLoc(main, esc, u); }
  wireOrder(main, u);
  if (can.sales) { paintSales(main, esc); wireSales(main, esc); ensureSales().then(() => { if (live() && salesView() !== 'month') paintSales(main, esc); }); }
  main.querySelectorAll('.kcard[data-jo]').forEach(k => k.onclick = () => { const col = r.board.find(b => b.cards.some(x => x.jo === k.dataset.jo));
    openJO(k.dataset.jo, boardRow(col.cards.find(x => x.jo === k.dataset.jo), col), 'Dashboard'); });
  wireInbox(main, esc);
  const nc = main.querySelector('#dNoCC'); if (nc) nc.onclick = () => { try { sessionStorage.setItem('oypReviewFilter', 'nocontact'); } catch (_) {} };
  if (u && u.role === 'admin' && can.consign) fillOwed(main, esc, live);
}
async function fillOwed(main, esc, live) {
  const box = main.querySelector('#dConsignOwed');
  if (!box) return;
  let r = null;
  try { r = await window.OYP.call('consignList'); } catch (e) { r = null; }
  const still = main.querySelector('#dConsignOwed');
  if (!live() || !still) return;
  if (!r || !r.ok || r.balance == null) { still.remove(); return; }
  const n = Number(r.balance) || 0;
  const note = 'owed ' + peso(r.owed) + ' · paid ' + peso(r.paid);
  still.hidden = false;
  still.innerHTML = `<a class="kpi kpilink tap${n > 0 ? ' gold' : ''}" href="#/consignment"><span class="lab">Owed by consignees ›</span><b>${esc(peso(n))}</b><small>${esc(note)}</small></a>`;
}

/* ---------- client messages (Portal.gs v3): quote approvals + questions from Track my order / My orders ---------- */
const agoT = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return !(m >= 0) ? '' : m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : plural(Math.round(m / 1440), 'day') + ' ago'; };
function inboxCard(ib, esc) {
  const open = ib.items.filter(x => x.status === 'open'), done = ib.items.filter(x => x.status !== 'open').slice(0, 5);
  const row = x => `<div class="cmrow${x.status === 'open' ? '' : ' cmdone'}"><span class="cmico" aria-hidden="true">${x.kind === 'approval' ? '✓' : '?'}</span><div class="cmb">
    <div class="cmt"><b>${x.kind === 'approval' ? 'Quote approved' : 'Question'} · JO ${esc(x.jo)}</b><span class="muted">${esc(agoT(x.at))}</span></div>
    <div class="cmx">${esc(x.text)}${x.amount != null && x.kind === 'approval' ? '' : ''}</div>
    <div class="muted">${esc(x.from)} · ${x.via === 'account' ? 'portal account' : x.via === 'staff' ? 'marked in the back office' + (x.marked_by ? ' by ' + esc(x.marked_by) : '') + (x.how ? ' (' + esc(x.how.replace('_', ' ')) + ')' : '') : x.via === 'telegram' ? 'marked via Tessa' + (x.marked_by ? ' by ' + esc(x.marked_by) : '') + (x.how ? ' (' + esc(x.how.replace('_', ' ')) + ')' : '') : 'Track my order'}${x.version ? ' · quote v' + x.version : ''}${x.amount != null ? ' · ' + peso(x.amount) : ''}${x.status !== 'open' && x.handled_by ? ' · handled by ' + esc(x.handled_by) : ''}</div></div>
    ${x.status === 'open' ? `<button class="lnk cmok" data-id="${esc(x.id)}">Done</button>` : ''}</div>`;
  return `<section class="dcard" id="dMsgs" data-dsec="msgs"><div class="dtitle"><span class="dname">${ordBar(esc, 'Client messages')}<h3>Client messages</h3></span><span class="lab">${open.length ? plural(open.length, 'new message') : 'All handled'} · approvals and questions</span></div>
    ${open.map(row).join('')}${done.length ? `<details class="cmold"><summary class="muted">Handled (${done.length})</summary>${done.map(row).join('')}</details>` : ''}
    <p class="muted dhint">The Telegram group gets each one too. Reply to the client yourself (phone / Viber / email); nothing is sent from here.</p></section>`;
}
function wireInbox(main, esc) {
  main.querySelectorAll('.cmok').forEach(b => b.onclick = async () => {
    b.disabled = true; b.textContent = '…';
    const r = await window.OYP.call('portalInboxDone', { id: b.dataset.id });
    if (!r || !r.ok) { b.disabled = false; b.textContent = 'Done'; return window.OYP.toast ? window.OYP.toast((r && r.error) || 'Could not save') : alert((r && r.error) || 'Could not save'); }
    const sec = main.querySelector('#dMsgs'); if (!sec) return;
    if (!r.inbox.items.length) { sec.remove(); wireOrder(main, D.user); return; }
    sec.outerHTML = inboxCard(r.inbox, esc); wireInbox(main, esc); wireOrder(main, D.user);
  });
}
function wireOrder(main, u) {
  const box = main.querySelector('#dsecs');
  if (!box || !u || u.role !== 'admin') return;
  const secs = () => [...box.children].filter(s => s.dataset && s.dataset.dsec);
  const paint = () => {
    const all = secs();
    all.forEach((s, i) => { const up = s.querySelector('[data-dup]'), dn = s.querySelector('[data-ddn]'); if (up) up.disabled = i === 0; if (dn) dn.disabled = i === all.length - 1; });
    const rst = main.querySelector('#dOrdReset'); if (rst) rst.hidden = !readOrder(u);
  };
  const persist = () => { writeOrder(u, secs().map(s => s.dataset.dsec)); paint(); };
  box.onclick = e => {
    const b = e.target.closest('[data-dup],[data-ddn]'); if (!b || !box.contains(b)) return;
    e.preventDefault();
    const s = b.closest('[data-dsec]'); if (!s) return;
    if (b.hasAttribute('data-dup')) { const p = s.previousElementSibling; if (p && p.dataset.dsec) box.insertBefore(s, p); }
    else { const n = s.nextElementSibling; if (n && n.dataset.dsec) box.insertBefore(n, s); }
    persist();
  };
  if (!box.dataset.wired) {
    box.dataset.wired = '1';
    box.addEventListener('pointerdown', e => {
      const g = e.target.closest && e.target.closest('.dgrip'); if (!g || !box.contains(g) || g.closest('.lctile')) return;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      const s = g.closest('[data-dsec]'); if (!s) return;
      s.classList.add('dragging'); s.style.pointerEvents = 'none';
      try { g.setPointerCapture(e.pointerId); } catch (_) {}
      const move = ev => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = el && el.closest && el.closest('[data-dsec]');
        if (!over || over === s || !box.contains(over)) return;
        const r = over.getBoundingClientRect();
        const ref = ev.clientY > r.top + r.height / 2 ? over.nextSibling : over;
        if (ref !== s) box.insertBefore(s, ref);
      };
      const up = () => {
        s.classList.remove('dragging'); s.style.pointerEvents = '';
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        persist();
      };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
  }
  const rst = main.querySelector('#dOrdReset');
  if (rst) rst.onclick = () => {
    try { localStorage.removeItem(ordKey(u)); } catch (e) {}
    arrange(secs().map(s => s.dataset.dsec), null).forEach(id => { const s = box.querySelector('[data-dsec="' + id + '"]'); if (s) box.appendChild(s); });
    paint();
  };
  paint();
}
function wireLoc(main, esc, u) {
  const sec = main.querySelector('[data-dsec="loc"]');
  if (!sec || !u || u.role !== 'admin' || !D.loc) return;
  const applyDom = () => {
    const row = sec.querySelector('#locRow');
    const visible = [...row.querySelectorAll('[data-lkey]')].map(el => el.dataset.lkey);
    D.loc.order = arrangeList(D.loc.order, D.loc.order, visible);
    saveLoc(u); paintLoc(main, esc);
  };
  sec.addEventListener('click', e => {
    if (e.target.closest('#dLocReset')) {
      try { localStorage.removeItem(locStoreKey(u)); } catch (err) {}
      D.loc.order = D.loc.canon.slice(); D.loc.hide = new Set(); paintLoc(main, esc); return;
    }
    const show = e.target.closest('[data-lshow]');
    if (show && sec.contains(show)) { D.loc.hide.delete(show.dataset.lshow); saveLoc(u); paintLoc(main, esc); return; }
    const b = e.target.closest('[data-lup],[data-ldn],[data-lhide]');
    if (!b || !sec.contains(b)) return;
    e.preventDefault();
    const t = b.closest('[data-lkey]'); if (!t) return;
    const row = sec.querySelector('#locRow');
    if (b.hasAttribute('data-lhide')) { D.loc.hide.add(t.dataset.lkey); saveLoc(u); paintLoc(main, esc); return; }
    if (b.hasAttribute('data-lup')) { const p = t.previousElementSibling; if (p && p.dataset.lkey) row.insertBefore(t, p); }
    else { const n = t.nextElementSibling; if (n && n.dataset.lkey) row.insertBefore(n, t); }
    applyDom();
  });
  sec.addEventListener('pointerdown', e => {
    const g = e.target.closest && e.target.closest('.lgrip');
    if (!g || !sec.contains(g)) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const t = g.closest('[data-lkey]'); if (!t) return;
    const row = sec.querySelector('#locRow');
    t.classList.add('dragging'); t.style.pointerEvents = 'none';
    try { g.setPointerCapture(e.pointerId); } catch (_) {}
    const move = ev => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = el && el.closest && el.closest('[data-lkey]');
      if (!over || over === t || !row.contains(over)) return;
      const r = over.getBoundingClientRect();
      const ref = ev.clientX > r.left + r.width / 2 ? over.nextSibling : over;
      if (ref !== t) row.insertBefore(t, ref);
    };
    const up = () => {
      t.classList.remove('dragging'); t.style.pointerEvents = '';
      g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
      applyDom();
    };
    g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
}

/* ---------- drill-down lists (same list rows as To review; a JO opens in the To review card) ---------- */
const canOpen = u => u && (u.role === 'admin' || u.role === 'production_manager'); // the JO card (JobSync) is admin + PM only
function boardRow(j, col) {
  return { jo: j.jo, description: j.description, client: j.client, stage: j.stage, stage_label: stageLabel(j.stage), col: col.key, col_label: col.label,
    since: j.since, due: j.due, late: j.late, type: j.type, review: j.review, location: D.r && D.r.locations ? 'working' : '' };
}
function openJO(jo, row, label) {
  try { sessionStorage.setItem('oypReviewOpen', JSON.stringify({ jo, back: location.hash || '#/dashboard', label: label === 'Dashboard' ? 'Dashboard' : 'Back to ' + label, row })); } catch (_) {}
  location.hash = '#/review';
}
async function extra() { // all live JOs (+ sales list for executives) in one read-only call; cached with the dashboard
  if (!D.x) D.x = await window.OYP.call('dashDrill', { what: 'jobs' });
  return D.x && D.x.ok ? D.x : null;
}
function needsPaste() {
  const e = D.x && D.x.error;
  return `<p class="muted rvnone">${window.OYP.esc(!e || e === 'Unknown action' ? 'This list needs the DashboardDrill paste in Apps Script (see the instructions). The count on the dashboard is right; the per-JO list is not sent yet.' : e)}</p>`;
}

async function drillPage(main, u, kind, key) {
  const { esc } = window.OYP, r = D.r, can = r.can, noCC = new Set(D.cc && D.cc.ok ? D.cc.missing_jos : []);
  const locLab = k => ((r.locations || []).find(l => l.key === k) || { label: k === 'unset' ? 'No location yet' : k }).label;
  const allBoard = () => r.board.reduce((a, col) => a.concat(col.cards.map(j => boardRow(j, col))), []);
  const capped = cols => cols.filter(c => c.count > c.cards.length).map(c => c.label + ': first ' + c.cards.length + ' of ' + c.count).join(' · ');
  let title = '', sub = '', chips = [], groups = null, rows = [], note = '', body = '', show = { loc: true, stage: true };
  const live = window.OYP.here();
  main.innerHTML = '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';

  if (kind === 'active' || kind === 'stage') {
    const col = kind === 'stage' ? r.board.find(b => b.key === key) : null;
    if (kind === 'stage' && !col) { location.hash = '#/dashboard'; return; }
    chips = [['#/dashboard/active', 'All active', r.board.reduce((s, b) => s + b.count, 0), kind === 'active']].concat(r.board.map(b => ['#/dashboard/stage/' + b.key, b.label, b.count, col === b]));
    show.loc = false;
    if (col) {
      title = col.label; sub = (r.locations ? 'Being worked on · ' : '') + 'what is being done in this stage, late first';
      rows = col.cards.map(j => boardRow(j, col));
      const by = {}; rows.forEach(x => (by[x.stage_label] = by[x.stage_label] || []).push(x)); // what is being done: one group per stage step
      groups = Object.keys(by).map(k => [k, by[k]]); show.days = true; // the group already names the step
      note = capped([col]);
    } else {
      title = 'Active jobs'; sub = (r.locations ? 'Being worked on' : 'Open jobs') + ' · by stage, late first';
      rows = allBoard(); groups = r.board.filter(b => b.cards.length).map(b => [b.label, rows.filter(x => x.col === b.key), '#/dashboard/stage/' + b.key]);
      note = capped(r.board);
    }
  } else if (kind === 'loc') {
    title = locLab(key); sub = key === 'unset' ? 'JOs with no location set' : 'JOs at this location';
    chips = (r.locations || []).filter(l => l.count || l.key === key).map(l => ['#/dashboard/loc/' + l.key, l.label, l.count, l.key === key]);
    show.loc = false; show.stage = key === 'working';
    const x = await extra();
    if (!x) body = needsPaste();
    else { rows = x.jobs.filter(j => key === 'unset' ? !j.location || !(r.locations || []).some(l => l.key === j.location && l.key !== 'unset') : j.location === key);
      if (key === 'working') groups = r.board.map(b => [b.label, rows.filter(j => j.col === b.key), '#/dashboard/stage/' + b.key]).filter(g => g[1].length); }
    if (key === 'unset') note = 'The cards still to review are also in To review › Needs location.';
  } else if (kind === 'sales') {
    if (!can.sales) { location.hash = '#/dashboard'; return; }
    const m = (r.sales.months.find(x => x.month === key) || r.sales.months[r.sales.months.length - 1]).month;
    title = monthName(m) + ' ' + m.slice(0, 4) + ' sales'; show.stage = false;
    chips = r.sales.months.map(x => ['#/dashboard/sales/' + x.month, monthName(x.month), short(x.total), x.month === m]);
    const x = await extra();
    if (!x) { body = needsPaste(); sub = 'Payments received this month: ' + peso((r.sales.months.find(y => y.month === m) || {}).total); }
    else if (!x.sales) body = '<p class="muted rvnone">Sales lists are for executives only.</p>';
    else {
      rows = x.sales.filter(y => y.month === m).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(y => Object.assign({}, y, { sale: true }));
      const tot = rows.reduce((t, y) => t + (Number(y.amount) || 0), 0), paid = (r.sales.months.find(y => y.month === m) || {}).total || 0;
      sub = plural(rows.length, 'JO') + ' sold · ' + peso(tot) + ' at full sale amount · payments received ' + peso(paid);
      note = 'Sold = an item sold, or a new job with at least a downpayment, counted at the full sale amount, in the month of the first payment (or of the sale). What is still owed is in the accounting tracker.';
    }
  } else if (kind === 'pending') {
    title = 'Pending work'; sub = 'To review, past due' + (can.payments ? ', payments to confirm' : '');
    const x = await extra(), P = can.payments ? (r.payments || []).filter(p => p.status === 'pending') : [];
    if (!x) body = needsPaste();
    else groups = [['To review', x.jobs.filter(j => j.review), '#/review'], ['Past due', x.jobs.filter(j => j.late)]];
    if (P.length) (groups = groups || []).push(['Payments to confirm', P.map(p => ({ jo: p.jo, description: peso(p.amount) + ' · ' + (p.payer || p.method || 'payment'), chips: ['Paid ' + day(p.date), p.method] }))]);
    if (groups) { groups = groups.filter(g => g[1].length); rows = groups.reduce((a, g) => a.concat(g[1]), []); }
  } else if (kind === 'consigned' || kind === 'overdue') {
    if (!can.consign) { location.hash = '#/dashboard'; return; }
    title = kind === 'overdue' ? 'Overdue consignments' : 'Consigned out'; sub = kind === 'overdue' ? 'Out over ' + r.overdue_days + ' days, oldest first' : 'Items and JOs out on consignment, oldest first';
    chips = [['#/dashboard/consigned', 'Consigned out', r.counts.consigned_out, kind === 'consigned'], ['#/dashboard/overdue', 'Overdue', r.counts.overdue_consignments, kind === 'overdue']];
    show.stage = false; show.loc = false;
    const L = (r.consignments || []).filter(c => kind === 'consigned' || c.overdue).map(c => ({ jo: c.jo, item: c.item_id, description: c.description || c.item_id, client: c.consignee,
      chips: [c.date_out ? 'Out ' + day(c.date_out) : '', c.days_out != null ? plural(c.days_out, 'day') : ''], gold: c.overdue ? 'Overdue' : '', value: can.prices && c.value ? peso(c.value) : '' }));
    groups = [['On consignment sheets', L]];
    if (kind === 'consigned' && r.counts.consigned_jos) { const x = await extra(); const out = new Set(L.map(c => c.jo));
      groups.push(['JOs marked Consigned', x ? x.jobs.filter(j => j.location === 'consigned' && !out.has(j.jo)) : []]); if (!x) body = needsPaste(); }
    groups = groups.filter(g => g[1].length); rows = groups.reduce((a, g) => a.concat(g[1]), []);
  } else { location.hash = '#/dashboard'; return; }
  if (!live()) return; // a list (extra()) still loading after the user moved on

  const open = canOpen(u);
  const row = x => {
    const c = [];
    if (x.sale) { c.push(`<span class="chip gold">${esc(peso(x.amount))}</span>`, `<span class="chip">${esc((x.how === 'sold' ? 'Sold ' : 'Downpayment ') + day(x.date))}</span>`);
      if (x.amount_src === 'paid' && x.how !== 'sold') c.push('<span class="chip" title="No quote or shop price: showing what was paid">Price not set</span>'); }
    if (show.loc && x.location !== undefined) c.push(x.location ? `<span class="chip dark">${esc(locLab(x.location))}</span>` : '<span class="chip gold">Needs location</span>');
    if (show.days) { if (x.since) c.push(`<span class="chip">${esc(ago(x.since))} in this step</span>`); }
    else if (show.stage && x.stage_label) c.push(`<span class="chip">${esc(x.stage_label)}${x.since ? ' · ' + esc(ago(x.since)) : ''}</span>`);
    if (x.due && !x.sale) c.push(`<span class="chip ${x.late ? 'gold' : ''}">${x.late ? 'Late · ' : 'Due '}${esc(day(x.due))}</span>`);
    if (x.type === 'repair') c.push('<span class="chip">Repair</span>');
    if (x.review) c.push('<span class="chip">Review</span>');
    (x.chips || []).filter(Boolean).forEach(t => c.push(`<span class="chip">${esc(t)}</span>`));
    if (x.gold) c.push(`<span class="chip gold">${esc(x.gold)}</span>`);
    if (x.value) c.push(`<span class="chip">${esc(x.value)}</span>`);
    if (x.jo && noCC.has(x.jo)) c.push('<span class="chip nocc">No contact</span>');
    const go = open && x.jo;
    return `<div class="rvrow dr ${go ? 'go tap' : ''}"${go ? ` data-jo="${esc(x.jo)}"` : ''}><div class="rvi"><div class="kjo">${x.jo ? esc(x.jo) : `<span class="muted">${esc(x.item || '—')}</span>`}${x.parent_jo ? `<span class="muted sm">of ${esc(x.parent_jo)}</span>` : ''}${x.item && x.jo ? `<span class="muted sm">${esc(x.item)}</span>` : ''}</div>
      <div class="kd">${esc(x.description || 'No details')}${x.client ? ' · ' + esc(x.client) : ''}</div><div class="kf">${c.join('')}</div></div>${go ? '<span class="chev">›</span>' : ''}</div>`;
  };
  const q = () => ((main.querySelector('#drQ') || {}).value || '').trim().toUpperCase();
  const hit = x => { const t = q(); return !t || [x.jo, x.description, x.client, x.item].some(v => String(v || '').toUpperCase().includes(t)); };
  const list = () => {
    if (body) return body;
    const G = groups || [[null, rows]];
    const out = G.map(([lab, L, href]) => { L = L.filter(hit); if (!L.length && lab) return ''; return (lab ? `<div class="dgrp">${href ? `<a href="${href}" class="lab">${esc(lab)} ›</a>` : `<span class="lab">${esc(lab)}</span>`}<span class="kn">${esc(plural(L.length, 'item'))}</span></div>` : '') + L.map(row).join(''); }).join('');
    return out || `<p class="muted rvnone">${q() ? 'No match.' : 'Nothing here.'}</p>`;
  };
  const n = new Set(rows.map(x => x.jo || x.item)).size;
  main.innerHTML = `<div class="drill"><a class="lnk dback tap" href="#/dashboard">‹ Dashboard</a>
    <div class="dhead"><h2>${esc(title)}</h2><span class="lab">${body && !rows.length ? '' : esc(plural(n, 'item'))}</span></div>
    <p class="muted">${esc(sub)}</p>
    ${chips.length ? `<div class="rvchips">${chips.map(([h, lab, cnt, on]) => `<a class="fchip tap ${on ? 'on' : ''}" href="${h}">${esc(lab)} <b>${esc(cnt)}</b></a>`).join('')}</div>` : ''}
    ${rows.length > 6 ? '<input id="drQ" class="rvq" placeholder="Search JO, client or description">' : ''}
    <div class="rvrows" id="drRows">${list()}</div>
    ${note ? `<p class="muted dnote">${esc(note)}</p>` : ''}
    ${!open && rows.some(x => x.jo) ? '<p class="muted dnote">Opening a JO card is for admin and production manager.</p>' : ''}</div>`;
  const wire = () => main.querySelectorAll('.rvrow.go').forEach(el => el.onclick = () => openJO(el.dataset.jo, rows.find(x => x.jo === el.dataset.jo), title));
  const qi = main.querySelector('#drQ'); if (qi) qi.oninput = () => { main.querySelector('#drRows').innerHTML = list(); wire(); };
  wire(); scrollTo(0, 0);
  const on = main.querySelector('.rvchips .fchip.on'); if (on) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.offsetLeft - 20; // phone: the picked chip in view
}
window.OYPDash = { render };
})();
