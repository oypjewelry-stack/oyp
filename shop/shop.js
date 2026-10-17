/* Public shop: list at /shop/, item pages at /shop/<slug> (GitHub Pages serves /404.html for those, which runs this same file).
   The server picks what customers see (name, safe photos, listed specs, price) and keeps the slug -> item mapping. No JO numbers. */
(() => {
'use strict';
const { call, esc, peso, slides } = OYP, app = document.getElementById('app');
const toast = t => { const el = document.getElementById('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 3200); };
const BASE = location.origin + '/shop/';
let items = [], newApi = false; const cache = {};
const slugify = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'piece';
const photo = (it, n) => { const k = it.slug + '|' + n; return cache[k] || (cache[k] = (newApi ? call('shopItemPhoto', { slug: it.slug, n }) : call('shopPhoto', { item_code: it.item_code, n })).then(r => (r && r.ok && r.src) || '')); };
let loaded = null;
async function load() {
  app.innerHTML = '<p class="grey">Loading…</p>';
  let r = await call('shopItems');
  if (r && r.ok) newApi = true;
  else { // server not updated yet: old list, slugs made here from the names
    r = await call('shopList'); if (!r.ok) { app.innerHTML = `<p class="err">${esc(r.error)}</p>`; return false; }
    const used = {}; r.items.forEach(it => { let s = slugify(it.title), n = 1; while (used[s + (n > 1 ? '-' + n : '')]) n++; it.slug = s + (n > 1 ? '-' + n : ''); used[it.slug] = 1; });
  }
  items = r.items; return true;
}
const share = async it => {
  const url = BASE + it.slug, title = it.title + ' · OYP Jewelry', text = it.title + (it.price_php ? ' · ' + peso(it.price_php) : '') + ' at OYP Jewelry';
  if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ title, text, url }); } catch (e) { /* closed */ } return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); }
  catch (e) { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Link copied'); }
};
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
function setMeta(title, desc) {
  document.title = title;
  [['og:title', title], ['og:description', desc], ['og:url', location.href]].forEach(([p, v]) => { const m = document.querySelector(`meta[property="${p}"]`); if (m) m.content = v; });
}
function list() {
  setMeta('Shop · OYP Jewelry', 'Finished pieces from our workshop, ready to take home.');
  app.innerHTML = `<h1>For sale</h1><p class="grey">Finished pieces from our workshop, ready to take home.</p>
  ${items.length ? '' : '<p class="note">Nothing listed right now. Please check back soon.</p>'}
  <div class="grid">${items.map((it, i) => `<a class="tile" href="/shop/${esc(it.slug)}" data-i="${i}"><div class="th" data-s="${esc(it.slug)}"><button class="shr" data-share="${i}" aria-label="Share">${SHARE_ICON}</button></div><b>${esc(it.title)}</b><span class="grey" style="font-size:13px">${esc(it.category || it.metal)}</span>
  <div class="p">${it.price_php ? peso(it.price_php) : 'Ask for price'}</div></a>`).join('')}</div>`;
  app.querySelectorAll('.tile').forEach(a => a.onclick = e => {
    const s = e.target.closest('[data-share]'); e.preventDefault();
    if (s) return share(items[s.dataset.share]);
    history.pushState(null, '', a.getAttribute('href')); route();
  });
  items.forEach(it => it.photos && photo(it, 0).then(src => { const el = app.querySelector(`.th[data-s="${CSS.escape(it.slug)}"]`); if (el && src) el.style.backgroundImage = `url("${src}")`; }));
}
function detail(it) {
  setMeta(it.title + ' · OYP Jewelry', [it.title, it.price_php ? peso(it.price_php) : ''].filter(Boolean).join(' · '));
  const specs = it.specs || [['Category', it.category], ['Metal', it.metal], ['Karat', it.karat], ['Weight (g)', it.weight_g], ['Size', it.size]].filter(x => x[1]).map(x => ({ label: x[0], value: x[1] }));
  app.innerHTML = `<a class="back" id="bk" href="/shop/">‹ Shop</a><div class="detail2"><div id="hero"></div><div>
  <div class="ttl"><h1>${esc(it.title)}</h1><button class="shr big" id="shr" aria-label="Share">${SHARE_ICON}<span>Share</span></button></div>
  ${it.status === 'sold' ? '<span class="chipg">Sold</span>' : ''}
  ${it.description ? `<p class="grey" style="margin-top:10px">${esc(it.description)}</p>` : ''}
  ${specs.length ? `<p class="sec">Details</p><dl class="specs2">${specs.map(x => `<dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd>`).join('')}</dl>` : ''}
  <div class="buy"><div class="amt">${it.price_php ? peso(it.price_php) : 'Ask for price'}</div><button class="blk" id="ask">Ask about it</button></div>
  ${it.item_code ? `<p class="grey" style="font-size:13px;margin-top:10px">Item code ${esc(it.item_code)}</p>` : ''}</div></div>`;
  slides(document.getElementById('hero'), it.photos, i => photo(it, i));
  document.getElementById('bk').onclick = e => { e.preventDefault(); history.pushState(null, '', '/shop/'); route(); };
  document.getElementById('shr').onclick = () => share(it);
  document.getElementById('ask').onclick = () => { const t = 'Hi! I\'m interested in ' + it.title + ' (' + BASE + it.slug + ')'; navigator.clipboard && navigator.clipboard.writeText(t).catch(() => {}); toast('Message us about it. Details copied.'); };
}
function notFound(msg) { setMeta('Not found · OYP Jewelry', ''); app.innerHTML = `<h1>Not found</h1><p class="grey">${esc(msg)}</p><p style="margin-top:18px"><a class="pill" href="/shop/">SEE THE SHOP</a> <a class="lk" href="/" style="margin-left:14px">Home</a></p>`; }
async function route() {
  const path = location.pathname.replace(/\/index\.html$/, '/'), m = path.match(/^\/shop\/([^/]+)\/?$/);
  if (!/^\/shop(\/|$)/.test(path)) return notFound('This page doesn\'t exist.');
  if (!m && location.hash.length > 1) { // old links /shop/#ITEMCODE
    if (!(await (loaded = loaded || load()))) return;
    const it = items.find(x => x.item_code === decodeURIComponent(location.hash.slice(1)));
    if (it) { history.replaceState(null, '', '/shop/' + it.slug); return route(); }
  }
  if (!m) { if (!(await (loaded = loaded || load()))) return; list(); return window.scrollTo(0, 0); }
  const slug = decodeURIComponent(m[1]).toLowerCase();
  if (!(await (loaded = loaded || load()))) return;
  let it = items.find(x => x.slug === slug);
  if (!it && newApi) { // old slug (renamed piece) or a sold one: ask the server
    const r = await call('shopItem', { slug });
    if (r && r.ok) { it = r.item; if (it.slug !== slug) history.replaceState(null, '', '/shop/' + it.slug); }
  }
  it ? detail(it) : notFound('This piece isn\'t in the shop anymore.'); window.scrollTo(0, 0);
}
window.addEventListener('popstate', route); route();
})();
