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

async function render(main, u) {
  const { call, esc } = window.OYP;
  main.innerHTML = '<h2>Dashboard</h2><p class="muted">Loading…</p>';
  const r = await call('dashboard');
  if (!r || !r.ok) {
    main.innerHTML = `<h2>Dashboard</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for the dashboard yet.' : (r && r.error) || 'Could not load')}</p>`; return;
  }
  const c = r.counts, can = r.can, pb = c.pending_breakdown;
  const when = new Date(r.generated_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const pendNote = [pb.reviews && plural(pb.reviews, 'to review'), pb.past_due && pb.past_due + ' past due', pb.payments && plural(pb.payments, 'payment') + ' to confirm'].filter(Boolean).join(' · ') || 'All clear';
  const tile = (lab, val, note, cls = '') => `<div class="kpi ${cls}"><span class="lab">${esc(lab)}</span><b>${esc(val)}</b><small>${esc(note || '')}</small></div>`;
  let h = `<div class="dhead"><h2>Dashboard</h2><button class="lnk" id="dRef">Refresh</button></div><p class="muted">${esc(when)} PHT</p>
  <div class="kpis">${tile('Active jobs', c.active_jobs, plural(r.board.reduce((s, b) => s + b.count, 0), 'open job'))}
  ${tile('Pending work', c.pending_work, pendNote, c.pending_work ? 'warn' : '')}
  ${can.consign ? tile('Consigned out', c.consigned_out, plural(new Set((r.consignments || []).map(x => x.consignee)).size, 'consignee')) : ''}
  ${can.consign ? tile('Overdue', c.overdue_consignments, 'out over ' + r.overdue_days + ' days', c.overdue_consignments ? 'gold' : '') : ''}
  ${can.sales ? tile(monthName(r.sales.month) + ' sales', peso(c.month_sales), 'confirmed payments') : ''}</div>`;

  if (can.sales) {
    const max = Math.max(1, ...r.sales.months.map(m => m.total));
    h += `<section class="dcard"><div class="dtitle"><h3>Sales</h3><span class="lab">Last 6 months · admin only</span></div><div class="bars">${r.sales.months.map((m, i, a) =>
      `<div class="bar${i === a.length - 1 ? ' cur' : ''}"><span class="v">${esc(short(m.total))}</span><i style="height:${Math.max(2, Math.round(m.total / max * 100))}%"></i><span class="lab">${esc(monthName(m.month))}</span></div>`).join('')}</div></section>`;
  }

  h += `<section class="dcard"><div class="dtitle"><h3>Job board</h3><span class="lab">By stage · late first</span></div><div class="kanban">${r.board.map(col => `
    <div class="kcol"><div class="khead"><span class="lab">${esc(col.label)}</span><span class="kn">${col.count}</span></div>${col.cards.map(j => `
      <div class="kcard${j.late ? ' late' : ''}" data-jo="${esc(j.jo)}"><div class="kjo">${esc(j.jo)}${j.review ? '<span class="dot" title="Needs review"></span>' : ''}</div>
      <div class="kd">${esc(j.description || '—')}</div>${j.client ? `<div class="kc">${esc(j.client)}</div>` : ''}
      <div class="kf">${j.due ? `<span class="chip ${j.late ? 'gold' : ''}">${j.late ? 'Late · ' : 'Due '}${esc(day(j.due))}</span>` : ''}${j.type === 'repair' ? '<span class="chip">Repair</span>' : ''}${j.review ? '<span class="chip">Review</span>' : ''}</div></div>`).join('') || '<div class="kempty">—</div>'}</div>`).join('')}</div></section>`;

  if (can.consign) {
    const L = r.consignments || [];
    h += `<section class="dcard"><div class="dtitle"><h3>Consignment</h3><span class="lab">Items out · oldest first</span></div>${L.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Item</span></th><th><span class="lab">With</span></th><th class="hm"><span class="lab">Out since</span></th><th><span class="lab">Days</span></th><th class="hm r"><span class="lab">Value</span></th></tr></thead><tbody>${L.slice(0, 12).map(x => `
      <tr class="${x.overdue ? 'od' : ''}"><td><b class="cn">${esc(x.description || x.item_id)}</b><br><span class="muted">${esc(x.item_id)}${x.jo ? ' · JO ' + esc(x.jo) : ''}</span></td><td>${esc(x.consignee || '—')}<br><span class="muted">${esc(x.consignment_id)}</span></td>
      <td class="hm">${esc(day(x.date_out))}</td><td>${x.overdue ? `<span class="chip gold">${x.days_out}<span class="hm"> · Overdue</span></span>` : esc(x.days_out == null ? '—' : x.days_out)}</td><td class="hm r">${x.value ? esc(peso(x.value)) : '—'}</td></tr>`).join('')}</tbody></table></div>`
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
  main.querySelector('#dRef').onclick = () => render(main, u);
}
window.OYPDash = { render };
})();
