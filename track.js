/* "Track my order": JO number + the mobile or email on that order. Read-only. Used on the landing page and on My orders (signed out). */
window.OYPTrack = (() => {
'use strict';
const { call, esc, peso, slides } = OYP;
/* price, payments and balance (only what the server sends customers: no costs) */
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
function mount(el) {
  el.innerHTML = `<h2>Track my order</h2>
  <p class="grey">Use the JO number on your receipt and the mobile number or email you gave us.</p>
  <label class="field"><span class="lab">JO number</span><input class="tJo" autocapitalize="characters" spellcheck="false" placeholder="26-001"></label>
  <label class="field"><span class="lab">Mobile number or email</span><input class="tWho" autocomplete="tel" spellcheck="false" placeholder="0917 123 4567"></label>
  <p class="err tErr" role="alert"></p><button class="pill wide tGo">TRACK</button><div class="tOut"></div>`;
  const $ = c => el.querySelector('.' + c), err = t => { $('tErr').textContent = t || ''; }, b = $('tGo');
  async function go() {
    const jo = $('tJo').value.trim(), who = $('tWho').value.trim();
    err(''); $('tOut').innerHTML = '';
    if (!/\d{2}\s*[-,.\/ ]?\s*\d{3,4}/.test(jo)) return err('Type the JO number, like 26-001');
    if (!/@/.test(who) && who.replace(/\D/g, '').length < 10) return err('Type the mobile number or email on the order');
    b.disabled = true; b.textContent = 'CHECKING…';
    const r = await call('custTrack', { jo, contact: who });
    b.disabled = false; b.textContent = 'TRACK';
    if (!r.ok) return err(r.error || 'We couldn\'t find that order');
    const j = r.job, safe = r.safe_photos === true, steps = j.stages && j.stages.length ? j.stages : [{ label: j.stage || 'In progress', status: 'doing' }];
    $('tOut').innerHTML = `<div class="trk">${safe && j.photos ? '<div class="tph"></div>' : ''}<p class="lab">Order ${esc(j.jo)}</p><h3>${esc(j.description || j.item_type || 'Your piece')}</h3>${j.item_type && j.description ? `<p class="grey">${esc(j.item_type)}</p>` : ''}
    <span class="chipg">${esc(j.status === 'done' ? 'Ready' : j.stage || 'In progress')}</span>${specs(j)}
    <p class="sec">Progress</p><ul class="steps">${steps.map(s => `<li class="${esc(s.status)}"><i></i>${esc(s.label)}${s.status === 'doing' ? ' — in progress' : ''}</li>`).join('')}</ul>
    ${money(j)}
    <p class="note">Sign in to see all your orders in one place.</p></div>`;
    const ph = $('tph'); // piece photos only (the server never sends JO card scans)
    if (ph) slides(ph, j.photos, n => call('custTrackPhoto', { jo, contact: who, n }).then(x => (x && x.ok && x.src) || ''));
  }
  b.onclick = go;
  [$('tJo'), $('tWho')].forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
  const q = new URLSearchParams(location.search).get('jo'); if (q) $('tJo').value = q;
}
return { mount, money, specs };
})();
