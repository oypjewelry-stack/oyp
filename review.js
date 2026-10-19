/* OYP back office: "To review" (#/review). Draft JOs from card scans: photos beside a quick-edit form.
   Server (JobSync.gs) checks roles (admin + production manager), serves photos only through jobPhoto, and refuses
   to overwrite a field someone else changed since this form opened (CONFLICT). */
(() => {
'use strict';
const FIELDS = [['client', 'Client'], ['due_date', 'Due date'], ['type', 'Type'], ['metal', 'Metal'], ['karat', 'Karat'], ['description', 'Description']];
const KIND_EXTRA = { jewelry: ['size'] }; // shown, never flagged
const SPECIFIC = ['metal', 'karat', 'size', 'stone_type', 'stone_size', 'grade', 'material', 'weight_g'];
const TYPES = [['new', 'New job'], ['repair', 'Repair'], ['revision', 'Revision']];
const STATUS = [['', 'Automatic (from location)'], ['draft', 'Draft'], ['active', 'Active'], ['done', 'Done'], ['picked_up', 'Picked up'], ['cancelled', 'Cancelled']];
const photoCache = {};
// A JO opened from a dashboard list (dash.js) that is not a draft: shown in the same panel, fetched with dashDrill {what:'job'} (DashboardDrill.gs).
const cur = () => S.open ? (S.jobs.find(j => j.jo === S.open) || (S.ext && S.ext.jo === S.open ? S.ext : null)) : null;
let S = { steps: null, stepsState: 'old', ext: null, back: null, jobs: [], locations: [], filter: 'noloc', sel: new Set(), open: null, conflicts: {}, q: '', contact: null, cc: null, ccDraft: {} };
// Client phone/email live on the client linked to the JO (JobContact.gs). Before that paste, contactList is unknown and the section just explains.
const noContact = jo => !!(S.contact && S.contact[jo] && !S.contact[jo].has_contact && S.contact[jo].location !== 'archived');
const fmtPhone = v => { const t = String(v || '').trim(), d = t.replace(/\D/g, ''); let m = /^63\d{10}$/.test(d) ? d.slice(2) : /^0\d{10}$/.test(d) ? d.slice(1) : d;
  return /^9\d{9}$/.test(m) && !/^\+(?!63)/.test(t) ? '0' + m.slice(0, 3) + ' ' + m.slice(3, 6) + ' ' + m.slice(6) : t; };
const ccChip = jo => noContact(jo) ? '<span class="chip gold nocc" title="No mobile or email on file: the client can\'t use Track my order">No client contact</span>' : '';

// JO card scans are shown landscape. Older scans (uploaded before the scanner turned pages) are portrait: the card was
// shot on its side, usually 90° counter-clockwise, so a portrait page is turned 90° clockwise. If a page was shot the other
// way, ROTATE in the photo viewer turns it and this device remembers that turn for the page (thumbnails too).
// Display only: the Drive files are never changed. Only the JO card scan set (jobPhoto) passes through here.
const ROT_KEY = 'oypCardRot', rawCache = {};
const extraTurn = fid => { try { return (JSON.parse(localStorage.getItem(ROT_KEY) || '{}')[fid] || 0) % 360; } catch (_) { return 0; } };
function setExtraTurn(fid, deg) { try { const m = JSON.parse(localStorage.getItem(ROT_KEY) || '{}'); if (deg % 360) m[fid] = deg % 360; else delete m[fid]; localStorage.setItem(ROT_KEY, JSON.stringify(m)); } catch (_) {} }
function turn(src, extra) {
  if (!src) return Promise.resolve(src);
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const w = im.naturalWidth, h = im.naturalHeight, d = ((h > w ? 90 : 0) + extra) % 360; if (!d) return res(src);
      try { const c = document.createElement('canvas'), side = d % 180 !== 0; c.width = side ? h : w; c.height = side ? w : h;
        const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(d * Math.PI / 180); x.drawImage(im, -w / 2, -h / 2);
        res(c.toDataURL('image/jpeg', 0.9)); } catch (_) { res(src); }
    };
    im.onerror = () => res(src); im.src = src;
  });
}
function photo(jo, fid, size) {
  const r = fid + '|' + (size || 'thumb'), e = extraTurn(fid), k = r + '|' + e;
  if (!rawCache[r]) rawCache[r] = window.OYP.call('jobPhoto', { jo, file_id: fid, size }).then(x => (x && x.ok && x.src) || '');
  if (!photoCache[k]) photoCache[k] = rawCache[r].then(src => turn(src, e));
  return photoCache[k];
}
const locChip = j => { const { esc } = window.OYP;
  return j.location === 'archived' ? '<span class="chip arch" title="JO on record, no physical piece">Archived</span>'
    : j.location ? `<span class="chip dark">${esc(locLabel(j.location))}</span>` : '<span class="chip gold">Needs location</span>'; };
const locLabel = k => (S.locations.find(l => l[0] === k) || [k, k])[1];
const views = {
  noloc: ['Needs location', j => !j.location],
  details: ['Missing details', j => j.missing.some(m => m !== 'location')],
  nocontact: ['No client contact', j => noContact(j.jo)],
  all: ['All to review', () => true]
};

async function render(main, u) {
  const { call, esc } = window.OYP, live = window.OYP.here(); // live(): still on this route (app.js)
  main.innerHTML = '<h2>To review</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const [r, cc, ps] = await Promise.all([call('jobReviewList'), call('contactList'), call('portalSteps')]);
  if (!live()) return;
  // Steps the client sees on Track my order (Portal.gs). Before that paste the server doesn't know portalSteps: the section just explains.
  S.steps = ps && ps.ok && ps.portal ? ps : null; S.stepsState = S.steps ? 'on' : ps && ps.code === 'FORBIDDEN' ? 'forbidden' : 'old';
  S.cc = cc && cc.ok ? cc : null; S.contact = S.cc ? Object.fromEntries(cc.jobs.map(x => [x.jo, x])) : null;
  S.ccState = S.cc ? 'on' : cc && cc.code === 'FORBIDDEN' ? 'forbidden' : 'old';
  try { const f = sessionStorage.getItem('oypReviewFilter'); if (f) { sessionStorage.removeItem('oypReviewFilter'); if (views[f]) S.filter = f; } } catch (_) {}
  if (!S.cc && S.filter === 'nocontact') S.filter = 'noloc';
  if (!r || !r.ok) {
    main.innerHTML = `<h2>To review</h2><p class="muted">${esc(r && r.error === 'Unknown action' ? 'The server has not been updated for card reviews yet.' : (r && r.error) || 'Could not load')}</p>`; return;
  }
  S.jobs = r.jobs; S.locations = r.locations; S.itemTypes = r.item_types || []; S.canPhone = r.can_see_phone; S.u = u;
  let ask = null; try { const o = sessionStorage.getItem('oypReviewOpen'); if (o) { sessionStorage.removeItem('oypReviewOpen'); ask = JSON.parse(o); } } catch (_) {}
  if (ask && ask.jo) { S.open = ask.jo; S.back = ask.back ? { hash: ask.back, label: ask.label || 'Back' } : null; S.ext = { jo: ask.jo, stub: true, row: ask.row || {} }; S.conflicts = {}; }
  if (S.ext && S.ext.jo === S.open && !S.jobs.some(j => j.jo === S.open)) { // not a draft: fetch the full JO (needs DashboardDrill.gs)
    const g = await call('dashDrill', { what: 'job', jo: S.open }); if (!live()) return;
    if (g && g.ok && g.job) S.ext = g.job; else if (!S.ext.stub) S.ext = { jo: S.open, stub: true, row: S.ext, err: g && g.error }; else S.ext.err = g && g.error;
  } else if (S.ext && S.jobs.some(j => j.jo === S.ext.jo)) S.ext = null; // it is a draft: the normal card
  if (S.open && !cur()) S.open = null;
  if (!S.open && innerWidth >= 900) { const f = shown()[0]; if (f) S.open = f.jo; } // desktop: show the first card right away
  draw(main);
}

function otherHits() {
  const { esc } = window.OYP, f = S.found;
  if (!f || f.q !== S.q.trim().toUpperCase().replace(/\s+/g, ' ') || S.q.trim().length < 2) return '';
  const inList = new Set(S.jobs.map(j => j.jo)), L = f.jobs.filter(j => !inList.has(j.jo));
  return `<div class="rvother"><div class="dtitle"><span class="lab">Other JOs matching “${esc(S.q.trim())}”</span><span class="lab">${L.length}${f.total > 50 ? ' of ' + f.total : ''}</span></div>${L.map(j => `
    <div class="rvrow oth"><span></span><span></span><div class="rvi"><div class="kjo">${esc(j.jo)}${j.parent_jo ? `<span class="muted sm">of ${esc(j.parent_jo)}</span>` : ''}${j.version ? `<span class="muted sm">Version ${esc(j.version)}</span>` : ''}</div>
      <div class="kd">${esc(j.description || (j.client ? j.client.name : '') || 'No details')}${j.description && j.client ? ' · ' + esc(j.client.name) : ''}</div>
      <div class="kf">${locChip(j)}${j.review_state === 'reviewed' ? '<span class="chip">Reviewed</span>' : ''}${ccChip(j.jo)}</div></div></div>`).join('') || '<p class="muted rvnone">No other JOs.</p>'}</div>`;
}
function searchAll(main) {
  clearTimeout(searchAll.t); const q = S.q.trim();
  if (q.length < 2) { S.found = null; return; }
  const live = window.OYP.here();
  searchAll.t = setTimeout(async () => {
    const r = await window.OYP.call('jobSearch', { q });
    if (live() && r && r.ok && S.q.trim() === q) { S.found = r; const a = document.activeElement, pos = a && a.id === 'rvQ' ? a.selectionStart : null; draw(main);
      if (pos != null) { const el = main.querySelector('#rvQ'); el.focus(); el.setSelectionRange(pos, pos); } }
  }, 350);
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
    ${S.cc && S.cc.missing ? `<p class="ccsum"><span class="chip gold">${S.cc.missing}</span> of ${S.cc.total} JOs (all, not only these) have no client mobile or email, so those clients can't track their order.</p>` : ''}
    <div class="rvchips">${Object.keys(views).filter(k => k !== 'nocontact' || S.contact).map(k => `<button class="fchip ${S.filter === k ? 'on' : ''}" data-f="${k}">${esc(views[k][0])} <b>${count(k)}</b></button>`).join('')}</div>
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
        <div class="rvi"><div class="kjo">${esc(j.jo)}${j.parent_jo ? `<span class="muted sm">of ${esc(j.parent_jo)}</span>` : ''}${j.version ? `<span class="muted sm">Version ${esc(j.version)}</span>` : ''}</div>
          <div class="kd">${esc(j.description || (j.client ? j.client.name : '') || 'No details yet')}</div>
          <div class="kf">${locChip(j)}
          ${j.missing.filter(m => m !== 'location').length ? `<span class="chip">${j.missing.filter(m => m !== 'location').length} missing</span>` : '<span class="chip">Details ✓</span>'}
          <span class="chip">${j.pages.length} pg</span>${ccChip(j.jo)}</div></div>
      </div>`).join('') || `<p class="muted rvnone">${S.jobs.length ? 'Nothing in this view.' : 'Nothing to review. New scans show up here.'}</p>`}</div>
    ${otherHits()}
  </div>
  <div class="rvpanel" id="rvPanel">${S.open ? panel(cur()) : '<div class="rvempty"><span class="lab">Pick a card on the left</span></div>'}</div>
  </div><div id="rvBig" class="rvbig hidden"></div>`;
  wire(main);
}

function backBtn() { return S.back ? '<button class="lnk rvback dback" data-dback>‹ BACK</button>' : '<button class="lnk rvback" data-back>‹ BACK</button>'; } // same target as before (drill list / all cards), one label everywhere
function stubPanel(j) { // pre-paste: what the dashboard knew, read-only
  const { esc } = window.OYP, r = j.row || {};
  return `<div class="rvp">${backBtn()}<div class="dhead"><h2>JO ${esc(j.jo)}${j.version ? ` <span class="chip big">Version ${esc(j.version)}</span>` : ''}</h2><span class="lab">From the dashboard</span></div>
    <p class="kd">${esc(r.description || 'No details')}${r.client ? ' · ' + esc(r.client) : ''}</p>
    <div class="kf">${r.location ? `<span class="chip dark">${esc(locLabel(r.location))}</span>` : ''}${r.stage_label ? `<span class="chip">${esc(r.stage_label)}</span>` : ''}${r.due ? `<span class="chip ${r.late ? 'gold' : ''}">${r.late ? 'Late · ' : 'Due '}${esc(r.due)}</span>` : ''}</div>
    <p class="muted fnote">${esc(j.err === 'Unknown action' || !j.err ? 'The full JO (photos and editing) opens here once DashboardDrill is pasted in Apps Script.' : j.err)}</p></div>`;
}
function panel(j) {
  if (j.stub) return stubPanel(j);
  const ext = S.ext && S.ext.jo === j.jo;
  const { esc } = window.OYP, miss = k => j.missing.includes(k), cf = S.conflicts;
  const flag = k => (cf[k] ? `<span class="flag c">Changed by someone: now “${esc(cf[k])}”</span>` : miss(k) ? '<span class="flag">Missing</span>' : '');
  const fcls = k => (cf[k] ? 'conf' : miss(k) ? 'miss' : '');
  const fld = (k, lab, input) => `<div class="fsec ${fcls(k)}" data-f1="${k}"><div class="flab"><span class="lab">${esc(lab)}</span>${cf[k] ? flag(k) : ''}</div>${input}</div>`;
  return `<div class="rvp">
    ${backBtn()}
    <div class="dhead"><h2>JO ${esc(j.jo)}${j.version ? ` <span class="chip big" title="Latest version of this JO${(j.versions || []).length > 1 ? ' (' + esc(j.versions.join(', ')) + ')' : ''}">Version ${esc(j.version)}</span>` : ''}${j.location === 'archived' ? ' <span class="chip arch big" title="JO on record, no physical piece">Archived</span>' : ''}</h2><span class="lab">${j.type === 'revision' && j.parent_jo ? 'Revision of ' + esc(j.parent_jo) : j.pages.length + ' page' + (j.pages.length === 1 ? '' : 's')}</span></div>
    ${shotsHtml(j)}
    <div class="fsec ${fcls('location')}"><div class="flab"><span class="lab">Where is it now?</span>${flag('location')}</div>${j.location === 'archived' ? '<p class="muted fnote archnote">Archived: the JO stays on record and searchable, but there is no piece. Not counted as stock, not on the job board.</p>' : ''}
      <div class="locs">${S.locations.map(l => `<button class="loc ${j.location === l[0] ? 'on' : ''}" data-loc="${l[0]}">${esc(l[1])}</button>`).join('')}</div></div>
    <div class="fsec ${fcls('item_type')}" id="kindPick"><div class="flab"><span class="lab">What is it?</span>${flag('item_type')}</div>
      <div class="kinds">${S.itemTypes.map(t => `<button class="loc ${j.item_type === t[0] ? 'on' : ''}" data-kind="${esc(t[0])}">${esc(t[1])}</button>`).join('')}</div></div>
    <div class="fgrid">
      <div class="fsec full ${fcls('client') || fcls('client_id')}"><div class="flab"><span class="lab">Client</span>${flag('client') || flag('client_id')}</div>
        <div id="fClient" class="cpick">${j.client ? `<div class="csel"><b>${esc(j.client.name)}</b>${j.client.phone ? ` <span class="muted">${esc(j.client.phone)}</span>` : ''}<button class="lnk" data-cclear>Change</button></div>` : ''}
        <div class="csearch ${j.client ? 'hidden' : ''}"><input id="fCq" placeholder="Search a client by name${S.canPhone ? ' or phone' : ''}" autocomplete="off"><div id="fCres" class="cres"></div>
          <div class="cnew"><span class="lab">or add a new client</span><div class="row2 ${S.cc ? 'one' : ''}"><input id="fNn" placeholder="Name">${S.cc ? '' : '<input id="fNp" placeholder="Phone" inputmode="tel">'}</div>${S.cc ? '<span class="muted sm">Type their mobile or email under Client contact.</span>' : ''}</div></div></div></div>
      ${contactSec(j)}
      <div class="fsec ${fcls('due_date')}"><div class="flab"><span class="lab">Due date</span>${flag('due_date')}</div><input type="date" id="f_due_date" value="${esc(j.due_date)}"></div>
      <div class="fsec ${fcls('type')}"><div class="flab"><span class="lab">Type</span>${flag('type')}</div><div class="seg">${TYPES.map(t => `<button class="${j.type === t[0] ? 'on' : ''}" data-type="${t[0]}">${esc(t[1])}</button>`).join('')}</div></div>
      <div class="fsec full kindsec" data-for="metal,karat,size,stone_type,stone_size,grade,material,weight_g"><div class="kindgrid">
        ${fld('metal', 'Metal', `<input id="f_metal" list="dlMetal" value="${esc(j.metal)}" placeholder="Gold, Silver…">`)}
        ${fld('karat', 'Karat', `<input id="f_karat" list="dlKarat" value="${esc(j.karat)}" placeholder="18k, 925…">`)}
        ${fld('size', 'Ring size / length', `<input id="f_size" value="${esc(j.size)}" placeholder="optional">`)}
        ${fld('stone_type', 'Stone type', `<input id="f_stone_type" list="dlStone" value="${esc(j.stone_type)}" placeholder="Diamond, South Sea…">`)}
        ${fld('stone_size', 'Carat / size', `<input id="f_stone_size" value="${esc(j.stone_size)}" placeholder="0.50 ct, 11 mm">`)}
        ${fld('grade', 'Grade', `<input id="f_grade" value="${esc(j.grade)}" placeholder="VS1 G, AAA…">`)}
        ${fld('material', 'Material', `<input id="f_material" list="dlMat" value="${esc(j.material)}" placeholder="Gold scrap, silver grain…">`)}
        ${fld('weight_g', 'Weight (g)', `<input id="f_weight_g" inputmode="decimal" value="${esc(j.weight_g)}" placeholder="12.5">`)}
      </div></div>
      <div class="fsec ${fcls('status')}"><div class="flab"><span class="lab">Status</span>${flag('status')}</div><select id="f_status">${STATUS.map(s => `<option value="${s[0]}">${esc(s[1])}${s[0] && s[0] === j.status ? ' · now' : ''}</option>`).join('')}</select></div>
      <div class="fsec full ${fcls('description')}"><div class="flab"><span class="lab">Description</span>${flag('description')}</div><textarea id="f_description" rows="2" placeholder="e.g. Coin necklace, 13 coins">${esc(j.description)}</textarea></div>
    </div>
    ${stepsSec(j)}
    <datalist id="dlStone"><option>Diamond</option><option>Ruby</option><option>Sapphire</option><option>Emerald</option><option>South Sea pearl</option><option>Freshwater pearl</option><option>Akoya pearl</option><option>Other</option></datalist>
    <datalist id="dlMat"><option>Gold scrap</option><option>Gold grain</option><option>Silver scrap</option><option>Silver grain</option><option>Platinum</option><option>Findings</option><option>Chain</option></datalist>
    <datalist id="dlMetal"><option>Gold</option><option>Silver</option><option>Platinum</option><option>Palladium</option><option>Two-tone</option><option>Other</option></datalist>
    <datalist id="dlKarat"><option>24k</option><option>22k</option><option>18k</option><option>14k</option><option>10k</option><option>925</option><option>999</option></datalist>
    <div id="rvCost"></div>
    <div class="fbtns">${ext && j.review_state !== 'draft' ? '' : '<button class="pill" id="fDone">SAVE &amp; MARK REVIEWED</button>'}<button class="pill outline" id="fSave">SAVE</button>${ext ? '' : '<button class="lnk" id="fNext">Next card ›</button>'}</div>
    <p class="muted fnote">${j.scanned_at ? 'Scanned ' + esc(new Date(j.scanned_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })) + ' PHT · ' : ''}Saving never replaces something another person changed in the meantime.</p>
  </div>`;
}

// Card scans: the newest scan set is always shown first; every earlier set (rescans keep the old photos, JobSync.gs) sits under a
// collapsed History, newest first. Old files without a date tag are the oldest set ("Earlier scan").
const ORD = ['', '', '2nd', '3rd'];
function setLabel(x) {
  if (!x) return '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? new Date(x.date + 'T12:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }) : '';
  const k = x.set && x.set.length > 6 ? x.set.charCodeAt(6) - 96 : 1, nth = k > 1 ? ' · ' + (ORD[k] || k + 'th') + ' scan that day' : '';
  const v = x.version ? 'Version ' + x.version + ' · ' : ''; // JO letter: 26-287B = version B of JO 26-287 (B newest)
  return v + (x.set ? d : 'Earlier scan' + (d ? ' · ' + d : '')) + nth;
}
function shotsHtml(j) {
  const { esc } = window.OYP, H = j.history || [];
  const row = (jo, pages) => `<div class="shots">${pages.map(p => `<button class="shot" data-big="${esc(p.file_id)}"><span class="ph" data-ph="${esc(jo)}|${esc(p.file_id)}"></span><span class="lab">Page ${p.page}</span></button>`).join('') || '<span class="muted">No photos</span>'}</div>`;
  const latest = setLabel({ set: j.pages_set || '', date: j.pages_date, version: j.pages_version || '' });
  if (!H.length) return (j.pages_version ? `<div class="shlab"><span class="lab">${esc(latest)}</span></div>` : '') + row(j.jo, j.pages);
  return `<div class="shlab"><span class="chip dark">Latest</span><span class="lab">${esc(latest || 'Latest scan')}</span></div>${row(j.jo, j.pages)}
    <details class="shist"><summary><span class="lab">History · ${H.length} older scan${H.length === 1 ? '' : 's'}</span></summary>
      ${H.map(x => `<div class="hset"><div class="lab sm">${esc(setLabel(x))} · ${x.n || x.pages.length} page${(x.n || x.pages.length) === 1 ? '' : 's'}</div>${row(j.jo, x.pages)}</div>`).join('')}</details>`;
}

// Steps the client sees on Track my order: saved per JO (JobOrders.client_steps). Not saved yet = the default for the JO type
// (Repair: Received, Stone setting, Polishing, Quality check, Ready for pickup; everything else: all 7). Received + Ready for pickup always on.
const savedSteps = jo => (S.steps && S.steps.steps[jo]) || '';
const defSteps = type => S.steps ? (type === 'repair' ? S.steps.defaults.repair : S.steps.defaults.new).slice() : [];
function stepsSec(j) {
  const { esc } = window.OYP;
  if (S.stepsState === 'forbidden') return '';
  const head = '<div class="flab"><span class="lab">Steps the client sees</span></div>';
  if (!S.steps) return `<div class="fsec full stepsec">${head}<p class="muted fnote">Pick which steps clients see on Track my order once the Portal update is pasted in Apps Script.</p></div>`;
  return `<div class="fsec full stepsec">${head}<div class="locs" id="fSteps"></div>
    <p class="muted fnote" id="fStepsNote"></p></div>`;
}
function contactSec(j) {
  const { esc } = window.OYP, cf = S.conflicts, d = S.ccDraft[j.jo] || {};
  if (S.ccState === 'forbidden') return '';
  const head = (extra = '') => `<div class="flab"><span class="lab">Client contact</span>${extra}</div>`;
  if (!S.cc) return `<div class="fsec full ccsec">${head()}<p class="muted fnote">Client mobile and email fields turn on after the JobContact update in Apps Script.</p></div>`;
  const c = S.contact[j.jo] || { has_contact: false }, admin = S.cc.can_see_contact, miss = noContact(j.jo);
  const flag = cf.phone || cf.email ? `<span class="flag c">Changed by someone${cf.phone && admin ? ': mobile now “' + esc(cf.phone) + '”' : ''}${cf.email && admin ? ': email now “' + esc(cf.email) + '”' : ''}</span>` : miss ? '<span class="flag">No client contact</span>' : '';
  const inp = (k, lab, type, ph, cur, onFile) => !admin && onFile ? `<div><span class="lab sm">${lab}</span><div class="onfile">On file ✓</div></div>`
    : `<label><span class="lab sm">${lab}</span><input id="fc_${k}" type="${type}" ${k === 'phone' ? 'inputmode="tel" autocomplete="tel"' : 'autocomplete="email"'} placeholder="${ph}" value="${esc(d[k] != null ? d[k] : cur || '')}"></label>`;
  return `<div class="fsec full ccsec ${cf.phone || cf.email ? 'conf' : miss ? 'miss' : ''}">${head(flag)}
    <div class="row2 cc2">${inp('phone', 'Client mobile', 'tel', '0917 123 4567', c.phone, c.phone_on_file)}${inp('email', 'Client email', 'email', 'name@email.com', c.email, c.email_on_file)}</div>
    <p class="muted fnote">${c.via_portal && !c.phone_on_file && !c.email_on_file ? 'Has a customer account linked, so they can track it. ' : ''}Saved on the client${c.client_name ? ' (' + esc(c.client_name) + ')' : ''}. The client types this mobile or email with the JO number to track their order.${!admin && (c.phone_on_file || c.email_on_file) ? ' Only an admin can change a saved one.' : ''}${!c.client_linked ? ' No client yet: if nobody has this number, type their name under Client.' : ''}</p></div>`;
}

// Locked cost (Prices.gs priceJobCost): fetched per JO; hidden for roles without access or before that paste.
const costCache = {};
function costBox(main, jo) {
  if (!window.OYPPrices || !window.OYPPrices.lockedHtml) return;
  if (!costCache[jo]) costCache[jo] = window.OYP.call('priceJobCost', { jo });
  const live = window.OYP.here(); // route token: never draw into a page the user left
  costCache[jo].then(r => { const el = main.querySelector('#rvCost'); if (!live() || !el || S.open !== jo) return;
    el.innerHTML = r && r.ok ? window.OYPPrices.lockedHtml(r, { exec: r.exec }) : ''; });
}
function wire(main) {
  const { call, esc, toast } = window.OYP, $ = s => main.querySelector(s), live = window.OYP.here();
  const rerender = async () => { if (live()) await render(main, S.u); }; // after a save: redraw only if the user is still here
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; draw(main); });
  $('#rvQ').oninput = e => { S.q = e.target.value; searchAll(main); const pos = e.target.selectionStart; draw(main); const q = main.querySelector('#rvQ'); q.focus(); q.setSelectionRange(pos, pos); };
  main.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? S.sel.add(c.dataset.sel) : S.sel.delete(c.dataset.sel); draw(main); });
  $('#rvAll').onchange = e => { shown().forEach(j => e.target.checked ? S.sel.add(j.jo) : S.sel.delete(j.jo)); draw(main); };
  $('#rvBulk').onclick = async () => {
    const loc = $('#rvBulkLoc').value; if (!loc) return toast('Pick a location first');
    const jos = [...S.sel]; let r = await call('jobBulkLocation', { jos, location: loc });
    if (!r.ok) return toast(r.error);
    if (r.kept.length && confirm(r.kept.length + ' of these already have another location (' + r.kept.slice(0, 5).map(k => k.jo + ': ' + locLabel(k.location)).join(', ') + (r.kept.length > 5 ? '…' : '') + '). Change them to ' + locLabel(loc) + ' too?')) {
      const r2 = await call('jobBulkLocation', { jos: r.kept.map(k => k.jo), location: loc, overwrite: true }); if (r2.ok) r.set = r.set.concat(r2.set);
    }
    toast(r.set.length + ' set to ' + locLabel(loc)); S.sel.clear(); rerender();
  };
  main.querySelectorAll('.rvrow').forEach(row => row.onclick = () => { if (!row.dataset.jo) return; S.back = null; S.open = row.dataset.jo; S.conflicts = {}; draw(main); if (innerWidth < 900) scrollTo(0, 0); });
  // lazy thumbnails
  const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target);
    const [jo, fid] = (e.target.dataset.th || e.target.dataset.ph).split('|'); if (!fid) return;
    photo(jo, fid).then(src => { if (src) e.target.style.backgroundImage = `url("${src}")`; }); }), { rootMargin: '200px' });
  main.querySelectorAll('[data-th],[data-ph]').forEach(el => io.observe(el));
  const db = $('[data-dback]'); if (db) db.onclick = () => { const h = S.back.hash; S.back = null; S.ext = null; S.open = null; location.hash = h; };
  const j = cur(); if (!j || j.stub) return;
  costBox(main, j.jo);
  const isExt = S.ext && S.ext.jo === j.jo;
  const st = { location: j.location, type: j.type, client_id: j.client_id, item_type: j.item_type, newClient: null };
  const saved0 = savedSteps(j.jo); st.steps = saved0 ? saved0.split(',') : defSteps(j.type); st.stepsTouched = false;
  const drawSteps = () => { const box = $('#fSteps'); if (!box) return; const { esc } = window.OYP;
    box.innerHTML = S.steps.all.map(([k, l]) => { const lock = S.steps.always.includes(k), on = lock || st.steps.includes(k);
      return `<button type="button" class="loc ${on ? 'on' : ''}" data-step="${esc(k)}" ${lock ? 'disabled title="Always shown"' : ''} aria-pressed="${on}">${on ? '✓ ' : ''}${esc(l)}</button>`; }).join('');
    $('#fStepsNote').textContent = (saved0 || st.stepsTouched ? '' : (st.type === 'repair' ? 'Repair default. ' : 'New piece default: all steps. ')) + 'Tap a step to show or hide it on Track my order. Received and Ready for pickup are always shown.';
    box.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const k = b.dataset.step; st.stepsTouched = true;
      st.steps = st.steps.includes(k) ? st.steps.filter(x => x !== k) : st.steps.concat(k); drawSteps(); }); };
  if (S.steps) drawSteps();
  const kindFields = k => { const t = S.itemTypes.find(x => x[0] === k); return t ? t[2].concat(KIND_EXTRA[k] || []) : []; };
  const flagged = k => { const t = S.itemTypes.find(x => x[0] === st.item_type); return !!t && t[2].includes(k); };
  const applyKind = () => {
    const show = kindFields(st.item_type);
    main.querySelectorAll('[data-f1]').forEach(el => {
      const k = el.dataset.f1, on = show.includes(k); el.classList.toggle('hidden', !on);
      const empty = !main.querySelector('#f_' + k).value.trim(), fl = el.querySelector('.flag:not(.c)');
      const want = on && flagged(k) && empty && !S.conflicts[k];
      el.classList.toggle('miss', want);
      if (want && !fl) el.querySelector('.flab').insertAdjacentHTML('beforeend', '<span class="flag">Missing</span>'); else if (!want && fl) fl.remove();
    });
    const ks = main.querySelector('.kindsec'); if (ks) ks.classList.toggle('hidden', !show.length);
  };
  applyKind();
  main.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { st.item_type = b.dataset.kind; main.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('on', x === b)); filled(b); applyKind(); });
  const filled = el => { const f = el.closest('.fsec'); if (f) { f.classList.remove('miss'); const fl = f.querySelector('.flag:not(.c)'); if (fl) fl.remove(); } };
  main.querySelectorAll('.rvp input, .rvp textarea').forEach(el => el.addEventListener('input', () => { if (el.value.trim() && !['fCq'].includes(el.id)) filled(el); }));
  const back = $('[data-back]'); if (back) back.onclick = () => { S.open = null; draw(main); };
  main.querySelectorAll('[data-big]').forEach(b => b.onclick = async () => {
    const big = main.querySelector('#rvBig'); big.innerHTML = '<span class="lab">Loading photo…</span>'; big.classList.remove('hidden');
    const fid = b.dataset.big, src = await photo(j.jo, fid, 'full'); big.innerHTML = src ? `<img src="${src}" alt=""><button class="pill sm rot">ROTATE</button>` : '<span class="lab">Photo not found</span>';
    let turned = false; const rot = big.querySelector('.rot');
    if (rot) rot.onclick = async e => { e.stopPropagation(); setExtraTurn(fid, extraTurn(fid) + 90); turned = true; // remembered on this device
      const s2 = await photo(j.jo, fid, 'full'), im = big.querySelector('img'); if (im && s2) im.src = s2; };
    big.onclick = () => { big.classList.add('hidden'); if (turned) { const ph = main.querySelector(`.shot [data-ph$="|${CSS.escape(fid)}"]`), th = document.querySelector(`.rvrow [data-th$="|${CSS.escape(fid)}"]`);
      [ph, th].forEach(el => el && photo(j.jo, fid).then(s3 => { if (s3) el.style.backgroundImage = `url("${s3}")`; })); } };
  });
  main.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => { st.location = b.dataset.loc; main.querySelectorAll('[data-loc]').forEach(x => x.classList.toggle('on', x === b)); filled(b); });
  main.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { st.type = st.type === b.dataset.type ? '' : b.dataset.type; main.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x.dataset.type === st.type)); if (st.type) filled(b);
    if (S.steps && !saved0 && !st.stepsTouched) { st.steps = defSteps(st.type); drawSteps(); } }); // not saved yet: the default follows the type
  const cc = $('[data-cclear]'); if (cc) cc.onclick = () => { $('.csel').classList.add('hidden'); $('.csearch').classList.remove('hidden'); $('#fCq').focus(); };
  let tq; $('#fCq').oninput = e => { clearTimeout(tq); const q = e.target.value; tq = setTimeout(async () => {
    const r = await call('jobClientSearch', { q }); if (!r.ok) return;
    $('#fCres').innerHTML = r.clients.map(c => `<button class="cr" data-cid="${esc(c.client_id)}" data-cn="${esc(c.name)}"><b>${esc(c.name)}</b>${c.phone ? ` <span class="muted">${esc(c.phone)}</span>` : ''}</button>`).join('') || (q.length > 1 ? '<span class="muted">No match. Add a new client below.</span>' : '');
    main.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => { st.client_id = b.dataset.cid; $('#fCq').value = b.dataset.cn; $('#fCres').innerHTML = `<span class="chip dark">Picked: ${esc(b.dataset.cn)}</span>`; filled(b.closest('.fsec') ? $('#fCq') : $('#fCq')); });
  }, 250); };
  const fcp = $('#fc_phone'); if (fcp) fcp.addEventListener('blur', () => { fcp.value = fmtPhone(fcp.value); });
  const save = async mark => {
    const set = { location: st.location, item_type: st.item_type, type: st.type, client_id: st.client_id };
    ['due_date', 'description'].concat(kindFields(st.item_type)).forEach(k => { set[k] = $('#f_' + k).value; }); // hidden fields are left as they are
    if ($('#f_status').value) set.status = $('#f_status').value;
    const seen = {}; Object.keys(set).forEach(k => { seen[k] = j[k] == null ? '' : j[k]; });
    const nn = $('#fNn').value.trim(), np = $('#fNp') ? $('#fNp').value.trim() : '';
    const body = { jo: j.jo, set, seen, mark_reviewed: mark };
    // contact typed? (only what changed from what the card showed)
    const c0 = (S.contact && S.contact[j.jo]) || {}, cc = {};
    [['phone', '#fc_phone'], ['email', '#fc_email']].forEach(([k, id]) => { const el = $(id); if (el && el.value.trim() !== String(c0[k] || '').trim()) cc[k] = k === 'phone' ? fmtPhone(el.value) : el.value.trim(); });
    const ccOn = Object.keys(cc).length > 0, picked = !!st.client_id && st.client_id !== j.client_id;
    const newClient = !!(nn || np) && !(ccOn && !j.client_id && !picked); // with a contact typed on a JO with no client, JobContact matches or adds the client
    const ccFirst = ccOn && !picked && !newClient; // same client: save the contact first, so a problem there saves nothing
    if (newClient) { body.new_client = { name: nn, phone: np }; delete set.client_id; }
    if (ccOn) S.ccDraft[j.jo] = Object.assign({}, cc);
    const ccFail = async (cr, saved) => {
      if (cr.code === 'CONFLICT') { S.conflicts = {}; (cr.conflicts || []).forEach(c => { S.conflicts[c.field] = c.now; }); }
      S.open = j.jo; toast((saved ? 'Card saved, but the contact was not: ' : '') + cr.error); await rerender();
      if (cr.code === 'NEED_NAME') { const n = main.querySelector('#fNn'), cs = main.querySelector('.csearch'); if (cs) cs.classList.remove('hidden'); if (n) n.focus(); }
    };
    const saveCC = cid => call('contactSave', Object.assign({ jo: j.jo, client_name: nn, seen: { client_id: cid, phone: c0.phone || '', email: c0.email || '' } }, cc));
    if (ccFirst) {
      const cr = await saveCC(j.client_id || ''); if (!cr.ok) return ccFail(cr, false);
      delete S.ccDraft[j.jo]; delete set.client_id; if (cr.contact) S.contact[j.jo] = cr.contact;
    }
    const later = ccOn && !ccFirst; if (later) body.mark_reviewed = false; // mark reviewed only once the contact is saved too
    let r = await call('jobReviewSave', body);
    if (!r.ok) {
      if (r.code === 'CONFLICT') { S.conflicts = {}; r.conflicts.forEach(c => { S.conflicts[c.field] = c.now; }); await rerender(); toast(r.error); return; }
      return toast(r.error);
    }
    if (later) {
      const cr = await saveCC((r.job && r.job.client_id) || ''); if (!cr.ok) return ccFail(cr, true);
      delete S.ccDraft[j.jo];
      if (mark) { const r2 = await call('jobReviewSave', { jo: j.jo, set: {}, seen: {}, mark_reviewed: true }); if (r2.ok) r = r2; else return toast(r2.error); }
    }
    if (S.steps) { // the client steps (Portal.gs), only when they differ from what is saved
      const order = S.steps.all.map(x => x[0]), want = order.filter(k => S.steps.always.includes(k) || st.steps.includes(k)).join(',');
      if (want !== saved0) {
        const sr = await call('portalStepsSave', { jo: j.jo, steps: want.split(','), seen: saved0 });
        if (sr && sr.ok) S.steps.steps[j.jo] = sr.steps; else { toast('Card saved, but the client steps were not: ' + ((sr && sr.error) || 'try again')); S.open = j.jo; await rerender(); return; }
      }
    }
    S.conflicts = {}; const idx = S.jobs.findIndex(x => x.jo === j.jo);
    toast(mark ? 'JO ' + j.jo + ' reviewed' : 'Saved');
    if (isExt) S.ext = r.job; // opened from the dashboard: stay on it
    else if (mark) { const nx = shown().filter(x => x.jo !== j.jo)[0]; S.open = nx ? nx.jo : null; } else S.jobs[idx] = r.job;
    rerender();
  };
  if ($('#fDone')) $('#fDone').onclick = () => save(true); $('#fSave').onclick = () => save(false);
  if ($('#fNext')) $('#fNext').onclick = () => { const L = shown(), i = L.findIndex(x => x.jo === j.jo); const nx = L[i + 1] || L[0]; if (nx) { S.open = nx.jo; S.conflicts = {}; draw(main); } };
}
window.OYPReview = { render: (main, u) => { Object.keys(costCache).forEach(k => delete costCache[k]); S.back = null; S.ext = null; return render(main, u); } }; // a fresh visit forgets a dashboard JO (dash.js hands one over via sessionStorage)
})();
