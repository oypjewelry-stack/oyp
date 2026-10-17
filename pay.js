/* OYP back office: Quotes / payments (admin) and the accounting pages Payments, Quotes, Balances, Clients (billing).
   Server: Payments.gs (payData, payReceipt, paySave, payConfirm, payReject, payQuoteSent, payQuoteDraft). The server decides what a role
   may see (costs / SRP / margins: executives only) and may do; this file only draws what it gets.
   Only CONFIRMED payments count for balances. Auto-captured payments (Gmail, Telegram / Accountant) wait in "To confirm". */
(() => {
'use strict';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = n => n == null || n === '' ? '—' : '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); if (!m) return String(d); return MON[m - 1] + ' ' + dd + (y !== new Date().getFullYear() ? ', ' + y : ''); };
const when = d => { if (!d) return ''; const t = new Date(d); if (isNaN(t) || String(d).length <= 10) return day(d);
  return t.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const PASTE_NOTE = 'This page needs the Payments paste in Apps Script (see the instructions).';
const TABS = [['payments', 'Payments'], ['quotes', 'Quotes'], ['balances', 'Balances'], ['clients', 'Clients']];
const SRC = { manual: 'Recorded', gmail: 'Gmail', telegram: 'Telegram', accountant: 'Accountant' };
const STAT = { pending: 'To confirm', confirmed: 'Confirmed', rejected: 'Rejected' };
const PVIEWS = { pending: ['To confirm', p => p.status === 'pending'], confirmed: ['Confirmed', p => p.status === 'confirmed'], rejected: ['Rejected', p => p.status === 'rejected'], all: ['All', () => true] };
const QVIEWS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', replaced: 'Replaced', all: 'All' };
const BVIEWS = { owed: ['Owed', j => j.balance > 0.5], overdue: ['Overdue', j => j.overdue], paid: ['Paid in full', j => j.paid_in_full], noprice: ['No price yet', j => j.total == null], all: ['All', () => true] };
const S = { r: null, at: 0, tab: 'payments', pv: 'pending', src: '', q: '', open: null, form: null, qv: 'all', bv: 'owed', by: 'jo', cq: '', draft: null, rc: {} };
const $ = id => document.getElementById(id);
const methodLab = k => ((S.r && S.r.methods || []).find(m => m[0] === k) || [k, k || '—'])[1];
const kindLab = k => ((S.r && S.r.kinds || []).find(m => m[0] === k) || [k, k || ''])[1];
const job = jo => S.r.jobs.find(j => j.jo === jo);
const isAdmin = () => !!(S.r && S.r.can && S.r.can.exec);
let U = null;
const link = t => U && U.role === 'accounting' ? '#/' + t : t === 'payments' ? '#/payments' : '#/payments/' + t; // admin nav has one "Quotes / payments" entry
const narrow = () => innerWidth < 900;

async function load(force) {
  const { call } = window.OYP;
  if (!force && S.r && Date.now() - S.at < 60e3) return S.r;
  const r = await call('payData'); if (r && r.ok) { S.r = r; S.at = Date.now(); } return r;
}
async function render(main, u, page) {
  const { esc } = window.OYP, live = window.OYP.here(); U = u;
  const sub = (location.hash.match(/^#\/payments\/(\w+)/) || [])[1];
  const tab = page === 'payments' && TABS.some(t => t[0] === sub) ? sub : TABS.some(t => t[0] === page) ? page : 'payments';
  if (tab !== S.tab && !S.keep) { S.open = null; S.form = null; } if (tab !== S.tab) { S.draft = null; S.q = ''; } S.tab = tab;
  if (narrow() && !S.keep) { S.open = null; S.form = null; } S.keep = false;
  if (!S.r) main.innerHTML = `<h2>${esc(tab === 'payments' ? 'Payments' : TABS.find(t => t[0] === tab)[1])}</h2><p class="muted">Loading…</p>`;
  const r = await load(); if (!live()) return;
  if (!r || !r.ok) { main.innerHTML = `<h2>Payments</h2><p class="muted">${esc(!r || r.error === 'Unknown action' ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return; }
  draw(main);
}
async function refresh(main) { const live = window.OYP.here(); const r = await load(true); if (live() && r && r.ok) draw(main); }

function head() {
  const { esc } = window.OYP, r = S.r;
  const t = TABS.map(([k, l]) => `<a class="fchip ${k === S.tab ? 'on' : ''}" href="${link(k)}">${esc(l)}${k === 'payments' && r.counts.to_confirm ? `<b>${r.counts.to_confirm}</b>` : ''}</a>`).join('');
  const mon = todayPH().slice(0, 7), got = r.payments.filter(p => p.status === 'confirmed' && String(p.date).slice(0, 7) === mon).reduce((s, p) => s + (p.amount || 0), 0);
  const owed = r.jobs.reduce((s, j) => s + (j.balance > 0 ? j.balance : 0), 0), od = r.jobs.filter(j => j.overdue).length;
  const k = [[r.counts.to_confirm, 'To confirm', r.counts.to_confirm ? 'gold' : '', link('payments')], [peso(got), 'Received in ' + MON[Number(mon.slice(5)) - 1], '', ''],
    [peso(owed), 'Owed by clients', '', link('balances')], [od, 'Overdue JOs', od ? 'gold' : '', link('balances')]];
  if (r.sales_month) k.push([peso(r.sales_month.total), 'Sales in ' + MON[Number(mon.slice(5)) - 1] + ' · ' + r.sales_month.count + (r.sales_month.count === 1 ? ' job' : ' jobs'), '', '']);
  return `<div class="dhead"><h2>${S.tab === 'payments' && U.role !== 'accounting' ? 'Quotes / payments' : esc(TABS.find(x => x[0] === S.tab)[1] === 'Clients' ? 'Clients (billing)' : TABS.find(x => x[0] === S.tab)[1])}</h2></div>
    <div class="ptabs">${t}</div>
    ${r.setup ? '' : '<p class="muted pnote">No payments yet. The Payments tab is added to the Sheet with the first payment.</p>'}
    <div class="pkpis">${k.map(x => `<${x[3] ? 'a href="' + x[3] + '"' : 'div'} class="lc ${x[2]}"><span class="lab">${esc(x[1])}</span><b>${esc(String(x[0]))}</b></${x[3] ? 'a' : 'div'}>`).join('')}</div>`;
}
function draw(main) {
  const body = { payments: payTab, quotes: quoteTab, balances: balTab, clients: cliTab }[S.tab]();
  main.innerHTML = `<div class="pwrap ${S.open || S.form ? 'popen' : ''}">${head()}${body}</div>`;
  wire(main);
}

/* ---------- Payments ---------- */
function payShown() {
  const t = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return S.r.payments.filter(p => PVIEWS[S.pv][1](p) && (!S.src || p.source === S.src) &&
    (!t.length || (h => t.every(x => h.includes(x)))([p.pay_id, p.jo, p.suggested_jo, p.payer, p.client, p.reference, p.method, p.amount, p.note, p.match_note].join(' ').toLowerCase())));
}
function payRow(p) {
  const { esc } = window.OYP, jo = p.jo || p.suggested_jo;
  return `<div class="rvrow prow ${S.open === p.pay_id && !S.form ? 'on' : ''}" data-pay="${esc(p.pay_id)}"><div class="pamt ${p.status}">${esc(peso(p.amount))}</div>
    <div class="rvi"><div class="kjo">${p.jo ? 'JO ' + esc(p.jo) : p.suggested_jo ? '<span class="muted">JO?</span> ' + esc(p.suggested_jo) : '<span class="muted">No JO yet</span>'}<span class="muted sm">${esc(day(p.date))}</span></div>
    <div class="kd">${esc([p.payer || p.client, p.reference].filter(Boolean).join(' · ') || 'No name in the alert')}</div>
    <div class="kf"><span class="chip ${p.status === 'pending' ? 'gold' : p.status === 'rejected' ? 'arch' : ''}">${esc(STAT[p.status] || p.status)}</span><span class="chip">${esc(methodLab(p.method))}</span>${p.source !== 'manual' ? `<span class="chip">${esc(SRC[p.source] || p.source)}</span>` : ''}${p.has_receipt ? '<span class="chip">Receipt</span>' : ''}</div></div></div>`;
}
function payTab() {
  const { esc } = window.OYP, L = payShown(), cnt = k => S.r.payments.filter(PVIEWS[k][1]).length;
  if (!S.open && !S.form && !narrow()) { const f = L[0]; if (f) S.open = f.pay_id; }
  const srcs = [...new Set(S.r.payments.map(p => p.source))];
  return `<div class="rv ${S.open || S.form ? 'has-open' : ''}"><div class="rvlist">
    <div class="fbtns ptop"><button class="pill sm" data-rec>+ RECORD PAYMENT</button></div>
    <div class="rvchips">${Object.keys(PVIEWS).map(k => `<button class="fchip ${S.pv === k ? 'on' : ''}" data-pv="${k}">${PVIEWS[k][0]}<b>${cnt(k)}</b></button>`).join('')}</div>
    ${srcs.length > 1 ? `<div class="rvchips">${['', ...srcs].map(s => `<button class="fchip sm ${S.src === s ? 'on' : ''}" data-src="${esc(s)}">${esc(s ? SRC[s] || s : 'Any source')}</button>`).join('')}</div>` : ''}
    <input class="rvq" id="pq" placeholder="Search JO, name, reference, amount" value="${esc(S.q)}">
    <div class="rvrows">${L.map(payRow).join('') || `<p class="muted rvnone">${S.pv === 'pending' ? 'Nothing to confirm.' : 'No payments here.'}</p>`}</div>
    </div><div class="rvpanel">${S.form ? recForm() : S.open ? payPanel(S.r.payments.find(p => p.pay_id === S.open)) : '<div class="rvempty muted">Pick a payment</div>'}</div></div>`;
}
function joSummary(jo) {
  const { esc } = window.OYP, j = job(jo); if (!j) return jo ? `<p class="fnote muted">No JO ${esc(jo)} in the Sheet.</p>` : '';
  return `<div class="pjsum"><div><b>JO ${esc(j.jo)}</b> · ${esc(j.description || '')}<br><span class="muted">${esc(j.client || 'No client')}${j.due ? ' · due ' + esc(day(j.due)) : ''}</span></div>
    <div class="pjn"><span><span class="lab">Price</span>${j.total == null ? '<i class="muted">no accepted price</i>' : esc(peso(j.total))}</span><span><span class="lab">Paid</span>${esc(peso(j.paid))}</span>
    <span><span class="lab">Balance</span>${j.balance == null ? '—' : esc(peso(j.balance))}${j.overdue ? ' <span class="flag c">overdue</span>' : ''}</span></div>
    ${j.quoted != null ? `<p class="fnote muted">Quote sent: ${esc(peso(j.quoted))} (not accepted yet, so no balance).</p>` : ''}</div>`;
}
function joOptions(sel, extra) {
  const { esc } = window.OYP, seen = {}, o = [];
  (extra || []).forEach(c => { if (!c.jo || seen[c.jo]) return; seen[c.jo] = 1; const j = job(c.jo); o.push(`<option value="${esc(c.jo)}" ${c.jo === sel ? 'selected' : ''}>★ ${esc(c.jo)} · ${esc(j ? j.client || j.description : '')} · ${esc(c.note || '')}</option>`); });
  const rest = S.r.jobs.filter(j => !seen[j.jo]).sort((a, b) => (b.balance > 0) - (a.balance > 0) || (a.jo < b.jo ? 1 : -1));
  return `<option value="">Pick the JO…</option>${o.join('')}${o.length ? '<option disabled>──────────</option>' : ''}${rest.map(j => `<option value="${esc(j.jo)}" ${j.jo === sel ? 'selected' : ''}>${esc(j.jo)} · ${esc(j.client || '—')} · ${esc(j.description || '')}${j.balance > 0 ? ' · owes ' + esc(peso(j.balance)) : ''}</option>`).join('')}`;
}
function payPanel(p) {
  const { esc } = window.OYP; if (!p) return '<div class="rvempty muted">Pick a payment</div>';
  const pend = p.status === 'pending', jo = p.jo || p.suggested_jo, cands = [p.suggested_jo ? { jo: p.suggested_jo, note: 'suggested' } : null, ...(p.candidate_jos || [])].filter(Boolean);
  const rc = S.rc[p.pay_id];
  const recp = p.has_receipt ? `<button class="shot" data-big="${esc(p.pay_id)}"><span class="ph" style="${rc ? `background-image:url('${rc}')` : ''}">${rc ? '' : '<span class="muted sm">Loading receipt…</span>'}</span><span class="lab">Receipt</span></button>` : '';
  const facts = [['Source', (SRC[p.source] || p.source) + (p.source === 'manual' ? ' by ' + p.recorded_by : '') + ' · ' + when(p.recorded_at)], ['Payer', p.payer], ['Reference', p.reference],
    ['Method', methodLab(p.method)], ['Kind', kindLab(p.kind)], ['Note', p.note],
    p.status === 'confirmed' ? ['Confirmed', (p.confirmed_by || '') + ' · ' + when(p.confirmed_at)] : null, p.status === 'rejected' ? ['Rejected', p.updated_by + ' · ' + when(p.updated_at) + ': ' + p.reject_reason] : null].filter(x => x && x[1]);
  return `<button class="lnk rvback" data-close>‹ BACK</button>
    <div class="phd"><div><span class="lab">${esc(STAT[p.status])} · ${esc(p.pay_id)}</span><div class="pbig">${esc(peso(p.amount))}</div><span class="muted">${esc(day(p.date))}</span></div>${recp}</div>
    ${p.match_note && p.source !== 'manual' ? `<p class="pmatch ${p.suggested_jo || p.jo ? '' : 'none'}">${esc(p.match_note)}</p>` : ''}
    <div class="pfacts">${facts.map(f => `<div><span class="lab">${esc(f[0])}</span>${esc(f[1])}</div>`).join('')}</div>
    ${pend ? `<div class="pconf"><h3>Check and confirm</h3><p class="fnote muted">Only confirmed payments count toward balances, sales and the client's My Orders.</p>
      <div class="fsec ${jo ? '' : 'miss'}"><div class="flab"><span class="lab">JO</span>${p.suggested_jo ? '<span class="flag">suggested</span>' : ''}</div><select id="cJo">${joOptions(jo, cands)}</select></div>
      <div id="cSum">${joSummary(jo)}</div>
      <div class="fgrid"><div class="fsec"><span class="lab">Amount</span><input id="cAmt" inputmode="decimal" value="${esc(p.amount == null ? '' : p.amount)}"></div>
      <div class="fsec"><span class="lab">Date received</span><input id="cDate" type="date" value="${esc(p.date)}" max="${todayPH()}"></div>
      <div class="fsec"><span class="lab">Method</span><select id="cMeth">${S.r.methods.map(m => `<option value="${m[0]}" ${m[0] === p.method ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}</select></div>
      <div class="fsec"><span class="lab">Reference no.</span><input id="cRef" value="${esc(p.reference)}"></div>
      <div class="fsec"><span class="lab">Payer</span><input id="cPayer" value="${esc(p.payer)}"></div>
      <div class="fsec"><span class="lab">Kind</span><select id="cKind"><option value="">Work it out</option>${S.r.kinds.map(m => `<option value="${m[0]}" ${m[0] === p.kind ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}</select></div></div>
      <div class="fbtns"><button class="pill" data-confirm>CONFIRM</button><button class="pill outline" data-rejopen>REJECT</button></div>
      <div id="rej" class="hidden fsec"><span class="lab">Why reject?</span><input id="rWhy" placeholder="Duplicate / not a client payment / our own transfer">
      <div class="fbtns"><button class="pill outline sm" data-reject>REJECT PAYMENT</button></div></div></div>`
    : jo ? joSummary(jo) + (isAdmin() ? `<div class="fbtns"><button class="lnk" data-card="${esc(jo)}">OPEN JO CARD</button></div>` : '') : ''}`;
}
function recForm() {
  const { esc } = window.OYP, f = S.form;
  const quick = ['gcash', 'bank', 'cash', 'card'];
  return `<button class="lnk rvback" data-close>‹ BACK</button><h3 class="ph3">Record a payment</h3>
    <p class="fnote muted">For money you have seen (counter, bank app, GCash). It counts right away. Gmail and Telegram payments come in by themselves under To confirm.</p>
    <div class="fsec ${f.jo ? '' : 'miss'}"><span class="lab">JO</span><select id="fJo">${joOptions(f.jo)}</select></div><div id="fSum">${joSummary(f.jo)}</div>
    <div class="fgrid"><div class="fsec ${f.amount ? '' : 'miss'}"><span class="lab">Amount received (₱)</span><input id="fAmt" inputmode="decimal" placeholder="0" value="${esc(f.amount || '')}"></div>
    <div class="fsec"><span class="lab">Date received</span><input id="fDate" type="date" value="${esc(f.date || todayPH())}" max="${todayPH()}"></div></div>
    <div class="fsec"><span class="lab">How they paid</span><div class="seg">${quick.map(m => `<button data-m="${m}" class="${f.method === m ? 'on' : ''}">${esc(methodLab(m))}</button>`).join('')}</div>
      <select id="fMeth" class="pmore"><option value="">More…</option>${S.r.methods.filter(m => !quick.includes(m[0])).map(m => `<option value="${m[0]}" ${m[0] === f.method ? 'selected' : ''}>${esc(m[1])}</option>`).join('')}</select></div>
    <div class="fgrid"><div class="fsec"><span class="lab">Reference no.</span><input id="fRef" placeholder="GCash / bank ref" value="${esc(f.reference || '')}"></div>
    <div class="fsec"><span class="lab">Paid by</span><input id="fPayer" placeholder="Client name" value="${esc(f.payer || '')}"></div></div>
    <div class="fsec"><span class="lab">Receipt photo</span><label class="pfile"><input type="file" id="fPic" accept="image/*"><span>${f.pic ? '✓ ' + esc(f.picName || 'photo') + ' · change' : 'Add photo (saved to the JO folder)'}</span></label></div>
    <div class="fsec"><span class="lab">Note</span><input id="fNote" value="${esc(f.note || '')}"></div>
    <div class="fbtns"><button class="pill" data-save>SAVE PAYMENT</button><button class="lnk" data-close>Cancel</button></div>`;
}
function shrink(file) { // phone photos -> max 1600 px JPEG
  return new Promise((ok, no) => { const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => no(new Error('Not a picture')); img.src = url; });
}

/* ---------- Quotes ---------- */
function quoteTab() {
  const { esc } = window.OYP, t = S.q.trim().toLowerCase(), Q = S.r.quotes.filter(q => (S.qv === 'all' || q.status === S.qv) && (!t || [q.jo, q.client, q.description, q.amount].join(' ').toLowerCase().includes(t)));
  if (!S.open && !narrow() && Q[0]) S.open = Q[0].quote_id;
  const cnt = k => S.r.quotes.filter(q => k === 'all' || q.status === k).length;
  return `<div class="rv ${S.open ? 'has-open' : ''}"><div class="rvlist"><div class="rvchips">${Object.keys(QVIEWS).map(k => `<button class="fchip ${S.qv === k ? 'on' : ''}" data-qv="${k}">${QVIEWS[k]}<b>${cnt(k)}</b></button>`).join('')}</div>
    <input class="rvq" id="pq" placeholder="Search JO, client, piece" value="${esc(S.q)}">
    <div class="rvrows">${Q.map(q => `<div class="rvrow prow ${S.open === q.quote_id ? 'on' : ''}" data-q="${esc(q.quote_id)}"><div class="pamt">${esc(peso(q.amount))}</div>
      <div class="rvi"><div class="kjo">JO ${esc(q.jo)}<span class="muted sm">v${q.version}</span></div><div class="kd">${esc(q.client || '—')} · ${esc(q.description || '')}</div>
      <div class="kf"><span class="chip ${q.status === 'accepted' ? 'dark' : q.status === 'sent' ? 'gold' : q.status === 'replaced' ? 'arch' : ''}">${esc(QVIEWS[q.status] || q.status)}</span><span class="muted sm">${esc(when(q.updated_at))}</span></div></div></div>`).join('') || '<p class="muted rvnone">No quotes here.</p>'}</div>
    </div><div class="rvpanel">${S.open ? quotePanel(S.r.quotes.find(q => q.quote_id === S.open)) : '<div class="rvempty muted">Pick a quote</div>'}</div></div>`;
}
function quotePanel(q) {
  const { esc } = window.OYP; if (!q) return '<div class="rvempty muted">Pick a quote</div>';
  const ex = isAdmin(), others = S.r.quotes.filter(x => x.jo === q.jo && x.quote_id !== q.quote_id).sort((a, b) => b.version - a.version);
  const d = S.draft && S.draft.quote_id === q.quote_id ? S.draft : null;
  return `<button class="lnk rvback" data-close>‹ BACK</button>
    <div class="phd"><div><span class="lab">${esc(QVIEWS[q.status] || q.status)} · version ${q.version}</span><div class="pbig">${esc(peso(q.amount))}</div><span class="muted">JO ${esc(q.jo)} · ${esc(q.client || 'no client')}</span></div></div>
    <div class="pfacts"><div><span class="lab">Piece</span>${esc(q.description || '—')}</div><div><span class="lab">Saved</span>${esc(q.created_by)} · ${esc(when(q.created_at))}</div>
      ${q.updated_by && q.updated_at !== q.created_at ? `<div><span class="lab">Last change</span>${esc(q.updated_by)} · ${esc(when(q.updated_at))}</div>` : ''}
      ${ex && q.cost_total != null ? `<div><span class="lab">Cost</span>${esc(peso(q.cost_total))}${q.amount ? ' · margin ' + Math.round((1 - q.cost_total / q.amount) * 100) + '%' : ''}</div>` : ''}</div>
    ${joSummary(q.jo)}
    <div class="fbtns">${ex && q.status === 'draft' ? `<button class="pill" data-sent ${q.amount ? '' : 'disabled'}>MARK SENT</button>` : ''}
      ${ex && (q.status === 'sent' || q.status === 'draft') && q.amount ? '<button class="pill outline" data-accept>MARK ACCEPTED / JOB STARTED</button>' : ''}
      <button class="pill outline sm" data-draft>DRAFT EMAIL TO CLIENT</button></div>
    ${ex && q.status === 'draft' ? '<p class="fnote muted">Mark sent when you have given the client this price. They then see it in My Orders. No email is sent.</p>' : ''}
    ${!q.amount ? '<p class="fnote muted">No price on this version yet (set it in the cost estimator).</p>' : ''}
    ${d ? `<div class="pdraft"><span class="lab">Draft only · nothing was sent</span>
      <div class="fsec"><span class="lab">To</span><input id="dTo" value="${esc(d.to)}" placeholder="no email on file"></div><div class="fsec"><span class="lab">Subject</span><input id="dSub" value="${esc(d.subject)}"></div>
      <div class="fsec"><textarea id="dBody" rows="12">${esc(d.body)}</textarea></div><div class="fbtns"><button class="pill sm" data-copy>COPY</button><span class="muted sm">${esc(d.note)}</span></div></div>` : ''}
    ${others.length ? `<div class="rvother"><span class="lab">Other versions</span>${others.map(o => `<div class="rvrow oth"><span></span><span></span><div>v${o.version} · ${esc(peso(o.amount))} · <span class="chip">${esc(QVIEWS[o.status] || o.status)}</span></div></div>`).join('')}</div>` : ''}`;
}

/* ---------- Balances ---------- */
function balTab() {
  const { esc } = window.OYP, cnt = k => S.r.jobs.filter(BVIEWS[k][1]).length, t = S.q.trim().toLowerCase();
  const seg = `<div class="seg pseg"><button data-by="jo" class="${S.by === 'jo' ? 'on' : ''}">By JO</button><button data-by="client" class="${S.by === 'client' ? 'on' : ''}">By client</button></div>`;
  if (S.by === 'client') {
    const C = S.r.clients.filter(c => c.jos && (!t || [c.name, c.aliases, c.phone].join(' ').toLowerCase().includes(t)));
    return `${seg}<input class="rvq pq2" id="pq" placeholder="Search client" value="${esc(S.q)}"><div class="tw"><table class="dt ptbl"><thead><tr><th><span class="lab">Client</span></th><th class="r"><span class="lab">JOs</span></th><th class="r"><span class="lab">Total</span></th><th class="r"><span class="lab">Paid</span></th><th class="r"><span class="lab">Owed</span></th><th></th></tr></thead><tbody>
      ${C.map(c => `<tr class="${c.overdue ? 'od' : ''}" data-cl="${esc(c.client_id)}"><td><b class="cn">${esc(c.name)}</b></td><td class="r">${c.jos}</td><td class="r">${esc(peso(c.total))}</td><td class="r">${esc(peso(c.paid))}</td><td class="r"><b>${esc(peso(c.owed))}</b></td>
      <td>${c.overdue ? `<span class="chip gold">${c.overdue} overdue</span>` : ''}${c.no_price ? ` <span class="chip">${c.no_price} no price</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No clients with JOs.</td></tr>'}</tbody></table></div>`;
  }
  const J = S.r.jobs.filter(j => BVIEWS[S.bv][1](j) && (!t || [j.jo, j.client, j.description].join(' ').toLowerCase().includes(t)))
    .sort((a, b) => (b.overdue - a.overdue) || ((b.balance || 0) - (a.balance || 0)));
  if (!S.open && !narrow() && J[0]) S.open = J[0].jo;
  return `${seg}<div class="rv ${S.open ? 'has-open' : ''}"><div class="rvlist"><div class="rvchips">${Object.keys(BVIEWS).map(k => `<button class="fchip ${S.bv === k ? 'on' : ''}" data-bv="${k}">${BVIEWS[k][0]}<b>${cnt(k)}</b></button>`).join('')}</div>
    <input class="rvq" id="pq" placeholder="Search JO, client, piece" value="${esc(S.q)}">
    <div class="rvrows">${J.map(j => `<div class="rvrow prow ${S.open === j.jo ? 'on' : ''}" data-jo="${esc(j.jo)}"><div class="pamt ${j.overdue ? 'od' : ''}">${j.balance == null ? '<span class="muted">—</span>' : esc(peso(j.balance))}</div>
      <div class="rvi"><div class="kjo">JO ${esc(j.jo)}${j.overdue ? '<span class="dot"></span>' : ''}</div><div class="kd">${esc(j.client || 'No client')} · ${esc(j.description || '')}</div>
      <div class="kf">${j.overdue ? '<span class="chip gold">Overdue</span>' : ''}${j.paid_in_full ? '<span class="chip dark">Paid</span>' : ''}${j.total == null ? '<span class="chip">No price</span>' : `<span class="chip">of ${esc(peso(j.total))}</span>`}${j.due ? `<span class="muted sm">due ${esc(day(j.due))}</span>` : ''}</div></div></div>`).join('') || '<p class="muted rvnone">Nothing here.</p>'}</div>
    </div><div class="rvpanel">${S.open ? jobPanel(S.open) : '<div class="rvempty muted">Pick a JO</div>'}</div></div>`;
}
function payList(P) {
  const { esc } = window.OYP;
  return P.length ? `<div class="plist">${P.map(p => `<div class="pli ${p.status}" data-goto="${esc(p.pay_id)}"><span>${esc(day(p.date))}</span><span>${p.jo ? 'JO ' + esc(p.jo) : '<i>JO?</i> ' + esc(p.suggested_jo || '')}</span><span>${esc(methodLab(p.method))}</span><b>${esc(peso(p.amount))}</b>${p.status !== 'confirmed' ? `<span class="chip ${p.status === 'pending' ? 'gold' : 'arch'}">${esc(STAT[p.status])}</span>` : ''}</div>`).join('')}</div>` : '<p class="muted fnote">No payments yet.</p>';
}
function jobPanel(jo) {
  const { esc } = window.OYP, j = job(jo); if (!j) return '';
  const P = S.r.payments.filter(p => (p.jo === jo || (!p.jo && p.suggested_jo === jo)) && p.status !== 'rejected');
  return `<button class="lnk rvback" data-close>‹ BACK</button>${joSummary(jo)}
    <p class="fnote muted">${esc(j.total_src ? 'Price from the ' + j.total_src + '.' : 'No accepted price yet, so no balance. Accept a quote first.')}${j.overdue ? (j.location === 'sold' ? ' Overdue: piece already sold / released with a balance.' : ' Overdue: past the due date with a balance.') : ''}</p>
    <h3 class="ph3">Payments</h3>${payList(P)}
    <div class="fbtns"><button class="pill sm" data-recjo="${esc(jo)}">+ RECORD PAYMENT</button>${isAdmin() ? `<button class="lnk" data-card="${esc(jo)}">OPEN JO CARD</button>` : ''}</div>`;
}

/* ---------- Clients (billing) ---------- */
function cliTab() {
  const { esc } = window.OYP, t = S.q.trim().toLowerCase();
  const C = S.r.clients.filter(c => !t || [c.name, c.aliases, c.phone, c.email].join(' ').toLowerCase().includes(t));
  if (!S.open && !narrow() && C[0]) S.open = C[0].client_id;
  return `<div class="rv ${S.open ? 'has-open' : ''}"><div class="rvlist"><input class="rvq" id="pq" placeholder="Search name, phone, email" value="${esc(S.q)}">
    <div class="rvrows">${C.map(c => `<div class="rvrow prow ${S.open === c.client_id ? 'on' : ''}" data-cl="${esc(c.client_id)}"><div class="pamt ${c.overdue ? 'od' : ''}">${c.owed ? esc(peso(c.owed)) : '<span class="muted">₱0</span>'}</div>
      <div class="rvi"><div class="kjo">${esc(c.name)}</div><div class="kd">Paid ${esc(peso(c.paid))} · ${c.jos} JO${c.jos === 1 ? '' : 's'}</div>
      <div class="kf">${c.overdue ? `<span class="chip gold">${c.overdue} overdue</span>` : ''}${c.no_price ? `<span class="chip">${c.no_price} no price</span>` : ''}</div></div></div>`).join('') || '<p class="muted rvnone">No clients.</p>'}</div>
    </div><div class="rvpanel">${S.open ? cliPanel(S.r.clients.find(c => c.client_id === S.open)) : '<div class="rvempty muted">Pick a client</div>'}</div></div>`;
}
function cliPanel(c) {
  const { esc } = window.OYP; if (!c) return '';
  const J = S.r.jobs.filter(j => j.client_id === c.client_id), js = J.map(j => j.jo);
  const P = S.r.payments.filter(p => p.status !== 'rejected' && (js.includes(p.jo) || (!p.jo && js.includes(p.suggested_jo))));
  return `<button class="lnk rvback" data-close>‹ BACK</button><div class="phd"><div><span class="lab">Client</span><div class="pbig">${esc(c.name)}</div>
    <span class="muted">${esc([c.phone, c.email].filter(Boolean).join(' · ') || 'No phone or email')}</span></div></div>
    <div class="pjn pjn4"><span><span class="lab">Total</span>${esc(peso(c.total))}</span><span><span class="lab">Paid</span>${esc(peso(c.paid))}</span><span><span class="lab">Owed</span><b>${esc(peso(c.owed))}</b></span><span><span class="lab">Overdue</span>${c.overdue}</span></div>
    ${c.billing_info ? `<div class="pfacts"><div><span class="lab">Billing info</span>${esc(c.billing_info)}</div></div>` : ''}
    <h3 class="ph3">Job orders</h3><div class="plist">${J.map(j => `<div class="pli" data-jo2="${esc(j.jo)}"><span>JO ${esc(j.jo)}</span><span>${esc(j.description || '')}</span><span>${j.total == null ? 'no price' : 'of ' + esc(peso(j.total))}</span><b>${j.balance == null ? '—' : esc(peso(j.balance))}</b>${j.overdue ? '<span class="chip gold">Overdue</span>' : j.paid_in_full ? '<span class="chip dark">Paid</span>' : ''}</div>`).join('') || '<p class="muted fnote">No JOs.</p>'}</div>
    <h3 class="ph3">Payments</h3>${payList(P)}`;
}

/* ---------- events ---------- */
function wire(main) {
  const { call, toast, esc } = window.OYP, live = window.OYP.here();
  const re = () => draw(main), on = (sel, fn) => main.querySelectorAll(sel).forEach(el => el.onclick = e => fn(el, e));
  const q = $('pq'); if (q) q.oninput = () => { S.q = q.value; const p = q.selectionStart; re(); const n = $('pq'); n.focus(); n.setSelectionRange(p, p); };
  on('[data-pv]', b => { S.pv = b.dataset.pv; S.open = null; re(); });
  on('[data-src]', b => { S.src = b.dataset.src; S.open = null; re(); });
  on('[data-qv]', b => { S.qv = b.dataset.qv; S.open = null; S.draft = null; re(); });
  on('[data-bv]', b => { S.bv = b.dataset.bv; S.open = null; re(); });
  on('[data-by]', b => { S.by = b.dataset.by; S.open = null; re(); });
  on('[data-pay]', b => { S.open = b.dataset.pay; S.form = null; re(); if (narrow()) scrollTo(0, 0); });
  on('[data-q]', b => { S.open = b.dataset.q; S.draft = null; re(); if (narrow()) scrollTo(0, 0); });
  on('.rvrow[data-jo]', b => { S.open = b.dataset.jo; re(); if (narrow()) scrollTo(0, 0); });
  on('[data-cl]', b => { if (S.tab === 'balances') { S.keep = true; S.open = b.dataset.cl; location.hash = link('clients'); return; } S.open = b.dataset.cl; re(); if (narrow()) scrollTo(0, 0); });
  on('[data-jo2]', b => { S.keep = true; S.open = b.dataset.jo2; S.by = 'jo'; S.bv = 'all'; location.hash = link('balances'); });
  on('[data-goto]', b => { const p = S.r.payments.find(x => x.pay_id === b.dataset.goto); S.keep = true; S.open = p.pay_id; S.form = null; S.pv = p.status; S.src = ''; S.q = '';
    if (S.tab === 'payments') re(); else location.hash = link('payments'); });
  on('[data-close]', () => { S.open = null; S.form = null; S.draft = null; re(); });
  on('[data-rec]', () => { S.form = { method: 'gcash', date: todayPH() }; S.open = null; re(); if (narrow()) scrollTo(0, 0); });
  on('[data-recjo]', b => { const j = job(b.dataset.recjo); S.keep = true; S.form = { jo: j.jo, payer: j.client, method: 'gcash', date: todayPH() }; S.open = null; if (S.tab === 'payments') re(); else location.hash = link('payments'); });
  on('[data-card]', b => { try { sessionStorage.setItem('oypReviewOpen', JSON.stringify({ jo: b.dataset.card, back: location.hash, label: 'Back' })); } catch (_) {} location.hash = '#/review'; });
  // receipt thumbnail (Drive files are private: the server sends the picture)
  const big = main.querySelector('[data-big]');
  if (big) { const id = big.dataset.big;
    if (!S.rc[id]) call('payReceipt', { pay_id: id }).then(r => { if (!live()) return; S.rc[id] = r && r.src || 'data:,'; if (S.open === id) re(); });
    big.onclick = async () => { const r = await call('payReceipt', { pay_id: id, size: 'full' }); if (!r.src) return toast(r.error || 'No receipt');
      const o = document.createElement('div'); o.className = 'rvbig'; o.innerHTML = `<img src="${r.src}" alt="receipt">`; o.onclick = () => o.remove(); document.body.appendChild(o); }; }
  // confirm / reject
  const cj = $('cJo'); if (cj) cj.onchange = () => { $('cSum').innerHTML = joSummary(cj.value); cj.closest('.fsec').classList.toggle('miss', !cj.value); };
  on('[data-rejopen]', () => { $('rej').classList.remove('hidden'); $('rWhy').focus(); });
  const p = S.tab === 'payments' && S.open && S.r.payments.find(x => x.pay_id === S.open);
  const act = async (action, data, msg) => {
    const btns = main.querySelectorAll('.rvpanel .pill'); btns.forEach(b => b.disabled = true);
    const r = await call(action, data); btns.forEach(b => b.disabled = false);
    if (!r.ok) { toast(r.error); if (r.code === 'CONFLICT') refresh(main); return null; }
    toast(msg); if (live()) await refresh(main); return r;
  };
  on('[data-confirm]', () => { if (!$('cJo').value) { toast('Pick the JO this payment is for'); return $('cJo').focus(); }
    act('payConfirm', { pay_id: p.pay_id, base_updated_at: p.updated_at, jo: $('cJo').value, amount: $('cAmt').value, date: $('cDate').value, method: $('cMeth').value,
      reference: $('cRef').value, payer: $('cPayer').value, kind: $('cKind').value }, 'Confirmed: ' + peso($('cAmt').value) + ' to JO ' + $('cJo').value); });
  on('[data-reject]', () => { const why = $('rWhy').value.trim(); if (!why) return $('rWhy').focus(); act('payReject', { pay_id: p.pay_id, base_updated_at: p.updated_at, reason: why }, 'Rejected. It does not count anywhere.'); });
  // record form
  if (S.form) {
    const f = S.form, keep = () => { f.jo = $('fJo').value; f.amount = $('fAmt').value; f.date = $('fDate').value; f.reference = $('fRef').value; f.payer = $('fPayer').value; f.note = $('fNote').value; };
    $('fJo').onchange = () => { keep(); const j = job(f.jo); if (j && !f.payer) f.payer = j.client; re(); };
    on('[data-m]', b => { keep(); f.method = b.dataset.m; re(); });
    $('fMeth').onchange = () => { keep(); if ($('fMeth').value) f.method = $('fMeth').value; re(); };
    $('fPic').onchange = async () => { keep(); const file = $('fPic').files[0]; if (!file) return; try { f.pic = await shrink(file); f.picName = file.name; } catch (e) { toast(e.message); } if (live()) re(); };
    on('[data-save]', async b => { keep();
      if (!f.jo) { toast('Pick the JO'); return $('fJo').focus(); } if (!(Number(String(f.amount).replace(/[,₱]/g, '')) > 0)) { toast('Type the amount'); return $('fAmt').focus(); }
      const send = async dup => { b.disabled = true; const r = await call('paySave', { pay: { jo: f.jo, amount: f.amount, date: f.date, method: f.method, reference: f.reference, payer: f.payer, note: f.note },
        receipt_base64: f.pic ? f.pic.split(',')[1] : '', receipt_mime: 'image/jpeg', allow_duplicate: !!dup }); b.disabled = false; return r; };
      let r = await send(false);
      if (r.code === 'DUPLICATE') { if (!confirm(r.error)) return; r = await send(true); }
      if (!r.ok) return toast(r.error);
      toast('Saved ' + peso(f.amount) + ' to JO ' + f.jo + (r.job && r.job.balance != null ? ' · balance ' + peso(r.job.balance) : ''));
      S.form = null; S.open = r.pay_id; S.pv = 'confirmed'; S.src = ''; S.q = ''; if (live()) refresh(main); });
  }
  // quotes
  const qq = S.tab === 'quotes' && S.open && S.r.quotes.find(x => x.quote_id === S.open);
  on('[data-sent]', () => { if (!confirm('Mark JO ' + qq.jo + ' v' + qq.version + ' (' + peso(qq.amount) + ') as sent?\n\nThe client will see this price in My Orders. No email is sent.')) return;
    act('payQuoteSent', { quote_id: qq.quote_id, base_updated_at: qq.updated_at }, 'Marked sent. No email was sent.'); });
  on('[data-accept]', async () => { if (!confirm('Client accepted ' + peso(qq.amount) + ' for JO ' + qq.jo + ' and the job starts?\n\nThis becomes the price for the balance. Earlier accepted versions become "replaced".')) return;
    const r = await call('priceAccept', { quote_id: qq.quote_id, base_updated_at: qq.updated_at });
    if (!r.ok) return toast(r.error === 'Unknown action' ? 'Needs the Prices paste in Apps Script (Mark accepted lives there).' : r.error);
    toast('Accepted. JO ' + qq.jo + ' price is ' + peso(qq.amount)); if (live()) refresh(main); });
  on('[data-draft]', async () => { const r = await call('payQuoteDraft', { quote_id: qq.quote_id }); if (!r.ok) return toast(r.error); if (!live()) return;
    S.draft = Object.assign({ quote_id: qq.quote_id }, r); re(); });
  on('[data-copy]', async () => { const t = 'To: ' + $('dTo').value + '\nSubject: ' + $('dSub').value + '\n\n' + $('dBody').value;
    try { await navigator.clipboard.writeText(t); toast('Copied. Paste it into Gmail; nothing was sent.'); } catch (_) { $('dBody').select(); toast('Select all and copy'); } });
}
window.OYPPay = { render, pages: TABS.map(t => t[0]) };
})();
