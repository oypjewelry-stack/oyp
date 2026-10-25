/* OYP one-link app: sign in (first name + 4-digit code), role-based home. Static, no build step. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
const qs = new URLSearchParams(location.search);
if (qs.get('api')) localStorage.setItem('oypApi', qs.get('api'));
const API = () => localStorage.getItem('oypApi') || DEFAULT_API;
const K = { s: 'oypSession', u: 'oypUser', exp: 'oypSessionExp', dev: 'oypDevice' };
if (!localStorage.getItem(K.dev)) {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  localStorage.setItem(K.dev, 'd-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''));
}
const device = () => localStorage.getItem(K.dev);

async function net(action, data) {
  let r;
  try {
    const res = await fetch(API(), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, session: localStorage.getItem(K.s) || '', device_id: device() }, data)) });
    r = await res.json();
  } catch (e) { return { ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }; }
  if (r && r.error === 'Missing JO number') return { ok: false, error: 'The server has not been updated for sign-in yet.', code: 'OLD_BACKEND' };
  if (r && r.code === 'NO_SESSION' && action !== 'login') { clearSession(); route(); }
  return r;
}

/* ---------- page-data cache (stale-while-revalidate) ----------
   Every Apps Script call takes 3-9 s, so the main read of each page is kept in localStorage under a key tied to the
   signed-in session (a hash of the session token, never the token itself). A page opens at once from it, the server is
   asked again in the background, and the page redraws if the answer changed (unless the user already started using it).
   Cleared on log in, log out, session expiry and after any change (save / move / confirm ...), so a save always re-reads. */
const CACHED = { dashboard: 1, todoList: 1, contactList: 1, jobReviewList: 1, costRates: 1, priceGet: 1, invList: 1, prodBoard: 1, matList: 1,
  pplList: 1, admShopList: 1, payData: 1, settingsGet: 1, apptList: 1, listUsers: 1, prodWorkers: 1, admCustList: 1, consignList: 1, joInboxList: 1 };
const READS = Object.assign({ me: 1, admCustAudit: 1, apptClients: 1, costQuotes: 1, dashDrill: 1, invThumbs: 1, jobClientSearch: 1, jobPhoto: 1,
  jobSearch: 1, matHistory: 1, payReceipt: 1, priceHistory: 1, priceJobCost: 1, prodJob: 1, prodPhoto: 1, photoThumbs: 1, photoFile: 1, portalSteps: 1, consignSearch: 1, printQueue: 1, countLoad: 1, joInboxPhoto: 1, joInboxStatus: 1 }, CACHED); // countLoad, printQueue, photoThumbs, photoFile, joInboxPhoto, and joInboxStatus are fresh (not in CACHED). linkEpc and countFinish stay writes. printMark, printEnqueue, and printReprint stay writes. joInboxConfirm, joInboxFix, joInboxDiscard, and joInboxPush stay writes.
const C = { mem: new Map(), fly: new Map(), gen: 0, servedStale: 0, touched: 0, redraw: 0, busy: 0 };
const FRESH = 20e3, MAX_AGE = 12 * 36e5, CP = 'oypC1:';
const ns = () => { const t = localStorage.getItem(K.s) || ''; let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return CP + (h >>> 0).toString(36) + ':'; };
const ckey = (action, data) => ns() + action + ':' + JSON.stringify(data || {});
function cacheClear() {
  C.mem.clear(); C.fly.clear(); C.gen++;
  try { Object.keys(localStorage).filter(k => k.startsWith(CP)).forEach(k => localStorage.removeItem(k)); } catch (_) {}
}
function cacheGet(k) {
  let e = C.mem.get(k);
  if (!e) { try { const raw = localStorage.getItem(k); if (raw) { e = JSON.parse(raw); C.mem.set(k, e); } } catch (_) {} }
  return e && Date.now() - e.t < MAX_AGE ? e : null;
}
function cachePut(k, s) {
  const e = { t: Date.now(), s }; C.mem.set(k, e);
  try { localStorage.setItem(k, JSON.stringify(e)); } catch (_) { /* storage full: memory only */ }
}
let bar = 0; const syncBar = d => { bar = Math.max(0, bar + d); document.documentElement.classList.toggle('oyp-sync', bar > 0); }; // thin top bar: the page on screen is refreshing
// one request per key at a time: a second caller (prefetch + page, or two tiles) shares the first one's answer
function fetchCached(action, data, k) {
  if (C.fly.has(k)) return C.fly.get(k);
  const gen = C.gen; C.busy++;
  const p = net(action, data).then(r => {
    const s = JSON.stringify(r == null ? { ok: false, error: 'Could not load' } : r);
    if (r && r.ok && gen === C.gen && ns() === k.slice(0, ns().length)) cachePut(k, s);
    return s;
  }).finally(() => { if (C.fly.get(k) === p) C.fly.delete(k); C.busy--; });
  C.fly.set(k, p); return p;
}
async function call(action, data = {}) {
  if (action === 'login' || action === 'logout') cacheClear();
  if (!READS[action]) { cacheClear(); const r = await net(action, data); cacheClear(); return r; } // a change: next reads go to the server
  if (!CACHED[action] || !user()) return net(action, data);
  const k = ckey(action, data), e = cacheGet(k);
  if (!e) return JSON.parse(await fetchCached(action, data, k));
  if (Date.now() - e.t > FRESH) { // show what we have now, refresh in the background
    const seq = routeSeq, at = Date.now(); C.servedStale = at; syncBar(1);
    fetchCached(action, data, k).finally(() => syncBar(-1)).then(s => {
      if (s === e.s || seq !== routeSeq || C.touched > at || !(JSON.parse(s) || {}).ok) return;
      clearTimeout(C.redraw); C.redraw = setTimeout(() => { if (seq === routeSeq && C.touched <= at) route(); }, 60);
    });
  }
  return JSON.parse(e.s); // a copy: pages may change the objects they get
}
['pointerdown', 'keydown', 'input'].forEach(ev => document.addEventListener(ev, e => { if (e.isTrusted) C.touched = Date.now(); }, true));
function saveSession(r) { localStorage.setItem(K.s, r.session); localStorage.setItem(K.exp, r.expires_at); localStorage.setItem(K.u, JSON.stringify(r.user)); }
function clearSession() { cacheClear(); [K.s, K.u, K.exp].forEach(k => localStorage.removeItem(k)); }
function user() {
  const exp = localStorage.getItem(K.exp);
  if (!localStorage.getItem(K.s) || !exp || new Date(exp) < new Date()) return null;
  try { return JSON.parse(localStorage.getItem(K.u)); } catch (_) { return null; }
}
function toast(t) {
  const el = $('toast'); if (!el) return;
  el.textContent = t; el.classList.remove('hidden');
  clearTimeout(toast.t); clearTimeout(toastUndo.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), 2600);
}
function toastUndo(msg, fn) {
  const el = $('toast'); if (!el) return;
  el.innerHTML = esc(msg) + ' <button type="button" class="tdundo">Undo</button>';
  el.classList.remove('hidden');
  clearTimeout(toast.t); clearTimeout(toastUndo.t);
  const btn = el.querySelector('.tdundo');
  if (btn) btn.onclick = () => { el.classList.add('hidden'); clearTimeout(toastUndo.t); Promise.resolve().then(fn).catch(() => {}); };
  toastUndo.t = setTimeout(() => el.classList.add('hidden'), 5000);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// light placeholder while a page's first data loads (instead of a blank "Loading…")
const skel = (n = 5) => `<div class="skel" aria-busy="true" aria-label="Loading">${'<i></i>'.repeat(n)}</div>`;
/* ---------- sign in ---------- */
let code = '';
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
$('pad').innerHTML = keys.map(k => k === '' ? '<button class="sp" tabindex="-1" aria-hidden="true"></button>'
  : k === 'del' ? '<button class="del" data-k="del" aria-label="Delete">⌫</button>' : `<button data-k="${k}">${k}</button>`).join('');
$('pad').onclick = e => { const k = e.target.closest('button') && e.target.closest('button').dataset.k; if (!k) return;
  code = k === 'del' ? code.slice(0, -1) : (code + k).slice(0, 4); drawDots(); $('loginErr').textContent = ''; };
document.addEventListener('keydown', e => {
  if ($('vLogin').classList.contains('hidden') || document.activeElement === $('uName')) return;
  if (/^\d$/.test(e.key)) { code = (code + e.key).slice(0, 4); drawDots(); } else if (e.key === 'Backspace') { code = code.slice(0, -1); drawDots(); }
  else if (e.key === 'Enter') signIn();
});
$('uName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('uName').blur(); } });
function drawDots() { [...$('dots').children].forEach((d, i) => d.classList.toggle('on', i < code.length)); }
$('btnSignIn').onclick = signIn;
async function signIn() {
  const name = $('uName').value.trim();
  if (!name) { $('loginErr').textContent = 'Type your first name'; $('uName').focus(); return; }
  if (code.length !== 4) { $('loginErr').textContent = 'Enter your 4-digit code'; return; }
  $('btnSignIn').disabled = true; $('btnSignIn').textContent = 'SIGNING IN…';
  const r = await call('login', { username: name, code, boot: bootReads() });
  $('btnSignIn').disabled = false; $('btnSignIn').textContent = 'SIGN IN';
  code = ''; drawDots();
  if (!r.ok) { $('loginErr').textContent = r.error || 'Name or code is wrong'; return; }
  saveSession(r); bootStore(r); $('uName').value = ''; location.hash = '#/home'; route();
}
/* Sign-in carries the first page's data (Fast.gs): we name, per role, the reads its landing page needs; the server runs them
   with the new session (same role checks) and returns them in the login answer, so the first page needs no second round trip.
   An older server ignores 'boot' and the page loads its data as before. */
function bootReads() {
  const out = {};
  try { Object.keys(NAV).forEach(role => {
    const first = NAV[role][0] && NAV[role][0][0], list = [];
    (PAGE_READS[first] || []).forEach(([a, f]) => { const d = f ? f() : {}; if (d && CACHED[a]) list.push([a, d]); });
    if (list.length) out[role] = list;
  }); } catch (_) {}
  return out;
}
function bootStore(r) {
  if (!Array.isArray(r.boot)) return;
  r.boot.forEach(it => { const [a, d, res] = it || []; if (CACHED[a] && res && res.ok) cachePut(ckey(a, d || {}), JSON.stringify(res)); });
}
// wake the server while the name and code are typed, so sign-in doesn't pay Apps Script's cold start (public 'ping', no data)
let warmAt = 0;
function warm() { if (Date.now() - warmAt < 240e3) return; warmAt = Date.now(); net('ping').catch(() => {}); }
$('uName').addEventListener('focus', warm);
async function logout() { clearTimeout(pfT); await call('logout'); clearSession(); location.hash = ''; route(); }
document.addEventListener('click', e => {
  if (e.target.closest('[data-logout]')) logout();
  const s = e.target.closest('[data-soon]'); if (s) toast(s.dataset.soon + ' is coming soon');
});

/* ---------- role menus ---------- */
const { SCANNER, ROLE_LABEL, scannerLink } = window.OYPNav, NAV = window.OYPNav.OFFICE_NAV || window.OYPNav.NAV; // nav.js: same menu in the scanner, minus back-office-only pages (Production)
const scanUrl = () => { const u = user(); return scannerLink(u && u.role); };
const DONE = { production: true, settings: true, appts: true, home: true, prices: true, dashboard: true, todo: true, review: true, look: true, estimate: true, users: true, scanner: true, customers: true, shop: true, jos: true, inventory: true, count: true,
  payments: true, quotes: true, balances: true, clients: true, consignment: true }; // pay.js: payments, quotes, balances, clients; consign.js: consignment; todo.js: to do; count.js: inventory count; joinbox.js: needs a look
// Menu order on this device, per signed-in name. Empty = today's menu. The scanner keeps the shared list in nav.js.
const navKey = u => 'oypNavOrder:' + (u && u.username || 'device');
function readNavOrder(u) {
  try { const a = JSON.parse(localStorage.getItem(navKey(u)) || 'null'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : null; }
  catch (e) { return null; }
}
const navHideKey = u => 'oypNavHide:' + (u && u.username || 'device');
function readNavHide(u) {
  try {
    const a = JSON.parse(localStorage.getItem(navHideKey(u)) || 'null');
    return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  } catch (e) { return []; }
}
function writeNavHide(u, keys) {
  const canon = (NAV[u.role] || []).map(n => n[0]);
  const h = [];
  (keys || []).forEach(k => { if (canon.indexOf(k) >= 0 && h.indexOf(k) < 0) h.push(k); });
  try { if (!h.length) localStorage.removeItem(navHideKey(u)); else localStorage.setItem(navHideKey(u), JSON.stringify(h)); } catch (e) {}
  return h;
}
function mergeSlots(full, hide, visible) {
  const fn = window.OYPDash && window.OYPDash.layout && window.OYPDash.layout.mergeSlots;
  if (fn) return fn(full, hide, visible);
  return (visible || []).slice();
}
function writeNavOrder(u, keys, canon) {
  const prev = readNavOrder(u);
  const full = prev && prev.length ? prev.slice() : canon.slice();
  canon.forEach(k => { if (full.indexOf(k) < 0) full.push(k); });
  const merged = mergeSlots(full, readNavHide(u), keys);
  const present = merged.filter(k => canon.indexOf(k) >= 0);
  const def = canon.slice();
  try { if (!present.length || present.join() === def.join()) localStorage.removeItem(navKey(u)); else localStorage.setItem(navKey(u), JSON.stringify(present)); } catch (e) {}
}
function orderedNav(u) { return window.OYPNav.ordered(u); }
function navLink(k, t, page) {
  const count = k === 'jos' ? '<span class="ncount" data-ncount="review" hidden></span>' : '';
  if (k === 'scanner') return `<a href="${scanUrl()}" data-nkey="scanner">${esc(t)}</a>`;
  return `<a href="#/${k}" data-nkey="${esc(k)}" class="${k === page ? 'on' : ''}">${esc(t)}${DONE[k] ? '' : '<small>soon</small>'}${count}</a>`;
}
function navLabel(a) {
  const t = [];
  a.childNodes.forEach(n => { if (n.nodeType === 3) t.push(n.textContent); });
  return t.join('').replace(/\s*soon\s*$/i, '').trim();
}
function whoBlock(u) {
  return `<div class="who"><div id="whoMenu" class="whomenu hidden" role="menu"><button role="menuitem" data-logout>Log out</button></div>
    <button id="whoBtn" class="whobtn tap" aria-haspopup="menu" aria-expanded="false"><span class="lab">${esc(ROLE_LABEL[u.role])}</span><b>${esc(u.display_name)}</b><span class="chev" aria-hidden="true">▾</span></button></div>`;
}
let curPage = '';
function navRows(u, page) {
  const items = orderedNav(u), html = [];
  let placed = false;
  items.forEach(([k, t]) => {
    html.push(navLink(k, t, page));
    if (k === 'settings' && window.OYPNav.printerItemHtml) { html.push(window.OYPNav.printerItemHtml()); placed = true; }
  });
  if (!placed && window.OYPNav.printerItemHtml) html.push(window.OYPNav.printerItemHtml());
  return html.join('');
}
function renderNav(u, page) {
  curPage = page;
  const rows = navRows(u, page);
  $('side').innerHTML = '<div class="sidenav" id="sideNav">' + rows + '</div>' + whoBlock(u);
  finishNav($('sideNav'), u);
  const m = $('menu');
  if (m && !m.classList.contains('hidden')) { m.innerHTML = phoneInner(u); finishNav(m, u); }
  if (window.OYPJoInbox) window.OYPJoInbox.paintBadge();
  if (window.OYPReview && window.OYPReview.paintNav) window.OYPReview.paintNav();
}
function finishNav(box, u) {
  if (!box || !u) return;
  decorateNav(box, u);
  wireNavHide(box, u);
  wireMenuDrag(box, u);
}
function decorateNav(box, u) {
  const hide = new Set(u.role === 'admin' ? readNavHide(u) : []);
  box.querySelectorAll('a[data-nkey]').forEach(a => {
    if (a.closest('.nrow')) return;
    const row = document.createElement('div');
    row.className = 'nrow';
    row.dataset.nkey = a.dataset.nkey;
    const name = navLabel(a);
    a.parentNode.insertBefore(row, a);
    row.appendChild(a);
    const grip = document.createElement('span');
    grip.className = 'laygrip';
    grip.setAttribute('aria-hidden', 'true');
    grip.textContent = '⋮⋮';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layx';
    btn.dataset.nhide = a.dataset.nkey;
    btn.setAttribute('aria-label', 'Hide ' + name);
    btn.textContent = 'Hide';
    row.insertBefore(grip, a);
    row.appendChild(btn);
  });
  box.querySelectorAll('.nrow').forEach(row => { if (hide.has(row.dataset.nkey)) row.remove(); });
  if (!hide.size) return;
  const labels = {};
  (NAV[u.role] || []).forEach(([k, t]) => { labels[k] = t; });
  const bar = document.createElement('div');
  bar.className = 'layshows';
  [...hide].filter(k => labels[k]).forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'layshow';
    b.dataset.nshow = k;
    b.textContent = 'Show ' + labels[k];
    bar.appendChild(b);
  });
  const logout = box.querySelector('[data-logout]');
  if (logout) box.insertBefore(bar, logout);
  else box.appendChild(bar);
}
function wireNavHide(box, u) {
  if (!box || box.dataset.nhidewire || u.role !== 'admin') return;
  box.dataset.nhidewire = '1';
  box.addEventListener('click', e => {
    const hide = e.target.closest('[data-nhide]');
    const show = e.target.closest('[data-nshow]');
    if (!hide && !show) return;
    if (!window.OYPLayoutEdit || !window.OYPLayoutEdit.editing()) return;
    e.preventDefault();
    e.stopPropagation();
    const keys = readNavHide(u);
    const k = hide ? hide.dataset.nhide : show.dataset.nshow;
    if (hide) { if (keys.indexOf(k) < 0) keys.push(k); }
    else { const i = keys.indexOf(k); if (i >= 0) keys.splice(i, 1); }
    writeNavHide(u, keys);
    renderNav(u, curPage);
  });
}
function wireMenuDrag(box, u) {
  if (!box || !u || u.role !== 'admin' || box.dataset.ndrag || !window.OYPLayoutEdit) return;
  box.dataset.ndrag = '1';
  window.OYPLayoutEdit.drag(box, '.nrow', 'y', () => {
    writeNavOrder(u, [...box.querySelectorAll(':scope > .nrow')].map(n => n.dataset.nkey), (NAV[u.role] || []).map(n => n[0]));
    if (box.id === 'sideNav') {
      const m = $('menu');
      if (m && !m.classList.contains('hidden')) { m.innerHTML = phoneInner(u); finishNav(m, u); }
    } else renderNav(u, curPage);
  }, 'button, .layx, .layshow');
}
function phoneInner(u) { return window.OYPNav.menuHtml(u, curPage, ''); }
// The Edit layout pill turns these rows on. Nothing extra shows when it is off. Log out stays last.
window.OYPLayoutMenu = {
  list: u => orderedNav(u).map(([k, t]) => ({ key: k, label: t })),
  save(u, keys) { writeNavOrder(u, keys, (NAV[u.role] || []).map(n => n[0])); const me = user(); if (me && me.username === u.username) renderNav(me, curPage); },
  reset(u) { try { localStorage.removeItem(navKey(u)); } catch (e) {} const me = user(); if (me && me.username === u.username) renderNav(me, curPage); },
  custom: u => !!(readNavOrder(u) || readNavHide(u).length)
};

// Route token: every route() bumps routeSeq. A page takes here() before an await and checks it after, so a slow
// reply for a page the user already left (e.g. the dashboard still loading) never draws over the page they are on now.
let routeSeq = 0;
const here = () => { const my = routeSeq; return () => my === routeSeq; };
function show(id) { ['vLogin', 'vStaff', 'vOffice'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function route() {
  routeSeq++;
  document.documentElement.classList.remove('cs-onprint');
  $('menu').classList.add('hidden');
  const signed = user();
  if (!signed || signed.role !== 'admin') window.OYPLayoutEdit.set(false);
  if (location.hash === '#/logout') { history.replaceState(null, '', location.pathname); if (user()) return logout(); } // Log out from the scanner menu
  const u = user();
  if (!u) { cacheClear(); show('vLogin'); $('title').textContent = 'Sign in'; warm(); return; }
  const cur0 = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (u.role === 'staff' || !NAV[u.role]) if (!(u.role === 'staff' && NAV.staff && (cur0 === 'appts' || cur0 === 'todo' || cur0 === 'count'))) { // staff: simple home; Appointments, To do, and Inventory count open in the back office (Production: Susan + admins only)
    show('vStaff'); $('title').textContent = 'OYP Jewelry'; $('hi').textContent = 'Hi, ' + u.display_name; $('lnkScan').href = scanUrl(); return;
  }
  show('vOffice'); $('title').textContent = 'Back office';
  if (cur0 === 'users' && NAV[u.role].some(n => n[0] === 'settings')) { history.replaceState(null, '', '#/settings/staff'); } // old Staff logins page: now Settings › Staff accounts
  if (cur0 === 'review' || cur0 === 'look') { // both pages are Inventory tabs: REVIEW, and DEBUG for held scans
    try { sessionStorage.setItem('oypInvView', cur0 === 'look' ? 'debug' : 'review'); } catch (e) {}
    history.replaceState(null, '', '#/jos');
  }
  const canon = NAV[u.role], cur = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const ALIAS = { clients: 'customers', joborders: 'jos', materials: 'inventory' }; // old / friendly links keep working
  const want = canon.some(n => n[0] === cur) ? cur : ALIAS[cur] && canon.some(n => n[0] === ALIAS[cur]) ? ALIAS[cur] : null;
  const page = want || canon[0][0]; // opening a page still starts at today's first item when the link is not a menu item
  if (cur && want && want !== cur) history.replaceState(null, '', '#/' + want);
  $('title').textContent = page === 'todo' ? 'TO DO' : page === 'count' ? 'INVENTORY COUNT' : 'Back office';
  renderNav(u, page); // desktop sidebar: items scroll; the name block stays at the bottom
  if (window.OYPJoInbox && (u.role === 'admin' || u.role === 'production_manager')) window.OYPJoInbox.refreshBadge();
  if (window.OYPReview && window.OYPReview.refreshNav && (u.role === 'admin' || u.role === 'production_manager')) window.OYPReview.refreshNav();
  const title = canon.find(n => n[0] === page)[1];
  schedulePrefetch(canon, page);
  // nothing saved for this page yet (first visit, or just after a change): a light placeholder, not the last page's content
  if ((PAGE_READS[page] || []).some(([a, f]) => { const d = f ? f() : {}; return d && !cacheGet(ckey(a, d)); })) $('main').innerHTML = `<h2>${esc(title)}</h2>` + skel();
  if (page === 'settings' && window.OYPSettings) return window.OYPSettings.render($('main'), u); // settings.js (admin only: only the admin menu has it)
  if (page === 'production' && window.OYPProd) return window.OYPProd.render($('main'), u); // production.js
  if (page === 'appts' && window.OYPAppts) return window.OYPAppts.render($('main'), u); // appts.js
  if (page === 'consignment' && window.OYPConsign) return window.OYPConsign.render($('main'), u); // consign.js
  if (page === 'dashboard' && window.OYPDash) return window.OYPDash.render($('main'), u);
  if (page === 'todo' && window.OYPTodo) return window.OYPTodo.render($('main'), u);
  if (page === 'estimate' && window.OYPEstimate) return window.OYPEstimate.render($('main'), u);
  if (page === 'prices' && window.OYPPrices) return window.OYPPrices.render($('main'), u);
  if (page === 'jos' && window.OYPInv) return window.OYPInv.renderJos($('main'), u); // inv.js: Inventory (all JOs / pieces)
  if (page === 'inventory' && window.OYPInv) return window.OYPInv.renderMats($('main'), u); // inv.js: Materials (raw stock)
  if (page === 'count' && window.OYPCount) return window.OYPCount.render($('main'), u); // count.js: RFID inventory count
  if (window.OYPPay && window.OYPPay.pages.includes(page)) return window.OYPPay.render($('main'), u, page); // pay.js
  if (page === 'users') return usersPage();
  if (page === 'customers') return customersPage();
  if (page === 'shop') return shopPage();
  $('main').innerHTML = `<h2>${esc(title)}</h2><p class="muted">Signed in as ${esc(u.display_name)} · ${esc(ROLE_LABEL[u.role])}</p><div class="soonbox">Coming soon</div>`;
}
window.addEventListener('hashchange', route);
/* ---------- prefetch: once the page on screen has its data, quietly load the other menu pages' data (3 at a time) ---------- */
const PAGE_READS = { dashboard: [['dashboard'], ['contactList']], todo: [['todoList']], review: [['jobReviewList'], ['contactList']], estimate: [['costRates'], ['priceGet']],
  jos: [['invList']], production: [['prodBoard']], inventory: [['matList']], prices: [['priceGet']], customers: [['pplList']], shop: [['admShopList']],
  payments: [['payData']], quotes: [['payData']], balances: [['payData']], clients: [['payData']], settings: [['settingsGet']],
  appts: [['apptList', () => window.OYPAppts && window.OYPAppts.range && window.OYPAppts.range()]],
  consignment: [['consignList']] };
let pfT = 0, pfRun = false;
function schedulePrefetch(nav, page) {
  clearTimeout(pfT);
  pfT = setTimeout(async function go() {
    if (pfRun || !user()) return;
    if (C.busy) { pfT = setTimeout(go, 400); return; } // the page on screen first
    const seen = {}, jobs = [];
    [page].concat(nav.map(n => n[0])).forEach(pg => (PAGE_READS[pg] || []).forEach(([a, f]) => {
      const d = f ? f() : {}; if (f && !d) return; const k = ckey(a, d); if (seen[k]) return; seen[k] = 1;
      const e = cacheGet(k); if (!e || Date.now() - e.t > 60e3) jobs.push([a, d, k]);
    }));
    if (!jobs.length) return;
    pfRun = true; const gen = C.gen;
    const worker = async () => { while (jobs.length && gen === C.gen && user()) { const [a, d, k] = jobs.shift(); await fetchCached(a, d, k).catch(() => {}); } };
    try { await Promise.all([worker(), worker(), worker()]); } finally { pfRun = false; }
  }, 600);
}
// drop page data saved under another (older or other person's) session
try { const mine = ns(); Object.keys(localStorage).filter(k => k.startsWith(CP) && !k.startsWith(mine)).forEach(k => localStorage.removeItem(k)); } catch (_) {}

/* desktop account menu (sidebar name block) */
function whoMenu(open) {
  const m = $('whoMenu'), b = $('whoBtn'); if (!m || !b) return;
  open = open === undefined ? m.classList.contains('hidden') : open;
  m.classList.toggle('hidden', !open); b.classList.toggle('open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
}
document.addEventListener('click', e => { if (e.target.closest('#whoBtn')) whoMenu(); else if (!e.target.closest('#whoMenu')) whoMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') whoMenu(false); });
$('btnMenu').onclick = () => {
  const u = user(), m = $('menu');
  if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
  m.innerHTML = phoneInner(u);
  finishNav(m, u);
  if (window.OYPJoInbox) window.OYPJoInbox.paintBadge();
  m.classList.remove('hidden');
};
document.addEventListener('click', e => { if (!e.target.closest('#menu,#btnMenu')) $('menu').classList.add('hidden'); });

/* ---------- admin: staff logins ---------- */
async function usersPage(shown) {
  const m = $('main'), live = here();
  m.innerHTML = `<h2>Staff logins</h2><p class="muted">Add people and give them a code. A new code is shown only once, so write it down before leaving this page.</p>
    <div id="codeShown"></div>
    <div class="addrow"><label><span class="lab">First name</span><input id="nuName" placeholder="Thea" maxlength="24"></label>
    <label><span class="lab">Role</span><select id="nuRole"><option value="staff">Staff</option><option value="production_manager">Production manager</option><option value="accounting">Accounting</option><option value="admin">Admin</option></select></label>
    <button id="nuAdd" class="pill">ADD &amp; MAKE CODE</button></div>
    <div id="ulist"><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div></div>`;
  if (shown) showCode(shown.username, shown.code);
  $('nuAdd').onclick = async () => {
    const name = $('nuName').value.trim(); if (!name) return $('nuName').focus();
    const r = await call('createUser', { username: name, display_name: name, role: $('nuRole').value });
    if (!r.ok) return toast(r.error); if (live()) usersPage(r);
  };
  const r = await call('listUsers'); if (!live()) return;
  if (!r.ok) { $('ulist').textContent = r.error; return; }
  $('ulist').outerHTML = `<table><thead><tr><th><span class="lab">Name</span></th><th><span class="lab">Role</span></th><th><span class="lab">Status</span></th><th></th></tr></thead><tbody>${
    r.users.map(u => `<tr><td>${esc(u.display_name)} <span class="muted">(${esc(u.username)})</span></td><td>${esc(ROLE_LABEL[u.role] || u.role)}</td>
    <td>${!u.active ? '<span class="chip">Off</span>' : u.locked ? '<span class="chip gold">Locked</span>' : '<span class="chip">Active</span>'}</td>
    <td><button class="lnk" data-act="resetCode" data-u="${esc(u.username)}">New code</button>${u.locked ? `<button class="lnk" data-act="unlockUser" data-u="${esc(u.username)}">Unlock</button>` : ''}
    <button class="lnk" data-act="setActive" data-on="${u.active ? '' : '1'}" data-u="${esc(u.username)}">${u.active ? 'Turn off' : 'Turn on'}</button></td></tr>`).join('')}</tbody></table>`;
  m.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    const a = b.dataset.act, un = b.dataset.u;
    if (a === 'resetCode' && !confirm('Make a new code for ' + un + '? Their old code stops working and their phones are signed out.')) return;
    const r = await call(a, { username: un, active: !!b.dataset.on });
    if (!r.ok) return toast(r.error); if (live()) usersPage(r.code ? r : null);
  });
}
function showCode(un, c) {
  $('codeShown').innerHTML = `<div class="codebox"><span class="lab">Code for ${esc(un)} · shown once</span><div class="c">${esc(c)}</div>
    <span class="muted">Give it to them privately. They sign in with their first name and this code.</span></div>`;
}

/* ---------- admin: customers = every client (Clients tab) + portal account if any (Customers tab) ---------- */
const CST = { active: ['Active', ''], pending: ['Needs approval', 'gold'], unverified: ['Email not confirmed', ''], off: ['Off', ''] };
const PV = { all: 'All', pending: 'Needs approval', portal: 'Portal', offline: 'Offline only' };
let PS = { view: 'all', q: '', open: null, extra: null, adding: false, conflicts: {} };
const pkey = p => p.client_id || 'u:' + p.portal[0].customer_id;
const pending = p => p.portal.some(a => a.status === 'pending');
async function customersPage(open, extra) {
  if (open !== undefined) PS.open = open; PS.extra = extra || null;
  const m = $('main'), live = here();
  if (!m.querySelector('#plist')) m.innerHTML = '<h2>Customers</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const r = await call('pplList'); if (!live()) return;
  if (!r.ok && r.error === 'Unknown action') return portalOnlyPage();
  if (!r.ok) { m.innerHTML = `<h2>Customers</h2><p class="muted">${esc(r.error)}</p>`; return; }
  PS.r = r; drawPeople();
}
function drawPeople() {
  const m = $('main'), r = PS.r, q = PS.q.trim().toLowerCase();
  const inView = p => PS.view === 'all' || (PS.view === 'pending' ? pending(p) : PS.view === 'portal' ? p.portal.length : !p.portal.length);
  const hit = p => !q || [p.name, p.aliases, p.phone, p.email, p.jos.map(j => j.jo).join(' '), p.portal.map(a => a.email + ' ' + a.full_name).join(' ')].join(' ').toLowerCase().includes(q);
  const L = r.people.filter(p => inView(p) && hit(p)).sort((a, b) => pending(b) - pending(a) || String(a.name).localeCompare(b.name));
  const cnt = { all: r.counts.all, pending: r.counts.needs_approval, portal: r.counts.portal, offline: r.counts.offline };
  const tag = p => p.portal.length ? `<span class="ptag on" title="Has a website (portal) account">☑ Portal</span>${p.portal.map(a => ` <span class="chip ${(CST[a.status] || [])[1] || ''}">${esc((CST[a.status] || [a.status])[0])}</span>${a.locked ? ' <span class="chip gold">Locked</span>' : ''}`).join('')}`
    : '<span class="ptag" title="Offline only: no website account">☐ Offline</span>';
  const row = p => { const k = pkey(p), o = PS.open === k; return `<tr class="${o ? 'on' : ''}"><td><b class="cn">${esc(p.name)}</b>${p.aliases ? ` <span class="muted">(${esc(p.aliases)})</span>` : ''}${p.unmatched ? '<br><span class="chip gold">Sign-up · no client yet</span>' : ''}</td>
      <td>${esc(p.phone) || '<span class="muted">—</span>'}</td><td>${esc(p.email) || '<span class="muted">—</span>'}</td>
      <td>${p.jos.length ? p.jos.slice(0, 3).map(j => esc(j.jo)).join(', ') + (p.jos.length > 3 ? ` <span class="muted">+${p.jos.length - 3}</span>` : '') : '<span class="muted">—</span>'}</td>
      <td>${tag(p)}</td><td><button class="lnk" data-popen="${esc(k)}">${o ? 'Close' : 'Open'}</button></td></tr>${o ? `<tr class="cx"><td colspan="6">${personPanel(p)}</td></tr>` : ''}`; };
  const pend = PS.view === 'all' && !q ? L.filter(pending) : [], rest = pend.length ? L.filter(p => !pending(p)) : L;
  const head = '<thead><tr><th><span class="lab">Name</span></th><th><span class="lab">Phone</span></th><th><span class="lab">Email</span></th><th><span class="lab">JOs</span></th><th><span class="lab">Portal</span></th><th></th></tr></thead>';
  m.innerHTML = `<div class="dhead"><h2>Customers</h2><button class="pill sm" id="pAdd">+ ADD CLIENT</button></div>
    <p class="muted">Everyone: walk-ins and people who signed up on the website. <b>Portal</b> is ticked when they have a website account.</p>
    ${PS.adding ? addPanel() : ''}
    <div class="rvchips">${Object.keys(PV).map(k => `<button class="fchip ${PS.view === k ? 'on' : ''}" data-pv="${k}">${PV[k]} <b>${cnt[k]}</b></button>`).join('')}</div>
    <input id="pq" class="rvq pq" placeholder="Search name, phone, email or JO" value="${esc(PS.q)}">
    <div id="plist">${L.length ? `<table class="ptab">${head}<tbody>${pend.length ? `<tr class="psec"><td colspan="6"><span class="lab">Needs approval · ${pend.length}</span></td></tr>${pend.map(row).join('')}<tr class="psec"><td colspan="6"><span class="lab">Everyone else</span></td></tr>` : ''}${rest.map(row).join('')}</tbody></table>` : '<p class="muted">Nobody here.</p>'}</div>`;
  wirePeople();
}
function addPanel() {
  return `<div class="cpanel padd"><span class="lab">New client (offline · no website account is created)</span>
    <div class="addrow"><label><span class="lab">Name</span><input id="naN" placeholder="Full name"></label><label><span class="lab">Phone</span><input id="naP" inputmode="tel" placeholder="0917 …"></label>
    <label><span class="lab">Email</span><input id="naE" placeholder="optional"></label><label><span class="lab">Aliases</span><input id="naA" placeholder="Nickname, optional"></label></div>
    <div class="addrow"><label class="grow"><span class="lab">Notes</span><input id="naO" placeholder="optional"></label><button class="pill" id="naSave">SAVE CLIENT</button><button class="lnk" id="naX">Cancel</button></div></div>`;
}
function personPanel(p) {
  const cf = PS.conflicts, f = (k, lab, ph) => `<label class="${cf[k] != null ? 'conf' : ''}"><span class="lab">${lab}${cf[k] != null ? ` · now “${esc(cf[k])}”` : ''}</span><input id="pe_${k}" value="${esc(p[k])}" placeholder="${ph || ''}"></label>`;
  return `<div class="cpanel"><div class="pgrid">
    <div><span class="lab">${p.unmatched ? 'Signed up on the website · not matched to a client yet' : 'Client details'}</span>
      <div class="addrow">${f('name', 'Name')}${f('phone', 'Phone')}${f('email', 'Email')}${f('aliases', 'Aliases', 'Nickname')}</div>
      <div class="addrow"><label class="grow"><span class="lab">Notes</span><input id="pe_notes" value="${esc(p.notes)}"></label>
      <button class="pill outline" id="peSave">${p.unmatched ? 'MAKE CLIENT FROM SIGN-UP' : 'SAVE'}</button></div>
      ${p.unmatched ? '<p class="muted fnote">Or type an existing client’s ID in the portal section below and press Save there.</p>' : ''}</div>
    <div><span class="lab">JOs</span><div class="pjos">${p.jos.length ? p.jos.map(j => `<span class="chip ${j.location === 'archived' ? 'arch' : ''}" title="${esc(j.description)}">${esc(j.jo)}${j.location === 'archived' ? ' · Archived' : ''}</span>`).join(' ') : '<span class="muted">None yet</span>'}</div>
      ${p.client_id ? `<p class="muted fnote">Client ID ${esc(p.client_id)}</p>` : ''}</div></div>
    ${p.portal.length ? p.portal.map(a => `<details class="pportal" ${PS.portalOpen !== false ? 'open' : ''}><summary><span class="lab">Portal account · ${esc(a.email)}</span> <span class="chip ${(CST[a.status] || [])[1] || ''}">${esc((CST[a.status] || [a.status])[0])}</span></summary>${custPanel(a, PS.extra)}</details>`).join('')
      : '<div class="pportal off"><span class="lab">Portal</span> <span class="muted">☐ No website account. (Invite to portal: planned, not yet.)</span></div>'}</div>`;
}
function wirePeople() {
  const m = $('main'), p = PS.r.people.find(x => pkey(x) === PS.open);
  m.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { PS.view = b.dataset.pv; drawPeople(); });
  $('pq').oninput = e => { PS.q = e.target.value; const pos = e.target.selectionStart; drawPeople(); const el = $('pq'); el.focus(); el.setSelectionRange(pos, pos); };
  m.querySelectorAll('[data-popen]').forEach(b => b.onclick = () => { PS.open = PS.open === b.dataset.popen ? null : b.dataset.popen; PS.extra = null; PS.conflicts = {}; drawPeople(); });
  $('pAdd').onclick = () => { PS.adding = !PS.adding; drawPeople(); if (PS.adding) $('naN').focus(); };
  if (PS.adding) {
    $('naX').onclick = () => { PS.adding = false; drawPeople(); };
    $('naSave').onclick = async () => {
      const set = { name: $('naN').value, phone: $('naP').value, email: $('naE').value, aliases: $('naA').value, notes: $('naO').value }, live = here();
      let r = await call('pplSave', { set });
      if (r.code === 'DUPLICATE' && confirm('Already a client with that phone or email: ' + r.matches.map(x => x.name).join(', ') + '. Add a new client anyway?')) r = await call('pplSave', { set, force: true });
      if (!r.ok) return r.code === 'DUPLICATE' ? null : toast(r.error);
      toast('Client added'); PS.adding = false; if (live()) customersPage(r.client_id);
    };
  }
  if (!p) return;
  m.querySelectorAll('[data-ca]').forEach(b => b.onclick = () => custAct(b.dataset.ca, b.closest('.pportal') ? p.portal[[...m.querySelectorAll('.pportal')].indexOf(b.closest('.pportal'))].customer_id : null));
  const aud = m.querySelectorAll('.pportal .caud');
  p.portal.forEach((a, i) => call('admCustAudit', { customer_id: a.customer_id }).then(x => { if (aud[i] && x.ok) aud[i].innerHTML = x.log.slice(0, 20).map(l => `<div><span class="muted">${esc(new Date(l.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }))} PHT</span> · ${esc(l.action.replace(/_/g, ' '))}</div>`).join('') || '—'; }));
  $('peSave').onclick = async () => {
    const set = {}; ['name', 'phone', 'email', 'aliases', 'notes'].forEach(k => set[k] = $('pe_' + k).value);
    let r; const live = here(), again = id => live() ? customersPage(id) : undefined;
    if (p.unmatched) {
      r = await call('pplSave', { set, from_customer: p.portal[0].customer_id });
      if (r.code === 'DUPLICATE' && confirm('Already a client with that phone or email: ' + r.matches.map(x => x.name + ' (' + x.client_id + ')').join(', ') + '.\nOK = make a new client anyway. Cancel = keep it, then type that client ID in the portal section.')) r = await call('pplSave', { set, from_customer: p.portal[0].customer_id, force: true });
      if (r.ok) { toast('Client made and sign-up linked'); return again(r.client_id); }
    } else {
      const seen = {}; ['name', 'phone', 'email', 'aliases', 'notes'].forEach(k => seen[k] = p[k]);
      r = await call('pplSave', { client_id: p.client_id, set, seen });
      if (r.code === 'CONFLICT') { PS.conflicts = r.conflicts; toast('Someone changed this client meanwhile: nothing saved, check the red fields'); return again(); }
      if (r.ok) { PS.conflicts = {}; toast(r.changed.length ? 'Saved' : 'No changes'); return again(); }
    }
    if (r && !r.ok && r.code !== 'DUPLICATE') toast(r.error);
  };
}
/* before the server has People.gs: the old portal-only list */
async function portalOnlyPage(open, extra) {
  const m = $('main');
  m.innerHTML = `<h2>Customers</h2><p class="muted">Portal sign-ups only. Walk-in clients will show here too once the server is updated.</p>
    <div class="addrow"><input id="cq" placeholder="Search name, phone or email" style="min-width:280px"><select id="cf"><option value="">All</option><option value="pending">Needs approval</option><option value="active">Active</option><option value="locked">Locked</option><option value="off">Off</option></select></div>
    <div id="clist"><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div></div>`;
  const live = here(); const r = await call('admCustList'); if (!live()) return; if (!r.ok) { $('clist').textContent = r.error; return; }
  const draw = () => {
    const q = $('cq').value.trim().toLowerCase(), f = $('cf').value;
    const L = r.customers.filter(c => (!q || (c.full_name + ' ' + c.mobile + ' ' + c.email).toLowerCase().includes(q)) && (!f || (f === 'locked' ? c.locked : c.status === f)))
      .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || String(a.full_name).localeCompare(b.full_name));
    $('clist').outerHTML = `<div id="clist">${L.length ? `<table><thead><tr><th><span class="lab">Customer</span></th><th><span class="lab">Email</span></th><th><span class="lab">JOs</span></th><th><span class="lab">Status</span></th><th></th></tr></thead><tbody>${L.map(c => {
      const st = CST[c.status] || [c.status, ''];
      return `<tr><td><b class="cn">${esc(c.full_name)}</b><br><span class="muted">${esc(c.mobile)}</span></td><td>${esc(c.email)}</td><td>${c.jos.map(esc).join(', ') || '<span class="muted">—</span>'}</td>
      <td><span class="chip ${st[1]}">${esc(st[0])}</span>${c.locked ? ' <span class="chip gold">Locked</span>' : ''}</td><td><button class="lnk" data-open="${esc(c.customer_id)}">Open</button></td></tr>
      ${open === c.customer_id ? `<tr class="cx"><td colspan="5">${custPanel(c, extra)}</td></tr>` : ''}`; }).join('')}</tbody></table>` : '<p class="muted">No customers yet.</p>'}</div>`;
    m.querySelectorAll('[data-open]').forEach(b => b.onclick = () => portalOnlyPage(open === b.dataset.open ? null : b.dataset.open));
    m.querySelectorAll('[data-ca]').forEach(b => b.onclick = () => custAct(b.dataset.ca, open));
    if (open) call('admCustAudit', { customer_id: open }).then(a => { const el = $('caud'); if (el && a.ok) el.innerHTML = a.log.slice(0, 20).map(l => `<div><span class="muted">${esc(new Date(l.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }))} PHT</span> · ${esc(l.action.replace(/_/g, ' '))}</div>`).join('') || '—'; });
  };
  $('cq').oninput = draw; $('cf').onchange = draw; draw();
}
function custPanel(c, extra) {
  return `<div class="cpanel">${extra ? `<div class="codebox"><span class="lab">New PIN for ${esc(c.full_name)} · shown once</span><div class="c">${esc(extra)}</div><span class="muted">Tell them privately. Their phones were signed out.</span></div>` : ''}
  ${c.match_note ? `<p class="muted">Match: ${esc(c.match_note)}</p>` : ''}
  <div class="addrow"><label><span class="lab">Full name</span><input id="ceN" value="${esc(c.full_name)}"></label><label><span class="lab">Mobile</span><input id="ceM" value="${esc(c.mobile)}"></label>
  <label><span class="lab">Email</span><input id="ceE" value="${esc(c.email)}"></label><label><span class="lab">Client ID</span><input id="ceC" value="${esc(c.client_id || '')}" placeholder="cl-…" size="10"></label>
  <button class="pill outline" data-ca="save">SAVE</button></div>
  <div class="addrow">${c.status === 'pending' ? '<button class="pill" data-ca="approve">APPROVE</button>' : ''}
  <label><span class="lab">Link a JO</span><input id="ceJ" placeholder="26-001" size="9"></label><button class="pill outline" data-ca="link">LINK</button>
  ${c.jos.map(j => `<button class="lnk" data-ca="unlink:${esc(j)}">Unlink ${esc(j)}</button>`).join('')}</div>
  <div class="addrow"><button class="lnk" data-ca="pin">New PIN</button>${c.locked ? '<button class="lnk" data-ca="unlock">Unlock</button>' : ''}
  <button class="lnk" data-ca="${c.status === 'off' ? 'on' : 'off'}">${c.status === 'off' ? 'Turn on' : 'Turn off'}</button></div>
  <span class="lab">Activity</span><div id="caud" class="caud muted">Loading…</div></div>`;
}
async function custAct(a, id) {
  const live = here(); let r, extra; const scope = document.querySelector(PS.r ? '.pportal[open] .cpanel, .pportal .cpanel' : '#main'), $ = i => (scope && scope.querySelector('#' + i)) || document.getElementById(i);
  if (a === 'save') r = await call('admCustUpdate', { customer_id: id, full_name: $('ceN').value, mobile: $('ceM').value, email: $('ceE').value, client_id: $('ceC').value });
  else if (a === 'approve') r = await call('admCustApprove', { customer_id: id, client_id: $('ceC').value });
  else if (a === 'link') r = await call('admCustLink', { customer_id: id, jo: $('ceJ').value });
  else if (a.startsWith('unlink:')) { if (!confirm('Unlink ' + a.slice(7) + '? They will stop seeing it.')) return; r = await call('admCustUnlink', { customer_id: id, jo: a.slice(7) }); }
  else if (a === 'pin') { if (!confirm('Make a new PIN? Their old PIN stops working.')) return; r = await call('admCustResetPin', { customer_id: id }); extra = r.pin; }
  else if (a === 'unlock') r = await call('admCustUnlock', { customer_id: id });
  else if (a === 'off' || a === 'on') { if (a === 'off' && !confirm('Turn this account off? They are signed out.')) return; r = await call('admCustSetActive', { customer_id: id, active: a === 'on' }); }
  if (!r.ok) return toast(r.error);
  toast(a === 'approve' ? 'Approved · ' + r.linked + ' JO(s) linked' : 'Saved'); if (!live()) return; PS.r ? customersPage(PS.open, extra) : portalOnlyPage(id, extra);
}
/* ---------- admin: shop listings ---------- */
async function shopPage() {
  const m = $('main'), live = here();
  m.innerHTML = `<h2>Shop listings</h2><p class="muted">Pieces on the public <a href="https://oypjewelry.com/shop/" target="_blank" rel="noopener">shop page</a>. The JO number stays private; customers only see the item code.</p>
    <div class="addrow"><label><span class="lab">Item code</span><input id="siC" placeholder="OYP-R001" size="10"></label><label><span class="lab">Title</span><input id="siT"></label>
    <label><span class="lab">Type</span><input id="siK" placeholder="Ring" size="8"></label><label><span class="lab">Metal</span><input id="siM" size="9"></label><label><span class="lab">Price ₱</span><input id="siP" inputmode="numeric" size="8"></label>
    <label><span class="lab">JO (private)</span><input id="siJ" size="8"></label><label><span class="lab">Photo file IDs</span><input id="siF" placeholder="Drive ids, comma" size="14"></label>
    <select id="siS"><option value="listed">Listed</option><option value="hidden">Hidden</option><option value="sold">Sold</option></select><button id="siAdd" class="pill">SAVE</button></div>
    <div id="slist"><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div></div>`;
  $('siAdd').onclick = async () => { const r = await call('admShopSave', { item_code: $('siC').value, title: $('siT').value, category: $('siK').value, metal: $('siM').value, price_php: $('siP').value, jo: $('siJ').value, photo_file_ids: $('siF').value, status: $('siS').value }); if (!r.ok) return toast(r.error); toast('Saved'); if (live()) shopPage(); };
  const r = await call('admShopList'); if (!live()) return; if (!r.ok) { $('slist').textContent = r.error; return; }
  $('slist').outerHTML = r.items.length ? `<table><thead><tr><th><span class="lab">Item</span></th><th><span class="lab">Price</span></th><th><span class="lab">JO</span></th><th><span class="lab">Status</span></th></tr></thead><tbody>${r.items.map(i => `<tr><td><b class="cn">${esc(i.title)}</b><br><span class="muted">${esc(i.item_code)} · ${esc(i.category)}</span></td><td>${i.price_php ? '₱' + Number(i.price_php).toLocaleString() : '—'}</td><td>${esc(i.jo)}</td><td><span class="chip ${i.status === 'listed' ? 'gold' : ''}">${esc(i.status)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing listed yet.</p>';
}

// Display names for location keys. Dashboard.gs (DASH.LOCATIONS) and JobSync.gs (JOB_LOCATIONS) still send
// "Being worked on" and "In vault". The site shows the names below, so those files do not need a paste.
const LOC_LABEL = { working: 'In production', vault: 'Vault' };
function locLabel(key, serverLabel) {
  if (key && Object.prototype.hasOwnProperty.call(LOC_LABEL, key)) return LOC_LABEL[key];
  if (key === 'unset') return 'No location yet';
  return serverLabel || key || '';
}
function pieceName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v.name) return String(v.name).trim();
  return '';
}
// Client name, then the JO. A missing name (bench staff, or no client on the job) is the JO alone.
function piece(name, jo) {
  const n = pieceName(name), id = String(jo || '').trim();
  const bits = [];
  if (n) bits.push(`<span class="pname">${esc(n)}</span>`);
  if (n && id) bits.push('<span class="psep"> · </span>');
  if (id) bits.push(`<span class="pjo">${esc(id)}</span>`);
  if (!bits.length) return '';
  const title = n && id ? n + ' · ' + id : (n || id);
  return `<span class="piece" title="${esc(title)}">${bits.join('')}</span>`;
}
async function archiveJos(jos, location, opts) {
  opts = opts || {};
  const r = await call('invBulk', { jos: jos, location: location });
  if (!r || !r.ok) {
    toast(!r || r.error === 'Unknown action' ? 'Moving and archiving needs the InvBulk paste in Apps Script (see paste/InvBulk.gs.txt).' : ((r && r.error) || 'Could not update'));
    return r;
  }
  const sets = r.set || [];
  if (!sets.length) { toast(location ? 'Already there' : 'Nothing to restore'); return r; }
  const word = opts.word || (location === 'archived' ? 'Archived' : 'Restored');
  toastUndo(word + (sets.length > 1 ? ' ' + sets.length : ''), async () => {
    const groups = {};
    sets.forEach(s => { const from = s.from || ''; (groups[from] = groups[from] || []).push(s.jo); });
    let bad = '';
    for (const from of Object.keys(groups)) {
      const back = await call('invBulk', { jos: groups[from], location: from });
      if (!back || !back.ok) { bad = (back && back.error) || 'Could not undo'; break; }
    }
    toast(bad || 'Restored');
    if (opts.after) { try { opts.after(true); } catch (e) {} }
  });
  if (opts.after) { try { opts.after(false); } catch (e) {} }
  return r;
}
/* A small menu that floats over the page, anchored to a button. It is position:fixed
   on document.body, so a card with overflow:hidden cannot clip it or grow to fit it. */
let pop = null;
function closePopover() {
  if (!pop) return;
  document.removeEventListener('pointerdown', pop.onDown, true);
  document.removeEventListener('keydown', pop.onKey);
  window.removeEventListener('resize', pop.onMove);
  window.removeEventListener('scroll', pop.onMove, true);
  if (pop.anchor && pop.anchor.setAttribute) pop.anchor.setAttribute('aria-expanded', 'false');
  if (pop.el && pop.el.parentNode) pop.el.parentNode.removeChild(pop.el);
  pop = null;
}
function placePopover(el, anchor) {
  const a = anchor.getBoundingClientRect();
  const gap = 6, pad = 8;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  el.style.left = '0px';
  el.style.top = '0px';
  const m = el.getBoundingClientRect();
  let left = a.left, top = a.bottom + gap;
  if (left + m.width > vw - pad) left = a.right - m.width;
  if (left < pad) left = pad;
  if (left + m.width > vw - pad) left = Math.max(pad, vw - m.width - pad);
  if (top + m.height > vh - pad) top = a.top - gap - m.height;
  if (top < pad) top = pad;
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}
function fillPopover(el, anchor, items) {
  el.textContent = '';
  (items || []).forEach(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'oyp-popi' + (item.danger ? ' is-danger' : '');
    b.setAttribute('role', 'menuitem');
    b.textContent = item.label || '';
    b.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (item.menu) { fillPopover(el, anchor, item.menu); placePopover(el, anchor); return; }
      closePopover();
      if (typeof item.run === 'function') item.run();
    });
    el.appendChild(b);
  });
}
function popover(anchor, items) {
  if (!anchor) return closePopover();
  if (pop && pop.anchor === anchor) return closePopover();
  closePopover();
  const el = document.createElement('div');
  el.className = 'oyp-pop';
  el.setAttribute('role', 'menu');
  document.body.appendChild(el);
  fillPopover(el, anchor, items);
  placePopover(el, anchor);
  anchor.setAttribute('aria-expanded', 'true');
  const onDown = e => {
    if (el.contains(e.target) || anchor.contains(e.target)) return;
    closePopover();
    const kill = ev => { document.removeEventListener('click', kill, true); ev.preventDefault(); ev.stopPropagation(); };
    document.addEventListener('click', kill, true);
  };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); closePopover(); } };
  const onMove = () => { if (pop && pop.el && pop.anchor && pop.anchor.isConnected) placePopover(pop.el, pop.anchor); else closePopover(); };
  pop = { el, anchor, onDown, onKey, onMove };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onMove);
  window.addEventListener('scroll', onMove, true);
}
window.addEventListener('hashchange', closePopover);
window.OYP = { call, esc, toast, toastUndo, archiveJos, popover, closePopover, swipe: (window.OYPSwipe && window.OYPSwipe.mount) || function () {}, user, ROLE_LABEL, here, skel, locLabel, piece }; // here(): route token, see route() // shared with dash.js, inv.js, prices.js, pay.js, appts.js, settings.js, production.js
// Edit layout is off on every load. The pill on each back-office page turns it on. Done saves and turns it off.
const LE = {
  on: false, fns: [],
  editing() { const u = user(); return this.on && !!(u && u.role === 'admin'); },
  set(v) {
    const u = user();
    v = !!v && !!(u && u.role === 'admin');
    if (v === this.on) { placeLayPill(); return; }
    this.on = v;
    document.documentElement.classList.toggle('layedit', v);
    placeLayPill();
    this.fns.slice().forEach(fn => { try { fn(v); } catch (e) {} });
  },
  listen(fn) { this.fns.push(fn); },
  commit() {
    const u = user();
    if (!u) return;
    const side = $('sideNav');
    if (side) writeNavOrder(u, [...side.querySelectorAll(':scope > .nrow')].map(n => n.dataset.nkey).filter(Boolean), (NAV[u.role] || []).map(n => n[0]));
    if (window.OYPDash && window.OYPDash.layout && window.OYPDash.layout.sections.commit) window.OYPDash.layout.sections.commit(u);
  },
  // A section moves by its own header. The neighbor's header stays put until the pointer crosses that header.
  place(itemFirst, pos, mid) {
    if (itemFirst) return pos > mid ? 'after' : '';
    return pos < mid ? 'before' : '';
  },
  // Whole card, tile, or menu row. A short move starts the drag; a tap still clicks. Touch uses the same pointer events.
  drag(container, itemSel, axis, onDrop, skipSel, handleSel) {
    if (!container || container.dataset.oypdrag) return;
    container.dataset.oypdrag = '1';
    container.addEventListener('pointerdown', e => {
      if (!this.editing()) return;
      if (e.button != null && e.button !== 0) return;
      if (skipSel && e.target.closest(skipSel)) return;
      const item = e.target.closest(itemSel);
      if (!item || item.parentElement !== container) return;
      if (handleSel) {
        const handle = e.target.closest(handleSel);
        // The header that was grabbed has to be this item's own header, not a neighbor's.
        if (!handle || handle.parentElement !== item) return;
      }
      const pid = e.pointerId, sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const move = ev => {
        if (ev.pointerId !== pid) return;
        if (!dragging) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
          dragging = true;
          item.classList.add('dragging');
          item.style.pointerEvents = 'none';
          try { item.setPointerCapture(pid); } catch (err) {}
        }
        ev.preventDefault();
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = el && el.closest(itemSel);
        if (!over || over === item || !container.contains(over)) return;
        const mark = over.querySelector(':scope > .dtitle') || over;
        const r = mark.getBoundingClientRect();
        const pos = axis === 'x' ? ev.clientX : ev.clientY;
        const mid = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
        const itemFirst = !!(item.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING);
        const where = this.place(itemFirst, pos, mid);
        if (!where) return;
        const ref = where === 'after' ? over.nextSibling : over;
        if (ref !== item) container.insertBefore(item, ref);
      };
      const up = ev => {
        if (ev.pointerId !== pid) return;
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', up, true);
        document.removeEventListener('pointercancel', up, true);
        if (!dragging) return;
        item.classList.remove('dragging');
        item.style.pointerEvents = '';
        if (LE.kill) document.removeEventListener('click', LE.kill, true);
        LE.kill = e2 => {
          document.removeEventListener('click', LE.kill, true);
          LE.kill = null;
          if (e2.target.closest && e2.target.closest('#layEditBtn, .layx, .layshow, [data-lhide], [data-lshow], [data-nhide], [data-nshow], [data-shide], [data-sshow], #dLocReset')) return;
          e2.preventDefault();
          e2.stopPropagation();
        };
        document.addEventListener('click', LE.kill, true);
        onDrop();
      };
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', up, true);
      document.addEventListener('pointercancel', up, true);
    });
  }
};
window.OYPLayoutEdit = LE;
function placeLayPill() {
  const main = $('main');
  const office = $('vOffice') && !$('vOffice').classList.contains('hidden');
  const u = user();
  const show = !!(main && office && u && u.role === 'admin');
  let row = document.getElementById('layRow');
  if (!show) { if (row) row.remove(); return; }
  if (!row || row.parentNode !== main) {
    if (row) row.remove();
    row = document.createElement('div');
    row.id = 'layRow';
    row.className = 'layrow';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill sm outline laypill';
    btn.id = 'layEditBtn';
    btn.onclick = () => {
      if (LE.editing()) { LE.commit(); toast('Layout saved'); LE.set(false); }
      else LE.set(true);
    };
    row.appendChild(btn);
  }
  if (main.firstChild !== row) main.insertBefore(row, main.firstChild);
  const btn = row.querySelector('#layEditBtn');
  const on = LE.editing();
  btn.textContent = on ? 'Done' : 'Edit layout';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
LE.listen(() => {
  const u = user();
  if (u && u.role === 'admin' && !$('vOffice').classList.contains('hidden')) renderNav(u, curPage);
  if (window.OYPDash && window.OYPDash.relayout) window.OYPDash.relayout();
  placeLayPill();
});
if ($('main')) new MutationObserver(() => placeLayPill()).observe($('main'), { childList: true });
drawDots(); route();
// re-check the session with the server on load (catches resets / deactivation)
// redraw only if the role or name changed, so a page opened meanwhile (e.g. the estimator mid-typing) is not reset
if (user()) call('me').then(r => { if (r.ok) { const was = user() || {}; localStorage.setItem(K.u, JSON.stringify(r.user)); if (was.role !== r.user.role || was.display_name !== r.user.display_name) route(); } });
})();
