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
const SCANNER = 'https://oypjewelry-stack.github.io/jo-scanner/';
const NAV = {
  admin: [['jos', 'Job orders'], ['scanner', 'Scanner'], ['inventory', 'Inventory'], ['prices', 'Material prices'], ['clients', 'Clients'], ['payments', 'Quotes / payments'], ['users', 'Staff logins'], ['settings', 'Settings']],
  production_manager: [['jos', 'Job orders'], ['scanner', 'Scanner'], ['production', 'Production'], ['inventory', 'Inventory'], ['prices', 'Material prices']],
  accounting: [['payments', 'Payments'], ['quotes', 'Quotes'], ['balances', 'Balances'], ['clients', 'Clients (billing)'], ['jos', 'Job orders (view)']]
};
const ROLE_LABEL = { admin: 'Admin', production_manager: 'Production manager', accounting: 'Accounting', staff: 'Staff' };
const DONE = { users: true, scanner: true };

function show(id) { ['vLogin', 'vStaff', 'vOffice'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
function route() {
  $('menu').classList.add('hidden');
  const u = user();
  if (!u) { show('vLogin'); $('title').textContent = 'Sign in'; return; }
  if (u.role === 'staff' || !NAV[u.role]) {
    show('vStaff'); $('title').textContent = 'OYP Jewelry'; $('hi').textContent = 'Hi, ' + u.display_name; return;
  }
  show('vOffice'); $('title').textContent = 'Back office';
  const nav = NAV[u.role], cur = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const page = nav.some(n => n[0] === cur) ? cur : nav[0][0];
  $('side').innerHTML = nav.map(([k, t]) => k === 'scanner' ? `<a href="${SCANNER}" target="_blank" rel="noopener">${esc(t)} ↗</a>`
    : `<a href="#/${k}" class="${k === page ? 'on' : ''}">${esc(t)}${DONE[k] ? '' : '<small>soon</small>'}</a>`).join('')
    + `<div class="who"><span class="lab">${esc(ROLE_LABEL[u.role])}</span><b>${esc(u.display_name)}</b><button class="pill outline" data-logout>LOG OUT</button></div>`;
  const title = nav.find(n => n[0] === page)[1];
  if (page === 'users') return usersPage();
  $('main').innerHTML = `<h2>${esc(title)}</h2><p class="muted">Signed in as ${esc(u.display_name)} · ${esc(ROLE_LABEL[u.role])}</p><div class="soonbox">Coming soon</div>`;
}
window.addEventListener('hashchange', route);
$('btnMenu').onclick = () => {
  const u = user(), m = $('menu');
  if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
  m.innerHTML = !u ? `<a href="${SCANNER}">Card scanner</a>`
    : (u.role === 'staff' || !NAV[u.role] ? `<a href="${SCANNER}">Scan JO card</a>`
      : NAV[u.role].map(([k, t]) => `<a href="${k === 'scanner' ? SCANNER : '#/' + k}">${esc(t)}</a>`).join('')) + '<button data-logout>Log out</button>';
  m.classList.remove('hidden');
};
document.addEventListener('click', e => { if (!e.target.closest('#menu,#btnMenu')) $('menu').classList.add('hidden'); });

/* ---------- admin: staff logins ---------- */
async function usersPage(shown) {
  const m = $('main');
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
    if (!r.ok) return toast(r.error); usersPage(r);
  };
  const r = await call('listUsers');
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
    if (!r.ok) return toast(r.error); usersPage(r.code ? r : null);
  });
}
function showCode(un, c) {
  $('codeShown').innerHTML = `<div class="codebox"><span class="lab">Code for ${esc(un)} · shown once</span><div class="c">${esc(c)}</div>
    <span class="muted">Give it to them privately. They sign in with their first name and this code.</span></div>`;
}

drawDots(); route();
// re-check the session with the server on load (catches resets / deactivation)
if (user()) call('me').then(r => { if (r.ok) { localStorage.setItem(K.u, JSON.stringify(r.user)); route(); } });
})();
