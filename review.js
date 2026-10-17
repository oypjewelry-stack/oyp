/* OYP back office: "To review" (#/review). Draft JOs from card scans: photos beside a quick-edit form.
   Server (JobSync.gs) checks roles (admin + production manager), serves photos only through jobPhoto, and refuses
   to overwrite a field someone else changed since this form opened (CONFLICT). */
(() => {
'use strict';
const FIELDS = [['client', 'Client'], ['due_date', 'Due date'], ['type', 'Type'], ['metal', 'Metal'], ['karat', 'Karat'], ['description', 'Description']];
const TYPES = [['new', 'New job'], ['repair', 'Repair'], ['revision', 'Revision']];
const STATUS = [['', 'Automatic (from location)'], ['draft', 'Draft'], ['active', 'Active'], ['done', 'Done'], ['picked_up', 'Picked up'], ['cancelled', 'Cancelled']];
const photoCache = {};
let S = { jobs: [], locations: [], filter: 'noloc', sel: new Set(), open: null, conflicts: {}, q: '' };

function photo(jo, fid, size) {
  const k = fid + '|' + (size || 'thumb');
  if (!photoCache[k]) photoCache[k] = window.OYP.call('jobPhoto', { jo, file_id: fid, size }).then(r => (r && r.ok && r.src) || '');
  return photoCache[k];
}
const locLabel = k => (S.locations.find(l => l[0] === k) || [k, k])[1];
const views = {
  noloc: ['Needs location', j => !j.location],
  details: ['Missing details', j => j.missing.some(m => m !== 'location')],
  all: ['All to review', () => true]
};

async function render(main, u) {
  const { call, esc } = window.OYP;
  main.innerHTML = '<h2>To review</h2><p class="muted">Loading…</p>';
  const r = await call('jobReviewList');
  if (!r || !r.ok) {
    main.innerHTML = `<h2>To review</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for card reviews yet.' : (r && r.error) || 'Could not load')}</p>`; return;
  }
  S.jobs = r.jobs; S.locations = r.locations; S.canPhone = r.can_see_phone; S.u = u;
  if (S.open && !S.jobs.some(j => j.jo === S.open)) S.open = null;
  if (!S.open && innerWidth >= 900) { const f = shown()[0]; if (f) S.open = f.jo; } // desktop: show the first card right away
  draw(main);
}

function shown() { const f = views[S.filter][1], q = S.q.trim().toUpperCase(); return S.jobs.filter(j => f(j) && (!q || j.jo.includes(q) || (j.client && j.client.name.toUpperCase().includes(q)) || j.description.toUpperCase().includes(q))); }

function draw(main) {
  const { esc } = window.OYP, L = shown();
  S.sel.forEach(k => { if (!S.jobs.some(j => j.jo === k)) S.sel.delete(k); });
  const count = k => S.jobs.filter(views[k][1]).length;
  main.innerHTML = `<div class="rv ${S.open ? 'has-open' : ''}">
  <div class="rvlist">
    <div class="dhead"><h2>To review</h2><span class="lab">${S.jobs.length} from scans</span></div>
    <p class="muted">Cards that were scanned but not checked yet. Pick where each piece is, fill in what you can, then save.</p>
    <div class="rvchips">${Object.keys(views).map(k => `<button class="fchip ${S.filter === k ? 'on' : ''}" data-f="${k}">${esc(views[k][0])} <b>${count(k)}</b></button>`).join('')}</div>
    <input id="rvQ" class="rvq" placeholder="Search JO, client or description" value="${esc(S.q)}">
    <div class="bulk ${S.sel.size ? 'on' : ''}">
      <label class="ck"><input type="checkbox" id="rvAll" ${L.length && L.every(j => S.sel.has(j.jo)) ? 'checked' : ''}><span>${S.sel.size ? S.sel.size + ' selected' : 'Select all'}</span></label>
      <select id="rvBulkLoc"><option value="">Set location…</option>${S.locations.map(l => `<option value="${l[0]}">${esc(l[1])}</option>`).join('')}</select>
      <button class="pill sm" id="rvBulk" ${S.sel.size ? '' : 'disabled'}>SET</button>
    </div>
    <div class="rvrows">${L.map(j => `
      <div class="rvrow ${S.open === j.jo ? 'on' : ''}" data-jo="${esc(j.jo)}">
        <label class="ck" onclick="event.stopPropagation()"><input type="checkbox" data-sel="${esc(j.jo)}" ${S.sel.has(j.jo) ? 'checked' : ''}></label>
        <div class="th" data-th="${esc(j.jo)}|${esc(j.pages[0] ? j.pages[0].file_id : '')}"></div>
        <div class="rvi"><div class="kjo">${esc(j.jo)}${j.parent_jo ? `<span class="muted sm">of ${esc(j.parent_jo)}</span>` : ''}</div>
          <div class="kd">${esc(j.description || (j.client ? j.client.name : '') || 'No details yet')}</div>
          <div class="kf">${j.location ? `<span class="chip dark">${esc(locLabel(j.location))}</span>` : '<span class="chip gold">Needs location</span>'}
          ${j.missing.filter(m => m !== 'location').length ? `<span class="chip">${j.missing.filter(m => m !== 'location').length} missing</span>` : '<span class="chip">Details ✓</span>'}
          <span class="chip">${j.pages.length} pg</span></div></div>
      </div>`).join('') || `<p class="muted rvnone">${S.jobs.length ? 'Nothing in this view.' : 'Nothing to review. New scans show up here.'}</p>`}</div>
  </div>
  <div class="rvpanel" id="rvPanel">${S.open ? panel(S.jobs.find(j => j.jo === S.open)) : '<div class="rvempty"><span class="lab">Pick a card on the left</span></div>'}</div>
  </div><div id="rvBig" class="rvbig hidden"></div>`;
  wire(main);
}

function panel(j) {
  const { esc } = window.OYP, miss = k => j.missing.includes(k), cf = S.conflicts;
  const flag = k => (cf[k] ? `<span class="flag c">Changed by someone: now “${esc(cf[k])}”</span>` : miss(k) ? '<span class="flag">Missing</span>' : '');
  const fcls = k => (cf[k] ? 'conf' : miss(k) ? 'miss' : '');
  return `<div class="rvp">
    <button class="lnk rvback" data-back>‹ All cards</button>
    <div class="dhead"><h2>JO ${esc(j.jo)}</h2><span class="lab">${j.type === 'revision' && j.parent_jo ? 'Revision of ' + esc(j.parent_jo) : j.pages.length + ' page' + (j.pages.length === 1 ? '' : 's')}</span></div>
    <div class="shots">${j.pages.map(p => `<button class="shot" data-big="${esc(p.file_id)}"><span class="ph" data-ph="${esc(j.jo)}|${esc(p.file_id)}"></span><span class="lab">Page ${p.page}</span></button>`).join('') || '<span class="muted">No photos</span>'}</div>
    <div class="fsec ${fcls('location')}"><div class="flab"><span class="lab">Where is it now?</span>${flag('location')}</div>
      <div class="locs">${S.locations.map(l => `<button class="loc ${j.location === l[0] ? 'on' : ''}" data-loc="${l[0]}">${esc(l[1])}</button>`).join('')}</div></div>
    <div class="fgrid">
      <div class="fsec full ${fcls('client') || fcls('client_id')}"><div class="flab"><span class="lab">Client</span>${flag('client') || flag('client_id')}</div>
        <div id="fClient" class="cpick">${j.client ? `<div class="csel"><b>${esc(j.client.name)}</b>${j.client.phone ? ` <span class="muted">${esc(j.client.phone)}</span>` : ''}<button class="lnk" data-cclear>Change</button></div>` : ''}
        <div class="csearch ${j.client ? 'hidden' : ''}"><input id="fCq" placeholder="Search a client by name${S.canPhone ? ' or phone' : ''}" autocomplete="off"><div id="fCres" class="cres"></div>
          <div class="cnew"><span class="lab">or add a new client</span><div class="row2"><input id="fNn" placeholder="Name"><input id="fNp" placeholder="Phone" inputmode="tel"></div></div></div></div></div>
      <div class="fsec ${fcls('due_date')}"><div class="flab"><span class="lab">Due date</span>${flag('due_date')}</div><input type="date" id="f_due_date" value="${esc(j.due_date)}"></div>
      <div class="fsec ${fcls('type')}"><div class="flab"><span class="lab">Type</span>${flag('type')}</div><div class="seg">${TYPES.map(t => `<button class="${j.type === t[0] ? 'on' : ''}" data-type="${t[0]}">${esc(t[1])}</button>`).join('')}</div></div>
      <div class="fsec ${fcls('metal')}"><div class="flab"><span class="lab">Metal</span>${flag('metal')}</div><input id="f_metal" list="dlMetal" value="${esc(j.metal)}" placeholder="Gold, Silver…"></div>
      <div class="fsec ${fcls('karat')}"><div class="flab"><span class="lab">Karat</span>${flag('karat')}</div><input id="f_karat" list="dlKarat" value="${esc(j.karat)}" placeholder="18k, 925…"></div>
      <div class="fsec ${fcls('size')}"><div class="flab"><span class="lab">Size</span>${flag('size')}</div><input id="f_size" value="${esc(j.size)}" placeholder="optional"></div>
      <div class="fsec ${fcls('status')}"><div class="flab"><span class="lab">Status</span>${flag('status')}</div><select id="f_status">${STATUS.map(s => `<option value="${s[0]}">${esc(s[1])}${s[0] && s[0] === j.status ? ' · now' : ''}</option>`).join('')}</select></div>
      <div class="fsec full ${fcls('description')}"><div class="flab"><span class="lab">Description</span>${flag('description')}</div><textarea id="f_description" rows="2" placeholder="e.g. Coin necklace, 13 coins">${esc(j.description)}</textarea></div>
    </div>
    <datalist id="dlMetal"><option>Gold</option><option>Silver</option><option>Platinum</option><option>Palladium</option><option>Two-tone</option><option>Other</option></datalist>
    <datalist id="dlKarat"><option>24k</option><option>22k</option><option>18k</option><option>14k</option><option>10k</option><option>925</option><option>999</option></datalist>
    <div class="fbtns"><button class="pill" id="fDone">SAVE &amp; MARK REVIEWED</button><button class="pill outline" id="fSave">SAVE</button><button class="lnk" id="fNext">Next card ›</button></div>
    <p class="muted fnote">${j.scanned_at ? 'Scanned ' + esc(new Date(j.scanned_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })) + ' PHT · ' : ''}Saving never replaces something another person changed in the meantime.</p>
  </div>`;
}

function wire(main) {
  const { call, esc, toast } = window.OYP, $ = s => main.querySelector(s);
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; draw(main); });
  $('#rvQ').oninput = e => { S.q = e.target.value; const pos = e.target.selectionStart; draw(main); const q = main.querySelector('#rvQ'); q.focus(); q.setSelectionRange(pos, pos); };
  main.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); draw(main); });
  $('#rvAll').onchange = e => { shown().forEach(j => e.target.checked ? S.sel.add(j.jo) : S.sel.delete(j.jo)); draw(main); };
  $('#rvBulk').onclick = async () => {
    const loc = $('#rvBulkLoc').value; if (!loc) return toast('Pick a location first');
    const jos = [...S.sel]; let r = await call('jobBulkLocation', { jos, location: loc });
    if (!r.ok) return toast(r.error);
    if (r.kept.length && confirm(r.kept.length + ' of these already have another location (' + r.kept.slice(0, 5).map(k => k.jo + ': ' + locLabel(k.location)).join(', ') + (r.kept.length > 5 ? '…' : '') + '). Change them to ' + locLabel(loc) + ' too?')) {
      const r2 = await call('jobBulkLocation', { jos: r.kept.map(k => k.jo), location: loc, overwrite: true }); if (r2.ok) r.set = r.set.concat(r2.set);
    }
    toast(r.set.length + ' set to ' + locLabel(loc)); S.sel.clear(); render(main, S.u);
  };
  main.querySelectorAll('.rvrow').forEach(row => row.onclick = () => { S.open = row.dataset.jo; S.conflicts = {}; draw(main); if (innerWidth < 900) scrollTo(0, 0); });
  // lazy thumbnails
  const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target);
    const [jo, fid] = (e.target.dataset.th || e.target.dataset.ph).split('|'); if (!fid) return;
    photo(jo, fid).then(src => { if (src) e.target.style.backgroundImage = `url("${src}")`; }); }), { rootMargin: '200px' });
  main.querySelectorAll('[data-th],[data-ph]').forEach(el => io.observe(el));
  const j = S.open && S.jobs.find(x => x.jo === S.open); if (!j) return;
  const st = { location: j.location, type: j.type, client_id: j.client_id, newClient: null };
  const filled = el => { const f = el.closest('.fsec'); if (f) { f.classList.remove('miss'); const fl = f.querySelector('.flag:not(.c)'); if (fl) fl.remove(); } };
  main.querySelectorAll('.rvp input, .rvp textarea').forEach(el => el.addEventListener('input', () => { if (el.value.trim() && !['fCq'].includes(el.id)) filled(el); }));
  const back = $('[data-back]'); if (back) back.onclick = () => { S.open = null; draw(main); };
  main.querySelectorAll('[data-big]').forEach(b => b.onclick = async () => {
    const big = main.querySelector('#rvBig'); big.innerHTML = '<span class="lab">Loading photo…</span>'; big.classList.remove('hidden');
    const src = await photo(j.jo, b.dataset.big, 'full'); big.innerHTML = src ? `<img src="${src}" alt=""><button class="pill sm rot">ROTATE</button>` : '<span class="lab">Photo not found</span>';
    let deg = 0; const rot = big.querySelector('.rot');
    if (rot) rot.onclick = e => { e.stopPropagation(); deg = (deg + 90) % 360; big.querySelector('img').style.transform = `rotate(${deg}deg)`; };
    big.onclick = () => big.classList.add('hidden');
  });
  main.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.location = b.dataset.loc; main.querySelectorAll('[data-loc]').forEach(x => x.classList.toggle('on', x === b)); filled(b); });
  main.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { st.type = st.type === b.dataset.type ? '' : b.dataset.type; main.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x.dataset.type === st.type)); if (st.type) filled(b); });
  const cc = $('[data-cclear]'); if (cc) cc.onclick = () => { $('.csel').classList.add('hidden'); $('.csearch').classList.remove('hidden'); $('#fCq').focus(); };
  let tq; $('#fCq').oninput = e => { clearTimeout(tq); const q = e.target.value; tq = setTimeout(async () => {
    const r = await call('jobClientSearch', { q }); if (!r.ok) return;
    $('#fCres').innerHTML = r.clients.map(c => `<button class="cr" data-cid="${esc(c.client_id)}" data-cn="${esc(c.name)}"><b>${esc(c.name)}</b>${c.phone ? ` <span class="muted">${esc(c.phone)}</span>` : ''}</button>`).join('') || (q.length > 1 ? '<span class="muted">No match. Add a new client below.</span>' : '');
    main.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => { st.client_id = b.dataset.cid; $('#fCq').value = b.dataset.cn; $('#fCres').innerHTML = `<span class="chip dark">Picked: ${esc(b.dataset.cn)}</span>`; filled(b.closest('.fsec') ? $('#fCq') : $('#fCq')); });
  }, 250); };
  const save = async mark => {
    const set = { location: st.location, type: st.type, client_id: st.client_id };
    ['due_date', 'metal', 'karat', 'size', 'description'].forEach(k => { set[k] = $('#f_' + k).value; });
    if ($('#f_status').value) set.status = $('#f_status').value;
    const seen = {}; Object.keys(set).forEach(k => { seen[k] = j[k] == null ? '' : j[k]; });
    const nn = $('#fNn').value.trim(), np = $('#fNp').value.trim();
    const body = { jo: j.jo, set, seen, mark_reviewed: mark };
    if (nn || np) { body.new_client = { name: nn, phone: np }; delete set.client_id; }
    const r = await call('jobReviewSave', body);
    if (!r.ok) {
      if (r.code === 'CONFLICT') { S.conflicts = {}; r.conflicts.forEach(c => { S.conflicts[c.field] = c.now; }); await render(main, S.u); toast(r.error); return; }
      return toast(r.error);
    }
    S.conflicts = {}; const idx = S.jobs.findIndex(x => x.jo === j.jo);
    toast(mark ? 'JO ' + j.jo + ' reviewed' : 'Saved');
    if (mark) { const nx = shown().filter(x => x.jo !== j.jo)[0]; S.open = nx ? nx.jo : null; } else S.jobs[idx] = r.job;
    render(main, S.u);
  };
  $('#fDone').onclick = () => save(true); $('#fSave').onclick = () => save(false);
  $('#fNext').onclick = () => { const L = shown(), i = L.findIndex(x => x.jo === j.jo); const nx = L[i + 1] || L[0]; if (nx) { S.open = nx.jo; S.conflicts = {}; draw(main); } };
}
window.OYPReview = { render };
})();
