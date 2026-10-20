/* OYP back office: Inventory (#/jos, every JO / finished piece) and Materials (#/inventory, raw stock).
   Server: InventoryPages.gs (invList, invThumbs, matList, matHistory, matSave, matMove). The server strips what a role may not
   see (price + margin: executives; costs: executives + production manager); this file only draws what it gets. */
(() => {
'use strict';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = n => '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return MON[m - 1] + ' ' + dd + (y !== new Date().getFullYear() ? ', ' + y : ''); };
const when = d => { if (!d) return ''; const t = new Date(d); if (isNaN(t)) return day(d);
  return t.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const plural = (n, w, many) => n + ' ' + (n === 1 ? w : many || w + 's');
const num = n => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('en-PH', { maximumFractionDigits: 3 });
const STAGE = { intake: 'Intake', quote_deposit: 'Quote & deposit', receive_inspect: 'Receive & inspect', diagnose_quote: 'Diagnose & quote', repair_intake: 'Repair intake',
  assess: 'Assessing', design: 'Design', approval: 'Waiting for approval', stone_sourcing: 'Sourcing stones', model: 'Model / wax', casting: 'Casting', bench: 'Bench work',
  repair: 'Repair work', stone_setting: 'Stone setting', stone_reset: 'Stone reset', engraving: 'Engraving', pre_polish: 'Pre-polish', final_polish: 'Final polish',
  plating: 'Plating', clean_polish: 'Clean & polish', qc: 'Quality check', photo: 'Product photo', final_costing: 'Final costing', notify: 'Client notified', pickup: 'Waiting for pickup' };
const stageLabel = c => STAGE[c] || (c ? String(c).replace(/_/g, ' ') : '');
const kar = k => { k = String(k || '').trim(); return /^\d{1,2}$/.test(k) ? k + 'k' : k; };
const oldBackend = r => !r || r.error === 'Unknown action';
const PASTE_NOTE = 'This page needs the InventoryPages paste in Apps Script (see the instructions).';

/* =================== Inventory (#/jos) =================== */
const IV = { r: null, view: 'all', stage: '', loc: '', type: '', q: '', thumbs: {}, open: null, at: 0 };
const MAKING = { working: 1, queue: 1 };
const IVIEWS = {
  all: ['All', j => j.location !== 'archived'],
  making: ['In production', j => MAKING[j.location]],
  finished: ['Finished pieces', j => j.on_hand && !MAKING[j.location]],
  sold: ['Sold', j => j.location === 'sold'],
  noloc: ['No location yet', j => !j.location],
  archived: ['Archived', j => j.location === 'archived']
};
const specs = j => {
  const s = [];
  if (j.karat || j.metal) s.push([kar(j.karat), j.metal].filter(Boolean).join(' '));
  if (j.stone_type) s.push([j.stone_type, j.stone_size, j.grade].filter(Boolean).join(' '));
  if (j.material) s.push(j.material);
  if (j.size) s.push('Size ' + j.size);
  if (j.weight_g) s.push(j.weight_g + ' g');
  return s.filter(Boolean).join(' · ');
};
const locLab = k => ((IV.r && IV.r.locations || []).find(l => l[0] === k) || [k, k])[1];
const typeLab = k => ((IV.r && IV.r.item_types || []).find(t => t[0] === k) || [k, k])[1];
function ivHay(j) {
  return [j.jo, j.parent_jo, j.description, j.client, j.metal, kar(j.karat), j.karat, j.stone_type, j.stone_size, j.grade, j.material, j.size,
    j.item_type && typeLab(j.item_type), j.location && locLab(j.location), stageLabel(j.stage), j.type === 'repair' ? 'repair' : ''].join(' ').toLowerCase();
}
function ivShown() {
  const toks = IV.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return IV.r.jobs.filter(j => IVIEWS[IV.view][1](j) && (!IV.stage || j.col === IV.stage) && (!IV.loc || (IV.loc === '-' ? !j.location : j.location === IV.loc))
    && (!IV.type || (IV.type === 'job:repair' ? j.type === 'repair' : j.item_type === IV.type)) && (!toks.length || (h => toks.every(t => h.includes(t)))(ivHay(j))));
}
async function renderJos(main, u) {
  const { call, esc } = window.OYP, live = window.OYP.here(); IV.u = u; // live(): still on this route (app.js)
  { // app.js serves the last answer at once and refreshes it in the background
    if (!IV.r) main.innerHTML = '<h2>Inventory</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
    const r = await call('invList'); if (!live()) return;
    if ((!r || !r.ok) && !IV.r) { main.innerHTML = `<h2>Inventory</h2><p class="muted">${esc(oldBackend(r) ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return; }
    if (r && r.ok) { IV.r = r; IV.at = Date.now(); }
  }
  ivDraw(main);
}
function ivDraw(main) {
  const { esc } = window.OYP, r = IV.r, can = r.can || {}, L = ivShown(), title = IV.u.role === 'accounting' ? 'Inventory (view)' : 'Inventory';
  const cnt = k => r.jobs.filter(IVIEWS[k][1]).length;
  const onHand = r.jobs.filter(j => j.on_hand && !MAKING[j.location]);
  const sumC = onHand.reduce((t, j) => t + (Number(j.cost) || 0), 0), sumP = onHand.reduce((t, j) => t + (Number(j.price) || 0), 0);
  const sum = [plural(onHand.length, 'finished piece') + ' on hand', plural(cnt('making'), 'job') + ' in production'];
  if (can.cost) sum.push('on-hand cost ' + peso(sumC)); if (can.price) sum.push('on-hand price ' + peso(sumP));
  const sel = (id, lab, cur, opts) => `<label class="ivsel"><span class="lab">${esc(lab)}</span><select id="${id}"><option value="">Any</option>${opts.map(([k, t]) => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const filt = IV.stage || IV.loc || IV.type;
  main.innerHTML = `<div class="iv">
    <div class="dhead"><h2>${esc(title)}</h2><span class="lab">${esc(plural(L.length, 'item'))}</span></div>
    <p class="muted">Every JO and finished piece. ${can.open ? 'Tap one to open its JO card.' : 'View only: tap one to see its details.'}</p>
    <p class="ivsum">${sum.map(esc).join(' · ')}</p>
    <div class="rvchips ivchips">${Object.keys(IVIEWS).map(k => `<button class="fchip tap ${IV.view === k ? 'on' : ''}" data-iv="${k}">${esc(IVIEWS[k][0])} <b>${cnt(k)}</b></button>`).join('')}</div>
    <input id="ivQ" class="rvq" placeholder="Search JO, client, 18k, sapphire…" value="${esc(IV.q)}" autocomplete="off">
    <div class="ivsels">${sel('ivStage', 'Stage', IV.stage, r.stages)}${sel('ivLoc', 'Location', IV.loc, r.locations.concat([['-', 'No location yet']]))}
      ${sel('ivType', 'Type', IV.type, r.item_types.concat([['job:repair', 'Repair jobs']]))}${filt ? '<button class="lnk ivclr" id="ivClr">Clear</button>' : ''}</div>
    <div class="ivgrid" id="ivGrid">${L.map(j => ivCard(j, can)).join('') || `<p class="muted rvnone">${IV.q || filt ? 'No match.' : 'Nothing here.'}</p>`}</div>
  </div>${IV.open ? ivSheet(r.jobs.find(j => j.jo === IV.open)) : ''}`;
  ivWire(main); ivThumbs(main, L);
}
function ivCard(j, can) {
  const { esc } = window.OYP, c = [];
  c.push(j.location === 'archived' ? '<span class="chip arch">Archived</span>' : j.location ? `<span class="chip dark">${esc(locLab(j.location))}</span>` : '<span class="chip gold">No location</span>');
  if (MAKING[j.location] && j.stage) c.push(`<span class="chip">${esc(stageLabel(j.stage))}</span>`);
  if (j.late) c.push('<span class="chip gold">Late</span>');
  if (j.type === 'repair') c.push('<span class="chip">Repair</span>');
  if (j.review) c.push('<span class="chip">To review</span>');
  const money = [];
  if (can.cost) money.push(j.cost != null ? `<span>Cost <b>${esc(peso(j.cost))}</b></span>` : '<span class="muted">No cost yet</span>');
  if (can.price) { if (j.price != null) money.push(`<span>Price <b>${esc(peso(j.price))}</b></span>`); if (j.margin_pct != null) money.push(`<span class="ivm">${esc(j.margin_pct)}%</span>`); }
  const sp = specs(j), ph = IV.thumbs[j.jo];
  return `<div class="ivcard tap" data-jo="${esc(j.jo)}"><div class="ivph ${ph ? 'has' : ''}" data-th="${esc(j.jo)}"${ph ? ` style="background-image:url('${ph}')"` : ''}>${ph ? '' : `<span>${j.has_photo && ph === undefined ? '' : 'No photo'}</span>`}</div>
    <div class="ivb"><div class="kjo">${esc(j.jo)}${j.parent_jo ? `<span class="muted sm">of ${esc(j.parent_jo)}</span>` : ''}${j.item_type ? `<span class="muted sm">${esc(typeLab(j.item_type))}</span>` : ''}</div>
    <div class="kd">${esc(j.description || 'No details yet')}</div>${sp ? `<div class="ivsp">${esc(sp)}</div>` : ''}${j.client ? `<div class="kc">${esc(j.client)}</div>` : ''}
    <div class="kf">${c.join('')}</div>${money.length ? `<div class="ivmoney">${money.join('')}</div>` : ''}</div></div>`;
}
function ivSheet(j) { // read-only details (roles that can't open the JO card)
  if (!j) return ''; const { esc } = window.OYP;
  const f = (lab, v) => v ? `<div class="ivf"><span class="lab">${esc(lab)}</span><b>${esc(v)}</b></div>` : '';
  return `<div class="ivsheet" id="ivSheet"><div class="ivsbox"><button class="lnk dback" id="ivSX">‹ BACK</button>
    <div class="dhead"><h2>JO ${esc(j.jo)}</h2><span class="lab">View only</span></div>
    <div class="ivph big ${IV.thumbs[j.jo] ? 'has' : ''}"${IV.thumbs[j.jo] ? ` style="background-image:url('${IV.thumbs[j.jo]}')"` : ''}>${IV.thumbs[j.jo] ? '' : '<span>No photo</span>'}</div>
    <p class="kd">${esc(j.description || 'No details')}</p>
    <div class="ivfs">${f('Client', j.client)}${f('Location', j.location ? locLab(j.location) : 'No location yet')}${f('Stage', MAKING[j.location] ? stageLabel(j.stage) : '')}
      ${f('Type', j.item_type ? typeLab(j.item_type) : '')}${f('Job', j.type === 'repair' ? 'Repair' : j.type === 'revision' ? 'Revision' : j.type ? 'New job' : '')}
      ${f('Metal', [kar(j.karat), j.metal].filter(Boolean).join(' '))}${f('Stone', [j.stone_type, j.stone_size, j.grade].filter(Boolean).join(' '))}${f('Material', j.material)}
      ${f('Size', j.size)}${f('Weight', j.weight_g ? j.weight_g + ' g' : '')}${f('Due', day(j.due))}${f('Part of', j.parent_jo)}</div></div></div>`;
}
function ivWire(main) {
  const $ = s => main.querySelector(s);
  main.querySelectorAll('[data-iv]').forEach(b => b.onclick = () => { IV.view = b.dataset.iv; ivDraw(main); });
  $('#ivQ').oninput = e => { IV.q = e.target.value; const pos = e.target.selectionStart; ivDraw(main); const q = $('#ivQ'); q.focus(); q.setSelectionRange(pos, pos); };
  $('#ivStage').onchange = e => { IV.stage = e.target.value; if (IV.stage && IV.view !== 'all' && IV.view !== 'making') IV.view = 'all'; ivDraw(main); };
  $('#ivLoc').onchange = e => { IV.loc = e.target.value; if (IV.loc) IV.view = IV.loc === 'archived' ? 'archived' : 'all'; ivDraw(main); };
  $('#ivType').onchange = e => { IV.type = e.target.value; ivDraw(main); };
  if ($('#ivClr')) $('#ivClr').onclick = () => { IV.stage = IV.loc = IV.type = ''; ivDraw(main); };
  main.querySelectorAll('.ivcard').forEach(el => el.onclick = () => {
    const j = IV.r.jobs.find(x => x.jo === el.dataset.jo); if (!j) return;
    if (!(IV.r.can || {}).open) { IV.open = j.jo; ivDraw(main); return; }
    try { sessionStorage.setItem('oypReviewOpen', JSON.stringify({ jo: j.jo, back: '#/jos', label: 'BACK',
      row: { description: j.description, client: j.client, location: j.location, stage_label: stageLabel(j.stage), due: j.due, late: j.late } })); } catch (_) {}
    location.hash = '#/review';
  });
  if ($('#ivSX')) { $('#ivSX').onclick = () => { IV.open = null; ivDraw(main); }; $('#ivSheet').onclick = e => { if (e.target.id === 'ivSheet') { IV.open = null; ivDraw(main); } }; }
  const on = main.querySelector('.ivchips .fchip.on'); if (on && innerWidth < 760) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.offsetLeft - 20;
}
async function ivThumbs(main, L) { // piece photos only (server never sends JO card scans), 12 per call, first 60 shown
  const live = window.OYP.here(), want = L.slice(0, 60).filter(j => j.has_photo && IV.thumbs[j.jo] === undefined).map(j => j.jo);
  for (let i = 0; i < want.length; i += 12) {
    const part = want.slice(i, i + 12); part.forEach(k => { IV.thumbs[k] = IV.thumbs[k] || null; });
    const r = await window.OYP.call('invThumbs', { jos: part });
    part.forEach(k => {
      const src = r && r.ok ? r.thumbs[k] || '' : ''; IV.thumbs[k] = src;
      if (live()) document.querySelectorAll(`[data-th="${CSS.escape(k)}"]`).forEach(el => { if (src) { el.style.backgroundImage = `url('${src}')`; el.classList.add('has'); el.innerHTML = ''; } else el.innerHTML = '<span>No photo</span>'; });
    });
    if (!live()) return; // left the page: stop fetching
  }
}

/* =================== Materials (#/inventory) =================== */
const MS = { r: null, view: 'all', q: '', open: null, adding: false, kind: 'metal', mode: 'in', hist: {}, editing: false, err: '', draft: {} };
const MVIEWS = { all: 'All', metal: 'Metals', stone: 'Loose stones', pearl: 'Pearls', finding: 'Findings', other: 'Other', supply: 'Supplies (non-job)', low: 'Low stock', archived: 'Archived' };
const isJob = m => m.job !== false && m.kind !== 'supply'; // Supplies (non-job): tools, packaging, consumables
const MFIELDS = { // what each kind asks for (karat is never required)
  metal: [['metal', 'Metal', 'Gold, Silver, Platinum'], ['karat', 'Karat (optional)', '18k'], ['color', 'Color (optional)', 'Yellow, White, Rose']],
  stone: [['stone_type', 'Stone', 'Sapphire, Diamond'], ['shape', 'Shape', 'Oval, Round'], ['size', 'Size', '7x5 mm, 0.30 ct'], ['color', 'Color', 'Blue'], ['grade', 'Grade', 'AA, VS1']],
  pearl: [['stone_type', 'Pearl', 'South Sea, Freshwater'], ['size', 'Size', '9-10 mm'], ['color', 'Color', 'White, Golden'], ['grade', 'Grade', 'AAA']],
  finding: [['metal', 'Metal', 'Gold, Silver'], ['karat', 'Karat (optional)', '14k'], ['size', 'Size', '4 mm, 18 in']],
  other: [['size', 'Size (optional)', '']],
  supply: [['size', 'Size / pack (optional)', 'Box of 100']]
};
const UNIT_DEF = { metal: 'g', stone: 'ct', pearl: 'pc', finding: 'pc', other: 'pc', supply: 'pc' };
const MOVE = { add: 'Added', in: 'Stock in', out: 'Stock out', count: 'Count', edit: 'Edited', archive: 'Archived', restore: 'Restored' };
const mspec = m => [[kar(m.karat), m.metal ? m.color : '', m.metal].filter(Boolean).join(' '), [m.stone_type, m.shape].filter(Boolean).join(' '), m.size, m.metal ? '' : m.color, m.grade].filter(Boolean).join(' · ');
const kindLab = k => ((MS.r && MS.r.kinds || []).find(x => x[0] === k) || [k, k])[1];
function mShown() {
  const toks = MS.q.trim().toLowerCase().split(/\s+/).filter(Boolean), v = MS.view;
  return MS.r.items.filter(m => (v === 'archived' ? !m.active : m.active && (v === 'all' ? isJob(m) : v === 'low' ? m.low : m.kind === v))
    && (!toks.length || (h => toks.every(t => h.includes(t)))([m.name, m.metal, kar(m.karat), m.stone_type, m.shape, m.size, m.color, m.grade, m.location, m.supplier, m.notes, kindLab(m.kind)].join(' ').toLowerCase())));
}
async function renderMats(main, u) {
  const { call, esc } = window.OYP, live = window.OYP.here(); MS.u = u;
  main.innerHTML = '<h2>Materials</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const r = await call('matList'); if (!live()) return;
  if (!r || !r.ok) { main.innerHTML = `<h2>Materials</h2><p class="muted">${esc(oldBackend(r) ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return; }
  MS.r = r; if (MS.open && !r.items.some(m => m.mat_id === MS.open)) MS.open = null;
  if (!MS.open && !MS.adding && innerWidth >= 900) { const f = mShown()[0]; if (f) MS.open = f.mat_id; }
  if (MS.open) await mHist(MS.open);
  if (live()) mDraw(main);
}
async function mHist(id, fresh) { if (!MS.hist[id] || fresh) { const h = await window.OYP.call('matHistory', { mat_id: id }); MS.hist[id] = h && h.ok ? h.moves : []; } }
function mDraw(main) {
  const { esc } = window.OYP, r = MS.r, can = r.can || {}, L = mShown(), act = r.items.filter(m => m.active);
  const cnt = k => k === 'archived' ? r.items.length - act.length : k === 'all' ? act.filter(isJob).length : k === 'low' ? act.filter(m => m.low).length : act.filter(m => m.kind === k).length;
  const sup = act.filter(m => !isJob(m)).length, tot = act.filter(isJob).reduce((t, m) => t + (Number(m.stock_cost) || 0), 0);
  main.innerHTML = `<div class="rv mats ${MS.open || MS.adding ? 'has-open' : ''}"><div class="rvlist">
    <div class="dhead"><h2>Materials</h2>${can.edit ? '<button class="pill sm tap" id="mAdd">+ ADD STOCK</button>' : ''}</div>
    <p class="muted">Job stock: metals, loose stones, pearls and findings. Stock out always goes to a JO. Supplies (non-job) are tools, packaging and consumables, kept separately. Quantities change only through Stock in, Stock out or Count, and every change is kept in the history.</p>
    <p class="ivsum">${esc(plural(act.length - sup, 'job stock item'))}${sup ? ' · ' + esc(plural(sup, 'supply', 'supplies')) : ''}${cnt('low') ? ` · <b class="gold">${cnt('low')} low</b>` : ''}${can.cost ? ' · job stock at last cost ' + esc(peso(tot)) : ''}</p>
    ${!r.setup ? '<p class="ccsum">No stock yet. The Materials and MaterialMoves tabs are made in the Sheet when the first item is saved.</p>' : ''}
    ${r.missing_cols && r.missing_cols.length ? `<p class="ccsum">Columns missing in the Sheet (not saved): ${esc(r.missing_cols.join(', '))}</p>` : ''}
    <div class="rvchips">${Object.keys(MVIEWS).filter(k => cnt(k) || k === 'all' || k === MS.view).map(k => `<button class="fchip tap ${MS.view === k ? 'on' : ''}" data-mv="${k}">${esc(MVIEWS[k])} <b>${cnt(k)}</b></button>`).join('')}</div>
    <input id="mQ" class="rvq" placeholder="Search name, metal, stone, size, location" value="${esc(MS.q)}" autocomplete="off">
    <div class="rvrows">${L.map(m => `<div class="rvrow mrow tap ${MS.open === m.mat_id && !MS.adding ? 'on' : ''}" data-mat="${esc(m.mat_id)}"><div class="rvi">
      <div class="kjo">${esc(m.name)}</div>${mspec(m) ? `<div class="kd">${esc(mspec(m))}</div>` : ''}
      <div class="kf"><span class="chip">${esc(kindLab(m.kind))}</span>${m.location ? `<span class="chip">${esc(m.location)}</span>` : ''}${m.low ? '<span class="chip gold">Low stock</span>' : ''}${can.cost && m.last_cost != null ? `<span class="chip">${esc(peso(m.last_cost))}/${esc(m.unit)}</span>` : ''}</div></div>
      <div class="mq"><b>${esc(num(m.qty))}</b><span class="lab">${esc(m.unit)}</span></div></div>`).join('') || `<p class="muted rvnone">${r.items.length ? 'Nothing in this view.' : 'No stock items yet.' + (can.edit ? ' Tap + Add stock.' : '')}</p>`}</div>
  </div><div class="rvpanel">${MS.adding ? mAddPanel() : MS.open ? mPanel(r.items.find(m => m.mat_id === MS.open)) : '<div class="rvempty"><span class="lab">Pick an item on the left</span></div>'}</div></div>`;
  mWire(main);
}
const inp = (id, lab, v, ph, extra) => `<div class="fsec"><span class="lab">${lab}</span><input id="${id}" value="${window.OYP.esc(v == null ? '' : v)}" placeholder="${window.OYP.esc(ph || '')}" ${extra || ''}></div>`;
const unitSel = (id, cur) => `<div class="fsec"><span class="lab">Unit</span><select id="${id}">${MS.r.units.map(([k, t]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${k} · ${t}</option>`).join('')}</select></div>`;
const locIn = (id, v) => `<div class="fsec"><span class="lab">Location</span><input id="${id}" list="mLocs" value="${window.OYP.esc(v || '')}" placeholder="Vault"><datalist id="mLocs">${MS.r.locations.map(l => `<option value="${window.OYP.esc(l)}">`).join('')}</datalist></div>`;
function mAddPanel() {
  const { esc } = window.OYP, k = MS.kind, d = MS.draft, can = MS.r.can || {};
  return `<div class="rvp"><button class="lnk rvback" data-mx>‹ All materials</button><div class="dhead"><h2>New stock item</h2></div>
    <div class="fsec"><span class="lab">Kind</span><div class="seg mkinds">${MS.r.kinds.map(([c, t]) => `<button class="${c === k ? 'on' : ''}" data-mk="${c}">${esc(t)}</button>`).join('')}</div></div>
    ${inp('maName', 'Name', d.name, { metal: '18k yellow gold casting grain', stone: 'Blue sapphire, oval', pearl: 'South Sea pearl', finding: 'Lobster clasp', other: 'Item name', supply: 'Polishing compound, ring boxes, saw blades' }[k])}
    ${k === 'supply' ? '<p class="muted fnote">Supplies never become part of a piece. Their stock out needs no JO.</p>' : ''}<div class="fgrid">${MFIELDS[k].map(([f, lab, ph]) => inp('ma_' + f, lab, d[f], ph)).join('')}${unitSel('maUnit', d.unit || UNIT_DEF[k])}
      ${inp('maQty', 'Opening quantity', d.qty, '0', 'inputmode="decimal"')}${can.cost ? inp('maCost', 'Cost per unit ₱ (optional)', d.unit_cost, '', 'inputmode="decimal"') : ''}
      ${inp('maSup', 'Supplier (optional)', d.supplier, '')}${locIn('maLoc', d.location)}${inp('maMin', 'Low-stock alert at (optional)', d.min_qty, '', 'inputmode="decimal"')}
      <div class="full">${inp('maNotes', 'Notes (optional)', d.notes, '')}</div></div>
    <p class="err" id="mErr">${esc(MS.err)}</p>
    <div class="fbtns"><button class="pill tap" id="maSave">SAVE ITEM</button><button class="lnk" data-mx>Cancel</button></div></div>`;
}
function mPanel(m) {
  if (!m) return ''; const { esc } = window.OYP, can = MS.r.can || {}, H = MS.hist[m.mat_id] || [], md = MS.mode;
  const row = x => `<div class="mh"><div class="mhl"><b>${esc(MOVE[x.move] || x.move)}</b>${x.qty_change ? ` <span class="${x.qty_change > 0 ? 'up' : 'dn'}">${x.qty_change > 0 ? '+' : ''}${esc(num(x.qty_change))} ${esc(x.unit)}</span>` : ''}${x.qty_after != null && x.move !== 'edit' && x.move !== 'archive' && x.move !== 'restore' ? ` <span class="muted">→ ${esc(num(x.qty_after))}</span>` : ''}
    ${can.cost && x.unit_cost != null ? ` <span class="muted">· ${esc(peso(x.unit_cost))}/${esc(x.unit)}${x.total_cost != null ? ' = ' + esc(peso(x.total_cost)) : ''}</span>` : ''}</div>
    <div class="mhs">${esc(when(x.at))} · ${esc(x.by)}${x.jo ? ' · JO ' + esc(x.jo) : ''}${x.supplier ? ' · ' + esc(x.supplier) : ''}</div>${x.note || x.detail ? `<div class="mhs">${esc([x.detail, x.note].filter(Boolean).join(' · '))}</div>` : ''}</div>`;
  return `<div class="rvp"><button class="lnk rvback" data-mx>‹ All materials</button>
    <div class="dhead"><h2>${esc(m.name)}</h2><span class="lab">${esc(kindLab(m.kind))}${m.active ? '' : ' · Archived'}</span></div>
    ${mspec(m) ? `<p class="kd">${esc(mspec(m))}</p>` : ''}
    <div class="mbig"><div><b>${esc(num(m.qty))}</b> <span>${esc(m.unit)} on hand</span></div>${m.low ? '<span class="chip gold">Low stock</span>' : ''}</div>
    <div class="ivfs">${m.location ? `<div class="ivf"><span class="lab">Location</span><b>${esc(m.location)}</b></div>` : ''}
      ${can.cost ? `<div class="ivf"><span class="lab">Last bought at</span><b>${m.last_cost != null ? esc(peso(m.last_cost)) + ' / ' + esc(m.unit) : '—'}</b></div>` : ''}
      ${can.cost && m.stock_cost != null ? `<div class="ivf"><span class="lab">Stock at last cost</span><b>${esc(peso(m.stock_cost))}</b></div>` : ''}
      ${m.last_in_at ? `<div class="ivf"><span class="lab">Last stock in</span><b>${esc(day(m.last_in_at))}</b></div>` : ''}
      ${m.supplier ? `<div class="ivf"><span class="lab">Supplier</span><b>${esc(m.supplier)}</b></div>` : ''}${m.min_qty != null ? `<div class="ivf"><span class="lab">Alert at</span><b>${esc(num(m.min_qty))} ${esc(m.unit)}</b></div>` : ''}</div>
    ${m.notes ? `<p class="muted fnote">${esc(m.notes)}</p>` : ''}
    ${can.edit && m.active ? `<div class="mmove"><div class="seg">${[['in', 'Stock in'], ['out', 'Stock out'], ['count', 'Count']].map(([k, t]) => `<button class="${md === k ? 'on' : ''}" data-mm="${k}">${t}</button>`).join('')}</div>
      <div class="fgrid">${inp('mvQty', md === 'count' ? 'Counted quantity (' + m.unit + ')' : 'Quantity (' + m.unit + ')', '', md === 'count' ? num(m.qty) : '0', 'inputmode="decimal"')}
      ${md === 'in' && can.cost ? inp('mvCost', 'Cost per ' + m.unit + ' ₱', '', m.last_cost != null ? String(m.last_cost) : '', 'inputmode="decimal"') : ''}
      ${md === 'in' ? inp('mvSup', 'Supplier', m.supplier, '') : ''}${md === 'out' && isJob(m) ? inp('mvJo', 'For JO (required)', '', '26-103', 'required autocomplete="off" autocapitalize="characters"') : ''}
      <div class="full">${inp('mvNote', md === 'count' ? 'Why (required)' : md === 'out' && !isJob(m) ? 'Reason' : 'Note (optional)', md === 'out' && !isJob(m) ? 'Used / consumed' : '', md === 'count' ? 'Monthly count' : md === 'out' ? (isJob(m) ? 'Given to setter' : 'Used / consumed') : 'Receipt no.')}</div>
      ${md === 'out' ? `<p class="muted fnote full">${isJob(m) ? 'Job stock always goes out to a JO that is already in the system.' : 'Supplies (non-job): no JO needed.'}</p>` : ''}</div>
      <p class="err" id="mErr">${esc(MS.err)}</p><div class="fbtns"><button class="pill tap" id="mvSave">${{ in: 'ADD TO STOCK', out: 'TAKE OUT', count: 'SAVE COUNT' }[md]}</button></div></div>` : ''}
    ${can.edit ? `<details class="medit" ${MS.editing ? 'open' : ''}><summary><span class="lab">Edit details</span></summary>
      ${inp('meName', 'Name', m.name, '')}<div class="fgrid">${(MFIELDS[m.kind] || MFIELDS.other).map(([f, lab, ph]) => inp('me_' + f, lab, m[f], ph)).join('')}${unitSel('meUnit', m.unit)}
      ${inp('meSup', 'Supplier', m.supplier, '')}${locIn('meLoc', m.location)}${inp('meMin', 'Low-stock alert at', m.min_qty, '', 'inputmode="decimal"')}<div class="full">${inp('meNotes', 'Notes', m.notes, '')}</div></div>
      <div class="fbtns"><button class="pill outline tap" id="meSave">SAVE DETAILS</button><button class="lnk" id="meArch">${m.active ? 'Archive (hide)' : 'Restore'}</button></div>
      <p class="muted fnote">Stock items are never deleted. Archive hides it from the lists; Restore brings it back. ${H.some(x => x.jo) ? 'Its history and the JOs it went to stay.' : 'Its history stays.'}</p></details>` : ''}
    ${!m.active ? `<p class="ccsum">Archived: hidden from the lists, nothing deleted.${can.edit ? ' Open Edit details and tap Restore to use it again.' : ''}</p>` : ''}
    <div class="mhist"><div class="dtitle"><span class="lab">History · ${H.length}</span><span class="lab">newest first</span></div>${H.map(row).join('') || '<p class="muted rvnone">No movements yet.</p>'}</div></div>`;
}
function mWire(main) {
  const { call, toast } = window.OYP, live = window.OYP.here(), $ = s => main.querySelector(s), val = s => ($(s) ? $(s).value.trim() : undefined);
  main.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { MS.view = b.dataset.mv; mDraw(main); });
  $('#mQ').oninput = e => { MS.q = e.target.value; const pos = e.target.selectionStart; mDraw(main); const q = $('#mQ'); q.focus(); q.setSelectionRange(pos, pos); };
  main.querySelectorAll('[data-mat]').forEach(el => el.onclick = async () => { MS.adding = false; MS.open = el.dataset.mat; MS.err = ''; MS.editing = false; await mHist(MS.open); if (!live()) return; mDraw(main); if (innerWidth < 900) scrollTo(0, 0); });
  main.querySelectorAll('[data-mx]').forEach(b => b.onclick = () => { MS.adding = false; MS.err = ''; if (innerWidth < 900) MS.open = null; mDraw(main); });
  if ($('#mAdd')) $('#mAdd').onclick = () => { MS.adding = true; MS.err = ''; MS.draft = {}; mDraw(main); if (innerWidth < 900) scrollTo(0, 0); };
  const keep = () => { if (!$('#maName')) return; const d = MS.draft; d.name = val('#maName'); MFIELDS[MS.kind].forEach(([f]) => { d[f] = val('#ma_' + f); });
    d.unit = val('#maUnit'); d.qty = val('#maQty'); d.unit_cost = val('#maCost'); d.supplier = val('#maSup'); d.location = val('#maLoc'); d.min_qty = val('#maMin'); d.notes = val('#maNotes'); };
  main.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { keep(); MS.kind = b.dataset.mk; MS.draft.unit = UNIT_DEF[MS.kind]; mDraw(main); });
  const done = async (r, msg) => {
    if (!live()) return; // the user moved on while saving: the save stands, just don't redraw over the new page
    if (!r || !r.ok) { MS.err = (r && r.error) || 'Could not save'; if (r && r.code === 'CONFLICT') { await renderMats(main, MS.u); MS.err = r.error; mDraw(main); } else { const e = $('#mErr'); if (e) e.textContent = MS.err; else toast(MS.err); ['#mvSave', '#maSave', '#meSave'].forEach(k => { if ($(k)) $(k).disabled = false; }); } return; } // fix and try again
    MS.err = ''; toast(msg); if (r.item) MS.open = r.item.mat_id; if (msg === 'Archived' || msg === 'Restored') MS.view = 'all'; MS.adding = false; delete MS.hist[MS.open]; await renderMats(main, MS.u);
  };
  if ($('#maSave')) $('#maSave').onclick = async e => { keep(); const d = MS.draft, item = { kind: MS.kind, name: d.name, unit: d.unit, supplier: d.supplier, location: d.location, min_qty: d.min_qty, notes: d.notes };
    MFIELDS[MS.kind].forEach(([f]) => { item[f] = d[f]; }); item.qty = d.qty; item.unit_cost = d.unit_cost;
    e.target.disabled = true; await done(await call('matSave', { item }), 'Stock item added'); };
  main.querySelectorAll('[data-mm]').forEach(b => b.onclick = () => { MS.mode = b.dataset.mm; MS.err = ''; mDraw(main); });
  if ($('#mvSave')) $('#mvSave').onclick = async e => {
    const cur = MS.r.items.find(x => x.mat_id === MS.open);
    if (MS.mode === 'out' && cur && isJob(cur) && !val('#mvJo')) { MS.err = 'Type the JO number this was used for (e.g. 26-103). Job stock always goes out to a JO.'; $('#mErr').textContent = MS.err; $('#mvJo').focus(); return; }
    e.target.disabled = true;
    await done(await call('matMove', { mat_id: MS.open, move: MS.mode, qty: val('#mvQty'), unit_cost: val('#mvCost'), supplier: val('#mvSup'), jo: val('#mvJo'), note: val('#mvNote') }),
      { in: 'Added to stock', out: 'Taken out of stock', count: 'Count saved' }[MS.mode]); };
  const m = MS.r.items.find(x => x.mat_id === MS.open);
  if ($('#meSave')) $('#meSave').onclick = async () => { const item = { name: val('#meName'), unit: val('#meUnit'), supplier: val('#meSup'), location: val('#meLoc'), min_qty: val('#meMin'), notes: val('#meNotes') };
    (MFIELDS[m.kind] || MFIELDS.other).forEach(([f]) => { item[f] = val('#me_' + f); }); MS.editing = true;
    await done(await call('matSave', { mat_id: m.mat_id, base_updated_at: m.updated_at, item }), 'Details saved'); MS.editing = false; };
  if ($('#meArch')) $('#meArch').onclick = async () => { if (m.active && !confirm('Archive ' + m.name + '? It is hidden from the list. Nothing is deleted and you can restore it.')) return;
    await done(await call('matSave', { mat_id: m.mat_id, base_updated_at: m.updated_at, item: { active: !m.active } }), m.active ? 'Archived' : 'Restored'); };
  const med = $('.medit'); if (med) med.ontoggle = () => { MS.editing = med.open; };
}
// a fresh visit (menu / link) on a phone starts on the list; on a desktop the last item stays open
window.OYPInv = { renderJos: (m, u) => { IV.open = null; return renderJos(m, u); }, renderMats: (m, u) => { if (innerWidth < 900) { MS.open = null; MS.adding = false; } return renderMats(m, u); } };
})();
