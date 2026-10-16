/* Public shop: pieces marked for sale. The server only sends item code, title, details and price. */
(() => {
'use strict';
const { call, esc, peso, slides } = OYP, app = document.getElementById('app');
const toast = t => { const el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 3200); };
let items = []; const cache = {};
const photo = (code, n) => cache[code + n] || (cache[code + n] = call('shopPhoto', { item_code: code, n }).then(r => r.ok ? r.src : ''));
let loaded = null;
async function load() {
  app.innerHTML = '<p class="grey">Loading…</p>';
  const r = await call('shopList'); if (!r.ok) { app.innerHTML = `<p class="err">${esc(r.error)}</p>`; return false; }
  items = r.items; return true;
}
function list() {
  app.innerHTML = `<h1>For sale</h1><p class="grey">Finished pieces from our workshop, ready to take home.</p>
  ${items.length ? '' : '<p class="note">Nothing listed right now. Please check back soon.</p>'}
  <div class="grid">${items.map((it, i) => `<button class="tile" data-i="${i}"><div class="th" data-c="${esc(it.item_code)}"></div><b>${esc(it.title)}</b><span class="grey" style="font-size:13px">${esc(it.category || it.metal)}</span>
  <div class="p">${it.price_php ? peso(it.price_php) : 'Ask for price'}</div></button>`).join('')}</div>`;
  app.querySelectorAll('.tile').forEach(b => b.onclick = () => { location.hash = '#' + items[b.dataset.i].item_code; });
  items.forEach(it => it.photos && photo(it.item_code, 0).then(src => { const el = app.querySelector(`.th[data-c="${CSS.escape(it.item_code)}"]`); if (el && src) el.style.backgroundImage = `url("${src}")`; }));
}
function detail(it) {
  const specs = [it.metal && it.karat ? `${it.metal} · ${it.karat}` : it.metal, it.weight_g && it.weight_g + ' g', it.size && 'Size ' + it.size].filter(Boolean);
  app.innerHTML = `<button class="back" id="bk">‹ Shop</button><div class="detail2"><div id="hero"></div><div>
  <h1>${esc(it.title)}</h1><p class="grey">${esc(it.category)}</p>
  ${it.description || specs.length ? '<p class="sec">Description &amp; Details</p>' : ''}${it.description ? `<p class="grey">${esc(it.description)}</p>` : ''}
  ${specs.length ? `<ul class="specs" style="margin-top:8px">${specs.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  <div class="buy"><div class="amt">${it.price_php ? peso(it.price_php) : ''}</div><button class="blk" id="ask">Ask about it</button></div>
  <p class="grey" style="font-size:13px;margin-top:10px">Item code ${esc(it.item_code)}</p></div></div>`;
  slides(document.getElementById('hero'), it.photos, i => photo(it.item_code, i));
  document.getElementById('bk').onclick = () => { location.hash = ''; };
  document.getElementById('ask').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(it.item_code).catch(() => {}); toast('Message us with item code ' + it.item_code + ' (copied)'); };
}
async function route() {
  if (!(await (loaded = loaded || load()))) return;
  const c = decodeURIComponent(location.hash.slice(1)), it = items.find(x => x.item_code === c);
  it ? detail(it) : list(); window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route); route();
})();
