/* OYP back office: Cost estimator (#/estimate). Rates come from the Sheet's Rates tab (Costing.gs).
   Everyone allowed here (admin + production manager) enters materials, labor and stones and sees raw costs.
   Markups, SRP, Your price and margins appear only for executives; the server sends them only to executives
   and recomputes everything when a quote is saved. */
(() => {
'use strict';
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
/** Same formula as costCalc_ in Costing.gs (tests check they agree). */
function calc(est, rates, withPrices) {
  est = est || {}; const mk = rates.markup || {};
  const has = v => v != null && v !== '';
  const line = (q, rate) => r2((Number(q) || 0) * (Number(rate) || 0));
  const mats = (est.materials || []).filter(m => Number(m.grams) > 0).map(m => {
    const rate = has(m.rate) ? Number(m.rate) : (rates.material || {})[m.code];
    return { code: m.code || '', label: m.label || '', grams: Number(m.grams), rate: rate == null ? null : Number(rate), cost: line(m.grams, rate) };
  });
  const labor = (est.labor || []).filter(l => Number(l.hours) > 0).map(l => {
    const rate = has(l.rate) ? Number(l.rate) : (rates.labor || {})[l.code];
    return { code: l.code || '', label: l.label || '', hours: Number(l.hours), rate: rate == null ? null : Number(rate), cost: line(l.hours, rate) };
  });
  const stones = (est.stones || []).filter(s => Number(s.qty) > 0 && Number(s.ct) > 0).map(s => {
    const usd = has(s.usd_per_ct) ? Number(s.usd_per_ct) : (rates.stone || {}).diamond_usd_ct;
    const fx = has(s.fx) ? Number(s.fx) : (rates.fx || {}).usd_php;
    const qty = Number(s.qty), ct = Number(s.ct);
    return { code: String(s.code || '').trim(), qty, ct, total_ct: Math.round(qty * ct * 1000) / 1000, usd_per_ct: Number(usd) || 0, fx: Number(fx) || 0,
      cost: r2(qty * ct * (Number(usd) || 0) * (Number(fx) || 0)) };
  });
  const sum = a => r2(a.reduce((t, x) => t + x.cost, 0));
  const out = { kind: est.kind === 'repair' ? 'repair' : 'stock', materials: mats, labor, stones, cost: { materials: sum(mats), labor: sum(labor), stones: sum(stones) } };
  out.cost.total = r2(out.cost.materials + out.cost.labor + out.cost.stones);
  out.missing_rates = mats.concat(labor).filter(x => x.rate == null || isNaN(x.rate)).map(x => x.code);
  if (!withPrices) return out;
  const m = { materials: Number(mk.materials) || 0, labor: Number(out.kind === 'repair' ? mk.labor_repair : mk.labor_stock) || 0, stones: Number(mk.stones) || 0 };
  const srp = { materials: r2(out.cost.materials * m.materials), labor: r2(out.cost.labor * m.labor), stones: r2(out.cost.stones * m.stones) };
  srp.total = r2(srp.materials + srp.labor + srp.stones);
  out.markup = m; out.srp = srp;
  out.margin = { at_srp: r2(srp.total - out.cost.total), at_srp_pct: srp.total ? r2((srp.total - out.cost.total) / srp.total * 100) : null };
  const yp = has(est.your_price) ? Number(est.your_price) : null;
  if (yp != null && !isNaN(yp)) { out.your_price = r2(yp); out.margin.at_your_price = r2(yp - out.cost.total); out.margin.at_your_price_pct = yp ? r2((yp - out.cost.total) / yp * 100) : null; }
  return out;
}
const peso = n => '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => (Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const blank = () => ({ jo: '', kind: 'stock', materials: [{ code: '', grams: '' }], labor: [{ code: '', hours: '' }], stones: [], your_price: '' });
let S = { est: blank(), rates: null, map: null, exec: false, markups: [], quotes: null, busy: false };

async function render(main, u) {
  const { call, esc } = window.OYP, live = window.OYP.here(); S.u = u; // live(): still on this route (app.js)
  main.innerHTML = '<h2>Cost estimator</h2><p class="muted">Loading rates…</p>';
  const r = await call('costRates');
  if (!live()) return;
  if (!r || !r.ok) {
    const msg = r && r.error === 'Unknown action' ? 'The server has not been updated for the cost estimator yet.' : (r && r.error) || 'Could not load rates';
    main.innerHTML = `<h2>Cost estimator</h2><p class="muted">${esc(msg)}</p>`; return;
  }
  S.rates = r.rates; S.exec = !!r.exec; S.markups = r.markups || [];
  const map = { material: {}, labor: {}, stone: {}, fx: {}, markup: {} };
  r.rates.forEach(x => { if (map[x.category] && x.rate != null) map[x.category][x.code] = x.rate; });
  S.markups.forEach(x => { if (x.markup != null) map.markup[x.code] = x.markup; });
  S.map = map;
  if (!S.est.materials[0].code) { const f = r.rates.find(x => x.category === 'material' && x.rate != null); if (f) S.est.materials[0].code = f.code; }
  if (!S.est.labor[0].code) { const f = r.rates.find(x => x.category === 'labor'); if (f) S.est.labor[0].code = f.code; }
  draw(main);
}
const opts = (cat, sel, unit) => S.rates.filter(x => x.category === cat).map(x =>
  `<option value="${x.code}"${x.code === sel ? ' selected' : ''}>${window.OYP.esc(x.label)}${x.rate != null ? ' · ' + peso(x.rate) + '/' + unit : ' · no rate yet'}</option>`).join('');

function draw(main) {
  const { esc } = window.OYP, e = S.est, R = calc(e, S.map, S.exec), mk = R.markup || {};
  const sec = (key, title, head, rows, add, cost, mult) => `<section class="es">
      <div class="eshd"><h3>${title}</h3><span class="lab">Raw cost <b>${peso(cost)}</b>${S.exec ? ` &nbsp;× ${num(mult)} = <b class="gold">${peso(R.srp[key])}</b>` : ''}</span></div>
      <div class="erows">${head}${rows}</div><button class="lnk eadd" data-add="${key}">+ ${add}</button></section>`;
  const mat = e.materials.map((m, i) => `<div class="er er3"><select data-k="materials.${i}.code">${opts('material', m.code, 'g')}</select>
      <input data-k="materials.${i}.grams" inputmode="decimal" placeholder="grams" value="${esc(m.grams)}"><span class="ec">${peso(lineCost('materials', i, R))}</span><button class="ex" data-del="materials.${i}" aria-label="Remove">×</button></div>`).join('');
  const lab = e.labor.map((l, i) => `<div class="er er3"><select data-k="labor.${i}.code">${opts('labor', l.code, 'h')}</select>
      <input data-k="labor.${i}.hours" inputmode="decimal" placeholder="hours" value="${esc(l.hours)}"><span class="ec">${peso(lineCost('labor', i, R))}</span><button class="ex" data-del="labor.${i}" aria-label="Remove">×</button></div>`).join('');
  const st = e.stones.map((s, i) => `<div class="er er5"><input data-k="stones.${i}.code" placeholder="Stone code (D10C…)" value="${esc(s.code)}">
      <input data-k="stones.${i}.qty" inputmode="numeric" placeholder="qty" title="Pieces" value="${esc(s.qty)}"><input data-k="stones.${i}.ct" inputmode="decimal" placeholder="ct each" title="Carat per piece" value="${esc(s.ct)}">
      <input data-k="stones.${i}.usd_per_ct" inputmode="decimal" placeholder="$${num(S.map.stone.diamond_usd_ct)}/ct" title="USD per carat" value="${esc(s.usd_per_ct)}"><input data-k="stones.${i}.fx" inputmode="decimal" placeholder="₱${num(S.map.fx.usd_php)}/$" title="USD → PHP" value="${esc(s.fx)}">
      <span class="ec">${peso(lineCost('stones', i, R))}</span><button class="ex" data-del="stones.${i}" aria-label="Remove">×</button></div>`).join('');
  const hd3 = (a, b) => `<div class="er er3 eh"><span class="lab">${a}</span><span class="lab">${b}</span><span class="lab ec">Cost</span><span></span></div>`;
  const hd5 = `<div class="er er5 eh"><span class="lab">Stone code</span><span class="lab">Qty</span><span class="lab">Ct each</span><span class="lab">USD / ct</span><span class="lab">USD → ₱</span><span class="lab ec">Cost</span><span></span></div>`;
  const sum = S.exec ? `<div class="esum">
      <div class="sr"><span class="lab">Raw cost</span><b>${peso(R.cost.total)}</b></div>
      <div class="sr sm"><span>Materials ${peso(R.cost.materials)} × ${num(mk.materials)}</span><span>${peso(R.srp.materials)}</span></div>
      <div class="sr sm"><span>Labor ${peso(R.cost.labor)} × ${num(mk.labor)}${R.kind === 'repair' ? ' (repair)' : ''}</span><span>${peso(R.srp.labor)}</span></div>
      <div class="sr sm"><span>Stones ${peso(R.cost.stones)} × ${num(mk.stones)}</span><span>${peso(R.srp.stones)}</span></div>
      <div class="sr big"><span class="lab">SRP</span><b>${peso(R.srp.total)}</b></div>
      <div class="sr sm"><span>Margin at SRP</span><span>${peso(R.margin.at_srp)}${R.margin.at_srp_pct != null ? ' · ' + num(R.margin.at_srp_pct) + '%' : ''}</span></div>
      <label class="fsec yp"><span class="lab">Your price</span><input data-k="your_price" inputmode="decimal" placeholder="${num(R.srp.total)}" value="${esc(e.your_price)}"></label>
      <div class="sr big"><span class="lab">Margin at your price</span><b>${R.margin.at_your_price != null ? peso(R.margin.at_your_price) : '—'}</b></div>
      ${R.margin.at_your_price_pct != null ? `<div class="sr sm"><span></span><span>${num(R.margin.at_your_price_pct)}% of your price</span></div>` : ''}
    </div>` : `<div class="esum">
      <div class="sr sm"><span>Materials</span><span>${peso(R.cost.materials)}</span></div><div class="sr sm"><span>Labor</span><span>${peso(R.cost.labor)}</span></div>
      <div class="sr sm"><span>Stones</span><span>${peso(R.cost.stones)}</span></div><div class="sr big"><span class="lab">Raw cost</span><b>${peso(R.cost.total)}</b></div>
      <p class="muted fnote">Selling price and margin are set by an executive from these costs.</p></div>`;
  const q = S.quotes ? `<div class="eq"><span class="lab">Saved on JO ${esc(S.quotes.jo)}</span>${S.quotes.quotes.length ? S.quotes.quotes.map(x =>
      `<div class="sr sm"><span>v${x.version} · ${esc(x.created_by)} · ${esc(String(x.created_at).slice(0, 10))}</span><span>cost ${peso(x.cost_total)}${S.exec && x.quote_amount != null ? ' · price ' + peso(x.quote_amount) : ''}</span></div>`).join('') : '<p class="muted">None yet</p>'}</div>` : '';
  main.innerHTML = `<h2>Cost estimator</h2><p class="muted">Rates from the Rates tab${S.exec ? '' : ' · raw costs only'}</p>
    <div class="est"><div class="ein">
      <div class="etop"><label class="fsec"><span class="lab">JO number (to save on)</span><input data-k="jo" placeholder="26-001" value="${esc(e.jo)}" autocapitalize="characters"></label>
      <div class="fsec"><span class="lab">Kind</span><div class="seg"><button data-kind="stock" class="${R.kind === 'stock' ? 'on' : ''}">Stock / order</button><button data-kind="repair" class="${R.kind === 'repair' ? 'on' : ''}">Repair</button></div></div></div>
      ${sec('materials', 'Materials', hd3('Metal', 'Grams'), mat, 'Add metal', R.cost.materials, mk.materials)}
      ${sec('labor', 'Labor', hd3('Who', 'Hours'), lab, 'Add labor', R.cost.labor, mk.labor)}
      ${sec('stones', 'Stones', e.stones.length ? hd5 : '', st, 'Add stones', R.cost.stones, mk.stones)}
    </div><aside class="eside">${sum}
      <div class="fbtns"><button class="pill" id="eSave"${S.busy ? ' disabled' : ''}>${S.exec ? 'SAVE QUOTE ON JO' : 'SAVE COSTS ON JO'}</button><button class="lnk" id="eClear">Clear</button></div>
      ${R.missing_rates.length ? `<p class="fnote flag c">No rate yet for ${esc(R.missing_rates.map(c => (S.rates.find(x => x.code === c) || { label: c }).label).join(', '))} · enter it in the Rates tab</p>` : ''}${q}</aside></div>`;
  wire(main);
}
function lineCost(key, i, R) { // the calc drops empty rows; map back by position among filled rows
  const rows = S.est[key], used = r => key === 'materials' ? Number(r.grams) > 0 : key === 'labor' ? Number(r.hours) > 0 : Number(r.qty) > 0 && Number(r.ct) > 0;
  if (!used(rows[i])) return 0;
  const idx = rows.slice(0, i).filter(used).length; return R[key][idx].cost;
}
function wire(main) {
  const { call, toast } = window.OYP;
  main.querySelectorAll('[data-k]').forEach(el => {
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const p = el.dataset.k.split('.'); let o = S.est; while (p.length > 1) o = o[p.shift()]; o[p[0]] = el.value;
      if (el.tagName === 'SELECT') return draw(main);
      refresh(main);
    });
  });
  main.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { S.est.kind = b.dataset.kind; draw(main); });
  main.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const k = b.dataset.add, first = c => (S.rates.find(x => x.category === c) || {}).code || '';
    S.est[k].push(k === 'materials' ? { code: first('material'), grams: '' } : k === 'labor' ? { code: first('labor'), hours: '' } : { code: '', qty: '1', ct: '', usd_per_ct: '', fx: '' });
    draw(main);
  });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.del.split('.'); S.est[k].splice(+i, 1); draw(main); });
  main.querySelector('#eClear').onclick = () => { S.est = blank(); S.quotes = null; render(main, S.u); };
  main.querySelector('#eSave').onclick = async () => {
    const e = S.est; if (!e.jo.trim()) { toast('Type the JO number first'); return main.querySelector('[data-k=jo]').focus(); }
    S.busy = true; draw(main); const live = window.OYP.here();
    const est = { kind: e.kind, materials: e.materials, labor: e.labor, stones: e.stones };
    if (S.exec && e.your_price !== '') est.your_price = e.your_price;
    const r = await call('costSave', { jo: e.jo, estimate: est }); S.busy = false;
    if (!r || !r.ok) { if (live()) draw(main); return toast((r && r.error) || 'Could not save'); }
    toast('Saved as v' + r.version + ' on JO ' + r.jo);
    S.quotes = await call('costQuotes', { jo: r.jo }); if (live()) draw(main);
  };
}
function refresh(main) { // keep focus while typing: redraw, then put the cursor back
  const a = document.activeElement, k = a && a.dataset && a.dataset.k, pos = a && a.selectionStart;
  draw(main);
  if (k) { const el = main.querySelector(`[data-k="${k}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) {} } }
}
if (typeof window !== 'undefined') window.OYPEstimate = { render, calc };
if (typeof module !== 'undefined') module.exports = { calc };
})();
