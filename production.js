/* OYP back office: Production (#/production). JOs by stage on a board, who has them, time worked.
   Server: Production.gs (prodBoard, prodJob, prodWorkers, prodPhoto, prodMove, prodAssign, prodSetTarget, prodTimer, prodSessionAdd, prodSessionVoid, prodWorkerSave).
   Delayed = past a target date Susan or an admin set (whole JO or this step). No target = never Delayed. Workers are names; Susan logs their time.
   Routes: #/production (board) · #/production/jo/<JO> (board + card detail) · #/production/workers (who has what, hours this week).
   Desktop: drag a card to the next column. Phone: one stage at a time, a big "Move to ..." button on every card (the JO's next step: a repair skips Design / Casting).
   No money on the board for anyone. Labor cost shows only in the card detail, only when the server sends it (admin + production manager). */
(() => {
'use strict';
const PASTE_NOTE = 'This page needs the Production paste in Apps Script (see the instructions).';
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const S = { r: null, at: 0, skew: 0, q: '', worker: '', stage: '', delayed: false, mine: null, pcol: '', job: null, wk: null, move: null, u: null, choose: false, sel: new Set() };
const $ = id => document.getElementById(id);
const esc = s => window.OYP.esc(s);
const call = (a, d) => window.OYP.call(a, d);
const toast = t => window.OYP.toast(t);
const narrow = () => innerWidth < 760;
const pad = n => String(n).padStart(2, '0');
const route = () => { const m = location.hash.match(/^#\/production\/?(\w*)\/?([\w-]*)/) || []; return { view: m[1] || '', arg: decodeURIComponent(m[2] || '') }; };
const dShort = d => d ? MN[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10) : '';
const dLong = d => d ? DN[new Date(d + 'T00:00:00Z').getUTCDay()] + ', ' + dShort(d) : '';
const hrs = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), mm = m % 60; return !m ? '0 h' : !h ? mm + ' min' : h + ' h' + (mm ? ' ' + mm + ' m' : ''); };
const peso = n => n == null ? '—' : '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock12 = hm => { if (!hm) return ''; let [h, m] = hm.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(m) + ' ' + ap; };
const isoHM = iso => { const d = new Date(Date.parse(iso) + 8 * 36e5); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
const isoDay = iso => new Date(Date.parse(iso) + 8 * 36e5).toISOString().slice(0, 10);
const nowMs = () => Date.now() + S.skew;
const elapsed = iso => { const s = Math.max(0, Math.floor((nowMs() - Date.parse(iso)) / 1000)); return Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
const daysTxt = c => c.days == null ? '' : c.days === 0 ? 'Since today' : c.days + (c.days === 1 ? ' day' : ' days') + ' in step';
const tgtOf = c => c.step_target && (c.delayed_by === 'step' || !c.target || c.step_target < c.target) ? { d: c.step_target, step: true } : c.target ? { d: c.target, step: false } : null; // the date that matters most
const tgtChip = c => { const t = tgtOf(c); return t ? `<span class="chip ${c.delayed ? 'pover' : 'ptgt'}" title="${t.step ? 'Target for this step' : 'Target for the whole JO'}: ${dLong(t.d)}">${t.step ? 'Step · ' : 'Target '}${dShort(t.d)}</span>` : ''; }; // short so it fits a narrow column
const col = k => S.r.columns.find(c => c.key === k) || { key: k, label: k };
const nextCol = c => { if (c && c.next !== undefined) return c.next ? col(c.next) : null; const x = col(c.col); return x.next ? col(x.next) : null; }; // c.next = the JO's next step (a repair skips Design / Casting); older server: next column
const can = () => (S.r && S.r.can) || {};

/* ---------- photos (thumbnails cached per file) ---------- */
const PH = {};
const photo = (jo, fid, size) => {
  const sz = size === 'original' ? 'original' : (size === 'full' ? 1600 : 300);
  if (window.OYPPhotos) return window.OYPPhotos.load({ jo, id: fid, kind: 'scan', size: sz, legacy: 'prod' });
  const k = fid + '|' + (size || 't'); if (!PH[k]) PH[k] = call('prodPhoto', { jo, file_id: fid, size }).then(x => { const src = (x && x.ok && x.src) || ''; if (!src) delete PH[k]; return src; }); return PH[k];
};
function loadThumbs(root) {
  if (!root) return;
  if (window.OYPPhotos) {
    window.OYPPhotos.watch(root, {
      sel: '[data-ph]',
      item: el => ({ jo: el.dataset.jo, id: el.dataset.ph, kind: 'scan', size: 300, legacy: 'prod' }),
      paint(el, src) { if (src) { el.style.backgroundImage = `url("${src}")`; el.classList.add('has'); } }
    });
    return;
  }
  root.querySelectorAll('[data-ph]').forEach(el => { if (el.dataset.done) return; el.dataset.done = 1;
    photo(el.dataset.jo, el.dataset.ph).then(src => { if (src) { el.style.backgroundImage = `url("${src}")`; el.classList.add('has'); } }); });
}

/* ---------- load + draw ---------- */
async function render(main, u) {
  S.u = u; const live = window.OYP.here(), rt = route();
  if (rt.view === 'workers') return workersPage(main, live);
  if (!S.r || Date.now() - S.at > 60000 || rt.view !== 'jo') {
    if (!S.r) main.innerHTML = '<h2>Production</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
    const r = await call('prodBoard'); if (!live()) return;
    if (!r || !r.ok) {
      if (S.r && r && r.code !== 'FORBIDDEN' && r.error !== 'Unknown action') { toast('Could not refresh the board: ' + (r.error || 'try again')); } // keep what is on screen
      else { failPage(main, r, () => render(main, u)); return; }
    } else { S.r = r; S.at = Date.now(); }
    if (S.mine === null) S.mine = !!r.me_worker && u.role === 'staff';
  }
  if (rt.view === 'mine') { S.mine = !!S.r.me_worker; history.replaceState(null, '', '#/production'); }
  drawBoard(main);
  if (rt.view === 'jo' && rt.arg) openJob(rt.arg, live); else closeSheet();
}
// a page that could not load: the reason + TRY AGAIN (no data on screen to keep)
function failPage(main, r, again) {
  const msg = !r || r.error === 'Unknown action' ? PASTE_NOTE : r.error || 'Could not load';
  main.innerHTML = `<h2>Production</h2><div class="kempty pempty perr"><p>${esc(msg)}</p>${r && (r.code === 'FORBIDDEN' || r.error === 'Unknown action') ? '' : '<button class="pill sm" id="pRetry">TRY AGAIN</button>'}</div>`;
  if ($('pRetry')) $('pRetry').onclick = () => { $('pRetry').disabled = true; $('pRetry').textContent = 'LOADING…'; again(); };
}
async function reload() {
  const r = await call('prodBoard'); if (r && r.ok) { S.r = r; S.at = Date.now(); }
  const m = $('main'); if (m && route().view !== 'workers' && $('pBoard')) drawBoard(m);
}
function shown() {
  const q = S.q.trim().toUpperCase(), me = S.r.me_worker;
  return S.r.cards.filter(c => (!q || String(c.jo).toUpperCase().includes(q) || String(c.description || '').toUpperCase().includes(q) || String(c.client || '').toUpperCase().includes(q))
    && (!S.worker || (S.worker === '-' ? !c.assignee_id : c.assignee_id === S.worker)) && (!S.delayed || c.delayed) && (!S.mine || c.assignee_id === me));
}
function head(tab) {
  return `<div class="phead"><h2>Production</h2><div class="seg prptabs"><a class="${tab === 'board' ? 'on' : ''}" href="#/production">Board</a><a class="${tab === 'workers' ? 'on' : ''}" href="#/production/workers">Workers</a></div></div>`;
}
function drawBoard(main) {
  const r = S.r, list = shown(), nd = r.cards.filter(c => c.delayed).length, phone = narrow();
  const cols = r.columns.filter(c => !S.stage || c.key === S.stage);
  if (phone && (!S.pcol || !r.columns.some(c => c.key === S.pcol))) { const f = r.columns.find(c => list.some(x => x.col === c.key)); S.pcol = f ? f.key : r.columns[0].key; }
  const filt = `<div class="pfilt">
      <input id="pQ" class="rvq" placeholder="Search JO, item or client" value="${esc(S.q)}" inputmode="search" autocomplete="off">
      <label class="ivsel"><span class="lab">Worker</span><select id="pW"><option value="">Everyone</option>${r.workers.map(w => `<option value="${w.worker_id}" ${S.worker === w.worker_id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}<option value="-" ${S.worker === '-' ? 'selected' : ''}>Unassigned</option></select></label>
      ${phone ? '' : `<label class="ivsel"><span class="lab">Stage</span><select id="pS"><option value="">All stages</option>${r.columns.map(c => `<option value="${c.key}" ${S.stage === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>`}
      <button class="fchip ${S.delayed ? 'on' : ''}" id="pD">Delayed only <b>${nd}</b></button>
      ${r.me_worker ? `<button class="fchip ${S.mine ? 'on' : ''}" id="pM">Mine</button>` : ''}
      ${S.q || S.worker || S.stage || S.delayed || S.mine ? '<button class="ivclr" id="pClr">Clear</button>' : ''}
      <button type="button" class="pill sm outline" id="pChoose">${S.choose ? 'Done' : 'Select'}</button>
      ${S.sel.size ? `<button type="button" class="pill sm" id="pPrint">Print stickers (${S.sel.size})</button>` : ''}</div>`;
  const filtered = !!(S.q || S.worker || S.stage || S.delayed || S.mine);
  if (!r.cards.length) { // nothing in production at all
    if (!$('pWrap')) main.innerHTML = '<div class="prod" id="pWrap"></div><div id="pSheetBox"></div><div id="pMoveBox"></div>';
    $('pWrap').innerHTML = `${head('board')}<div class="kempty pempty pnojo"><b>No JOs in production right now.</b><p class="muted">A JO shows here once it is scanned and marked “In production” or “In queue”, and stays until it is picked up.</p></div>`;
    return;
  }
  const sum = `<p class="muted psum">${r.cards.length} JO${r.cards.length === 1 ? '' : 's'} in production${nd ? ` · <b class="gold">${nd} delayed</b>` : ''}${list.length !== r.cards.length ? ` · showing ${list.length}` : ''} · ${phone ? 'Tap a card to see it, or Move when it is done.' : 'Drag a card to the next stage when it is done. Click a card for photos and time.'}</p>`;
  let board;
  if (phone) {
    board = `<div class="rvchips pcols">${r.columns.map(c => { const n = list.filter(x => x.col === c.key).length, d = list.filter(x => x.col === c.key && x.delayed).length;
      return `<button class="fchip ${S.pcol === c.key ? 'on' : ''}" data-pcol="${c.key}">${esc(c.label)} <b>${n}</b>${d ? '<i class="pdot"></i>' : ''}</button>`; }).join('')}</div>
      <div class="prplist" id="pBoard">${list.filter(c => c.col === S.pcol).map(c => cardH(c, true)).join('') || `<div class="kempty pempty">Nothing in ${esc(col(S.pcol).label)}${S.mine ? ' for you' : ''}.</div>`}</div>`;
  } else {
    board = `<div class="pboard" id="pBoard" style="grid-template-columns:repeat(${cols.length},minmax(${cols.length > 1 ? 126 : 280}px,${cols.length > 1 ? '1fr' : '360px'}))">${cols.map(c => { const cs = list.filter(x => x.col === c.key);
      return `<div class="pcol" data-col="${c.key}"><div class="khead"><span class="lab">${esc(c.label)}</span><span class="kn">${cs.length}</span></div>${cs.map(x => cardH(x, false)).join('') || '<div class="kempty">—</div>'}</div>`; }).join('')}</div>`;
  }
  const none = filtered && !list.length ? `<div class="pnomatch"><span>No JOs match${S.q ? ' “' + esc(S.q) + '”' : ''}.</span> <button class="ivclr" id="pClr2">Clear filters</button></div>` : '';
  if (!$('pWrap')) main.innerHTML = '<div class="prod" id="pWrap"></div><div id="pSheetBox"></div><div id="pMoveBox"></div>'; // the sheets live outside the part that redraws
  $('pWrap').classList.toggle('choose', !!S.choose);
  $('pWrap').innerHTML = `${head('board')}${sum}${filt}${none}${board}`;
  wireBoard(main); loadThumbs(main); tick();
}
function cardH(c, phone) { // every card is the same height: fixed 4:3 photo, clamped text, reserved timer line, fixed 2-row footer (production.css "equal cards")
  const nx = nextCol(c), staff = !can().all;
  const chips = [c.delayed ? '<span class="chip gold">Delayed</span>' : '', tgtChip(c),
    c.due ? `<span class="chip ${c.late ? 'plate' : ''}">${c.late ? 'Past due ' : 'Due '}${dShort(c.due)}</span>` : '', `<span class="chip pdays">${esc(daysTxt(c))}</span>`,
    c.stage_label.toLowerCase() !== col(c.col).label.toLowerCase() ? `<span class="chip" title="${esc(c.stage_label)}">${esc(c.stage_label)}</span>` : '', c.review ? '<span class="chip">To review</span>' : ''].join('');
  const desc = c.description || 'No description yet', who = c.assignee || 'Unassigned';
  const ck = S.choose ? `<label class="pck"><input type="checkbox" data-pck="${esc(c.jo)}" ${S.sel.has(c.jo) ? 'checked' : ''} aria-label="Select ${esc(c.jo)}"></label>` : '';
  return `<div class="pcard tap${c.delayed ? ' dl' : ''}${c.late ? ' late' : ''}${S.sel.has(c.jo) ? ' on' : ''}" data-jo="${c.jo}" ${phone ? '' : 'draggable="true"'}>
    <div class="pcm"><div class="pth" ${c.photo ? `data-ph="${c.photo.file_id}" data-jo="${c.jo}"` : ''}>${ck}${c.photo ? '' : '<span>No scan</span>'}</div>
    <div class="pbd"><div class="kjo">${window.OYP.piece(c.client, c.jo)}${c.photo && c.photo.version ? `<span class="pver" title="Version ${esc(c.photo.version)} (latest)">Ver. ${esc(c.photo.version)}</span>` : ''}</div>
      <div class="kd" title="${esc(desc)}">${esc(desc)}</div>
      <div class="kc" title="${esc(who)}">${c.assignee ? '<b>' + esc(c.assignee) + '</b>' : '<i>Unassigned</i>'}</div>
      ${c.running.length ? `<div class="prun"><i></i>${esc(c.running[0].worker)} · <span data-since="${c.running[0].since}">${elapsed(c.running[0].since)}</span></div>` : '<div class="prun pslot" aria-hidden="true"></div>'}</div></div>
    <div class="kf">${chips}</div>
    ${phone ? (nx && !(staff && c.col === 'pickup') ? `<button class="pmove" data-move="${c.jo}">Move to ${esc(nx.label)} <span>▸</span></button>` : '<div class="pmove pmnone" aria-hidden="true">Last stage</div>') : ''}</div>`;
}
function wireBoard(main) {
  const redraw = () => drawBoard(main);
  const q = $('pQ'); q.oninput = () => { S.q = q.value; const pos = q.selectionStart; redraw(); const q2 = $('pQ'); q2.focus(); q2.setSelectionRange(pos, pos); };
  $('pW').onchange = e => { S.worker = e.target.value; redraw(); };
  if ($('pS')) $('pS').onchange = e => { S.stage = e.target.value; redraw(); };
  $('pD').onclick = () => { S.delayed = !S.delayed; redraw(); };
  if ($('pM')) $('pM').onclick = () => { S.mine = !S.mine; redraw(); };
  const clr = () => { S.q = ''; S.worker = ''; S.stage = ''; S.delayed = false; S.mine = false; redraw(); };
  if ($('pClr')) $('pClr').onclick = clr; if ($('pClr2')) $('pClr2').onclick = clr;
  if ($('pChoose')) $('pChoose').onclick = () => { S.choose = !S.choose; if (!S.choose) S.sel.clear(); redraw(); };
  if ($('pPrint')) $('pPrint').onclick = () => {
    const items = [...S.sel].map(jo => ({ jo: jo, kind: 'jo_card' }));
    if (!window.OYPPrint || !window.OYPPrint.printStickers) return toast('Print is not loaded');
    window.OYPPrint.printStickers(items).then(r => { if (!r || r.ok === false) return; S.sel.clear(); S.choose = false; redraw(); });
  };
  main.querySelectorAll('[data-pck]').forEach(input => input.onclick = e => {
    e.stopPropagation();
    const jo = input.dataset.pck;
    if (S.sel.has(jo)) S.sel.delete(jo); else S.sel.add(jo);
    redraw();
  });
  main.querySelectorAll('.pck').forEach(el => el.onclick = e => e.stopPropagation());
  main.querySelectorAll('[data-pcol]').forEach(b => b.onclick = () => { S.pcol = b.dataset.pcol; redraw(); });
  main.querySelectorAll('.pcard').forEach(el => el.onclick = e => { if (e.target.closest('[data-move]')) return; location.hash = '#/production/jo/' + el.dataset.jo; });
  main.querySelectorAll('[data-move]').forEach(b => b.onclick = e => { e.stopPropagation(); const c = S.r.cards.find(x => x.jo === b.dataset.move), nx = nextCol(c); openMove(c, nx.key); });
  // desktop drag and drop: staff may drop only on the NEXT column; admin + PM anywhere
  let drag = null;
  main.querySelectorAll('.pcard[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => { drag = S.r.cards.find(x => x.jo === el.dataset.jo); e.dataTransfer.setData('text/plain', drag.jo); e.dataTransfer.effectAllowed = 'move'; el.classList.add('drag');
      main.querySelectorAll('.pcol').forEach(c => c.classList.toggle('ok', okDrop(drag, c.dataset.col))); });
    el.addEventListener('dragend', () => { el.classList.remove('drag'); main.querySelectorAll('.pcol').forEach(c => c.classList.remove('ok', 'over')); });
  });
  main.querySelectorAll('.pcol').forEach(cl => {
    cl.addEventListener('dragover', e => { if (drag && okDrop(drag, cl.dataset.col)) { e.preventDefault(); cl.classList.add('over'); } });
    cl.addEventListener('dragleave', () => cl.classList.remove('over'));
    cl.addEventListener('drop', e => { e.preventDefault(); cl.classList.remove('over'); const c = drag || S.r.cards.find(x => x.jo === e.dataTransfer.getData('text/plain'));
      if (!c || c.col === cl.dataset.col) return; if (!okDrop(c, cl.dataset.col)) return toast('Move one stage forward at a time'); openMove(c, cl.dataset.col); });
  });
  const board = $('pBoard');
  const u = S.u;
  if (board && window.OYP.swipe && (can().all || (u && (u.role === 'admin' || u.role === 'production_manager')))) window.OYP.swipe(board, {
    item: '.pcard',
    ignore: '.pck, [data-move]',
    off: () => S.choose,
    actions: function (row) {
      const jo = row.getAttribute('data-jo');
      if (!jo) return [];
      return [{ label: 'Archive', undoable: true, run: function () {
        if (!window.OYP.archiveJos) return;
        window.OYP.archiveJos([jo], 'archived', { after: () => reload() });
      } }];
    }
  });
}
const okDrop = (c, k) => c.col !== k && (can().all || (nextCol(c) && nextCol(c).key === k && c.col !== 'pickup'));

/* ---------- move (big, simple confirm; the same sheet on desktop after a drop) ---------- */
function suggest(k) { // who usually has this column now: the most common assignee there
  const n = {}; S.r.cards.filter(c => c.col === k && c.assignee_id).forEach(c => n[c.assignee_id] = (n[c.assignee_id] || 0) + 1);
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || '';
}
function openMove(c, to) {
  const t = col(to), from = col(c.col);
  S.move = { c, to, who: to === 'pickup' ? '' : suggest(to), code: '' };
  const box = $('pMoveBox'); if (!box) return;
  const codes = can().all ? t.codes.map(k => `<option value="${k}">${esc(S.r.labels[k] || k)}</option>`).join('') : '';
  box.innerHTML = `<div class="pmodal" id="pMove"><div class="pmbox" role="dialog" aria-label="Move JO">
    <div class="pmtop"><div class="pth sm" ${c.photo ? `data-ph="${c.photo.file_id}" data-jo="${c.jo}"` : ''}></div><div><span class="lab">Move JO</span><h3>${esc(c.jo)}</h3><div class="kd">${esc(c.description)}</div></div></div>
    <div class="pmft"><span class="pst">${esc(from.label)}</span><span class="parr">→</span><span class="pst to">${esc(t.label)}</span></div>
    ${c.running.length ? `<p class="pmnote">${esc(c.running.map(x => x.worker).join(', '))}\u2019s timer is running. It stops when you move the JO.</p>` : ''}
    ${to !== 'pickup' ? `<span class="lab">Who works on it in ${esc(t.label)}?</span><div class="pmwho">${S.r.workers.map(w => `<button class="${S.move.who === w.worker_id ? 'on' : ''}" data-who="${w.worker_id}">${esc(w.name)}<small>${esc(w.skill)}</small></button>`).join('')}<button class="${!S.move.who ? 'on' : ''}" data-who="">Decide later</button></div>` : '<p class="pmnote">The JO goes to “For pickup”.</p>'}
    ${can().all && t.codes.length > 1 ? `<label class="pmcode"><span class="lab">Exact step (optional)</span><select id="pmCode"><option value="">${esc(S.r.labels[t.codes[0]] ? 'Start of ' + t.label : t.label)}</option>${codes}</select></label>` : ''}
    ${can().all && to !== 'pickup' ? `<label class="pmcode"><span class="lab">Target for ${esc(t.label)} (optional)</span><input type="date" id="pmT" min="${S.r.today}"><small class="muted">Leave empty if there is no target. Past this date the card shows Delayed.</small></label>` : ''}
    <p class="err" id="pmErr"></p>
    <button class="pill wide" id="pmGo">YES, MOVE TO ${esc(t.label.toUpperCase())}</button>
    <button class="pill outline wide" id="pmNo">CANCEL</button></div></div>`;
  loadThumbs(box);
  box.querySelectorAll('[data-who]').forEach(b => b.onclick = () => { S.move.who = b.dataset.who; box.querySelectorAll('[data-who]').forEach(x => x.classList.toggle('on', x === b)); });
  $('pmNo').onclick = () => { box.innerHTML = ''; };
  $('pMove').onclick = e => { if (e.target.id === 'pMove') box.innerHTML = ''; };
  $('pmGo').onclick = async () => {
    const b = $('pmGo'); b.disabled = true; b.textContent = 'MOVING…';
    const code = $('pmCode') ? $('pmCode').value : '';
    const tg = $('pmT') ? $('pmT').value : '';
    const r = await call('prodMove', { jo: c.jo, to: code || to, seen: c.stage_id, assignee_id: S.move.who || '', step_target: tg });
    if (r && r.code === 'MOVED') { box.innerHTML = ''; toast(r.error || 'Someone moved this JO already. The board is updated.'); S.at = 0; await reload(); if (route().view === 'jo') openJob(route().arg, () => true); return; }
    if (!r || !r.ok) { $('pmErr').textContent = (r && r.error) || 'Could not move. Try again.'; b.disabled = false; b.textContent = 'TRY AGAIN'; return; }
    const who = S.r.workers.find(w => w.worker_id === S.move.who);
    box.querySelector('.pmbox').innerHTML = `<div class="pmdone"><div class="pok">✓</div><h3>Moved to ${esc(r.to_label)}</h3><p>JO ${esc(c.jo)}${who ? ' · now with <b>' + esc(who.name) + '</b>' : ''}${r.step_target ? ' · target ' + esc(dShort(r.step_target)) : ''}</p>
      <p class="muted">Saved in the log: ${esc(S.u.display_name)}, ${esc(dLong(isoDay(r.at)))} ${esc(clock12(isoHM(r.at)))}${r.stopped && r.stopped.length ? ' · timer stopped for ' + esc(r.stopped.join(', ')) : ''}</p>
      <button class="pill wide" id="pmOk">OK</button></div>`;
    $('pmOk').onclick = () => { box.innerHTML = ''; };
    S.at = 0; reload().then(() => { if (route().view === 'jo') openJob(route().arg, () => true); });
  };
}

/* ---------- card detail ---------- */
function closeSheet() { const b = $('pSheetBox'); if (b) b.innerHTML = ''; }
async function openJob(jo, live) {
  const box = $('pSheetBox'); if (!box) return;
  if (!S.job || S.job.card.jo !== jo) box.innerHTML = `<div class="ivsheet" id="pSheet"><div class="ivsbox pdet"><button class="lnk dback" id="pSX">‹ BACK</button><p class="muted">Loading JO ${esc(jo)}…</p></div></div>`;
  wireSheetClose();
  const r = await call('prodJob', { jo }); if (!live() || route().arg !== jo) return;
  if (!r || !r.ok) { box.querySelector('.ivsbox').innerHTML = `<button class="lnk dback" id="pSX">‹ BACK</button><p class="muted">${esc((r && r.error) || 'Could not load')}</p>`; wireSheetClose(); return; }
  S.job = r; if (r.now) S.skew = Date.parse(r.now) - Date.now(); drawJob(); // prodJob is never cached, so its clock is current
}
function wireSheetClose() { const x = $('pSX'), sh = $('pSheet'); if (x) x.onclick = () => { location.hash = '#/production'; }; if (sh) sh.onclick = e => { if (e.target.id === 'pSheet') location.hash = '#/production'; }; }
function drawJob() {
  const r = S.job, c = r.card, cost = !!r.can.costs, box = $('pSheetBox'); if (!box) return;
  const nx = (() => { const x = r.columns.find(k => k.key === (c.next !== undefined ? c.next : c.col)); return c.next !== undefined ? x || null : x && x.next ? r.columns.find(k => k.key === x.next) : null; })();
  const me = r.me_worker, runs = r.sessions.filter(s => s.running);
  const wsel = (id, val, any) => `<select id="${id}">${any ? '<option value="">Pick…</option>' : ''}${r.workers.map(w => `<option value="${w.worker_id}" ${val === w.worker_id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>`;
  // sessions grouped by stage (stage visits in order)
  const groups = r.history.map(h => ({ h, rows: r.sessions.filter(s => s.stage_id ? s.stage_id === h.stage_id : s.stage_code === h.code) })).filter(g => g.rows.length || g.h.status === 'doing');
  const loose = r.sessions.filter(s => !r.history.some(h => s.stage_id ? s.stage_id === h.stage_id : s.stage_code === h.code));
  if (loose.length) groups.push({ h: { label: 'Other', code: '', status: '' }, rows: loose });
  groups.reverse(); // current stage first
  const gcost = rows => rows.reduce((t, s) => t + (s.cost || 0), 0);
  const sessTable = groups.map((g, gi) => { const open = g.h.status === 'doing' || S.openG === c.jo + gi; return `<tr class="pgh${open ? '' : ' shut'}" data-g="${gi}"><td colspan="${cost ? 6 : 5}"><span class="pgt">${open ? '▾' : '▸'}</span> <b>${esc(g.h.label)}</b>${g.h.status === 'doing' ? ' <span class="chip gold">Now</span>' : ''} · ${g.rows.length} ${g.rows.length === 1 ? 'entry' : 'entries'} · ${hrs(g.rows.reduce((t, s) => t + s.minutes, 0))}${cost ? ' · ' + peso(gcost(g.rows)) : ''}</td></tr>`
    + (open ? g.rows.slice().reverse().map(s => `<tr class="psr${s.running ? ' prow-run' : ''}"><td class="cd">${esc(dShort(s.date))}</td><td class="ct">${esc(clock12(s.start))}–${s.running ? '<b>now</b>' : esc(clock12(s.end))}</td><td class="r ch">${s.running ? `<span data-since="${s.date}T${s.start}:00+08:00">${elapsed(s.date + 'T' + s.start + ':00+08:00')}</span>` : hrs(s.minutes)}</td><td class="cw">${esc(s.worker)}${s.source === 'manual' ? ' <small class="muted">typed</small>' : ''}</td>${cost ? `<td class="r cc">${s.cost == null ? '<small class="muted">no rate</small>' : peso(s.cost)}</td>` : ''}<td class="r cr">${s.running ? '' : `<button class="lnk" data-void="${s.session_id}">Remove</button>`}</td></tr>`).join('') : '')
    + (g.rows.length || !open ? '' : `<tr><td colspan="${cost ? 6 : 5}" class="muted">No time logged in this stage yet.</td></tr>`); }).join('');
  const total = `<tr class="ptot"><td colspan="2" class="cd"><b>All stages</b></td><td class="r ch"><b>${hrs(r.total_minutes)}</b></td><td class="cw"></td>${cost ? `<td class="r cc"><b>${peso(r.labor_cost)}</b></td>` : ''}<td class="cr"></td></tr>`;
  const tgtField = (scope, label, d) => { const over = d && c.col !== 'pickup' && r.today > d;
    return `<div class="ivf ptf${over ? ' over' : ''}"><span class="lab">${label}</span>${r.can.all ? `<input type="date" data-tgt="${scope}" value="${d || ''}">${d ? `<button class="lnk" data-tgtclr="${scope}">Clear</button>` : '<small class="muted">No target</small>'}` : `<b>${d ? esc(dLong(d)) : '—'}</b>`}${over ? '<small class="gold">Past target: Delayed</small>' : ''}</div>`; };
  const timerWho = r.can.all ? (runs[0] ? runs[0].worker_id : (c.assignee_id || me || '')) : me;
  const myRun = runs.find(s => s.worker_id === timerWho);
  box.innerHTML = `<div class="ivsheet" id="pSheet"><div class="ivsbox pdet">
    <button class="lnk dback" id="pSX">‹ BACK</button>
    <div class="pdh"><h3>JO ${esc(c.jo)}</h3>${r.pages_version ? `<span class="chip">Version ${esc(r.pages_version)}</span>` : ''}${c.delayed ? '<span class="chip gold">Delayed</span>' : ''}${c.late ? '<span class="chip plate">Past due</span>' : ''}</div>
    <div class="kd pdesc">${esc(c.description || 'No description yet')}</div>
    <div class="prpbig" id="pBig" ${r.pages[0] ? `data-full="${r.pages[0].file_id}"` : ''}>${r.pages[0] ? '' : '<span class="lab">No scan yet</span>'}</div>
    ${r.pages.length ? `<div class="pthumbs">${r.pages.map((p, i) => `<button class="pth xs ${i ? '' : 'on'}" data-pg="${p.file_id}" data-ph="${p.file_id}" data-jo="${c.jo}" aria-label="Page ${p.page}"></button>`).join('')}<span class="muted pvnote">${r.pages_version ? 'Version ' + esc(r.pages_version) + ' (latest) · ' : ''}${r.pages.length} page${r.pages.length > 1 ? 's' : ''}${r.older_sets ? ' · ' + r.older_sets + ' older scan' + (r.older_sets > 1 ? 's' : '') + ' in To review' : ''}</span></div>` : ''}
    <div class="ivfs">
      <div class="ivf"><span class="lab">Stage</span><b>${esc(c.stage_label)}</b><small class="muted">${esc(daysTxt(c))}</small></div>
      <div class="ivf"><span class="lab">Due (client)</span><b>${c.due ? esc(dLong(c.due)) : '—'}</b></div>
      ${tgtField('step', 'Target · this step', c.step_target)}${tgtField('job', 'Target · whole JO', c.target)}
      <div class="ivf"><span class="lab">Client</span><b>${esc(c.client || '—')}</b></div>
      <div class="ivf"><span class="lab">Has it now</span>${r.can.all ? wsel('pAsg', c.assignee_id, true) : `<b>${esc(c.assignee || 'Nobody yet')}</b>${!c.assignee && me ? '<button class="lnk" id="pTake">Take it</button>' : ''}`}</div>
    </div>
    <div class="ptimer ${myRun ? 'on' : ''}">
      <div><span class="lab">${r.can.all ? 'Who is working · ' : 'Timer · '}${esc(c.stage_label)}</span>${r.can.all ? wsel('pTW', timerWho, true) : `<b>${esc((r.workers.find(w => w.worker_id === me) || {}).name || '')}</b>`}</div>
      <div class="pclock">${myRun ? `<span data-since="${myRun.date}T${myRun.start}:00+08:00">${elapsed(myRun.date + 'T' + myRun.start + ':00+08:00')}</span>` : '<span class="muted">Not running</span>'}</div>
      ${!r.can.all && !me ? '<p class="muted">Ask Susan to link your name to a worker to use the timer.</p>' : `<button class="pill ${myRun ? '' : 'outline'} prpgo" id="pTimer">${myRun ? '■ STOP' : '▶ START'}</button>`}
    </div>
    <div class="dtitle psess"><h3>Work sessions</h3><span class="kn">${hrs(r.total_minutes)} total${cost ? ' · labor ' + peso(r.labor_cost) : ''}</span></div>
    ${cost ? `<p class="muted prpnote">Labor cost = hours × each worker\u2019s labor rate (Settings › Prices & markups). Shown to admins and Susan only.${r.missing_rates && r.missing_rates.length ? ' No labor rate yet for ' + esc(r.missing_rates.join(', ')) + '.' : ''}</p>` : ''}
    <div class="tw"><table class="dt prptab"><thead><tr><th><span class="lab">Date</span></th><th><span class="lab">Time</span></th><th class="r"><span class="lab">Hours</span></th><th><span class="lab">Worker</span></th>${cost ? '<th class="r"><span class="lab">Labor</span></th>' : ''}<th></th></tr></thead><tbody>${sessTable}${total}</tbody></table></div>
    <details class="medit prpadd" id="pAddD"><summary><span class="lab">+ Add time by hand</span></summary>
      <div class="pform"><label class="fsec"><span class="lab">Date</span><input type="date" id="paDate" value="${r.today}" max="${r.today}"></label>
      <label class="fsec"><span class="lab">Worker</span>${r.can.all ? wsel('paW', c.assignee_id || me, true) : `<input disabled value="${esc((r.workers.find(w => w.worker_id === me) || {}).name || '')}">`}</label>
      <label class="fsec"><span class="lab">Start</span><input type="time" id="paS" step="300"></label><label class="fsec"><span class="lab">End</span><input type="time" id="paE" step="300"></label>
      <label class="fsec full"><span class="lab">Stage</span><select id="paSt">${r.history.slice().reverse().filter((h, i, a) => a.findIndex(x => x.code === h.code) === i).map(h => `<option value="${h.code}">${esc(h.label)}${h.status === 'doing' ? ' (now)' : ''}</option>`).join('')}</select></label></div>
      <p class="err" id="paErr"></p><button class="pill sm" id="paGo">ADD</button></details>
    <div class="dtitle prphist"><h3>Stage history</h3><span class="kn">every move, who and when</span></div>
    <div class="phl">${r.history.slice().reverse().map(h => `<div class="phr ${h.status === 'doing' ? 'now' : ''}"><div><b>${esc(h.label)}</b>${h.assignee ? ' · ' + esc(h.assignee) : ''}${h.target ? ' · <span class="muted">target ' + esc(dShort(h.target)) + '</span>' : ''}</div>
      <div class="phs">${h.pending ? 'From the scan · since ' + esc(dShort(isoDay(h.started_at))) : `In ${esc(dShort(isoDay(h.started_at)))} ${esc(clock12(isoHM(h.started_at)))} by ${esc(h.moved_in_by)}`}${h.ended_at ? ` · out ${esc(dShort(isoDay(h.ended_at)))} by ${esc(h.moved_out_by)}` : ' · still here'} · ${h.days == null ? '' : h.days + ' d'} · ${hrs(h.minutes)}</div></div>`).join('')}</div>
    ${nx && !(c.col === 'pickup') ? `<button class="pill wide pmv" id="pMv">MOVE TO ${esc(nx.label.toUpperCase())} ▸</button>` : ''}
  </div></div>`;
  wireSheetClose(); loadThumbs(box); tick();
  if (window.OYPPhotos && r.pages.length) window.OYPPhotos.prefetch(c.jo, r.pages.map(p => p.file_id), 'scan', 'prod');
  const big = $('pBig'); const showBig = fid => {
    if (window.OYPPhotos) { window.OYPPhotos.stage(big, { jo: c.jo, id: fid, kind: 'scan', legacy: 'prod', alt: 'JO card', empty: 'Photo not found' }); return; }
    big.innerHTML = '<span class="lab">Loading photo…</span>'; photo(c.jo, fid, 'full').then(src => { big.innerHTML = src ? `<img src="${src}" alt="JO card">` : '<span class="lab">Photo not found</span>'; });
  };
  if (big.dataset.full) showBig(big.dataset.full);
  box.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { box.querySelectorAll('[data-pg]').forEach(x => x.classList.toggle('on', x === b)); showBig(b.dataset.pg); });
  const after = async (res, msg) => { if (!res || !res.ok) { toast((res && res.error) || 'Could not save'); if (route().arg === c.jo) drawJob(); return false; } if (msg) toast(msg); S.at = 0; await reload(); const j = await call('prodJob', { jo: c.jo }); if (j && j.ok && route().arg === c.jo) { S.job = j; drawJob(); } return true; };
  if ($('pAsg')) $('pAsg').onchange = e => call('prodAssign', { jo: c.jo, worker_id: e.target.value }).then(x => after(x, 'Saved: ' + (x && x.assignee ? x.assignee + ' has JO ' + c.jo : 'nobody assigned')));
  if ($('pTake')) $('pTake').onclick = () => call('prodAssign', { jo: c.jo, worker_id: me }).then(x => after(x, 'JO ' + c.jo + ' is yours'));
  if ($('pTW')) $('pTW').onchange = () => drawTimerOnly();
  const setT = (scope, d) => call('prodSetTarget', { jo: c.jo, scope, target: d }).then(x => after(x, x && x.ok ? (d ? 'Target set: ' + dShort(d) : 'Target cleared') : ''));
  box.querySelectorAll('[data-tgt]').forEach(i => i.onchange = () => setT(i.dataset.tgt, i.value));
  box.querySelectorAll('[data-tgtclr]').forEach(b => b.onclick = () => setT(b.dataset.tgtclr, ''));
  const tbtn = $('pTimer');
  if (tbtn) tbtn.onclick = async () => {
    const who = $('pTW') ? $('pTW').value : me; if (!who) return toast('Pick who is working');
    const running = r.sessions.find(s => s.running && s.worker_id === who);
    let x = await call('prodTimer', { jo: c.jo, worker_id: who, op: running ? 'stop' : 'start' });
    if (x && x.code === 'RUNNING' && confirm(x.error)) x = await call('prodTimer', { jo: c.jo, worker_id: who, op: 'start', switch: true });
    after(x, x && x.ok ? (x.stopped ? 'Stopped: ' + hrs(x.minutes) + ' for ' + x.worker : 'Started for ' + x.worker) : '');
  };
  function drawTimerOnly() { const who = $('pTW').value, run = r.sessions.find(s => s.running && s.worker_id === who), t = box.querySelector('.ptimer');
    t.classList.toggle('on', !!run); t.querySelector('.pclock').innerHTML = run ? `<span data-since="${run.date}T${run.start}:00+08:00">${elapsed(run.date + 'T' + run.start + ':00+08:00')}</span>` : '<span class="muted">Not running</span>';
    tbtn.textContent = run ? '■ STOP' : '▶ START'; tbtn.classList.toggle('outline', !run); }
  $('paGo').onclick = async () => {
    const body = { jo: c.jo, worker_id: $('paW') ? $('paW').value : me, date: $('paDate').value, start: $('paS').value, end: $('paE').value, stage_code: $('paSt').value };
    let x = await call('prodSessionAdd', body);
    if (x && x.code === 'OVERLAP' && confirm(x.error)) x = await call('prodSessionAdd', Object.assign(body, { confirm_overlap: true }));
    if (!x || !x.ok) { $('paErr').textContent = (x && x.error) || 'Could not save'; return; }
    after(x, 'Added ' + hrs(x.minutes));
  };
  box.querySelectorAll('tr.pgh[data-g]').forEach(tr => tr.onclick = () => { const k = c.jo + tr.dataset.g; S.openG = S.openG === k ? null : k; const sc = box.querySelector('.ivsbox').scrollTop; drawJob(); box.querySelector('.ivsbox').scrollTop = sc; });
  box.querySelectorAll('[data-void]').forEach(b => b.onclick = async () => { if (!confirm('Remove this time entry? It stays in the Sheet, marked removed.')) return; after(await call('prodSessionVoid', { session_id: b.dataset.void }), 'Removed'); });
  if ($('pMv')) $('pMv').onclick = () => { const cc = S.r.cards.find(x => x.jo === c.jo) || c; openMove(cc, nx.key); };
}

/* ---------- worker schedule ---------- */
async function workersPage(main, live) {
  if (!S.wkr) main.innerHTML = head('workers') + '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const r = await call('prodWorkers', { week: S.wk || '' }); if (!live()) return;
  if (!r || !r.ok) { if (S.wkr && $('wPrev') && r && r.code !== 'FORBIDDEN') { toast('Could not refresh: ' + (r.error || 'try again')); return; } failPage(main, r, () => workersPage(main, window.OYP.here())); return; }
  S.wkr = r;
  const thisWeek = !S.wk || S.wk === r.week, addD = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const max = Math.max(480, ...r.lanes.flatMap(l => l.by_day.map(d => d.minutes)));
  const mini = (c, i) => `<a class="pmini tap${c.delayed ? ' dl' : ''}" href="#/production/jo/${c.jo}">${i != null ? `<span class="pnum">${i + 1}</span>` : ''}<span class="pth xs" ${c.photo ? `data-ph="${c.photo.file_id}" data-jo="${c.jo}"` : ''}></span>
    <span class="pmb"><b>${esc(c.jo)}</b> <span class="muted">${esc(c.stage_label)}</span><span class="kd">${esc(c.description)}</span>
    <span class="pmf">${c.delayed ? '<span class="chip gold">Delayed</span>' : ''}${tgtChip(c)}<span class="chip pdays">${esc(daysTxt(c))}</span>${c.due ? `<span class="chip ${c.late ? 'plate' : ''}">Due ${dShort(c.due)}</span>` : ''}${c.minutes_stage ? `<span class="chip">${hrs(c.minutes_stage)} so far</span>` : ''}</span></span></a>`;
  const lane = l => `<div class="plane"><div class="prplh"><div><b class="pln">${esc(l.name)}</b><span class="lab">${esc(l.skill)}</span>${r.can.all ? `<button class="lnk pwed" data-wed="${l.worker_id}">Edit</button>` : ''}</div><div class="plhrs"><b>${hrs(l.minutes_week)}</b><span class="lab">${thisWeek ? 'this week' : 'that week'}</span></div></div>
    <div class="pbars">${l.by_day.slice(0, 6).map(d => `<div class="pbar${d.day === r.today ? ' cur' : ''}" title="${esc(dShort(d.day))}: ${hrs(d.minutes)}"><i style="height:${Math.round(d.minutes / max * 100)}%"></i><span>${DN[new Date(d.day + 'T00:00:00Z').getUTCDay()].slice(0, 1)}</span></div>`).join('')}</div>
    ${l.running ? `<div class="prun big"><i></i>Working on JO ${esc(l.running.jo)} · <span data-since="${l.running.since}">${elapsed(l.running.since)}</span></div>` : '<div class="prun off">No timer running</div>'}
    <div class="plsec"><span class="lab">Has now · ${l.in_hand.length}</span>${l.in_hand.map(c => mini(c)).join('') || '<p class="muted pnone">Nothing started</p>'}</div>
    <div class="plsec"><span class="lab">Up next · ${l.queue.length}</span>${l.queue.map((c, i) => mini(c, i)).join('') || '<p class="muted pnone">Queue is empty</p>'}</div></div>`;
  const tot = r.lanes.reduce((t, l) => t + l.minutes_week, 0);
  main.innerHTML = `<div class="prod">${head('workers')}
    <div class="pwk"><button class="icon pnav" id="wPrev" aria-label="Previous week">‹</button><b>Week of ${esc(dShort(r.week))} – ${esc(dShort(r.week_end))}</b><button class="icon pnav" id="wNext" aria-label="Next week" ${thisWeek ? 'disabled' : ''}>›</button>${thisWeek ? '' : '<button class="ivclr" id="wNow">This week</button>'}</div>
    ${r.can.all ? `<div class="pwadd"><button class="pill sm" id="wAdd">+ ADD WORKER</button>${r.hidden && r.hidden.length ? `<span class="muted">Hidden: ${r.hidden.map(h => `<button class="lnk" data-wshow="${h.worker_id}">${esc(h.name)}</button>`).join(' ')}</span>` : ''}</div><div id="wForm"></div>` : ''}
    <p class="muted psum">${hrs(tot)} logged by ${r.lanes.length} people · “Has now” = time logged in the current stage · “Up next” = assigned, not started (most urgent first)</p>
    <div class="planes">${r.lanes.map(lane).join('')}${r.unassigned.length ? `<div class="plane un"><div class="prplh"><div><b class="pln">Unassigned</b><span class="lab">needs a person</span></div><div class="plhrs"><b>${r.unassigned.length}</b><span class="lab">JOs</span></div></div><div class="plsec">${r.unassigned.map(c => mini(c)).join('')}</div></div>` : ''}</div></div>`;
  loadThumbs(main); tick();
  if (r.can.all) wireWorkerForm(main, r);
  $('wPrev').onclick = () => { S.wk = addD(r.week, -7); workersPage(main, window.OYP.here()); };
  $('wNext').onclick = () => { S.wk = addD(r.week, 7); workersPage(main, window.OYP.here()); };
  if ($('wNow')) $('wNow').onclick = () => { S.wk = null; workersPage(main, window.OYP.here()); };
}

/* add / edit a worker (Susan / admin). Workers are names only, no logins. Hide = off the lists, never deleted. */
function wireWorkerForm(main, r) {
  const box = $('wForm'), again = () => { S.wkr = null; workersPage(main, window.OYP.here()); };
  const form = w => {
    const opts = (r.labor_options || []).map(o => `<option value="${esc(o.code)}" ${w && w.labor_code === o.code ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
    box.innerHTML = `<div class="pwform"><h3>${w ? 'Edit ' + esc(w.name) : 'Add a worker'}</h3><div class="pform">
      <label class="fsec"><span class="lab">Name</span><input id="wfN" maxlength="40" value="${esc(w ? w.name : '')}" placeholder="e.g. Romy" autocomplete="off"></label>
      <label class="fsec"><span class="lab">Does</span><input id="wfS" maxlength="40" value="${esc(w ? w.skill : '')}" placeholder="e.g. Polishing" autocomplete="off"></label>
      ${opts ? `<label class="fsec full"><span class="lab">Labor rate (for the cost of hours)</span><select id="wfL"><option value="">None</option>${opts}</select></label>` : ''}</div>
      <p class="muted pwnote">Just a name for the lists and the time log. They do not get a login; Susan logs their time.</p>
      <p class="err" id="wfErr"></p><div class="pwbtn"><button class="pill sm" id="wfGo">SAVE</button><button class="pill sm outline" id="wfNo">CANCEL</button>${w ? '<button class="lnk" id="wfHide">Hide from lists</button>' : ''}</div></div>`;
    if ($('wfL') && !w) $('wfL').onchange = e => { const o = (r.labor_options || []).find(x => x.code === e.target.value), m = o && o.label.match(/^(.*?)\s*\((.+)\)\s*$/); // "Goldsmith (Romy)" fills Romy · Goldsmith
      if (o && !$('wfN').value) $('wfN').value = m ? m[2] : ''; if (o && !$('wfS').value) $('wfS').value = m ? m[1] : o.label; };
    $('wfNo').onclick = () => { box.innerHTML = ''; };
    const save = async extra => { const x = await call('prodWorkerSave', Object.assign({ worker_id: w ? w.worker_id : '', name: $('wfN').value, skill: $('wfS').value, labor_code: $('wfL') ? $('wfL').value : (w ? w.labor_code : '') }, extra || {}));
      if (!x || !x.ok) { $('wfErr').textContent = (x && x.error) || 'Could not save'; return; } toast(extra && extra.active === false ? x.name + ' is hidden' : 'Saved: ' + x.name); S.r = null; again(); };
    $('wfGo').onclick = () => save(); if ($('wfHide')) $('wfHide').onclick = () => { if (confirm('Hide ' + w.name + ' from the lists? Their logged time stays.')) save({ active: false }); };
    $('wfN').focus();
  };
  $('wAdd').onclick = () => form(null);
  main.querySelectorAll('[data-wed]').forEach(b => b.onclick = () => form(r.lanes.find(l => l.worker_id === b.dataset.wed)));
  main.querySelectorAll('[data-wshow]').forEach(b => b.onclick = async () => { const h = r.hidden.find(x => x.worker_id === b.dataset.wshow);
    const x = await call('prodWorkerSave', { worker_id: h.worker_id, name: h.name, skill: h.skill, labor_code: h.labor_code || '', active: true }); if (x && x.ok) { toast(h.name + ' is back on the lists'); S.r = null; again(); } else toast((x && x.error) || 'Could not save'); });
}

/* running clocks: one ticker for every [data-since] on screen */
function tick() { if (tick.t) return; tick.t = setInterval(() => { const els = document.querySelectorAll('[data-since]'); if (!els.length) { clearInterval(tick.t); tick.t = 0; return; } els.forEach(e => e.textContent = elapsed(e.dataset.since)); }, 1000); }
document.addEventListener('keydown', e => { if (e.key !== 'Escape' || !location.hash.startsWith('#/production')) return;
  if ($('pMove')) { $('pMoveBox').innerHTML = ''; return; } if ($('pSheet')) location.hash = '#/production'; });
window.addEventListener('resize', () => { if (location.hash.startsWith('#/production') && S.r && $('pBoard') && (narrow() !== !!$('pBoard').classList.contains('prplist'))) drawBoard($('main')); });

window.OYPProd = { render };
})();
