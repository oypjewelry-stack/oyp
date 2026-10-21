/* Customer portal: sign up (name, email, mobile, PIN) -> email check code -> own orders only.
   v3 (server Portal.gs v3 answers custJobs with pv: 3): order cards (photo, step dots, target date, balance), quotes waiting for
   approval at the top, and a tap opens the SAME card as Track my order (OYPTrack.result) with Approve / Ask a question.
   An older server (no pv) gets the old list exactly as before. */
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
  if (r.pv >= 3) return homeV3(r, flag);
  jobs = r.jobs; const c = r.customer;
  if (r.safe_photos !== true) jobs.forEach(j => { j.photos = 0; }); // older server: show no photos at all
  app.innerHTML = `<p class="lab">Hello</p><h1>${esc(c.full_name)}</h1><p class="grey">${esc(c.mobile)}</p>
  <div id="myap"></div>
  ${!jobs.length ? `<p class="note">${c.status === 'pending' || flag === 'pending' ? 'Thanks for signing up! We couldn\'t match your account to an order yet. We\'ll link your orders shortly.' : 'No orders yet.'}</p>` : ''}
  <div class="list">${jobs.map((j, i) => `<button class="row" data-i="${i}"><span class="th" data-jo="${esc(j.jo)}"></span><span><b>${esc(j.description || 'Order ' + j.jo)}</b>
  <span class="grey">Order ${esc(j.jo)}${j.due_date ? ' · due ' + esc(j.due_date) : ''}</span><br><span class="chipg">${esc(j.status === 'done' ? 'Ready' : j.stage || 'In progress')}</span></span></button>`).join('')}</div>
  <div style="text-align:center;margin-top:30px"><button class="lk" id="out">Sign out</button></div>`;
  app.querySelectorAll('.row').forEach(b => b.onclick = () => detail(jobs[b.dataset.i]));
  jobs.forEach(j => j.photos && photo(j.jo).then(src => { const el = app.querySelector(`.th[data-jo="${CSS.escape(j.jo)}"]`); if (el && src) el.style.backgroundImage = `url("${src}")`; }));
  document.getElementById('out').onclick = async () => { await call('custLogout', {}, sess()); clear(); start(); };
  mountAppts();
}
/* ---------- v3 ---------- */
let V3 = { r: null, filter: 'all' };
const isReady = j => j.ready, isDone = j => j.picked_up;
const FILTERS = [['all', 'All'], ['open', 'In progress', j => !isReady(j) && !isDone(j)], ['ready', 'Ready', isReady], ['done', 'Picked up', isDone]];
function balLine(j) {
  if (j.total == null) return '<span class="grey">Price coming soon</span>';
  return j.balance > 0 ? `Balance <b>${peso(j.balance)}</b>` : '<b>Fully paid</b>';
}
function card(j, i) {
  const q = j.quote, dots = (j.steps || []).map(s => `<i class="${esc(s.state)}"></i>`).join('');
  return `<button class="ocard" data-i="${i}"><span class="th" data-jo="${esc(j.jo)}"></span><span class="ob">
    <span class="lab">Order ${esc(j.jo)}</span><b class="oi">${esc(j.item)}</b>
    <span class="odots" aria-hidden="true">${dots}</span>
    <span class="ost"><span class="chipg${j.ready ? ' rdy' : ''}">${esc(j.stage)}</span>${j.target ? `<span class="grey sm">${j.ready || j.picked_up ? 'Promised for' : 'Target'} ${esc(j.target)}</span>` : ''}</span>
    <span class="obal">${balLine(j)}${q && q.can_approve ? '<span class="chipg qwait">Quote to approve</span>' : ''}</span></span></button>`;
}
function homeV3(r, flag) {
  V3.r = r; jobs = r.jobs; const c = r.customer, wait = jobs.filter(j => j.quote && j.quote.can_approve);
  const f = FILTERS.find(x => x[0] === V3.filter) || FILTERS[0], shown = jobs.map((j, i) => [j, i]).filter(([j]) => !f[2] || f[2](j));
  app.innerHTML = `<p class="lab">Hello</p><h1>${esc(c.full_name)}</h1><p class="grey">${esc(c.mobile)}</p>
  <div id="myap"></div>
  ${wait.length ? `<section class="myq"><p class="sec">Waiting for your approval</p>${wait.map(j => `<button class="myqrow" data-jo="${esc(j.jo)}"><span><b>${esc(j.item)}</b>
    <span class="grey sm">Order ${esc(j.jo)} · ${peso(j.quote.total)}${j.quote.valid_until ? ' · valid until ' + esc(j.quote.valid_until) : ''}</span></span><span class="pill sm">REVIEW</span></button>`).join('')}</section>` : ''}
  ${!jobs.length ? `<p class="note">${c.status === 'pending' || flag === 'pending' ? 'Thanks for signing up! We couldn\'t match your account to an order yet. We\'ll link your orders shortly.' : 'No orders yet.'}</p>`
    : `<div class="ohead"><p class="sec">Your orders</p>${jobs.length > 2 ? `<div class="ofil">${FILTERS.map(x => `<button class="${x[0] === f[0] ? 'on' : ''}" data-f="${x[0]}">${x[1]}</button>`).join('')}</div>` : ''}</div>
    <div class="olist">${shown.map(([j, i]) => card(j, i)).join('') || '<p class="grey">Nothing here.</p>'}</div>`}
  ${OYPTrack.contactHtml(r.contact)}
  <div style="text-align:center;margin-top:30px"><button class="lk" id="out">Sign out</button></div>`;
  app.querySelectorAll('.ocard').forEach(b => b.onclick = () => detailV3(jobs[b.dataset.i]));
  app.querySelectorAll('.myqrow').forEach(b => b.onclick = () => detailV3(jobs.find(j => j.jo === b.dataset.jo), true));
  app.querySelectorAll('.ofil button').forEach(b => b.onclick = () => { V3.filter = b.dataset.f; homeV3(r, flag); });
  shown.forEach(([j]) => j.photos && photo(j.jo).then(src => { const el = app.querySelector(`.th[data-jo="${CSS.escape(j.jo)}"]`); if (el && src) el.style.backgroundImage = `url("${src}")`; }));
  document.getElementById('out').onclick = async () => { await call('custLogout', {}, sess()); clear(); start(); };
  mountAppts();
}
/* ---------- appointment requests (signed-in only; the server keeps other people's bookings to itself) ---------- */
const APPT_TYPES = [['fitting', 'Fitting'], ['pickup', 'Pickup'], ['appraisal', 'Appraisal'], ['repair', 'Repair']];
const apptPad = n => String(n).padStart(2, '0');
function apptClock(min) {
  let h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + (m ? ':' + apptPad(m) : '') + ' ' + ap;
}
function apptDayLabel(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return '';
  const [y, mo, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return DN[dt.getUTCDay()] + ' ' + MON[mo - 1] + ' ' + d;
}
function apptRow(a) {
  const when = a.status === 'booked' && a.time ? apptDayLabel(a.day) + ', ' + a.time : (a.preferred ? 'Preferred ' + apptDayLabel(a.day) + ', ' + a.preferred : apptDayLabel(a.day));
  return `<div class="arow"><b class="alab">${esc(a.type_label || a.type || 'Visit')}</b><span class="ast">${esc(a.label || '')}</span>${when ? `<span class="grey sm">${esc(when)}</span>` : ''}${a.note ? `<span class="grey sm">${esc(a.note)}</span>` : ''}</div>`;
}
function apptTimes(hours, type) {
  const open = hours && hours.open != null ? Number(hours.open) : 9 * 60;
  const close = hours && hours.close != null ? Number(hours.close) : 16 * 60;
  const step = hours && hours.step ? Number(hours.step) : 15;
  const need = type === 'appraisal' ? 15 : 60;
  let o = '';
  for (let m = open; m + need <= close; m += step) o += `<option value="${apptPad(Math.floor(m / 60))}:${apptPad(m % 60)}">${apptClock(m)}</option>`;
  return o || '<option value="">No time in shop hours</option>';
}
async function mountAppts(sent) {
  const host = document.getElementById('myap');
  if (!host || !sess()) return;
  host.innerHTML = '<p class="sec">Appointments</p><p class="grey">Loading…</p>';
  const r = await call('portalAppts', {}, sess());
  if (!document.getElementById('myap')) return;
  if (!r.ok) {
    host.innerHTML = r.code === 'OLD_BACKEND' ? '' : `<p class="sec">Appointments</p><p class="err">${esc(r.error || 'Could not load')}</p>`;
    return;
  }
  if (r.setup === false) {
    host.innerHTML = '<p class="sec">Appointments</p><p class="grey">Appointment requests are not switched on yet.</p>';
    return;
  }
  const list = Array.isArray(r.appts) ? r.appts : [];
  const open = list.filter(a => a.status === 'requested').length;
  const limit = r.limit || 3;
  const hours = r.hours || {};
  host.innerHTML = `<p class="sec">Appointments</p>
    ${sent ? '<p class="note" id="apSent">Request sent. We\'ll confirm the time.</p>' : ''}
    ${list.map(apptRow).join('') || '<p class="grey">No visits yet.</p>'}
    ${hours.label ? `<p class="grey sm">Shop hours: ${esc(hours.label)}</p>` : ''}
    ${open >= limit ? '<p class="note">You already have 3 requests waiting. We\'ll confirm those first.</p>' : `<div class="card apform">
      <label class="field"><span class="lab">Visit</span><select id="apKind">${APPT_TYPES.map(([k, lab]) => `<option value="${k}">${lab}</option>`).join('')}</select></label>
      ${field('apDay', 'Preferred date', 'date')}
      <label class="field"><span class="lab">Preferred time</span><select id="apTime">${apptTimes(hours, 'fitting')}</select></label>
      <label class="field"><span class="lab">Note</span><textarea id="apNote" maxlength="500" placeholder="Optional"></textarea></label>
      <p id="apErr" class="err" role="alert"></p><button id="apGo" class="pill wide">REQUEST APPOINTMENT</button></div>`}`;
  const kind = document.getElementById('apKind');
  const dayEl = document.getElementById('apDay');
  if (dayEl) dayEl.min = new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
  if (kind) kind.onchange = () => { const t = document.getElementById('apTime'); const cur = t.value; t.innerHTML = apptTimes(hours, kind.value); if ([...t.options].some(o => o.value === cur)) t.value = cur; };
  const go = document.getElementById('apGo');
  if (!go) return;
  go.onclick = () => busy(go, async () => {
    const err = t => { const el = document.getElementById('apErr'); if (el) el.textContent = t || ''; };
    const day = v('apDay'), start = document.getElementById('apTime').value;
    if (!day || !start) return err('Pick a date and a time');
    const res = await call('portalApptRequest', { type: kind.value, day, start, note: document.getElementById('apNote').value.trim() }, sess());
    if (!res.ok) return err(res.error || 'Could not send');
    if (!res.sent) return err('Could not send');
    mountAppts(true);
  });
}
function detailV3(j, toQuote, note, error) {
  app.classList.add('wide'); window.scrollTo(0, 0);
  app.innerHTML = `<button class="back" id="bk">‹ My orders</button><div class="mydet">${OYPTrack.result(j, '', false, V3.r && V3.r.contact)}</div>
  <div class="buy" style="margin-top:18px"><button class="blk" id="rf" style="max-width:none">REFRESH</button></div>`;
  OYPTrack.showPhotos(app, j, '', n => photo(j.jo, n));
  OYPTrack.wire(app, j, { session: sess() }, (nj, n2, e2) => { const i = jobs.findIndex(x => x.jo === nj.jo); if (i >= 0) jobs[i] = nj; detailV3(nj, true, n2, e2); });
  if (note || error) OYPTrack.noteAfter(app, note, error);
  else if (toQuote) { const q = app.querySelector('#tq'); if (q) setTimeout(() => q.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
  document.getElementById('bk').onclick = () => { app.classList.remove('wide'); V3.r ? homeV3(Object.assign(V3.r, { jobs })) : home(); };
  document.getElementById('rf').onclick = async () => { Object.keys(cache).forEach(k => { if (k.startsWith(j.jo + ':')) delete cache[k]; });
    const r = await call('custJobs', {}, sess()); if (r.ok && r.pv >= 3) { V3.r = r; jobs = r.jobs; } const n = r.ok && r.jobs.find(x => x.jo === j.jo); if (n) { detailV3(n); toast('Up to date'); } else home(); };
}
const cache = {};
function photo(jo, n = 0) { const k = jo + ':' + n; return cache[k] || (cache[k] = call('custPhoto', { jo, n }, sess()).then(r => r.ok ? r.src : '')); }
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
  document.getElementById('rf').onclick = async () => { delete cache[j.jo + ':0']; const r = await call('custJobs', {}, sess()); const n = r.ok && r.jobs.find(x => x.jo === j.jo); if (n && r.safe_photos !== true) n.photos = 0; if (n) { detail(n); toast('Up to date'); } else home(); };
}
const first = () => sess() ? home() : location.hash === '#signin' ? signIn() : location.hash === '#signup' ? signUp() : start();
window.addEventListener('hashchange', () => { if (!sess() && /^#sign(in|up)$/.test(location.hash)) first(); });
first();
})();
