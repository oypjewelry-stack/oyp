/* OYP back office: Inventory (#/jos, every JO / finished piece) and Materials (#/inventory, raw stock).
   Material prices is the Prices tab on this page for roles that had that menu item. Stock is this file's materials list.
   Server: InventoryPages.gs (invList, invThumbs, matList, matHistory, matSave, matMove). The server strips what a role may not
   see (price + margin: executives; costs: executives + production manager); this file only draws what it gets.
   JO photos are card scans. They follow can.cost, the same gate as the cost line. A page-2 sketch is only a stand-in profile.
   Move / Archive on this page is one call, invBulk (paste/InvBulk.gs.txt). It changes location. It does not delete a row.
   Delete is a separate call, invDelete, and the sheet asks before it sends that. */
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
const IV = { r: null, view: 'all', stage: '', loc: '', type: '', q: '', thumbs: {}, sketch: {}, open: null, at: 0, sel: new Set(), anchor: '', picking: false, choose: false, suppress: false, busy: false, offer: '', scanned: [], extra: 0, dropped: new Set(), revSeq: 0, want: '', dbgSeq: 0 };
let ivPhotoKey = null, ivPhotoDown = null;
function ivPhotoListen(key, down) {
  if (ivPhotoKey) document.removeEventListener('keydown', ivPhotoKey, true);
  if (ivPhotoDown) document.removeEventListener('pointerdown', ivPhotoDown, true);
  ivPhotoKey = key;
  ivPhotoDown = down;
  if (key) document.addEventListener('keydown', key, true);
  if (down) document.addEventListener('pointerdown', down, true);
}
function ivPencilSvg() {
  return '<span class="ivpface"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>';
}
const MAKING = { working: 1, queue: 1 };
const IVIEWS = {
  all: ['All', j => j.location !== 'archived'],
  review: ['REVIEW', j => !!(j.review || j.pending_review)],
  debug: ['DEBUG', () => false],
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
    j.item_type && typeLab(j.item_type), j.location && locLab(j.location), stageLabel(j.stage), j.type === 'repair' ? 'repair' : '',
    (j.review || j.pending_review) ? 'review' : ''].join(' ').toLowerCase();
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
function ivClientName(v) { if (!v) return ''; return typeof v === 'string' ? v : (v.name || ''); }
function ivFromReview(j) {
  return {
    jo: j.jo, parent_jo: j.parent_jo || '', description: j.description || '', client: ivClientName(j.client),
    metal: j.metal || '', karat: j.karat || '', stone_type: j.stone_type || '', stone_size: j.stone_size || '',
    grade: j.grade || '', material: j.material || '', size: j.size || '', weight_g: j.weight_g || '',
    item_type: j.item_type || '', location: j.location || '', stage: '', col: '', type: j.type || '',
    due: j.due_date || '', review: true, pending_review: true, late: false,
    has_photo: !!(j.pages && j.pages.length), on_hand: false, version: j.version || ''
  };
}
function ivCopyReview(row, job) {
  if (!row || !job) return;
  const name = ivClientName(job.client);
  if (name) row.client = name;
  ['description', 'location', 'item_type', 'type', 'metal', 'karat', 'size', 'stone_type', 'stone_size', 'grade', 'material', 'weight_g'].forEach(k => {
    if (job[k] != null) row[k] = job[k];
  });
  if (job.due_date) row.due = job.due_date;
}
function ivMergeDrafts(jobs) {
  if (!IV.r || !Array.isArray(jobs)) return;
  const skip = { reviewed: 1, discarded: 1, deleted: 1, replaced: 1 };
  const pending = new Set();
  jobs.forEach(src => {
    if (!src || !src.jo || IV.dropped.has(src.jo) || skip[src.review_state]) return;
    pending.add(src.jo);
    if (!IV.r.jobs.some(j => j.jo === src.jo)) IV.r.jobs.push(ivFromReview(src));
  });
  IV.r.jobs.forEach(j => {
    const on = pending.has(j.jo);
    j.review = on;
    j.pending_review = on;
  });
}
function ivReviewCount() { return IV.r && IV.r.jobs ? IV.r.jobs.filter(j => j.review || j.pending_review).length : 0; }
function ivDebugCount() { return window.OYPJoInbox && window.OYPJoInbox.count ? window.OYPJoInbox.count() : 0; }
function ivCountRole(u) {
  const roles = window.OYPNav && window.OYPNav.COUNT_ROLES;
  return !!(u && roles && roles[u.role]);
}
function ivChipKeys() {
  if (IV.u && IV.u.role === 'staff') return ['count'];
  const keys = Object.keys(IVIEWS).filter(k => k !== 'debug' || ivEdit());
  if (ivCountRole(IV.u)) keys.push('count');
  return keys;
}
function ivChipCount(k) { return k === 'debug' ? ivDebugCount() : (IV.r && IV.r.jobs ? IV.r.jobs.filter(IVIEWS[k][1]).length : 0); }
function ivHead(text) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('title');
  if (el) el.textContent = text;
}
function ivPaintNav() {
  if (typeof document === 'undefined') return;
  const onInv = !!document.querySelector('.ivchips');
  const queued = window.OYPReview && window.OYPReview.navPending ? window.OYPReview.navPending() : 0;
  const reviewN = onInv ? ivReviewCount() : (queued || ivReviewCount());
  const lookN = ivDebugCount();
  const show = reviewN + lookN;
  document.querySelectorAll('[data-ncount="review"]').forEach(el => {
    el.textContent = show ? (show > 99 ? '99+' : String(show)) : '';
    el.hidden = !show;
  });
  document.querySelectorAll('[data-ivcount="debug"]').forEach(el => { el.textContent = String(lookN); });
}
function ivApplyReview(main, jo, mark, job) {
  const row = IV.r && IV.r.jobs.find(x => x.jo === jo);
  ivCopyReview(row, job);
  if (mark) {
    IV.dropped.add(jo);
    if (row) { row.review = false; row.pending_review = false; }
    if (window.OYPReview && window.OYPReview.drop) window.OYPReview.drop(jo);
  }
  ivDraw(main);
}
async function ivMountReview(main, j) {
  const host = main.querySelector('#ivRev');
  if (!host || !j || !window.OYPReview || !window.OYPReview.mount) return;
  const seq = ++IV.revSeq, jo = j.jo;
  try {
    await window.OYPReview.mount(host, jo, {
      onDone: (mark, job) => { if (seq !== IV.revSeq || !window.OYP.here()()) return; ivApplyReview(main, jo, mark, job); },
      onMissing: () => {
        IV.dropped.add(jo);
        const row = IV.r && IV.r.jobs.find(x => x.jo === jo);
        if (row) { row.review = false; row.pending_review = false; }
        if (seq !== IV.revSeq || !window.OYP.here()()) return;
        ivDraw(main);
      }
    });
  } catch (e) {
    if (host.isConnected) host.innerHTML = '<p class="muted">The review form could not be loaded.</p>';
  }
}
function ivMoveLocs() { return ((IV.r && IV.r.locations) || []).filter(l => l[0] && l[0] !== 'archived'); }
async function renderJos(main, u) {
  const { call, esc } = window.OYP, live = window.OYP.here(); IV.u = u; // live(): still on this route (app.js)
  if (u && u.role === 'staff') { IV.view = 'count'; ivDraw(main); return; } // staff open the COUNT tab only; the inventory list stays with the roles that had Inventory
  { // app.js serves the last answer at once and refreshes it in the background
    if (!IV.r) main.innerHTML = '<h2>Inventory</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
    const r = await call('invList'); if (!live()) return;
    if ((!r || !r.ok) && !IV.r) {
      if (IV.view === 'count' && ivCountRole(u)) { ivDraw(main); return; }
      main.innerHTML = `<h2>Inventory</h2><p class="muted">${esc(oldBackend(r) ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return;
    }
    if (r && r.ok) { IV.r = r; IV.at = Date.now(); }
    if (IV.r && ivEdit() && window.OYPReview && window.OYPReview.drafts) {
      try {
        const drafts = await window.OYPReview.drafts();
        if (!live()) return;
        if (drafts) ivMergeDrafts(drafts);
      } catch (e) {}
    }
    if (IV.want && IV.r && IV.r.jobs.some(j => j.jo === IV.want)) { IV.view = 'review'; IV.open = IV.want; }
    IV.want = '';
    if (IV.view === 'debug' && !ivEdit()) IV.view = 'all';
    if (IV.view === 'count' && !ivCountRole(u)) IV.view = 'all';
  }
  ivDraw(main);
}
function ivChipsHtml(esc) {
  return `<div class="rvchips ivchips">${ivChipKeys().map(k => {
    if (k === 'count') return `<button class="fchip tap ${IV.view === 'count' ? 'on' : ''}" data-iv="count">COUNT</button>`;
    const n = ivChipCount(k);
    const mark = (k === 'review' || k === 'debug') && n ? ' tbr' : '';
    const attr = k === 'debug' ? ' data-ivcount="debug"' : '';
    return `<button class="fchip tap ${IV.view === k ? 'on' : ''}${mark}" data-iv="${k}">${esc(IVIEWS[k][0])} <b${attr}>${n}</b></button>`;
  }).join('')}</div>`;
}
function ivDrawDebug(main) {
  const { esc } = window.OYP, title = IV.u.role === 'accounting' ? 'Inventory (view)' : 'Inventory';
  if (window.OYPJoInbox && window.OYPJoInbox.closeZoom) window.OYPJoInbox.closeZoom();
  main.innerHTML = `<div class="iv">
    <div class="dhead"><h2>${esc(title)}</h2></div>
    <p class="muted">Scanned cards the scanner was not sure about. Check the JO number, then confirm, fix, or discard.</p>
    ${ivChipsHtml(esc)}
    <div id="ivDebug"></div>
  </div>`;
  ivWire(main);
  ivMountDebug(main);
}
async function ivMountDebug(main) {
  const host = main.querySelector('#ivDebug');
  if (!host || !window.OYPJoInbox || !window.OYPJoInbox.render) return;
  const seq = ++IV.dbgSeq;
  try { await window.OYPJoInbox.render(host, IV.u, { embed: true }); }
  catch (e) { if (host.isConnected) host.innerHTML = '<p class="muted">Scanned cards could not be loaded.</p>'; }
  if (seq !== IV.dbgSeq || !host.isConnected) return;
  ivPaintNav();
}
function ivDrawCount(main) {
  const { esc } = window.OYP, title = IV.u && IV.u.role === 'accounting' ? 'Inventory (view)' : 'Inventory';
  ivHead('INVENTORY COUNT');
  main.innerHTML = `<div class="iv">
    <div class="dhead"><h2>${esc(title)}</h2></div>
    ${ivChipsHtml(esc)}
    <div id="ivCount"></div>
  </div>`;
  ivWire(main);
  const host = main.querySelector('#ivCount');
  if (host && window.OYPCount && window.OYPCount.render) window.OYPCount.render(host, IV.u);
}
function ivDraw(main) {
  if (window.OYP.popover) window.OYP.closePopover();
  if (IV.view === 'count') {
    if (ivCountRole(IV.u)) { ivDrawCount(main); return; }
    IV.view = 'all';
  }
  ivHead('Back office');
  if (IV.view === 'debug') {
    if (!ivEdit()) IV.view = 'all';
    else { ivDrawDebug(main); return; }
  }
  if (window.OYPJoInbox && window.OYPJoInbox.closeZoom) window.OYPJoInbox.closeZoom();
  const { esc } = window.OYP, r = IV.r, can = r.can || {}, L = ivShown(), title = IV.u.role === 'accounting' ? 'Inventory (view)' : 'Inventory';
  if (IV.offer) { const hid = ivById(IV.offer); if (!hid || L.some(j => j.jo === hid.jo)) IV.offer = ''; }
  const liveIds = new Set(r.jobs.map(j => j.jo));
  [...IV.sel].forEach(id => { if (!liveIds.has(id)) IV.sel.delete(id); });
  IV.scanned = IV.scanned.filter(id => liveIds.has(id) && IV.sel.has(id));
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('iv-coarse');
  const cnt = k => ivChipCount(k);
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
    <div class="dhead"><h2>${esc(title)}</h2><span class="dheadacts"><span class="lab">${esc(plural(L.length, 'item'))}</span></span></div>
    <p class="muted">${IV.view === 'review' ? 'Items marked REVIEW. Approve one here and it leaves this list.' : 'Every JO and finished piece. Tap one to see its details.'}</p>
    <p class="ivsum">${sum.map(esc).join(' · ')}</p>
    ${ivChipsHtml(esc)}
    ${ivQRow(esc)}
    ${edit && IV.offer ? `<p class="ivoffer" role="status">JO ${esc(IV.offer)} is in Inventory, hidden by the current filters. <button type="button" class="pill sm outline" id="ivUnfilter">Clear filters</button></p>` : ''}
    <div class="ivfilt"><div class="ivsels">${sel('ivStage', 'Stage', IV.stage, r.stages)}${sel('ivLoc', 'Location', IV.loc, r.locations.map(l => [l[0], locLab(l[0])]).concat([['-', 'No location yet']]))}
      ${sel('ivType', 'Type', IV.type, r.item_types.concat([['job:repair', 'Repair jobs']]))}${filt ? '<button class="lnk ivclr" id="ivClr">Clear</button>' : ''}</div>
      <div class="ivfiltacts"><button type="button" class="pill sm outline" id="ivChoose">${IV.choose ? 'Done' : 'Select'}</button></div></div>
    ${IV.choose && L.length ? `<label class="ivall"><input type="checkbox" id="ivAll" ${allOn ? 'checked' : ''}><span>Select all</span></label>${n ? `<span class="ivcount">${n} selected</span>` : ''}` : ''}
    <div class="ivgrid" id="ivGrid">${L.map(j => ivCard(j, can, edit)).join('') || `<p class="muted rvnone">${IV.q || filt ? 'No match.' : 'Nothing here.'}</p>`}</div>
    ${bar}
  </div>${IV.open ? ivSheet(r.jobs.find(j => j.jo === IV.open), edit) : ''}`;
  const all = main.querySelector('#ivAll');
  if (all) all.indeterminate = n > 0 && !allOn && ids.some(id => IV.sel.has(id));
  ivWire(main); ivThumbs(main, L); ivFitPills(main);
}
function ivCard(j, can, edit) {
  const { esc } = window.OYP, c = [];
  c.push(j.location === 'archived' ? '<span class="chip arch">Archived</span>' : j.location ? `<span class="chip dark">${esc(locLab(j.location))}</span>` : '<span class="chip gold">No location</span>');
  if (MAKING[j.location] && j.stage) c.push(`<span class="chip">${esc(stageLabel(j.stage))}</span>`);
  if (j.late) c.push('<span class="chip gold">Late</span>');
  if (j.type === 'repair') c.push('<span class="chip">Repair</span>');
  if (j.review || j.pending_review) c.push('<span class="chip gold tbr">REVIEW</span>');
  const money = [];
  if (can.cost) money.push(j.cost != null ? `<span>Cost <b>${esc(peso(j.cost))}</b></span>` : '<span class="muted">No cost yet</span>');
  if (can.price) { if (j.price != null) money.push(`<span>Price <b>${esc(peso(j.price))}</b></span>`); if (j.margin_pct != null) money.push(`<span class="ivm">${esc(j.margin_pct)}%</span>`); }
  const sp = specs(j), ph = IV.thumbs[j.jo], on = IV.sel.has(j.jo);
  const ck = IV.choose ? `<label class="ivck"><input type="checkbox" data-ck="${esc(j.jo)}" ${on ? 'checked' : ''} aria-label="Select ${esc(j.jo)}"></label>` : '';
  const more = edit ? `<button type="button" class="ivmore" data-more="${esc(j.jo)}" aria-label="Actions for ${esc(j.jo)}" aria-haspopup="menu" aria-expanded="false">⋯</button>` : '';
  const desc = j.description || '';
  const tip = desc ? ` title="${esc(desc)}"` : '';
  return `<div class="ivcard tap${on ? ' on' : ''}" data-jo="${esc(j.jo)}"><div class="ivph ${ph ? 'has' : ''}${IV.sketch[j.jo] ? ' sketch' : ''}" data-th="${esc(j.jo)}"${ph ? ` style="background-image:url('${ph}')"` : ''}>${ck}</div>
    <div class="ivb"><div class="kjo">${window.OYP.piece(j.client, j.jo)}${j.parent_jo ? `<span class="muted sm">of ${esc(j.parent_jo)}</span>` : ''}${j.item_type ? `<span class="muted sm">${esc(typeLab(j.item_type))}</span>` : ''}</div>
    <div class="kd"${tip}>${esc(desc || 'No details yet')}</div><div class="ivsp">${esc(sp)}</div>
    <div class="kf">${c.join('')}</div>${money.length ? `<div class="ivmoney">${money.join('')}</div>` : '<div class="ivmoney"></div>'}</div>${more}</div>`;
}
/* One pill line. A pill that does not fit is counted in +N, so the row never cuts a word in half. */
function ivFitPills(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('.ivcard .kf').forEach(row => {
    const old = row.querySelector('.ivplus');
    if (old) old.remove();
    const chips = [];
    let i, el;
    for (i = 0; i < row.children.length; i++) {
      el = row.children[i];
      if (el.classList && el.classList.contains('chip')) chips.push(el);
    }
    chips.forEach(ch => { ch.hidden = false; ch.style.display = ''; ch.style.maxWidth = ''; });
    const room = () => {
      if (row.clientWidth <= 0) return false;
      const edge = row.getBoundingClientRect().right;
      let k, node, last = null;
      for (k = 0; k < row.children.length; k++) {
        node = row.children[k];
        if (node.hidden || node.style.display === 'none') continue;
        last = node;
      }
      if (!last) return true;
      return last.getBoundingClientRect().right <= edge + 0.5;
    };
    const mark = n => {
      let badge = row.querySelector('.ivplus');
      chips.forEach((ch, idx) => {
        const hide = idx >= chips.length - n;
        ch.hidden = hide;
        ch.style.display = hide ? 'none' : '';
      });
      if (n > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'chip ivplus';
          row.appendChild(badge);
        }
        badge.textContent = '+' + n;
        badge.hidden = false;
      } else if (badge) badge.remove();
      return room();
    };
    if (room() || chips.length < 2) {
      if (!room() && chips[0]) chips[0].style.maxWidth = '100%';
      return;
    }
    let n = 0, ok = false;
    while (n < chips.length - 1) {
      n++;
      ok = mark(n);
      if (ok) return;
    }
    chips.forEach((ch, idx) => {
      ch.hidden = idx > 0;
      ch.style.display = idx > 0 ? 'none' : '';
      ch.style.maxWidth = '';
    });
    if (mark(chips.length - 1)) return;
    const badge = row.querySelector('.ivplus');
    const badgeW = badge ? badge.getBoundingClientRect().width : 0;
    if (chips[0]) chips[0].style.maxWidth = Math.max(24, row.clientWidth - badgeW - 4) + 'px';
  });
}
function ivSheet(j, edit) { // details, and the review form when this JO is still waiting. Actions stay on the floating ⋯ menu.
  if (!j) return ''; const { esc } = window.OYP;
  const f = (lab, v) => v ? `<div class="ivf"><span class="lab">${esc(lab)}</span><b>${esc(v)}</b></div>` : '';
  const can = (IV.r && IV.r.can) || {}, sketch = !!IV.sketch[j.jo];
  const pending = !!(j.review || j.pending_review), inline = pending && edit;
  const facts = `<p class="kd">${esc(j.description || 'No details')}</p>
    <div class="ivfs">${f('Client', j.client)}${f('Location', j.location ? locLab(j.location) : 'No location yet')}${f('Stage', MAKING[j.location] ? stageLabel(j.stage) : '')}
      ${f('Type', j.item_type ? typeLab(j.item_type) : '')}${f('Job', j.type === 'repair' ? 'Repair' : j.type === 'revision' ? 'Revision' : j.type ? 'New job' : '')}
      ${f('Metal', [kar(j.karat), j.metal].filter(Boolean).join(' '))}${f('Stone', [j.stone_type, j.stone_size, j.grade].filter(Boolean).join(' '))}${f('Material', j.material)}
      ${f('Size', j.size)}${f('Weight', j.weight_g ? j.weight_g + ' g' : '')}${f('Due', day(j.due))}${f('Part of', j.parent_jo)}</div>`;
  return `<div class="ivsheet" id="ivSheet"><div class="ivsbox"><button class="lnk dback" id="ivSX">‹ BACK</button>
    <div class="dhead"><h2>${window.OYP.piece(j.client, j.jo)}</h2><span class="lab">${inline ? 'Review' : edit ? 'Details' : 'View only'}</span></div>
    ${pending ? '<p class="ivtag"><span class="chip gold tbr">REVIEW</span></p>' : ''}
    <div class="ivph big ${IV.thumbs[j.jo] ? 'has' : ''} ${sketch ? 'sketch' : ''}"></div>
    <div class="ivdraw" id="ivDraw" hidden><span class="lab">Drawings</span><div class="shots" id="ivDraws"></div></div>
    ${can.cost ? `<div class="ivjoph" id="ivJoPh" hidden><span class="lab">JO photos</span><div class="shots" id="ivShots"></div></div>` : ''}
    ${inline ? '<div class="ivrev" id="ivRev"><p class="muted">Loading the review…</p></div>' : facts}
    </div></div>`;
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
  if (p.letter) return p.base + p.letter;
  const v = String(j.version || '').trim().toUpperCase();
  return /^[A-Z]$/.test(v) ? p.base + v : p.base;
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
  IV.sel.clear(); IV.scanned = []; IV.anchor = ''; IV.picking = false;
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
async function ivDelete(main, j) {
  if (!j) return;
  const label = ivPrintJo(j) || j.jo;
  if (!confirm('Delete ' + label + '? This cannot be undone.')) return;
  if (IV.busy) return;
  IV.busy = true;
  const r = await window.OYP.call('invDelete', { jo: j.jo });
  IV.busy = false;
  if (!window.OYP.here()()) return;
  if (!r || !r.ok) return window.OYP.toast(!r || r.error === 'Unknown action' ? 'Deleting needs the InvBulk paste in Apps Script (see paste/InvBulk.gs.txt).' : ((r && r.error) || 'Could not delete'));
  IV.r.jobs = IV.r.jobs.filter(x => x.jo !== j.jo);
  IV.sel.delete(j.jo);
  IV.open = null;
  window.OYP.toast('Deleted ' + label);
  ivDraw(main);
}
function ivWire(main) {
  const $ = s => main.querySelector(s);
  const stop = e => e.stopPropagation();
  main.querySelectorAll('[data-iv]').forEach(b => b.onclick = () => { IV.view = b.dataset.iv; ivDraw(main); });
  if ($('#ivQ')) $('#ivQ').oninput = e => {
    IV.q = e.target.value;
    const pos = e.target.selectionStart;
    ivDraw(main);
    const q = $('#ivQ');
    if (!q) return;
    try { q.focus({ preventScroll: true }); } catch (err) { q.focus(); }
    try { q.setSelectionRange(pos, pos); } catch (err) {}
  };
  if ($('#ivQMode')) $('#ivQMode').onclick = () => {
    ivQModeSet(ivQMode() === 'scan' ? 'type' : 'scan');
    const q = $('#ivQ');
    if (q) try { q.blur(); } catch (err) {}
    ivDraw(main);
    ivRefocus(main);
  };
  if ($('#ivQ')) $('#ivQ').onkeydown = e => {
    if (e.isComposing) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { ivQReset(); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) ivQNote();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = e.target.value;
    if (!ivEdit() || !(ivQFast(raw) || ivFullJo(raw))) return;
    if (ivQFast(raw)) ivQSawScanner();
    IV.q = ivQKeep(raw);
    ivQReset();
    try { e.target.blur(); } catch (err) {}
    ivScanCommit(raw, true);
  };
  if ($('#ivStage')) $('#ivStage').onchange = e => { IV.stage = e.target.value; if (IV.stage && IV.view !== 'all' && IV.view !== 'making') IV.view = 'all'; ivDraw(main); };
  if ($('#ivLoc')) $('#ivLoc').onchange = e => { IV.loc = e.target.value; if (IV.loc) IV.view = IV.loc === 'archived' ? 'archived' : 'all'; ivDraw(main); };
  if ($('#ivType')) $('#ivType').onchange = e => { IV.type = e.target.value; ivDraw(main); };
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
    if (!IV.choose) { IV.sel.clear(); IV.scanned = []; IV.anchor = ''; IV.picking = false; }
    ivDraw(main);
  };
  if ($('#ivPrint')) $('#ivPrint').onclick = () => {
    const jos = ivJobs([...IV.sel]).map(ivPrintJo);
    if (!window.OYPPrint || !window.OYPPrint.askPrint) return window.OYP.toast('Print is not loaded');
    window.OYPPrint.askPrint(jos).then(r => { if (!window.OYP.here()()) return; if (!r || r.ok === false) return; IV.sel.clear(); IV.scanned = []; IV.choose = false; IV.picking = false; ivDraw(main); });
  };
  if ($('#ivClear')) $('#ivClear').onclick = () => { IV.sel.clear(); IV.scanned = []; IV.anchor = ''; IV.picking = false; ivDraw(main); };
  if ($('#ivMove')) $('#ivMove').onchange = e => { const loc = e.target.value; if (!loc) return; ivBulk(main, [...IV.sel], loc, 'move'); };
  if ($('#ivArch')) $('#ivArch').onclick = () => ivArchive(main, [...IV.sel]);
  if ($('#ivUnarch')) $('#ivUnarch').onclick = () => ivBulk(main, [...IV.sel], '', 'unarchive');
  main.querySelectorAll('[data-ck]').forEach(input => {
    input.onclick = e => { stop(e); ivRange(input.dataset.ck, e.shiftKey); IV.picking = IV.sel.size > 0; ivDraw(main); };
  });
  main.querySelectorAll('.ivck').forEach(el => el.onclick = stop);
  main.querySelectorAll('[data-more]').forEach(b => b.onclick = e => { stop(e); ivOpenMenu(main, b); });
  main.querySelectorAll('.ivcard').forEach(el => {
    el.onpointerdown = e => {
      if (!ivEdit() || (e.button && e.button !== 0) || e.target.closest('.ivck, .ivmore')) return;
      const jo = el.dataset.jo, x0 = e.clientX, y0 = e.clientY;
      const hold = setTimeout(() => {
        IV.suppress = true; IV.picking = true; IV.sel.add(jo); IV.anchor = jo;
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
      if (e.target.closest('.ivck, .ivmore')) return;
      if (IV.suppress) { IV.suppress = false; return; }
      const j = IV.r.jobs.find(x => x.jo === el.dataset.jo); if (!j) return;
      if (ivEdit() && e.shiftKey) { ivRange(j.jo, true); IV.picking = IV.sel.size > 0; ivDraw(main); return; }
      IV.open = j.jo;
      ivMountSheet(main);
    };
  });
  ivWireSheet(main);
  const grid = $('#ivGrid');
  if (grid && ivEdit() && window.OYP.swipe) window.OYP.swipe(grid, {
    item: '.ivcard',
    ignore: '.ivmore, .ivck',
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
  ivPaintNav();
}
function ivCloseSheet(main) {
  IV.open = null;
  IV.extra++;
  IV.revSeq++;
  const el = main.querySelector('#ivSheet');
  if (el) el.remove();
  ivCloseView();
  const big = document.getElementById('ivBig');
  if (big) big.classList.add('hidden');
}
/* The sheet is position:fixed, so opening it does not rebuild the grid. */
function ivMountSheet(main) {
  const old = main.querySelector('#ivSheet');
  if (old) old.remove();
  if (!IV.open || !IV.r) return;
  const j = IV.r.jobs.find(x => x.jo === IV.open);
  if (!j) { IV.open = null; return; }
  main.insertAdjacentHTML('beforeend', ivSheet(j, ivEdit()));
  ivWireSheet(main);
  ivPhotos(main, j);
}
function ivWireSheet(main) {
  const $ = s => main.querySelector(s);
  const sheet = $('#ivSheet');
  if (!sheet) return;
  const box = sheet.querySelector('.ivsbox');
  if (box) box.onclick = e => e.stopPropagation();
  if ($('#ivSX')) $('#ivSX').onclick = () => ivCloseSheet(main);
  sheet.onclick = e => { if (e.target.id === 'ivSheet') ivCloseSheet(main); };
  const pending = IV.open && IV.r && IV.r.jobs.find(x => x.jo === IV.open);
  if (pending && (pending.review || pending.pending_review) && ivEdit()) ivMountReview(main, pending);
}
function ivOpenMenu(main, btn) {
  const j = IV.r && IV.r.jobs.find(x => x.jo === btn.dataset.more);
  if (!j || !window.OYP.popover) return;
  const arch = j.location === 'archived';
  const moves = ivMoveLocs().map(l => ({ label: locLab(l[0]), run: () => ivBulk(main, [j.jo], l[0], 'move') }));
  window.OYP.popover(btn, [
    { label: 'Print', run: () => { if (window.OYPPrint && window.OYPPrint.askPrint) window.OYPPrint.askPrint([ivPrintJo(j)]); else window.OYP.toast('Print is not loaded'); } },
    { label: 'Details', run: () => { IV.open = j.jo; ivMountSheet(main); } },
    { label: 'Move location', menu: moves.length ? moves : [{ label: 'No locations', run: () => {} }] },
    { label: arch ? 'Unarchive' : 'Archive', run: () => { if (arch) ivBulk(main, [j.jo], '', 'unarchive'); else ivArchive(main, [j.jo]); } },
    { label: 'Delete', danger: true, run: () => ivDelete(main, j) }
  ]);
}
function ivThumbs(main, L) { // piece photos, or a page-2 stand-in when this role can see costs. L kept for the call site.
  void L;
  if (!window.OYPPhotos) return;
  const grid = main.querySelector('#ivGrid');
  const cost = !!(IV.r && IV.r.can && IV.r.can.cost);
  if (grid) window.OYPPhotos.watch(grid, {
    sel: '[data-th]',
    item: el => ({ jo: el.dataset.th, kind: 'piece', size: 300, legacy: 'inv', fallback: cost }),
    paint(el, src, item) {
      const k = el.dataset.th; IV.thumbs[k] = src || '';
      IV.sketch[k] = !!(src && item && item.sketch);
      if (src && item && !item.sketch && item.id && IV.r) {
        const job = IV.r.jobs.find(x => x.jo === k);
        if (job) job.product_photo_file_id = item.id;
      }
      const cap = el.querySelector(':scope > span');
      if (cap) cap.remove();
      if (src) {
        el.style.backgroundImage = `url('${src}')`;
        el.classList.add('has');
        el.classList.toggle('sketch', !!IV.sketch[k]);
      } else {
        el.style.backgroundImage = '';
        el.classList.remove('has', 'sketch');
      }
    }
  });
  const jo = IV.open, j = jo && IV.r && IV.r.jobs.find(x => x.jo === jo);
  if (j && main.querySelector('#ivSheet')) ivPhotos(main, j);
}
function ivPhotos(main, j) {
  if (!j || !window.OYPPhotos) return;
  const can = (IV.r && IV.r.can) || {};
  const big = main.querySelector('#ivSheet .ivph.big');
  if (big && (j.has_photo || can.cost || IV.sketch[j.jo] || ivEdit())) {
    window.OYPPhotos.stage(big, {
      jo: j.jo, kind: 'piece', legacy: 'inv', alt: 'Piece', empty: '', fallback: !!can.cost,
      noted: item => {
        big.classList.toggle('sketch', !!item.sketch);
        IV.sketch[j.jo] = !!item.sketch;
        if (item && !item.sketch && item.id) j.product_photo_file_id = item.id;
        const sheet = big.closest('.ivsbox') || big.parentNode;
        const add = sheet && sheet.querySelector('.ivphmenu .ivadd');
        const real = ivHasRealPhoto(j, item);
        if (add && !add.disabled) add.textContent = real ? 'Change photo' : 'Add photo';
        const del = sheet && sheet.querySelector('.ivphmenu .ivdel');
        if (del && !del.disabled) del.hidden = !real;
      }
    });
    ivAddPhoto(main, j, big);
    big.onclick = e => {
      const host = big.closest('.ivsbox') || big.parentNode;
      if (host && host._ivMenuShut) { host._ivMenuShut = false; return; }
      if (e.target.closest('.phorig, .phtools, button, a, .ivaddmsg, .ivdelask, .ivphmenu, .ivpencil')) return;
      const img = big.querySelector('img');
      if (!img || !img.src) return;
      const items = ivGallery(j.jo);
      let index = items.findIndex(it => it.key === 'piece');
      if (index < 0) {
        items.unshift({ key: 'piece', src: img.src, alt: img.alt || j.jo, sketch: big.classList.contains('sketch') });
        index = 0;
      }
      ivOpenViewer({ items, index, sketch: !!items[index].sketch, jo: j.jo });
    };
  }
  ivFillExtra(main, j);
}
function ivHasRealPhoto(j, item) {
  if (!j || !j.product_photo_file_id) return false;
  if (item && item.sketch) return false;
  if (IV.sketch[j.jo] && !(item && item.id && !item.sketch)) return false;
  return true;
}
function ivAddPhoto(main, j, big) {
  if (!ivEdit() || !big || !j) { ivPhotoListen(null, null); return; }
  const realNow = ivHasRealPhoto(j) && !!IV.thumbs[j.jo] && !IV.sketch[j.jo];
  const pen = document.createElement('button');
  pen.type = 'button';
  pen.className = 'ivpencil';
  pen.setAttribute('aria-label', 'Edit photo');
  pen.setAttribute('aria-haspopup', 'menu');
  pen.setAttribute('aria-expanded', 'false');
  pen.innerHTML = ivPencilSvg();
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.hidden = true;
  file.tabIndex = -1;
  file.setAttribute('aria-hidden', 'true');
  const sheet = big.closest('.ivsbox') || big.parentNode;
  let msg = sheet && sheet.querySelector('.ivaddmsg');
  if (!msg && sheet) {
    msg = document.createElement('p');
    msg.className = 'ivaddmsg';
    msg.setAttribute('role', 'status');
    big.insertAdjacentElement('afterend', msg);
  }
  const say = (text, bad) => {
    if (!msg) return;
    msg.textContent = text || '';
    msg.classList.toggle('err', !!bad);
    msg.hidden = !text;
  };
  let menu = sheet && sheet.querySelector('.ivphmenu');
  let add, del;
  if (!menu && sheet) {
    menu = document.createElement('div');
    menu.className = 'ivphmenu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    add = document.createElement('button');
    add.type = 'button';
    add.className = 'ivadd';
    add.setAttribute('role', 'menuitem');
    del = document.createElement('button');
    del.type = 'button';
    del.className = 'ivdel';
    del.setAttribute('role', 'menuitem');
    del.textContent = 'Remove photo';
    menu.appendChild(add);
    menu.appendChild(del);
    if (msg) msg.insertAdjacentElement('afterend', menu);
    else big.insertAdjacentElement('afterend', menu);
  } else if (menu) {
    add = menu.querySelector('.ivadd');
    del = menu.querySelector('.ivdel');
    menu.hidden = true;
  }
  if (add) add.textContent = realNow ? 'Change photo' : 'Add photo';
  if (del) del.hidden = !realNow;
  let ask = sheet && sheet.querySelector('.ivdelask');
  if (!ask && sheet) {
    ask = document.createElement('div');
    ask.className = 'ivdelask';
    ask.hidden = true;
    const q = document.createElement('p');
    q.textContent = 'Remove this photo? The drawing from the JO card comes back. The file stays in Drive.';
    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'ivdelgo';
    go.textContent = 'Remove';
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'ivdelno';
    no.textContent = 'Cancel';
    row.appendChild(go);
    row.appendChild(no);
    ask.appendChild(q);
    ask.appendChild(row);
    const after = menu || msg;
    if (after) after.insertAdjacentElement('afterend', ask);
    else big.insertAdjacentElement('afterend', ask);
  } else if (ask) ask.hidden = true;
  const closeMenu = () => {
    if (!menu) return;
    menu.hidden = true;
    pen.setAttribute('aria-expanded', 'false');
  };
  big.appendChild(file);
  big.appendChild(pen);
  pen.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (pen.disabled || !menu) return;
    menu.hidden = !menu.hidden;
    pen.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    if (!menu.hidden && ask) ask.hidden = true;
  };
  if (add) add.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    if (!pen.disabled) file.click();
  };
  if (del) del.onclick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (del.disabled || del.hidden) return;
    closeMenu();
    if (ask) ask.hidden = false;
  };
  if (ask) {
    const no = ask.querySelector('.ivdelno');
    const go = ask.querySelector('.ivdelgo');
    if (no) no.onclick = e => {
      e.preventDefault();
      e.stopPropagation();
      ask.hidden = true;
    };
    if (go) go.onclick = async e => {
      e.preventDefault();
      e.stopPropagation();
      if (pen.disabled || !window.OYPPhotos || !window.OYPPhotos.removePhoto) return;
      pen.disabled = true;
      if (del) del.disabled = true;
      const r = await window.OYPPhotos.removePhoto(j.jo);
      pen.disabled = false;
      if (del) del.disabled = false;
      if (!r || r.removed !== true) {
        ask.hidden = true;
        if (r && r.ok === true && r.removed === false) return;
        say((r && r.error) || "Photo removal isn't switched on yet", true);
        return;
      }
      ask.hidden = true;
      closeMenu();
      j.product_photo_file_id = '';
      say('', false);
      ivApplySketch(j.jo, r.src || '');
      if (main.querySelector('#ivSheet')) ivPhotos(main, j);
    };
  }
  ivPhotoListen(e => {
    if (e.key !== 'Escape') return;
    if (ask && !ask.hidden) { ask.hidden = true; e.preventDefault(); e.stopPropagation(); return; }
    if (menu && !menu.hidden) { closeMenu(); e.preventDefault(); e.stopPropagation(); }
  }, e => {
    if (!menu || menu.hidden) return;
    const t = e.target;
    if (t && t.closest && t.closest('.ivphmenu, .ivpencil, .ivdelask')) return;
    closeMenu();
    if (sheet && t && big.contains(t)) sheet._ivMenuShut = true;
  });
  file.onchange = async () => {
    const picked = file.files && file.files[0];
    file.value = '';
    if (!picked || !window.OYPPhotos || !window.OYPPhotos.setPhoto) return;
    if (picked.type && picked.type.indexOf('image/') !== 0) { say('Choose a photo', true); return; }
    pen.disabled = true;
    closeMenu();
    const r = await window.OYPPhotos.setPhoto(j.jo, picked, { progress: t => { say(t, false); } });
    pen.disabled = false;
    if (!r || !r.ok) {
      if (add) add.textContent = IV.thumbs[j.jo] && !IV.sketch[j.jo] ? 'Change photo' : 'Add photo';
      say((r && r.error) || 'Could not save the photo', true);
      return;
    }
    say('', false);
    if (r.id) j.product_photo_file_id = r.id;
    ivApplyProfile(j.jo, r.src);
    if (main.querySelector('#ivSheet')) ivPhotos(main, j);
  };
}
function ivApplySketch(jo, src) {
  IV.thumbs[jo] = src || '';
  IV.sketch[jo] = !!src;
  const sel = '[data-th="' + String(jo).replace(/"/g, '') + '"]';
  document.querySelectorAll(sel).forEach(el => {
    if (src) {
      el.style.backgroundImage = 'url("' + String(src).replace(/"/g, '') + '")';
      el.classList.add('has', 'sketch');
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('has', 'sketch');
    }
  });
  const view = document.getElementById('ivView');
  if (view && view._jo === jo && view._setSketch) view._setSketch(src);
}
function ivApplyProfile(jo, src) {
  IV.thumbs[jo] = src || '';
  IV.sketch[jo] = false;
  const sel = '[data-th="' + String(jo).replace(/"/g, '') + '"]';
  document.querySelectorAll(sel).forEach(el => {
    if (src) el.style.backgroundImage = 'url("' + String(src).replace(/"/g, '') + '")';
    el.classList.add('has');
    el.classList.remove('sketch');
  });
  const view = document.getElementById('ivView');
  if (view && view._jo === jo && view._setProfile) view._setProfile(src);
}
/* Profile, then drawings, then JO pages, in the order the sheet shows them.
   Page scans live only in the cost-role strip, so a non-cost role never gets page 1. */
function ivGallery(jo) {
  const P = window.OYPPhotos, can = (IV.r && IV.r.can) || {};
  const sheet = document.querySelector('#ivSheet');
  const items = [];
  const big = sheet && sheet.querySelector('.ivph.big');
  const img = big && big.querySelector('img');
  if (img && img.src) {
    const sketch = big.classList.contains('sketch');
    items.push({
      key: 'piece', src: img.src, alt: img.alt || jo, sketch,
      full: () => {
        if (sketch && P.peek) {
          const hit = P.peek({ jo, sketch: true, size: 1600, kind: 'card' });
          if (hit) return Promise.resolve(hit);
        }
        return P.load({ jo, kind: 'piece', size: 1600, legacy: 'inv', fallback: !!can.cost });
      }
    });
  }
  const addStrip = (box, kind) => {
    if (!box) return;
    box.querySelectorAll('.shot').forEach(b => {
      const id = b.getAttribute('data-id') || '';
      const lab = b.querySelector('.lab');
      const ph = b.querySelector('.ph');
      const bg = (ph && ph.style.backgroundImage) || '';
      const m = bg.match(/url\(["']?([^"')]+)/);
      items.push({
        key: kind + ':' + id, src: (m && m[1]) || '', alt: (lab && lab.textContent) || '', sketch: false,
        full: () => P.load({ jo, id, kind, size: 1600, legacy: 'job', sketch: false })
      });
    });
  };
  if (sheet) {
    addStrip(sheet.querySelector('#ivDraws'), 'drawing');
    if (can.cost) addStrip(sheet.querySelector('#ivShots'), 'card');
  }
  return items;
}
function ivShots(box, jo, pages, kind) {
  const { esc } = window.OYP;
  box.innerHTML = pages.map(p => `<button type="button" class="shot" data-id="${esc(p.id)}"><span class="ph"></span><span class="lab">${esc(p.label)}</span></button>`).join('');
  box.querySelectorAll('.shot').forEach((b, i) => {
    const src = pages[i].src;
    if (src) b.querySelector('.ph').style.backgroundImage = `url("${src}")`;
    b.onclick = ev => {
      ev.stopPropagation();
      const key = (kind || 'card') + ':' + pages[i].id;
      const items = ivGallery(jo);
      let index = items.findIndex(it => it.key === key);
      if (index < 0) {
        const ph = b.querySelector('.ph');
        const bg = ph && ph.style.backgroundImage || '';
        const m = bg.match(/url\(["']?([^"')]+)/);
        items.push({
          key, src: pages[i].src || (m && m[1]) || '', alt: pages[i].label || '', sketch: false,
          full: () => window.OYPPhotos.load({ jo, id: pages[i].id, kind: kind || 'card', size: 1600, legacy: 'job', sketch: false })
        });
        index = items.length - 1;
      }
      ivOpenViewer({ items, index, sketch: false, jo: jo });
    };
  });
}
function ivCloseView() {
  const el = document.getElementById('ivView');
  if (!el) return;
  if (el._esc) document.removeEventListener('keydown', el._esc, true);
  el.remove();
}
function ivOpenViewer(o) {
  o = o || {};
  ivCloseView();
  const items = (o.items && o.items.length) ? o.items.slice() : [{ src: o.src || '', alt: o.alt || '', sketch: !!o.sketch, full: o.full || null }];
  let index = Math.max(0, Math.min(items.length - 1, o.index | 0));
  const root = document.createElement('div');
  root.id = 'ivView';
  root._jo = o.jo || '';
  root.className = 'iview' + (o.sketch ? ' sketch' : '');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', o.sketch ? 'Sketch from JO card' : 'Photo');
  const glyph = d => '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  root.innerHTML = `<button type="button" class="ivx" aria-label="Close">${glyph('M7 7l10 10M17 7 7 17')}</button>
    <button type="button" class="ivprev" aria-label="Previous photo">${glyph('M15 6 9 12l6 6')}</button>
    <button type="button" class="ivnext" aria-label="Next photo">${glyph('M9 6l6 6-6 6')}</button>
    <p class="ivpos" aria-live="polite"></p>
    <div class="ivtools"><button type="button" class="ivz" data-z="out" aria-label="Zoom out">${glyph('M6 12h12')}</button><button type="button" class="ivz" data-z="in" aria-label="Zoom in">${glyph('M12 6v12M6 12h12')}</button></div>
    <div class="ivframe"><div class="ivpan"><img alt="" draggable="false"></div></div>`;
  document.body.appendChild(root);
  const frame = root.querySelector('.ivframe');
  const pan = root.querySelector('.ivpan');
  const img = root.querySelector('img');
  const pos = root.querySelector('.ivpos');
  let scale = 1, x = 0, y = 0, moved = false, lastTap = 0, lastX = 0, lastY = 0, seq = 0, pinched = false;
  const arm = Date.now() + 350;
  const pts = new Map();
  let pinch = null;
  const apply = () => { pan.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')'; };
  const clamp = () => {
    if (scale <= 1) { scale = 1; x = 0; y = 0; return; }
    const fr = frame.getBoundingClientRect();
    const maxX = Math.max(40, (img.offsetWidth * scale - fr.width) / 2 + 48);
    const maxY = Math.max(40, (img.offsetHeight * scale - fr.height) / 2 + 48);
    x = Math.max(-maxX, Math.min(maxX, x));
    y = Math.max(-maxY, Math.min(maxY, y));
  };
  const zoomAt = (next, clientX, clientY) => {
    next = Math.max(1, Math.min(6, next));
    const rect = frame.getBoundingClientRect();
    const cx = clientX - (rect.left + rect.width / 2);
    const cy = clientY - (rect.top + rect.height / 2);
    const k = scale ? next / scale : 1;
    x = cx * (1 - k) + x * k;
    y = cy * (1 - k) + y * k;
    scale = next;
    clamp();
    apply();
  };
  const paint = () => {
    const n = items.length, item = items[index];
    root.querySelector('.ivprev').hidden = n < 2 || index === 0;
    root.querySelector('.ivnext').hidden = n < 2 || index === n - 1;
    pos.textContent = (index + 1) + ' / ' + n;
    pos.setAttribute('aria-label', 'Photo ' + (index + 1) + ' of ' + n);
    root.classList.toggle('sketch', !!item.sketch);
    root.setAttribute('aria-label', item.sketch ? 'Sketch from JO card' : 'Photo');
  };
  root._setProfile = src => {
    const piece = items.find(it => it.key === 'piece');
    if (!piece || !src) return;
    piece.src = src;
    piece.sketch = false;
    piece.full = () => Promise.resolve(src);
    if (items[index] === piece) {
      root.classList.remove('sketch');
      root.setAttribute('aria-label', 'Photo');
      img.src = src;
    }
  };
  root._setSketch = src => {
    const piece = items.find(it => it.key === 'piece');
    if (!piece) return;
    piece.src = src || '';
    piece.sketch = true;
    piece.full = () => {
      const P = window.OYPPhotos;
      if (P && P.peek) {
        const hit = P.peek({ jo: root._jo, sketch: true, size: 1600, kind: 'card' });
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(src || '');
    };
    if (items[index] === piece) {
      root.classList.add('sketch');
      root.setAttribute('aria-label', 'Sketch from JO card');
      if (src) img.src = src;
      else img.removeAttribute('src');
    }
  };
  const showAt = () => {
    const item = items[index], mine = ++seq;
    paint();
    img.alt = item.alt || '';
    if (item.src) img.src = item.src;
    else img.removeAttribute('src');
    apply();
    if (!item.full) return;
    Promise.resolve().then(item.full).then(src => {
      if (mine !== seq || !src || !root.isConnected) return;
      img.src = src;
    }).catch(() => {});
  };
  // No wrap. A change drops back to fit zoom.
  const step = dir => {
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    index = next;
    scale = 1; x = 0; y = 0; apply();
    showAt();
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ivCloseView(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    }
  };
  root._esc = onKey;
  document.addEventListener('keydown', onKey, true);
  root.querySelector('.ivx').onclick = e => { e.stopPropagation(); ivCloseView(); };
  root.querySelector('.ivprev').onclick = e => { e.stopPropagation(); step(-1); };
  root.querySelector('.ivnext').onclick = e => { e.stopPropagation(); step(1); };
  root.querySelector('[data-z="in"]').onclick = e => {
    e.stopPropagation();
    const r = frame.getBoundingClientRect();
    zoomAt(scale * 1.25, r.left + r.width / 2, r.top + r.height / 2);
  };
  root.querySelector('[data-z="out"]').onclick = e => {
    e.stopPropagation();
    const r = frame.getBoundingClientRect();
    zoomAt(scale / 1.25, r.left + r.width / 2, r.top + r.height / 2);
  };
  frame.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
    zoomAt(scale * factor, e.clientX, e.clientY);
  }, { passive: false });
  frame.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!pts.size) pinched = false;
    try { frame.setPointerCapture(e.pointerId); } catch (err) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0 });
    if (pts.size === 2) {
      const arr = [...pts.values()];
      pinch = { d: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y) || 1, s: scale };
      pinched = true;
    }
  });
  frame.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.moved += Math.hypot(dx, dy);
    if (pts.size >= 2 && pinch) {
      const arr = [...pts.values()];
      const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y) || 1;
      const mx = (arr[0].x + arr[1].x) / 2, my = (arr[0].y + arr[1].y) / 2;
      zoomAt(pinch.s * (d / pinch.d), mx, my);
      moved = true;
      return;
    }
    if (pts.size === 1 && scale > 1 && p.moved > 4) {
      x += dx; y += dy; clamp(); apply();
      moved = true;
    }
  });
  frame.addEventListener('pointerup', e => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!p) return;
    // Fit zoom: a horizontal swipe moves to the next photo. Zoomed in, that drag already panned.
    if (!pinched && scale <= 1) {
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) {
        moved = true;
        step(dx < 0 ? 1 : -1);
        return;
      }
    }
    if (p.moved > 8) return;
    const now = Date.now();
    if (now - lastTap < 300 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 36) {
      lastTap = 0;
      zoomAt(scale > 1.05 ? 1 : 2.5, e.clientX, e.clientY);
      moved = true;
      return;
    }
    lastTap = now; lastX = e.clientX; lastY = e.clientY;
  });
  frame.addEventListener('pointercancel', e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; });
  frame.addEventListener('click', e => {
    if (Date.now() < arm) return;
    if (moved) { moved = false; return; }
    if (e.target.closest('img')) return;
    ivCloseView();
  });
  root.addEventListener('click', e => {
    if (Date.now() < arm) return;
    if (e.target === root) ivCloseView();
  });
  showAt();
}
function ivFillExtra(main, j) {
  const P = window.OYPPhotos;
  if (!P || !P.extras) return;
  const seq = ++IV.extra, jo = j.jo, can = (IV.r && IV.r.can) || {};
  P.extras(jo, { drawing: true, cards: !!can.cost }).then(x => {
    if (seq !== IV.extra || IV.open !== jo) return;
    const sheet = main.querySelector('#ivSheet');
    if (!sheet) return;
    const draw = sheet.querySelector('#ivDraw'), draws = sheet.querySelector('#ivDraws');
    const photos = (x.drawing || []).map(d => ({ id: d.id, src: d.src || '', label: 'Drawing' }));
    if (draw && draws && photos.length) { draw.hidden = false; ivShots(draws, jo, photos, 'drawing'); }
    if (!can.cost) return;
    const host = sheet.querySelector('#ivJoPh'), shots = sheet.querySelector('#ivShots');
    const pages = (x.cards || []).map(p => ({ id: p.id, src: p.src || '', label: P.pageLabel(x.cards, p) }));
    if (host && shots && pages.length) { host.hidden = false; ivShots(shots, jo, pages, 'card'); }
  }).catch(() => {});
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
let matTab = 'stock';
function matPricesAllowed(u) {
  const roles = window.OYPNav && window.OYPNav.MAT_PRICE_ROLES;
  return !!(u && roles && roles[u.role]);
}
function takeMatTab(u) {
  let ask = '';
  try { ask = sessionStorage.getItem('oypMatView') || ''; sessionStorage.removeItem('oypMatView'); } catch (e) {}
  if (ask === 'prices' || ask === 'stock') matTab = ask;
  if (!matPricesAllowed(u)) matTab = 'stock';
  return matTab;
}
/* Stock is the materials list. Prices reuses prices.js. A role that never had Material prices sees only Stock, with no tab strip. */
function renderMaterials(main, u) {
  const allow = matPricesAllowed(u), tab = takeMatTab(u);
  if (!allow) {
    if (innerWidth < 900) { MS.open = null; MS.adding = false; }
    return renderMats(main, u);
  }
  main.innerHTML = `<div class="rvchips mattabs" id="matTabs"><button type="button" class="fchip tap${tab === 'stock' ? ' on' : ''}" data-mtab="stock">Stock</button><button type="button" class="fchip tap${tab === 'prices' ? ' on' : ''}" data-mtab="prices">Prices</button></div><div id="matBody"></div>`;
  const host = main.querySelector('#matBody');
  main.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => {
    matTab = b.dataset.mtab === 'prices' ? 'prices' : 'stock';
    if (matTab === 'stock' && /^#\/prices/.test(location.hash)) { location.hash = '#/inventory'; return; }
    renderMaterials(main, u);
  });
  if (tab === 'prices' && window.OYPPrices) return window.OYPPrices.render(host, u);
  if (innerWidth < 900) { MS.open = null; MS.adding = false; }
  return renderMats(host, u);
}
// a fresh visit (menu / link) on a phone starts on the list; on a desktop the last item stays open
window.OYPInv = { renderJos: (m, u) => {
  IV.open = null; ivCloseView(); IV.sel.clear(); IV.scanned = []; IV.anchor = ''; IV.picking = false; IV.offer = ''; IV.want = '';
  try {
    const askView = sessionStorage.getItem('oypInvView');
    if (askView === 'review' || askView === 'debug' || (askView === 'count' && ivCountRole(u))) IV.view = askView;
    sessionStorage.removeItem('oypInvView');
    const raw = sessionStorage.getItem('oypReviewOpen');
    if (raw) {
      sessionStorage.removeItem('oypReviewOpen');
      const ask = JSON.parse(raw);
      if (ask && ask.jo) { IV.view = 'review'; IV.want = ask.jo; }
    }
  } catch (e) {}
  return renderJos(m, u);
}, renderMats: (m, u) => renderMaterials(m, u), openViewer: ivOpenViewer, paintNav: ivPaintNav,
  countOn: () => IV.view === 'count' && /^#\/jos(?:$|[/?])/.test(location.hash) };

/* Handheld scanner (keyboard wedge): fast keystrokes, then Enter, while no field is focused.
   The search box takes the same scan when it is focused: a fast wedge, or a full JO and Enter.
   That Enter keeps the number in the box and runs the search. It does not clear the field or select the text.
   Any other Enter leaves the text as a filter.
   Scan mode (inputmode none) takes the wedge and leaves the on-screen keyboard down.
   Type mode (inputmode search) shows the keyboard. The choice is remembered. Until a fast wedge
   ending in Enter is seen, the box stays in Type so a phone can type.
   A sticker's QR is the JO itself (26-287 or 26-287A) or a link / prefixed text that contains one
   (jo=26-287, or a path ending in /26-287). The same read is in consign.js.
   A sticker QR is the JO with its version letter (26-287B). That scan selects the 26-287B tile.
   A scan with no letter still folds to the base. If several tiles share that base, the newest letter is the one selected. */
const SCAN_GAP = 50, SCAN_ENTER = 80, SCAN_MAX = 400;
const QMODE_KEY = 'oypIvQMode';
let scanBuf = '', scanAt = 0, qLastAt = 0, qBurstLen = 0;
function ivQMode() {
  try {
    const v = localStorage.getItem(QMODE_KEY);
    if (v === 'scan' || v === 'type') return v;
  } catch (e) {}
  return 'type';
}
function ivQModeStored() {
  try {
    const v = localStorage.getItem(QMODE_KEY);
    return v === 'scan' || v === 'type';
  } catch (e) { return false; }
}
function ivQModeSet(mode) {
  try { localStorage.setItem(QMODE_KEY, mode === 'scan' ? 'scan' : 'type'); } catch (e) {}
}
function ivQSawScanner() { if (!ivQModeStored()) ivQModeSet('scan'); }
function ivQKeep(raw) {
  const p = joParts(raw);
  return p ? p.base + (p.letter || '') : String(raw || '');
}
function ivQRow(esc) {
  const scan = ivQMode() === 'scan';
  const label = scan ? 'Scan mode. Tap to type with the keyboard.' : 'Type mode. Tap to scan without the keyboard.';
  return `<div class="ivqrow"><input id="ivQ" class="rvq" inputmode="${scan ? 'none' : 'search'}" enterkeyhint="search" placeholder="Search or scan JO, client, 18k, sapphire…" value="${esc(IV.q)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Search or scan JO, client, 18k, sapphire"><button type="button" class="ivqmode" id="ivQMode" aria-pressed="${scan ? 'true' : 'false'}" aria-label="${esc(label)}">${scan ? 'Scan' : 'Type'}</button></div>`;
}
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
function ivScanOn() { return !!(IV.r && ivEdit() && IV.view !== 'count' && /^#\/jos(?:$|[/?])/.test(location.hash)); }
function ivField(el) { return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)); }
function ivCaretEnd(el) {
  if (!el || typeof el.setSelectionRange !== 'function') return;
  const n = String(el.value || '').length;
  try { el.setSelectionRange(n, n); } catch (e) {}
}
function ivRefocus(main) {
  const box = main.querySelector('#ivQ');
  if (!box) return;
  // Blur only this search box so a stuck iOS focus zoom drops, then focus it again in the same tap
  // so Type can bring the on-screen keyboard back. The caret stays at the end, not a select-all.
  try { box.blur(); } catch (e) {}
  try { box.focus({ preventScroll: true }); } catch (e) { try { box.focus(); } catch (e2) {} }
  ivCaretEnd(box);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      const s = main.querySelector('#ivQ');
      if (s && document.activeElement === s) ivCaretEnd(s);
    });
  }
}
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
  IV.offer = ''; IV.sel.add(job.jo); IV.anchor = job.jo; IV.picking = true;
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
window.addEventListener('hashchange', () => { ivCloseView(); });
let ivFitTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(ivFitTimer);
  ivFitTimer = setTimeout(() => { const grid = document.getElementById('ivGrid'); if (grid) ivFitPills(grid); }, 60);
});
document.addEventListener('keydown', e => {
  if (!ivScanOn() || ivField(document.activeElement) || e.isComposing) return;
  if (e.key === 'Enter') {
    const raw = scanBuf, fast = !!(raw && Date.now() - scanAt <= SCAN_ENTER);
    scanBuf = '';
    if (!fast) return;
    e.preventDefault(); e.stopPropagation();
    ivQSawScanner();
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
