/* OYP back office: Inventory (#/jos, every JO / finished piece) and Materials (#/inventory, raw stock).
   Server: InventoryPages.gs (invList, invThumbs, matList, matHistory, matSave, matMove). The server strips what a role may not
   see (price + margin: executives; costs: executives + production manager); this file only draws what it gets.
   Move / Archive on this page is one call, invBulk (paste/InvBulk.gs.txt). It changes location. It does not delete a row. */
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
const BULK_NOTE = 'Moving and archiving needs the InvBulk paste in Apps Script (see paste/InvBulk.gs.txt).';

/* =================== Inventory (#/jos) =================== */
const IV = { r: null, view: 'all', stage: '', loc: '', type: '', q: '', thumbs: {}, open: null, at: 0, sel: new Set(), anchor: '', menu: '', picking: false, choose: false, suppress: false, busy: false, offer: '', scanned: [] };
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
const locLab = k => window.OYP.locLabel(k, ((IV.r && IV.r.locations || []).find(l => l[0] === k) || [k, k])[1]);
const typeLab = k => ((IV.r && IV.r.item_types || []).find(t => t[0] === k) || [k, k])[1];
function ivHay(j) {
  return [j.jo, j.parent_jo, j.description, j.client, j.metal, kar(j.karat), j.karat, j.stone_type, j.stone_size, j.grade, j.material, j.size,
    j.item_type && typeLab(j.item_type), j.location && locLab(j.location), stageLabel(j.stage), j.type === 'repair' ? 'repair' : ''].join(' ').toLowerCase();
}
function ivShown() {
  const toks = IV.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = IV.r.jobs.filter(j => IVIEWS[IV.view][1](j) && (!IV.stage || j.col === IV.stage) && (!IV.loc || (IV.loc === '-' ? !j.location : j.location === IV.loc))
    && (!IV.type || (IV.type === 'job:repair' ? j.type === 'repair' : j.item_type === IV.type)) && (!toks.length || (h => toks.every(t => h.includes(t)))(ivHay(j))));
  // Scanned tiles that are still selected sit at the top, newest scan first. The rest keep this order.
  if (!IV.scanned.length) return list;
  const at = new Map(list.map(j => [j.jo, j]));
  const pinned = [], used = new Set();
  IV.scanned.forEach(id => {
    if (used.has(id) || !IV.sel.has(id)) return;
    const j = at.get(id); if (!j) return;
    used.add(id); pinned.push(j);
  });
  return pinned.length ? pinned.concat(list.filter(j => !used.has(j.jo))) : list;
}
function ivEdit() { const u = IV.u; return !!(u && (u.role === 'admin' || u.role === 'production_manager')); }
function ivMoveLocs() { return ((IV.r && IV.r.locations) || []).filter(l => l[0] && l[0] !== 'archived'); }
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
  if (IV.offer) { const hid = ivById(IV.offer); if (!hid || L.some(j => j.jo === hid.jo)) IV.offer = ''; }
  const liveIds = new Set(r.jobs.map(j => j.jo));
  [...IV.sel].forEach(id => { if (!liveIds.has(id)) IV.sel.delete(id); });
  IV.scanned = IV.scanned.filter(id => liveIds.has(id) && IV.sel.has(id));
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('iv-coarse');
  const cnt = k => r.jobs.filter(IVIEWS[k][1]).length;
  const onHand = r.jobs.filter(j => j.on_hand && !MAKING[j.location]);
  const sumC = onHand.reduce((t, j) => t + (Number(j.cost) || 0), 0), sumP = onHand.reduce((t, j) => t + (Number(j.price) || 0), 0);
  const sum = [plural(onHand.length, 'finished piece') + ' on hand', plural(cnt('making'), 'job') + ' in production'];
  if (can.cost) sum.push('on-hand cost ' + peso(sumC)); if (can.price) sum.push('on-hand price ' + peso(sumP));
  const sel = (id, lab, cur, opts) => `<label class="ivsel"><span class="lab">${esc(lab)}</span><select id="${id}"><option value="">Any</option>${opts.map(([k, t]) => `<option value="${esc(k)}" ${cur === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const filt = IV.stage || IV.loc || IV.type, edit = ivEdit(), n = IV.sel.size, ids = L.map(j => j.jo);
  const allOn = ids.length > 0 && ids.every(id => IV.sel.has(id));
  const moves = ivMoveLocs().map(l => `<option value="${esc(l[0])}">${esc(locLab(l[0]))}</option>`).join('');
  const bar = n ? `<div class="ivbar" role="toolbar" aria-label="Selected items">
      <b class="ivn">${n} selected</b>
      <button type="button" class="pill sm" id="ivPrint">Print stickers (${n})</button>
      ${edit ? `<select id="ivMove" aria-label="Move to…"><option value="">Move to…</option>${moves}</select>
      <button type="button" class="pill sm" id="ivArch">Archive</button>
      ${IV.view === 'archived' ? '<button type="button" class="pill sm outline" id="ivUnarch">Unarchive</button>' : ''}` : ''}
      <button type="button" class="lnk" id="ivClear">Clear</button>
    </div>` : '';
  main.innerHTML = `<div class="iv${IV.choose ? ' choose' : ''}${n ? ' hasbar' : ''}">
    <div class="dhead"><h2>${esc(title)}</h2><span class="dheadacts"><span class="lab">${esc(plural(L.length, 'item'))}</span><button type="button" class="pill sm outline" id="ivChoose">${IV.choose ? 'Done' : 'Select'}</button></span></div>
    <p class="muted">Every JO and finished piece. ${can.open ? 'Tap one to open its JO card.' : 'View only: tap one to see its details.'}</p>
    <p class="ivsum">${sum.map(esc).join(' · ')}</p>
    <div class="rvchips ivchips">${Object.keys(IVIEWS).map(k => `<button class="fchip tap ${IV.view === k ? 'on' : ''}" data-iv="${k}">${esc(IVIEWS[k][0])} <b>${cnt(k)}</b></button>`).join('')}</div>
    <input id="ivQ" class="rvq" placeholder="Search or scan JO, client, 18k, sapphire…" value="${esc(IV.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search or scan JO, client, 18k, sapphire">
    ${edit && IV.offer ? `<p class="ivoffer" role="status">JO ${esc(IV.offer)} is in Inventory, hidden by the current filters. <button type="button" class="pill sm outline" id="ivUnfilter">Clear filters</button></p>` : ''}
    <div class="ivsels">${sel('ivStage', 'Stage', IV.stage, r.stages)}${sel('ivLoc', 'Location', IV.loc, r.locations.map(l => [l[0], locLab(l[0])]).concat([['-', 'No location yet']]))}
      ${sel('ivType', 'Type', IV.type, r.item_types.concat([['job:repair', 'Repair jobs']]))}${filt ? '<button class="lnk ivclr" id="ivClr">Clear</button>' : ''}</div>
    ${IV.choose && L.length ? `<label class="ivall"><input type="checkbox" id="ivAll" ${allOn ? 'checked' : ''}><span>Select all</span></label>${n ? `<span class="ivcount">${n} selected</span>` : ''}` : ''}
    <div class="ivgrid" id="ivGrid">${L.map(j => ivCard(j, can, edit)).join('') || `<p class="muted rvnone">${IV.q || filt ? 'No match.' : 'Nothing here.'}</p>`}</div>
    ${bar}
  </div>${IV.open ? ivSheet(r.jobs.find(j => j.jo === IV.open), edit) : ''}`;
  const all = main.querySelector('#ivAll');
  if (all) all.indeterminate = n > 0 && !allOn && ids.some(id => IV.sel.has(id));
  ivWire(main); ivThumbs(main, L);
}
function ivCard(j, can, edit) {
  const { esc } = window.OYP, c = [];
  c.push(j.location === 'archived' ? '<span class="chip arch">Archived</span>' : j.location ? `<span class="chip dark">${esc(locLab(j.location))}</span>` : '<span class="chip gold">No location</span>');
  if (MAKING[j.location] && j.stage) c.push(`<span class="chip">${esc(stageLabel(j.stage))}</span>`);
  if (j.late) c.push('<span class="chip gold">Late</span>');
  if (j.type === 'repair') c.push('<span class="chip">Repair</span>');
  if (j.review) c.push('<span class="chip">To review</span>');
  const money = [];
  if (can.cost) money.push(j.cost != null ? `<span>Cost <b>${esc(peso(j.cost))}</b></span>` : '<span class="muted">No cost yet</span>');
  if (can.price) { if (j.price != null) money.push(`<span>Price <b>${esc(peso(j.price))}</b></span>`); if (j.margin_pct != null) money.push(`<span class="ivm">${esc(j.margin_pct)}%</span>`); }
  const sp = specs(j), ph = IV.thumbs[j.jo], on = IV.sel.has(j.jo), arch = j.location === 'archived';
  const tools = (IV.choose ? `<label class="ivck"><input type="checkbox" data-ck="${esc(j.jo)}" ${on ? 'checked' : ''} aria-label="Select ${esc(j.jo)}"></label>` : '')
      + (edit ? `<button type="button" class="ivmore" data-more="${esc(j.jo)}" aria-label="Actions for ${esc(j.jo)}" aria-haspopup="menu" aria-expanded="${IV.menu === j.jo ? 'true' : 'false'}">⋯</button>` : '');
  const menu = edit && IV.menu === j.jo ? `<div class="ivmenu" role="menu"><button type="button" data-arch="${esc(j.jo)}">${arch ? 'Unarchive' : 'Archive'}</button><button type="button" data-detail="${esc(j.jo)}">Details</button></div>` : '';
  return `<div class="ivcard tap${on ? ' on' : ''}${IV.menu === j.jo ? ' menu' : ''}" data-jo="${esc(j.jo)}"><div class="ivph ${ph ? 'has' : ''}" data-th="${esc(j.jo)}"${ph ? ` style="background-image:url('${ph}')"` : ''}>${tools}${ph ? '' : `<span>${j.has_photo && ph === undefined ? '' : 'No photo'}</span>`}</div>${menu}
    <div class="ivb"><div class="kjo">${window.OYP.piece(j.client, j.jo)}${j.parent_jo ? `<span class="muted sm">of ${esc(j.parent_jo)}</span>` : ''}${j.item_type ? `<span class="muted sm">${esc(typeLab(j.item_type))}</span>` : ''}</div>
    <div class="kd">${esc(j.description || 'No details yet')}</div>${sp ? `<div class="ivsp">${esc(sp)}</div>` : ''}
    <div class="kf">${c.join('')}</div>${money.length ? `<div class="ivmoney">${money.join('')}</div>` : ''}</div></div>`;
}
function ivSheet(j, edit) { // details. Roles that can't open the JO card land here from the tile. Editors open it from the tile menu.
  if (!j) return ''; const { esc } = window.OYP, arch = j.location === 'archived';
  const f = (lab, v) => v ? `<div class="ivf"><span class="lab">${esc(lab)}</span><b>${esc(v)}</b></div>` : '';
  const act = edit ? `<div class="ivacts"><button type="button" class="pill sm outline" id="ivArchOne">${arch ? 'Unarchive' : 'Archive'}</button>
      <p class="muted">Archive keeps the JO on record. Nothing is deleted.</p></div>` : '';
  return `<div class="ivsheet" id="ivSheet"><div class="ivsbox"><button class="lnk dback" id="ivSX">‹ BACK</button>
    <div class="dhead"><h2>${window.OYP.piece(j.client, j.jo)}</h2><span class="lab">${edit ? 'Details' : 'View only'}</span></div>
    <div class="ivph big ${IV.thumbs[j.jo] ? 'has' : ''}"${IV.thumbs[j.jo] ? ` style="background-image:url('${IV.thumbs[j.jo]}')"` : ''}>${IV.thumbs[j.jo] ? '' : '<span>No photo</span>'}</div>
    <p class="kd">${esc(j.description || 'No details')}</p>
    <div class="ivfs">${f('Client', j.client)}${f('Location', j.location ? locLab(j.location) : 'No location yet')}${f('Stage', MAKING[j.location] ? stageLabel(j.stage) : '')}
      ${f('Type', j.item_type ? typeLab(j.item_type) : '')}${f('Job', j.type === 'repair' ? 'Repair' : j.type === 'revision' ? 'Revision' : j.type ? 'New job' : '')}
      ${f('Metal', [kar(j.karat), j.metal].filter(Boolean).join(' '))}${f('Stone', [j.stone_type, j.stone_size, j.grade].filter(Boolean).join(' '))}${f('Material', j.material)}
      ${f('Size', j.size)}${f('Weight', j.weight_g ? j.weight_g + ' g' : '')}${f('Due', day(j.due))}${f('Part of', j.parent_jo)}</div>
    ${act}</div></div>`;
}
function ivRange(jo, shift) {
  const ids = ivShown().map(j => j.jo); // visible order, scanned tiles included where they sit now
  if (shift && IV.anchor && ids.includes(IV.anchor) && ids.includes(jo)) {
    const a = ids.indexOf(IV.anchor), b = ids.indexOf(jo), lo = Math.min(a, b), hi = Math.max(a, b);
    for (let i = lo; i <= hi; i++) IV.sel.add(ids[i]);
    return;
  }
  if (IV.sel.has(jo)) IV.sel.delete(jo); else IV.sel.add(jo);
  IV.anchor = jo;
}
function ivJobs(jos) { return jos.map(jo => IV.r.jobs.find(j => j.jo === jo)).filter(Boolean); }
function ivPrintJo(j) {
  const raw = String(j && j.jo || '');
  const p = joParts(raw);
  if (!p) return raw;
  if (p.letter) return p.text;
  const v = String(j.version || '').trim().toUpperCase();
  return /^[A-Z]$/.test(v) ? p.base + v : p.text;
}
async function ivBulk(main, jos, location, kind) {
  const list = ivJobs(jos).filter(j => (location === '' ? j.location === 'archived' : j.location !== location));
  if (!list.length) { window.OYP.toast(location === '' ? 'Nothing archived is selected' : 'Already there'); return; }
  if (IV.busy) return;
  IV.busy = true;
  const r = await window.OYP.call('invBulk', { jos: list.map(j => j.jo), location: location });
  IV.busy = false;
  if (!window.OYP.here()()) return;
  if (!r || !r.ok) return window.OYP.toast(!r || r.error === 'Unknown action' ? BULK_NOTE : (r && r.error) || 'Could not update');
  const sets = r.set || [];
  const done = new Set(sets.map(x => x.jo));
  IV.r.jobs.forEach(j => { if (done.has(j.jo)) j.location = location; });
  IV.sel.clear(); IV.scanned = []; IV.menu = ''; IV.anchor = ''; IV.picking = false;
  const n = done.size, word = kind === 'archive' ? 'Archived' : kind === 'unarchive' ? 'Unarchived' : 'Moved';
  const msg = word + ' ' + n + (r.missing && r.missing.length ? ' · ' + r.missing.length + ' not found' : '');
  if ((kind === 'archive' || kind === 'unarchive') && window.OYP.toastUndo) {
    window.OYP.toastUndo(msg, async () => {
      const groups = {};
      sets.forEach(s => { const from = s.from || ''; (groups[from] = groups[from] || []).push(s.jo); });
      let bad = '';
      for (const from of Object.keys(groups)) {
        const back = await window.OYP.call('invBulk', { jos: groups[from], location: from });
        if (!back || !back.ok) { bad = (back && back.error) || 'Could not undo'; break; }
        const backSet = new Set((back.set || []).map(x => x.jo));
        IV.r.jobs.forEach(j => { if (backSet.has(j.jo)) j.location = from; });
      }
      window.OYP.toast(bad || 'Restored');
      await renderJos(main, IV.u);
    });
  } else window.OYP.toast(msg);
  await renderJos(main, IV.u);
}
function ivArchive(main, jos) {
  const list = ivJobs(jos).filter(j => j.location !== 'archived');
  if (!list.length) return window.OYP.toast('Already archived');
  if (list.length > 1 && !confirm('Archive ' + list.length + ' items? They stay on record. Nothing is deleted.')) return;
  return ivBulk(main, list.map(j => j.jo), 'archived', 'archive');
}
function ivWire(main) {
  const $ = s => main.querySelector(s);
  const stop = e => e.stopPropagation();
  main.querySelectorAll('[data-iv]').forEach(b => b.onclick = () => { IV.view = b.dataset.iv; IV.menu = ''; ivDraw(main); });
  $('#ivQ').oninput = e => { IV.q = e.target.value; const pos = e.target.selectionStart; ivDraw(main); const q = $('#ivQ'); q.focus(); q.setSelectionRange(pos, pos); };
  $('#ivQ').onkeydown = e => {
    if (e.isComposing) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { ivQReset(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) ivQNote();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = e.target.value;
    if (!ivEdit() || !(ivQFast(raw) || ivFullJo(raw))) return;
    IV.q = '';
    ivQReset();
    ivScanCommit(raw, true);
  };
  $('#ivStage').onchange = e => { IV.stage = e.target.value; if (IV.stage && IV.view !== 'all' && IV.view !== 'making') IV.view = 'all'; ivDraw(main); };
  $('#ivLoc').onchange = e => { IV.loc = e.target.value; if (IV.loc) IV.view = IV.loc === 'archived' ? 'archived' : 'all'; ivDraw(main); };
  $('#ivType').onchange = e => { IV.type = e.target.value; ivDraw(main); };
  if ($('#ivClr')) $('#ivClr').onclick = () => { IV.stage = IV.loc = IV.type = ''; IV.offer = ''; ivDraw(main); };
  if ($('#ivUnfilter')) $('#ivUnfilter').onclick = () => ivReveal(main);
  if ($('#ivAll')) $('#ivAll').onclick = e => {
    const ids = ivShown().map(j => j.jo);
    ids.forEach(id => e.target.checked ? IV.sel.add(id) : IV.sel.delete(id));
    if (ids.length) IV.anchor = ids[ids.length - 1];
    IV.picking = IV.sel.size > 0;
    ivDraw(main);
  };
  if ($('#ivChoose')) $('#ivChoose').onclick = () => {
    IV.choose = !IV.choose;
    if (!IV.choose) { IV.sel.clear(); IV.scanned = []; IV.anchor = ''; IV.picking = false; IV.menu = ''; }
    ivDraw(main);
  };
  if ($('#ivPrint')) $('#ivPrint').onclick = () => {
    const jos = ivJobs([...IV.sel]).map(ivPrintJo);
    if (!window.OYPPrint || !window.OYPPrint.askPrint) return window.OYP.toast('Print is not loaded');
    window.OYPPrint.askPrint(jos).then(r => { if (!window.OYP.here()()) return; if (!r || r.ok === false) return; IV.sel.clear(); IV.scanned = []; IV.choose = false; IV.picking = false; ivDraw(main); });
  };
  if ($('#ivClear')) $('#ivClear').onclick = () => { IV.sel.clear(); IV.scanned = []; IV.anchor = ''; IV.picking = false; IV.menu = ''; ivDraw(main); };
  if ($('#ivMove')) $('#ivMove').onchange = e => { const loc = e.target.value; if (!loc) return; ivBulk(main, [...IV.sel], loc, 'move'); };
  if ($('#ivArch')) $('#ivArch').onclick = () => ivArchive(main, [...IV.sel]);
  if ($('#ivUnarch')) $('#ivUnarch').onclick = () => ivBulk(main, [...IV.sel], '', 'unarchive');
  main.querySelectorAll('[data-ck]').forEach(input => {
    input.onclick = e => { stop(e); ivRange(input.dataset.ck, e.shiftKey); IV.picking = IV.sel.size > 0; ivDraw(main); };
  });
  main.querySelectorAll('.ivck').forEach(el => el.onclick = stop);
  main.querySelectorAll('[data-more]').forEach(b => b.onclick = e => {
    stop(e); IV.menu = IV.menu === b.dataset.more ? '' : b.dataset.more; ivDraw(main);
  });
  main.querySelectorAll('.ivmenu').forEach(el => el.onclick = stop);
  main.querySelectorAll('[data-arch]').forEach(b => b.onclick = e => {
    stop(e); const jo = b.dataset.arch, j = IV.r.jobs.find(x => x.jo === jo); IV.menu = '';
    if (j && j.location === 'archived') ivBulk(main, [jo], '', 'unarchive'); else ivArchive(main, [jo]);
  });
  main.querySelectorAll('[data-detail]').forEach(b => b.onclick = e => { stop(e); IV.menu = ''; IV.open = b.dataset.detail; ivDraw(main); });
  main.querySelectorAll('.ivcard').forEach(el => {
    el.onpointerdown = e => {
      if (!ivEdit() || (e.button && e.button !== 0) || e.target.closest('.ivck, .ivmore, .ivmenu')) return;
      const jo = el.dataset.jo, x0 = e.clientX, y0 = e.clientY;
      const hold = setTimeout(() => {
        IV.suppress = true; IV.picking = true; IV.sel.add(jo); IV.anchor = jo; IV.menu = '';
        const drop = () => { setTimeout(() => { IV.suppress = false; }, 0); };
        window.addEventListener('pointerup', drop, { once: true });
        ivDraw(main);
      }, 450);
      const end = ev => {
        if (ev && ev.type === 'pointermove' && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) clearTimeout(hold);
        else if (ev && ev.type !== 'pointermove') clearTimeout(hold);
        if (ev && ev.type !== 'pointermove') {
          el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); el.removeEventListener('pointermove', end);
        }
      };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointermove', end);
    };
    el.onclick = e => {
      if (e.target.closest('.ivck, .ivmore, .ivmenu')) return;
      if (IV.suppress) { IV.suppress = false; return; }
      const j = IV.r.jobs.find(x => x.jo === el.dataset.jo); if (!j) return;
      if (ivEdit() && e.shiftKey) { ivRange(j.jo, true); IV.picking = IV.sel.size > 0; ivDraw(main); return; }
      IV.menu = '';
      if (!(IV.r.can || {}).open) { IV.open = j.jo; ivDraw(main); return; }
      try { sessionStorage.setItem('oypReviewOpen', JSON.stringify({ jo: j.jo, back: '#/jos', label: 'BACK',
        row: { description: j.description, client: j.client, location: j.location, stage_label: stageLabel(j.stage), due: j.due, late: j.late } })); } catch (_) {}
      location.hash = '#/review';
    };
  });
  if ($('#ivArchOne')) $('#ivArchOne').onclick = () => {
    const j = IV.r.jobs.find(x => x.jo === IV.open); if (!j) return;
    if (j.location === 'archived') ivBulk(main, [j.jo], '', 'unarchive'); else ivArchive(main, [j.jo]);
  };
  if ($('#ivSX')) { $('#ivSX').onclick = () => { IV.open = null; ivDraw(main); }; $('#ivSheet').onclick = e => { if (e.target.id === 'ivSheet') { IV.open = null; ivDraw(main); } }; }
  const grid = $('#ivGrid');
  if (grid && ivEdit() && window.OYP.swipe) window.OYP.swipe(grid, {
    item: '.ivcard',
    ignore: '.ivmore, .ivmenu, .ivck',
    off: () => IV.choose || IV.sel.size > 0,
    actions: function (row) {
      const jo = row.getAttribute('data-jo');
      const j = IV.r.jobs.find(x => x.jo === jo);
      if (!j) return [];
      const arch = j.location === 'archived';
      return [
        { label: 'Print', run: function () { if (window.OYPPrint && window.OYPPrint.askPrint) return window.OYPPrint.askPrint([ivPrintJo(j)]); } },
        { label: arch ? 'Unarchive' : 'Archive', undoable: true, run: function () {
          if (arch) return ivBulk(main, [jo], '', 'unarchive');
          return ivArchive(main, [jo]);
        } }
      ];
    }
  });
  const on = main.querySelector('.ivchips .fchip.on'); if (on && innerWidth < 760) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.offsetLeft - 20;
}
function ivThumbs(main, L) { // piece photos only. 300px thumbs, loaded as tiles scroll in (no 60-tile cap). L kept for the call site.
  void L;
  if (!window.OYPPhotos) return;
  const grid = main.querySelector('#ivGrid');
  if (grid) window.OYPPhotos.watch(grid, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv' }),
    paint(el, src) {
      const k = el.dataset.th; IV.thumbs[k] = src || '';
      const cap = el.querySelector(':scope > span');
      if (src) { el.style.backgroundImage = `url('${src}')`; el.classList.add('has'); if (cap) cap.remove(); }
      else if (!cap) el.insertAdjacentHTML('beforeend', '<span>No photo</span>');
    }
  });
  const jo = IV.open, j = jo && IV.r && IV.r.jobs.find(x => x.jo === jo), big = main.querySelector('#ivSheet .ivph.big');
  if (big && j && j.has_photo) window.OYPPhotos.stage(big, { jo, kind: 'piece', legacy: 'inv', alt: 'Piece', empty: 'No photo' });
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
    MS.err = '';
    if ((msg === 'Archived' || msg === 'Restored') && r.item && window.OYP.toastUndo) {
      const item = r.item, backTo = msg === 'Archived';
      window.OYP.toastUndo(msg, async () => {
        const ures = await call('matSave', { mat_id: item.mat_id, base_updated_at: item.updated_at, item: { active: backTo } });
        if (!ures || !ures.ok) return toast((ures && ures.error) || 'Could not undo');
        toast(backTo ? 'Restored' : 'Archived');
        MS.view = 'all'; delete MS.hist[item.mat_id]; await renderMats(main, MS.u);
      });
    } else toast(msg);
    if (r.item) MS.open = r.item.mat_id; if (msg === 'Archived' || msg === 'Restored') MS.view = 'all'; MS.adding = false; delete MS.hist[MS.open]; await renderMats(main, MS.u);
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
  const matFlip = async item => { await done(await call('matSave', { mat_id: item.mat_id, base_updated_at: item.updated_at, item: { active: !item.active } }), item.active ? 'Archived' : 'Restored'); };
  if ($('#meArch')) $('#meArch').onclick = async () => { if (m.active && !confirm('Archive ' + m.name + '? It is hidden from the list. Nothing is deleted and you can restore it.')) return; await matFlip(m); };
  const mrows = main.querySelector('.rvrows');
  if (mrows && (MS.r.can || {}).edit && window.OYP.swipe) window.OYP.swipe(mrows, {
    item: '.mrow',
    actions: function (row) {
      const item = MS.r.items.find(x => x.mat_id === row.getAttribute('data-mat'));
      if (!item) return [];
      return [{ label: item.active ? 'Archive' : 'Restore', undoable: true, run: function () { matFlip(item); } }];
    }
  });
  const med = $('.medit'); if (med) med.ontoggle = () => { MS.editing = med.open; };
}
// a fresh visit (menu / link) on a phone starts on the list; on a desktop the last item stays open
window.OYPInv = { renderJos: (m, u) => { IV.open = null; IV.sel.clear(); IV.scanned = []; IV.menu = ''; IV.anchor = ''; IV.picking = false; IV.offer = ''; return renderJos(m, u); }, renderMats: (m, u) => { if (innerWidth < 900) { MS.open = null; MS.adding = false; } return renderMats(m, u); } };

/* Handheld scanner (keyboard wedge): fast keystrokes, then Enter, while no field is focused.
   The search box takes the same scan when it is focused: a fast wedge, or a full JO and Enter.
   Any other Enter leaves the text as a filter.
   A sticker's QR is the JO itself (26-287 or 26-287A) or a link / prefixed text that contains one
   (jo=26-287, or a path ending in /26-287). The same read is in consign.js.
   A sticker QR is the JO with its version letter (26-287B). That scan selects the 26-287B tile.
   A scan with no letter still folds to the base. If several tiles share that base, the newest letter is the one selected. */
const SCAN_GAP = 50, SCAN_ENTER = 80, SCAN_MAX = 400;
let scanBuf = '', scanAt = 0, qLastAt = 0, qBurstLen = 0;
function ivQNote() {
  const now = Date.now();
  qBurstLen = !qLastAt || now - qLastAt > SCAN_GAP ? 1 : qBurstLen + 1;
  qLastAt = now;
}
function ivQReset() { qLastAt = 0; qBurstLen = 0; }
function ivQFast(raw) {
  raw = String(raw || '');
  return raw.length >= 5 && qBurstLen === raw.length && !!qLastAt && Date.now() - qLastAt <= SCAN_ENTER;
}
function ivFullJo(raw) {
  const s = String(raw || '').trim();
  if (!s || /[:/]/.test(s)) return false;
  const p = joFromScan(s);
  if (!p) return false;
  const u = s.toUpperCase().replace(/\s+/g, '');
  const jo = (p.base + (p.letter || '')).toUpperCase();
  return u === jo || u === jo.replace('-', '');
}
function joPack_(yy, num, letter) {
  letter = letter || '';
  return { base: yy + '-' + num, letter: letter, text: yy + '-' + num + letter };
}
/** JO from a sticker. Plain 26-287 / 26-287A, or a URL or other text that contains one. */
function joFromScan(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) {}
  const u = s.toUpperCase();
  if (/^CS-[A-Z0-9-]+$/.test(u)) return null;
  let m = u.match(/(?:^|[?&#\s])JO=(\d{2})-?(\d{3,4})([A-Z])?(?![A-Z0-9])/);
  if (m) return joPack_(m[1], m[2], m[3]);
  const paths = [];
  const pre = /\/(\d{2})-(\d{3,4})([A-Z])?(?![A-Z0-9])/g;
  while ((m = pre.exec(u))) paths.push(m);
  if (paths.length) { m = paths[paths.length - 1]; return joPack_(m[1], m[2], m[3]); }
  m = u.match(/(?:^|[^A-Z0-9])JO\s*[:#]?\s*(\d{2})\s*[- ]?\s*(\d{3,4})\s*([A-Z])?(?![A-Z0-9])/);
  if (m) return joPack_(m[1], m[2], m[3]);
  const re = /(?:^|[^A-Z0-9])(\d{2})\s*[- ]\s*(\d{3,4})(?:\s*([A-Z])(?![A-Z0-9]))?/g;
  let last = null;
  while ((m = re.exec(u))) last = m;
  if (last) return joPack_(last[1], last[2], last[3]);
  if (!/[:/]/.test(u) && (m = u.match(/(\d{2})(\d{3,4})([A-Z])?$/))) return joPack_(m[1], m[2], m[3]);
  return null;
}
function joParts(s) {
  const p = joFromScan(s);
  return p ? { base: p.base, letter: p.letter } : null;
}
function ivVer(j) {
  const p = joParts(j.jo), v = String(j.version || (p && p.letter) || '').toUpperCase();
  return v.length === 1 ? v.charCodeAt(0) : 0;
}
function ivFindBase(base) {
  const hits = (IV.r.jobs || []).filter(j => { const p = joParts(j.jo); return p && p.base === base; });
  hits.sort((a, b) => ivVer(b) - ivVer(a) || (joParts(a.jo).letter ? 1 : 0) - (joParts(b.jo).letter ? 1 : 0));
  return hits[0] || null;
}
function ivFindScan(p) {
  if (p && p.letter) {
    const full = p.base + p.letter;
    const exact = (IV.r.jobs || []).find(j => String(j.jo).toUpperCase() === full);
    if (exact) return exact;
  }
  return ivFindBase(p.base);
}
function ivById(id) { return id ? ((IV.r.jobs || []).find(j => j.jo === id) || ivFindBase(id)) : null; }
function ivScanOn() { return !!(IV.r && ivEdit() && /^#\/jos(?:$|[/?])/.test(location.hash)); }
function ivField(el) { return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)); }
function ivRefocus(main) { const s = main.querySelector('#ivQ'); if (s) try { s.focus({ preventScroll: true }); } catch (e) { s.focus(); } }
function ivFlash(jo) {
  const grid = document.getElementById('ivGrid');
  if (grid) {
    const bar = document.querySelector('header.top');
    const pad = (bar ? bar.getBoundingClientRect().height : 0) + 8;
    const y = grid.getBoundingClientRect().top + window.scrollY - pad;
    window.scrollTo(0, Math.max(0, y));
  }
  const el = document.querySelector('.ivcard[data-jo="' + (window.CSS && CSS.escape ? CSS.escape(jo) : jo) + '"]');
  if (!el) return;
  el.classList.remove('ivflash'); void el.offsetWidth; el.classList.add('ivflash');
}
function ivTake(main, job, base, fromBox) {
  const already = IV.sel.has(job.jo);
  IV.offer = ''; IV.sel.add(job.jo); IV.anchor = job.jo; IV.picking = true; IV.menu = '';
  IV.scanned = [job.jo].concat(IV.scanned.filter(id => id !== job.jo));
  window.OYP.toast(already ? 'already selected' : base + ' selected (' + IV.sel.size + ')');
  ivDraw(main); if (fromBox) ivRefocus(main); ivFlash(job.jo);
}
function ivScanCommit(raw, fromBox) {
  const main = document.getElementById('main');
  if (!main || !IV.r) return;
  const p = joParts(raw);
  const shown = p ? p.base : String(raw || '').trim().replace(/\s+/g, ' ');
  const label = shown.length > 48 ? shown.slice(0, 45) + '…' : shown;
  const job = p && ivFindScan(p);
  if (!job) {
    const had = IV.offer; IV.offer = '';
    window.OYP.toast('JO ' + (label || '—') + ' not in Inventory');
    if (had) ivDraw(main);
    if (fromBox) ivRefocus(main);
    return;
  }
  if (!ivShown().some(j => j.jo === job.jo)) {
    IV.offer = job.jo;
    window.OYP.toast('JO ' + job.jo + ' is hidden by a filter');
    ivDraw(main); if (fromBox) ivRefocus(main);
    return;
  }
  ivTake(main, job, job.jo, fromBox);
}
function ivReveal(main) {
  const id = IV.offer, job = ivById(id);
  IV.offer = '';
  if (!job) { ivDraw(main); return; }
  IV.q = ''; IV.stage = ''; IV.loc = ''; IV.type = '';
  if (!IVIEWS[IV.view][1](job)) IV.view = job.location === 'archived' ? 'archived' : 'all';
  ivTake(main, job, job.jo, false);
}
document.addEventListener('keydown', e => {
  if (!ivScanOn() || ivField(document.activeElement) || e.isComposing) return;
  if (e.key === 'Enter') {
    const raw = scanBuf, fast = !!(raw && Date.now() - scanAt <= SCAN_ENTER);
    scanBuf = '';
    if (!fast) return;
    e.preventDefault(); e.stopPropagation();
    ivScanCommit(raw, false);
    return;
  }
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  const now = Date.now();
  if (scanBuf && now - scanAt > SCAN_GAP) scanBuf = '';
  scanBuf += e.key; scanAt = now;
  if (scanBuf.length > SCAN_MAX) scanBuf = scanBuf.slice(-SCAN_MAX);
}, true);
})();
