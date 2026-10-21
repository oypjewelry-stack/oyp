/* Niimbot stickers for the staff site and the card scanner (injected by nav.js).
   The paper never includes a client name. The queue list on screen still does.
   A failed print is a toast. It never rejects the save that triggered it. */
(function (root) {
'use strict';
if (root.OYPPrint) return;

var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
var KEY = 'oypPrint';
var DEV = 'oypDevice';
var STALE = 180000;
var POLL = 15000;
var state = { client: null, model: '', head: 0, dir: 'top', transport: '', connected: false, timer: 0, pumping: false, busy: {}, open: '', chain: Promise.resolve() };
var lib = function () { return root.niimbluelib; };

function deviceId() {
  var id = '';
  try { id = localStorage.getItem(DEV) || ''; } catch (e) {}
  if (!id) {
    var a = new Uint8Array(16);
    if (root.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    id = 'd-' + Array.from(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    try { localStorage.setItem(DEV, id); } catch (e2) {}
  }
  return id;
}
function load() {
  var o = { darkness: 3, auto: true, transport: '', kinds: null, model: '' };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') o = Object.assign(o, raw); } catch (e) {}
  o.darkness = Math.max(1, Math.min(5, o.darkness | 0 || 3));
  o.auto = o.auto !== false;
  return o;
}
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
function api() {
  try { return localStorage.getItem('oypScanApi') || localStorage.getItem('oypApi') || DEFAULT_API; } catch (e) { return DEFAULT_API; }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
function ios() {
  var ua = (navigator.userAgent || '');
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function canBt() { var L = lib(); return !ios() && !!(L && L.Utils && L.Utils.isBluetoothSupported ? L.Utils.isBluetoothSupported() : (navigator.bluetooth && navigator.bluetooth.requestDevice)); }
function canSerial() { var L = lib(); return !ios() && !!(L && L.Utils && L.Utils.isSerialSupported ? L.Utils.isSerialSupported() : (navigator.serial && navigator.serial.requestPort)); }
function toast(t) {
  if (root.OYP && root.OYP.toast) { root.OYP.toast(t); return; }
  var note = document.getElementById('note');
  if (note && !note.querySelector('img')) { note.textContent = t; note.classList.remove('hidden'); return; }
  var el = document.getElementById('toast');
  if (el && !el.querySelector('img')) { el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.add('hidden'); }, 2600); }
}
function work(fn) {
  var run = state.chain.then(function () { return fn(); }, function () { return fn(); });
  state.chain = run.then(function () {}, function () {});
  return run;
}
function defaultKinds(model) {
  if (model === 'B31') return { jo_card: true, jewelry_tag: false };
  if (model === 'B1') return { jo_card: false, jewelry_tag: true };
  return { jo_card: true, jewelry_tag: true };
}
function kinds() {
  var cfg = load();
  if (cfg.kinds && typeof cfg.kinds === 'object') return { jo_card: !!cfg.kinds.jo_card, jewelry_tag: !!cfg.kinds.jewelry_tag };
  return defaultKinds(state.model || cfg.model);
}
function printsKind(kind) { return !!kinds()[kind]; }
function summary() {
  var cfg = load(), k = kinds();
  var who = state.connected ? (state.model || 'Printer') : (cfg.model ? cfg.model + ' not connected' : 'Not connected');
  var bits = [who, cfg.auto ? 'auto on' : 'auto off', 'darkness ' + cfg.darkness];
  var which = [];
  if (k.jo_card) which.push('JO card');
  if (k.jewelry_tag) which.push('jewelry tag');
  bits.push(which.length ? which.join(' + ') : 'no kinds');
  return bits.join(' · ');
}

function callPrint(action, data) {
  data = data || {};
  var session = '';
  try { session = localStorage.getItem('oypSession') || ''; } catch (e) {}
  if (root.OYP && root.OYP.call && session) return root.OYP.call(action, data);
  var token = '';
  try { token = localStorage.getItem('oypScanToken') || ''; } catch (e2) {}
  var body = Object.assign({ op: action, token: token, device_id: deviceId() }, data);
  return fetch(api(), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
    .then(function (res) { return res.json(); })
    .catch(function () { return { ok: false, error: 'No connection' }; });
}

/* Paper fields only. client is display text and is not copied onto the sticker. */
function labelOpts(item, kind) {
  item = item || {};
  return {
    kind: kind || item.kind || 'jo_card',
    model: item.model || state.model || load().model || 'B1',
    head: item.head || state.head || undefined,
    jo: item.jo,
    due: item.due_date || item.due || '',
    date: item.date || item.given || '',
    stage: item.current_stage || item.stage || '',
    metal: item.metal || '',
    karat: item.karat || '',
    weight: item.weight_g != null && item.weight_g !== '' ? item.weight_g : item.weight,
    stone: item.stone_type || item.stone || '',
    stone_size: item.stone_size || '',
    size: item.size || ''
  };
}
function taskName(client) {
  var named = client.getPrintTaskType && client.getPrintTaskType();
  if (named) return named;
  var info = client.getPrinterInfo ? client.getPrinterInfo() : {};
  var meta = client.getModelMetadata ? client.getModelMetadata() : null;
  var model = meta && meta.model;
  var found = model && lib().findPrintTask(model, info && info.protocolVersion);
  if (found) return found;
  var head = meta && meta.printheadPixels;
  if (head >= 500) return 'D110M_V4';
  return 'B1';
}
function sendToPrinter(item) {
  var L = lib();
  if (!state.client || !state.connected) return Promise.reject(new Error('Not connected'));
  if (!root.OYPLabel) return Promise.reject(new Error('Label renderer is not loaded'));
  var rendered = root.OYPLabel.render(labelOpts(item));
  var canvas = root.OYPLabel.toCanvas(rendered);
  if (!canvas) return Promise.reject(new Error('No canvas'));
  var encoded = L.ImageEncoder.encodeCanvas(canvas, L.PageColorType.SingleColor, state.dir || 'top');
  var name = taskName(state.client);
  var task = state.client.protocol.newPrintTask(name, {
    totalPages: 1,
    density: load().darkness,
    labelType: L.LabelType.WithGaps,
    pageColor: L.PageColorType.SingleColor
  });
  return Promise.resolve(task.printInit()).then(function () {
    return task.printPage(encoded, 1);
  }).then(function () {
    return task.waitForFinished();
  }).then(function () {
    if (name === 'D110M_V4' && task.printEnd) return task.printEnd();
  });
}
function claimFresh(item, now) {
  if (!item || item.status !== 'queued') return false;
  if (!item.device_id || item.device_id === deviceId()) return true;
  var t = Date.parse(item.printed_at || '');
  if (!t || (now - t) >= STALE) return true;
  return false;
}
function claimAndPrint(item) {
  return work(function () {
    if (!item) return;
    if (!state.connected) { toast('Connect a printer first'); return; }
    var id = item.print_id;
    var go = function () { return sendToPrinter(item); };
    if (!id) {
      return go().catch(function () { toast('Sticker did not print'); });
    }
    return callPrint('printMark', { print_id: id, op: 'claim', device_id: deviceId() }).then(function (r) {
      if (!r || !r.ok) return;
      var printed = r.item ? Object.assign({}, item, r.item) : item;
      return go().then(function () {
        return callPrint('printMark', { print_id: id, op: 'printed', device_id: deviceId() });
      }).catch(function (err) {
        toast('Sticker did not print');
        return callPrint('printMark', { print_id: id, op: 'failed', device_id: deviceId(), error: String((err && err.message) || err || 'print failed').slice(0, 180) });
      }).then(function () { paintFrom(printed); });
    });
  });
}
function printJo(kind, jo, opts) {
  opts = opts || {};
  var reprint = opts.reprint !== false;
  return callPrint('printEnqueue', { jo: jo, kind: kind, reprint: reprint }).then(function (r) {
    var item = (r && r.item) || { jo: jo, kind: kind };
    if (!state.connected) { toast('Connect a printer to print. The sticker stays in the queue.'); refresh(); return r; }
    if (r && r.ok && item.status && item.status !== 'queued') { toast('That sticker is already ' + item.status); return r; }
    return claimAndPrint(item).then(function () { refresh(); return r; });
  }).catch(function () { toast('Sticker did not print'); });
}
function printLocal(opts) {
  var item = Object.assign({}, opts || {});
  delete item.model; delete item.head; delete item.client;
  return work(function () {
    if (!state.connected) { toast('Connect a printer first'); return; }
    return sendToPrinter(item).catch(function () { toast('Sticker did not print'); });
  });
}
function download(kind, item) {
  if (!root.OYPLabel) return;
  var rendered = root.OYPLabel.render(labelOpts(item, kind));
  var canvas = root.OYPLabel.toCanvas(rendered);
  if (!canvas) return;
  var a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = (kind === 'jewelry_tag' ? 'tag-' : 'sticker-') + (rendered.qr || 'label') + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}
function cancel(id) {
  return callPrint('printMark', { print_id: id, op: 'cancelled', device_id: deviceId() }).then(function () { refresh(); });
}
function reprint(item) {
  return printJo(item.kind, item.jo, { reprint: true });
}

function screenLabel(item) {
  if (root.OYP && root.OYP.piece) return root.OYP.piece(item.client, item.jo);
  var n = item.client ? String(item.client).trim() : '';
  var id = String(item.jo || '').trim();
  if (n && id) return esc(n) + ' · ' + esc(id);
  return esc(n || id);
}
function paint(r) {
  state.last = r;
  document.querySelectorAll('[data-oyp-q]').forEach(function (el) { el.innerHTML = queueHtml(r); });
}
function paintFrom() { refresh(); }
function queueHtml(r) {
  if (!r) return '<p class="muted">Print queue</p>';
  if (!r.ok) return '<p class="muted">' + esc(r.error || 'Could not load the queue') + '</p>';
  var items = r.items || [];
  if (!items.length) return '<p class="muted">Nothing waiting to print.</p>';
  return items.map(function (it) {
    var kind = it.kind === 'jewelry_tag' ? 'Jewelry tag' : 'JO card';
    var st = it.status === 'failed' ? 'Failed' : 'Queued';
    return '<div class="oyp-qrow"><div><b>' + screenLabel(it) + '</b><span class="muted"> ' + esc(kind) + ' · ' + esc(st) + (it.error ? ' · ' + esc(it.error) : '') + '</span></div><div class="oyp-qbtns">'
      + '<button type="button" data-q="now" data-id="' + esc(it.print_id) + '">Print now</button>'
      + (it.status === 'queued' ? '<button type="button" data-q="cancel" data-id="' + esc(it.print_id) + '">Cancel</button>' : '')
      + '<button type="button" data-q="reprint" data-id="' + esc(it.print_id) + '">Reprint</button></div></div>';
  }).join('');
}
function refresh() {
  return callPrint('printQueue', {}).then(function (r) { paint(r); return r; }).catch(function () { return null; });
}
function itemById(id) {
  var items = (state.last && state.last.items) || [];
  for (var i = 0; i < items.length; i++) if (items[i].print_id === id) return items[i];
  return null;
}
function onQueueClick(e) {
  var b = e.target.closest('[data-q]'); if (!b) return;
  var it = itemById(b.getAttribute('data-id')); if (!it) return;
  var q = b.getAttribute('data-q');
  if (q === 'cancel') cancel(it.print_id);
  else if (q === 'reprint') reprint(it);
  else printJo(it.kind, it.jo, { reprint: it.status !== 'queued' });
}

function isFinal(req, res) {
  if (res && (res.final === true || res.final_step === true)) return true;
  var d = String((res && (res.to || res.stage_code || res.col)) || (req && req.to) || '').toLowerCase();
  return d === 'pickup' || d === 'notify' || d === 'for_pickup';
}
function afterOk(req, res) {
  if (!res || res.ok === false) return;
  var kind = '', jo = req.jo;
  if (req.imageBase64 && !req.op && !req.action && (req.page === 1 || req.page === '1')) kind = 'jo_card';
  else if (req.action === 'prodMove' && isFinal(req, res)) kind = 'jewelry_tag';
  if (!kind || !jo) return;
  var will = state.connected && load().auto && printsKind(kind);
  callPrint('printEnqueue', { jo: jo, kind: kind, reprint: false }).then(function (r) {
    if (!will) return;
    if (r && r.ok && r.item && r.item.status === 'queued') return claimAndPrint(r.item);
    if (r && r.ok) return;
    if (r && /unknown action/i.test(r.error || '')) return claimAndPrint({ jo: jo, kind: kind });
  }).catch(function () {});
}
function installFetch() {
  if (!root.fetch || root.fetch.__oypPrint) return;
  var orig = root.fetch;
  function wrapped(input, init) {
    var opts = init || {};
    var raw = opts.body;
    var method = String(opts.method || 'GET').toUpperCase();
    var p = orig.apply(this, arguments);
    if (method !== 'POST' || typeof raw !== 'string') return p;
    var body;
    try { body = JSON.parse(raw); } catch (e) { return p; }
    if (!body) return p;
    return Promise.resolve(p).then(function (res) {
      try {
        res.clone().json().then(function (data) { try { afterOk(body, data); } catch (e2) {} }).catch(function () {});
      } catch (e) {}
      return res;
    });
  }
  wrapped.__oypPrint = true;
  root.fetch = wrapped;
}

function pump() {
  if (!state.connected || document.visibilityState === 'hidden') return;
  if (state.pumping) return;
  state.pumping = true;
  refresh().then(function (r) {
    if (!r || !load().auto) return;
    var items = r.items || [], next = null, now = Date.now();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.status !== 'queued' || !printsKind(it.kind) || state.busy[it.print_id] || !claimFresh(it, now)) continue;
      next = it; break;
    }
    if (!next) return;
    state.busy[next.print_id] = 1;
    return claimAndPrint(next).finally(function () { delete state.busy[next.print_id]; refresh(); });
  }).finally(function () { state.pumping = false; });
}
function startPoll() {
  if (state.timer) return;
  state.timer = setInterval(pump, POLL);
}
function stopPoll() { if (state.timer) { clearInterval(state.timer); state.timer = 0; } }

function onConnected(transport) {
  var meta = (state.client.getModelMetadata && state.client.getModelMetadata()) || {};
  state.model = meta.model || state.model || '';
  state.head = meta.printheadPixels || (state.model === 'B31' ? 600 : state.model === 'B1' ? 384 : 0);
  state.dir = meta.printDirection || 'top';
  state.transport = transport;
  state.connected = true;
  var cfg = load();
  cfg.transport = transport;
  cfg.model = state.model || cfg.model;
  if (!cfg.kinds) cfg.kinds = defaultKinds(state.model);
  save(cfg);
  drawChip();
  startPoll();
  pump();
}
function connect(transport) {
  var L = lib();
  if (!L) { toast('Printer library is not loaded'); return; }
  if (transport === 'bluetooth' && !canBt()) { toast('Bluetooth printing needs Chrome or Edge'); return; }
  if (transport === 'serial' && !canSerial()) { toast('USB printing needs Chrome or Edge on a computer'); return; }
  var client = transport === 'serial' ? new L.NiimbotSerialClient() : new L.NiimbotBluetoothClient();
  Promise.resolve(client.connect()).then(function () {
    state.client = client;
    if (client.on) client.on('disconnect', function () { state.connected = false; state.client = null; stopPoll(); drawChip(); });
    onConnected(transport);
  }).catch(function (err) {
    var name = err && err.name;
    if (name === 'NotFoundError' || name === 'AbortError') return;
    toast('Could not connect');
  });
}
function disconnect() {
  var c = state.client;
  state.client = null; state.connected = false;
  stopPoll();
  drawChip();
  if (c && c.disconnect) Promise.resolve(c.disconnect()).catch(function () {});
}

function chipText() {
  if (!canBt() && !canSerial()) return 'Printer unavailable';
  if (state.connected) return state.model || 'Printer';
  var model = load().model;
  return model ? 'Connect ' + model : 'Connect printer';
}
function drawChip() {
  var slot = document.getElementById('printChip');
  if (!slot) return;
  var on = state.connected;
  slot.innerHTML = '<span class="oyp-pr"><button type="button" class="oyp-pr-btn' + (on ? ' on' : '') + '" id="oypPrBtn" aria-haspopup="true"><i class="oyp-pr-dot"></i>' + esc(chipText()) + '</button><div class="oyp-pr-menu hidden" id="oypPrMenu"></div></span>';
  var menu = document.getElementById('oypPrMenu');
  var bits = [];
  if (canBt()) bits.push('<button type="button" data-pr="bluetooth">Bluetooth</button>');
  if (canSerial()) bits.push('<button type="button" data-pr="serial">USB serial</button>');
  if (state.connected) bits.push('<button type="button" data-pr="disconnect">Disconnect</button>');
  bits.push('<button type="button" data-pr="queue">Print queue</button>');
  if (!bits.length) bits.push('<button type="button" disabled>No Web Bluetooth on this browser</button>');
  menu.innerHTML = bits.join('');
}
function toggleMenu(force) {
  var menu = document.getElementById('oypPrMenu'); if (!menu) return;
  var show = force != null ? force : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !show);
}
function ensurePanel() {
  var p = document.getElementById('oypPrintPanel');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'oypPrintPanel';
  p.className = 'oyp-pr-panel hidden';
  p.setAttribute('data-oyp-q', '1');
  document.body.appendChild(p);
  return p;
}
function togglePanel() {
  var p = ensurePanel();
  var show = p.classList.contains('hidden');
  p.classList.toggle('hidden', !show);
  if (show) refresh();
}

function mountSettings(el) {
  if (!el) return;
  var cfg = load(), k = kinds();
  el.innerHTML = '<div class="setbox"><div class="setrow"><div class="setl"><span class="lab">Auto-print</span><span class="muted">When this printer is connected, print a new JO card or a finished jewelry tag on its own. Off still keeps the queue, and Print now still prints.</span></div><div class="setv"><label class="settog"><input type="checkbox" id="prAuto"' + (cfg.auto ? ' checked' : '') + '><span>' + (cfg.auto ? 'On' : 'Off') + '</span></label></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">Darkness</span><span class="muted">1 is light, 5 is dark. 3 is the usual.</span></div><div class="setv"><select id="prDark">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (cfg.darkness === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">This printer prints</span><span class="muted">A B31 starts on JO cards (30×20). A B1 starts on jewelry tags (30×25, blank 45 mm tail). Either one can print both.</span></div><div class="setv oyp-kinds"><label><input type="checkbox" id="prJo"' + (k.jo_card ? ' checked' : '') + '> JO card</label><label><input type="checkbox" id="prTag"' + (k.jewelry_tag ? ' checked' : '') + '> Jewelry tag</label></div></div></div>'
    + '<p class="muted">Stickers print the JO number, not the client name. The list below still shows the name first, for example Elena Tan · 26-287.</p>';
  function persist() {
    var next = load();
    next.auto = document.getElementById('prAuto').checked;
    next.darkness = Math.max(1, Math.min(5, document.getElementById('prDark').value | 0 || 3));
    next.kinds = { jo_card: document.getElementById('prJo').checked, jewelry_tag: document.getElementById('prTag').checked };
    save(next);
    var lab = document.querySelector('#prAuto + span'); if (lab) lab.textContent = next.auto ? 'On' : 'Off';
  }
  ['prAuto', 'prDark', 'prJo', 'prTag'].forEach(function (id) { var n = document.getElementById(id); if (n) n.onchange = persist; });
}
function mountQueue(el) {
  if (!el) return;
  el.setAttribute('data-oyp-q', '1');
  el.innerHTML = queueHtml(state.last);
  refresh();
}
function mountChip() {
  var slot = document.getElementById('printChip');
  if (!slot) {
    var top = document.querySelector('header.top');
    if (!top) return;
    slot = document.createElement('span');
    slot.id = 'printChip';
    slot.className = 'oyp-pr-slot';
    var menu = document.getElementById('btnMenu');
    if (menu && menu.parentNode === top) menu.parentNode.insertBefore(slot, menu.nextSibling);
    else top.appendChild(slot);
  }
  drawChip();
}
function joFrom(text) {
  if (root.OYPLabel) return root.OYPLabel.joCode(text);
  var m = String(text || '').toUpperCase().match(/(\d{2})-(\d{3,4})([A-Z])?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : '';
}
function addButtons() {
  var last = document.getElementById('lastScan');
  if (last && !last.querySelector('[data-oyp-print]')) {
    var la = last.querySelector('.la');
    var jo = joFrom(last.textContent);
    if (la && jo) la.insertAdjacentHTML('beforeend', '<button type="button" class="alt" data-oyp-print="jo_card" data-jo="' + esc(jo) + '">Print sticker</button><button type="button" class="alt" data-oyp-png="jo_card" data-jo="' + esc(jo) + '">Download PNG</button>');
  }
  var sheet = document.getElementById('pSheet');
  if (sheet && !sheet.querySelector('[data-oyp-print]')) {
    var h = sheet.querySelector('h3');
    var jo2 = joFrom(h ? h.textContent : '');
    if (jo2) {
      var host = document.createElement('div');
      host.className = 'oyp-pr-acts';
      host.innerHTML = '<button type="button" class="pill sm outline" data-oyp-print="jo_card" data-jo="' + esc(jo2) + '">Print sticker</button><button type="button" class="pill sm outline" data-oyp-print="jewelry_tag" data-jo="' + esc(jo2) + '">Print tag</button><button type="button" class="pill sm outline" data-oyp-png="jewelry_tag" data-jo="' + esc(jo2) + '">Download tag PNG</button>';
      var back = sheet.querySelector('.pdh') || sheet.querySelector('#pSX');
      if (back && back.parentNode) back.parentNode.insertBefore(host, back.nextSibling);
    }
  }
}
function css() {
  if (document.querySelector('link[href*="print.css"]')) return;
  var src = '', tags = document.getElementsByTagName('script'), i;
  for (i = tags.length - 1; i >= 0; i--) { var s = tags[i].src || ''; if (/print\.js(\?|$)/.test(s)) { src = s; break; } }
  var base = src ? src.replace(/[^/]*$/, '') : '';
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = (base || '') + 'print.css?v=1';
  (document.head || document.documentElement).appendChild(link);
}
function start() {
  css();
  deviceId();
  installFetch();
  mountChip();
  addButtons();
  if (!state.obs && root.MutationObserver) {
    state.obs = new MutationObserver(function () { addButtons(); if (!document.getElementById('oypPrBtn')) mountChip(); });
    state.obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('click', function (e) {
    var pr = e.target.closest('[data-pr]');
    if (pr) {
      var act = pr.getAttribute('data-pr');
      toggleMenu(false);
      if (act === 'bluetooth') connect('bluetooth');
      else if (act === 'serial') connect('serial');
      else if (act === 'disconnect') disconnect();
      else togglePanel();
      return;
    }
    if (e.target.closest('#oypPrBtn')) { toggleMenu(); return; }
    if (!e.target.closest('#oypPrMenu')) toggleMenu(false);
    var b = e.target.closest('[data-oyp-print]');
    if (b) { printJo(b.getAttribute('data-oyp-print'), b.getAttribute('data-jo'), { reprint: true }); return; }
    var png = e.target.closest('[data-oyp-png]');
    if (png) { download(png.getAttribute('data-oyp-png'), { jo: png.getAttribute('data-jo') }); return; }
    if (e.target.closest('[data-q]')) onQueueClick(e);
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && state.connected) pump(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

root.OYPPrint = { summary: summary, mountSettings: mountSettings, mountQueue: mountQueue, printJo: printJo, printLocal: printLocal, download: download, connect: connect, disconnect: disconnect, refresh: refresh, labelOpts: labelOpts, load: load, save: save };
})(typeof window !== 'undefined' ? window : globalThis);
