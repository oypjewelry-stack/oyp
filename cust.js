/* shared by /my (customer portal) and /shop. Talks to the same Apps Script web app. */
window.OYP = (() => {
  const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
  const qs = new URLSearchParams(location.search);
  if (qs.get('api')) localStorage.setItem('oypApi', qs.get('api'));
  const API = () => localStorage.getItem('oypApi') || DEFAULT_API;
  if (!localStorage.getItem('oypDevice')) { const a = new Uint8Array(16); crypto.getRandomValues(a); localStorage.setItem('oypDevice', 'd-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('')); }
  async function call(action, data = {}, session = '') {
    try {
      const res = await fetch(API(), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action, session, device_id: localStorage.getItem('oypDevice') }, data)) });
      const r = await res.json();
      if (r && (r.error === 'Missing JO number' || r.error === 'Unknown action')) return { ok: false, error: 'This page is not switched on yet. Please try again later.', code: 'OLD_BACKEND' };
      return r;
    } catch (e) { return { ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }; }
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const peso = n => n == null ? '' : '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 });
  function slides(el, n, load) { // swipeable hero with dots; load(i) -> Promise<src>
    el.innerHTML = `<div class="hero"><div class="slides">${n ? Array.from({ length: n }, () => '<div></div>').join('') : '<div class="ph">NO PHOTO YET</div>'}</div></div>`
      + (n > 1 ? `<div class="sdots">${Array.from({ length: n }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : '<div style="height:12px"></div>');
    const s = el.querySelector('.slides'), dots = el.querySelectorAll('.sdots i');
    s.onscroll = () => { const i = Math.round(s.scrollLeft / s.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); };
    [...s.children].forEach((d, i) => n && load(i).then(src => { if (src) d.style.backgroundImage = `url("${src}")`; else { d.className = 'ph'; d.textContent = 'NO PHOTO YET'; } }));
  }
  return { call, esc, peso, slides };
})();
