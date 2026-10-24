/* Needs a look (#/look): scanned cards the JO reader held back.
   JoInbox.gs (staff Apps Script) is the only backend. Admin and production manager.
   Prices and client phone are shown only when the response still has them. */
(function (root) {
'use strict';
const PRICE = [['tag_price', 'Tag price'], ['retail_price', 'Retail'], ['replacement_cost', 'Replacement'], ['sold_price', 'Sold'], ['actual_cost', 'Actual cost'], ['material_cost_total', 'Materials'], ['labor_cost_total', 'Labor'], ['sp_total', 'SP total']];
const S = { cards: [], counts: {}, notices: [], user: null, io: null, busy: {}, run: { busy: false, msg: '', kind: '' } };
const badge = { n: null, at: 0, missing: false };
const shots = {};
const shotFly = {};

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
}
function api() { return root.OYP || {}; }
function esc(s) { const f = api().esc; return f ? f(s) : escHtml(s); }
function toast(t) { const f = api().toast; if (f) f(t); }
function liveToken() { return api().here ? api().here() : function () { return true; }; }
function isMissing(r) {
  if (!r || r.ok) return false;
  const code = String(r.code || '').toUpperCase();
  const err = String(r.error || '').toLowerCase();
  return code === 'UNKNOWN' || code === 'UNKNOWN_ACTION' || err.indexOf('unknown action') >= 0;
}
function normJo(s) {
  const t = String(s || '').toUpperCase().replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-').replace(/O/g, '0');
  const m = t.match(/(\d{2})\s*[-./]?\s*(\d{3,4})(?:\s*([A-Z]))?/);
  if (!m) return '';
  const jo = m[1] + '-' + m[2] + (m[3] || '');
  return /^\d{2}-\d{3,4}[A-Z]?$/.test(jo) ? jo : '';
}
function actionFor(value, suggested) {
  const jo = normJo(value);
  if (!jo) return { act: '', jo: '' };
  const sug = normJo(suggested);
  if (sug && jo === sug) return { act: 'confirm', jo: jo };
  return { act: 'fix', jo: jo };
}
function peso(v) {
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
}
function stoneText(s) {
  if (!s || typeof s !== 'object') return '';
  const bits = [];
  if (s.type) bits.push(s.type);
  if (s.shape) bits.push(s.shape);
  if (s.carat_total != null && s.carat_total !== '') bits.push(String(s.carat_total) + 'ct');
  if (s.size) bits.push(s.size);
  if (s.color) bits.push(s.color);
  if (s.count != null && s.count !== '') bits.push('× ' + s.count);
  return bits.join(' ');
}
function present(obj, key) {
  return !!(obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '');
}
function fieldRows(card) {
  const f = card && card.fields;
  const src = f || {};
  const rows = [];
  function add(label, value) {
    if (value == null || value === '') return;
    rows.push({ label: label, value: String(value) });
  }
  if (f) {
    add('Type', src.jewelry_type);
    add('Metal', [src.metal, src.metal_color].filter(Boolean).join(' · '));
    add('Karat', src.karat);
    if (present(src, 'weight_g')) {
      const w = String(src.weight_g);
      add('Weight', /g\s*$/i.test(w) ? w : w + ' g');
    }
    if (Array.isArray(src.stones) && src.stones.length) add('Stones', src.stones.map(stoneText).filter(Boolean).join('\n'));
  }
  add('Client', (f && f.client_name) || (card && card.client_name) || '');
  const phone = (f && present(f, 'client_phone') && f.client_phone) || (card && present(card, 'client_phone') && card.client_phone) || '';
  add('Phone', phone);
  if (f) {
    add('Date', src.jo_date_written || src.jo_date_iso || '');
    PRICE.forEach(function (p) { if (present(src, p[0])) add(p[1], peso(src[p[0]])); });
  }
  return rows;
}
function cropRect(imgW, imgH, box) {
  imgW = Math.max(1, Number(imgW) || 1);
  imgH = Math.max(1, Number(imgH) || 1);
  let x = 0, y = 0, w = imgW, h = imgH / 3;
  const nums = box && box.length >= 4 && box.slice(0, 4).every(function (n) { return typeof n === 'number' && isFinite(n); });
  if (nums) {
    const ymin = box[0], xmin = box[1], ymax = box[2], xmax = box[3];
    x = xmin / 1000 * imgW;
    y = ymin / 1000 * imgH;
    w = (xmax - xmin) / 1000 * imgW;
    h = (ymax - ymin) / 1000 * imgH;
    if (w >= 1 && h >= 1) {
      const px = w * 0.3, py = h * 0.3;
      x -= px; y -= py; w += px * 2; h += py * 2;
    } else { x = 0; y = 0; w = imgW; h = imgH / 3; }
  }
  if (x < 0) { w += x; x = 0; }
  if (y < 0) { h += y; y = 0; }
  if (x + w > imgW) w = imgW - x;
  if (y + h > imgH) h = imgH - y;
  return { x: x, y: y, w: Math.max(1, w), h: Math.max(1, h) };
}
function paintBadge(n) {
  if (arguments.length) badge.n = n;
  const v = badge.n;
  const show = typeof v === 'number' && v > 0;
  const text = show ? (v > 99 ? '99+' : String(v)) : '';
  const doc = root.document;
  if (!doc || !doc.querySelectorAll) return;
  doc.querySelectorAll('[data-ncount="look"]').forEach(function (el) {
    el.textContent = text;
    el.hidden = !show;
    if (show) el.setAttribute('aria-label', v + ' scanned cards waiting');
    else el.removeAttribute('aria-label');
  });
}
function roleOk(u) { return !!(u && (u.role === 'admin' || u.role === 'production_manager')); }
async function refreshBadge(opts) {
  opts = opts || {};
  const u = (api().user && api().user()) || S.user;
  if (!roleOk(u) || !api().call) return;
  if (badge.missing && !opts.force) { paintBadge(0); return; }
  if (!opts.force && badge.at && Date.now() - badge.at < 20000 && badge.n != null) { paintBadge(badge.n); return; }
  let r;
  try { r = await api().call('joInboxStatus'); } catch (e) { return; }
  if (isMissing(r)) { badge.missing = true; paintBadge(0); return; }
  if (!r || !r.ok || !r.counts) return;
  badge.missing = false;
  badge.at = Date.now();
  paintBadge(Number(r.counts.check) || 0);
}
function waitingText(n) { return !n ? '' : n === 1 ? '1 waiting' : (n + ' waiting'); }
function pushHtml(counts) {
  const n = counts && Number(counts.unpushed) || 0;
  if (!n) return '';
  const line = n === 1 ? '1 filed card is not in To review yet.' : (n + ' filed cards are not in To review yet.');
  return '<div class="jipush" id="jiPush"><p>' + line + '</p><button type="button" class="pill sm outline" data-act="push">Send to To review</button></div>';
}
function noticeHtml(n) {
  return '<p class="jifiled" role="status">' + esc(n.text) + '</p>';
}
function fieldsHtml(card) {
  const rows = fieldRows(card);
  if (!rows.length) return '<div class="jifields"><p class="muted">Nothing was read off this card.</p></div>';
  return '<div class="jifields"><div class="dtitle"><h3>From the card</h3><span class="chip">auto</span></div><div class="jigrid">'
    + rows.map(function (r) { return '<div><span class="lab">' + esc(r.label) + '</span><b>' + esc(r.value) + '</b></div>'; }).join('')
    + '</div></div>';
}
function readCell(title, reader) {
  const read = reader && reader.read ? String(reader.read) : '';
  const conf = reader && reader.confidence ? String(reader.confidence) : 'none';
  return '<div class="jiread"><span class="lab">' + esc(title) + '</span><b>' + esc(read || '—') + '</b><span class="jiconf">' + esc(conf) + '</span></div>';
}
function cardHtml(card) {
  const sug = card.suggested_jo || '';
  const act = actionFor(sug, sug);
  const id = String(card.card_id || '');
  const fid = 'jiJo-' + id.replace(/[^a-zA-Z0-9_-]/g, '');
  const side = card.jo_box_side === 'b' ? 'b' : 'a';
  const flags = (card.flags || []).filter(Boolean);
  const when = card.logged_at ? '<span class="lab">' + esc(card.logged_at) + '</span>' : '';
  const num = card.card != null && card.card !== '' ? 'Card ' + card.card : 'Card';
  return '<article class="jicard' + (card.decision === 'disagree' ? ' disagree' : '') + '" data-card="' + esc(id) + '">'
    + '<div class="jimedia"><button type="button" class="jicrop" data-act="zoom" data-card="' + esc(id) + '" data-side="' + side + '" aria-label="JO number on the card. Tap to see the full card."><span class="jiph" aria-hidden="true"></span></button></div>'
    + '<div class="jibody"><div class="jihead"><b>' + esc(num) + '</b>' + when + '</div>'
    + '<div class="jireads">' + readCell('Drive OCR', card.ocr) + readCell('Gemini', card.gemini) + '</div>'
    + (flags.length ? '<ul class="jiflags">' + flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '')
    + '<form class="jifix" autocomplete="off"><label class="lab" for="' + fid + '">JO number</label>'
    + '<div class="jirow"><input id="' + fid + '" aria-label="JO number" placeholder="26-001" value="' + esc(sug) + '" data-sug="' + esc(sug) + '" autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text">'
    + '<button type="submit" class="pill sm jigo"' + (act.act ? '' : ' disabled') + '>' + (act.act === 'confirm' ? '✓ Confirm' : 'Fix') + '</button></div></form>'
    + '<button type="button" class="jidrop" data-act="discard">Discard</button>'
    + '<div class="jiask" hidden><p>Discard this scan? It is not filed, and the photo is not deleted.</p>'
    + '<div class="jiacts"><button type="button" class="pill sm" data-act="discard-yes">Discard</button><button type="button" class="pill sm outline" data-act="discard-no">Keep</button></div></div>'
    + '<p class="jierr" hidden></p></div>'
    + fieldsHtml(card) + '</article>';
}
function pageHtml(m) {
  m = m || {};
  const head = '<div class="jipage"><div class="dhead jihd"><h2>Needs a look <span class="ncount" data-ncount="look" hidden></span></h2>' + (m.forbidden ? '' : runBoxHtml()) + '</div>';
  if (m.loading) return head + '<div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i></div></div>';
  if (m.missing) return head + '<div class="dcard jibanner"><h3>Scanner backend not set up yet</h3><p class="muted">Scanned cards will show here once JoInbox is pasted into Apps Script. The rest of the back office still works.</p></div></div>';
  if (m.forbidden) return head + '<div class="dcard jibanner"><h3>Not allowed</h3><p class="muted">Needs a look is for admins and production managers.</p></div></div>';
  if (m.error) return head + '<div class="dcard jibanner"><h3>Could not load scanned cards</h3><p class="jierr">' + esc(m.error) + '</p><button type="button" class="pill sm" data-act="retry">Try again</button></div></div>';
  const cards = m.cards || [];
  const n = m.counts && m.counts.check != null ? Number(m.counts.check) : cards.length;
  const more = m.total > cards.length ? '<button type="button" class="pill sm outline jimore" data-act="more">Show more</button>' : '';
  const list = cards.length ? cards.map(cardHtml).join('') + more : '<div class="dcard jibanner jiempty"><h3>No cards waiting</h3><p class="muted">The scanner only holds a card here when it isn\'t sure of the JO number.</p></div>';
  const notes = (m.notices || []).map(noticeHtml).join('');
  return head + '<p class="muted">Scanned cards the scanner wasn\'t sure about. Check the JO number, then confirm or fix it.</p>'
    + pushHtml(m.counts) + '<div id="jiNotices">' + notes + '</div>'
    + '<div class="dtitle"><h3>Scanned cards</h3><span class="lab" id="jiWaiting">' + esc(waitingText(n)) + '</span></div>'
    + '<div id="jiList">' + list + '</div></div>';
}

/* Check for scans: files what is in JO Inbox now (joInboxRun). A manual backup for the 5-minute auto run. */
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function runText(r) {
  if (r.waiting && r.message) return { kind: 'info', text: String(r.message) };
  const bits = [];
  const n = function (k) { return Number(r[k]) || 0; };
  if (n('filed')) bits.push('Filed ' + plural(n('filed'), 'page', 'pages'));
  if (n('check')) bits.push(n('check') === 1 ? '1 needs a look' : n('check') + ' need a look');
  if (n('blank')) bits.push(plural(n('blank'), 'blank back', 'blank backs'));
  if (n('problem')) bits.push(plural(n('problem'), 'file', 'files') + ' could not be read (set the scanner to JPEG)');
  let text = bits.join(', ');
  if (r.more) text = (text ? text + '. ' : '') + 'More cards waiting, click again.';
  else if (!text) text = 'No new scans';
  const left = r.fields && Number(r.fields.left) || 0;
  if (left) text += (/[.]$/.test(text) ? ' ' : '. ') + 'Still reading the details of ' + plural(left, 'card', 'cards') + '.';
  return { kind: r.more ? 'info' : (bits.length ? 'ok' : 'none'), text: text };
}
function runError(r) {
  const code = String(r && r.code || '').toUpperCase();
  if (isMissing(r)) return { kind: 'err', text: 'Needs the latest script paste' };
  if (code === 'BUSY') return { kind: 'info', text: 'A check is already running. Try again in a minute.' };
  if (code === 'FORBIDDEN') return { kind: 'err', text: 'Only admins and production managers can check for scans.' };
  return { kind: 'err', text: (r && r.error) || 'Could not check for scans' };
}
function runBoxHtml() {
  const b = S.run.busy;
  return '<div class="jirun"><button type="button" class="pill jirunbtn" id="jiRunBtn" data-act="run"' + (b ? ' disabled aria-busy="true"' : '') + '>'
    + (b ? '<span class="jispin" aria-hidden="true"></span>Checking…' : 'Check for scans') + '</button>'
    + '<p class="jirunmsg ' + (S.run.kind || '') + '" id="jiRunMsg" role="status" aria-live="polite"' + (S.run.msg ? '' : ' hidden') + '>' + esc(S.run.msg) + '</p></div>';
}
function paintRun() {
  const doc = root.document;
  if (!doc) return;
  const btn = doc.getElementById('jiRunBtn'), msg = doc.getElementById('jiRunMsg');
  if (btn) {
    btn.disabled = !!S.run.busy;
    if (S.run.busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    btn.innerHTML = S.run.busy ? '<span class="jispin" aria-hidden="true"></span>Checking…' : 'Check for scans';
  }
  if (msg) {
    msg.textContent = S.run.msg || '';
    msg.className = 'jirunmsg ' + (S.run.kind || '');
    msg.hidden = !S.run.msg;
  }
}
/* New held cards are added under the ones on screen. Nothing already there is redrawn, so a JO number being typed is never lost. */
async function addNewCards() {
  const doc = root.document;
  let r;
  try { r = await api().call('joInboxList', { status: 'check', limit: 50 }); } catch (e) { return; }
  if (!r || !r.ok) return;
  if (r.counts) S.counts = r.counts;
  const have = {};
  S.cards.forEach(function (c) { have[c.card_id] = true; });
  const add = (r.cards || []).filter(function (c) { return !have[c.card_id]; });
  S.cards = S.cards.concat(add);
  const list = doc && doc.getElementById('jiList');
  if (list && add.length) {
    const empty = list.querySelector('.jiempty');
    if (empty) empty.remove();
    const more = list.querySelector('.jimore');
    const html = add.map(cardHtml).join('');
    if (more) more.insertAdjacentHTML('beforebegin', html); else list.insertAdjacentHTML('beforeend', html);
    list.querySelectorAll('.jicrop').forEach(function (b) { if (!b.querySelector('img') && !b.querySelector('.jimiss')) fillCrop(b); });
    list.querySelectorAll('.jicard').forEach(syncGo);
  }
  countBox();
  redrawPush();
}
async function runScans() {
  if (S.run.busy) return;
  S.run = { busy: true, msg: 'This can take up to a minute.', kind: 'none' };
  paintRun();
  let r;
  try { r = await api().call('joInboxRun', {}); } catch (e) { r = { ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }; }
  if (r && r.code === 'NO_SESSION') { S.run = { busy: false, msg: '', kind: '' }; return; }
  const res = r && r.ok ? runText(r) : runError(r);
  S.run = { busy: false, msg: res.text, kind: res.kind };
  paintRun();
  if (r && r.ok && !r.waiting) {
    await addNewCards();
    refreshBadge({ force: true });
  }
}
function articleOf(node) {
  return node && node.closest ? node.closest('.jicard') : null;
}
function syncGo(article) {
  if (!article || article.dataset.busy === '1') return;
  const input = article.querySelector('input');
  const btn = article.querySelector('.jigo');
  if (!input || !btn) return;
  const act = actionFor(input.value, input.getAttribute('data-sug') || '');
  btn.textContent = act.act === 'confirm' ? '✓ Confirm' : 'Fix';
  btn.disabled = !String(input.value || '').trim();
}
function showErr(article, msg) {
  const p = article && article.querySelector('.jierr');
  if (!p) return;
  p.textContent = msg || '';
  p.hidden = !msg;
}
function setBusy(article, on) {
  if (!article) return;
  article.dataset.busy = on ? '1' : '';
  const btn = article.querySelector('.jigo');
  if (!btn) return;
  if (on) { btn.disabled = true; btn.textContent = 'Saving…'; return; }
  syncGo(article);
}
function cardById(id) { return S.cards.find(function (c) { return c.card_id === id; }) || null; }
function countBox() {
  const el = root.document && root.document.getElementById('jiWaiting');
  if (!el) return;
  const n = S.counts && S.counts.check != null ? Number(S.counts.check) : S.cards.length;
  el.textContent = waitingText(Math.max(0, n));
}
function redrawPush() {
  const doc = root.document;
  if (!doc) return;
  const page = doc.querySelector('.jipage');
  if (!page) return;
  const cur = doc.getElementById('jiPush');
  const html = pushHtml(S.counts);
  if (cur) { if (html) cur.outerHTML = html; else cur.remove(); return; }
  if (!html) return;
  const notes = doc.getElementById('jiNotices');
  if (notes) notes.insertAdjacentHTML('beforebegin', html);
}
function dropCard(id, message, unpushed) {
  S.cards = S.cards.filter(function (c) { return c.card_id !== id; });
  if (S.counts && typeof S.counts.check === 'number') S.counts.check = Math.max(0, S.counts.check - 1);
  paintBadge(S.counts && typeof S.counts.check === 'number' ? S.counts.check : S.cards.length);
  countBox();
  if (unpushed) {
    if (!S.counts) S.counts = {};
    S.counts.unpushed = (Number(S.counts.unpushed) || 0) + 1;
    redrawPush();
  }
  const doc = root.document;
  const article = doc && Array.prototype.find.call(doc.querySelectorAll('.jicard'), function (el) { return el.getAttribute('data-card') === id; });
  if (article) article.remove();
  const note = { text: message };
  S.notices.unshift(note);
  const box = doc && doc.getElementById('jiNotices');
  if (box) box.insertAdjacentHTML('afterbegin', noticeHtml(note));
  const list = doc && doc.getElementById('jiList');
  if (list && !list.querySelector('.jicard') && !list.querySelector('.jiempty')) {
    list.insertAdjacentHTML('beforeend', '<div class="dcard jibanner jiempty"><h3>No cards waiting</h3><p class="muted">The scanner only holds a card here when it isn\'t sure of the JO number.</p></div>');
  }
  const next = list && list.querySelector('.jicard input');
  if (next) { try { next.focus(); next.select(); } catch (e) {} }
}
function zoomEl() {
  const doc = root.document;
  let el = doc.getElementById('jiZoom');
  if (el) return el;
  el = doc.createElement('div');
  el.id = 'jiZoom';
  el.className = 'jizoom hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Scanned card');
  el.innerHTML = '<div class="jizstage" id="jiZoomStage"><img id="jiZoomImg" alt="Scanned card"></div>'
    + '<div class="jizbar"><button type="button" class="pill sm" data-zside="a">Front</button><button type="button" class="pill sm outline" data-zside="b">Back</button>'
    + '<span class="jizcap" id="jiZoomCap"></span><button type="button" class="pill sm outline" data-z="close">Close</button></div>';
  doc.body.appendChild(el);
  bindZoom(el);
  return el;
}
const Z = { scale: 1, x: 0, y: 0, pts: new Map(), pinch: 0, lastTap: 0, card: '', side: 'a' };
function zApply() {
  const img = root.document.getElementById('jiZoomImg');
  if (!img) return;
  if (Z.scale === 1 && !Z.x && !Z.y) { img.style.transform = ''; return; }
  img.style.transform = 'translate(calc(-50% + ' + Z.x + 'px), calc(-50% + ' + Z.y + 'px)) scale(' + Z.scale + ')';
}
function zReset() { Z.scale = 1; Z.x = 0; Z.y = 0; Z.pinch = 0; zApply(); }
function closeZoom() {
  const doc = root.document;
  const el = doc && doc.getElementById('jiZoom');
  if (el) el.classList.add('hidden');
  if (doc && doc.documentElement) doc.documentElement.classList.remove('ji-zoom');
  zReset();
}
function shotKey(id, side, size) { return id + '|' + side + '|' + (size || 'medium'); }
function loadShot(cardId, side, size) {
  const key = shotKey(cardId, side, size || 'medium');
  if (shots[key]) return Promise.resolve(shots[key]);
  if (shotFly[key]) return shotFly[key];
  shotFly[key] = api().call('joInboxPhoto', { card_id: cardId, side: side, size: size || 'medium' }).then(function (r) {
    const src = r && r.ok && r.src ? r.src : '';
    const rec = { src: src, err: src ? '' : ((r && (r.error || (r.ok ? 'Photo not found in Drive' : 'Photo not available'))) || 'Photo not available') };
    if (src) shots[key] = rec;
    return rec;
  }).catch(function () { return { src: '', err: 'Photo not available' }; }).finally(function () { delete shotFly[key]; });
  return shotFly[key];
}
function cropUrl(src, box) {
  return new Promise(function (resolve) {
    const im = new root.Image();
    im.onload = function () {
      try {
        const b = cropRect(im.naturalWidth, im.naturalHeight, box);
        const c = root.document.createElement('canvas');
        const scale = Math.min(2, 1400 / b.w);
        c.width = Math.max(1, Math.round(b.w * scale));
        c.height = Math.max(1, Math.round(b.h * scale));
        const g = c.getContext('2d');
        g.drawImage(im, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.86));
      } catch (e) { resolve(src); }
    };
    im.onerror = function () { resolve(''); };
    im.src = src;
  });
}
function cropBoxFor(card, side) {
  if (!card || !card.jo_box) return null;
  const on = card.jo_box_side === 'b' ? 'b' : 'a';
  return on === side ? card.jo_box : null;
}
async function fillCrop(btn) {
  const id = btn.getAttribute('data-card');
  const card = cardById(id);
  if (!card) return;
  const side = btn.getAttribute('data-side') === 'b' ? 'b' : 'a';
  const shot = await loadShot(id, side, 'medium');
  if (!btn.isConnected) return;
  btn.textContent = '';
  if (!shot.src) {
    const miss = root.document.createElement('span');
    miss.className = 'jimiss';
    miss.textContent = shot.err || 'Photo not available';
    btn.appendChild(miss);
    return;
  }
  const url = await cropUrl(shot.src, cropBoxFor(card, side));
  if (!btn.isConnected) return;
  const img = root.document.createElement('img');
  img.alt = 'JO number on the card';
  img.src = url || shot.src;
  const hint = root.document.createElement('span');
  hint.className = 'jizoomhint';
  hint.textContent = 'Full card';
  btn.appendChild(img);
  btn.appendChild(hint);
}
function watchCrops(rootEl) {
  if (S.io) S.io.disconnect();
  if (!root.IntersectionObserver) {
    rootEl.querySelectorAll('.jicrop').forEach(function (btn) { fillCrop(btn); });
    return;
  }
  const io = new root.IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      fillCrop(en.target);
    });
  }, { rootMargin: '2000px' });
  S.io = io;
  rootEl.querySelectorAll('.jicrop').forEach(function (btn) { io.observe(btn); });
}
function markSide(side) {
  const bar = root.document.querySelector('.jizbar');
  if (!bar) return;
  bar.querySelectorAll('[data-zside]').forEach(function (b) {
    const on = b.getAttribute('data-zside') === side;
    b.classList.toggle('outline', !on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
async function showSide(card, side) {
  Z.side = side;
  zReset();
  markSide(side);
  const page = (card.pages || []).find(function (p) { return p.side === side; });
  const cap = root.document.getElementById('jiZoomCap');
  if (cap) cap.textContent = (side === 'b' ? 'Back' : 'Front') + (page && page.blank ? ' · blank' : '') + (page && page.source_name ? ' · ' + page.source_name : '');
  const img = root.document.getElementById('jiZoomImg');
  if (!img) return;
  img.alt = side === 'b' ? 'Back of the card' : 'Front of the card';
  const med = await loadShot(card.card_id, side, 'medium');
  if (Z.card !== card.card_id || Z.side !== side) return;
  if (!med.src) { img.removeAttribute('src'); img.alt = med.err || 'Photo not available'; return; }
  img.src = med.src;
  loadShot(card.card_id, side, 'full').then(function (full) {
    if (full.src && Z.card === card.card_id && Z.side === side) img.src = full.src;
  });
}
function openZoom(card, side) {
  const pages = card.pages || [];
  const has = function (s) { return pages.some(function (p) { return p.side === s; }); };
  const el = zoomEl();
  Z.card = card.card_id;
  el.classList.remove('hidden');
  root.document.documentElement.classList.add('ji-zoom');
  el.querySelector('[data-zside="a"]').hidden = pages.length > 0 && !has('a');
  el.querySelector('[data-zside="b"]').hidden = !has('b');
  const open = side === 'b' && has('b') ? 'b' : 'a';
  showSide(card, open);
  const close = el.querySelector('[data-z="close"]');
  if (close) close.focus();
}
function bindZoom(el) {
  const stage = el.querySelector('.jizstage');
  el.addEventListener('click', function (e) {
    if (e.target.closest('[data-z="close"]')) { closeZoom(); return; }
    const s = e.target.closest('[data-zside]');
    if (!s || s.hidden) return;
    const card = cardById(Z.card);
    if (card) showSide(card, s.getAttribute('data-zside'));
  });
  stage.addEventListener('dblclick', function () {
    if (Z.scale > 1) zReset();
    else { Z.scale = 2.5; zApply(); }
  });
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    Z.scale = Math.min(5, Math.max(1, Z.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (Z.scale === 1) { Z.x = 0; Z.y = 0; }
    zApply();
  }, { passive: false });
  stage.addEventListener('touchstart', function (e) {
    for (const t of e.changedTouches) Z.pts.set(t.identifier, { x: t.clientX, y: t.clientY });
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - Z.lastTap < 280) {
        if (Z.scale > 1) zReset(); else { Z.scale = 2.5; zApply(); }
        Z.lastTap = 0;
      } else Z.lastTap = now;
    }
    if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1];
      Z.pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
    }
  }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      Z.scale = Math.min(5, Math.max(1, Z.scale * (dist / (Z.pinch || dist))));
      Z.pinch = dist;
      if (Z.scale === 1) { Z.x = 0; Z.y = 0; }
      zApply();
      return;
    }
    if (e.touches.length === 1 && Z.scale > 1) {
      e.preventDefault();
      const t = e.touches[0], prev = Z.pts.get(t.identifier);
      if (prev) { Z.x += t.clientX - prev.x; Z.y += t.clientY - prev.y; }
      Z.pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      zApply();
    }
  }, { passive: false });
  const end = function (e) { for (const t of e.changedTouches) Z.pts.delete(t.identifier); if (e.touches.length < 2) Z.pinch = 0; };
  stage.addEventListener('touchend', end);
  stage.addEventListener('touchcancel', end);
  let drag = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || Z.scale <= 1) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    Z.x += e.clientX - drag.x; Z.y += e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    zApply();
  });
  stage.addEventListener('pointerup', function () { drag = null; });
}
async function runAction(article, kind) {
  if (!article || article.dataset.busy === '1') return;
  const id = article.getAttribute('data-card');
  const input = article.querySelector('input');
  let action = '', body = { card_id: id }, msgJo = '';
  if (kind === 'discard') { action = 'joInboxDiscard'; body.reason = 'Not a JO card'; }
  else {
    const act = actionFor(input.value, input.getAttribute('data-sug') || '');
    if (!act.act) { if (input) input.focus(); toast(String(input.value || '').trim() ? 'JO number should look like 26-287' : 'Type the JO number'); return; }
    input.value = act.jo;
    action = act.act === 'confirm' ? 'joInboxConfirm' : 'joInboxFix';
    body.jo = act.jo;
    msgJo = act.jo;
  }
  setBusy(article, true);
  let r;
  try { r = await api().call(action, body); } catch (e) { r = { ok: false, error: 'Could not save' }; }
  if (!article.isConnected) return;
  if (r && r.code === 'NO_SESSION') return;
  if (r && (r.ok || r.code === 'ALREADY_DONE')) {
    const jo = (r && r.jo) || msgJo;
    const msg = kind === 'discard' ? 'Discarded' : (jo ? 'Filed to ' + jo : 'Filed');
    const pushed = r && r.push && (r.push.ok || r.push.pushed);
    dropCard(id, msg, kind !== 'discard' && !pushed);
    toast(msg);
    refreshBadge({ force: true });
    return;
  }
  if (r && r.code === 'NOT_FOUND') {
    dropCard(id, 'That card is already gone', false);
    toast('That card is already gone');
    refreshBadge({ force: true });
    return;
  }
  setBusy(article, false);
  const err = (r && r.error) || 'Could not save';
  showErr(article, err);
  toast(err);
}
async function pushNow(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  let r;
  try { r = await api().call('joInboxPush', { limit: 20 }); } catch (e) { r = { ok: false, error: 'Could not send' }; }
  if (r && r.ok) {
    const n = Number(r.pushed) || 0;
    if (S.counts) S.counts.unpushed = r.more ? Math.max(0, (Number(S.counts.unpushed) || 0) - n) : 0;
    redrawPush();
    toast(n ? ('Sent ' + n + ' to To review' + (r.more ? '. More are still waiting.' : '')) : 'Nothing new to send');
    return;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Send to To review'; }
  toast((r && r.error) || 'Could not send');
}
async function showMore(btn) {
  if (btn) btn.disabled = true;
  let r;
  try { r = await api().call('joInboxList', { status: 'check', limit: 50, offset: S.cards.length }); }
  catch (e) { r = { ok: false, error: 'Could not load' }; }
  if (!r || !r.ok) { if (btn) btn.disabled = false; toast((r && r.error) || 'Could not load'); return; }
  const add = r.cards || [];
  S.cards = S.cards.concat(add);
  if (r.counts) S.counts = r.counts;
  const list = root.document.getElementById('jiList');
  if (btn) btn.remove();
  if (list && add.length) {
    list.insertAdjacentHTML('beforeend', add.map(cardHtml).join(''));
    list.querySelectorAll('.jicrop').forEach(function (btn) {
      if (!btn.querySelector('img') && !btn.querySelector('.jimiss')) fillCrop(btn);
    });
    list.querySelectorAll('.jicard').forEach(syncGo);
  }
  countBox();
  paintBadge(S.counts && S.counts.check != null ? Number(S.counts.check) : S.cards.length);
}
function wire(main) {
  if (!main) return;
  main.querySelectorAll('.jicard').forEach(syncGo);
  if (main.dataset.jiwire) return;
  main.dataset.jiwire = '1';
  main.addEventListener('input', function (e) {
    const article = articleOf(e.target);
    if (article && e.target.matches('input')) { showErr(article, ''); syncGo(article); }
  });
  main.addEventListener('submit', function (e) {
    const form = e.target.closest && e.target.closest('.jifix');
    if (!form) return;
    e.preventDefault();
    const article = articleOf(form);
    if (article) runAction(article, 'file');
  });
  main.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t || !main.contains(t)) return;
    const act = t.getAttribute('data-act');
    if (act === 'retry') { render(main, S.user); return; }
    if (act === 'run') { runScans(); return; }
    if (act === 'push') { pushNow(t); return; }
    if (act === 'more') { showMore(t); return; }
    const article = articleOf(t);
    if (act === 'zoom') {
      const card = cardById(t.getAttribute('data-card'));
      if (card) openZoom(card, t.getAttribute('data-side'));
      return;
    }
    if (!article) return;
    if (act === 'discard') {
      const ask = article.querySelector('.jiask'), drop = article.querySelector('.jidrop');
      if (ask) ask.hidden = false;
      if (drop) drop.hidden = true;
      return;
    }
    if (act === 'discard-no') {
      const ask = article.querySelector('.jiask'), drop = article.querySelector('.jidrop');
      if (ask) ask.hidden = true;
      if (drop) drop.hidden = false;
      return;
    }
    if (act === 'discard-yes') runAction(article, 'discard');
  });
}
async function render(main, user) {
  S.user = user || S.user;
  closeZoom();
  if (!main) return;
  if (!S.run.busy) S.run = { busy: false, msg: '', kind: '' }; // a message belongs to the visit it was made in
  const token = liveToken();
  main.innerHTML = pageHtml({ loading: true });
  let r;
  try { r = await api().call('joInboxList', { status: 'check', limit: 50 }); }
  catch (e) { r = { ok: false, error: 'Could not load', code: 'NET' }; }
  if (!token()) return;
  if (r && r.code === 'NO_SESSION') return;
  if (isMissing(r)) {
    badge.missing = true;
    paintBadge(0);
    main.innerHTML = pageHtml({ missing: true });
    wire(main);
    return;
  }
  if (!r || !r.ok) {
    main.innerHTML = pageHtml(r && r.code === 'FORBIDDEN' ? { forbidden: true } : { error: (r && r.error) || 'Could not load' });
    wire(main);
    return;
  }
  S.cards = r.cards || [];
  S.counts = r.counts || {};
  S.notices = [];
  badge.missing = false;
  badge.at = Date.now();
  main.innerHTML = pageHtml({ cards: S.cards, counts: S.counts, notices: S.notices, total: r.total || S.cards.length });
  paintBadge(Number(S.counts.check) || 0);
  wire(main);
  watchCrops(main);
}
if (root.document && root.document.addEventListener) {
  root.document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const el = root.document.getElementById('jiZoom');
    if (el && !el.classList.contains('hidden')) { closeZoom(); e.preventDefault(); }
  });
}
root.OYPJoInbox = {
  render: render, refreshBadge: refreshBadge, paintBadge: paintBadge, cropRect: cropRect, actionFor: actionFor,
  normJo: normJo, isMissing: isMissing, fieldRows: fieldRows, pageHtml: pageHtml, cardHtml: cardHtml, runText: runText, runError: runError, runScans: runScans
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPJoInbox;
})(typeof window !== 'undefined' ? window : globalThis);
