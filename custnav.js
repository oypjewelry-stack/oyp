/* Customer menu (landing, /my, /shop). Customer pages only: no staff or back-office links here. */
(() => {
'use strict';
const ROOT = (document.currentScript && document.currentScript.dataset.root) || '/';
const signedIn = () => { const e = localStorage.getItem('oypCustExp'); return !!(e && new Date(e) > new Date() && localStorage.getItem('oypCustSession')); };
const btn = document.getElementById('btnCMenu'), m = document.getElementById('cmenu');
if (!btn || !m) return;
function draw() {
  const esc = OYP.esc, items = [['Track my order', ROOT + 'track/'], ['Shop', ROOT + 'shop/'], ['My orders', ROOT + 'my/']];
  m.innerHTML = items.map(([t, h, s]) => `<a href="${h}">${esc(t)}${s ? ' <small class="soon">' + s + '</small>' : ''}</a>`).join('')
    + (signedIn() ? '<button id="cOut">Sign out</button>' : `<a href="${ROOT}my/#signin" class="strong">Sign in</a>`);
  const o = document.getElementById('cOut');
  if (o) o.onclick = async () => { o.disabled = true; await OYP.call('custLogout', {}, localStorage.getItem('oypCustSession')); ['oypCustSession', 'oypCustExp', 'oypCust'].forEach(k => localStorage.removeItem(k)); location.href = ROOT + 'my/'; };
}
btn.onclick = e => { e.stopPropagation(); if (!m.classList.contains('hidden')) return m.classList.add('hidden'); draw(); m.classList.remove('hidden'); };
document.addEventListener('click', e => { if (!e.target.closest('#cmenu,#btnCMenu')) m.classList.add('hidden'); else if (e.target.closest('#cmenu a')) m.classList.add('hidden'); });
})();
