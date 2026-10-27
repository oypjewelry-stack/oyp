/* OYP back office: Consignment (#/consignment). Pieces lent to someone outside the shop.
   Admin and production manager. Agreed value, owed, paid, and balance are executive-only (the server omits them for everyone else).
   A sold piece is owed by the consignee. Record payment stores paid_amount and paid_at on the line (Consignment.gs consignPay).
   Attach signed copy sends a photo or PDF (consignSigned). Attach signed return slip sends the same way with kind return. Both files stay in Drive under Consignments/<CS number>.
   A sheet closes when no piece is still consigned. Returned pieces go back to prev_location and are left out of the owed amount. Sold pieces stay owed until a payment is recorded.
   Server: Consignment.gs, one tab named Consignment, one row per piece. Run setupConsignment once. Names in the form are the distinct consignee names on that tab. */
(() => {
'use strict';
const PASTE_NOTE = 'This page needs the Consignment paste in Apps Script (see the instructions).';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const peso = n => '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { maximumFractionDigits: 2 });
const day = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return MON[m - 1] + ' ' + dd + (y && y !== new Date().getFullYear() ? ', ' + y : ''); };
const dayLong = d => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return MON[m - 1] + ' ' + dd + ', ' + y; };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const addD = (day0, n) => { const d = new Date(String(day0).slice(0, 10) + 'T00:00:00Z'); if (isNaN(d.getTime())) return ''; d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// QR sticker, same read as inv.js: plain 26-287 / 26-287A, or a URL / prefixed text that contains a JO
// (jo=26-287, or a path ending in /26-287). The letter is the version and stays with the number.
function joPack_(yy, num, letter) {
  letter = letter || '';
  return { key: yy + '-' + num, version: letter, text: yy + '-' + num + letter };
}
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
function joParse(s) { return joFromScan(s); }
const joOf = s => { const p = joParse(s); return p ? p.text : ''; };
function scanSpec(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return { q: '', jo: null, exact: false };
  const p = joParse(s);
  if (p) return { q: p.text, jo: p, exact: true };
  return { q: s, jo: null, exact: !/\s/.test(s) };
}
function samePiece(a, b) {
  const ak = joParse(a && a.jo), bk = joParse(b && b.jo);
  if (ak && bk && ak.key === bk.key) return true;
  const ai = String(a && a.item_id || '').toLowerCase(), bi = String(b && b.item_id || '').toLowerCase();
  return !!(ai && bi && ai === bi && !ak && !bk);
}
const $ = id => document.getElementById(id);
const S = { r: null, mode: 'list', tab: 'sheets', id: '', showClosed: false, draft: null, q: '', hits: [], scan: null, edit: '', pay: null, busy: false, stream: null, raf: 0, markAs: 'returned', note: null };
function pieceBits(it, opts) {
  const id = it.jo || '';
  if (opts && opts.joOnly) return `<b class="cn">${window.OYP.esc(id || it.item_id || '—')}</b>`; // the printed sheet goes to the consignee: JO only
  const html = id ? window.OYP.piece(it.client, id) : '';
  return html || `<b class="cn">${window.OYP.esc(it.item_id || it.jo || '—')}</b>`;
}
function hitLabel(h) {
  const id = h.jo || h.item_id || 'Item';
  return window.OYP.piece(h.jo ? h.client : '', id) || `<b>${window.OYP.esc(id)}</b>`;
}
const scanQueue = [];
let scanBusy = false, qTimer = 0, scanSeq = 0, scanShown = '';
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
  document.documentElement.classList.toggle('cs-onprint', S.mode === 'print' || S.mode === 'rprint');
  if (S.mode === 'new') main.innerHTML = drawNew();
  else if (S.mode === 'rprint') main.innerHTML = drawReturn();
  else if (S.mode === 'sheet' || S.mode === 'print') main.innerHTML = drawSheet(S.mode === 'print');
  else if (S.tab === 'people') main.innerHTML = drawPeople();
  else main.innerHTML = drawList();
  if (scanning) main.insertAdjacentHTML('beforeend', camHtml());
  wire(main);
  if (scanning) startCam();
  if (S.autoPrint && (S.mode === 'print' || S.mode === 'rprint')) {
    S.autoPrint = false;
    setTimeout(() => { try { window.print(); } catch (e) {} }, 0);
  }
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
    <div class="csacts csfind">
      <input id="csFind" class="rvq" placeholder="CS number or scan a JO" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="CS number or JO">
    </div>
    ${noteHtml('find', esc)}
    <p class="muted">Type a CS number or scan a JO to open that sheet. Mark each piece returned or sold. Returning one piece leaves the others out.</p>
    ${open.length ? `<div class="tw"><table class="dt"><thead><tr><th><span class="lab">Consignee</span></th><th><span class="lab">Date out</span></th><th><span class="lab">Items</span></th><th><span class="lab">Days out</span></th><th><span class="lab">Overdue</span></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted">${r.setup === false ? 'Nothing to show until the Consignment tab exists.' : 'No open consignment sheets.'}</p>`}
    ${loose.length ? `<div class="csloose"><p class="muted">Marked consigned, not on a sheet.</p><div class="tw"><table class="dt"><tbody>${loose.map(j => `<tr><td>${pieceBits(j)}<br><span class="muted">${esc(j.description || '')}</span></td><td><button type="button" class="lnk" data-loose="${esc(j.jo || '')}" data-item="${esc(j.item_id || '')}" data-desc="${esc(j.description || '')}" data-client="${esc(j.client || '')}">CONSIGN</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    ${closed.length ? `<button type="button" class="cstog" id="csClosed">${S.showClosed ? 'Hide closed' : 'Show closed (' + closed.length + ')'}</button>` : ''}
    ${S.showClosed && closed.length ? `<div class="tw"><table class="dt"><tbody>${closedRows}</tbody></table></div>` : ''}
  </div>`;
}
function sheetRow(s, esc) {
  const n = (s.items || []).length, out = (s.items || []).filter(i => i.status === 'consigned').length;
  const items = s.status === 'closed' ? plural(n, 'item') : (out === n ? plural(n, 'item') : out + ' of ' + n + ' still out');
  const money = moneyBits(s);
  return `<tr class="csrow${s.overdue ? ' od' : ''}" data-open="${esc(s.consignment_id)}"><td><b class="cn">${esc(s.consignee || '—')}</b><br><span class="muted">${esc(s.consignment_id)}</span>${signMark(s, esc)}${money ? `<span class="csmoney">${esc(money)}</span>` : ''}</td>
    <td>${esc(day(s.date_out))}</td><td>${esc(items)}</td><td>${s.days_out == null ? '—' : esc(s.days_out)}</td>
    <td>${s.overdue ? '<span class="chip gold">Overdue</span>' : (s.status === 'closed' ? '<span class="chip">Closed</span>' : '—')}</td>
    <td><div class="csrowacts"><button type="button" class="lnk" data-reprint="${esc(s.consignment_id)}">Reprint</button>${hasReturned(s) ? `<button type="button" class="lnk" data-rprint="${esc(s.consignment_id)}">Return slip</button>` : ''}${signButton(s, esc, 'copy')}${hasReturned(s) ? signButton(s, esc, 'return') : ''}</div></td></tr>`;
}
function hasReturned(s) { return (s.items || []).some(it => it.status === 'returned'); }
function signButton(s, esc, kind) {
  const id = esc(s.consignment_id);
  const ret = kind === 'return';
  const label = ret ? 'Attach signed return slip' : 'Attach signed copy';
  return `<button type="button" class="lnk" data-sign="${id}" data-kind="${ret ? 'return' : 'copy'}">${label}</button><input type="file" class="csfile" data-file="${id}" data-kind="${ret ? 'return' : 'copy'}" accept="image/*,application/pdf" capture="environment" aria-label="${label} for ${id}">`;
}
function safeHttp(u) { return /^https:\/\//i.test(String(u || '')) ? String(u) : ''; }
function fileMark(s, esc, kind) {
  const ret = kind === 'return';
  const url = safeHttp(s && (ret ? s.return_slip_url : s.signed_copy_url));
  if (!url) return '';
  const thumb = String((ret ? s.return_slip_thumb : s.signed_thumb) || '');
  const label = ret ? 'Signed return slip' : 'Signed copy';
  const img = thumb.indexOf('data:image/') === 0 ? `<a class="csthumb" href="${esc(url)}" target="_blank" rel="noopener"><img alt="${label}" src="${esc(thumb)}"></a>` : '';
  return `<span class="cssignbits"><span class="chip">${ret ? 'Return signed' : 'Signed'}</span> <a class="lnk cssigned" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>${img}</span>`;
}
function signMark(s, esc) { return fileMark(s, esc, 'copy') + fileMark(s, esc, 'return'); }
function drawPeople() {
  const { esc } = window.OYP, r = S.r, ed = (r.consignees || []).find(c => c.consignee_id === S.edit);
  const rows = (r.consignees || []).map(c => {
    const money = moneyBits(c);
    return `<tr><td><b class="cn">${esc(c.name)}</b>${money ? `<span class="csmoney">${esc(money)}</span>` : ''}</td><td>${esc(c.phone || '—')}</td>
    <td><button type="button" class="lnk" data-edit="${esc(c.consignee_id)}">Edit</button></td></tr>`;
  }).join('');
  return `<div class="cs">
    ${head()}
    ${setupWarn()}
    ${tabs()}
    <p class="muted">Names come from the Consignment tab. On a new sheet, a name you have used before fills in the phone.</p>
    ${ed ? `<div class="addrow">
      <label><span class="lab">Name</span><input id="cgName" value="${esc(ed.name)}" maxlength="80" autocomplete="off"></label>
      <label><span class="lab">Phone</span><input id="cgPhone" value="${esc(ed.phone || '')}" maxlength="40" autocomplete="off"></label>
      <button type="button" class="pill sm" id="cgSave">SAVE</button>
      <button type="button" class="lnk" id="cgCancel">Cancel</button>
    </div>` : ''}
    ${(r.consignees || []).length ? `<table><thead><tr><th><span class="lab">Name</span></th><th><span class="lab">Phone</span></th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No consignees yet. A name is kept when you consign a piece.</p>'}
  </div>`;
}
function personByName(s) {
  const n = String(s || '').trim().toLowerCase();
  if (!n || !S.r) return null;
  return (S.r.consignees || []).find(p => String(p.name || '').trim().toLowerCase() === n) || null;
}
function drawNew() {
  const { esc } = window.OYP, d = S.draft || blankDraft(), people = (S.r.consignees || []);
  const hits = (S.hits || []).map((h, i) => `<button type="button" class="cshit" data-hit="${i}">${hitLabel(h)} ${esc(h.description || '')}
    <span class="muted">${esc(h.location || '')}${h.blocked ? ' · ' + esc(h.blocked) : ''}</span></button>`).join('');
  const lines = d.items.map((it, i) => itemRow(it, i)).join('');
  return `<div class="cs">
    <button type="button" class="csback" id="csBack">‹ Back</button>
    <div class="dhead cshead"><h2>Consign</h2></div>
    <p class="muted">Lend a piece to someone outside the shop. Due back defaults to ${esc(dueHint())}. A scan adds the piece to the list. Save prints the sheet.</p>
    <div class="csnew">
      <div class="addrow">
        <label><span class="lab">Consignee</span><input id="csName" list="csPeople" value="${esc(d.name)}" maxlength="80" autocomplete="off" placeholder="Name"></label>
        <datalist id="csPeople">${people.map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
        <label><span class="lab">Phone</span><input id="csPhone" value="${esc(d.phone)}" maxlength="40" autocomplete="off" placeholder="Filled in for a known name"></label>
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
      ${d.items.length ? `<div class="csitems" id="csItems"><div class="dgrp"><span class="lab">Piece</span>${prices() ? '<span class="lab">Agreed value</span>' : ''}</div>${lines}</div>` : '<p class="muted">No pieces yet. Search, or scan a JO or item tag.</p>'}
      <div class="csacts"><button type="button" class="pill" id="csSave" ${S.r.setup === false ? 'disabled' : ''}>SAVE</button></div>
    </div>
  </div>`;
}
function drawSheet(printing) {
  const { esc } = window.OYP, s = sheetBy(S.id);
  if (!s) return `<div class="cs"><button type="button" class="csback" id="csBack">‹ Back</button><p class="muted">That sheet is not on the list.</p></div>`;
  const showVal = prices();
  const body = (s.items || []).map(it => `<tr class="${it.overdue ? 'od' : ''}"><td>${pieceBits(it, printing ? { joOnly: true } : null)}${it.item_id ? `<br><span class="muted">${esc(it.item_id)}</span>` : ''}</td>
    <td>${esc(it.description || '—')}</td>
    ${showVal ? `<td class="r">${it.value != null && it.value !== '' ? esc(peso(it.value)) : '—'}</td>` : ''}
    <td>${it.status === 'consigned' ? (it.overdue ? '<span class="chip gold">Overdue</span>' : '<span class="chip">Out</span>') : `<span class="chip">${esc(it.status === 'sold' ? 'Sold' : 'Returned')}</span>`}
      ${!printing && itemMoney(it) ? `<span class="csmoney cs-noprint">${esc(itemMoney(it))}</span>` : ''}
      ${!printing && it.status === 'consigned' ? `<button type="button" class="lnk" data-back="${esc(it.line_id)}">Returned</button><button type="button" class="lnk" data-sold="${esc(it.line_id)}">Sold</button>` : ''}
      ${!printing && stillOwes(it) ? `<button type="button" class="lnk cs-noprint" data-pay="${esc(it.line_id)}">Record payment</button>` : ''}</td></tr>`).join('');
  const tot = showVal ? (s.items || []).reduce((n, it) => n + (Number(it.value) || 0), 0) : 0;
  const sheet = `<article class="csheet">
    <p class="csno"><span class="lab">Consignment</span>${esc(s.consignment_id)}</p>
    <div class="csbrand"><img src="${esc(logoSrc())}" alt=""><b>OYP Jewelry</b></div>
    <p class="cscontact">8892 1171 · oypjewelry@gmail.com</p>
    <div class="csmeta"><div><span class="lab">Date</span><b>${esc(dayLong(s.date_out))}</b></div>
      <div><span class="lab">Due back</span><b>${esc(s.due_date ? dayLong(s.due_date) : '—')}</b></div></div>
    <p><span class="lab">Consignee</span><b class="cn">${esc(s.consignee || '—')}</b>${s.phone ? `<br><span class="muted">${esc(s.phone)}</span>` : ''}${s.notes ? `<br>${esc(s.notes)}` : ''}</p>
    <table><thead><tr><th><span class="lab">JO / item</span></th><th><span class="lab">Description</span></th>${showVal ? '<th class="r"><span class="lab">Agreed value</span></th>' : ''}<th><span class="lab">Status</span></th></tr></thead><tbody>${body}</tbody></table>
    ${showVal ? `<p class="cstot">Total ${esc(peso(tot))}</p>` : ''}
    <div class="cssigns"><div><div class="csline"></div><span class="lab">Consignee</span><b>${esc(s.consignee || '')}</b></div>
      <div><div class="csline"></div><span class="lab">OYP Jewelry</span></div></div>
  </article>`;
  if (printing) return `<div class="cs">${sheet}<div class="csacts cs-noprint"><button type="button" class="pill sm" id="csDoPrint">PRINT</button><button type="button" class="pill sm outline" id="csBack">BACK</button>${signButton(s, esc, 'copy')}</div>${signMark(s, esc) ? `<div class="cs-noprint">${signMark(s, esc)}</div>` : ''}</div>`;
  const open = (s.items || []).some(it => it.status === 'consigned');
  const owes = (s.items || []).some(stillOwes);
  const money = moneyBits(s);
  return `<div class="cs">
    <button type="button" class="csback cs-noprint" id="csBack">‹ Back</button>
    <div class="dhead cshead cs-noprint"><h2>${esc(s.consignment_id)}</h2><div class="csrowacts"><button type="button" class="pill sm" id="csPrint">REPRINT</button>${hasReturned(s) ? `<button type="button" class="pill sm outline" id="csReturn">RETURN SLIP</button>` : ''}${signButton(s, esc, 'copy')}${hasReturned(s) ? signButton(s, esc, 'return') : ''}</div></div>
    <p class="muted cs-noprint">${esc(s.consignee || '')} · out ${esc(day(s.date_out))}${money ? ' · ' + esc(money) : ''}${s.overdue ? ' · overdue' : ''}${s.status === 'closed' ? ' · closed' : ''}</p>
    ${signMark(s, esc) ? `<div class="cs-noprint">${signMark(s, esc)}</div>` : ''}
    ${sheet}
    ${open ? `<div class="csacts cs-noprint"><input id="csBackCode" class="rvq" style="flex:1;margin:0" placeholder="Scan or type a JO or item" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="JO or item to return or mark sold">
      <div class="csmode" role="tablist" aria-label="Return or sold"><button type="button" data-mark="returned" class="${S.markAs === 'sold' ? '' : 'on'}">Return</button><span aria-hidden="true">·</span><button type="button" data-mark="sold" class="${S.markAs === 'sold' ? 'on' : ''}">Sold</button></div>
      <button type="button" class="pill sm outline" id="csScan">SCAN</button><button type="button" class="pill sm" id="csBackGo">${S.markAs === 'sold' ? 'SOLD' : 'RETURN'}</button></div>` : ''}
    ${noteHtml('mark', esc)}
    ${owes ? `<div class="csacts cs-noprint"><button type="button" class="pill sm" id="csPaySheet">Record payment</button></div>` : ''}
    ${S.pay && S.pay.consignment_id === s.consignment_id ? payForm(s) : ''}
  </div>`;
}
function drawReturn() {
  const { esc } = window.OYP, s = sheetBy(S.id);
  if (!s) return `<div class="cs"><button type="button" class="csback" id="csBack">‹ Back</button><p class="muted">That sheet is not on the list.</p></div>`;
  const back = (s.items || []).filter(it => it.status === 'returned');
  const rows = back.map(it => `<tr><td>${pieceBits(it, { joOnly: true })}</td><td>${esc(it.description || '—')}</td><td>${esc(day(it.returned_at) || day(S.r && S.r.today) || '—')}</td></tr>`).join('');
  const slip = `<article class="csheet">
    <p class="csno"><span class="lab">Return</span>${esc(s.consignment_id)}</p>
    <div class="csbrand"><img src="${esc(logoSrc())}" alt=""><b>OYP Jewelry</b></div>
    <p class="cscontact">8892 1171 · oypjewelry@gmail.com</p>
    <div class="csmeta"><div><span class="lab">Date</span><b>${esc(dayLong((S.r && S.r.today) || ''))}</b></div></div>
    <p><span class="lab">Consignee</span><b class="cn">${esc(s.consignee || '—')}</b>${s.phone ? `<br><span class="muted">${esc(s.phone)}</span>` : ''}</p>
    <table><thead><tr><th><span class="lab">JO / item</span></th><th><span class="lab">Description</span></th><th><span class="lab">Returned</span></th></tr></thead><tbody>${rows || '<tr><td colspan="3">No returned pieces.</td></tr>'}</tbody></table>
    <div class="cssigns"><div><div class="csline"></div><span class="lab">Consignee</span><b>${esc(s.consignee || '')}</b></div>
      <div><div class="csline"></div><span class="lab">OYP Jewelry</span></div></div>
  </article>`;
  return `<div class="cs">${slip}<div class="csacts cs-noprint"><button type="button" class="pill sm" id="csDoPrint">PRINT</button><button type="button" class="pill sm outline" id="csBack">BACK</button>${signButton(s, esc, 'return')}</div>${fileMark(s, esc, 'return') ? `<div class="cs-noprint">${fileMark(s, esc, 'return')}</div>` : ''}</div>`;
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
  return `<div class="cswarn">Almost ready: run <b>setupConsignment</b> once in Apps Script. It adds the Consignment tab when that tab is missing.${miss ? ' Missing: ' + miss + '.' : ''}</div>`;
}
function noteBits(n, esc) {
  if (!n) return '';
  if (!n.dot && !n.sub) return esc(n.text || '');
  const dot = n.dot ? `<i class="csdot ${esc(n.dot)}" aria-hidden="true"></i>` : '';
  const sub = n.sub ? `<span class="cssub">${esc(n.sub)}</span>` : '';
  return `${dot}<span class="cslab">${esc(n.text || '')}</span>${sub}`;
}
function noteHtml(where, esc) {
  const n = S.note && S.note.where === where ? S.note : null;
  return `<p class="csnote${n ? ' ' + n.kind : ''}" id="csScanNote" role="status">${noteBits(n, esc)}</p>`;
}
function paintNote() {
  const el = $('csScanNote');
  if (!el || !S.note) return;
  el.className = 'csnote' + (S.note.kind ? ' ' + S.note.kind : '');
  el.innerHTML = noteBits(S.note, window.OYP.esc);
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
  const name = $('csName'); if (name) S.draft.name = name.value;
  const phone = $('csPhone'); if (phone) S.draft.phone = phone.value;
  const due = $('csDue'); if (due) S.draft.due = due.value;
  const note = $('csNote'); if (note) S.draft.sheetNotes = note.value;
  const q = $('csQ'); if (q) S.q = q.value;
  S.draft.items.forEach((it, i) => { const el = document.querySelector('[data-val="' + i + '"]'); if (el) it.value = el.value; });
}

function itemRow(it, i) {
  const esc = window.OYP.esc;
  if (it.pending) {
    const label = it.jo || it.item_id || 'Piece';
    return `<div class="csitem loading" data-csitem="${i}" data-pending="${esc(it.pending)}"><div class="csitemmain"><b class="cn">${esc(label)}</b><span class="muted">loading…</span></div><button type="button" class="lnk" data-rm="${i}">Remove</button></div>`;
  }
  return `<div class="csitem" data-csitem="${i}"><div class="csitemmain">${pieceBits(it)}<span class="muted">${esc(it.description || '')}</span></div>
    ${prices() ? `<input class="csval" data-val="${i}" inputmode="decimal" value="${esc(it.value || '')}" placeholder="₱" aria-label="Agreed value">` : ''}
    <button type="button" class="lnk" data-rm="${i}">Remove</button></div>`;
}
function itemsBoxHtml() {
  const lines = ((S.draft && S.draft.items) || []).map((it, i) => itemRow(it, i)).join('');
  return `<div class="csitems" id="csItems"><div class="dgrp"><span class="lab">Piece</span>${prices() ? '<span class="lab">Agreed value</span>' : ''}</div>${lines}</div>`;
}
function removeItem(main, i) {
  readDraft();
  if (S.draft && S.draft.items) S.draft.items.splice(i, 1);
  rebuildItems(main);
}
function bindItems(main) {
  const box = $('csItems');
  if (!box) return;
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    if (!confirm('Remove this piece from the sheet?')) return;
    removeItem(main, Number(b.dataset.rm));
  });
  if (window.OYP.swipe && !box.dataset.oypswipe) window.OYP.swipe(box, {
    item: '.csitem',
    ignore: '.csval',
    actions: function (row) {
      const i = Number(row.getAttribute('data-csitem'));
      return [{ label: 'Remove', confirm: 'Remove this piece from the sheet?', run: function () { removeItem(main, i); } }];
    }
  });
}
function rebuildItems(main) {
  const save = $('csSave');
  if (!save || !S.draft) return;
  const acts = save.parentNode;
  const prev = acts.previousElementSibling;
  const empty = prev && prev.tagName === 'P' && prev.classList.contains('muted') ? prev : null;
  if (!S.draft.items.length) {
    const box = $('csItems');
    if (box) box.remove();
    if (!empty) acts.insertAdjacentHTML('beforebegin', '<p class="muted">No pieces yet. Search, or scan a JO or item tag.</p>');
    return;
  }
  if (empty) empty.remove();
  const box = $('csItems');
  const html = itemsBoxHtml();
  if (box) box.outerHTML = html;
  else acts.insertAdjacentHTML('beforebegin', html);
  bindItems(main);
}
function wire(main) {
  const go = id => { S.mode = 'sheet'; S.id = id; S.tab = 'sheets'; draw(main); };
  const nb = $('csNew'); if (nb) nb.onclick = () => { S.mode = 'new'; S.draft = blankDraft(); S.q = ''; S.hits = []; S.tab = 'sheets'; draw(main); };
  main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.mode = 'list'; S.edit = ''; draw(main); });
  main.querySelectorAll('[data-open]').forEach(tr => tr.onclick = () => go(tr.dataset.open));
  main.querySelectorAll('[data-reprint]').forEach(b => b.onclick = e => { e.stopPropagation(); openPrint(main, b.dataset.reprint); });
  main.querySelectorAll('[data-rprint]').forEach(b => b.onclick = e => { e.stopPropagation(); openReturn(main, b.dataset.rprint); });
  main.querySelectorAll('[data-sign]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const kind = b.dataset.kind || 'copy';
    const input = b.parentNode && b.parentNode.querySelector('[data-file="' + b.dataset.sign + '"][data-kind="' + kind + '"]');
    if (input) input.click();
  });
  main.querySelectorAll('[data-file]').forEach(input => {
    input.onclick = e => e.stopPropagation();
    input.onchange = () => {
      const file = input.files && input.files[0];
      const id = input.dataset.file;
      const kind = input.dataset.kind || 'copy';
      input.value = '';
      if (file) uploadSigned(main, id, file, kind);
    };
  });
  main.querySelectorAll('a.cssigned, a.csthumb').forEach(a => a.onclick = e => e.stopPropagation());
  const cl = $('csClosed'); if (cl) cl.onclick = () => { S.showClosed = !S.showClosed; draw(main); };
  main.querySelectorAll('[data-loose]').forEach(b => b.onclick = () => {
    S.mode = 'new'; S.draft = blankDraft([{ jo: b.dataset.loose || '', item_id: b.dataset.item || '', description: b.dataset.desc || '', value: '', client: b.dataset.client || '' }]);
    S.q = ''; S.hits = []; draw(main);
  });
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { S.edit = b.dataset.edit; S.tab = 'people'; draw(main); });
  const cancel = $('cgCancel'); if (cancel) cancel.onclick = () => { S.edit = ''; draw(main); };
  const cg = $('cgSave'); if (cg) cg.onclick = () => savePerson(main);
  const back = $('csBack'); if (back) back.onclick = () => {
    stopCam(); S.scan = null;
    if (S.mode === 'print' || S.mode === 'rprint') { S.mode = 'sheet'; draw(main); return; }
    S.mode = 'list'; S.pay = null; document.documentElement.classList.remove('cs-onprint'); draw(main);
  };
  const nm = $('csName'); if (nm) nm.oninput = () => { readDraft(); const p = personByName(nm.value); if (p && $('csPhone')) { S.draft.phone = p.phone || ''; $('csPhone').value = S.draft.phone; } };
  const q = $('csQ'); if (q) { q.oninput = () => { S.q = q.value; if (!S.note || S.note.kind !== 'scan') clearNote('add'); clearTimeout(qTimer); qTimer = setTimeout(() => search(main), 280); }; q.onkeydown = e => onScanKey(e, main, 'add', q); }
  main.querySelectorAll('[data-hit]').forEach(b => b.onclick = () => addHit(main, Number(b.dataset.hit)));
  bindItems(main);
  const save = $('csSave'); if (save) save.onclick = () => saveSheet(main);
  const scan = $('csScan'); if (scan) scan.onclick = () => {
    if (S.mode === 'new') {
      const field = $('csQ');
      const v = (field && field.value || '').trim();
      if (v) { clearTimeout(qTimer); if (field) field.value = ''; S.q = ''; pushScan(main, 'add', v); return; }
    }
    openScan(main);
  };
  const pr = $('csPrint'); if (pr) pr.onclick = () => openPrint(main, S.id);
  const rs = $('csReturn'); if (rs) rs.onclick = () => openReturn(main, S.id);
  const find = $('csFind'); if (find) find.onkeydown = e => onFindKey(e, main);
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
  $('csHits').innerHTML = S.hits.length ? `<div class="cshits">${S.hits.map((h, i) => `<button type="button" class="cshit" data-hit="${i}">${hitLabel(h)} ${esc(h.description || '')} <span class="muted">${esc(h.location || '')}${h.blocked ? ' · ' + esc(h.blocked) : ''}</span></button>`).join('')}</div>` : '<p class="muted">Nothing matches.</p>';
  $('csHits').querySelectorAll('[data-hit]').forEach(b => b.onclick = () => addHit(main, Number(b.dataset.hit)));
}
function addHit(main, i) {
  const h = (S.hits || [])[i]; if (!h || S.mode !== 'new' || !S.draft) return;
  if (h.blocked) { S.hits = []; setNote('dup', h.blocked, 'add'); beep('dup'); if ($('csQ')) $('csQ').value = ''; S.q = ''; return paintScan(main, 'csQ'); }
  readDraft();
  if (onDraft(h)) { setNote('dup', 'Already on this sheet · ' + (h.jo || h.item_id || 'that piece'), 'add'); beep('dup'); if ($('csQ')) $('csQ').value = ''; S.q = ''; return paintScan(main, 'csQ'); }
  S.draft.items.push({ jo: h.jo || '', item_id: h.item_id || '', description: h.description || '', value: '', client: h.client || '' });
  S.q = ''; S.hits = [];
  if ($('csQ')) $('csQ').value = '';
  setNote('ok', addedText(h), 'add');
  beep('ok');
  paintScan(main, 'csQ');
}
function fileMime(file) {
  const t = String(file.type || '').toLowerCase();
  if (t) return t;
  const n = String(file.name || '').toLowerCase();
  if (/\.pdf$/.test(n)) return 'application/pdf';
  if (/\.png$/.test(n)) return 'image/png';
  if (/\.webp$/.test(n)) return 'image/webp';
  if (/\.gif$/.test(n)) return 'image/gif';
  if (/\.heic$/.test(n) || /\.heif$/.test(n)) return 'image/heic';
  if (/\.jpe?g$/.test(n)) return 'image/jpeg';
  return '';
}
function readRaw(file, mime) {
  return new Promise((ok, no) => {
    if (file.size > 8 * 1024 * 1024) return no(new Error('That file is too large. Use a photo or a PDF under 8 MB.'));
    const fr = new FileReader();
    fr.onload = () => ok({ b64: String(fr.result || '').split(',')[1] || '', mime, name: file.name || '' });
    fr.onerror = () => no(new Error('Could not read that file'));
    fr.readAsDataURL(file);
  });
}
function shrinkSigned(file) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s));
      c.height = Math.max(1, Math.round(img.height * s));
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', 0.85);
      ok({ b64: data.split(',')[1] || '', mime: 'image/jpeg', name: String(file.name || 'signed').replace(/\.\w+$/, '') + '.jpg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); readRaw(file, fileMime(file) || 'image/jpeg').then(ok, no); };
    img.src = url;
  });
}
function packSigned(file) {
  const mime = fileMime(file);
  if (mime === 'application/pdf') return readRaw(file, mime);
  if (mime.indexOf('image/') === 0 && mime !== 'image/svg+xml') return shrinkSigned(file);
  return Promise.reject(new Error('Use a photo or a PDF'));
}
async function uploadSigned(main, id, file, kind) {
  if (S.busy || !id || !file) return;
  let packed;
  try { packed = await packSigned(file); }
  catch (e) { window.OYP.toast(e.message || 'Could not read that file'); return; }
  if (!packed.b64) return window.OYP.toast('Could not read that file');
  S.busy = true;
  const r = await window.OYP.call('consignSigned', { consignment_id: id, file_base64: packed.b64, mime: packed.mime, name: packed.name || '', kind: kind === 'return' ? 'return' : 'copy' });
  S.busy = false;
  if (!window.OYP.here()()) return;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not attach the file');
  const slip = kind === 'return';
  window.OYP.toast(r.replaced
    ? (slip ? 'Replaced the return slip. The previous file is still in Drive.' : 'Replaced the signed copy. The previous file is still in Drive.')
    : (slip ? 'Return slip attached' : 'Signed copy attached'));
  await reload(main);
}
async function saveSheet(main) {
  if (S.busy) return;
  readDraft();
  const d = S.draft;
  if (!d.items.length) return window.OYP.toast('Add at least one piece');
  if (!(d.name || '').trim()) { window.OYP.toast('Type the consignee\'s name'); if ($('csName')) $('csName').focus(); return; }
  const payload = { consignee_name: d.name.trim(), consignee_phone: d.phone || '', due_date: d.due || '', notes: d.sheetNotes || '', items: d.items.map(it => ({ jo: it.jo || '', item_id: it.item_id || '', description: it.description || '', value: prices() ? it.value : '' })) };
  S.busy = true;
  const r = await window.OYP.call('consignSave', payload);
  S.busy = false;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not save');
  window.OYP.toast('Saved ' + (r.consignment_id || ''));
  S.mode = 'print'; S.id = r.consignment_id || ''; S.draft = null; S.q = ''; S.hits = []; S.autoPrint = true;
  const loaded = await reload(main);
  if (!loaded) S.autoPrint = false;
}
function openPrint(main, id) {
  if (!id) return;
  S.mode = 'print'; S.id = id; S.tab = 'sheets'; S.pay = null; S.autoPrint = true;
  draw(main);
}
function openReturn(main, id) {
  if (!id) return;
  const s = sheetBy(id);
  if (!s || !hasReturned(s)) { window.OYP.toast('No returned pieces on that sheet yet'); return; }
  S.mode = 'rprint'; S.id = id; S.tab = 'sheets'; S.pay = null; S.autoPrint = true;
  draw(main);
}
async function mark(main, lineId, status) {
  if (S.busy) return;
  if (!confirm(status === 'sold' ? 'Mark this item sold? The consignee then owes the agreed value.' : 'Mark this item returned?')) return;
  S.busy = true;
  const r = await window.OYP.call('consignItem', { line_id: lineId, status: status, consignment_id: S.id || '' });
  S.busy = false;
  if (!r || !r.ok) return window.OYP.toast((r && r.error) || 'Could not update');
  const back = status === 'returned' && r.location ? ' · back to ' + r.location : '';
  window.OYP.toast((status === 'sold' ? 'Marked sold' : 'Marked returned') + back + (r.closed ? ' · sheet closed' : ''));
  S.pay = null;
  setNote('ok', (status === 'sold' ? 'Marked sold' : 'Marked returned') + back, 'mark');
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
  const el = S.mode === 'new' ? $('csQ') : (S.mode === 'sheet' ? $('csBackCode') : (S.mode === 'list' && S.tab === 'sheets' ? $('csFind') : null));
  if (el) el.focus();
}
function setNote(kind, text, where, extra) {
  extra = extra || {};
  S.note = { kind: kind, text: text, where: where, dot: extra.dot || '', sub: extra.sub || '', id: extra.id || '' };
}
function clearNote(where) {
  if (!S.note || S.note.where !== where) return;
  S.note = null;
  const n = $('csScanNote'); if (n) { n.textContent = ''; n.className = 'csnote'; }
}
function addedText(h) { return 'Added ' + (h.jo || h.item_id || 'piece') + (h.description ? ' · ' + h.description : ''); }
function onDraft(h, exceptId) {
  return !!(S.draft && (S.draft.items || []).some(it => {
    if (exceptId && it.pending === exceptId) return false;
    return samePiece(it, h);
  }));
}
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
function onFindKey(e, main) {
  if (!isEnter(e)) return;
  e.preventDefault();
  const v = e.target.value;
  e.target.value = '';
  commitFind(main, v);
}
function matchSheetId(raw) {
  const want = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^CS-[A-Z0-9-]{1,40}$/.test(want)) return '';
  const hit = ((S.r && S.r.sheets) || []).find(s => String(s.consignment_id || '').toUpperCase() === want);
  return hit ? hit.consignment_id : '';
}
function findOutPiece(spec) {
  const hits = [];
  ((S.r && S.r.sheets) || []).forEach(s => (s.items || []).forEach(it => {
    if (it.status !== 'consigned') return;
    if (spec.jo) {
      const p = joParse(it.jo || '');
      if (p && p.key === spec.jo.key) hits.push({ sheet: s, item: it });
    } else if (spec.exact && it.item_id && String(it.item_id).toLowerCase() === spec.q.toLowerCase()) hits.push({ sheet: s, item: it });
  }));
  const ids = [];
  hits.forEach(h => { if (ids.indexOf(h.sheet.consignment_id) < 0) ids.push(h.sheet.consignment_id); });
  if (!hits.length) return null;
  if (ids.length > 1) return { many: true };
  return hits[0];
}
function commitFind(main, raw) {
  const text = String(raw || '').trim();
  if (!text) { setNote('bad', 'Type a CS number or scan a JO', 'find'); beep('bad'); draw(main); focusScan(); return; }
  const id = matchSheetId(text);
  if (id) {
    S.mode = 'sheet'; S.id = id; S.tab = 'sheets'; S.pay = null;
    setNote('ok', 'Opened ' + id, 'mark');
    beep('ok');
    draw(main);
    return;
  }
  const spec = scanSpec(text);
  if (!spec.jo && !spec.exact) { setNote('bad', 'Type a CS number or scan a JO', 'find'); beep('bad'); draw(main); focusScan(); return; }
  const found = findOutPiece(spec);
  if (!found) { setNote('bad', 'No piece still out matches ' + (spec.jo ? spec.jo.text : spec.q), 'find'); beep('bad'); draw(main); focusScan(); return; }
  if (found.many) { setNote('dup', 'More than one sheet has that piece. Type the CS number.', 'find'); beep('dup'); draw(main); focusScan(); return; }
  S.mode = 'sheet'; S.id = found.sheet.consignment_id; S.tab = 'sheets'; S.pay = null;
  setNote('ok', (found.item.jo || found.item.item_id || 'Piece') + ' is still out', 'mark');
  beep('ok');
  draw(main);
}
function shortReason(text) { return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80); }
function ownsScan(job) { return !!(job && job.id && job.id === scanShown); }
function tellScan(job, kind, text, extra) {
  extra = extra || {};
  if (!job || !job.id || ownsScan(job)) {
    setNote(kind, text, 'add', extra);
    paintNote();
  } else if (kind !== 'ok' && window.OYP.toast) window.OYP.toast(text + (extra.sub ? ' · ' + extra.sub : ''));
  beep(kind === 'ok' ? 'ok' : kind === 'dup' ? 'dup' : 'bad');
}
function dropPending(id) {
  if (!S.draft || !id) return false;
  const i = S.draft.items.findIndex(it => it.pending === id);
  if (i < 0) return false;
  S.draft.items.splice(i, 1);
  return true;
}
function paintHits(main) {
  const box = $('csHits');
  if (!box) return;
  const esc = window.OYP.esc;
  const hits = S.hits || [];
  box.innerHTML = hits.length ? `<div class="cshits">${hits.map((h, i) => `<button type="button" class="cshit" data-hit="${i}">${hitLabel(h)} ${esc(h.description || '')} <span class="muted">${esc(h.location || '')}${h.blocked ? ' · ' + esc(h.blocked) : ''}</span></button>`).join('')}</div>` : '';
  box.querySelectorAll('[data-hit]').forEach(b => b.onclick = () => addHit(main, Number(b.dataset.hit)));
}
function pushScan(main, kind, raw) {
  const code = String(raw || '').trim();
  if (!code) {
    if (kind === 'add') {
      setNote('bad', 'Not scanned', 'add', { dot: 'bad', sub: 'type a JO or item number' });
      paintNote(); beep('bad'); focusScan();
      return;
    }
    setNote('bad', 'Type or scan a JO or item number', 'mark');
    beep('bad');
    paintScan(main, 'csBackCode');
    return;
  }
  if (kind === 'add') {
    const spec = scanSpec(code);
    const label = (spec.jo && spec.jo.text) || spec.q;
    if (!spec.q || (spec.q.length < 2 && !spec.jo)) {
      setNote('bad', 'Not scanned', 'add', { dot: 'bad', sub: 'type a JO or item number' });
      paintNote(); beep('bad'); focusScan();
      return;
    }
    const id = 's' + (++scanSeq);
    readDraft();
    const box = $('csQ');
    if (box) box.value = '';
    S.q = '';
    if (S.draft) S.draft.items.push({ jo: spec.jo ? spec.jo.text : '', item_id: spec.jo ? '' : spec.q, description: '', value: '', client: '', pending: id });
    scanShown = id;
    setNote('scan', 'Scanned ' + label, 'add', { dot: 'ok', sub: 'adding…', id: id });
    paintNote();
    rebuildItems(main);
    focusScan();
    scanQueue.push({ kind: 'add', code: code, id: id, label: label, status: 'returned' });
    pumpScan(main);
    return;
  }
  scanQueue.push({ kind, code, status: S.markAs === 'sold' ? 'sold' : 'returned' });
  pumpScan(main);
}
async function pumpScan(main) {
  if (scanBusy) return;
  scanBusy = true;
  try {
    while (scanQueue.length) {
      const job = scanQueue.shift();
      try {
        if (job.kind === 'mark') await commitMark(main, job.code, job.status);
        else await commitAdd(main, job.code, job);
      } catch (e) {
        if (job.kind === 'add') {
          readDraft();
          dropPending(job.id);
          rebuildItems(main);
          tellScan(job, 'bad', 'Not scanned', { dot: 'bad', sub: 'could not search' });
        }
      }
    }
  } finally {
    scanBusy = false;
    focusScan();
  }
}
async function commitAdd(main, raw, job) {
  job = job || {};
  const spec = scanSpec(raw);
  const id = job.id || '';
  const live = window.OYP.here();
  const r = await window.OYP.call('consignSearch', { q: spec.q });
  if (!live() || S.mode !== 'new' || !S.draft) return;
  readDraft();
  if (id && !S.draft.items.some(it => it.pending === id)) {
    if (ownsScan(job) && !scanQueue.length) {
      S.note = null;
      const n = $('csScanNote');
      if (n) { n.textContent = ''; n.className = 'csnote'; }
    }
    return;
  }
  const fail = sub => {
    dropPending(id);
    S.hits = [];
    rebuildItems(main);
    paintHits(main);
    tellScan(job, 'bad', 'Not scanned', { dot: 'bad', sub: sub });
  };
  if (!r || !r.ok) { fail(shortReason((r && r.error) || 'could not search')); return; }
  const choice = chooseHit(r.hits || [], spec);
  if (choice.none) { fail('not found'); return; }
  if (choice.many) {
    dropPending(id);
    S.hits = choice.hits || r.hits || [];
    rebuildItems(main);
    paintHits(main);
    tellScan(job, 'dup', 'More than one match. Tap the piece.');
    return;
  }
  if (choice.hit.blocked) {
    dropPending(id);
    S.hits = [];
    rebuildItems(main);
    paintHits(main);
    tellScan(job, 'dup', choice.hit.blocked);
    return;
  }
  if (onDraft(choice.hit, id)) {
    dropPending(id);
    S.hits = [];
    rebuildItems(main);
    paintHits(main);
    tellScan(job, 'dup', 'Already on this sheet · ' + (choice.hit.jo || choice.hit.item_id || 'that piece'));
    return;
  }
  const pending = id ? S.draft.items.find(it => it.pending === id) : null;
  const row = pending || { value: '' };
  const h = choice.hit;
  row.jo = h.jo || '';
  row.item_id = h.item_id || '';
  row.description = h.description || '';
  row.client = h.client || '';
  if (!row.value) row.value = '';
  delete row.pending;
  if (!pending) S.draft.items.push(row);
  S.hits = [];
  rebuildItems(main);
  paintHits(main);
  tellScan(job, 'ok', addedText(h));
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
    const back = status !== 'sold' && r.location ? ' · back to ' + r.location : '';
    setNote('ok', label + (spec.jo ? ' · ' + spec.jo.text : ' · ' + spec.q) + back + (r.closed ? ' · sheet closed' : ''), where);
    beep('ok');
    window.OYP.toast(label + back);
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

/* Same wedge as Inventory: the sticker scanner types fast and presses Enter while no field is focused.
   A focused scan box still takes the scan, including a URL. */
const SCAN_GAP = 50, SCAN_ENTER = 80, SCAN_MAX = 400;
let wedgeBuf = '', wedgeAt = 0;
function wedgeField(el) { return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)); }
document.addEventListener('keydown', e => {
  if (!S.r || S.pay || !/^#\/consignment(?:$|[/?])/.test(location.hash) || wedgeField(document.activeElement) || e.isComposing) return;
  if (e.key === 'Enter' || e.key === 'NumpadEnter') {
    const raw = wedgeBuf, fast = !!(raw && Date.now() - wedgeAt <= SCAN_ENTER);
    wedgeBuf = '';
    if (!fast) return;
    e.preventDefault(); e.stopPropagation();
    const main = document.getElementById('main');
    if (!main) return;
    if (S.scan) { finishScan(main, raw); return; }
    if (S.mode === 'new') { pushScan(main, 'add', raw); return; }
    if (S.mode === 'sheet') { pushScan(main, 'mark', raw); return; }
    commitFind(main, raw);
    return;
  }
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  const now = Date.now();
  if (wedgeBuf && now - wedgeAt > SCAN_GAP) wedgeBuf = '';
  wedgeBuf += e.key; wedgeAt = now;
  if (wedgeBuf.length > SCAN_MAX) wedgeBuf = wedgeBuf.slice(-SCAN_MAX);
}, true);

window.OYPConsign = { render };
})();
