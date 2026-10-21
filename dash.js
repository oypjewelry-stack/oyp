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
// Section order on this device, per signed-in name. Empty, or a save of this order, means the default. Reset clears the save. KPI bubbles are not in this list: they stay above the sections.
const SEC_ORDER = ['todo', 'board', 'loc', 'sales', 'consign', 'msgs', 'pay'];
const SEC_LEGACY = ['msgs', 'loc', 'sales', 'board', 'consign', 'pay']; // the previous default, so a device that stored it picks up the new one
const ordKey = u => 'oypDashOrder:' + (u && u.username || 'device');
function readOrder(u) {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(ordKey(u)) || 'null'); } catch (e) { return null; }
  if (!Array.isArray(raw)) return null;
  const a = [];
  raw.forEach(x => { if (typeof x === 'string' && SEC_ORDER.includes(x) && a.indexOf(x) < 0) a.push(x); }); // drops a saved 'inq'
  const legacy = a.join() === SEC_LEGACY.join();
  const dirty = legacy || raw.length !== a.length || raw.some((x, i) => x !== a[i]);
  if (dirty) {
    try {
      if (!a.length || legacy || a.join() === SEC_ORDER.join()) localStorage.removeItem(ordKey(u));
      else localStorage.setItem(ordKey(u), JSON.stringify(a));
    } catch (e) {}
  }
  if (!a.length || legacy || a.join() === SEC_ORDER.join()) return null;
  return a;
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
function locCount(l) { const n = Number(l && l.count); return n > 0 ? n : 0; }
function locCanon(list) { // today's row: every place the server sends, including Archived at 0. "No location yet" is last, and only while its count is above 0.
  const keys = [];
  (list || []).forEach(l => { if (l && l.key && l.key !== 'unset' && keys.indexOf(l.key) < 0) keys.push(l.key); });
  const unset = (list || []).find(l => l && l.key === 'unset');
  if (unset && locCount(unset) > 0) keys.push('unset');
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
function locHiddenKeys(u) {
  const p = readLocPref(u);
  return p && p.hide ? p.hide.slice() : [];
}
function setLocHidden(u, key, hidden) { // Settings toggles one tile. Order already saved on this device stays as it is.
  const p = readLocPref(u) || { order: [], hide: [] };
  const hide = p.hide.filter(k => k !== key);
  if (hidden) hide.push(key);
  const order = p.order.slice();
  try {
    if (!order.length && !hide.length) localStorage.removeItem(locStoreKey(u));
    else localStorage.setItem(locStoreKey(u), JSON.stringify({ order: order, hide: hide }));
  } catch (e) {}
  if (D.loc && D.user && u && D.user.username === u.username && D.loc.canon.indexOf(key) >= 0) {
    if (hidden) D.loc.hide.add(key); else D.loc.hide.delete(key);
    const main = document.getElementById('main');
    if (main && main.querySelector('#locRow')) paintLoc(main, window.OYP.esc);
  }
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
function locName(l) { return window.OYP.locLabel(l && l.key, l && l.key === 'unset' ? 'No location yet' : ((l && l.label) || (l && l.key) || '')); }
function locTileOn(k) { // a hidden "No location yet" must not linger in Show once its count is 0
  const l = D.loc && D.loc.byKey[k];
  return !!(l && (k !== 'unset' || locCount(l) > 0));
}
function editing() { return !!(window.OYPLayoutEdit && window.OYPLayoutEdit.editing() && D.ordOn); }
// Sold tile period, remembered on this device. this year -> this month -> all time.
const SOLD_PERIOD = ['year', 'month', 'all'];
const SOLD_LAB = { year: 'this year', month: 'this month', all: 'all time' };
function soldPeriod() {
  let s = ''; try { s = localStorage.getItem('oypDashSoldPeriod') || ''; } catch (e) {}
  return s === 'month' || s === 'all' ? s : 'year';
}
function manilaDay(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && /T|\s\d{1,2}:/.test(s)) {
    const t = Date.parse(s); if (!isNaN(t)) return new Date(t + 8 * 36e5).toISOString().slice(0, 10);
  }
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}
function saleDateByJo(sales) { // the date Daily/Weekly uses (sales[].date), one per JO
  const map = {};
  (sales || []).forEach(s => {
    const jo = s && s.jo, date = manilaDay(s && s.date);
    if (!jo || !date) return;
    const prev = map[jo], sold = s.how === 'sold';
    if (!prev || (sold && !prev.sold) || (sold === prev.sold && date < prev.date)) map[jo] = { date, sold };
  });
  return map;
}
function jobSoldDay(j, byJo) {
  const sale = j && byJo && byJo[j.jo];
  if (sale && sale.date) return sale.date;
  return manilaDay(j && j.updated_at);
}
function soldInPeriod(day, period) {
  if (period === 'all') return true;
  if (!day) return false;
  const today = todayPH();
  return period === 'month' ? day.slice(0, 7) === today.slice(0, 7) : day.slice(0, 4) === today.slice(0, 4);
}
function soldJobs(period) {
  const x = D.x;
  if (!x || !x.ok || !Array.isArray(x.jobs)) return null;
  const byJo = saleDateByJo(x.sales);
  return x.jobs.filter(j => j && j.location === 'sold' && soldInPeriod(jobSoldDay(j, byJo), period));
}
function soldCount(period) {
  const l = D.loc && D.loc.byKey.sold;
  if (period === 'all') return l ? l.count : 0;
  if (!D.x) return null;
  const rows = soldJobs(period);
  return rows ? rows.length : (l ? l.count : 0);
}
function locTile(esc, l, on) {
  const arch = l.key === 'archived', unset = l.key === 'unset', name = locName(l);
  const cls = 'lc tap' + (l.key === 'working' ? ' cur' : '') + (arch ? ' arch' : '') + (unset ? ' gold' : '');
  const href = unset ? '#/review' : '#/dashboard/loc/' + esc(l.key);
  const title = arch ? ' title="JO on record, no physical piece · not counted as on hand"' : '';
  let count = l.count, per = '';
  if (l.key === 'sold') {
    const p = soldPeriod(), n = soldCount(p);
    count = n == null ? '…' : n;
    per = `<span class="lcper" data-soldper tabindex="0" role="button" aria-label="Sold period, ${esc(SOLD_LAB[p])}">${esc(SOLD_LAB[p])}</span>`;
  }
  const link = `<a class="${cls}" href="${href}"${title}><b>${count}</b><span class="lab">${esc(name)} ›</span>${per}</a>`;
  if (!on) return link;
  return `<div class="lctile" data-lkey="${esc(l.key)}">${link}<button type="button" class="lx" data-lhide aria-label="Hide ${esc(name)}">✕</button></div>`;
}
function cycleSoldPeriod(main) {
  const order = SOLD_PERIOD, i = order.indexOf(soldPeriod());
  try { localStorage.setItem('oypDashSoldPeriod', order[(i + 1) % order.length]); } catch (e) {}
  if (D.loc) paintLoc(main, window.OYP.esc);
  if (soldPeriod() !== 'all' && !(D.x && D.x.ok)) ensureSales().then(() => { if (main.querySelector('#locRow')) paintLoc(main, window.OYP.esc); });
}
function wireSoldPeriod(main) {
  const row = main && main.querySelector('#locRow');
  if (!row || row.dataset.soldwire) return;
  row.dataset.soldwire = '1';
  const hit = e => e.target.closest && e.target.closest('.lcper');
  row.addEventListener('pointerdown', e => { if (hit(e)) e.stopPropagation(); }, true);
  row.addEventListener('click', e => {
    if (!hit(e)) return;
    e.preventDefault(); e.stopPropagation();
    cycleSoldPeriod(main);
  });
  row.addEventListener('keydown', e => {
    if (!hit(e) || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); e.stopPropagation();
    cycleSoldPeriod(main);
  });
}
function paintLoc(main, esc) {
  const row = main.querySelector('#locRow');
  if (!row || !D.loc) return;
  const on = editing();
  const show = D.loc.order.filter(k => !D.loc.hide.has(k) && locTileOn(k));
  row.classList.toggle('edit', on);
  row.innerHTML = show.map(k => locTile(esc, D.loc.byKey[k], on)).join('') || (D.ordOn && !show.length ? '<p class="muted">Every location tile is hidden.</p>' : '');
  const acts = main.querySelector('.dlocacts');
  if (!acts) return;
  let extra = acts.querySelector('.layloc');
  if (!on) { if (extra) extra.remove(); return; }
  if (!extra) { extra = document.createElement('span'); extra.className = 'layloc'; acts.appendChild(extra); }
  const hidden = D.loc.order.filter(k => D.loc.hide.has(k) && locTileOn(k));
  extra.innerHTML = hidden.map(k => `<button type="button" class="lnk" data-lshow="${esc(k)}">Show ${esc(locName(D.loc.byKey[k]))}</button>`).join('')
    + `<button type="button" class="lnk" id="dLocReset"${readLocPref(D.user) ? '' : ' hidden'}>Reset</button>`;
}
function saveLoc(u) {
  const prev = readLocPref(u);
  const base = prev && prev.order.length ? prev.order : D.loc.canon;
  const ord = arrangeList(base, base.concat(D.loc.order), D.loc.order);
  const hide = new Set(D.loc.hide);
  if (prev) prev.hide.forEach(k => { if (D.loc.canon.indexOf(k) < 0) hide.add(k); });
  writeLocPref(u, ord, hide, D.loc.canon);
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
function salesTabs(view) {
  return `<div class="seg salestog" role="tablist" aria-label="Sales range">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Annual']].map(([k, l]) => `<button type="button" role="tab" data-sv="${k}" class="${view === k ? 'on' : ''}" aria-selected="${view === k ? 'true' : 'false'}">${l}</button>`).join('')}</div>`;
}
function salesBody(esc, view) {
  const spec = salesSpec(view), tabs = salesTabs(view);
  if (spec.wait) return `<p class="muted">Loading the day-by-day sales…${D.jobsUpdating || D.updating ? '<span class="dupd"> · updating…</span>' : ''}</p>${tabs}`;
  if (spec.empty) return `<p class="muted">${esc(spec.empty)}</p>${tabs}`;
  const max = Math.max(1, ...spec.bars.map(b => b.value)), total = spec.bars.reduce((t, b) => t + b.value, 0);
  const bars = spec.bars.map(b => { const h = spec.view === 'month' || b.value ? Math.max(2, Math.round(b.value / max * 100)) : 0;
    const inner = `<span class="v">${esc(spec.view === 'month' || b.value ? short(b.value) : '—')}</span><i style="height:${h}%"></i><span class="lab">${esc(b.label)}</span>`;
    return b.href ? `<a class="bar tap${b.cur ? ' cur' : ''}" href="${esc(b.href)}" title="${esc(b.title)}">${inner}</a>` : `<div class="bar${b.cur ? ' cur' : ''}" title="${esc(b.title)}">${inner}</div>`; }).join('');
  return `<p class="salesum"><b>${esc(peso(total))}</b><span class="muted">${esc(spec.caption)}${spec.view !== 'month' && D.jobsUpdating ? '<span class="dupd"> · updating…</span>' : ''}</span></p><div class="bars">${bars}</div>${tabs}<p class="muted dhint">${esc(spec.hint)}</p>`;
}
function paintSales(main, esc) { const box = main.querySelector('#saleBody'); if (box) box.innerHTML = salesBody(esc, salesView()); }
function ensureSales() { if (D.x) return Promise.resolve(D.x); if (!D.salesP) D.salesP = extra().then(x => x, () => null).then(x => { D.salesP = null; return x; }); return D.salesP; }
function wireSales(main, esc) {
  const sec = main.querySelector('[data-dsec="sales"]');
  if (!sec || sec.dataset.svwire) return;
  sec.dataset.svwire = '1';
  sec.addEventListener('click', e => {
    const b = e.target.closest('[data-sv]');
    if (!b || !sec.contains(b)) return;
    D.salesView = b.dataset.sv; try { localStorage.setItem('oypDashSalesView', D.salesView); } catch (err) {}
    paintSales(main, esc);
    if (D.salesView !== 'month' && !D.x) ensureSales().then(() => { if (window.OYP.here()()) paintSales(main, esc); });
  });
}

// Last dashboard answer, the dashDrill jobs list, and the portal inbox, per signed-in name.
// A revisit or a drill draws from these, then the live answer replaces them.
const snapKey = u => 'oypDashSnap:' + (u && u.username || '');
const jobsKey = u => 'oypDashJobs:' + (u && u.username || '');
const inboxKey = u => 'oypDashInbox:' + (u && u.username || '');
function readSnap(u) {
  try {
    const r = JSON.parse(sessionStorage.getItem(snapKey(u)) || 'null');
    return r && r.ok && Array.isArray(r.board) ? r : null;
  } catch (e) { return null; }
}
function writeSnap(u, r) {
  if (!u || !r || !r.ok) return;
  try { sessionStorage.setItem(snapKey(u), JSON.stringify(r)); } catch (e) {}
}
function readJobs(u) {
  try {
    const x = JSON.parse(sessionStorage.getItem(jobsKey(u)) || 'null');
    return x && x.ok && Array.isArray(x.jobs) ? x : null;
  } catch (e) { return null; }
}
function writeJobs(u, x) {
  if (!u || !x || !x.ok || !Array.isArray(x.jobs)) return;
  try { sessionStorage.setItem(jobsKey(u), JSON.stringify(x)); } catch (e) {}
}
function readInbox(u) {
  try {
    const x = JSON.parse(sessionStorage.getItem(inboxKey(u)) || 'null');
    return x && Array.isArray(x.items) ? x : null;
  } catch (e) { return null; }
}
function writeInbox(u, inbox) {
  if (!u) return;
  try {
    if (!inbox || !Array.isArray(inbox.items)) sessionStorage.removeItem(inboxKey(u));
    else sessionStorage.setItem(inboxKey(u), JSON.stringify({ items: inbox.items }));
  } catch (e) {}
}
function restoreJobs(u) {
  if (D.x && D.x.ok && Array.isArray(D.x.jobs)) return D.x;
  const saved = readJobs(u || D.user);
  if (saved) D.x = saved;
  return D.x && D.x.ok ? D.x : null;
}
let jobsAt = 0, jobsP = null, drillGen = 0;
function refreshJobs(u) { // one dashDrill at a time. A list already in memory is kept until this replaces it.
  const who = u || D.user;
  if (jobsP) return jobsP;
  if (D.x && D.x.ok && jobsAt && Date.now() - jobsAt < 20000) return Promise.resolve({ x: D.x, changed: false });
  D.jobsUpdating = true;
  jobsP = window.OYP.call('dashDrill', { what: 'jobs' }).then(x => {
    jobsP = null;
    D.jobsUpdating = false;
    jobsAt = Date.now();
    if (x && x.ok && Array.isArray(x.jobs)) {
      const changed = !samePayload(x, D.x);
      D.x = x; D.jobErr = ''; writeJobs(who, x);
      return { x, changed };
    }
    D.jobErr = (x && x.error) || 'Could not load';
    return { x: D.x, changed: false };
  }, () => { jobsP = null; D.jobsUpdating = false; return { x: D.x, changed: false }; });
  return jobsP;
}
function prefetchJobs(u) { // after the dashboard is on screen, so the first location / sales / pending tap is already warm
  const run = () => {
    if (!window.OYP.here()()) return;
    refreshJobs(u).then(() => {
      if (!window.OYP.here()() || currentDrill()[0]) return;
      const main = document.getElementById('main');
      if (!main) return;
      if (!D.updating) main.querySelectorAll('#dUpd, .dupd').forEach(n => n.remove());
      if (main.querySelector('#locRow')) paintLoc(main, window.OYP.esc);
      if (main.querySelector('#saleBody')) paintSales(main, window.OYP.esc);
    });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 400 });
  else setTimeout(run, 30);
}
function samePayload(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}
function ccSig(cc) {
  if (!cc || !cc.ok) return '';
  return [cc.missing, cc.total].concat(cc.missing_jos || []).join('\n');
}
let dashGen = 0;
function currentDrill() { return (location.hash.match(/^#\/dashboard\/(\w+)(?:\/([\w-]+))?/) || []).slice(1); }
function paintNow(main, u) {
  const drill = currentDrill();
  if (drill[0]) drillPage(main, u, drill[0], drill[1] || '', true);
  else draw(main, u);
}

async function render(main, u, fresh) { // fresh (Refresh) still paints what we have, then asks again
  const { call, esc } = window.OYP, live = window.OYP.here(); // live(): still on this route (app.js)
  const gen = ++dashGen;
  const still = () => live() && gen === dashGen;
  const drill = currentDrill();
  if (D.user && u && D.user.username !== u.username) { D.r = null; D.cc = null; D.inbox = null; D.mail = null; D.x = null; D.at = 0; jobsAt = 0; D.todo = null; D.todoAll = false; D.todoLoading = false; D.todoFilt = 'all'; D.todoOpen = ''; }
  D.user = u; D.ordOn = !!(u && u.role === 'admin');
  if (!D.r || !D.r.ok) { const saved = readSnap(u); if (saved) { D.r = saved; D.at = D.at || Date.now(); } }
  restoreJobs(u);
  if (!D.inbox) { const savedIn = readInbox(u); if (savedIn && savedIn.items.length) D.inbox = savedIn; }
  if (fresh) D.todoForce = true;
  const had = !!(D.r && D.r.ok);
  // portalSteps {inbox:1}: client approvals / questions (Portal.gs v3; admin + production manager). An older Portal.gs answers without
  // "inbox" -> no card. (portalSteps, not a new action name, so a server without v3 never sees an unknown action.)
  const pin = u && (u.role === 'admin' || u.role === 'production_manager');
  D.updating = had; // a saved answer is on screen while this round trip replaces it
  if (had) paintNow(main, u);
  else main.innerHTML = (drill[0] ? '' : '<h2>Dashboard</h2>') + '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const dashP = call('dashboard');
  const ccP = call('contactList'); // JobContact.gs (absent before that paste -> no tile). A drill does not wait for this.
  const piP = pin ? call('portalSteps', { inbox: 1 }) : Promise.resolve(null);
  ccP.then(cc => {
    if (!still() || ccSig(cc) === ccSig(D.cc)) return;
    D.cc = cc;
    if (still() && D.r && D.r.ok) paintNow(main, u);
  });
  piP.then(pi => {
    if (!still()) return;
    const inbox = (pi && pi.ok && pi.inbox && Array.isArray(pi.inbox.items)) ? pi.inbox : null;
    if (samePayload(inbox, D.inbox || null)) return;
    D.inbox = inbox; writeInbox(u, inbox);
    if (still() && !currentDrill()[0] && D.r && D.r.ok) draw(main, u); // messages sit on the dashboard, not on a drill
  });
  let r = null;
  try { r = await dashP; } catch (e) { r = null; }
  if (!still()) return;
  D.updating = false;
  if (r && r.ok) {
    const changed = !samePayload(r, D.r);
    D.r = r; D.at = Date.now(); writeSnap(u, r);
    if (changed) refreshJobs(u); // keep the jobs list on screen; the refresh replaces it
    if (!still()) return;
    if (changed || !had) paintNow(main, u);
    else if (!D.jobsUpdating) { const hint = main.querySelector('#dUpd'); if (hint) hint.remove(); }
    return;
  }
  if (had) { const hint = main.querySelector('#dUpd'); if (hint) hint.remove(); return; }
  main.innerHTML = `<h2>Dashboard</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for the dashboard yet.' : (r && r.error) || 'Could not load')}</p>`;
}
/* ---------- To do: its own read, after the dashboard has painted (Todo.gs todoList). ---------- */
const TODO_CHIPS = [['all', 'All'], ['appt', 'Appointments'], ['prod', 'Production'], ['pay', 'Payments'], ['quote', 'Quotes'], ['cons', 'Consignment'], ['stock', 'Stock & rate'], ['msg', 'Messages'], ['shop', 'Shop'], ['rev', 'To review']];
const TODO_BUCKET = { today: 'Today', week: 'This week', idea: 'Suggestions' };
const TODO_VIS = 8;
let todoGen = 0;
function todoRows() {
  const t = D.todo;
  return t && t.ok && Array.isArray(t.items) ? t.items : null;
}
function todoMark(esc, text) {
  return esc(text || '').replace(/(\d{2}-\d{3,}|CS-[\w-]+)/g, '<span style="white-space:nowrap">$1</span>');
}
function todoHold() {
  return `<section class="dcard todo" data-dsec="todo" aria-busy="true"><div class="dtitle"><span class="dname"><h3>To do</h3></span><span class="lab">Reminders · deadlines · suggestions</span></div><div class="skel tdskel" aria-label="Loading to do"><i></i><i></i><i></i></div></section>`;
}
function todoHtml(esc) {
  if (!D.todo) return todoHold();
  if (D.todo.ok === false) return `<section class="dcard todo" data-dsec="todo"><div class="dtitle"><span class="dname"><h3>To do</h3></span><span class="lab">Reminders · deadlines · suggestions</span></div><p class="muted">${esc(D.todo.error || 'Could not load')}</p></section>`;
  const T = window.OYPTodo;
  const all = (todoRows() || []).filter(it => !T || T.visible(it, D.user));
  const counts = {};
  all.forEach(it => { if (it.area && it.area !== 'manual') counts[it.area] = (counts[it.area] || 0) + 1; });
  let filt = D.todoFilt || 'all';
  if (filt !== 'all' && !counts[filt]) { filt = 'all'; D.todoFilt = 'all'; }
  const chips = TODO_CHIPS.filter(([k]) => k === 'all' || counts[k]);
  const shown = filt === 'all' ? all : all.filter(it => it.area === filt);
  const vis = !D.todoAll && shown.length > TODO_VIS ? shown.slice(0, TODO_VIS) : shown;
  const body = T ? T.listHtml(esc, vis, { user: D.user, today: T.today(), people: D.todo.people || [], openId: D.todoOpen, page: false }) : '<p class="muted">All clear.</p>';
  const more = shown.length > TODO_VIS ? `<button type="button" class="lnk tdall" data-td="all">${D.todoAll ? 'Show less' : 'Show all (' + shown.length + ')'}</button>` : '';
  const badge = D.todo.total > all.length ? D.todo.total : all.length;
  const add = T ? T.addBar(esc, D.todo.people || []) : '';
  return `<section class="dcard todo" data-dsec="todo"><div class="dtitle"><span class="dname"><h3>To do</h3><span class="tdcount">${badge}</span></span><span class="lab">Reminders · deadlines · suggestions</span></div>
    ${add}
    <div class="rvchips tdchips" role="tablist" aria-label="To do areas">${chips.map(([k, lab]) => `<button type="button" class="fchip${filt === k ? ' on' : ''}" data-tdf="${k}">${lab}<b>${k === 'all' ? all.length : counts[k]}</b></button>`).join('')}</div>
    ${body}
    ${more}
    <p class="muted tdfoot">Enter adds a to-do. Tick finishes one you typed. Tap any other line to open it. ⋯ gives Done or Snooze.</p></section>`;
}
function loadTodo(main, u) {
  const force = !!D.todoForce;
  D.todoForce = false;
  if (!force && D.todo && D.todo.ok && D.todoUser === (u && u.username)) return;
  if (!force && D.todoLoading && D.todoStill && D.todoStill()) return; // this visit already asked
  const gen = ++todoGen;
  const still = window.OYP.here();
  D.todoStill = still;
  D.todoLoading = true;
  D.todoUser = u && u.username;
  const apply = r => {
    if (gen !== todoGen) return;
    D.todoLoading = false;
    if (!still()) return;
    D.todo = r;
    if (main.querySelector('[data-dsec="todo"]')) paintTodo(main);
  };
  window.OYP.call('todoList').then(r => {
    apply((r && r.ok) ? r : { ok: false, items: [], total: 0, error: (r && r.error) || 'Could not load' });
  }).catch(() => apply({ ok: false, items: [], total: 0, error: 'Could not load' }));
}
function paintTodo(main) {
  const sec = main.querySelector('[data-dsec="todo"]');
  if (!sec) return;
  const inp = sec.querySelector('.tdaddin'), due = sec.querySelector('.tdadddue'), who = sec.querySelector('.tdaddwho');
  const draft = inp ? { text: inp.value, due: due ? due.value : '', who: who ? who.value : '', focus: document.activeElement === inp } : null;
  sec.outerHTML = todoHtml(window.OYP.esc);
  const next = main.querySelector('[data-dsec="todo"]');
  if (draft && next) {
    const a = next.querySelector('.tdaddin'), b = next.querySelector('.tdadddue'), c = next.querySelector('.tdaddwho');
    if (a) a.value = draft.text;
    if (b && draft.due) b.value = draft.due;
    if (c && draft.who) c.value = draft.who;
    if (draft.focus && a) a.focus();
  }
  wireTodo(main);
}
async function todoSubmitAdd(main, u) {
  const sec = main.querySelector('[data-dsec="todo"]');
  if (!sec || !D.todo || !D.todo.ok || !window.OYPTodo) return;
  const text = (sec.querySelector('.tdaddin') || {}).value.trim();
  const due = (sec.querySelector('.tdadddue') || {}).value || '';
  const assignee = (sec.querySelector('.tdaddwho') || {}).value || '';
  if (!text) return;
  const temp = 'tmp-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  const item = window.OYPTodo.fresh(u || D.user, { id: temp, text, due, assignee });
  D.todo.items = D.todo.items || [];
  D.todo.items.push(item);
  D.todo.items.sort(window.OYPTodo.compare);
  if (D.todo.total != null) D.todo.total++;
  const box = sec.querySelector('.tdaddin'), dueEl = sec.querySelector('.tdadddue'), whoEl = sec.querySelector('.tdaddwho');
  if (box) box.value = ''; if (dueEl) dueEl.value = ''; if (whoEl) whoEl.value = '';
  paintTodo(main);
  const r = await window.OYP.call('todoAdd', { text, due, assignee });
  const cur = (D.todo.items || []).find(x => x.id === temp);
  if (!r || !r.ok) {
    D.todo.items = (D.todo.items || []).filter(x => x.id !== temp);
    if (D.todo.total > 0) D.todo.total--;
    paintTodo(main);
    const again = main.querySelector('.tdaddin');
    if (again) { again.value = text; again.focus(); }
    return window.OYP.toast ? window.OYP.toast((r && r.error) || 'Could not save') : alert((r && r.error) || 'Could not save');
  }
  if (cur && r.item) Object.assign(cur, r.item);
  if (cur && cur._done && r.item) {
    const d = await window.OYP.call('todoDone', { id: r.item.id });
    if (d && d.ok) {
      D.todo.items = D.todo.items.filter(x => x.id !== r.item.id);
      if (D.todo.total > 0) D.todo.total--;
    }
  }
  paintTodo(main);
}
function todoGo(it) {
  if (it.jo && canOpen(D.user)) { openJO(it.jo, { jo: it.jo, description: it.text || '', client: '' }, 'To do'); return; }
  const href = it.href || '#/dashboard';
  if (href === '#dMsgs') {
    const el = document.getElementById('dMsgs');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (href.charAt(0) === '#') location.hash = href;
}
function wireTodo(main) {
  const sec = main.querySelector('[data-dsec="todo"]');
  if (!sec || sec.dataset.tdwire) return;
  sec.dataset.tdwire = '1';
  sec.addEventListener('submit', e => { if (e.target.closest('.tdadd')) { e.preventDefault(); todoSubmitAdd(main, D.user); } });
  sec.addEventListener('click', async e => {
    const chip = e.target.closest('[data-tdf]');
    if (chip) { e.preventDefault(); D.todoFilt = chip.dataset.tdf; D.todoOpen = ''; paintTodo(main); return; }
    const btn = e.target.closest('[data-td]');
    const row = e.target.closest('.tdrow');
    if (!btn && !row) return;
    if (e.target.closest('.tdadd')) return;
    const id = (btn && btn.dataset.id) || (row && row.dataset.id);
    const act = btn ? btn.dataset.td : 'go';
    if (act === 'all') { e.preventDefault(); D.todoAll = !D.todoAll; paintTodo(main); return; }
    const items = (todoRows() || []).concat((D.todo && D.todo.done) || []);
    const it = items.find(x => x.id === id);
    if (act === 'more') { e.preventDefault(); e.stopPropagation(); D.todoOpen = D.todoOpen === id ? '' : id; paintTodo(main); return; }
    if (act === 'tick') {
      e.preventDefault(); e.stopPropagation();
      if (!it || !it.manual) return;
      if (String(it.id).indexOf('tmp-') === 0) { it._done = 1; return; }
      D.todo.items = (D.todo.items || []).filter(x => x.id !== id);
      if (D.todo.total > 0) D.todo.total--;
      it.status = 'done';
      D.todo.done = ((D.todo.done || []).filter(x => x.id !== id)).concat([it]);
      D.todoOpen = '';
      paintTodo(main);
      const r = await window.OYP.call('todoDone', { id });
      if (!r || !r.ok) { D.todoForce = true; loadTodo(main, D.user); return window.OYP.toast ? window.OYP.toast((r && r.error) || 'Could not save') : alert((r && r.error) || 'Could not save'); }
      if (window.OYP.toast) window.OYP.toast('Done');
      return;
    }
    if (act === 'go' && it && it.manual) { e.preventDefault(); location.hash = '#/todo'; return; }
    if (act === 'done' || act === 'snooze') {
      e.preventDefault(); e.stopPropagation();
      if (btn) btn.disabled = true;
      const r = await window.OYP.call(act === 'done' ? 'todoDone' : 'todoSnooze', act === 'done' ? { id } : { id, until: btn.dataset.until });
      if (!r || !r.ok) { if (btn) btn.disabled = false; return window.OYP.toast ? window.OYP.toast((r && r.error) || 'Could not save') : alert((r && r.error) || 'Could not save'); }
      if (D.todo && Array.isArray(D.todo.items)) { D.todo.items = D.todo.items.filter(x => x.id !== id); if (D.todo.total > 0) D.todo.total--; }
      D.todoOpen = '';
      paintTodo(main);
      if (window.OYP.toast) window.OYP.toast(act === 'done' ? 'Done' : 'Snoozed');
      return;
    }
    if (!it) return;
    if (btn) e.preventDefault();
    todoGo(it);
  });
}
function draw(main, u) {
  const { esc } = window.OYP, r = D.r, cc = D.cc, live = window.OYP.here();
  if (!r || !r.ok) return;
  const noCC = new Set(cc && cc.ok ? cc.missing_jos : []);
  const c = r.counts || {}, can = r.can || {}, pb = c.pending_breakdown || {};
  D.user = u; D.ordOn = !!(u && u.role === 'admin');
  const when = new Date(r.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const pendNote = [pb.reviews && pb.reviews + ' to review', pb.past_due && pb.past_due + ' past due', pb.payments && plural(pb.payments, 'payment') + ' to confirm'].filter(Boolean).join(' · ') || 'All clear';
  const tile = (lab, val, note, cls = '', href = '') => href ? `<a class="kpi kpilink tap ${cls}" href="${href}"><span class="lab">${esc(lab)} ›</span><b>${esc(val)}</b><small>${esc(note || '')}</small></a>`
    : `<div class="kpi ${cls}"><span class="lab">${esc(lab)}</span><b>${esc(val)}</b><small>${esc(note || '')}</small></div>`;
  let h = `<div class="dhead"><h2>Dashboard</h2><span class="dheadacts"><button class="lnk" id="dRef">Refresh</button></span></div><p class="muted">${esc(when)} PHT${D.updating ? '<span id="dUpd"> · updating…</span>' : ''}</p>
  <div class="kpis">${tile('Active jobs', c.active_jobs, r.locations ? 'in production' : plural(r.board.reduce((s, b) => s + b.count, 0), 'open job'), '', '#/dashboard/active')}
  ${tile('Pending work', c.pending_work, pendNote, c.pending_work ? 'warn' : '', '#/dashboard/pending')}
  ${can.consign ? tile('Consigned out', c.consigned_out, plural(new Set((r.consignments || []).map(x => x.consignee)).size, 'consignee'), '', '#/dashboard/consigned') : ''}
  ${can.consign ? tile('Overdue', c.overdue_consignments, 'out over ' + r.overdue_days + ' days', c.overdue_consignments ? 'gold' : '', '#/dashboard/overdue') : ''}
  ${can.sales ? tile(monthName(r.sales.month) + ' sales', peso(c.month_sales), 'confirmed payments', '', '#/dashboard/sales/' + r.sales.month) : ''}
  ${cc && cc.ok ? `<a class="kpi ${cc.missing ? 'gold' : ''} kpilink" href="#/review" id="dNoCC" title="${esc(cc.missing ? 'No mobile or email on file: ' + cc.missing_jos.join(', ') : '')}"><span class="lab">No client contact</span><b>${esc(cc.missing)}</b><small>${esc(cc.missing ? 'of ' + cc.total + ' JOs · can\'t track their order' : 'every JO has a mobile or email')}</small></a>` : ''}</div>`;

  const parts = {};
  parts.todo = todoHtml(esc);
  // D.inbox is filled when portalSteps arrives. It is not cleared here, so a redraw keeps the messages already on screen.
  D.mail = (r && Object.prototype.hasOwnProperty.call(r, 'inquiries')) ? (Array.isArray(r.inquiries) ? r.inquiries : []) : null; // email: whoever the server already includes `inquiries` for
  parts.board = `<section class="dcard" data-dsec="board"><div class="dtitle"><span class="dname"><h3>Job board</h3></span><span class="lab">${r.locations ? 'In production · ' : ''}By stage · late first</span></div><div class="kanban">${r.board.map(col => `
    <div class="kcol"><a class="khead tap" href="#/dashboard/stage/${esc(col.key)}"><span class="lab">${esc(col.label)} ›</span><span class="kn">${col.count}</span></a>${col.cards.map(j => `
      <div class="kcard tap${j.late ? ' late' : ''}" data-jo="${esc(j.jo)}"><div class="kjo">${window.OYP.piece(j.client, j.jo)}${j.review ? '<span class="dot" title="Needs review"></span>' : ''}</div>
      <div class="kd">${esc(j.description || '—')}</div>
      <div class="kf">${j.due ? `<span class="chip ${j.late ? 'gold' : ''}">${j.late ? 'Late · ' : 'Due '}${esc(day(j.due))}</span>` : ''}${j.type === 'repair' ? '<span class="chip">Repair</span>' : ''}${j.review ? '<span class="chip">Review</span>' : ''}${noCC.has(j.jo) ? '<span class="chip nocc" title="No client mobile or email">No contact</span>' : ''}</div></div>`).join('') || '<div class="kempty">—</div>'}</div>`).join('')}</div></section>`;
  if (r.locations) {
    loadLoc(r.locations, u);
    parts.loc = `<section class="dcard" data-dsec="loc"><div class="dtitle"><span class="dname"><h3>Location</h3></span><span class="dlocacts"><span class="lab">All JOs${c.on_hand != null ? ' · ' + plural(c.on_hand, 'piece') + ' on hand' : ''}</span></span></div><div class="locrow" id="locRow"></div></section>`;
  }

  if (can.sales) {
    parts.sales = `<section class="dcard" data-dsec="sales"><div class="dtitle"><span class="dname"><h3>Sales</h3></span><span class="lab">Admin only</span></div>
      <div id="saleBody"></div></section>`;
  }

  if (can.consign) {
    const L = r.consignments || [];
    const owedSlot = (u && u.role === 'admin') ? '<div class="kpis dcowed" id="dConsignOwed" hidden></div>' : '';
    parts.consign = `<section class="dcard" data-dsec="consign"><div class="dtitle"><span class="dname"><h3>Consignment</h3></span><span class="csdash"><span class="lab">Items out · oldest first</span><a class="lnk" href="#/consignment">Open</a></span></div>${owedSlot}${L.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Item</span></th><th><span class="lab">With</span></th><th class="hm"><span class="lab">Out since</span></th><th><span class="lab">Days</span></th>${can.prices ? '<th class="hm r"><span class="lab">Value</span></th>' : ''}</tr></thead><tbody>${L.slice(0, 12).map(x => `
      <tr class="${x.overdue ? 'od' : ''}"><td><b class="cn">${esc(x.description || x.item_id)}</b><br><span class="muted">${esc(x.item_id)}</span>${x.jo ? '<br>' + window.OYP.piece(x.client, x.jo) : ''}</td><td>${esc(x.consignee || '—')}<br><span class="muted">${esc(x.consignment_id)}</span></td>
      <td class="hm">${esc(day(x.date_out))}</td><td>${x.overdue ? `<span class="chip gold">${x.days_out}<span class="hm"> · Overdue</span></span>` : esc(x.days_out == null ? '—' : x.days_out)}</td>${can.prices ? `<td class="hm r">${x.value ? esc(peso(x.value)) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${(r.missing || []).includes('Consignment') ? 'Consignment isn\'t set up yet.' : 'Nothing out on consignment.'}</p>`}</section>`;
  }

  if ((D.inbox && D.inbox.items.length) || D.mail) parts.msgs = messagesCard(esc);

  if (can.payments) {
    const P = r.payments || [];
    parts.pay = `<section class="dcard" data-dsec="pay"><div class="dtitle"><span class="dname"><h3>Recent payments</h3></span><span class="lab">Only confirmed ones count</span></div>${P.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Date</span></th><th><span class="lab">JO</span></th><th class="hm"><span class="lab">From</span></th><th class="hm"><span class="lab">Method</span></th><th class="r"><span class="lab">Amount</span></th><th><span class="lab">Status</span></th></tr></thead><tbody>${P.map(p => `
      <tr><td>${esc(day(p.date))}</td><td>${esc(p.jo)}</td><td class="hm">${esc(p.payer)}</td><td class="hm">${esc(p.method)}${p.source === 'telegram' ? ' <span class="muted">· Telegram</span>' : ''}</td><td class="r">${esc(peso(p.amount))}</td>
      <td><span class="chip ${p.status === 'pending' ? 'gold' : ''}">${esc(p.status === 'pending' ? 'To confirm' : p.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments yet.</p>'}</section>`;
  }

  h += `<div id="dsecs">${arrange(Object.keys(parts), D.ordOn ? readOrder(u) : null).map(id => parts[id]).join('')}</div>`;
  const miss = (r.missing || []).filter(t => !{ Settings: 1, Items: 1, Consignees: 1, Consignments: 1, ConsignmentItems: 1 }[t]); // Settings is optional. Items is inventory. Only a missing Consignment tab is a consignment warning.
  if (miss.length) h += `<p class="muted dmiss">Not set up in the Sheet yet: ${miss.map(esc).join(', ')}</p>`;
  main.innerHTML = h;
  main.querySelector('#dRef').onclick = () => { D.todoForce = true; render(main, u, true); };
  if (r.locations) paintLoc(main, esc);
  wireLayout(main, u);
  wireTodo(main);
  loadTodo(main, u);
  if (!(D.x && D.x.ok && jobsAt && Date.now() - jobsAt < 20000)) D.jobsUpdating = true;
  if ((r.locations || []).some(l => l.key === 'sold') && soldPeriod() !== 'all') ensureSales().then(() => { if (live() && main.querySelector('#locRow')) paintLoc(main, esc); });
  if (can.sales) { paintSales(main, esc); wireSales(main, esc); ensureSales().then(() => { if (live() && salesView() !== 'month') paintSales(main, esc); }); }
  main.querySelectorAll('.kcard[data-jo]').forEach(k => k.onclick = () => { const col = r.board.find(b => b.cards.some(x => x.jo === k.dataset.jo));
    openJO(k.dataset.jo, boardRow(col.cards.find(x => x.jo === k.dataset.jo), col), 'Dashboard'); });
  wireMessages(main, esc);
  const nc = main.querySelector('#dNoCC'); if (nc) nc.onclick = () => { try { sessionStorage.setItem('oypReviewFilter', 'nocontact'); } catch (_) {} };
  prefetchJobs(u);
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

/* ---------- Messages: portal ClientMessages + email inquiries, one list ---------- */
const agoT = iso => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return !(m >= 0) ? '' : m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : plural(Math.round(m / 1440), 'day') + ' ago'; };
const msgTime = x => { const t = Date.parse(x && x.at); return isNaN(t) ? 0 : t; };
function asEmail(x) { // fields the dashboard already sends, when an inquiry is an object. No new action.
  if (!x || typeof x !== 'object') return null;
  const subject = String(x.subject || ''), text = String(x.text || x.snippet || x.body || x.preview || '');
  const from = String(x.from || x.sender || x.name || ''), jo = String(x.jo || x.job || ''), url = String(x.url || x.link || x.href || '');
  if (!subject && !text && !from && !jo && !url) return null;
  const open = !x.status || String(x.status).toLowerCase() === 'open';
  return { src: 'email', id: String(x.id || x.inquiry_id || ''), at: String(x.at || x.date || x.received_at || x.received || x.time || ''), status: open ? 'open' : 'handled', jo, from, email: String(x.email || x.from_email || ''), text, subject, url };
}
function msgRows(view) {
  let rows = (D.inbox ? D.inbox.items.map(x => Object.assign({ src: 'portal' }, x)) : []).concat(D.mail ? D.mail.map(asEmail).filter(Boolean) : []);
  if (view === 'portal') rows = rows.filter(x => x.src === 'portal');
  if (view === 'email') rows = rows.filter(x => x.src === 'email');
  rows.sort((a, b) => msgTime(b) - msgTime(a));
  return rows;
}
function msgView() {
  const v = D.msgView || 'all';
  if (v === 'portal' && !D.inbox) return 'all';
  if (v === 'email' && !D.mail) return 'all';
  return v === 'portal' || v === 'email' ? v : 'all';
}
function messagesCard(esc) {
  const view = msgView(), rows = msgRows(view);
  const open = rows.filter(x => x.status === 'open'), done = rows.filter(x => x.status !== 'open').slice(0, 5);
  const allOpen = msgRows('all').filter(x => x.status === 'open');
  const pN = allOpen.filter(x => x.src === 'portal').length, eN = allOpen.filter(x => x.src === 'email').length;
  const counts = (allOpen.length ? allOpen.length + ' open' : 'All handled') + (D.inbox && D.mail ? ' · ' + pN + ' portal · ' + eN + ' email' : '');
  const chips = [['all', 'All']].concat(D.inbox ? [['portal', 'Portal']] : []).concat(D.mail ? [['email', 'Email']] : []);
  const row = x => {
    const portal = x.src === 'portal';
    const title = portal ? (x.kind === 'approval' ? 'Quote approved' : 'Question') + (x.jo ? ' · JO ' + x.jo : '') : (x.subject || 'Email') + (x.jo ? ' · JO ' + x.jo : '');
    const meta = portal
      ? `${esc(x.from)} · ${x.via === 'account' ? 'portal account' : x.via === 'staff' ? 'marked in the back office' + (x.marked_by ? ' by ' + esc(x.marked_by) : '') + (x.how ? ' (' + esc(String(x.how).replace('_', ' ')) + ')' : '') : x.via === 'telegram' ? 'marked via Tessa' + (x.marked_by ? ' by ' + esc(x.marked_by) : '') + (x.how ? ' (' + esc(String(x.how).replace('_', ' ')) + ')' : '') : 'Track my order'}${x.version ? ' · quote v' + x.version : ''}${x.amount != null ? ' · ' + peso(x.amount) : ''}${x.status !== 'open' && x.handled_by ? ' · handled by ' + esc(x.handled_by) : ''}`
      : `${esc(x.from || x.email || 'Email')}${x.email && x.from ? ' · ' + esc(x.email) : ''}`;
    const acts = [];
    if (x.jo) acts.push(`<button type="button" class="lnk cmjo" data-jo="${esc(x.jo)}" data-desc="${esc(portal ? x.text : (x.subject || x.text))}" data-from="${esc(x.from || '')}">Open JO</button>`);
    if (!portal && x.url) acts.push(`<a class="lnk" href="${esc(x.url)}" target="_blank" rel="noopener">Open email</a>`);
    if (portal && x.status === 'open') acts.push(`<button type="button" class="lnk cmok" data-id="${esc(x.id)}">Done</button>`);
    return `<div class="cmrow${x.status === 'open' ? '' : ' cmdone'}" data-src="${x.src}"><span class="cmico" aria-hidden="true">${portal ? (x.kind === 'approval' ? '✓' : '?') : '✉'}</span><div class="cmb">
      <div class="cmt"><span class="cmtl"><b>${esc(title)}</b><span class="chip">${portal ? 'Portal' : 'Email'}</span></span><span class="muted">${esc(agoT(x.at))}</span></div>
      <div class="cmx">${esc(portal ? x.text : (x.text || ''))}</div>
      <div class="muted">${meta}</div></div>${acts.length ? `<div class="cacts">${acts.join('')}</div>` : ''}</div>`;
  };
  const empty = !open.length && !done.length;
  const soon = D.mail && !mailCount() && (view === 'email' || (view === 'all' && empty));
  return `<section class="dcard" id="dMsgs" data-dsec="msgs"><div class="dtitle"><span class="dname"><h3>Messages</h3></span><span class="lab">${esc(counts)}${D.updating ? '<span class="dupd"> · updating…</span>' : ''}</span></div>
    <div class="msgf" role="tablist" aria-label="Message source">${chips.map(([k, lab]) => `<button type="button" role="tab" data-msrc="${k}" class="${view === k ? 'on' : ''}" aria-selected="${view === k ? 'true' : 'false'}">${lab}</button>`).join('')}</div>
    ${open.map(row).join('')}${done.length ? `<details class="cmold"><summary class="muted">Handled (${done.length})</summary>${done.map(row).join('')}</details>` : ''}
    ${empty && !soon ? '<p class="muted">No messages here.</p>' : ''}
    ${soon ? '<p class="muted">Emails about a job will show here, matched to their JO. Replies go out only when you press Send.</p>' : ''}
    ${D.inbox && view !== 'email' ? '<p class="muted dhint">The Telegram group gets each portal message too. Reply to the client yourself (phone / Viber / email); nothing is sent from here.</p>' : ''}</section>`;
}
function mailCount() { return D.mail ? D.mail.map(asEmail).filter(Boolean).length : 0; }
function paintMessages(main, esc) {
  const sec = main.querySelector('#dMsgs'); if (!sec) return;
  const open = sec.querySelector('.cmold') && sec.querySelector('.cmold').open;
  sec.outerHTML = messagesCard(esc);
  const next = main.querySelector('#dMsgs .cmold'); if (next && open) next.open = true;
  wireMessages(main, esc);
}
function wireMessages(main, esc) {
  const sec = main.querySelector('#dMsgs'); if (!sec || sec.dataset.msgwire) return;
  sec.dataset.msgwire = '1';
  sec.addEventListener('click', async e => {
    const tab = e.target.closest('[data-msrc]');
    if (tab) { e.preventDefault(); D.msgView = tab.dataset.msrc; paintMessages(main, esc); return; }
    const jo = e.target.closest('.cmjo');
    if (jo) { openJO(jo.dataset.jo, { jo: jo.dataset.jo, description: jo.dataset.desc || '', client: jo.dataset.from || '' }, 'Messages'); return; }
    const b = e.target.closest('.cmok'); if (!b) return;
    b.disabled = true; b.textContent = '…';
    const r = await window.OYP.call('portalInboxDone', { id: b.dataset.id });
    if (!r || !r.ok || !r.inbox || !Array.isArray(r.inbox.items)) { b.disabled = false; b.textContent = 'Done'; return window.OYP.toast ? window.OYP.toast((r && r.error) || 'Could not save') : alert((r && r.error) || 'Could not save'); }
    D.inbox = r.inbox;
    if (!r.inbox.items.length && !D.mail) { const s = main.querySelector('#dMsgs'); if (s) s.remove(); return; }
    paintMessages(main, esc);
  });
}
function wireLayout(main, u) {
  wireSoldPeriod(main);
  if (!main || !u || u.role !== 'admin' || !window.OYPLayoutEdit) return;
  const box = main.querySelector('#dsecs');
  if (box) window.OYPLayoutEdit.drag(box, '[data-dsec]', 'y', () => {
    writeOrder(u, [...box.children].filter(s => s.dataset && s.dataset.dsec).map(s => s.dataset.dsec));
  }, '.lctile, .lx, .layloc, .lcper, button, input, select, textarea, summary, a', '.dtitle');
  const row = main.querySelector('#locRow');
  if (row && D.loc) window.OYPLayoutEdit.drag(row, '[data-lkey]', 'x', () => {
    const visible = [...row.querySelectorAll('[data-lkey]')].map(el => el.dataset.lkey);
    D.loc.order = arrangeList(D.loc.order, D.loc.order, visible);
    saveLoc(u);
    paintLoc(main, window.OYP.esc);
  }, '.lx, .lcper');
  const sec = main.querySelector('[data-dsec="loc"]');
  if (sec && !sec.dataset.layhide) {
    sec.dataset.layhide = '1';
    sec.addEventListener('click', e => {
      if (!editing()) return;
      if (e.target.closest('#dLocReset')) {
        try { localStorage.removeItem(locStoreKey(u)); } catch (err) {}
        D.loc.order = D.loc.canon.slice(); D.loc.hide = new Set(); paintLoc(main, window.OYP.esc); return;
      }
      const show = e.target.closest('[data-lshow]');
      if (show) { D.loc.hide.delete(show.dataset.lshow); saveLoc(u); paintLoc(main, window.OYP.esc); return; }
      const hide = e.target.closest('[data-lhide]');
      if (!hide) return;
      const t = hide.closest('[data-lkey]'); if (!t) return;
      D.loc.hide.add(t.dataset.lkey); saveLoc(u); paintLoc(main, window.OYP.esc);
    });
  }
}
function relayout() {
  const main = document.getElementById('main');
  if (!main || !D.user || !main.querySelector('#dsecs')) return;
  if ((location.hash.match(/^#\/dashboard\/(\w+)/) || [])[1]) return;
  if (D.loc) paintLoc(main, window.OYP.esc);
  wireLayout(main, D.user);
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
async function extra() { // dashDrill jobs list. A saved copy is used at once; refreshJobs replaces it.
  restoreJobs(D.user);
  if (D.x && D.x.ok && jobsAt && Date.now() - jobsAt < 20000) return D.x;
  const got = await refreshJobs(D.user);
  return got && got.x && got.x.ok ? got.x : (D.x && D.x.ok ? D.x : null);
}
function needsPaste() {
  const e = D.jobErr || (D.x && D.x.error);
  return `<p class="muted rvnone">${window.OYP.esc(!e || e === 'Unknown action' ? 'This list needs the DashboardDrill paste in Apps Script (see the instructions). The count on the dashboard is right; the per-JO list is not sent yet.' : e)}</p>`;
}

async function drillPage(main, u, kind, key, keepScroll, quiet) {
  const { esc } = window.OYP, r = D.r, can = r.can, noCC = new Set(D.cc && D.cc.ok ? D.cc.missing_jos : []);
  const locLab = k => window.OYP.locLabel(k, ((r.locations || []).find(l => l.key === k) || {}).label);
  const allBoard = () => r.board.reduce((a, col) => a.concat(col.cards.map(j => boardRow(j, col))), []);
  const capped = cols => cols.filter(c => c.count > c.cards.length).map(c => c.label + ': first ' + c.cards.length + ' of ' + c.count).join(' · ');
  let title = '', sub = '', chips = [], groups = null, rows = [], note = '', body = '', show = { loc: true, stage: true };
  const live = window.OYP.here();
  const y = keepScroll ? (window.scrollY || 0) : 0;
  const gen = ++drillGen;
  restoreJobs(u);
  const x0 = (D.x && D.x.ok && Array.isArray(D.x.jobs)) ? D.x : null;
  const jobsFresh = !!(x0 && jobsAt && Date.now() - jobsAt < 20000);
  const usesJobs = kind === 'loc' || kind === 'sales' || kind === 'pending' || (kind === 'consigned' && r.counts && r.counts.consigned_jos);
  if (!quiet && usesJobs && !jobsFresh) D.jobsUpdating = true;
  const x = x0;

  if (kind === 'active' || kind === 'stage') {
    const col = kind === 'stage' ? r.board.find(b => b.key === key) : null;
    if (kind === 'stage' && !col) { location.hash = '#/dashboard'; return; }
    chips = [['#/dashboard/active', 'All active', r.board.reduce((s, b) => s + b.count, 0), kind === 'active']].concat(r.board.map(b => ['#/dashboard/stage/' + b.key, b.label, b.count, col === b]));
    show.loc = false;
    if (col) {
      title = col.label; sub = (r.locations ? 'In production · ' : '') + 'what is being done in this stage, late first';
      rows = col.cards.map(j => boardRow(j, col));
      const by = {}; rows.forEach(x => (by[x.stage_label] = by[x.stage_label] || []).push(x)); // what is being done: one group per stage step
      groups = Object.keys(by).map(k => [k, by[k]]); show.days = true; // the group already names the step
      note = capped([col]);
    } else {
      title = 'Active jobs'; sub = (r.locations ? 'In production' : 'Open jobs') + ' · by stage, late first';
      rows = allBoard(); groups = r.board.filter(b => b.cards.length).map(b => [b.label, rows.filter(x => x.col === b.key), '#/dashboard/stage/' + b.key]);
      note = capped(r.board);
    }
  } else if (kind === 'loc') {
    const period = key === 'sold' ? soldPeriod() : 'all';
    title = locLab(key); sub = key === 'unset' ? 'JOs with no location set' : period === 'year' ? 'Sold this year' : period === 'month' ? 'Sold this month' : 'JOs at this location';
    if (!x) { if (quiet) body = needsPaste(); }
    else {
      rows = x.jobs.filter(j => key === 'unset' ? !j.location || !(r.locations || []).some(l => l.key === j.location && l.key !== 'unset') : j.location === key);
      if (key === 'sold' && period !== 'all') { const byJo = saleDateByJo(x.sales); rows = rows.filter(j => soldInPeriod(jobSoldDay(j, byJo), period)); }
      if (key === 'working') groups = r.board.map(b => [b.label, rows.filter(j => j.col === b.key), '#/dashboard/stage/' + b.key]).filter(g => g[1].length);
    }
    const soldN = key === 'sold' && period !== 'all' && x ? rows.length : null;
    chips = (r.locations || []).filter(l => l.key === 'unset' ? locCount(l) > 0 : (l.count || l.key === key)).map(l => ['#/dashboard/loc/' + l.key, locLab(l.key), l.key === 'sold' && soldN != null ? soldN : l.count, l.key === key]);
    show.loc = false; show.stage = key === 'working';
    if (key === 'unset') note = 'The cards still to review are also in To review › Needs location.';
  } else if (kind === 'sales') {
    if (!can.sales) { location.hash = '#/dashboard'; return; }
    const m = (r.sales.months.find(x => x.month === key) || r.sales.months[r.sales.months.length - 1]).month;
    title = monthName(m) + ' ' + m.slice(0, 4) + ' sales'; show.stage = false;
    chips = r.sales.months.map(x => ['#/dashboard/sales/' + x.month, monthName(x.month), short(x.total), x.month === m]);
    if (!x) { if (quiet) body = needsPaste(); sub = 'Payments received this month: ' + peso((r.sales.months.find(y => y.month === m) || {}).total); }
    else if (!x.sales) body = '<p class="muted rvnone">Sales lists are for executives only.</p>';
    else {
      rows = x.sales.filter(y => y.month === m).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(y => Object.assign({}, y, { sale: true }));
      const tot = rows.reduce((t, y) => t + (Number(y.amount) || 0), 0), paid = (r.sales.months.find(y => y.month === m) || {}).total || 0;
      sub = plural(rows.length, 'JO') + ' sold · ' + peso(tot) + ' at full sale amount · payments received ' + peso(paid);
      note = 'Sold = an item sold, or a new job with at least a downpayment, counted at the full sale amount, in the month of the first payment (or of the sale). What is still owed is in the accounting tracker.';
    }
  } else if (kind === 'pending') {
    title = 'Pending work'; sub = 'To review, past due' + (can.payments ? ', payments to confirm' : '');
    const P = can.payments ? (r.payments || []).filter(p => p.status === 'pending') : [];
    if (!x) { if (quiet) body = needsPaste(); }
    else groups = [['To review', x.jobs.filter(j => j.review), '#/review'], ['Past due', x.jobs.filter(j => j.late)]];
    if (P.length) (groups = groups || []).push(['Payments to confirm', P.map(p => ({ jo: p.jo, description: peso(p.amount) + ' · ' + (p.payer || p.method || 'payment'), chips: ['Paid ' + day(p.date), p.method] }))]);
    if (groups) { groups = groups.filter(g => g[1].length); rows = groups.reduce((a, g) => a.concat(g[1]), []); }
  } else if (kind === 'consigned' || kind === 'overdue') {
    if (!can.consign) { location.hash = '#/dashboard'; return; }
    title = kind === 'overdue' ? 'Overdue consignments' : 'Consigned out'; sub = kind === 'overdue' ? 'Out over ' + r.overdue_days + ' days, oldest first' : 'Items and JOs out on consignment, oldest first';
    chips = [['#/dashboard/consigned', 'Consigned out', r.counts.consigned_out, kind === 'consigned'], ['#/dashboard/overdue', 'Overdue', r.counts.overdue_consignments, kind === 'overdue']];
    show.stage = false; show.loc = false;
    const L = (r.consignments || []).filter(c => kind === 'consigned' || c.overdue).map(c => ({ jo: c.jo, item: c.item_id, description: c.description || c.item_id, client: c.client, with: c.consignee,
      chips: [c.date_out ? 'Out ' + day(c.date_out) : '', c.days_out != null ? plural(c.days_out, 'day') : ''], gold: c.overdue ? 'Overdue' : '', value: can.prices && c.value ? peso(c.value) : '' }));
    groups = [['On consignment sheets', L]];
    if (kind === 'consigned' && r.counts.consigned_jos) { const out = new Set(L.map(c => c.jo));
      groups.push(['JOs marked Consigned', x ? x.jobs.filter(j => j.location === 'consigned' && !out.has(j.jo)) : []]); if (!x && quiet) body = needsPaste(); }
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
    return `<div class="rvrow dr ${go ? 'go tap' : ''}"${go ? ` data-jo="${esc(x.jo)}"` : ''}><div class="rvi"><div class="kjo">${x.jo ? window.OYP.piece(x.client, x.jo) : `<span class="muted">${esc(x.item || '—')}</span>`}${x.parent_jo ? `<span class="muted sm">of ${esc(x.parent_jo)}</span>` : ''}${x.item && x.jo ? `<span class="muted sm">${esc(x.item)}</span>` : ''}</div>
      <div class="kd">${esc(x.description || 'No details')}${x.with ? ' · ' + esc(x.with) : ''}</div><div class="kf">${c.join('')}</div></div>${go ? '<span class="chev">›</span>' : ''}</div>`;
  };
  const q = () => ((main.querySelector('#drQ') || {}).value || '').trim().toUpperCase();
  const hit = x => { const t = q(), name = x.client && typeof x.client === 'object' ? x.client.name : x.client; return !t || [x.jo, x.description, name, x.with, x.item].some(v => String(v || '').toUpperCase().includes(t)); };
  const list = () => {
    if (body) return body;
    const G = groups || [[null, rows]];
    const out = G.map(([lab, L, href]) => { L = L.filter(hit); if (!L.length && lab) return ''; return (lab ? `<div class="dgrp">${href ? `<a href="${href}" class="lab">${esc(lab)} ›</a>` : `<span class="lab">${esc(lab)}</span>`}<span class="kn">${esc(plural(L.length, 'item'))}</span></div>` : '') + L.map(row).join(''); }).join('');
    return out || `<p class="muted rvnone">${q() ? 'No match.' : 'Nothing here.'}</p>`;
  };
  const n = new Set(rows.map(x => x.jo || x.item)).size;
  main.innerHTML = `<div class="drill"><a class="lnk dback tap" href="#/dashboard">‹ Dashboard</a>
    <div class="dhead"><h2>${esc(title)}</h2><span class="lab">${body && !rows.length ? '' : esc(plural(n, 'item'))}</span></div>
    <p class="muted">${esc(sub)}${D.updating || D.jobsUpdating ? '<span id="dUpd"> · updating…</span>' : ''}</p>
    ${chips.length ? `<div class="rvchips">${chips.map(([h, lab, cnt, on]) => `<a class="fchip tap ${on ? 'on' : ''}" href="${h}">${esc(lab)} <b>${esc(cnt)}</b></a>`).join('')}</div>` : ''}
    ${rows.length > 6 ? '<input id="drQ" class="rvq" placeholder="Search JO, client or description">' : ''}
    <div class="rvrows" id="drRows">${list()}</div>
    ${note ? `<p class="muted dnote">${esc(note)}</p>` : ''}
    ${!open && rows.some(x => x.jo) ? '<p class="muted dnote">Opening a JO card is for admin and production manager.</p>' : ''}</div>`;
  const wire = () => main.querySelectorAll('.rvrow.go').forEach(el => el.onclick = () => openJO(el.dataset.jo, rows.find(x => x.jo === el.dataset.jo), title));
  const qi = main.querySelector('#drQ'); if (qi) qi.oninput = () => { main.querySelector('#drRows').innerHTML = list(); wire(); };
  wire(); scrollTo(0, y);
  const on = main.querySelector('.rvchips .fchip.on'); if (on) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.offsetLeft - 20; // phone: the picked chip in view
  if (quiet || !usesJobs || jobsFresh) return;
  if (!x && !rows.length && !body) main.innerHTML = '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const hash = location.hash;
  const res = await refreshJobs(u);
  if (gen !== drillGen || location.hash !== hash || !live()) return;
  D.jobsUpdating = false;
  if (!x || (res && res.changed)) return drillPage(main, u, kind, key, true, true);
  const hint = main.querySelector('#dUpd'); if (hint) hint.remove();
}
const SEC_LABEL = { todo: 'To do', msgs: 'Messages', loc: 'Location', sales: 'Sales', board: 'Job board', consign: 'Consignment', pay: 'Recent payments' };
function layoutLocState(list, u) {
  const canon = locCanon(list), byKey = {};
  (list || []).forEach(l => { if (l && l.key) byKey[l.key] = l; });
  let order = canon.slice(); const hide = [];
  const p = u && u.role === 'admin' ? readLocPref(u) : null;
  if (p) { order = arrangeList(canon, canon, p.order); p.hide.forEach(k => { if (canon.indexOf(k) >= 0 && hide.indexOf(k) < 0) hide.push(k); }); }
  return { canon, order, hide, byKey, custom: !!p };
}
// Settings › Layout turns editing on. While it is on, sections and tiles drag. The saved order applies either way.
window.OYPDash = { render, relayout, layout: {
  sections: {
    labels: SEC_LABEL,
    list: u => arrange(SEC_ORDER.slice(), u && u.role === 'admin' ? readOrder(u) : null),
    save: (u, ids) => writeOrder(u, ids),
    reset: u => { try { localStorage.removeItem(ordKey(u)); } catch (e) {} },
    custom: u => !!(u && readOrder(u))
  },
  locations: {
    fromList: layoutLocState,
    save: (u, order, hide, canon) => writeLocPref(u, order, hide, canon),
    reset: u => { try { localStorage.removeItem(locStoreKey(u)); } catch (e) {} },
    custom: u => !!(u && readLocPref(u)),
    name: locName,
    hidden: locHiddenKeys,
    setHidden: setLocHidden
  }
} };
})();
