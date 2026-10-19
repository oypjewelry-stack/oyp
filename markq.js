/* OYP back office: "Mark approved" = record that the CLIENT approved a sent quote (in person / phone / chat / Telegram).
   Server: Portal.gs v3.2 portalMarkApproved (executives / admin). It is the same approval as the client's own Approve button on
   Track my order / My orders and Tessa's /approve: the quote becomes Accepted, a Client messages row is added (Dashboard), the JO review
   shows "Client approved", and Tessa posts it in the staff group (with the amount). Nothing is sent to the client.
   Shown only when portalSteps answers with can_mark + quotes (v3.2); before that paste nothing here appears.
   Used by review.js (JO review) and pay.js (Quotes). */
(() => {
'use strict';
const HOW = [['in_person', 'In person'], ['phone', 'Phone'], ['chat', 'Chat'], ['telegram', 'Telegram']];
const HOWL = { in_person: 'in person', phone: 'phone', chat: 'chat', telegram: 'Telegram' };
const peso = n => n == null ? '' : '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
// q = portalSteps quotes[jo] = {version, total, state: open|expired, sent, valid_until, sig}
function box(jo, q) {
  const { esc } = window.OYP, exp = q.state === 'expired';
  return `<div class="mq" data-mq="${esc(jo)}">
    <div class="mqhd"><span class="chip gold">Quote v${esc(q.version)} sent · waiting for the client</span>${exp ? `<span class="chip">Expired ${esc(q.valid_until)}</span>` : ''}</div>
    <button class="pill outline sm mqOpen" type="button">MARK APPROVED BY CLIENT</button>
    <div class="mqform hidden">
      <p class="mqq"><b>Client approved quote v${esc(q.version)}${q.total != null ? ' · ' + esc(peso(q.total)) : ''} for JO ${esc(jo)}?</b></p>
      <span class="lab">How did the client approve?</span>
      <div class="mqhow">${HOW.map(([k, l]) => `<button type="button" class="fchip mqHow" data-how="${k}">${esc(l)}</button>`).join('')}</div>
      ${exp ? `<label class="mqexp"><input type="checkbox" class="mqExp"> This quote expired on ${esc(q.valid_until)}. Approve it anyway.</label>` : ''}
      <div class="fbtns"><button type="button" class="pill sm mqGo" disabled>CONFIRM APPROVAL</button><button type="button" class="lnk mqNo">Cancel</button></div>
      <p class="fnote muted">The quote becomes Accepted, the Dashboard and JO review show it, and Tessa tells the staff group (with the amount). Nothing is sent to the client.</p>
      <p class="fnote mqErr" role="alert"></p>
    </div></div>`;
}
const doneHtml = (jo, version, how) => `<div class="cact"><span class="chip ok">Client approved quote v${window.OYP.esc(String(version))} · just now (marked by you, ${window.OYP.esc(HOWL[how] || how)})</span></div>`;
// onDone(r, how) after the server said yes (approved or already). Returns nothing.
function wire(root, jo, q, onDone) {
  const el = root.querySelector(`.mq[data-mq="${CSS.escape(jo)}"]`); if (!el) return;
  const f = el.querySelector('.mqform'), go = el.querySelector('.mqGo'), err = el.querySelector('.mqErr'), ex = el.querySelector('.mqExp');
  let how = '';
  const ready = () => { go.disabled = !how || (q.state === 'expired' && !(ex && ex.checked)); };
  el.querySelector('.mqOpen').onclick = () => { f.classList.remove('hidden'); el.querySelector('.mqOpen').classList.add('hidden'); };
  el.querySelector('.mqNo').onclick = () => { f.classList.add('hidden'); el.querySelector('.mqOpen').classList.remove('hidden'); how = ''; err.textContent = ''; el.querySelectorAll('.mqHow').forEach(b => b.classList.remove('on')); ready(); };
  el.querySelectorAll('.mqHow').forEach(b => b.onclick = () => { how = b.dataset.how; el.querySelectorAll('.mqHow').forEach(x => x.classList.toggle('on', x === b)); ready(); });
  if (ex) ex.onchange = ready;
  go.onclick = async () => {
    go.disabled = true; go.textContent = 'SAVING…'; err.textContent = '';
    const r = await window.OYP.call('portalMarkApproved', { jo, version: q.version, amount: q.total, sig: q.total == null ? q.sig : undefined, how, allow_expired: !!(ex && ex.checked) });
    go.textContent = 'CONFIRM APPROVAL';
    if (r && r.ok) { el.outerHTML = doneHtml(jo, q.version, how); if (onDone) onDone(r, how); return; }
    if (r && r.code === 'EXPIRED' && !ex) { q.state = 'expired'; q.valid_until = r.valid_until || q.valid_until; el.outerHTML = box(jo, q); wire(root, jo, q, onDone); return; }
    err.textContent = !r ? 'No answer. Try again.' : r.error === 'Unknown action' ? 'Needs the Portal.gs v3.2 paste in Apps Script.' : (r.error || 'Could not save');
    ready();
  };
}
const viaText = (via, how) => via === 'track' ? ' (Track my order)' : via === 'account' ? ' (portal account)'
  : via === 'staff' ? ' (marked in the back office' + (HOWL[how] ? ', ' + HOWL[how] : '') + ')' : via === 'telegram' ? ' (marked via Tessa' + (HOWL[how] ? ', ' + HOWL[how] : '') + ')' : '';
window.OYPMarkQ = { box, wire, viaText };
})();
