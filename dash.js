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
const D = { r: null, cc: null, x: null, at: 0 };

async function render(main, u, fresh) {
  const { call, esc } = window.OYP, live = window.OYP.here(); // live(): still on this route (app.js)
  const drill = (location.hash.match(/^#\/dashboard\/(\w+)(?:\/([\w-]+))?/) || []).slice(1);
  if (drill[0] && D.r && !fresh && Date.now() - D.at < 5 * 60e3) return drillPage(main, u, drill[0], drill[1] || '');
  main.innerHTML = '<h2>Dashboard</h2><p class="muted">Loading…</p>';
  const [r, cc] = await Promise.all([call('dashboard'), call('contactList')]); // contactList: JobContact.gs (absent before that paste -> no tile)
  if (!live()) return; // the user went to another page while this loaded: leave it alone
  if (r && r.ok) { D.r = r; D.cc = cc; D.x = null; D.at = Date.now(); }
  if (drill[0] && r && r.ok) return drillPage(main, u, drill[0], drill[1] || '');
  const noCC = new Set(cc && cc.ok ? cc.missing_jos : []);
  if (!r || !r.ok) {
    main.innerHTML = `<h2>Dashboard</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for the dashboard yet.' : (r && r.error) || 'Could not load')}</p>`; return;
  }
  const c = r.counts, can = r.can, pb = c.pending_breakdown;
  const when = new Date(r.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const pendNote = [pb.reviews && pb.reviews + ' to review', pb.past_due && pb.past_due + ' past due', pb.payments && plural(pb.payments, 'payment') + ' to confirm'].filter(Boolean).join(' · ') || 'All clear';
  const tile = (lab, val, note, cls = '', href = '') => href ? `<a class="kpi kpilink tap ${cls}" href="${href}"><span class="lab">${esc(lab)} ›</span><b>${esc(val)}</b><small>${esc(note || '')}</small></a>`
    : `<div class="kpi ${cls}"><span class="lab">${esc(lab)}</span><b>${esc(val)}</b><small>${esc(note || '')}</small></div>`;
  let h = `<div class="dhead"><h2>Dashboard</h2><button class="lnk" id="dRef">Refresh</button></div><p class="muted">${esc(when)} PHT</p>
  <div class="kpis">${tile('Active jobs', c.active_jobs, r.locations ? 'being worked on' : plural(r.board.reduce((s, b) => s + b.count, 0), 'open job'), '', '#/dashboard/active')}
  ${tile('Pending work', c.pending_work, pendNote, c.pending_work ? 'warn' : '', '#/dashboard/pending')}
  ${can.consign ? tile('Consigned out', c.consigned_out, plural(new Set((r.consignments || []).map(x => x.consignee)).size, 'consignee'), '', '#/dashboard/consigned') : ''}
  ${can.consign ? tile('Overdue', c.overdue_consignments, 'out over ' + r.overdue_days + ' days', c.overdue_consignments ? 'gold' : '', '#/dashboard/overdue') : ''}
  ${can.sales ? tile(monthName(r.sales.month) + ' sales', peso(c.month_sales), 'confirmed payments', '', '#/dashboard/sales/' + r.sales.month) : ''}
  ${cc && cc.ok ? `<a class="kpi ${cc.missing ? 'gold' : ''} kpilink" href="#/review" id="dNoCC" title="${esc(cc.missing ? 'No mobile or email on file: ' + cc.missing_jos.join(', ') : '')}"><span class="lab">No client contact</span><b>${esc(cc.missing)}</b><small>${esc(cc.missing ? 'of ' + cc.total + ' JOs · can\'t track their order' : 'every JO has a mobile or email')}</small></a>` : ''}</div>`;

  if (r.locations) {
    const unset = r.locations.find(l => l.key === 'unset');
    h += `<section class="dcard"><div class="dtitle"><h3>Location</h3><span class="lab">All JOs${c.on_hand != null ? ' · ' + plural(c.on_hand, 'piece') + ' on hand' : ''}</span></div><div class="locrow">${r.locations.filter(l => l.key !== 'unset').map(l =>
      `<a class="lc tap ${l.key === 'working' ? 'cur' : ''}${l.key === 'archived' ? ' arch' : ''}" href="#/dashboard/loc/${esc(l.key)}"${l.key === 'archived' ? ' title="JO on record, no physical piece · not counted as on hand"' : ''}><b>${l.count}</b><span class="lab">${esc(l.label)} ›</span></a>`).join('')}${unset && unset.count ? `<a class="lc gold" href="#/review"><b>${unset.count}</b><span class="lab">No location yet ›</span></a>` : ''}</div></section>`;
  }

  if (can.sales) {
    const max = Math.max(1, ...r.sales.months.map(m => m.total));
    h += `<section class="dcard"><div class="dtitle"><h3>Sales</h3><span class="lab">Last 6 months · admin only</span></div><div class="bars">${r.sales.months.map((m, i, a) =>
      `<a class="bar tap${i === a.length - 1 ? ' cur' : ''}" href="#/dashboard/sales/${esc(m.month)}" title="JOs sold in ${esc(monthName(m.month))}"><span class="v">${esc(short(m.total))}</span><i style="height:${Math.max(2, Math.round(m.total / max * 100))}%"></i><span class="lab">${esc(monthName(m.month))}</span></a>`).join('')}</div><p class="muted dhint">Tap a month to see the JOs sold</p></section>`;
  }

  h += `<section class="dcard"><div class="dtitle"><h3>Job board</h3><span class="lab">${r.locations ? 'Being worked on · ' : ''}By stage · late first</span></div><div class="kanban">${r.board.map(col => `
    <div class="kcol"><a class="khead tap" href="#/dashboard/stage/${esc(col.key)}"><span class="lab">${esc(col.label)} ›</span><span class="kn">${col.count}</span></a>${col.cards.map(j => `
      <div class="kcard tap${j.late ? ' late' : ''}" data-jo="${esc(j.jo)}"><div class="kjo">${esc(j.jo)}${j.review ? '<span class="dot" title="Needs review"></span>' : ''}</div>
      <div class="kd">${esc(j.description || '—')}</div>${j.client ? `<div class="kc">${esc(j.client)}</div>` : ''}
      <div class="kf">${j.due ? `<span class="chip ${j.late ? 'gold' : ''}">${j.late ? 'Late · ' : 'Due '}${esc(day(j.due))}</span>` : ''}${j.type === 'repair' ? '<span class="chip">Repair</span>' : ''}${j.review ? '<span class="chip">Review</span>' : ''}${noCC.has(j.jo) ? '<span class="chip nocc" title="No client mobile or email">No contact</span>' : ''}</div></div>`).join('') || '<div class="kempty">—</div>'}</div>`).join('')}</div></section>`;

  if (can.consign) {
    const L = r.consignments || [];
    h += `<section class="dcard"><div class="dtitle"><h3>Consignment</h3><span class="lab">Items out · oldest first</span></div>${L.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Item</span></th><th><span class="lab">With</span></th><th class="hm"><span class="lab">Out since</span></th><th><span class="lab">Days</span></th>${can.prices ? '<th class="hm r"><span class="lab">Value</span></th>' : ''}</tr></thead><tbody>${L.slice(0, 12).map(x => `
      <tr class="${x.overdue ? 'od' : ''}"><td><b class="cn">${esc(x.description || x.item_id)}</b><br><span class="muted">${esc(x.item_id)}${x.jo ? ' · JO ' + esc(x.jo) : ''}</span></td><td>${esc(x.consignee || '—')}<br><span class="muted">${esc(x.consignment_id)}</span></td>
      <td class="hm">${esc(day(x.date_out))}</td><td>${x.overdue ? `<span class="chip gold">${x.days_out}<span class="hm"> · Overdue</span></span>` : esc(x.days_out == null ? '—' : x.days_out)}</td>${can.prices ? `<td class="hm r">${x.value ? esc(peso(x.value)) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${r.missing.includes('ConsignmentItems') ? 'Consignment isn\'t set up yet.' : 'Nothing out on consignment.'}</p>`}</section>`;
  }

  if (can.payments) {
    const P = r.payments || [];
    h += `<section class="dcard"><div class="dtitle"><h3>Recent payments</h3><span class="lab">Only confirmed ones count</span></div>${P.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Date</span></th><th><span class="lab">JO</span></th><th class="hm"><span class="lab">From</span></th><th class="hm"><span class="lab">Method</span></th><th class="r"><span class="lab">Amount</span></th><th><span class="lab">Status</span></th></tr></thead><tbody>${P.map(p => `
      <tr><td>${esc(day(p.date))}</td><td>${esc(p.jo)}</td><td class="hm">${esc(p.payer)}</td><td class="hm">${esc(p.method)}${p.source === 'telegram' ? ' <span class="muted">· Telegram</span>' : ''}</td><td class="r">${esc(peso(p.amount))}</td>
      <td><span class="chip ${p.status === 'pending' ? 'gold' : ''}">${esc(p.status === 'pending' ? 'To confirm' : p.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments yet.</p>'}</section>`;
  }

  if ('inquiries' in r) h += `<section class="dcard soon" id="dInq"><div class="dtitle"><h3>Email inquiries</h3><span class="lab">Coming soon</span></div><p class="muted">Emails about a job will show here, matched to their JO. Replies go out only when you press Send.</p></section>`;
  const miss = r.missing.filter(t => t !== 'Settings'); // Settings is optional (defaults apply)
  if (miss.length) h += `<p class="muted dmiss">Not set up in the Sheet yet: ${miss.map(esc).join(', ')}</p>`;
  main.innerHTML = h;
  main.querySelector('#dRef').onclick = () => render(main, u, true);
  main.querySelectorAll('.kcard[data-jo]').forEach(k => k.onclick = () => { const col = r.board.find(b => b.cards.some(x => x.jo === k.dataset.jo));
    openJO(k.dataset.jo, boardRow(col.cards.find(x => x.jo === k.dataset.jo), col), 'Dashboard'); });
  const nc = main.querySelector('#dNoCC'); if (nc) nc.onclick = () => { try { sessionStorage.setItem('oypReviewFilter', 'nocontact'); } catch (_) {} };
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
  main.innerHTML = '<p class="muted">Loading…</p>';

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
