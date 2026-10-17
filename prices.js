/* OYP back office: Material prices (#/prices, #/prices/log, #/prices/history/<code>). Data: Prices.gs (priceGet etc.).
   The server already strips what a role may not see (markups, premium %, suggested rates are executives only); this file only draws. */
(() => {
'use strict';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = (n, d = 2) => n == null || n === '' || isNaN(n) ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-PH', { maximumFractionDigits: d });
const day = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return MON[m - 1] + ' ' + dd + (y !== new Date().getFullYear() ? ', ' + y : ''); };
const when = t => t ? new Date(t).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PHT' : '';
const pct = p => p == null ? '' : (p > 0 ? '+' : p < 0 ? '−' : '±') + num(Math.abs(p), 1) + '%';
const today = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const KIND = { rate: 'Rate change', purchase: 'Purchase', spot: 'Spot', feed: 'Feed', premium: 'Premium' };
const SRC = { manual: 'typed', last_bought: 'used last bought', suggested: 'used suggested', feed: 'daily feed' };
let P = null; // last priceGet

async function render(main, u) {
  const { call, esc } = window.OYP, parts = (location.hash.match(/^#\/prices\/(\w+)(?:\/(\w+))?/) || []).slice(1);
  main.innerHTML = '<h2>Material prices</h2><p class="muted">Loading…</p>';
  const r = await call('priceGet');
  if (!r || !r.ok) {
    main.innerHTML = `<h2>Material prices</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for material prices yet (Prices.gs paste).' : (r && r.error) || 'Could not load')}</p>`; return;
  }
  P = r; P.u = u;
  if (parts[0] === 'log') return logPage(main);
  if (parts[0] === 'history' && parts[1]) return historyPage(main, parts[1]);
  page(main);
}

function spotLine() {
  const { esc } = window.OYP, s = P.spot, o = s.usd_oz || {};
  const vals = `gold $${num(o.XAU)}/oz · silver $${num(o.XAG)} · platinum $${num(o.XPT)} · ₱${num(P.fx.feed, 2)}/$`;
  if (s.stale) return `<div class="pstale"><b>Spot prices are stale.</b> Last good read ${esc(when(s.ok_at) || 'never')}${s.error ? ' · feed: ' + esc(s.error) : ''}. Shown below: ${esc(vals)}. Your rates are not affected.
    ${P.exec ? '<button class="lnk" id="pRef">Try again now</button>' : ''}</div>`;
  return `<p class="muted pspot">Spot ${esc(vals)} · read ${esc(when(s.ok_at))} · ${esc(s.src)}${P.exec ? ' · <button class="lnk" id="pRef">Refresh</button>' : ''}</p>`;
}
const edit = (x, field = 'rate') => P.exec
  ? `<span class="pedit"><input inputmode="decimal" data-rid="${x.rate_id}" data-seen="${x[field] == null ? '' : x[field]}" value="${x[field] == null ? '' : x[field]}" placeholder="not set"><button class="pill sm hidden" data-save="${x.rate_id}">SAVE</button></span>`
  : `<b>${x[field] == null ? '<span class="muted">Not set</span>' : peso(x[field])}</b>`;
const chip = (p, warn = 5) => p == null ? '' : `<span class="chip ${Math.abs(p) > warn ? 'gold' : ''}" title="current rate vs this">${pct(p)}</span>`;

function page(main) {
  const { esc } = window.OYP, ex = P.exec;
  const metal = m => {
    const lb = m.last_bought;
    return `<div class="prow">
      <div class="pc pname"><b>${esc(m.label)}</b>${m.purity ? `<span class="muted sm">${num(m.purity * 100, 2)}% pure</span>` : '<span class="muted sm">no spot price</span>'}</div>
      <div class="pc"><span class="lab">Current ₱/g</span>${edit(m)}</div>
      <div class="pc"><span class="lab">Last bought</span>${lb ? `<span>${peso(lb.unit_price_php)} ${chip(m.vs_last_pct, 2)}</span><span class="muted sm">${esc(lb.supplier)} · ${esc(day(lb.date))}</span>${ex && lb.unit_price_php !== m.rate ? `<button class="lnk" data-use="${m.rate_id}" data-v="${lb.unit_price_php}" data-src="last_bought" data-seen="${m.rate == null ? '' : m.rate}">Use last bought</button>` : ''}` : '<span class="muted">No purchase yet</span>'}</div>
      <div class="pc"><span class="lab">Spot today</span>${m.spot_php_g ? `<span>${peso(m.spot_php_g)} ${chip(m.vs_spot_pct)}</span>` : '<span class="muted">—</span>'}</div>
      ${ex ? `<div class="pc"><span class="lab">Suggested</span>${m.suggested_php_g ? `<span>${peso(m.suggested_php_g)}</span><span class="muted sm prem">spot + <input inputmode="decimal" data-prem="${m.code}" value="${m.premium_pct}">%</span>${m.suggested_php_g !== m.rate ? `<button class="lnk" data-use="${m.rate_id}" data-v="${m.suggested_php_g}" data-src="suggested" data-seen="${m.rate == null ? '' : m.rate}">Use suggested</button>` : ''}` : '<span class="muted">—</span>'}</div>` : ''}
      <div class="pc pgo"><a class="lnk" href="#/prices/history/${m.code}">History ›</a></div></div>`;
  };
  const simple = (x, unitLab) => `<div class="prow p3"><div class="pc pname"><b>${esc(x.label)}</b></div><div class="pc"><span class="lab">${esc(unitLab(x))}</span>${edit(x)}</div><div class="pc pgo"><a class="lnk" href="#/prices/history/${x.code}">History ›</a></div></div>`;
  const fx = P.fx;
  main.innerHTML = `<div class="prices"><div class="dhead"><h2>Material prices</h2><a class="pill sm" href="#/prices/log">LOG PURCHASE</a></div>
    ${spotLine()}
    <p class="muted">The current rate is what the cost estimator uses.${ex ? ' Logging a purchase never changes it: use “Use last bought” to apply one.' : ' Only an executive changes rates; logging a purchase records what you paid.'}</p>
    <section class="dcard"><div class="dtitle"><h3>Metals</h3><span class="lab">₱ per gram</span></div>
      <div class="prows ${ex ? 'ex' : ''}"><div class="prow phd"><span class="lab">Material</span><span class="lab">Current</span><span class="lab">Last bought</span><span class="lab">Spot today</span>${ex ? '<span class="lab">Suggested</span>' : ''}<span></span></div>${P.metals.map(metal).join('')}</div></section>
    <section class="dcard"><div class="dtitle"><h3>Exchange rate</h3><span class="chip ${fx.mode === 'auto' ? '' : 'gold'}">${fx.mode === 'auto' ? 'Auto · daily feed' : 'Set by hand'}</span></div>
      <div class="prow p3"><div class="pc pname"><b>USD → PHP</b><span class="muted sm">feed ${fx.feed ? '₱' + num(fx.feed, 4) : '—'}${fx.feed_at ? ' · ' + esc(when(fx.feed_at)) : ''}</span></div>
      <div class="pc"><span class="lab">Used for stones</span>${edit(fx)}${ex && fx.mode !== 'auto' ? '<button class="lnk" id="fxAuto">Back to auto</button>' : ''}</div><div class="pc pgo"><a class="lnk" href="#/prices/history/usd_php">History ›</a></div></div></section>
    <section class="dcard"><div class="dtitle"><h3>Stones</h3><span class="lab">USD per carat · or ₱ per piece</span></div>${P.stones.map(s => simple(s, x => x.unit === 'PHP/pc' ? '₱ per piece' : 'USD per carat')).join('')}
      ${ex ? `<div class="addrow padd"><input id="stN" placeholder="Stone (e.g. Ruby)"><select id="stU"><option value="USD/ct">USD per carat</option><option value="PHP/pc">₱ per piece (pearls)</option></select><input id="stR" inputmode="decimal" placeholder="price (optional)" size="10"><button class="pill sm outline" id="stAdd">ADD STONE TYPE</button></div>` : ''}</section>
    <section class="dcard"><div class="dtitle"><h3>Labor</h3><span class="lab">₱ per hour, per worker</span></div>${P.labor.map(l => simple(l, () => '₱ per hour')).join('')}</section>
    ${ex && P.markups ? `<section class="dcard"><div class="dtitle"><h3>Markups</h3><span class="lab">Executives only</span></div>${P.markups.map(m => `<div class="prow p3"><div class="pc pname"><b>${esc(m.label)}</b></div><div class="pc"><span class="lab">×</span>${edit(m, 'markup')}</div><div class="pc pgo"><a class="lnk" href="#/prices/history/${m.code}">History ›</a></div></div>`).join('')}</section>` : ''}
    <section class="dcard"><div class="dtitle"><h3>Recent purchases</h3><a class="lnk" href="#/prices/log">+ Log purchase</a></div>${P.purchases.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Date</span></th><th><span class="lab">Supplier</span></th><th><span class="lab">What</span></th><th class="r"><span class="lab">Qty</span></th><th class="r"><span class="lab">Price</span></th><th class="r hm"><span class="lab">Total</span></th><th class="hm"><span class="lab">By</span></th></tr></thead><tbody>${P.purchases.map(p => `
      <tr><td>${esc(day(p.date))}</td><td>${esc(p.supplier)}</td><td>${esc(p.material)}</td><td class="r">${p.weight_g ? num(p.weight_g) + ' g' : num(p.qty) + ' ' + esc(p.unit)}</td><td class="r">${peso(p.unit_price_php)}${p.unit === 'g' ? '/g' : ''}</td><td class="r hm">${peso(p.total_php, 0)}</td><td class="hm">${esc(p.created_by)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No purchases yet.</p>'}</section></div>`;
  wire(main);
}

function wire(main) {
  const { call, toast } = window.OYP;
  const saveRate = async (rid, v, seen, source) => {
    const fxRow = P.fx.rate_id === rid;
    const r = fxRow ? await call('priceFx', { rate: v }) : await call('priceSaveRate', { rate_id: rid, rate: v, seen, source });
    if (!r || !r.ok) { toast((r && r.error) || 'Could not save'); if (r && r.code === 'CONFLICT') render(main, P.u); return; }
    toast(fxRow ? 'Exchange rate set by hand · stays until Back to auto' : 'Saved'); render(main, P.u);
  };
  main.querySelectorAll('input[data-rid]').forEach(i => i.oninput = () => { const b = main.querySelector(`[data-save="${i.dataset.rid}"]`); if (b) b.classList.toggle('hidden', i.value === i.dataset.seen); });
  main.querySelectorAll('[data-save]').forEach(b => b.onclick = () => { const i = main.querySelector(`input[data-rid="${b.dataset.save}"]`); saveRate(b.dataset.save, i.value, i.dataset.seen, 'manual'); });
  main.querySelectorAll('[data-use]').forEach(b => b.onclick = () => saveRate(b.dataset.use, b.dataset.v, b.dataset.seen, b.dataset.src));
  main.querySelectorAll('[data-prem]').forEach(i => i.onchange = async () => { const r = await call('pricePremium', { code: i.dataset.prem, pct: i.value }); toast(r && r.ok ? 'Premium saved' : (r && r.error) || 'Could not save'); render(main, P.u); });
  const ref = main.querySelector('#pRef'); if (ref) ref.onclick = async () => { ref.textContent = 'Reading…'; const r = await call('priceRefresh'); toast(r && r.ok ? (r.note || (r.spot.ok ? 'Spot prices updated' : 'Feed still down: kept the last good prices')) : (r && r.error) || 'Could not refresh'); render(main, P.u); };
  const fa = main.querySelector('#fxAuto'); if (fa) fa.onclick = async () => { const r = await call('priceFx', { auto: true }); toast(r && r.ok ? 'Exchange rate follows the daily feed again' : (r && r.error)); render(main, P.u); };
  const sa = main.querySelector('#stAdd'); if (sa) sa.onclick = async () => { const r = await call('priceStoneAdd', { label: main.querySelector('#stN').value, unit: main.querySelector('#stU').value, rate: main.querySelector('#stR').value }); toast(r && r.ok ? 'Stone type added' : (r && r.error) || 'Could not add'); if (r && r.ok) render(main, P.u); };
}

function logPage(main) {
  const { esc, call, toast } = window.OYP;
  const opts = [['Metals', P.metals.map(m => [m.code, m.label, 'g'])], ['Stones', P.stones.map(s => [s.code, s.label.replace(/ \(.*\)$/, ''), s.unit])]];
  main.innerHTML = `<div class="prices plog"><a class="lnk dback" href="#/prices">‹ Material prices</a><h2>Log purchase</h2>
    <p class="muted">What was bought, from whom, at what price. It shows as “last bought”; the current rate only changes when an executive applies it.</p>
    <div class="fgrid">
      <label class="fsec"><span class="lab">Date</span><input type="date" id="lpD" value="${today()}"></label>
      <label class="fsec"><span class="lab">Supplier</span><input id="lpS" list="lpSup" placeholder="e.g. Goldline Trading" autocomplete="off"><datalist id="lpSup">${P.suppliers.map(s => `<option>${esc(s)}</option>`).join('')}</datalist></label>
      <label class="fsec full"><span class="lab">What</span><select id="lpC">${opts.map(([g, L]) => `<optgroup label="${g}">${L.map(([c, l, u]) => `<option value="${c}" data-u="${u}">${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="fsec"><span class="lab" id="lpQL">Grams</span><input id="lpQ" inputmode="decimal" placeholder="50"></label>
      <label class="fsec"><span class="lab" id="lpPL">₱ per gram</span><input id="lpP" inputmode="decimal" placeholder="8,890"></label>
      <label class="fsec"><span class="lab">Total ₱</span><input id="lpT" inputmode="decimal" placeholder="auto"></label>
      <label class="fsec full"><span class="lab">Note (optional)</span><input id="lpN" placeholder="receipt no., lot, anything"></label>
    </div>
    <div class="fbtns"><button class="pill" id="lpSave">SAVE PURCHASE</button><a class="lnk" href="#/prices">Cancel</a></div></div>`;
  const $ = id => main.querySelector('#' + id), n = v => Number(String(v).replace(/,/g, '')) || 0;
  const unit = () => $('lpC').selectedOptions[0].dataset.u;
  const lab = () => { const u = unit(); $('lpQL').textContent = u === 'g' ? 'Grams' : u === 'PHP/pc' ? 'Pieces' : 'Carats'; $('lpPL').textContent = u === 'g' ? '₱ per gram' : u === 'PHP/pc' ? '₱ per piece' : '₱ per carat'; };
  let last = 'p';
  const sync = () => { const q = n($('lpQ').value); if (!q) return; if (last === 'p' && n($('lpP').value)) $('lpT').value = (Math.round(q * n($('lpP').value) * 100) / 100).toLocaleString('en-PH'); if (last === 't' && n($('lpT').value)) $('lpP').value = (Math.round(n($('lpT').value) / q * 100) / 100).toLocaleString('en-PH'); };
  $('lpC').onchange = lab; $('lpQ').oninput = sync; $('lpP').oninput = () => { last = 'p'; sync(); }; $('lpT').oninput = () => { last = 't'; sync(); }; lab();
  $('lpSave').onclick = async () => {
    const u = unit(), q = n($('lpQ').value), body = { date: $('lpD').value, supplier: $('lpS').value, code: $('lpC').value, note: $('lpN').value, unit: u === 'PHP/pc' ? 'pc' : u === 'g' ? 'g' : 'ct' };
    if (u === 'g') body.weight_g = q; else body.qty = q;
    if (last === 't' && n($('lpT').value)) body.total_php = n($('lpT').value); else body.unit_price_php = n($('lpP').value);
    $('lpSave').disabled = true; const r = await call('purchaseLog', body); $('lpSave').disabled = false;
    if (!r || !r.ok) return toast((r && r.error) || 'Could not save');
    toast('Purchase saved · ' + peso(r.total_php, 0) + ' · current rate unchanged'); location.hash = '#/prices';
  };
}

async function historyPage(main, code) {
  const { esc, call } = window.OYP;
  const r = await call('priceHistory', { code });
  if (!r || !r.ok) { main.innerHTML = `<div class="prices"><a class="lnk dback" href="#/prices">‹ Material prices</a><p class="muted">${esc((r && r.error) || 'Could not load')}</p></div>`; return; }
  const H = r.history, isMoney = r.unit !== 'x', fmt = v => v == null ? '—' : r.unit === 'x' ? '×' + num(v) : r.unit === 'USD/ct' ? '$' + num(v) : peso(v);
  // chart: last 120 days, rate as a step line, spot dots, purchases as squares
  const pts = H.filter(h => h.new_rate != null && ['rate', 'spot', 'purchase', 'feed'].includes(h.kind)).map(h => ({ t: Date.parse(h.at), v: h.new_rate, k: h.kind })).filter(p => p.t > Date.now() - 120 * 864e5);
  let chart = '';
  if (pts.length > 1) {
    const W = 640, Hh = 160, t0 = Math.min(...pts.map(p => p.t)), t1 = Math.max(Date.now(), ...pts.map(p => p.t)), vs = pts.map(p => p.v), lo = Math.min(...vs) * 0.98, hi = Math.max(...vs) * 1.02;
    const X = t => 30 + (t - t0) / Math.max(1, t1 - t0) * (W - 40), Y = v => 10 + (hi - v) / Math.max(1e-9, hi - lo) * (Hh - 30);
    const rate = pts.filter(p => p.k === 'rate' || (r.code === 'usd_php' && p.k === 'feed')).sort((a, b) => a.t - b.t);
    let d = ''; rate.forEach((p, i) => { d += (i ? `H${X(p.t).toFixed(1)}V${Y(p.v).toFixed(1)}` : `M${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`); }); if (rate.length) d += `H${X(t1).toFixed(1)}`;
    chart = `<svg class="pchart" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#111" stroke-width="2"/>
      ${pts.filter(p => p.k === 'spot').map(p => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6" fill="#c9a227"/>`).join('')}
      ${pts.filter(p => p.k === 'purchase').map(p => `<rect x="${(X(p.t) - 4).toFixed(1)}" y="${(Y(p.v) - 4).toFixed(1)}" width="8" height="8" fill="#fff" stroke="#111" stroke-width="1.5"/>`).join('')}
      <text x="2" y="14" class="ct">${esc(fmt(hi))}</text><text x="2" y="${Hh - 6}" class="ct">${esc(fmt(lo))}</text></svg>
      <p class="muted sm plegend"><i class="lg r"></i>Current rate <i class="lg s"></i>Spot (daily) <i class="lg p"></i>Purchase</p>`;
  }
  main.innerHTML = `<div class="prices"><a class="lnk dback" href="#/prices">‹ Material prices</a>
    <div class="dhead"><h2>${esc(r.label)}</h2><span class="lab">now ${esc(fmt(r.rate))}</span></div>
    ${chart}
    <div class="rvrows">${H.map(h => `<div class="rvrow dr phist"><div class="rvi"><div class="kjo">${esc(fmt(h.new_rate))}${h.old_rate != null && h.kind === 'rate' ? `<span class="muted sm">was ${esc(fmt(h.old_rate))}</span>` : ''}${h.kind === 'premium' ? '<span class="muted sm">% over spot</span>' : ''}</div>
      <div class="kd">${esc(when(h.at))}${h.kind === 'purchase' ? ' · ' + esc(h.source) : h.kind === 'rate' ? ' · ' + esc(SRC[h.source] || h.source) : ''}${h.by && !['daily', 'setup'].includes(h.by) && h.kind !== 'purchase' ? ' · ' + esc(h.by) : ''}${h.kind === 'purchase' && h.by ? ' · logged by ' + esc(h.by) : ''}</div>
      <div class="kf"><span class="chip ${h.kind === 'rate' ? 'dark' : h.kind === 'purchase' ? '' : h.kind === 'spot' || h.kind === 'feed' ? 'gold' : ''}">${esc(KIND[h.kind] || h.kind)}</span>${h.note ? `<span class="chip">${esc(h.note)}</span>` : ''}</div></div><span></span></div>`).join('') || '<p class="muted rvnone">No history yet.</p>'}</div></div>`;
}
/* Locked JO cost (Prices.gs priceJobCost): drawn on the JO card and in the cost estimator. The server leaves out price / SRP / markups
   for non-executives. j = { locked, history }. */
function lockHeadline(l) {
  const mats = (l.materials || []).filter(m => m.rate != null);
  return 'Cost locked ' + day(new Date(Date.parse(l.locked_at) + 8 * 36e5).toISOString().slice(0, 10)) +
    (mats.length ? ' at ' + mats.map(m => peso(m.rate) + '/g' + (mats.length > 1 ? ' ' + (m.label || m.code) : '')).join(', ') : '');
}
function lockedHtml(j, opt = {}) {
  const esc = window.OYP.esc, l = j && j.locked;
  if (!l) return `<div class="plock none"><span class="lab">Cost</span><p class="muted fnote">Not locked yet. The cost locks when the client accepts a quote (job start)${opt.exec ? ': on the cost estimator, tap “Mark accepted / job started” on a saved quote' : ''}.</p></div>`;
  const diff = l.today_cost_total - l.cost.total, row = (a, b, c = '') => `<div class="sr sm ${c}"><span>${a}</span><span>${b}</span></div>`;
  const lines = [].concat(
    l.materials.map(m => row(esc(m.label || m.code) + ' · ' + num(m.grams) + ' g × ' + peso(m.rate), peso(m.cost))),
    l.labor.map(x => row(esc(x.label || x.code) + ' · ' + num(x.hours) + ' h × ' + peso(x.rate), peso(x.cost))),
    l.stones.map(x => row(esc(x.code || 'Stones') + ' · ' + num(x.qty, 0) + ' × ' + num(x.ct, 3) + ' ct × $' + num(x.usd_per_ct) + ' × ' + num(x.fx), peso(x.cost))));
  const earlier = (j.history || []).slice(1);
  return `<div class="plock"><div class="plh"><span class="chip dark">Locked</span><b>${esc(lockHeadline(l))}</b></div>
    <p class="muted fnote">Quote v${l.quote_version} accepted ${esc(when(l.locked_at))} by ${esc(l.locked_by)}. Rates of that moment; later rate changes don't change this JO.</p>
    ${opt.lines === false ? '' : `<div class="plines">${lines.join('')}</div>`}
    ${row('Materials', peso(l.cost.materials))}${row('Labor', peso(l.cost.labor))}${row('Stones', peso(l.cost.stones))}
    <div class="sr big"><span class="lab">Locked cost</span><b>${peso(l.cost.total)}</b></div>
    ${l.quote_amount !== undefined ? `${l.srp != null ? row('SRP (locked markups)', peso(l.srp)) : ''}${row('Price agreed', '<b>' + peso(l.quote_amount) + '</b>')}${l.margin != null ? row('Margin', peso(l.margin) + (l.quote_amount ? ' · ' + num(l.margin / l.quote_amount * 100, 1) + '%' : '')) : ''}` : ''}
    ${Math.abs(diff) >= 0.01 ? `<p class="muted fnote">At today's rates the same job would cost ${peso(l.today_cost_total)} (${diff > 0 ? '+' : '−'}${peso(Math.abs(diff))}). Not used.</p>` : ''}
    ${earlier.length ? `<p class="muted fnote">Earlier locks (history): ${earlier.map(h => 'v' + h.quote_version + ' ' + esc(when(h.locked_at)) + ' · cost ' + peso(h.cost_total) + (h.quote_amount != null ? ' · price ' + peso(h.quote_amount) : '')).join('; ')}</p>` : ''}</div>`;
}
window.OYPPrices = { render, get: () => P, lockedHtml, lockHeadline };
})();
