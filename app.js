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

async function call(action, data = {}) {
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
function saveSession(r) { localStorage.setItem(K.s, r.session); localStorage.setItem(K.exp, r.expires_at); localStorage.setItem(K.u, JSON.stringify(r.user)); }
function clearSession() { [K.s, K.u, K.exp].forEach(k => localStorage.removeItem(k)); }
function user() {
  const exp = localStorage.getItem(K.exp);
  if (!localStorage.getItem(K.s) || !exp || new Date(exp) < new Date()) return null;
  try { return JSON.parse(localStorage.getItem(K.u)); } catch (_) { return null; }
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2600); }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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
  const r = await call('login', { username: name, code });
  $('btnSignIn').disabled = false; $('btnSignIn').textContent = 'SIGN IN';
  code = ''; drawDots();
  if (!r.ok) { $('loginErr').textContent = r.error || 'Name or code is wrong'; return; }
  saveSession(r); $('uName').value = ''; location.hash = '#/home'; route();
}
async function logout() { await call('logout'); clearSession(); location.hash = ''; route(); }
document.addEventListener('click', e => {
  if (e.target.closest('[data-logout]')) logout();
  const s = e.target.closest('[data-soon]'); if (s) toast(s.dataset.soon + ' is coming soon');
});

/* ---------- role menus ---------- */
const { SCANNER, ROLE_LABEL, scannerLink } = window.OYPNav, NAV = window.OYPNav.OFFICE_NAV || window.OYPNav.NAV; // nav.js: same menu in the scanner, minus back-office-only pages (Production)
const scanUrl = () => { const u = user(); return scannerLink(u && u.role); };
const DONE = { production: true, settings: true, appts: true, home: true, prices: true, dashboard: true, review: true, estimate: true, users: true, scanner: true, customers: true, shop: true, jos: true, inventory: true,
  payments: true, quotes: true, balances: true, clients: true }; // pay.js: payments, quotes, balances, clients

// Route token: every route() bumps routeSeq. A page takes here() before an await and checks it after, so a slow
// reply for a page the user already left (e.g. the dashboard still loading) never draws over the page they are on now.
let routeSeq = 0;
const here = () => { const my = routeSeq; return () => my === routeSeq; };
function show(id) { ['vLogin', 'vStaff', 'vOffice'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function route() {
  routeSeq++;
  $('menu').classList.add('hidden');
  if (location.hash === '#/logout') { history.replaceState(null, '', location.pathname); if (user()) return logout(); } // Log out from the scanner menu
  const u = user();
  if (!u) { show('vLogin'); $('title').textContent = 'Sign in'; return; }
  const cur0 = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (u.role === 'staff' || !NAV[u.role]) if (!(u.role === 'staff' && NAV.staff && cur0 === 'appts')) { // staff: simple home; Appointments in the back office (Production: Susan + admins only)
    show('vStaff'); $('title').textContent = 'OYP Jewelry'; $('hi').textContent = 'Hi, ' + u.display_name; $('lnkScan').href = scanUrl(); return;
  }
  show('vOffice'); $('title').textContent = 'Back office';
  if (cur0 === 'users' && NAV[u.role].some(n => n[0] === 'settings')) { history.replaceState(null, '', '#/settings/staff'); } // old Staff logins page: now Settings › Staff accounts
  const nav = NAV[u.role], cur = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const ALIAS = { clients: 'customers', joborders: 'jos', materials: 'inventory' }; // old / friendly links keep working
  const want = nav.some(n => n[0] === cur) ? cur : ALIAS[cur] && nav.some(n => n[0] === ALIAS[cur]) ? ALIAS[cur] : null;
  const page = want || nav[0][0];
  if (cur && want && want !== cur) history.replaceState(null, '', '#/' + want);
  // desktop sidebar: menu items scroll inside; the name block stays at the bottom and opens a small account menu (Log out; room for Settings)
  $('side').innerHTML = '<div class="sidenav">' + nav.map(([k, t]) => k === 'scanner' ? `<a href="${scanUrl()}">${esc(t)}</a>`
    : `<a href="#/${k}" class="${k === page ? 'on' : ''}">${esc(t)}${DONE[k] ? '' : '<small>soon</small>'}</a>`).join('') + '</div>'
    + `<div class="who"><div id="whoMenu" class="whomenu hidden" role="menu"><button role="menuitem" data-logout>Log out</button></div>
    <button id="whoBtn" class="whobtn tap" aria-haspopup="menu" aria-expanded="false"><span class="lab">${esc(ROLE_LABEL[u.role])}</span><b>${esc(u.display_name)}</b><span class="chev" aria-hidden="true">▾</span></button></div>`;
  const title = nav.find(n => n[0] === page)[1];
  if (page === 'settings' && window.OYPSettings) return window.OYPSettings.render($('main'), u); // settings.js (admin only: only the admin menu has it)
  if (page === 'production' && window.OYPProd) return window.OYPProd.render($('main'), u); // production.js
  if (page === 'appts' && window.OYPAppts) return window.OYPAppts.render($('main'), u); // appts.js
  if (page === 'dashboard' && window.OYPDash) return window.OYPDash.render($('main'), u);
  if (page === 'review' && window.OYPReview) return window.OYPReview.render($('main'), u);
  if (page === 'estimate' && window.OYPEstimate) return window.OYPEstimate.render($('main'), u);
  if (page === 'prices' && window.OYPPrices) return window.OYPPrices.render($('main'), u);
  if (page === 'jos' && window.OYPInv) return window.OYPInv.renderJos($('main'), u); // inv.js: Inventory (all JOs / pieces)
  if (page === 'inventory' && window.OYPInv) return window.OYPInv.renderMats($('main'), u); // inv.js: Materials (raw stock)
  if (window.OYPPay && window.OYPPay.pages.includes(page)) return window.OYPPay.render($('main'), u, page); // pay.js
  if (page === 'users') return usersPage();
  if (page === 'customers') return customersPage();
  if (page === 'shop') return shopPage();
  $('main').innerHTML = `<h2>${esc(title)}</h2><p class="muted">Signed in as ${esc(u.display_name)} · ${esc(ROLE_LABEL[u.role])}</p><div class="soonbox">Coming soon</div>`;
}
window.addEventListener('hashchange', route);
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
  m.innerHTML = !u ? `<a href="${SCANNER}">Card scanner</a>`
    : (u.role === 'staff' && NAV.staff ? NAV.staff.map(([k, t]) => `<a href="${k === 'scanner' ? scanUrl() : '#/' + k}">${esc(t)}</a>`).join('')
      : u.role === 'staff' || !NAV[u.role] ? `<a href="${scanUrl()}">Scan JO card</a>`
      : NAV[u.role].map(([k, t]) => `<a href="${k === 'scanner' ? scanUrl() : '#/' + k}">${esc(t)}</a>`).join('')) + '<button data-logout>Log out</button>';
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
    <div id="ulist" class="muted">Loading…</div>`;
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
  if (!m.querySelector('#plist')) m.innerHTML = '<h2>Customers</h2><p class="muted">Loading…</p>';
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
    <div id="clist" class="muted">Loading…</div>`;
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
    <div id="slist" class="muted">Loading…</div>`;
  $('siAdd').onclick = async () => { const r = await call('admShopSave', { item_code: $('siC').value, title: $('siT').value, category: $('siK').value, metal: $('siM').value, price_php: $('siP').value, jo: $('siJ').value, photo_file_ids: $('siF').value, status: $('siS').value }); if (!r.ok) return toast(r.error); toast('Saved'); if (live()) shopPage(); };
  const r = await call('admShopList'); if (!live()) return; if (!r.ok) { $('slist').textContent = r.error; return; }
  $('slist').outerHTML = r.items.length ? `<table><thead><tr><th><span class="lab">Item</span></th><th><span class="lab">Price</span></th><th><span class="lab">JO</span></th><th><span class="lab">Status</span></th></tr></thead><tbody>${r.items.map(i => `<tr><td><b class="cn">${esc(i.title)}</b><br><span class="muted">${esc(i.item_code)} · ${esc(i.category)}</span></td><td>${i.price_php ? '₱' + Number(i.price_php).toLocaleString() : '—'}</td><td>${esc(i.jo)}</td><td><span class="chip ${i.status === 'listed' ? 'gold' : ''}">${esc(i.status)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing listed yet.</p>';
}

window.OYP = { call, esc, toast, user, ROLE_LABEL, here }; // here(): route token, see route() // shared with dash.js, inv.js, prices.js, pay.js, appts.js, settings.js, production.js
drawDots(); route();
// re-check the session with the server on load (catches resets / deactivation)
// redraw only if the role or name changed, so a page opened meanwhile (e.g. the estimator mid-typing) is not reset
if (user()) call('me').then(r => { if (r.ok) { const was = user() || {}; localStorage.setItem(K.u, JSON.stringify(r.user)); if (was.role !== r.user.role || was.display_name !== r.user.display_name) route(); } });
})();
