/* OYP back office: Inventory count (#/count).
   The UHF handheld is a keyboard wedge. It types an EPC (hex) and Enter into the focused field.
   Reads stay in this page until Finish. A repeat EPC is ignored on the phone, before any request.
   Server: paste/InventoryCount.gs (countLoad, linkEpc, countFinish). See paste/SETUP-inventory-count.txt. */
(function (root) {
'use strict';

function normEpc(raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase().replace(/[\s:\-]+/g, '');
  if (!/^[0-9A-F]{8,128}$/.test(s)) return '';
  return s;
}
function normJo(raw) {
  const s = String(raw == null ? '' : raw).trim().toUpperCase().replace(/\s+/g, '');
  let m = s.match(/^(\d{2})-(\d{3,4})([A-Z])?$/);
  if (m) return m[1] + '-' + m[2] + (m[3] || '');
  m = s.match(/^(\d{2})(\d{3,4})([A-Z])?$/);
  if (m) return m[1] + '-' + m[2] + (m[3] || '');
  return '';
}
function searchItems(items, q) {
  const list = items || [];
  const raw = String(q || '').trim();
  if (!raw) return list.slice();
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  const full = normJo(compact);
  if (full && /[A-Z]$/.test(full)) return list.filter(it => normJo(it.jo) === full);
  if (full) return list.filter(it => {
    const j = normJo(it.jo);
    if (j === full) return true;
    return j.indexOf(full) === 0 && /^[A-Z]$/.test(j.slice(full.length));
  });
  return list.filter(it => [normJo(it.jo), it.item_id, it.description, it.client].join(' ').toUpperCase().indexOf(compact) >= 0);
}
function openSession(items) {
  const list = (items || []).map(it => {
    const copy = Object.assign({}, it);
    copy.id = String(it.id || it.item_id || it.jo || '');
    copy.jo = normJo(it.jo) || String(it.jo || '').trim();
    copy.epc = normEpc(it.epc);
    return copy;
  });
  const byEpc = new Map();
  list.forEach(it => { if (it.epc && !byEpc.has(it.epc)) byEpc.set(it.epc, it); });
  return { items: list, byEpc: byEpc, seen: new Set(), order: [] };
}
function applyRead(session, raw) {
  const epc = normEpc(raw);
  if (!epc) return { accepted: false, dup: false, epc: '' };
  if (session.seen.has(epc)) return { accepted: false, dup: true, epc: epc };
  session.seen.add(epc);
  session.order.push(epc);
  return { accepted: true, dup: false, epc: epc, item: session.byEpc.get(epc) || null };
}
function linkLocal(session, id, epc) {
  const e = normEpc(epc);
  const item = session && session.items.find(it => it.id === String(id));
  if (!item || !e) return false;
  const owner = session.byEpc.get(e);
  if (owner && owner !== item) return false;
  if (item.epc && item.epc !== e && session.byEpc.get(item.epc) === item) session.byEpc.delete(item.epc);
  item.epc = e;
  session.byEpc.set(e, item);
  return true;
}
function buckets(session) {
  const found = [], unknown = [], foundIds = new Set();
  (session.order || []).forEach(epc => {
    const item = session.byEpc.get(epc);
    if (item) { found.push({ epc: epc, item: item }); foundIds.add(item.id); }
    else unknown.push({ epc: epc });
  });
  const missing = session.items.filter(it => !foundIds.has(it.id));
  return { found: found, missing: missing, unknown: unknown, read: session.order.length };
}
function counts(session) {
  const b = buckets(session);
  return { found: b.found.length, missing: b.missing.length, unknown: b.unknown.length, read: b.read };
}
function finishPayload(session, markMissing) {
  const b = buckets(session);
  return {
    found: b.found.map(x => ({ id: x.item.id, item_id: x.item.item_id || '', jo: x.item.jo, epc: x.epc })),
    missing: markMissing ? b.missing.map(it => ({ id: it.id, item_id: it.item_id || '', jo: it.jo })) : [],
    mark_missing: !!markMissing,
    unknown: b.unknown.map(x => x.epc)
  };
}
function linkConfirm(jo) { return 'Link this tag to ' + jo + '?'; }
function linkedText(jo) { return 'Linked to ' + jo; }
function saveConfirm(n) {
  return 'Save this count? ' + n + ' ' + (n === 1 ? 'item' : 'items') + ' found. Nothing is written until you finish.';
}
function missingConfirm(n) {
  return 'Mark ' + n + ' ' + (n === 1 ? 'item' : 'items') + ' missing? They were expected on hand and were not read. Cancel leaves them unchanged.';
}
function decideFinish(foundN, missingN, ask) {
  if (!ask(saveConfirm(foundN))) return null;
  let mark = false;
  if (missingN) mark = !!ask(missingConfirm(missingN));
  return { save: true, mark_missing: mark };
}

const api = {
  normEpc: normEpc, normJo: normJo, searchItems: searchItems, openSession: openSession, applyRead: applyRead,
  linkLocal: linkLocal, buckets: buckets, counts: counts, finishPayload: finishPayload,
  linkConfirm: linkConfirm, linkedText: linkedText, saveConfirm: saveConfirm, missingConfirm: missingConfirm,
  decideFinish: decideFinish
};
root.OYPCount = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof document === 'undefined') return;

const ST = {
  main: null, user: null, items: null, session: null, mode: 'idle', linkQ: '', linkPick: null,
  linkMsg: '', note: '', err: '', loading: false, busy: false, focus: '', refocus: 0, saved: ''
};
const PASTE = 'This page needs the InventoryCount paste in Apps Script (see paste/SETUP-inventory-count.txt).';

function esc(s) {
  if (root.OYP && root.OYP.esc) return root.OYP.esc(s);
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function pieceHtml(client, jo) {
  if (root.OYP && root.OYP.piece) return root.OYP.piece(client, jo);
  const id = jo || '';
  return id ? '<b class="cn">' + esc(id) + '</b>' : '';
}
function onCount() { return /^#\/count(?:$|[/?])/.test(location.hash); }
function loadErr(r) {
  if (!r || r.error === 'Unknown action') return PASTE;
  return (r && r.error) || 'Could not load';
}
function toast(msg) { if (root.OYP && root.OYP.toast) root.OYP.toast(msg); }
function safePhoto(p) {
  p = String(p || '');
  if (/^https:\/\/[^\s'"]+$/.test(p) || /^\/[^\s'"]+$/.test(p)) return p;
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(p)) return p;
  return '';
}
function liveItems() {
  return (ST.session && ST.session.items) || ST.items || [];
}
function cardHtml(it, pick) {
  const jo = normJo(it.jo) || String(it.jo || '');
  const src = safePhoto(it.photo);
  const pid = String(it.photo_id || '');
  const ph = src
    ? '<div class="icph has" style="background-image:url(\'' + src + '\')" data-jo="' + esc(jo) + '"></div>'
    : '<div class="icph" data-jo="' + esc(jo) + '" data-pid="' + esc(pid) + '"><span>' + (pid ? '' : 'No photo') + '</span></div>';
  const body = '<div class="icb">' + pieceHtml(it.client, jo) + (it.description ? '<div class="kd">' + esc(it.description) + '</div>' : '') + (it.epc ? '<div class="icepc">' + esc(it.epc) + '</div>' : '') + '</div>';
  if (pick) return '<button type="button" class="iccard tap" data-pick="' + esc(it.id) + '">' + ph + body + '</button>';
  return '<article class="iccard">' + ph + body + '</article>';
}
function unknownHtml(epc) {
  return '<article class="iccard"><div class="icph"><span>No item</span></div><div class="icb"><b class="icepc">' + esc(epc) + '</b><div class="kd">No linked item</div></div></article>';
}
function sectionHtml(id, title, rows, empty) {
  const n = rows.length;
  const inner = n ? '<div class="icgrid">' + rows.join('') + '</div>' : '<p class="muted">' + empty + '</p>';
  return '<section class="icsec" id="' + id + '" data-count="' + n + '"><h3>' + title + ' <b>' + n + '</b></h3>' + inner + '</section>';
}
function hitsHtml() {
  const hits = searchItems(ST.items || [], ST.linkQ);
  if (!String(ST.linkQ || '').trim()) return '<p class="muted">Type the full JO, like 26-287B.</p>';
  if (!hits.length) return '<p class="muted">No item with that JO.</p>';
  return '<div class="icgrid">' + hits.map(it => cardHtml(it, true)).join('') + '</div>';
}
function buttons(parts) { return '<div class="icacts">' + parts.join('') + '</div>'; }
function wedgeHtml() {
  return '<input id="icWedge" class="icwedge" name="oyp-epc-wedge" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="none" aria-label="Tag read" tabindex="0">';
}
function pageHtml() {
  let body = '';
  if (ST.saved) body += '<p class="icmsg" role="status">' + esc(ST.saved) + '</p>';
  if (ST.err) body += '<p class="muted">' + esc(ST.err) + '</p>';
  if (ST.loading && !ST.items) {
    body += '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  } else if (ST.mode === 'link') {
    const jo = ST.linkPick ? (normJo(ST.linkPick.jo) || ST.linkPick.jo) : '';
    const acts = ['<button type="button" class="pill outline" id="icBack">Back</button>'];
    body += '<p class="muted">Search the full JO, then scan one tag.</p>';
    if (ST.linkMsg) body += '<p class="icmsg" id="icLinked" role="status">' + esc(ST.linkMsg) + '</p>';
    if (!ST.linkPick) {
      body += '<input id="icQ" class="icq" value="' + esc(ST.linkQ) + '" placeholder="26-287B" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Search JO">';
      body += buttons(acts);
      body += '<div id="icHits">' + hitsHtml() + '</div>';
    } else {
      body += '<p class="icpickhint">Scan one tag for <b>' + esc(jo) + '</b></p>';
      body += buttons(['<button type="button" class="pill outline" id="icAnother">Choose another</button>', acts[0]]);
      body += cardHtml(ST.linkPick, false);
      body += wedgeHtml();
    }
    if (ST.session) body += counterHtml() + '<p class="icnote" role="status">' + esc(ST.note) + '</p>';
  } else if (ST.mode === 'count' && ST.session) {
    const b = buckets(ST.session);
    body += '<p class="iclisten">Ready for tags</p>';
    body += counterHtml();
    body += buttons([
      '<button type="button" class="pill" id="icFinish">Finish</button>',
      '<button type="button" class="pill outline" id="icLink">Link tag</button>'
    ]);
    body += '<p class="icnote" role="status">' + esc(ST.note) + '</p>';
    body += '<div class="iclists">';
    body += sectionHtml('icFound', 'Found', b.found.map(x => cardHtml(x.item, false)), 'No matched tags yet.');
    body += sectionHtml('icMissing', 'Missing', b.missing.map(it => cardHtml(it, false)), 'Every on-hand item has been read.');
    body += sectionHtml('icUnknown', 'Unknown', b.unknown.map(x => unknownHtml(x.epc)), 'No unknown tags.');
    body += '</div>';
    body += wedgeHtml();
  } else {
    const n = ST.items ? ST.items.length : 0;
    body += '<p class="muted">Count the pieces on hand with the handheld. Each tag types its EPC, then Enter. A repeat is skipped. Nothing is written until you finish.</p>';
    body += buttons([
      '<button type="button" class="pill" id="icStart">Start count</button>',
      '<button type="button" class="pill outline" id="icLink">Link tag</button>'
    ]);
    if (ST.items) body += '<p class="icmeta">' + n + ' on hand</p>';
  }
  return '<div class="ic"><div class="dhead"><h2>Inventory count</h2></div>' + body + '</div>';
}
function counterHtml() {
  const n = ST.session ? ST.session.order.length : 0;
  return '<p class="iccount" aria-live="polite"><b id="icLive">' + n + '</b><span>tags read</span></p>';
}
function focusWedge() {
  const el = document.getElementById('icWedge');
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
}
function watchPhotos(main) {
  if (!root.OYPPhotos || !main) return;
  root.OYPPhotos.watch(main, {
    sel: '.icph[data-pid]',
    item: el => ({ jo: el.getAttribute('data-jo') || '', id: el.getAttribute('data-pid') || '', kind: 'piece', size: 300, legacy: 'inv' }),
    paint: (el, src) => {
      if (!src) return;
      el.style.backgroundImage = 'url("' + String(src).replace(/"/g, '') + '")';
      el.classList.add('has');
      const s = el.querySelector('span');
      if (s) s.remove();
    }
  });
}
function paint() {
  const main = ST.main;
  if (!main || !onCount()) return;
  const y = window.scrollY;
  main.innerHTML = pageHtml();
  main.onclick = onClick;
  wireWedge();
  wireSearch();
  if (ST.focus === 'search') {
    const q = document.getElementById('icQ');
    if (q) { q.focus(); const n = q.value.length; try { q.setSelectionRange(n, n); } catch (e) {} }
  } else if (ST.focus === 'wedge' || ST.mode === 'count' || (ST.mode === 'link' && ST.linkPick)) focusWedge();
  ST.focus = '';
  window.scrollTo(0, y);
  watchPhotos(main);
}
function wireSearch() {
  const q = document.getElementById('icQ');
  if (!q) return;
  q.addEventListener('input', () => {
    ST.linkQ = q.value;
    const box = document.getElementById('icHits');
    if (box) box.innerHTML = hitsHtml();
  });
  q.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    pickQuery();
  });
}
function wireWedge() {
  const el = document.getElementById('icWedge');
  if (!el) return;
  const take = () => {
    const raw = el.value;
    el.value = '';
    onWedge(raw);
  };
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== 'Tab' && e.keyCode !== 13) return;
    e.preventDefault();
    take();
  });
  el.addEventListener('input', () => {
    if (!/[\r\n]/.test(el.value)) return;
    el.value = el.value.replace(/[\r\n]+/g, '');
    take();
  });
  el.addEventListener('blur', () => {
    clearTimeout(ST.refocus);
    ST.refocus = setTimeout(() => {
      if (!onCount()) return;
      if (ST.mode !== 'count' && !(ST.mode === 'link' && ST.linkPick)) return;
      const a = document.activeElement;
      if (a && a !== el && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
      focusWedge();
    }, 200);
  });
}
function pickQuery() {
  const hits = searchItems(ST.items || [], ST.linkQ);
  const full = normJo(ST.linkQ);
  let hit = full ? hits.find(it => normJo(it.jo) === full) : null;
  if (!hit && hits.length === 1) hit = hits[0];
  if (!hit) { ST.note = 'Type the full JO, like 26-287B'; paint(); return; }
  ST.linkPick = hit;
  ST.note = '';
  ST.focus = 'wedge';
  paint();
}
function onClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#icStart')) { onStart(); return; }
  if (t.closest('#icLink')) { onLink(); return; }
  if (t.closest('#icFinish')) { onFinish(); return; }
  if (t.closest('#icBack')) {
    ST.mode = ST.session ? 'count' : 'idle';
    ST.linkPick = null;
    ST.linkMsg = '';
    ST.focus = ST.session ? 'wedge' : '';
    paint();
    return;
  }
  if (t.closest('#icAnother')) {
    ST.linkPick = null;
    ST.focus = 'search';
    paint();
    return;
  }
  const pick = t.closest('[data-pick]');
  if (pick) {
    const id = pick.getAttribute('data-pick');
    ST.linkPick = (ST.items || []).find(it => String(it.id) === id) || null;
    ST.focus = 'wedge';
    paint();
  }
}
function onWedge(raw) {
  if (ST.mode === 'link') {
    if (ST.linkPick) onLinkScan(normEpc(raw));
    return;
  }
  if (!ST.session || ST.mode !== 'count') return;
  const res = applyRead(ST.session, raw);
  if (!res.epc) return;
  ST.note = res.dup ? 'Already read' : '';
  paint();
}
async function onLinkScan(epc) {
  if (!epc || ST.busy || !ST.linkPick) return;
  const pick = ST.linkPick;
  const jo = normJo(pick.jo) || pick.jo || pick.item_id || '';
  const pool = liveItems();
  const owner = pool.find(it => normEpc(it.epc) === epc && String(it.id) !== String(pick.id));
  if (owner) {
    ST.linkMsg = '';
    ST.note = 'That tag is already linked to ' + (normJo(owner.jo) || owner.jo || owner.item_id);
    paint();
    return;
  }
  if (normEpc(pick.epc) !== epc) {
    if (!window.confirm(linkConfirm(jo))) { ST.focus = 'wedge'; paint(); return; }
    ST.busy = true;
    const r = await root.OYP.call('linkEpc', { id: pick.id, item_id: pick.item_id || '', jo: jo, epc: epc });
    ST.busy = false;
    if (!onCount()) return;
    if (!r || !r.ok) { ST.note = (r && r.error) || 'Could not link'; ST.focus = 'wedge'; paint(); return; }
    const src = (ST.items || []).find(it => String(it.id) === String(pick.id));
    if (src) src.epc = epc;
    if (ST.session) { linkLocal(ST.session, pick.id, epc); applyRead(ST.session, epc); }
    ST.linkMsg = (r.message && r.message.indexOf('Linked to ') === 0) ? r.message : linkedText(jo);
  } else {
    if (ST.session) applyRead(ST.session, epc);
    ST.linkMsg = linkedText(jo);
  }
  ST.linkPick = null;
  ST.linkQ = '';
  ST.note = '';
  ST.focus = 'search';
  paint();
}
async function onStart() {
  if (ST.busy) return;
  ST.busy = true;
  ST.saved = '';
  const r = await root.OYP.call('countLoad');
  ST.busy = false;
  if (!onCount()) return;
  if (!r || !r.ok) { toast(loadErr(r)); return; }
  ST.items = normalizeItems(r.items);
  ST.session = openSession(ST.items);
  ST.mode = 'count';
  ST.note = '';
  ST.linkMsg = '';
  ST.linkPick = null;
  ST.err = '';
  ST.focus = 'wedge';
  paint();
}
async function onLink() {
  if (ST.busy) return;
  if (!ST.items) {
    ST.busy = true;
    const r = await root.OYP.call('countLoad');
    ST.busy = false;
    if (!onCount()) return;
    if (!r || !r.ok) { toast(loadErr(r)); return; }
    ST.items = normalizeItems(r.items);
  }
  ST.mode = 'link';
  ST.linkQ = '';
  ST.linkPick = null;
  ST.note = '';
  ST.saved = '';
  ST.focus = 'search';
  paint();
}
async function onFinish() {
  if (!ST.session || ST.busy) return;
  const b = buckets(ST.session);
  const decision = decideFinish(b.found.length, b.missing.length, msg => window.confirm(msg));
  if (!decision) { ST.focus = 'wedge'; paint(); return; }
  const body = finishPayload(ST.session, decision.mark_missing);
  ST.busy = true;
  const r = await root.OYP.call('countFinish', body);
  ST.busy = false;
  if (!onCount()) return;
  if (!r || !r.ok) { toast((r && r.error) || 'Could not save'); ST.focus = 'wedge'; paint(); return; }
  const miss = decision.mark_missing ? b.missing.length : 0;
  ST.saved = 'Saved. ' + b.found.length + ' found' + (miss ? '. ' + miss + ' marked missing' : '') + '.';
  ST.session = null;
  ST.mode = 'idle';
  ST.note = '';
  ST.linkMsg = '';
  ST.items = null;
  paint();
  ST.loading = true;
  const again = await root.OYP.call('countLoad');
  ST.loading = false;
  if (!onCount()) return;
  if (again && again.ok) ST.items = normalizeItems(again.items);
  paint();
}
function normalizeItems(items) {
  return (items || []).map(it => Object.assign({}, it, {
    id: String(it.id || it.item_id || it.jo || ''),
    jo: normJo(it.jo) || String(it.jo || '').trim(),
    epc: normEpc(it.epc)
  }));
}
async function render(main, user) {
  ST.main = main;
  ST.user = user;
  const live = root.OYP && root.OYP.here ? root.OYP.here() : () => true;
  if (!ST.items && !ST.loading) {
    ST.loading = true;
    ST.err = '';
    paint();
    const r = await root.OYP.call('countLoad');
    ST.loading = false;
    if (!live() || !onCount()) return;
    if (!r || !r.ok) { ST.err = loadErr(r); paint(); return; }
    ST.items = normalizeItems(r.items);
  }
  if (!live() || !onCount()) return;
  paint();
}
api.render = render;
})(typeof window !== 'undefined' ? window : globalThis);
