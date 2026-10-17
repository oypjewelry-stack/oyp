/* Customer portal: sign up (name, email, mobile, PIN) -> email check code -> own orders only. */
(() => {
'use strict';
const { call, esc, peso, slides } = OYP, app = document.getElementById('app');
const K = { s: 'oypCustSession', exp: 'oypCustExp', c: 'oypCust', email: 'oypCustEmail' };
const sess = () => { const e = localStorage.getItem(K.exp); return e && new Date(e) > new Date() ? localStorage.getItem(K.s) : ''; };
const save = r => { localStorage.setItem(K.s, r.session); localStorage.setItem(K.exp, r.expires_at); localStorage.setItem(K.c, JSON.stringify(r.customer)); localStorage.setItem(K.email, r.customer.email); };
const clear = () => [K.s, K.exp, K.c].forEach(k => localStorage.removeItem(k));
const toast = t => { const el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2800); };
const v = id => document.getElementById(id).value.trim();
const field = (id, lab, type = 'text', extra = '') => `<label class="field"><span class="lab">${lab}</span><input id="${id}" type="${type}" ${extra}></label>`;
const pinField = (id, lab) => field(id, lab, 'password', 'class="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"');
let jobs = [];
async function busy(btn, fn) { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } }
function err(t) { document.getElementById('err').textContent = t || ''; }

function start() { // signed out: track one order by JO + mobile/email, or sign in
  history.replaceState(null, '', location.pathname + location.search);
  app.innerHTML = `<h1>My orders</h1><p class="grey">Track an order, or sign in to see all your pieces.</p>
  <section class="card" id="track" style="margin-top:20px"></section>
  <div class="or">OR</div><button class="pill ghost wide" id="toIn">SIGN IN</button>
  <p class="grey" style="margin-top:10px;text-align:center">New here? <button class="lk" id="toUp">Create an account</button></p>`;
  OYPTrack.mount(document.getElementById('track'));
  document.getElementById('toIn').onclick = () => signIn(); document.getElementById('toUp').onclick = signUp;
}
function signIn(msg) {
  app.innerHTML = `<button class="back" id="bk">‹ Back</button><h1>Welcome back</h1><p class="grey">Sign in to see how your pieces are coming along.</p>
  <div class="card" style="margin-top:20px">${field('em', 'Email', 'email', `autocomplete="email" value="${esc(localStorage.getItem(K.email) || '')}"`)}${pinField('pin', '4-digit PIN')}
  <p id="err" class="err" role="alert"></p><button id="go" class="pill wide">SIGN IN</button>
  <div class="links"><button class="lk" id="toUp">Create account</button><button class="lk" id="toForgot">Forgot PIN?</button></div></div>
  ${msg ? `<p class="note">${esc(msg)}</p>` : ''}`;
  const go = document.getElementById('go');
  go.onclick = () => busy(go, async () => {
    if (!v('em')) return err('Type your email'); if (!/^\d{4}$/.test(v('pin'))) return err('Type your 4-digit PIN');
    const r = await call('custLogin', { email: v('em'), pin: v('pin') }); if (!r.ok) { document.getElementById('pin').value = ''; return err(r.error); }
    save(r); home();
  });
  document.getElementById('pin').onkeydown = e => { if (e.key === 'Enter') go.click(); };
  document.getElementById('toUp').onclick = signUp; document.getElementById('toForgot').onclick = forgot;
  document.getElementById('bk').onclick = start;
}
function signUp() {
  app.innerHTML = `<button class="back" id="bk">‹ Back</button><h1>Create account</h1><p class="grey">Use the email and mobile number you gave us, so we can find your orders.</p>
  <div class="card" style="margin-top:20px">${field('fn', 'Full name', 'text', 'autocomplete="name" autocapitalize="words"')}${field('em', 'Email', 'email', 'autocomplete="email"')}
  ${field('mb', 'Mobile number', 'tel', 'autocomplete="tel" placeholder="0917 123 4567"')}${pinField('pin', 'Choose a 4-digit PIN')}${pinField('pin2', 'Type the PIN again')}
  <p id="err" class="err" role="alert"></p><button id="go" class="pill wide">CREATE ACCOUNT</button></div>`;
  document.getElementById('bk').onclick = () => signIn();
  const go = document.getElementById('go');
  go.onclick = () => busy(go, async () => {
    if (v('pin') !== v('pin2')) return err('The two PINs are different');
    if (!/^\d{4}$/.test(v('pin'))) return err('The PIN must be 4 digits');
    const r = await call('custSignup', { full_name: v('fn'), email: v('em'), mobile: v('mb'), pin: v('pin') }); if (!r.ok) return err(r.error);
    localStorage.setItem(K.email, v('em')); codeStep('verify', v('em'));
  });
}
function forgot() {
  app.innerHTML = `<button class="back" id="bk">‹ Back</button><h1>Forgot PIN</h1><p class="grey">We'll email you a 6-digit code to set a new PIN.</p>
  <div class="card" style="margin-top:20px">${field('em', 'Email', 'email', `autocomplete="email" value="${esc(localStorage.getItem(K.email) || '')}"`)}
  <p id="err" class="err" role="alert"></p><button id="go" class="pill wide">EMAIL ME A CODE</button></div>`;
  document.getElementById('bk').onclick = () => signIn();
  const go = document.getElementById('go');
  go.onclick = () => busy(go, async () => { const r = await call('custForgot', { email: v('em') }); if (!r.ok) return err(r.error); codeStep('reset', v('em'), r.message); });
}
function codeStep(kind, email, msg) {
  app.innerHTML = `<button class="back" id="bk">‹ Back</button><h1>${kind === 'verify' ? 'Check your email' : 'Set a new PIN'}</h1>
  <p class="grey">${esc(msg || 'We sent a 6-digit code to ' + email + '. It works for 15 minutes. Check spam if you don\'t see it.')}</p>
  <div class="card" style="margin-top:20px">${field('cd', '6-digit code', 'text', 'class="pin" inputmode="numeric" maxlength="6" autocomplete="one-time-code"')}
  ${kind === 'reset' ? pinField('pin', 'New 4-digit PIN') + pinField('pin2', 'Type it again') : ''}
  <p id="err" class="err" role="alert"></p><button id="go" class="pill wide">${kind === 'verify' ? 'CONFIRM' : 'SAVE NEW PIN'}</button></div>`;
  document.getElementById('bk').onclick = () => signIn();
  const go = document.getElementById('go');
  go.onclick = () => busy(go, async () => {
    if (!/^\d{6}$/.test(v('cd'))) return err('Type the 6-digit code from the email');
    let r;
    if (kind === 'verify') r = await call('custVerify', { email, code: v('cd') });
    else { if (v('pin') !== v('pin2')) return err('The two PINs are different'); r = await call('custReset', { email, code: v('cd'), pin: v('pin') }); }
    if (!r.ok) return err(r.error); save(r); home(kind === 'verify' && !r.linked ? 'pending' : '');
  });
}
async function home(flag) {
  app.classList.remove('wide');
  app.innerHTML = '<p class="grey">Loading your orders…</p>';
  const r = await call('custJobs', {}, sess());
  if (!r.ok) { if (r.code === 'NO_SESSION') { clear(); return signIn(); } app.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
  jobs = r.jobs; const c = r.customer;
  if (r.safe_photos !== true) jobs.forEach(j => { j.photos = 0; }); // older server: show no photos at all
  app.innerHTML = `<p class="lab">Hello</p><h1>${esc(c.full_name)}</h1><p class="grey">${esc(c.mobile)}</p>
  ${!jobs.length ? `<p class="note">${c.status === 'pending' || flag === 'pending' ? 'Thanks for signing up! We couldn\'t match your account to an order yet. We\'ll link your orders shortly.' : 'No orders yet.'}</p>` : ''}
  <div class="list">${jobs.map((j, i) => `<button class="row" data-i="${i}"><span class="th" data-jo="${esc(j.jo)}"></span><span><b>${esc(j.description || 'Order ' + j.jo)}</b>
  <span class="grey">Order ${esc(j.jo)}${j.due_date ? ' · due ' + esc(j.due_date) : ''}</span><br><span class="chipg">${esc(j.status === 'done' ? 'Ready' : j.stage || 'In progress')}</span></span></button>`).join('')}</div>
  <div style="text-align:center;margin-top:30px"><button class="lk" id="out">Sign out</button></div>`;
  app.querySelectorAll('.row').forEach(b => b.onclick = () => detail(jobs[b.dataset.i]));
  jobs.forEach(j => j.photos && photo(j.jo).then(src => { const el = app.querySelector(`.th[data-jo="${CSS.escape(j.jo)}"]`); if (el && src) el.style.backgroundImage = `url("${src}")`; }));
  document.getElementById('out').onclick = async () => { await call('custLogout', {}, sess()); clear(); start(); };
}
const cache = {};
function photo(jo) { return cache[jo] || (cache[jo] = call('custPhoto', { jo }, sess()).then(r => r.ok ? r.src : '')); }
function detail(j) {
  app.classList.add('wide'); window.scrollTo(0, 0);
  const specs = [j.metal && j.karat ? `${j.metal} · ${j.karat}` : j.metal, j.size && 'Size ' + j.size, j.due_date && 'Due ' + j.due_date].filter(Boolean);
  app.innerHTML = `<button class="back" id="bk">‹ My orders</button><div class="detail2"><div id="hero"></div><div>
  <h1>${esc(j.description || 'Order ' + j.jo)}</h1><p class="grey">Order ${esc(j.jo)}${j.item_type ? ' · ' + esc(j.item_type) : ''}</p>
  ${j.specs ? OYPTrack.specs(j) : specs.length ? `<p class="sec">Details</p><ul class="specs">${specs.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  <p class="sec">Progress</p><ul class="steps">${(j.stages.length ? j.stages : [{ label: j.stage || 'In progress', status: 'doing' }]).map(s => `<li class="${esc(s.status)}"><i></i>${esc(s.label)}${s.status === 'doing' ? ' — in progress' : ''}</li>`).join('')}</ul>
  ${OYPTrack.money(j)}
  <div class="buy" style="margin-top:18px"><button class="blk" id="rf" style="max-width:none">REFRESH</button></div></div></div>`;
  slides(document.getElementById('hero'), j.photos, () => photo(j.jo));
  document.getElementById('bk').onclick = () => home();
  document.getElementById('rf').onclick = async () => { delete cache[j.jo]; const r = await call('custJobs', {}, sess()); const n = r.ok && r.jobs.find(x => x.jo === j.jo); if (n && r.safe_photos !== true) n.photos = 0; if (n) { detail(n); toast('Up to date'); } else home(); };
}
const first = () => sess() ? home() : location.hash === '#signin' ? signIn() : location.hash === '#signup' ? signUp() : start();
window.addEventListener('hashchange', () => { if (!sess() && /^#sign(in|up)$/.test(location.hash)) first(); });
first();
})();
