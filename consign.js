/* OYP back office: Consignment (#/consignment). Pieces lent to someone outside the shop.
   Admin and production manager. Agreed value, owed, paid, and balance are executive-only (the server omits them for everyone else).
   A sold piece is owed by the consignee. Record payment stores paid_amount and paid_at on the line (Consignment.gs consignPay).
   Server: Consignment.gs (consignList, consignSearch, consignSave, consignItem, consigneeSave, consignPay). Run setupConsignment once. */
(() => {
'use strict';
const PASTE_NOTE = 'This page needs the Consignment paste in Apps Script (see the instructions).';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = n => '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return MON[m - 1] + ' ' + dd + (y && y !== new Date().getFullYear() ? ', ' + y : ''); };
const dayLong = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return MON[m - 1] + ' ' + dd + ', ' + y; };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const addD = (day0, n) => { const d = new Date(String(day0).slice(0, 10) + 'T00:00:00Z'); if (isNaN(d.getTime())) return ''; d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// JO on a tag or typed by hand: 26-001, JO 26-001, 26 001, 26-287B. The letter is the version and stays with the number.
function joParse(s) {
  const m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})(?:\s*([A-Z])(?![A-Z0-9]))?/);
  if (!m) return null;
  return { key: m[1] + '-' + m[2], version: m[3] || '', text: m[1] + '-' + m[2] + (m[3] || '') };
}
const joOf = s => { const p = joParse(s); return p ? p.text : ''; };
function scanSpec(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return { q: '', jo: null, exact: false };
  const p = joParse(s);
  if (!p) return { q: s, jo: null, exact: !/\s/.test(s) };
  const compact = s.toUpperCase().replace(/^JO/, '').replace(/[\s\-.,\/]/g, '');
  const expect = p.key.replace('-', '') + p.version;
  if (compact === expect) return { q: p.text, jo: p, exact: true };
  return { q: s, jo: p, exact: false };
}
function samePiece(a, b) {
  const ak = joParse(a && a.jo), bk = joParse(b && b.jo);
  if (ak && bk && ak.key === bk.key) return true;
  const ai = String(a && a.item_id || '').toLowerCase(), bi = String(b && b.item_id || '').toLowerCase();
  return !!(ai && bi && ai === bi && !ak && !bk);
}
const $ = id => document.getElementById(id);
const S = { r: null, mode: 'list', tab: 'sheets', id: '', showClosed: false, draft: null, q: '', hits: [], scan: null, edit: '', pay: null, busy: false, stream: null, raf: 0, markAs: 'returned', note: null };
const scanQueue = [];
let scanBusy = false, qTimer = 0;
let camGen = 0, U = null;

function prices() { return !!(S.r && S.r.prices); }
function moneyBits(o) {
  if (!prices() || !o || o.sold == null) return '';
  return 'Sold ' + o.sold + ' · owed ' + peso(o.owed) + ' · paid ' + peso(o.paid) + ' · balance ' + peso(o.balance);
}
function itemMoney(it) {
  if (!prices() || !it || it.status !== 'sold') return '';
  if (it.owed == null || it.owed === '') return 'Sold · no agreed value yet';
  return 'owed ' + peso(it.owed) + ' · paid ' + peso(it.paid) + ' · balance ' + peso(it.balance);
}
function stillOwes(it) {
  if (!prices() || !it || it.status !== 'sold') return false;
  if (it.owed == null || it.owed === '') return false;
  return Number(it.balance) > 0.009;
}
function sheetBy(id) { return (S.r.sheets || []).find(s => s.consignment_id === id) || null; }
function dueHint() {
  const n = (S.r && S.r.overdue_days) || 30, t = S.r && S.r.today;
  return t ? dayLong(addD(t, n)) + ' (' + n + ' days)' : n + ' days';
}
function blankDraft(items) {
  return { consignee_id: '', name: '', phone: '', notes: '', due: '', sheetNotes: '', items: items || [] };
}
function stopCam() {
  camGen++;
  if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
  if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
}
function logoSrc() {
  const img = document.querySelector('header .logo');
  return (img && img.getAttribute('src')) || '../logo.png';
}

async function render(main, u) {
  const { esc } = window.OYP, live = window.OYP.here();
  U = u;
  document.documentElement.classList.remove('cs-onprint');
  if (!S.r) main.innerHTML = '<h2>Consignment</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const r = await window.OYP.call('consignList');
  if (!live()) return;
  if (!r || !r.ok) {
    main.innerHTML = `<h2>Consignment</h2><p class="muted">${esc(!r || r.error === 'Unknown action' ? PASTE_NOTE : (r && r.error) || 'Could not load')}</p>`;
    return;
  }
  S.r = r;
  draw(main);
}
async function reload(main) {
  const live = window.OYP.here();
  const r = await window.OYP.call('consignList');
  if (!live()) return null;
  if (!r || !r.ok) { window.OYP.toast((r && r.error) || 'Could not load'); return null; }
  S.r = r;
  draw(main);
  return r;
}

function draw(main) {
  stopCam();
  if (S.mode === 'new' && !S.draft) S.draft = blankDraft();
  const scanning = S.scan;
  document.documentElement.classList.toggle('cs-onprint', S.mode === 'print');
  if (S.mode === 'new') main.innerHTML = drawNew();
  else if (S.mode === 'sheet' || S.mode === 'print') main.innerHTML = drawSheet(S.mode === 'print');
  else if (S.tab === 'people') main.innerHTML = drawPeople();
  else main.innerHTML = drawList();
  if (scanning) main.insertAdjacentHTML('beforeend', camHtml());
  wire(main);
  if (scanning) startCam();
}

function drawList() {
  const { esc } = window.OYP, r = S.r;
  const open = (r.sheets || []).filter(s => s.status !== 'closed');
  const closed = (r.sheets || []).filter(s => s.status === 'closed');
  const rows = open.map(s => sheetRow(s, esc)).join('');
  const closedRows = S.showClosed ? closed.map(s => sheetRow(s, esc)).join('') : '';
  const loose = r.loose || [];
  return `<div class="cs">
    ${head()}
    ${setupWarn()}
    ${tabs()}
    ${open.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Consignee</span></th><th><span class="lab">Date out</span></th><th><span class="lab">Items</span></th><th><span class="lab">Days out</span></th><th><span class="lab">Overdue</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted">${r.setup === false ? 'Nothing to show until the tabs exist.' : 'No open consignment sheets.'}</p>`}
    ${loose.length ? `<div class="csloose"><p class="muted">Marked consigned, not on a sheet.</p><div class="tw"><table class="dt"><tbody>${loose.map(j => `<tr><td><b class="cn">${esc(j.jo || j.item_id || '—')}</b><br><span class="muted">${esc(j.description || '')}</span></td><td><button type="button" class="lnk" data-loose="${esc(j.jo || '')}" data-item="${esc(j.item_id || '')}" data-desc="${esc(j.description || '')}">CONSIGN</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${closed.length ? `<button type="button" class="cstog" id="csClosed">${S.showClosed ? 'Hide closed' : 'Show closed (' + closed.length + ')'}</button>` : ''}
    ${S.showClosed && closed.length ? `<div class="tw"><table class="dt"><tbody>${closedRows}</tbody></table></div>` : ''}
  </div>`;
}
function sheetRow(s, esc) {
  const n = (s.items || []).length, out = (s.items || []).filter(i => i.status === 'consigned').length;
  const items = s.status === 'closed' ? plural(n, 'item') : (out === n ? plural(n, 'item') : out + ' of ' + n + ' still out');
  const money = moneyBits(s);
  return `<tr class="csrow${s.overdue ? ' od' : ''}" data-open="${esc(s.consignment_id)}"><td><b class="cn">${esc(s.consignee || '—')}</b><br><span class="muted">${esc(s.consignment_id)}</span>${money ? `<span class="csmoney">${esc(money)}</span>` : ''}</td>
    <td>${esc(day(s.date_out))}</td><td>${esc(items)}</td><td>${s.days_out == null ? '—' : esc(s.days_out)}</td>
    <td>${s.overdue ? '<span class="chip gold">Overdue</span>' : (s.status === 'closed' ? '<span class="chip">Closed</span>' : '—')}</td></tr>`;
}
function drawPeople() {
  const { esc } = window.OYP, r = S.r, ed = (r.consignees || []).find(c => c.consignee_id === S.edit);
  const v = ed || { name: '', phone: '', notes: '' };
  const rows = (r.consignees || []).map(c => {
    const money = moneyBits(c);
    return `<tr><td><b class="cn">${esc(c.name)}</b>${money ? `<span class="csmoney">${esc(money)}</span>` : ''}</td><td>${esc(c.phone || '—')}</td><td>${esc(c.notes || '—')}</td>
    <td><button type="button" class="lnk" data-edit="${esc(c.consignee_id)}">Edit</button></td></tr>`;
  }).join('');
  return `<div class="cs">
    ${head()}
    ${setupWarn()}
    ${tabs()}
    <div class="addrow">
      <label><span class="lab">Name</span><input id="cgName" value="${esc(v.name)}" maxlength="80" autocomplete="off"></label>
      <label><span class="lab">Phone</span><input id="cgPhone" value="${esc(v.phone || '')}" maxlength="40" autocomplete="off"></label>
      <label class="grow"><span class="lab">Notes</span><input id="cgNotes" value="${esc(v.notes || '')}" maxlength="400" autocomplete="off"></label>
      <button type="button" class="pill sm" id="cgSave">SAVE</button>
      ${ed ? '<button type="button" class="lnk" id="cgCancel">Cancel</button>' : ''}
    </div>
    ${(r.consignees || []).length ? `<table><thead><tr><th><span class="lab">Name</span></th><th><span class="lab">Phone</span></th><th><span class="lab">Notes</span></th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No consignees yet. Add a name above. Consignees are kept.</p>'}
  </div>`;
}
function drawNew() {
  const { esc } = window.OYP, d = S.draft || blankDraft(), people = (S.r.consignees || []);
  const showNew = !people.length || d.consignee_id === '__new';
  const hits = (S.hits || []).map((h, i) => `<button type="button" class="cshit" data-hit="${i}"><b>${esc(h.jo || h.item_id || 'Item')}</b> ${esc(h.description || '')}
    <span class="muted">${esc(h.location || '')}${h.blocked ? ' · ' + esc(h.blocked) : ''}</span></button>`).join('');
  const lines = d.items.map((it, i) => `<tr><td><b class="cn">${esc(it.jo || it.item_id || 'Item')}</b><br><span class="muted">${esc(it.description || '')}</span></td>
    ${prices() ? `<td><input class="csval" data-val="${i}" inputmode="decimal" value="${esc(it.value || '')}" placeholder="₱" aria-label="Agreed value"></td>` : ''}
    <td><button type="button" class="lnk" data-rm="${i}">Remove</button></td></tr>`).join('');
  return `<div class="cs">
    <button type="button" class="csback" id="csBack">‹ Back</button>
    <div class="dhead cshead"><h2>Consign</h2></div>
    <p class="muted">Lend a piece to someone outside the shop. Due back defaults to ${esc(dueHint())}.</p>
    <div class="csnew">
      <div class="fsec"><span class="lab">Consignee</span>
        <select id="csWho">${people.map(p => `<option value="${esc(p.consignee_id)}"${p.consignee_id === d.consignee_id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="__new"${showNew ? ' selected' : ''}>Add someone new</option></select></div>
      <div id="csNewWho" class="${showNew ? '' : 'hidden'}">
        <div class="addrow">
          <label><span class="lab">Name</span><input id="csName" value="${esc(d.name)}" maxlength="80" autocomplete="off"></label>
          <label><span class="lab">Phone</span><input id="csPhone" value="${esc(d.phone)}" maxlength="40" autocomplete="off"></label>
          <label class="grow"><span class="lab">Notes</span><input id="csPNotes" value="${esc(d.notes)}" maxlength="400" autocomplete="off"></label>
        </div>
      </div>
      <div class="addrow">
        <label><span class="lab">Due back (optional)</span><input id="csDue" type="date" value="${esc(d.due)}"></label>
        <label class="grow"><span class="lab">Note on the sheet</span><input id="csNote" value="${esc(d.sheetNotes)}" maxlength="400" autocomplete="off"></label>
      </div>
      <div class="fsec"><span class="lab">Add a piece</span>
        <div class="csacts"><input id="csQ" class="rvq" style="flex:1;margin:0" placeholder="Scan or type a JO, item, or description" value="${esc(S.q)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="JO or item">
        <button type="button" class="pill sm outline" id="csScan">SCAN</button></div>
        ${noteHtml('add', esc)}
        ${hits ? `<div class="cshits" id="csHits">${hits}</div>` : '<div id="csHits"></div>'}
      </div>
      ${d.items.length ? `<table class="dt"><thead><tr><th><span class="lab">Piece</span></th>${prices() ? '<th><span class="lab">Agreed value</span></th>' : ''}<th></th></tr></thead><tbody>${lines}</tbody></table>` : '<p class="muted">No pieces yet. Search, or scan a JO or item tag.</p>'}
      <div class="csacts"><button type="button" class="pill" id="csSave" ${S.r.setup === false ? 'disabled' : ''}>CONSIGN</button></div>
    </div>
  </div>`;
}
function drawSheet(printing) {
  const { esc } = window.OYP, s = sheetBy(S.id);
  if (!s) return `<div class="cs"><button type="button" class="csback" id="csBack">‹ Back</button><p class="muted">That sheet is not on the list.</p></div>`;
  const showVal = prices();
  const body = (s.items || []).map(it => `<tr class="${it.overdue ? 'od' : ''}"><td><b class="cn">${esc(it.jo || '—')}</b>${it.item_id ? `<br><span class="muted">${esc(it.item_id)}</span>` : ''}</td>
    <td>${esc(it.description || '—')}</td>
    ${showVal ? `<td class="r">${it.value != null && it.value !== '' ? esc(peso(it.value)) : '—'}</td>` : ''}
    <td>${it.status === 'consigned' ? (it.overdue ? '<span class="chip gold">Overdue</span>' : '<span class="chip">Out</span>') : `<span class="chip">${esc(it.status === 'sold' ? 'Sold' : 'Returned')}</span>`}
      ${!printing && itemMoney(it) ? `<span class="csmoney cs-noprint">${esc(itemMoney(it))}</span>` : ''}
      ${!printing && it.status === 'consigned' ? `<button type="button" class="lnk" data-back="${esc(it.line_id)}">Returned</button><button type="button" class="lnk" data-sold="${esc(it.line_id)}">Sold</button>` : ''}
      ${!printing && stillOwes(it) ? `<button type="button" class="lnk cs-noprint" data-pay="${esc(it.line_id)}">Record payment</button>` : ''}</td></tr>`).join('');
  const tot = showVal ? (s.items || []).reduce((n, it) => n + (Number(it.value) || 0), 0) : 0;
  const sheet = `<article class="csheet">
    <div class="csbrand"><img src="${esc(logoSrc())}" alt=""><b>OYP Jewelry</b></div>
    <p class="cscontact">8892 1171 · oypjewelry@gmail.com</p>
    <div class="csmeta"><div><span class="lab">Consignment</span><b>${esc(s.consignment_id)}</b></div>
      <div><span class="lab">Date</span><b>${esc(dayLong(s.date_out))}</b></div>
      <div><span class="lab">Due back</span><b>${esc(s.due_date ? dayLong(s.due_date) : '—')}</b></div></div>
    <p><span class="lab">Consignee</span><b class="cn">${esc(s.consignee || '—')}</b>${s.phone ? `<br><span class="muted">${esc(s.phone)}</span>` : ''}${s.notes ? `<br>${esc(s.notes)}` : ''}</p>
    <table><thead><tr><th><span class="lab">JO / item</span></th><th><span class="lab">Description</span></th>${showVal ? '<th class="r"><span class="lab">Agreed value</span></th>' : ''}<th><span class="lab">Status</span></th></tr></thead><tbody>${body}</tbody></table>
    ${showVal ? `<p class="cstot">Total ${esc(peso(tot))}</p>` : ''}
    <div class="cssigns"><div><div class="csline"></div><span class="lab">Consignee</span><b>${esc(s.consignee || '')}</b></div>
      <div><div class="csline"></div><span class="lab">OYP Jewelry</span></div></div>
  </article>`;
  if (printing) return `<div class="cs">${sheet}<div class="csacts cs-noprint"><button type="button" class="pill sm" id="csDoPrint">PRINT</button><button type="button" class="pill sm outline" id="csBack">BACK</button></div></div>`;
  const open = (s.items || []).some(it => it.status === 'consigned');
  const owes = (s.items || []).some(stillOwes);
  const money = moneyBits(s);
  return `<div class="cs">
    <button type="button" class="csback cs-noprint" id="csBack">‹ Back</button>
    <div class="dhead cshead cs-noprint"><h2>${esc(s.consignment_id)}</h2><button type="button" class="pill sm" id="csPrint">PRINT</button></div>
    <p class="muted cs-noprint">${esc(s.consignee || '')} · out ${esc(day(s.date_out))}${money ? ' · ' + esc(money) : ''}${s.overdue ? ' · overdue' : ''}${s.status === 'closed' ? ' · closed' : ''}</p>
    ${sheet}
    ${open ? `<div class="csacts cs-noprint"><input id="csBackCode" class="rvq" style="flex:1;margin:0" placeholder="Scan or type a JO or item" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="JO or item to return or mark sold">
      <div class="csmode" role="tablist" aria-label="Return or sold"><button type="button" data-mark="returned" class="${S.markAs === 'sold' ? '' : 'on'}">Return</button><span aria-hidden="true">·</span><button type="button" data-mark="sold" class="${S.markAs === 'sold' ? 'on' : ''}">Sold</button></div>
      <button type="button" class="pill sm outline" id="csScan">SCAN</button><button type="button" class="pill sm" id="csBackGo">${S.markAs === 'sold' ? 'SOLD' : 'RETURN'}</button></div>${noteHtml('mark', esc)}` : ''}
    ${owes ? `<div class="csacts cs-noprint"><button type="button" class="pill sm" id="csPaySheet">Record payment</button></div>` : ''}
    ${S.pay && S.pay.consignment_id === s.consignment_id ? payForm(s) : ''}
  </div>`;
}
function payForm(s) {
  const { esc } = window.OYP, p = S.pay || {};
  const methods = [['cash', 'Cash'], ['gcash', 'GCash'], ['bank', 'Bank'], ['other', 'Other']];
  return `<div class="csnew cspay cs-noprint" id="csPay">
    <span class="lab">Record payment</span>
    <p class="muted">Payer is ${esc(s.consignee || 'the consignee')}. This counts as soon as you save it.</p>
    <div class="addrow">
      <label><span class="lab">Amount</span><input id="csPayAmt" inputmode="decimal" value="${esc(p.amount == null ? '' : p.amount)}"></label>
      <label><span class="lab">Date</span><input id="csPayDate" type="date" value="${esc(p.date || '')}"></label>
      <label><span class="lab">Method</span><select id="csPayMethod">${methods.map(([k, l]) => `<option value="${k}"${p.method === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label><span class="lab">Reference</span><input id="csPayRef" value="${esc(p.reference || '')}" maxlength="80" autocomplete="off"></label>
      <label class="grow"><span class="lab">Note</span><input id="csPayNote" value="${esc(p.note || '')}" maxlength="300" autocomplete="off"></label>
    </div>
    <div class="csacts"><button type="button" class="pill sm" id="csPaySave">SAVE</button><button type="button" class="lnk" id="csPayCancel">Cancel</button></div>
  </div>`;
}
function head() {
  const roll = moneyBits(S.r);
  return `<div class="dhead cshead"><h2>Consignment</h2><button type="button" class="pill sm" id="csNew">CONSIGN</button></div>
    <p class="muted">Pieces lent out. Overdue after ${((S.r && S.r.overdue_days) || 30)} days. Nothing on this page is deleted.</p>
    ${roll ? `<p class="csmoney">${window.OYP.esc(roll)}</p>` : ''}`;
}
function setupWarn() {
  if (!S.r || S.r.setup !== false) return '';
  const miss = (S.r.missing || []).join(', ');
  return `<div class="cswarn">Almost ready: run <b>setupConsignment</b> once in Apps Script (see the instructions).${miss ? ' Missing: ' + miss + '.' : ''}</div>`;
}
function noteHtml(where, esc) {
  const n = S.note && S.note.where === where ? S.note : null;
  return `<p class="csnote${n ? ' ' + n.kind : ''}" id="csNote" role="status">${n ? esc(n.text) : ''}</p>`;
}
function tabs() {
  return `<div class="seg csseg" role="tablist">${[['sheets', 'Sheets'], ['people', 'Consignees']].map(([k, l]) => `<button type="button" data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function camHtml() {
  return `<div class="cscam" id="csCam"><span class="lab">Scan a tag</span><video id="csVid" playsinline autoplay muted></video>
    <p class="muted" id="csCamMsg">Point the camera at the JO or item tag.</p>
    <label class="lab" for="csCamCode">Or type it</label><input id="csCamCode" class="rvq" autocomplete="off" placeholder="26-001">
    <div class="csacts"><button type="button" class="pill sm" id="csCamUse">USE THIS</button><button type="button" class="pill sm outline" id="csCamStop">CLOSE</button></div></div>`;
}

function readDraft() {
  if (S.mode !== 'new' || !S.draft) return;
  const who = $('csWho'); if (who) S.draft.consignee_id = who.value;
  const name = $('csName'); if (name) S.draft.name = name.value;
  const phone = $('csPhone'); if (phone) S.draft.phone = phone.value;
  const notes = $('csPNotes'); if (notes) S.draft.notes = notes.value;
  const due = $('csDue'); if (due) S.draft.due = due.value;
  const note = $('csNote'); if (note) S.draft.sheetNotes = note.value;
  const q = $('csQ'); if (q) S.q = q.value;
  S.draft.items.forEach((it, i) => { const el = document.querySelector('[data-val="' + i + '"]'); if (el) it.value = el.value; });
}

function wire(main) {
  const go = id => { S.mode = 'sheet'; S.id = id; S.tab = 'sheets'; draw(main); };
  const nb = $('csNew'); if (nb) nb.onclick = () => { S.mode = 'new'; S.draft = blankDraft(); S.q = ''; S.hits = []; S.tab = 'sheets'; draw(main); };
  main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.mode = 'list'; S.edit = ''; draw(main); });
  main.querySelectorAll('[data-open]').forEach(tr => tr.onclick = () => go(tr.dataset.open));
  const cl = $('csClosed'); if (cl) cl.onclick = () => { S.showClosed = !S.showClosed; draw(main); };
  main.querySelectorAll('[data-loose]').forEach(b => b.onclick = () => {
    S.mode = 'new'; S.draft = blankDraft([{ jo: b.dataset.loose || '', item_id: b.dataset.item || '', description: b.dataset.desc || '', value: '' }]);
    S.q = ''; S.hits = []; draw(main);
  });
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { S.edit = b.dataset.edit; S.tab = 'people'; draw(main); });
  const cancel = $('cgCancel'); if (cancel) cancel.onclick = () => { S.edit = ''; draw(main); };
  const cg = $('cgSave'); if (cg) cg.onclick = () => savePerson(main);
  const back = $('csBack'); if (back) back.onclick = () => {
    stopCam(); S.scan = null;
    if (S.mode === 'print') { S.mode = 'sheet'; draw(main); return; }
    S.mode = 'list'; S.pay = null; document.documentElement.classList.remove('cs-onprint'); draw(main);
  };
  const who = $('csWho'); if (who) who.onchange = () => { readDraft(); const box = $('csNewWho'); if (box) box.classList.toggle('hidden', who.value !== '__new'); };
  const q = $('csQ'); if (q) { q.oninput = () => { S.q = q.value; clearNote('add'); clearTimeout(qTimer); qTimer = setTimeout(() => search(main), 280); }; q.onkeydown = e => onScanKey(e, main, 'add', q); }
  main.querySelectorAll('[data-hit]').forEach(b => b.onclick = () => addHit(main, Number(b.dataset.hit)));
  main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { readDraft(); S.draft.items.splice(Number(b.dataset.rm), 1); draw(main); });
  const save = $('csSave'); if (save) save.onclick = () => saveSheet(main);
  const scan = $('csScan'); if (scan) scan.onclick = () => openScan(main);
  const pr = $('csPrint'); if (pr) pr.onclick = () => { S.mode = 'print'; draw(main); };
  const dop = $('csDoPrint'); if (dop) dop.onclick = () => window.print();
  main.querySelectorAll('[data-back]').forEach(b => b.onclick = () => mark(main, b.dataset.back, 'returned'));
  main.querySelectorAll('[data-sold]').forEach(b => b.onclick = () => mark(main, b.dataset.sold, 'sold'));
  main.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => openPay(main, b.dataset.pay));
  const ps = $('csPaySheet'); if (ps) ps.onclick = () => openPay(main, '');
  const pc = $('csPayCancel'); if (pc) pc.onclick = () => { S.pay = null; draw(main); };
  const pg = $('csPaySave'); if (pg) pg.onclick = () => savePay(main);
  const bg = $('csBackGo'); if (bg) bg.onclick = () => { const code = $('csBackCode'); const v = (code && code.value) || ''; if (code) code.value = ''; pushScan(main, 'mark', v); };
  const code = $('csBackCode'); if (code) { code.oninput = () => clearNote('mark'); code.onkeydown = e => onScanKey(e, main, 'mark', code); }
  main.querySelectorAll('[data-mark]').forEach(b => b.onclick = () => { const pending = ($('csBackCode') && $('csBackCode').value) || ''; S.markAs = b.dataset.mark === 'sold' ? 'sold' : 'returned'; draw(main); const el = $('csBackCode'); if (el) { if (pending) el.value = pending; el.focus(); } });
  const stop = $('csCamStop'); if (stop) stop.onclick = () => { S.scan = null; stopCam(); draw(main); };
  const use = $('csCamUse'); if (use) use.onclick = () => { const v = ($('csCamCode') && $('csCamCode').value || '').trim(); if (!v) return $('csCamCode') && $('csCamCode').focus(); finishScan(main, v); };
  const cam = $('csCamCode'); if (cam) cam.onkeydown = e => { if (!isEnter(e)) return; e.preventDefault(); const v = cam.value.trim(); if (!v) return cam.focus(); finishScan(main, v); };
  focusScan();
}

async function savePerson(main) {
  if (S.busy) return;
  const name = ($('cgName') && $('cgName').value || '').trim();
  if (!name) return $('cgName') && $('cgName').focus();
  S.busy = true;
  const r = await window.OYP.call('consigneeSave', { consignee_id: S.edit || '', name, phone: ($('cgPhone') && $('cgPhone').value) || '', notes: ($('cgNotes') && $('cgNotes').value) || '' });
  S.busy = false;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not save');
  S.edit = '';
  window.OYP.toast('Saved');
  await reload(main);
}
async function search(main) {
  const q = (S.q || '').trim(), box = $('csHits');
  if (!box) return;
  if (q.length < 2 && !joOf(q)) { box.innerHTML = ''; S.hits = []; return; }
  const live = window.OYP.here();
  const r = await window.OYP.call('consignSearch', { q });
  if (!live() || !$('csHits') || (S.q || '').trim() !== q) return;
  if (!r || !r.ok) { $('csHits').innerHTML = `<p class="muted">${window.OYP.esc((r && r.error) || 'Could not search')}</p>`; return; }
  S.hits = r.hits || [];
  const esc = window.OYP.esc;
  $('csHits').innerHTML = S.hits.length ? `<div class="cshits">${S.hits.map((h, i) => `<button type="button" class="cshit" data-hit="${i}"><b>${esc(h.jo || h.item_id || 'Item')}</b> ${esc(h.description || '')} <span class="muted">${esc(h.location || '')}${h.blocked ? ' · ' + esc(h.blocked) : ''}</span></button>`).join('')}</div>` : '<p class="muted">Nothing matches.</p>';
  $('csHits').querySelectorAll('[data-hit]').forEach(b => b.onclick = () => addHit(main, Number(b.dataset.hit)));
}
function addHit(main, i) {
  const h = (S.hits || [])[i]; if (!h || S.mode !== 'new' || !S.draft) return;
  if (h.blocked) { S.hits = []; setNote('dup', h.blocked, 'add'); beep('dup'); if ($('csQ')) $('csQ').value = ''; S.q = ''; return paintScan(main, 'csQ'); }
  readDraft();
  if (onDraft(h)) { setNote('dup', 'Already on this sheet · ' + (h.jo || h.item_id || 'that piece'), 'add'); beep('dup'); if ($('csQ')) $('csQ').value = ''; S.q = ''; return paintScan(main, 'csQ'); }
  S.draft.items.push({ jo: h.jo || '', item_id: h.item_id || '', description: h.description || '', value: '' });
  S.q = ''; S.hits = [];
  if ($('csQ')) $('csQ').value = '';
  setNote('ok', addedText(h), 'add');
  beep('ok');
  paintScan(main, 'csQ');
}
async function saveSheet(main) {
  if (S.busy) return;
  readDraft();
  const d = S.draft;
  if (!d.items.length) return window.OYP.toast('Add at least one piece');
  const payload = { due_date: d.due || '', notes: d.sheetNotes || '', items: d.items.map(it => ({ jo: it.jo || '', item_id: it.item_id || '', description: it.description || '', value: prices() ? it.value : '' })) };
  if (d.consignee_id && d.consignee_id !== '__new') payload.consignee_id = d.consignee_id;
  else {
    if (!(d.name || '').trim()) { window.OYP.toast('Type the consignee\'s name'); if ($('csName')) $('csName').focus(); return; }
    payload.new_consignee = { name: d.name, phone: d.phone || '', notes: d.notes || '' };
  }
  S.busy = true;
  const r = await window.OYP.call('consignSave', payload);
  S.busy = false;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not save');
  window.OYP.toast('Saved ' + (r.consignment_id || ''));
  S.mode = 'sheet'; S.id = r.consignment_id || ''; S.draft = null; S.q = ''; S.hits = [];
  await reload(main);
}
async function mark(main, lineId, status) {
  if (S.busy) return;
  if (!confirm(status === 'sold' ? 'Mark this item sold? The consignee then owes the agreed value.' : 'Mark this item returned?')) return;
  S.busy = true;
  const r = await window.OYP.call('consignItem', { line_id: lineId, status: status, consignment_id: S.id || '' });
  S.busy = false;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not update');
  window.OYP.toast(status === 'sold' ? 'Marked sold' : 'Marked returned');
  S.pay = null;
  await reload(main);
}
function openPay(main, lineId) {
  const s = sheetBy(S.id);
  if (!s || !prices()) return;
  let amount = s.balance || 0;
  if (lineId) {
    const it = (s.items || []).find(x => x.line_id === lineId);
    if (!it || !stillOwes(it)) return;
    amount = it.balance;
  } else if (!((s.items || []).some(stillOwes))) return;
  S.pay = { line_id: lineId || '', consignment_id: s.consignment_id, amount: amount ? String(amount) : '', date: (S.r && S.r.today) || '', method: 'cash', reference: '', note: '' };
  draw(main);
  if ($('csPayAmt')) $('csPayAmt').focus();
}
async function savePay(main) {
  if (S.busy || !S.pay) return;
  const amount = ($('csPayAmt') && $('csPayAmt').value || '').trim();
  if (!amount) return $('csPayAmt') && $('csPayAmt').focus();
  if (!confirm('Record this payment? It counts right away.')) return;
  const payload = {
    amount: amount, date: ($('csPayDate') && $('csPayDate').value) || '', method: ($('csPayMethod') && $('csPayMethod').value) || 'cash',
    reference: ($('csPayRef') && $('csPayRef').value) || '', note: ($('csPayNote') && $('csPayNote').value) || '',
    consignment_id: S.pay.consignment_id || S.id || ''
  };
  if (S.pay.line_id) payload.line_id = S.pay.line_id;
  S.busy = true;
  const r = await window.OYP.call('consignPay', payload);
  S.busy = false;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not record the payment');
  S.pay = null;
  window.OYP.toast('Payment recorded');
  await reload(main);
}
function isEnter(e) { return e.key === 'Enter' || e.key === 'NumpadEnter'; }
function onScanKey(e, main, kind, input) {
  if (!isEnter(e)) return;
  e.preventDefault();
  clearTimeout(qTimer);
  const v = input.value;
  input.value = '';
  if (kind === 'add') S.q = '';
  pushScan(main, kind, v);
}
function focusScan() {
  if (S.scan) { if ($('csCamCode')) $('csCamCode').focus(); return; }
  if (S.pay) return;
  const el = S.mode === 'new' ? $('csQ') : (S.mode === 'sheet' ? $('csBackCode') : null);
  if (el) el.focus();
}
function setNote(kind, text, where) { S.note = { kind, text, where }; }
function clearNote(where) {
  if (!S.note || S.note.where !== where) return;
  S.note = null;
  const n = $('csNote'); if (n) { n.textContent = ''; n.className = 'csnote'; }
}
function addedText(h) { return 'Added ' + (h.jo || h.item_id || 'piece') + (h.description ? ' · ' + h.description : ''); }
function onDraft(h) { return !!(S.draft && (S.draft.items || []).some(it => samePiece(it, h))); }
function beep(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = beep.ctx || (beep.ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    const tone = (freq, at, dur) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.start(at); o.stop(at + dur + 0.02);
    };
    const t = ctx.currentTime;
    if (kind === 'ok') tone(880, t, 0.09);
    else if (kind === 'dup') { tone(520, t, 0.07); tone(520, t + 0.11, 0.07); }
    else tone(196, t, 0.16);
  } catch (e) {}
}
function flash(el) {
  if (!el || !S.note) return;
  el.classList.add('csflash', S.note.kind);
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { el.classList.remove('csflash', 'ok', 'dup', 'bad'); }, 700);
}
function paintScan(main, id) {
  if (S.mode === 'new') readDraft();
  const pending = ($(id) && $(id).value) || '';
  if (id === 'csQ') S.q = '';
  draw(main);
  const el = $(id);
  if (!el) return;
  if (pending) { el.value = pending; if (id === 'csQ') S.q = pending; }
  el.focus();
  try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {}
  flash(el);
}
function chooseHit(hits, spec) {
  const list = hits || [];
  if (spec.jo) {
    const exact = list.filter(h => { const p = joParse(h.jo || ''); return p && p.key === spec.jo.key; });
    if (exact.length === 1) return { hit: exact[0] };
    if (exact.length > 1) return { many: true, hits: exact };
    return { none: true };
  }
  if (spec.exact) {
    const item = list.filter(h => h.item_id && String(h.item_id).toLowerCase() === spec.q.toLowerCase());
    if (item.length === 1) return { hit: item[0] };
    if (item.length > 1) return { many: true, hits: item };
  }
  if (list.length === 1) return { hit: list[0] };
  if (!list.length) return { none: true };
  return { many: true, hits: list };
}
function pushScan(main, kind, raw) {
  const code = String(raw || '').trim();
  if (!code) { setNote('bad', 'Type or scan a JO or item number', kind === 'mark' ? 'mark' : 'add'); beep('bad'); paintScan(main, kind === 'mark' ? 'csBackCode' : 'csQ'); return; }
  scanQueue.push({ kind, code, status: S.markAs === 'sold' ? 'sold' : 'returned' });
  pumpScan(main);
}
async function pumpScan(main) {
  if (scanBusy) return;
  scanBusy = true;
  while (scanQueue.length) {
    const job = scanQueue.shift();
    if (job.kind === 'mark') await commitMark(main, job.code, job.status);
    else await commitAdd(main, job.code);
  }
  scanBusy = false;
  focusScan();
}
async function commitAdd(main, raw) {
  const spec = scanSpec(raw);
  if (!spec.q || (spec.q.length < 2 && !spec.jo)) { setNote('bad', 'Type or scan a JO or item number', 'add'); beep('bad'); paintScan(main, 'csQ'); return; }
  const live = window.OYP.here();
  const r = await window.OYP.call('consignSearch', { q: spec.q });
  if (!live() || S.mode !== 'new' || !S.draft) return;
  if (!r || !r.ok) { setNote('bad', (r && r.error) || 'Could not search', 'add'); beep('bad'); paintScan(main, 'csQ'); return; }
  const choice = chooseHit(r.hits || [], spec);
  if (choice.none) { S.hits = []; setNote('bad', 'Nothing matches' + (spec.jo ? ' ' + spec.jo.text : ''), 'add'); beep('bad'); }
  else if (choice.many) { S.hits = choice.hits || r.hits || []; setNote('dup', 'More than one match. Tap the piece.', 'add'); beep('dup'); }
  else if (choice.hit.blocked) { S.hits = []; setNote('dup', choice.hit.blocked, 'add'); beep('dup'); }
  else if (onDraft(choice.hit)) { S.hits = []; setNote('dup', 'Already on this sheet · ' + (choice.hit.jo || choice.hit.item_id || 'that piece'), 'add'); beep('dup'); }
  else {
    readDraft();
    S.draft.items.push({ jo: choice.hit.jo || '', item_id: choice.hit.item_id || '', description: choice.hit.description || '', value: '' });
    S.hits = []; S.q = '';
    setNote('ok', addedText(choice.hit), 'add');
    beep('ok');
  }
  paintScan(main, 'csQ');
}
async function commitMark(main, raw, status) {
  const spec = scanSpec(raw), where = 'mark';
  if (!spec.q) { setNote('bad', 'Type or scan a JO or item number', where); beep('bad'); paintScan(main, 'csBackCode'); return; }
  const live = window.OYP.here();
  const r = await window.OYP.call('consignItem', { code: spec.q, status: status === 'sold' ? 'sold' : 'returned', consignment_id: S.id || '' });
  if (!live()) return;
  if (!r || !r.ok) {
    const err = (r && r.error) || 'No matching piece is still out';
    const dup = /already/i.test(err);
    setNote(dup ? 'dup' : 'bad', err, where);
    beep(dup ? 'dup' : 'bad');
    window.OYP.toast(err);
  } else {
    const label = status === 'sold' ? 'Marked sold' : 'Marked returned';
    setNote('ok', label + (spec.jo ? ' · ' + spec.jo.text : ' · ' + spec.q), where);
    beep('ok');
    window.OYP.toast(label);
    if (r.consignment_id) { S.mode = 'sheet'; S.id = r.consignment_id; }
    await reload(main);
  }
  if (window.OYP.here()()) paintScan(main, 'csBackCode');
}
function openScan(main) {
  if (!window.isSecureContext) { window.OYP.toast('The camera needs a secure page. Type the number instead.'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { window.OYP.toast('This browser has no camera. Type the number instead.'); return; }
  S.scan = { purpose: S.mode === 'new' ? 'add' : 'back' };
  draw(main);
}
function finishScan(main, text) {
  const purpose = S.scan && S.scan.purpose;
  S.scan = null;
  stopCam();
  draw(main);
  pushScan(main, purpose === 'back' ? 'mark' : 'add', text);
}
async function startCam() {
  const gen = ++camGen, video = $('csVid'), msg = $('csCamMsg');
  if (!video) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e1) {
    try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
    catch (e2) {
      if (msg && gen === camGen) msg.textContent = 'The camera is blocked. Type the JO or item number instead.';
      return;
    }
  }
  if (gen !== camGen || !S.scan) { stream.getTracks().forEach(t => t.stop()); return; }
  S.stream = stream;
  video.srcObject = stream;
  try { await video.play(); } catch (e) {}
  if (gen !== camGen || !S.scan) return;
  if (typeof window.BarcodeDetector !== 'function') { if (msg) msg.textContent = 'This browser cannot read a tag from the camera. Type the number.'; return; }
  let det;
  try { det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'data_matrix'] }); }
  catch (e1) {
    try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); }
    catch (e2) { if (msg) msg.textContent = 'This browser cannot read a tag from the camera. Type the number.'; return; }
  }
  const tick = async () => {
    if (gen !== camGen || !S.scan) return;
    try {
      const codes = await det.detect(video);
      const text = codes && codes[0] && codes[0].rawValue;
      if (text) { finishScan(document.getElementById('main'), text); return; }
    } catch (e) {}
    if (gen === camGen && S.scan) S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
}

window.OYPConsign = { render };
})();
