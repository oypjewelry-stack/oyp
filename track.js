/* "Track my order" (client lookup): JO number + the mobile or email on that order (or a portal code). Read-only.
   Used on the landing page, on My orders (signed out) and on /track/ (full page, bookmarkable #t=<signed link>).
   Server: action clientLookup / clientPhoto (Portal.gs). Before that paste the server doesn't know the action and the
   answer has no "portal" mark, so the page just says online tracking is coming soon (nothing breaks). */
window.OYPTrack = (() => {
'use strict';
const { call, esc, peso, slides } = OYP;
const SOON = 'Online order tracking is coming soon. For now, message us and we\'ll send you an update.';
const CONTACT0 = 'Questions? Call 8892 1171 or email oypjewelry@gmail.com'; // used only before the Portal paste (after it: Settings › Customer pages)
/* the shop's contact line, with tap-to-call and tap-to-email links. 8-digit Metro Manila landlines dial as +63 2 ... from a mobile. */
function telHref(raw) {
  let d = raw.replace(/\D/g, '');
  if (/^63\d{9,10}$/.test(d)) return '+' + d;
  if (/^0\d{9,10}$/.test(d)) return '+63' + d.slice(1);
  if (/^[2-9]\d{7}$/.test(d)) return '+632' + d;
  return d;
}
function contactHtml(text) {
  if (!text) return '';
  const parts = String(text).split(/([^\s@<>]+@[^\s@<>]+\.[a-z]{2,}|\+?\d[\d\s-]{5,}\d)/i);
  return '<p class="tcontact">' + parts.map((x, i) => !(i % 2) ? esc(x) : /@/.test(x) ? `<a href="mailto:${esc(x)}">${esc(x)}</a>` : `<a href="tel:${esc(telHref(x))}">${esc(x.trim())}</a>`).join('') + '</p>';
}
/* price, payments and balance for the signed-in My orders page (custJobs answer; unchanged) */
function money(j) {
  if (j.price == null && j.total == null) return '<p class="sec">Price</p><p class="grey">Your price will show here once we send your quote.</p>';
  const price = j.price != null ? j.price : j.total, pays = j.payments || [];
  return `<p class="sec">Payments</p>
  <ul class="pays"><li><span>Price</span><b>${peso(price)}</b></li>${pays.map(p => `<li><span>${esc(p.date)}${p.method ? ' · ' + esc(p.method) : ''}</span><b>− ${peso(p.amount)}</b></li>`).join('')}
  <li class="bal"><span>Balance due</span><b>${peso(j.balance)}</b></li></ul>
  ${!pays.length ? '<p class="grey sm">No payments recorded yet.</p>' : ''}`;
}
function specs(j) { // label/value pairs picked by the server (allowlist)
  const L = j.specs || [], due = j.due_date ? [{ label: 'Due', value: j.due_date }] : [];
  if (!L.length && !due.length) return '';
  return `<p class="sec">Details</p><dl class="specs2">${L.concat(due).map(x => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl>`;
}
/* ---------- the client lookup card ---------- */
function balanceBox(j) {
  if (j.total == null) return `<div class="tbal"><p class="lab">Price</p><p class="grey">Your price will show here once we send your quote.</p>${j.paid ? `<p class="tline"><span>Paid so far</span><b>${peso(j.paid)}</b></p>` : ''}</div>`;
  const done = !(j.balance > 0);
  return `<div class="tbal${done ? ' paid' : ''}"><p class="tline"><span>Total</span><b>${peso(j.total)}</b></p><p class="tline"><span>Paid</span><b>${peso(j.paid)}</b></p>
  <div class="tdue"><span class="lab">${done ? 'Fully paid' : 'Balance due'}</span><b>${peso(j.balance)}</b></div></div>`;
}
function stepper(j) {
  return `<ol class="tsteps">${(j.steps || []).map(s => `<li class="${esc(s.state)}"><i>${s.state === 'done' ? '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</i><span>${esc(s.label)}${s.state === 'now' && j.stage && j.stage !== s.label ? `<small>${esc(j.stage)}</small>` : ''}</span></li>`).join('')}</ol>`;
}
function result(j, token, full, contact) {
  const dates = [j.received && ['Received', j.received], j.target && [j.ready || j.picked_up ? 'Promised for' : 'Target date', j.target]].filter(Boolean);
  return `<div class="trk2${full ? ' full' : ''}">
    <div class="tph"></div>
    <div class="tinfo">
      <p class="lab">Order ${esc(j.jo)}</p><h3>${esc(j.item)}</h3>
      <span class="chipg${j.ready ? ' rdy' : ''}">${esc(j.stage)}</span>
      ${j.ready ? '<p class="note">Your piece is ready. Please come by the shop to pick it up.</p>' : ''}
      ${dates.length ? `<div class="tdates">${dates.map(d => `<div><span class="lab">${esc(d[0])}</span><b>${esc(d[1])}</b></div>`).join('')}</div>` : ''}
      <p class="sec">Progress</p>${stepper(j)}
      ${j.specs && j.specs.length ? `<p class="sec">Details</p><dl class="specs2">${j.specs.map(x => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl>` : ''}
      <p class="sec">Payment</p>${balanceBox(j)}
      ${full ? '<p class="grey sm tsave">Bookmark this page to check again without typing. The link works for 30 days.</p>'
        : `<p class="grey sm" style="margin-top:14px"><a class="lk" href="/track/#t=${encodeURIComponent(token)}">Open this order on its own page</a></p>`}
      ${contactHtml(contact)}
    </div></div>`;
}
function showPhotos(el, j, token) {
  const ph = el.querySelector('.tph'); if (!ph) return;
  if (!j.photos) { ph.remove(); return; }
  slides(ph, j.photos, n => call('clientPhoto', { token, n }).then(x => (x && x.ok && x.src) || ''));
}
/* el: container. opts.full = /track/ page (result replaces the form; link saved in the address bar) */
function mount(el, opts = {}) {
  const full = !!opts.full;
  el.innerHTML = `<div class="tform"><h2>Track my order</h2>
  <p class="grey">Use the JO number on your receipt and the mobile number or email you gave us.</p>
  <label class="field"><span class="lab">JO number</span><input class="tJo" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="26-001"></label>
  <label class="field tW"><span class="lab">Mobile number or email</span><input class="tWho" autocomplete="tel" spellcheck="false" placeholder="0917 123 4567"></label>
  <label class="field tC hidden"><span class="lab">Portal code</span><input class="tCode" autocapitalize="characters" spellcheck="false" placeholder="From your receipt"></label>
  <p class="err tErr" role="alert"></p><button class="pill wide tGo">TRACK</button>
  <p class="tswap"><button class="lk tSw" type="button">I have a portal code</button></p></div><div class="tOut"></div>`;
  const $ = c => el.querySelector('.' + c), err = t => { $('tErr').textContent = t || ''; }, b = $('tGo');
  let useCode = false;
  $('tSw').onclick = () => { useCode = !useCode; $('tW').classList.toggle('hidden', useCode); $('tC').classList.toggle('hidden', !useCode);
    $('tSw').textContent = useCode ? 'Use my mobile number or email' : 'I have a portal code'; err(''); };
  function soon() { $('tOut').innerHTML = `<p class="note">${esc(SOON)}</p>${contactHtml(CONTACT0)}`; }
  const fail = r => { err(r.error || 'We couldn\'t find that order'); if (r.code !== 'INPUT') $('tOut').innerHTML = contactHtml(r.contact); };
  function show(r) {
    const j = r.job;
    if (full) { el.querySelector('.tform').classList.add('hidden'); history.replaceState(null, '', '#t=' + encodeURIComponent(r.token)); }
    $('tOut').innerHTML = result(j, r.token, full, r.contact) + (full ? '<p class="tagain"><button class="lk tAg" type="button">Look up another order</button></p>' : '');
    showPhotos($('tOut'), j, r.token);
    const ag = $('tAg'); if (ag) ag.onclick = () => { history.replaceState(null, '', location.pathname); $('tOut').innerHTML = ''; el.querySelector('.tform').classList.remove('hidden'); };
    if (full) window.scrollTo(0, 0);
  }
  async function ask(data) {
    b.disabled = true; b.textContent = 'CHECKING…';
    const r = await call('clientLookup', data);
    b.disabled = false; b.textContent = 'TRACK';
    return r || {};
  }
  async function go() {
    const jo = $('tJo').value.trim(), who = $('tWho').value.trim(), code = $('tCode').value.trim();
    err(''); $('tOut').innerHTML = '';
    if (!/\d{2}\s*[-,.\/ ]?\s*\d{3,4}/.test(jo)) return err('Type the JO number, like 26-001');
    if (useCode ? code.replace(/[\s-]/g, '').length < 6 : (!/@/.test(who) && who.replace(/\D/g, '').length < 10)) return err(useCode ? 'Type the portal code from your receipt' : 'Type the mobile number or email on the order');
    const r = await ask(useCode ? { jo, code } : { jo, contact: who });
    if (r.code === 'NET') return err(r.error);
    if (!r.portal) return soon(); // server without Portal.gs yet
    if (!r.ok) return fail(r);
    show(r);
  }
  b.onclick = go;
  [$('tJo'), $('tWho'), $('tCode')].forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  const q = new URLSearchParams(location.search).get('jo'); if (q) $('tJo').value = q;
  const t = new URLSearchParams(location.hash.slice(1)).get('t');
  if (full && t) { // saved link
    el.querySelector('.tform').classList.add('hidden'); $('tOut').innerHTML = '<p class="grey tload">Opening your order…</p>';
    call('clientLookup', { token: t }).then(r => {
      r = r || {};
      if (r.ok && r.portal) return show(r);
      el.querySelector('.tform').classList.remove('hidden'); $('tOut').innerHTML = '';
      if (r.code === 'NET') return err(r.error);
      if (!r.portal) return soon();
      history.replaceState(null, '', location.pathname); fail(r);
    });
  }
}
return { mount, money, specs, result };
})();
