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
var POLL = 1000;
var state = { client: null, model: '', head: 0, dir: 'top', transport: '', connected: false, printing: false, reconnecting: false, userDisconnect: false, btId: '', linkDownAt: 0, linkBurst: 0, expected: false, timer: 0, worker: null, workerUrl: '', pumping: false, busy: {}, open: '', armUntil: 0, chain: Promise.resolve(), rev: null, briefOk: null, ticks: 0, auto: null, printQueued: false, inflight: {}, cool: {}, done: {}, hot: {}, prepared: {}, preparing: {}, toldDown: false };
/* Slot 0 is state. Slot 1 is the second printer on the same page. Each has its own link, chain, and device id. */
var peer = { client: null, model: '', head: 0, dir: 'top', transport: '', connected: false, printing: false, reconnecting: false, userDisconnect: false, btId: '', linkDownAt: 0, linkBurst: 0, expected: false, chain: Promise.resolve() };
var PAGE_MS = 20000;
var ATTEMPT_MS = 45000;
var END_MS = 4000;
var JOB_MS = 120000;
var LINK_MS = 10000;
var PRINT_JS = 27;
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
  var o = { darkness: 3, auto: true, transport: '', kinds: null, kindsByModel: {}, taskByModel: {}, model: '', offsets: {}, links: [null, null] };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') o = Object.assign(o, raw); } catch (e) {}
  o.darkness = Math.max(1, Math.min(5, o.darkness | 0 || 3));
  if (!o.offsets || typeof o.offsets !== 'object') o.offsets = {};
  if (!o.kindsByModel || typeof o.kindsByModel !== 'object') o.kindsByModel = {};
  if (!o.taskByModel || typeof o.taskByModel !== 'object') o.taskByModel = {};
  if (!Array.isArray(o.links)) o.links = [null, null];
  o.links = [o.links[0] || null, o.links[1] || null];
  /* An old browser saved one kinds object for every printer. Keep it only on the model it was saved for. */
  if (o.kinds && typeof o.kinds === 'object') {
    if (o.model && !o.kindsByModel[o.model]) o.kindsByModel[o.model] = { jo_card: !!o.kinds.jo_card, jewelry_tag: !!o.kinds.jewelry_tag };
    o.kinds = null;
  }
  /* A saved "print both" choice must not put JO stickers on the B1. */
  if (o.kindsByModel.B1 && typeof o.kindsByModel.B1 === 'object') o.kindsByModel.B1.jo_card = false;
  o.auto = o.auto !== false;
  return o;
}
function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  if (typeof root.onOypPrintSave === 'function') root.onOypPrintSave();
}
/* Half-millimetre steps from -5 to +5. Positive x moves the print right. Positive y moves it down the feed. */
function stepMm(v) {
  var n = Math.round(Number(v) * 2) / 2;
  if (!isFinite(n)) n = 0;
  if (n > 5) n = 5;
  if (n < -5) n = -5;
  return n;
}
function offsetMm(model) {
  var all = load().offsets || {};
  var o = all[model] || {};
  return { x: stepMm(o.x), y: stepMm(o.y) };
}
function shiftPx(model) {
  var o = offsetMm(model);
  var L = root.OYPLabel;
  if (!L) return { x: 0, y: 0 };
  return { x: L.px(o.x), y: L.px(o.y) };
}
function api() {
  try { return localStorage.getItem('oypScanApi') || localStorage.getItem('oypApi') || DEFAULT_API; } catch (e) { return DEFAULT_API; }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
function ios() {
  var ua = (navigator.userAgent || '');
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isScannerPage() {
  var flag = document.documentElement && document.documentElement.getAttribute('data-oyp-scanner');
  if (flag === '1') return true;
  if (flag === '0') return false;
  if (document.getElementById('vOffice') || document.getElementById('side')) return false;
  return !!(document.getElementById('btnMenu') && document.getElementById('menu'));
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
function withTimeout(p, ms, message) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, ms);
    Promise.resolve(p).then(function (v) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    }, function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
/* One attempt id per connect. A late resolve after a timeout or Retry tap must not call onConnected. */
function freshAttempt(link) {
  link.attempt = (link.attempt || 0) + 1;
  return link.attempt;
}
function liveAttempt(link, token) {
  return !!token && link.attempt === token;
}
function dropGatt(device) {
  var gatt = device && device.gatt;
  if (!gatt || typeof gatt.disconnect !== 'function') return;
  try {
    logMs('link gatt.disconnect', 0, (device.name || device.id || ''));
    gatt.disconnect();
  } catch (e) {}
}
/* Resolves, rejects, times out, or cancels. The logged ms is the deadline when the step times out. */
function step(link, label, p, ms, extra) {
  var t0 = clock();
  var who = extra || '';
  logMs('link ' + label + ' start', 0, who);
  return new Promise(function (resolve, reject) {
    var settled = false;
    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (link && link.waiters) {
        var at = link.waiters.indexOf(cancel);
        if (at >= 0) link.waiters.splice(at, 1);
      }
      var elapsed = clock() - t0;
      if (err && /timed out/.test(String(err.message || ''))) elapsed = ms;
      logMs('link ' + label, elapsed, (err ? (err.message || 'failed') : 'ok') + (who ? ' ' + who : ''));
      if (err) reject(err);
      else resolve(value);
    }
    function cancel() { finish(Object.assign(new Error(label + ' cancelled'), { quiet: 'cancel' })); }
    var timer = setTimeout(function () { finish(new Error(label + ' timed out')); }, ms);
    if (link) {
      link.waiters = link.waiters || [];
      link.waiters.push(cancel);
    }
    Promise.resolve(p).then(function (v) { finish(null, v); }, function (err) { finish(err || new Error(label + ' failed')); });
  });
}
function watchDevice(link, device, token) {
  if (!device || typeof device.watchAdvertisements !== 'function') return Promise.resolve();
  var who = device.name || device.id || '';
  return step(link, 'watchAdvertisements', Promise.resolve().then(function () { return device.watchAdvertisements(); }), LINK_MS, who).catch(function (err) {
    if (!liveAttempt(link, token)) throw err;
    if (err && /timed out/.test(String(err.message || ''))) throw err;
    return undefined;
  });
}
/* Drops the in-flight GATT connect and invalidates its promise. Returns the client to disconnect, or false if a newer attempt owns the link. */
function abortAttempt(link, token) {
  if (token && !liveAttempt(link, token)) return false;
  var waiters = link.waiters || [];
  link.waiters = [];
  var c = link.client;
  link.client = null;
  var device = link.gattDevice;
  link.gattDevice = null;
  freshAttempt(link);
  link.reconnecting = false;
  link.opening = false;
  link.auto = false;
  if (link.btId && state.autoBusy) delete state.autoBusy[link.btId];
  waiters.forEach(function (fn) { try { fn(); } catch (e2) {} });
  dropGatt(device);
  return c;
}
/* A print that never answers must not sit on this chain. The next Print tap would look like it did nothing. */
function work(link, fn) {
  if (typeof link === 'function') { fn = link; link = state; }
  var run = link.chain.then(function () { return fn(); }, function () { return fn(); });
  var capped = withTimeout(run, JOB_MS, 'Print timed out');
  link.chain = capped.then(function () {}, function () {});
  return capped;
}
function devId(link) {
  var id = deviceId();
  return link === peer ? id + '-2' : id;
}
function anyUp() { return !!(state.connected || peer.connected); }
function anyPrinting() { return !!(state.printing || peer.printing); }
function slotIndex(link) { return link === peer ? 1 : 0; }
function defaultKinds(model) {
  if (model === 'B31') return { jo_card: true, jewelry_tag: false };
  if (model === 'B1') return { jo_card: false, jewelry_tag: true };
  return { jo_card: false, jewelry_tag: false };
}
/* Jewelry tags belong to the B1. JO cards, intake, and every other kind belong to the B31. */
function isTagKind(kind) {
  var k = String(kind || '').toLowerCase().replace(/[\s-]+/g, '_');
  return k === 'jewelry_tag' || k === 'jewelry' || k === 'tag' || k === 'cal_tag';
}
function ownerModel(kind) { return isTagKind(kind) ? 'B1' : 'B31'; }
function knownModel(model) {
  model = String(model || '').toUpperCase();
  return model === 'B1' || model === 'B31' ? model : '';
}
/* The BLE name is "B1" or "B31". A B31 can answer the B1 model id, so the name wins. */
function modelFromName(name) {
  var s = String(name || '').toUpperCase();
  if (s.indexOf('B31') >= 0) return 'B31';
  if (/(?:^|[^A-Z0-9])B1(?:[^A-Z0-9]|$)/.test(s)) return 'B1';
  return '';
}
function modelFromHead(px) {
  px = px | 0;
  if (px >= 500) return 'B31';
  if (px >= 320 && px <= 420) return 'B1';
  return '';
}
function detectModel(name, meta, previous) {
  meta = meta || {};
  var named = modelFromName(name);
  if (named) return named;
  var reported = knownModel(meta.model);
  if (reported) return reported;
  if (!meta.model) {
    var byHead = modelFromHead(meta.printheadPixels);
    if (byHead) return byHead;
  }
  return knownModel(previous);
}
function activeModel(cfg) {
  return state.model || (cfg || load()).model || '';
}
function kinds(link) {
  var cfg = load();
  var model = link ? (link.model || '') : activeModel(cfg);
  var saved = model && cfg.kindsByModel[model];
  var out = defaultKinds(model);
  if (saved && typeof saved === 'object') out = { jo_card: !!saved.jo_card, jewelry_tag: !!saved.jewelry_tag };
  if (model === 'B1') out.jo_card = false;
  return out;
}
function b1Connected() {
  var list = [state, peer], i;
  for (i = 0; i < list.length; i++) if (list[i].connected && list[i].model === 'B1') return true;
  return false;
}
/* A saved kinds switch can turn a kind off. It cannot give jewelry tags to a B31 while a B1 is connected. */
function printsKind(kind, link) {
  if (!link || !knownModel(link.model)) return false;
  var k = kinds(link);
  if (isTagKind(kind)) {
    if (link.model === 'B31') return !b1Connected() && !!k.jewelry_tag;
    return link.model === 'B1' && k.jewelry_tag !== false;
  }
  return link.model === 'B31' && k.jo_card !== false;
}
/* The owning model prints the sticker. Another printer is used only when that model is connected and its switch is off. */
function linkFor(kind) {
  var owner = ownerModel(kind);
  var list = [state, peer], i, link, own = null, ownBusy = null, alt = null, altBusy = null, ownerUp = false;
  for (i = 0; i < list.length; i++) {
    link = list[i];
    if (!link.connected) continue;
    if (link.model === owner) ownerUp = true;
    if (!printsKind(kind, link)) continue;
    if (link.model === owner) {
      if (!link.printing) own = own || link;
      else ownBusy = ownBusy || link;
    } else if (ownerUp) {
      if (!link.printing) alt = alt || link;
      else altBusy = altBusy || link;
    }
  }
  return own || ownBusy || alt || altBusy || null;
}
function holdText(kind) {
  var tag = isTagKind(kind);
  var model = tag ? 'B1' : 'B31';
  var what = tag ? 'jewelry tags' : 'JO stickers';
  var list = [state, peer], i, link, up = false, declined = false;
  for (i = 0; i < list.length; i++) {
    link = list[i];
    if (!link.connected || link.model !== model) continue;
    up = true;
    if (!printsKind(kind, link)) declined = true;
  }
  if (up && declined) return 'The ' + model + ' is not set to print ' + what;
  return 'Connect the ' + model + ' to print ' + what;
}
function heldMessages() {
  var items = (state.last && state.last.items) || [], seen = {}, out = [], i, it, msg;
  for (i = 0; i < items.length; i++) {
    it = items[i];
    if (!it || it.status !== 'queued' || linkFor(it.kind)) continue;
    if (!state.printQueued && !serverAuto(it.kind)) continue;
    msg = holdText(it.kind);
    if (seen[msg]) continue;
    seen[msg] = 1;
    out.push(msg);
  }
  return out;
}
function noteHeld() {
  var msgs = heldMessages(), key = msgs.join('|');
  if (state.heldTold === key) return;
  state.heldTold = key;
  msgs.forEach(function (m) { toast(m); });
}
function summary() {
  var cfg = load(), k = kinds();
  var who = state.connected ? (state.model || 'Printer') : (cfg.model ? cfg.model + ' not connected' : 'Not connected');
  var bits = [who, serverAuto('jo_card') ? 'JO sticker on' : 'JO sticker off', serverAuto('jewelry_tag') ? 'tag on' : 'tag off', 'darkness ' + cfg.darkness];
  ['B31', 'B1'].forEach(function (m) {
    var o = offsetMm(m);
    if (o.x || o.y) bits.push(m + ' offset ' + o.x.toFixed(1) + ', ' + o.y.toFixed(1) + ' mm');
  });
  var which = [];
  if (k.jo_card) which.push('JO card');
  if (k.jewelry_tag) which.push('jewelry tag');
  bits.push(which.length ? which.join(' + ') : 'no kinds');
  return bits.join(' · ');
}

/* Staff pages send action + session, the same body as app.js net(). data.op must not replace that action. */
function markPayload(data) {
  data = data || {};
  var payload = {}, k;
  for (k in data) if (Object.prototype.hasOwnProperty.call(data, k) && k !== 'op') payload[k] = data[k];
  if (data.mark || data.op) payload.mark = data.mark || data.op;
  return payload;
}
function staffCall(action, data) {
  var session = '';
  try { session = localStorage.getItem('oypSession') || ''; } catch (e) {}
  var body = Object.assign({ action: action, session: session, device_id: deviceId() }, data || {});
  return fetch(api(), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
    .then(function (res) { return res.json(); })
    .catch(function () { return { ok: false, error: 'No connection' }; });
}
function ensureCall() {
  if (!root.OYP) root.OYP = {};
  if (!root.OYP.call) root.OYP.call = staffCall;
}
function callPrint(action, data) {
  var payload = markPayload(data);
  ensureCall();
  var session = '';
  try { session = localStorage.getItem('oypSession') || ''; } catch (e) {}
  if (session && root.OYP && root.OYP.call) return root.OYP.call(action, payload);
  var token = '';
  try { token = localStorage.getItem('oypScanToken') || ''; } catch (e2) {}
  var body = Object.assign({ op: action, token: token, device_id: deviceId() }, payload);
  return fetch(api(), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
    .then(function (res) { return res.json(); })
    .catch(function () { return { ok: false, error: 'No connection' }; });
}
function markFailed(r, fallback) {
  if (r && r.ok) return false;
  toast((r && r.error) || fallback || 'Could not update the sticker');
  return true;
}

/* Paper fields only. client is display text and is not copied onto the sticker. */
function labelOpts(item, kind, link) {
  item = item || {};
  link = link || state;
  var model = item.model || link.model || 'B1';
  var sh = shiftPx(model);
  return {
    kind: kind || item.kind || 'jo_card',
    model: model,
    shiftX: sh.x,
    shiftY: sh.y,
    head: item.head || link.head || undefined,
    jo: item.jo,
    due: item.due_date || item.due || '',
    date: item.date || item.given || '',
    stage: item.current_stage || item.stage || '',
    price: item.price,
    name: item.name || '',
    description: item.description || '',
    item_type: item.item_type || item.piece_type || '',
    type: item.type || '',
    metal: item.metal || '',
    karat: item.karat || '',
    weight: item.weight_g != null && item.weight_g !== '' ? item.weight_g : item.weight,
    stones: item.stones || '',
    stone: item.stone_type || item.stone || '',
    stone_size: item.stone_size || '',
    grade: item.grade || '',
    size: item.size || '',
    sku: item.sku || item.item_id || '',
    location: item.location || ''
  };
}
function tasks() { return (lib() && lib().printTasks) || {}; }
function taskKnown(name) { return !!(name && tasks()[name]); }
/* Our map, not niimbluelib's. A B31 answers the B1 page size; D110M_V4 times out on e4. */
var MODEL_TASKS = { B31: 'B1', B1: 'B1' };
function clock() {
  return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now();
}
function logMs(phase, ms, extra) {
  try { console.log('[oyp-print] ' + phase + ' ' + Math.round(ms) + 'ms' + (extra ? ' ' + extra : '')); } catch (e) {}
}
/* Settings > Labels > Print mode. This is the page task only, never the printer model. Manual wins, then the task this model last finished, then our map. */
function taskName(link) {
  link = link || state;
  var client = link.client;
  var forced = load().task;
  if (forced && forced !== 'auto' && taskKnown(forced)) return forced;
  var meta = link.model ? null : (client && client.getModelMetadata && client.getModelMetadata());
  var model = link.model || (meta && meta.model) || '';
  var saved = (load().taskByModel || {})[model];
  if (taskKnown(saved)) return saved;
  if (taskKnown(MODEL_TASKS[model])) return MODEL_TASKS[model];
  var named = client && client.getPrintTaskType && client.getPrintTaskType();
  if (taskKnown(named)) return named;
  var info = client && client.getPrinterInfo ? client.getPrinterInfo() : {};
  var found = model && lib() && lib().findPrintTask && lib().findPrintTask(model, info && info.protocolVersion);
  if (taskKnown(found)) return found;
  var head = (meta && meta.printheadPixels) || link.head || 0;
  if (head >= 500 && taskKnown('D110M_V4')) return 'D110M_V4';
  return taskKnown('B1') ? 'B1' : 'D110M_V4';
}
/* One retry, and only on Auto: the detected task, then B1, then D110M_V4. A manual choice is not replaced. */
function taskChoices(link) {
  link = link || state;
  var forced = load().task;
  if (forced && forced !== 'auto' && taskKnown(forced)) return [forced];
  var out = [], first = taskName(link);
  function add(name) { if (taskKnown(name) && out.indexOf(name) < 0) out.push(name); }
  add(first);
  add('B1');
  add('D110M_V4');
  if (!out.length) out.push(first || 'B1');
  return out.slice(0, 2);
}
function rememberTask(name, link) {
  link = link || state;
  if ((load().task || 'auto') !== 'auto' || !link.model || !taskKnown(name)) return;
  var cfg = load();
  if (cfg.taskByModel[link.model] === name) return;
  cfg.taskByModel[link.model] = name;
  save(cfg);
}
function isPageEndTimeout(err) {
  return /waited for e4/i.test(String((err && err.message) || err || ''));
}
function isTimeout(err) {
  var m = String((err && err.message) || err || '');
  return /waited for e4|print timed out|timed out|timeout waiting/i.test(m);
}
function failToast(err) {
  if (isTimeout(err)) return 'Printer did not respond. Turn the printer off and on, then reconnect.';
  return String((err && err.message) || err || 'Sticker did not print');
}
function failRow(err) {
  if (isTimeout(err)) return 'Printer did not respond';
  return String((err && err.message) || err || 'print failed').slice(0, 180);
}
function headPixels(link) {
  link = link || state;
  if (link.head) return link.head | 0;
  var meta = !link.model && link.client && link.client.getModelMetadata && link.client.getModelMetadata();
  var head = (meta && meta.printheadPixels) || 0;
  if (!head && root.OYPLabel && root.OYPLabel.HEADS) head = root.OYPLabel.HEADS[link.model] || 0;
  return head | 0;
}
/* The encoder's column count is the canvas width rounded up to a byte. The B31 head is 600, so the bitmap must be exactly that wide. */
function fitHead(canvas, link) {
  var head = headPixels(link);
  if (!canvas || !head || canvas.width === head) return canvas;
  var c = document.createElement('canvas');
  c.width = head;
  c.height = canvas.height;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, head, canvas.height);
  var w = Math.min(canvas.width, head);
  ctx.drawImage(canvas, 0, 0, w, canvas.height, 0, 0, w, canvas.height);
  return c;
}
function labelReady() {
  var p = root.OYPLabel && root.OYPLabel.ready;
  return p && typeof p.then === 'function' ? p.catch(function () {}) : Promise.resolve();
}
function labelSig(item, link) {
  var o = labelOpts(item, null, link);
  var dir = (link && link.dir) || '';
  return [o.kind, o.model, o.head || '', o.shiftX, o.shiftY, load().darkness, dir, o.jo || '', o.due || '', o.date || '', o.stage || '', o.price || '', o.name || '', o.description || '', o.item_type || '', o.type || '', o.metal || '', o.karat || '', o.weight || '', o.stones || '', o.stone || '', o.stone_size || '', o.grade || '', o.size || '', o.sku || '', o.location || ''].join('\u001f');
}
function trimPrepared() {
  var keys = Object.keys(state.prepared);
  if (keys.length <= 40) return;
  delete state.prepared[keys[0]];
}
/* Fonts and the QR are ready before the claim returns, and again when the queue is fetched. */
function prepareItem(item, link) {
  if (!link) link = linkFor(item && item.kind);
  if (!link) return Promise.reject(new Error(holdText(item && item.kind)));
  var sig = labelSig(item, link);
  if (state.prepared[sig]) return Promise.resolve({ encoded: state.prepared[sig].encoded, ms: state.prepared[sig].ms, sig: sig, cached: true });
  if (state.preparing[sig]) return state.preparing[sig];
  var t0 = clock();
  var p = labelReady().then(function () {
    if (!root.OYPLabel) throw new Error('Label renderer is not loaded');
    var L = lib();
    var rendered = root.OYPLabel.render(labelOpts(item, null, link));
    var canvas = fitHead(root.OYPLabel.toCanvas(rendered), link);
    if (!canvas) throw new Error('No canvas');
    var encoded = L.ImageEncoder.encodeCanvas(canvas, L.PageColorType.SingleColor, (link && link.dir) || 'top');
    var rec = { encoded: encoded, ms: clock() - t0, sig: sig };
    state.prepared[sig] = rec;
    delete state.preparing[sig];
    trimPrepared();
    return { encoded: encoded, ms: rec.ms, sig: sig, cached: false };
  }).catch(function (err) {
    delete state.preparing[sig];
    throw err;
  });
  p.catch(function () {});
  state.preparing[sig] = p;
  return p;
}
function primeQueue(r) {
  var items = (r && r.items) || [];
  items.forEach(function (it) {
    if (it && it.status === 'queued') prepareItem(it, linkFor(it.kind)).catch(function () {});
  });
}
function sendToPrinter(item, prep, link) {
  link = link || state;
  if (!link.client || !link.connected) return Promise.reject(new Error('Not connected'));
  if (!root.OYPLabel) return Promise.reject(new Error('Label renderer is not loaded'));
  var sig = labelSig(item, link);
  var already = !!state.prepared[sig];
  var started = clock();
  return Promise.resolve(prep || prepareItem(item, link)).then(function (rec) {
    var waited = clock() - started;
    logMs('render', rec.cached || already ? 0 : rec.ms, rec.cached ? 'cached' : (already || waited < 8 ? 'overlapped' : ''));
    return sendEncoded(rec.encoded, link, item && item.kind);
  });
}
function clientMark(client) {
  if (!client) return 'none';
  if (!client.__oypId) client.__oypId = 'c' + (clientMark.n = (clientMark.n || 0) + 1);
  return client.__oypId;
}
/* A jewelry tag is only ever written to a B1. Checked on the link that owns this client, immediately before the write. */
function tagBlocked(kind, link) {
  return isTagKind(kind) && (!link || link.model !== 'B1');
}
function runTask(name, encoded, link, kind) {
  link = link || state;
  if (!link.client) return Promise.reject(new Error('Not connected'));
  if (tagBlocked(kind, link)) return Promise.reject(new Error('Connect the B1 to print jewelry tags'));
  logMs('write', 0, 'btId=' + (link.btId || '') + ' name=' + (link.deviceName || '') + ' client=' + clientMark(link.client) + ' model=' + (link.model || ''));
  var L = lib();
  var task = link.client.protocol.newPrintTask(name, {
    totalPages: 1,
    density: load().darkness,
    labelType: L.LabelType.WithGaps,
    pageColor: L.PageColorType.SingleColor,
    pageTimeoutMs: PAGE_MS,
    statusTimeoutMs: 8000
  });
  /* printEnd always runs, also after an error, and it cannot hold the queue if the printer never answers. */
  var end = function () {
    return task.printEnd ? withTimeout(Promise.resolve(task.printEnd()), END_MS, 'print end').catch(function () {}) : null;
  };
  var tSend = clock();
  var attempt = Promise.resolve(task.printInit()).then(function () {
    return task.printPage(encoded, 1);
  }).then(function () {
    logMs('send', clock() - tSend, name);
    var tWait = clock();
    return Promise.resolve(task.waitForFinished()).then(function (v) {
      logMs('waitForFinished', clock() - tWait);
      return v;
    }, function (err) {
      logMs('waitForFinished', clock() - tWait);
      throw err;
    });
  }, function (err) {
    logMs('send', clock() - tSend, name);
    throw err;
  });
  return withTimeout(attempt, ATTEMPT_MS, 'Print timed out').then(function () {
    return Promise.resolve(end()).then(function () { rememberTask(name, link); });
  }, function (err) {
    return Promise.resolve(end()).then(function () { throw err; });
  });
}
function sendEncoded(encoded, link, kind) {
  link = link || state;
  if (!link.client) return Promise.reject(new Error('Not connected'));
  if (tagBlocked(kind, link)) return Promise.reject(new Error('Connect the B1 to print jewelry tags'));
  var names = taskChoices(link), i = 0;
  function once() {
    return runTask(names[i], encoded, link, kind).catch(function (err) {
      if (i + 1 < names.length && isPageEndTimeout(err)) { i += 1; return once(); }
      throw err;
    });
  }
  return once();
}
function claimFresh(item, now, link) {
  if (!item || item.status !== 'queued') return false;
  var mine = devId(link || state);
  if (!item.device_id || item.device_id === mine) return true;
  var t = Date.parse(item.printed_at || '');
  if (!t || (now - t) >= STALE) return true;
  return false;
}
function markPrinting(link, on) {
  if (typeof link === 'boolean') { on = link; link = state; }
  link.printing = !!on;
  var busy = anyPrinting();
  document.querySelectorAll('[data-q]').forEach(function (b) { b.disabled = busy; });
  paintDots();
}
function autoFrom(v) {
  if (v && typeof v === 'object') return { jo_card: v.jo_card !== false, jewelry_tag: v.jewelry_tag !== false };
  if (typeof v === 'boolean') return { jo_card: v, jewelry_tag: v };
  return null;
}
function serverAuto(kind) {
  var a = state.auto && typeof state.auto === 'object' ? state.auto : null;
  if (!a) {
    var cfg = load();
    a = cfg.autoKinds && typeof cfg.autoKinds === 'object' ? cfg.autoKinds : { jo_card: cfg.auto !== false, jewelry_tag: cfg.auto !== false };
  }
  if (!kind) return a.jo_card !== false || a.jewelry_tag !== false;
  return a[isTagKind(kind) ? 'jewelry_tag' : 'jo_card'] !== false;
}
function noteAuto(r) {
  var next = r && autoFrom(r.auto);
  if (!next) return;
  if (state.auto && state.auto.jo_card === next.jo_card && state.auto.jewelry_tag === next.jewelry_tag) return;
  state.auto = next;
  paintAuto();
}
function wantsQueue() { return !!state.printQueued || serverAuto('jo_card') || serverAuto('jewelry_tag'); }
function printQueued() {
  state.printQueued = true;
  kick();
}
function enqueueBatch(payload) {
  return callPrint('printEnqueueBatch', payload || {});
}
function queuedText(items, skipped) {
  var tags = 0, cards = 0, i;
  for (i = 0; i < items.length; i++) {
    if (isTagKind(items[i].kind)) tags++;
    else cards++;
  }
  function bit(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  var msg = 'Queued ';
  if (tags && cards) msg += bit(tags, 'jewelry tag', 'jewelry tags') + ' and ' + bit(cards, 'JO sticker', 'JO stickers');
  else if (tags) msg += bit(tags, 'jewelry tag', 'jewelry tags');
  else msg += bit(cards, 'JO sticker', 'JO stickers');
  if (skipped) msg += ' · ' + skipped + ' already waiting';
  return msg;
}
function itemsForChoice(jos, choice) {
  var kinds = choice === 'both' ? ['jewelry_tag', 'jo_card'] : [choice === 'jo_card' ? 'jo_card' : 'jewelry_tag'];
  var items = [], i, k;
  for (i = 0; i < jos.length; i++) {
    if (!jos[i]) continue;
    for (k = 0; k < kinds.length; k++) items.push({ jo: String(jos[i]), kind: kinds[k] });
  }
  return items;
}
function closeKind() {
  var el = document.getElementById('oypKind');
  if (!el) return false;
  if (el.remove) el.remove();
  else if (el.parentNode) el.parentNode.removeChild(el);
  return true;
}
/* Jewelry tag is the filled primary. JO sticker and Both are the other choices. Cancel closes the sheet. */
function askPrint(jos) {
  jos = (jos || []).map(function (j) { return String(j || '').trim(); }).filter(Boolean);
  if (!jos.length) { toast('Select a sticker first'); return Promise.resolve(null); }
  if (state.kindDone) state.kindDone('cancel');
  var done = false, finish = function () {};
  var sheet = document.createElement('div');
  var box = document.createElement('div');
  sheet.id = 'oypKind';
  sheet.className = 'oyp-kind';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Print');
  box.className = 'oyp-kindbox';
  function add(kind, label, primary) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill sm' + (primary ? '' : ' outline');
    b.setAttribute('data-kind', kind);
    b.textContent = label;
    if (primary) b.setAttribute('aria-current', 'true');
    b.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      finish(kind);
    };
    box.appendChild(b);
    return b;
  }
  var title = document.createElement('p');
  title.className = 'lab';
  title.textContent = jos.length === 1 ? jos[0] : (jos.length + ' selected');
  box.appendChild(title);
  add('jewelry_tag', 'Jewelry tag', true);
  add('jo_card', 'JO sticker', false);
  add('both', 'Both', false);
  add('cancel', 'Cancel', false);
  sheet.appendChild(box);
  sheet.onclick = function () { finish('cancel'); };
  document.body.appendChild(sheet);
  return new Promise(function (resolve) {
    finish = function (choice) {
      if (done) return;
      done = true;
      if (state.kindDone === finish) state.kindDone = null;
      closeKind();
      if (!choice || choice === 'cancel') { resolve(null); return; }
      resolve(printStickers(itemsForChoice(jos, choice)));
    };
    state.kindDone = finish;
  });
}
function printStickers(list) {
  var items = (list || []).filter(function (it) { return it && it.jo && it.kind; });
  if (!items.length) { toast('Select a sticker first'); return Promise.resolve(); }
  return enqueueBatch({ items: items }).then(function (r) {
    if (!r || r.ok === false) { toast((r && r.error) || 'Could not queue those stickers'); return r; }
    toast(queuedText(items, r.skipped));
    refresh();
    if (anyUp()) kick();
    return r;
  });
}
function mountRange(el) {
  if (!el || el.getAttribute('data-wired')) return;
  el.setAttribute('data-wired', '1');
  el.innerHTML = '<div class="setrow"><div class="setl"><span class="lab">Print a range</span><span class="muted">Every JO that exists between these numbers, in order. Missing numbers are skipped.</span></div>'
    + '<div class="setv pr-range"><input id="prFrom" placeholder="26-280" aria-label="From JO" autocomplete="off">'
    + '<input id="prTo" placeholder="26-300" aria-label="To JO" autocomplete="off">'
    + '<select id="prKind" aria-label="Sticker type"><option value="jo_card">JO card</option><option value="jewelry_tag">Jewelry tag</option></select>'
    + '<button type="button" class="pill sm" id="prRangeGo" disabled>Queue</button></div></div>'
    + '<p class="muted" id="prRangeN"></p>';
  var timer = 0;
  function fields() {
    return {
      from: (document.getElementById('prFrom') || {}).value || '',
      to: (document.getElementById('prTo') || {}).value || '',
      kind: (document.getElementById('prKind') || {}).value || 'jo_card'
    };
  }
  function preview() {
    var f = fields(), note = document.getElementById('prRangeN'), btn = document.getElementById('prRangeGo');
    if (!String(f.from).trim() || !String(f.to).trim()) {
      if (note) note.textContent = '';
      if (btn) btn.disabled = true;
      return;
    }
    enqueueBatch({ from: String(f.from).trim(), to: String(f.to).trim(), kind: f.kind, preview: 1 }).then(function (r) {
      if (!note) return;
      if (!r || r.ok === false) {
        note.textContent = r && r.count ? (r.count + ' stickers. Queue up to 200 at a time.') : ((r && r.error) || 'Could not count those JOs');
        if (btn) btn.disabled = true;
        return;
      }
      var n = r.count || 0;
      note.textContent = n === 1 ? '1 sticker' : (n + ' stickers');
      if (btn) btn.disabled = n < 1;
    });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(preview, 300); }
  ['prFrom', 'prTo', 'prKind'].forEach(function (id) {
    var n = document.getElementById(id);
    if (!n) return;
    n.oninput = schedule;
    n.onchange = schedule;
  });
  var go = document.getElementById('prRangeGo');
  if (go) go.onclick = function () {
    if (go.disabled) return;
    var f = fields();
    go.disabled = true;
    enqueueBatch({ from: String(f.from).trim(), to: String(f.to).trim(), kind: f.kind }).then(function (r) {
      if (!r || r.ok === false) { toast((r && r.error) || 'Could not queue that range'); preview(); return; }
      toast('Queued ' + (r.queued || 0) + (r.skipped ? ' · ' + r.skipped + ' already waiting' : ''));
      refresh();
      if (anyUp()) kick();
      preview();
    });
  };
}
function markLocal(id, status, error) {
  if (!id) return;
  if (status === 'printed') state.done[id] = 1;
  var items = state.last && state.last.items;
  if (!items) return;
  for (var i = 0; i < items.length; i++) {
    if (items[i].print_id !== id) continue;
    if (status === 'printed' || status === 'cancelled') items.splice(i, 1);
    else { items[i].status = status; if (error) items[i].error = error; }
    break;
  }
  paint(state.last);
}
function markLater(id, mark, error, link) {
  callPrint('printMark', { print_id: id, mark: mark, device_id: devId(link), error: error || '' }).then(function (done) {
    if (mark === 'printed') markFailed(done, 'Printed, but the queue did not update');
    refresh();
  });
}
function stampClaim(id, link) {
  var mine = devId(link), now = new Date().toISOString(), items, i;
  if (state.last && state.last.items) {
    items = state.last.items;
    for (i = 0; i < items.length; i++) {
      if (items[i].print_id !== id) continue;
      items[i].device_id = mine;
      items[i].printed_at = now;
      break;
    }
  }
}
function claimAndPrint(item, link) {
  if (!item) return Promise.resolve();
  if (!link) link = linkFor(item.kind);
  if (!link || !link.connected) {
    toast(holdText(item.kind));
    return Promise.resolve();
  }
  var prep = prepareItem(item, link);
  var job = work(link, function () {
    if (!link.connected) { markPrinting(link, false); toast(holdText(item.kind)); return; }
    var id = item.print_id;
    var mine = devId(link);
    markPrinting(link, true);
    function stop() { markPrinting(link, false); }
    function finish(p) {
      return Promise.resolve(p).then(function (v) { stop(); return v; }, function (err) { stop(); throw err; });
    }
    function go(row) {
      toast('Printing…');
      return sendToPrinter(row, prep, link).then(function () {
        toast('Printed');
      }, function (err) {
        toast(failToast(err));
        throw err;
      });
    }
    if (!id) {
      logMs('claim', 0);
      return finish(go(item).catch(function () {}));
    }
    var tClaim = clock();
    return finish(callPrint('printMark', { print_id: id, mark: 'claim', device_id: mine }).then(function (r) {
      logMs('claim', clock() - tClaim);
      if (r && r.code === 'TAKEN') {
        state.cool[id] = Date.now() + 1500;
        return;
      }
      if (markFailed(r, 'Could not print that sticker')) {
        state.cool[id] = Date.now() + 5000;
        setTimeout(function () { if (wantsQueue()) kick(); }, 5000);
        return;
      }
      stampClaim(id, link);
      var printed = r.item ? Object.assign({}, item, r.item) : item;
      if (labelSig(printed, link) !== labelSig(item, link)) prep = prepareItem(printed, link);
      return go(printed).then(function () {
        markLocal(id, 'printed');
        markLater(id, 'printed', '', link);
      }).catch(function (err) {
        var why = failRow(err);
        markLocal(id, 'failed', why);
        return callPrint('printMark', { print_id: id, mark: 'failed', device_id: mine, error: why }).then(function (done) {
          markFailed(done, 'The sticker failed, and the queue did not update');
          refresh();
        });
      });
    }));
  });
  var done = Promise.resolve(job).then(function (v) { return v; }, function (err) {
    markPrinting(link, false);
    toast(failToast(err));
  });
  done.finally(function () {
    if (item && item.print_id) delete state.inflight[item.print_id];
    if (wantsQueue()) kick();
  });
  return done;
}
function stickerKey(kind, jo) { return String(kind || '') + '\n' + String(jo || ''); }
function newPrintId() {
  return 'pq-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}
function localItem(kind, jo, id, extra) {
  extra = extra || {};
  return {
    print_id: id, jo: jo, kind: kind, status: 'queued',
    due_date: extra.due_date || extra.due || '',
    date: extra.date || extra.given || '',
    current_stage: extra.current_stage || extra.stage || '',
    metal: extra.metal || '', karat: extra.karat || '',
    weight_g: extra.weight_g, weight: extra.weight,
    stone_type: extra.stone_type || extra.stone || '',
    stone_size: extra.stone_size || '', size: extra.size || '',
    price: extra.price, name: extra.name || '',
    description: extra.description || '',
    item_type: extra.item_type || extra.piece_type || '',
    type: extra.type || '',
    stones: extra.stones || '', grade: extra.grade || '',
    sku: extra.sku || extra.item_id || '',
    location: extra.location || ''
  };
}
/* A tap prints from the fields already on the page. The queue write is a log, with this print_id, and it does not hold the printer. */
function printJo(kind, jo, opts) {
  opts = opts || {};
  var reprint = opts.reprint !== false;
  var link = linkFor(kind);
  if (!link || !link.connected) {
    return callPrint('printEnqueue', { jo: jo, kind: kind, reprint: reprint }).then(function (r) {
      if (!r || r.ok === false) { toast((r && r.error) || 'Sticker did not print'); return r; }
      toast(holdText(kind));
      refresh();
      return r;
    }).catch(function () { toast('Sticker did not print'); });
  }
  var key = stickerKey(kind, jo);
  if (state.hot[key]) { toast('That sticker is already printing'); return Promise.resolve(); }
  var id = newPrintId();
  var item = localItem(kind, jo, id, opts.item);
  var tracked = [id];
  state.hot[key] = id;
  state.inflight[id] = 1;
  state.busy[id] = 1;
  var prep = prepareItem(item, link);
  var tEnq = clock();
  var logged = callPrint('printEnqueue', { jo: jo, kind: kind, reprint: reprint, print_id: id, device_id: devId(link) }).then(function (r) {
    logMs('enqueue', clock() - tEnq);
    var idOut = r && r.item && r.item.print_id;
    if (idOut && tracked.indexOf(idOut) < 0) {
      tracked.push(idOut);
      state.inflight[idOut] = 1;
      state.busy[idOut] = 1;
    }
    return r || { ok: false, error: 'Sticker did not print' };
  }, function () {
    logMs('enqueue', clock() - tEnq);
    return { ok: false, error: 'No connection' };
  });
  logMs('claim', 0, 'local');
  var printedOk = false, failWhy = '';
  var job = work(link, function () {
    if (!link.connected) { toast(holdText(kind)); return logged; }
    markPrinting(link, true);
    toast('Printing…');
    return sendToPrinter(item, prep, link).then(function () {
      printedOk = true;
      toast('Printed');
    }, function (err) {
      failWhy = failRow(err);
      toast(failToast(err));
    }).then(function () {
      return logged.then(function (r) {
        var idOut = (r && r.item && r.item.print_id) || id;
        if (!r || r.ok === false) {
          if (printedOk) toast('Printed, but the queue did not update');
          return r;
        }
        if (printedOk) {
          state.done[idOut] = 1;
          if (r.item && r.item.status && r.item.status !== 'queued' && r.item.status !== 'failed') return r;
          markLocal(idOut, 'printed');
          markLater(idOut, 'printed', '', link);
          return r;
        }
        if (!failWhy) return r;
        markLocal(idOut, 'failed', failWhy);
        return callPrint('printMark', { print_id: idOut, mark: 'failed', device_id: devId(link), error: failWhy }).then(function (done) {
          markFailed(done, 'The sticker failed, and the queue did not update');
          refresh();
          return r;
        });
      });
    }).then(function (v) { markPrinting(link, false); return v; }, function (err) { markPrinting(link, false); throw err; });
  });
  return Promise.resolve(job).then(function (v) { return v; }, function (err) {
    markPrinting(link, false);
    toast(failToast(err));
  }).finally(function () {
    delete state.hot[key];
    tracked.forEach(function (pid) {
      delete state.inflight[pid];
      delete state.busy[pid];
    });
    if (wantsQueue()) kick();
    pump();
  });
}
function printAgain(item) {
  if (!item) return;
  return callPrint('printMark', { print_id: item.print_id, mark: 'requeue', device_id: deviceId() }).then(function (r) {
    if (markFailed(r, 'Could not print that sticker')) return;
    var row = Object.assign({}, item, (r && r.item) || {});
    row.status = 'queued';
    row.error = '';
    if (!linkFor(row.kind || item.kind)) { toast(holdText(row.kind || item.kind)); refresh(); return; }
    return claimAndPrint(row);
  });
}
function printLocal(opts) {
  var item = Object.assign({}, opts || {});
  delete item.model; delete item.head; delete item.client;
  var link = (item.kind && linkFor(item.kind)) || (state.connected ? state : (peer.connected ? peer : null));
  if (!link || !link.connected) {
    toast(item.kind ? holdText(item.kind) : 'Connect a printer first');
    return Promise.resolve();
  }
  var job = work(link, function () {
    if (!link.connected) { toast(holdText(item.kind)); return; }
    markPrinting(link, true);
    toast('Printing…');
    logMs('claim', 0);
    return sendToPrinter(item, null, link).then(function () {
      toast('Printed');
    }, function (err) {
      toast(failToast(err));
    }).then(function () { markPrinting(link, false); }, function () { markPrinting(link, false); });
  });
  return Promise.resolve(job).then(function (v) { return v; }, function (err) {
    markPrinting(link, false);
    toast(failToast(err));
  });
}
/* The PNG is the label only (240 px wide), not the whole printhead, so the Niimbot app does not shrink it.
   A tag button only knows the JO, so its specs are read first (printQueue with jo is a read). The name is dropped. */
function download(kind, item) {
  if (!root.OYPLabel) return;
  item = Object.assign({}, item || {});
  delete item.client;
  var needSpecs = kind === 'jewelry_tag' && item.jo && !item.metal && !item.karat && !item.stone_type && !item.stone && !item.stones && !item.size && !item.weight_g && !item.weight && !item.price && !item.description && !item.name && !item.sku && !item.item_id && !item.location && !item.item_type;
  var ready = needSpecs ? callPrint('printQueue', { jo: item.jo }).then(function (r) {
    var spec = (r && r.ok && r.spec) || {};
    delete spec.client;
    return Object.assign({}, spec, item);
  }, function () { return item; }) : Promise.resolve(item);
  return ready.then(function (it) {
    return labelReady().then(function () { return it; });
  }).then(function (it) {
    var rendered = root.OYPLabel.render(labelOpts(it, kind));
    var full = root.OYPLabel.toCanvas(rendered);
    if (!full) return;
    var canvas = document.createElement('canvas');
    canvas.width = rendered.labelW; canvas.height = rendered.height;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(full, rendered.offsetX, 0, rendered.labelW, rendered.height, 0, 0, rendered.labelW, rendered.height);
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = (kind === 'jewelry_tag' ? 'tag-' : 'sticker-') + (rendered.qr || 'label') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  });
}
function cancel(id) {
  var it = itemById(id);
  return callPrint('printMark', { print_id: id, mark: 'cancelled', device_id: deviceId() }).then(function (r) {
    var failed = markFailed(r, 'Could not cancel that sticker');
    if (!failed && it && root.OYP && root.OYP.toastUndo) {
      root.OYP.toastUndo('Cancelled', function () {
        return callPrint('printEnqueue', { jo: it.jo, kind: it.kind, reprint: true }).then(function (back) {
          if (root.OYP && root.OYP.toast) root.OYP.toast(back && back.ok === false ? ((back && back.error) || 'Could not undo') : 'Back in the queue');
          refresh();
        });
      });
    }
    refresh();
  });
}
function reprint(item) {
  return printJo(item.kind, item.jo, { reprint: true, item: item });
}

function screenLabel(item) {
  if (root.OYP && root.OYP.piece) return root.OYP.piece(item.client, item.jo);
  var n = item.client ? String(item.client).trim() : '';
  var id = String(item.jo || '').trim();
  if (n && id) return esc(n) + ' · ' + esc(id);
  return esc(n || id);
}
function paint(r, fromServer) {
  if (fromServer && r && r.items) {
    var live = {};
    r.items.forEach(function (it) { live[it.print_id] = it.status; });
    Object.keys(state.done).forEach(function (id) {
      if (!live[id] || live[id] !== 'queued') delete state.done[id];
    });
    r.items = r.items.filter(function (it) { return !(state.done[it.print_id] && it.status === 'queued'); });
  }
  state.last = r;
  if (r && r.rev != null) state.rev = String(r.rev);
  document.querySelectorAll('[data-oyp-q]').forEach(function (el) {
    el.innerHTML = queueHtml(r);
    drawQueuePreviews(el, r);
    bindQueueSwipe(el);
  });
  primeQueue(r);
}
function paintFrom() { refresh(); }
function queueNote(r) {
  if (!r) return 'Loading the print queue…';
  if (r.ok) return '';
  var e = String(r.error || ''), code = String(r.code || '');
  if (code === 'OLD_BACKEND' || /missing jo|unknown action|not pasted|not been updated|not switched on|print queue is not/i.test(e)) return 'Print queue not set up yet';
  if (/no connection|internet/i.test(e)) return 'No connection. Check the internet and try again.';
  return 'The print queue could not be loaded. Try again in a moment.';
}
function rowError(raw) {
  var m = String(raw || '');
  if (!m) return '';
  if (/timeout waiting|timed out|waited for e4|did not respond/i.test(m)) return 'Printer did not respond';
  return m;
}
function slotKindText(link) {
  if (!knownModel(link.model)) return 'none';
  var saved = kinds(link), parts = [];
  if (printsKind('jo_card', link)) parts.push('JO card');
  if (printsKind('jewelry_tag', link)) parts.push('jewelry tag');
  var text = parts.length ? parts.join(' + ') : 'none';
  if (link.model === 'B31' && saved.jewelry_tag && !printsKind('jewelry_tag', link)) text += ' (saved jewelry tag ignored)';
  return text;
}
function slotDebugText() {
  return [state, peer].map(function (link, i) {
    var conn = link.reconnecting ? 'reconnecting' : (link.connected ? 'connected' : 'not connected');
    return 'Slot ' + (i + 1) + ': ' + (link.deviceName || 'no name') + ' · model ' + (link.model || 'none') + ' · ' + conn + ' · ' + slotKindText(link);
  }).join(' | ');
}
function slotDebugHtml() {
  return '<p class="oyp-slotdbg" data-oyp-slots>' + esc(slotDebugText()) + '</p><p class="muted" id="prBuild">print.js v' + PRINT_JS + '</p>';
}
function holdBanner(items) {
  var msgs = [], seen = {}, i, it, msg;
  items = items || [];
  for (i = 0; i < items.length; i++) {
    it = items[i];
    if (!it || it.status !== 'queued' || linkFor(it.kind)) continue;
    msg = holdText(it.kind);
    if (seen[msg]) continue;
    seen[msg] = 1;
    msgs.push(msg);
  }
  if (!msgs.length) return '';
  return '<p class="oyp-qhold" id="prHold">' + msgs.map(esc).join(' ') + '</p>';
}
function queueHtml(r) {
  var debug = slotDebugHtml();
  if (!r || !r.ok) return debug + '<p class="muted oyp-qempty">' + esc(queueNote(r)) + '</p>';
  var items = r.items || [];
  var banner = holdBanner(items);
  if (!items.length) return debug + banner + '<p class="muted oyp-qempty">No stickers waiting</p>';
  var dis = anyPrinting() ? ' disabled' : '';
  var held = 0;
  items.forEach(function (it) { if (it.status === 'queued' && !serverAuto(it.kind)) held += 1; });
  var drain = held ? '<div class="fbtns oyp-qbtns"><button type="button" class="pill sm" data-q="drain"' + dis + '>Print queued</button></div>' : '';
  return debug + banner + drain + items.map(function (it, i) {
    var kind = isTagKind(it.kind) ? 'Jewelry tag' : 'JO card';
    var failed = it.status === 'failed';
    var st = failed ? 'Failed' : 'Queued';
    var id = esc(it.print_id);
    var err = failed ? rowError(it.error) : (it.status === 'queued' && !linkFor(it.kind) ? holdText(it.kind) : '');
    var buttons = failed
      ? '<button type="button" class="pill sm" data-q="again" data-id="' + id + '"' + dis + '>PRINT</button><button type="button" class="pill sm outline" data-q="cancel" data-id="' + id + '"' + dis + '>CANCEL</button>'
      : '<button type="button" class="pill sm" data-q="now" data-id="' + id + '"' + dis + '>PRINT</button><button type="button" class="pill sm outline" data-q="reprint" data-id="' + id + '"' + dis + '>REPRINT</button><button type="button" class="pill sm outline" data-q="cancel" data-id="' + id + '"' + dis + '>CANCEL</button>';
    return '<div class="setp oyp-qrow" data-id="' + id + '" data-st="' + (failed ? 'failed' : 'queued') + '"><canvas class="oyp-qprev" data-qi="' + i + '" aria-label="' + esc(kind) + ' preview"></canvas><div class="setl oyp-qmain"><b class="cn">' + screenLabel(it) + '</b><span class="kf"><span class="chip">' + esc(kind) + '</span><span class="chip">' + esc(st) + '</span></span>'
      + (err ? '<span class="muted oyp-qerr">' + esc(err) + '</span>' : '')
      + '</div><div class="fbtns oyp-qbtns">' + buttons + '</div></div>';
  }).join('');
}
function bindQueueSwipe(el) {
  if (!el || !root.OYP || !root.OYP.swipe) return;
  root.OYP.swipe(el, {
    item: '.oyp-qrow',
    ignore: 'canvas, .oyp-qbtns',
    actions: function (row) {
      var id = row.getAttribute('data-id');
      var acts = [];
      if (row.getAttribute('data-st') === 'failed') acts.push({ label: 'Reprint', attrs: { 'data-q': 'reprint', 'data-id': id } });
      acts.push({ label: 'Cancel', undoable: true, attrs: { 'data-q': 'cancel', 'data-id': id } });
      return acts;
    }
  });
}
function drawQueuePreviews(el, r) {
  if (!el || !r || !r.ok || !root.OYPLabel) return;
  var go = function () {
    var items = r.items || [];
    el.querySelectorAll('.oyp-qprev').forEach(function (slot) {
      var it = items[slot.getAttribute('data-qi') | 0];
      if (!it) return;
      try {
        var view = root.OYPLabel.preview(root.OYPLabel.render(labelOpts(it)), { scale: 4, smooth: true });
        view.canvas.className = 'oyp-qprev';
        view.canvas.setAttribute('aria-label', slot.getAttribute('aria-label') || 'Sticker preview');
        slot.replaceWith(view.canvas);
      } catch (e) {}
    });
  };
  if (root.OYPLabel.ready && root.OYPLabel.ready.then) root.OYPLabel.ready.then(go);
  else go();
}
function refresh(opts) {
  opts = opts || {};
  var data = opts.brief ? { brief: 1 } : {};
  return callPrint('printQueue', data).then(function (r) {
    if (!r) return null;
    noteAuto(r);
    if (r.brief === true) {
      state.briefOk = true;
      if (r.rev == null) state.briefOk = false;
      return r;
    }
    if (opts.brief && r.items) state.briefOk = false;
    paint(r, true);
    return r;
  }).catch(function () { return null; });
}
function itemById(id) {
  var items = (state.last && state.last.items) || [];
  for (var i = 0; i < items.length; i++) if (items[i].print_id === id) return items[i];
  return null;
}
function onQueueClick(e) {
  var b = e.target.closest('[data-q]'); if (!b || b.disabled || anyPrinting()) return;
  if (b.getAttribute('data-q') === 'drain') { printQueued(); return; }
  var it = itemById(b.getAttribute('data-id')); if (!it) return;
  var q = b.getAttribute('data-q');
  if (q === 'cancel') cancel(it.print_id);
  else if (q === 'again') printAgain(it);
  else if (q === 'reprint') reprint(it);
  else claimAndPrint(it);
}

function isFinal(req, res) {
  if (res && (res.final === true || res.final_step === true)) return true;
  var d = String((res && (res.to || res.stage_code || res.col)) || (req && req.to) || '').toLowerCase();
  return d === 'pickup' || d === 'notify' || d === 'for_pickup';
}
function afterOk(req, res) {
  if (!res || res.ok === false) return;
  var kind = '', jo = req.jo;
  /* A scan is queued only by Code.gs. Watching the upload here queued a second JO card and ignored printJo and printTag. */
  if (req.action === 'prodMove' && isFinal(req, res)) kind = 'jewelry_tag';
  if (!kind || !jo) return;
  var will = serverAuto(kind) && !!linkFor(kind);
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
    if (raw.indexOf('"prodMove"') < 0) return p; // a scan is queued by the server; only a Pickup move still prints from this page
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

function nextLocal(link) {
  link = link || state;
  var items = (state.last && state.last.items) || [], now = Date.now(), i, it;
  for (i = 0; i < items.length; i++) {
    it = items[i];
    if (!it || it.status !== 'queued' || linkFor(it.kind) !== link) continue;
    if (!state.printQueued && !serverAuto(it.kind)) continue;
    if (state.hot[stickerKey(it.kind, it.jo)] || state.inflight[it.print_id] || state.done[it.print_id] || state.busy[it.print_id]) continue;
    if (state.cool[it.print_id] && state.cool[it.print_id] > now) continue;
    if (!claimFresh(it, now, link)) continue;
    return it;
  }
  return null;
}
function kickOne(link) {
  if (!link.connected || link.printing || !wantsQueue()) return false;
  var next = nextLocal(link);
  if (!next) return false;
  state.inflight[next.print_id] = 1;
  state.busy[next.print_id] = 1;
  link.printing = true;
  claimAndPrint(next, link).finally(function () { delete state.busy[next.print_id]; });
  return true;
}
function kick() {
  if (!wantsQueue()) return;
  var started = kickOne(state);
  if (kickOne(peer)) started = true;
  noteHeld();
  if (!started && !anyPrinting()) state.printQueued = false;
}
function pump() {
  if (!anyUp() || state.pumping) return;
  state.pumping = true;
  refresh().then(function (r) {
    if (!r || !wantsQueue()) return;
    kick();
  }).finally(function () { state.pumping = false; });
}
/* On screen, every 1s asks only for the rev. A hidden tab checks every 5th tick. A server without that cheap answer falls back to a full read every 3rd tick that actually runs. */
function pollTick() {
  /* The library heartbeat is what keeps an idle printer from dropping the link. */
  if (state.connected) beat(state);
  if (peer.connected) beat(peer);
  if (!anyUp() || state.pumping) return;
  state.ticks = (state.ticks || 0) + 1;
  if (!pageVisible() && state.ticks % 5 !== 0) return;
  if (state.briefOk === false) {
    if (state.ticks % 3 !== 0) return;
    pump();
    return;
  }
  state.pumping = true;
  refresh({ brief: true }).then(function (r) {
    state.pumping = false;
    if (!r) return;
    if (r.brief !== true) {
      if (wantsQueue()) kick();
      return;
    }
    if (r.rev == null || String(r.rev) !== String(state.rev == null ? '' : state.rev)) pump();
  }, function () { state.pumping = false; });
}
function startPoll() {
  if (state.timer || state.worker) return;
  var WorkerFn = root.Worker, BlobFn = root.Blob, URLFn = root.URL, started = false;
  try {
    if (typeof WorkerFn === 'function' && typeof BlobFn === 'function' && URLFn && typeof URLFn.createObjectURL === 'function') {
      var blob = new BlobFn(['setInterval(function(){postMessage(1)},' + POLL + ')'], { type: 'text/javascript' });
      state.workerUrl = URLFn.createObjectURL(blob);
      state.worker = new WorkerFn(state.workerUrl);
      state.worker.onmessage = function () { pollTick(); };
      started = true;
    }
  } catch (e) { started = false; }
  if (!started) {
    if (state.worker) { try { state.worker.terminate(); } catch (e2) {} }
    state.worker = null;
    if (state.workerUrl && URLFn && typeof URLFn.revokeObjectURL === 'function') { try { URLFn.revokeObjectURL(state.workerUrl); } catch (e3) {} }
    state.workerUrl = '';
    if (!state.timer) state.timer = setInterval(pollTick, POLL);
  }
}
function stopPoll() {
  if (state.timer) { clearInterval(state.timer); state.timer = 0; }
  if (state.worker) { try { state.worker.terminate(); } catch (e) {} state.worker = null; }
  if (state.workerUrl && root.URL && typeof root.URL.revokeObjectURL === 'function') { try { root.URL.revokeObjectURL(state.workerUrl); } catch (e2) {} }
  state.workerUrl = '';
}

function beat(link) {
  var c = link && link.client;
  if (!c || !link.connected) return;
  /* Already running. Starting again would reset the failure count and hide a dead radio. */
  if (c.heartbeatTimer) return;
  logMs('link heartbeat', 0, 'start ' + (link.deviceName || link.model || ''));
  /* niimbluelib also starts this on its own connect event. Calling it here covers a client that did not. */
  if (c.startHeartbeat) c.startHeartbeat();
  else if (c.setHeartbeatAutoStart) c.setHeartbeatAutoStart(true);
}
function otherLink(link) { return link === peer ? state : peer; }
function saveLinks() {
  var cfg = load();
  cfg.links = [slotSnap(state), slotSnap(peer)];
  cfg.model = state.model || peer.model || cfg.model || '';
  cfg.transport = state.transport || peer.transport || cfg.transport || '';
  cfg.kinds = null;
  save(cfg);
}
function slotSnap(link) {
  if (!link.model && !link.transport && !link.btId) return null;
  var keep = !!(link.expected || link.connected || link.reconnecting);
  return { transport: keep ? (link.transport || '') : '', btId: keep ? (link.btId || '') : '', model: link.model || '' };
}
function rememberBle(link) {
  var bt = root.navigator && navigator.bluetooth;
  if (!bt || typeof bt.getDevices !== 'function') return Promise.resolve();
  return Promise.resolve(bt.getDevices()).then(function (list) {
    list = list || [];
    var used = otherLink(link).btId, i, d, fallback = '';
    if (link.btId) {
      for (i = 0; i < list.length; i++) if (list[i] && list[i].id === link.btId) { saveLinks(); return; }
    }
    for (i = 0; i < list.length; i++) {
      d = list[i];
      if (!d || !d.id || d.id === used) continue;
      if (d.gatt && d.gatt.connected) { link.btId = d.id; saveLinks(); return; }
      if (!fallback) fallback = d.id;
    }
    if (!link.btId && list.length === 1 && list[0] && list[0].id && list[0].id !== used) link.btId = list[0].id;
    else if (!link.btId && fallback) link.btId = fallback;
    saveLinks();
  }).catch(function () {});
}
function watchLink(link, client) {
  if (!client || !client.on || client.__oypWatch) return;
  client.__oypWatch = true;
  client.on('disconnect', function () {
    if (link.client !== client) return;
    onLinkDown(link);
  });
}
function onConnected(link, transport) {
  var announce = !!link.opening;
  var quiet = !!link.auto;
  link.opening = false;
  link.auto = false;
  link.away = false;
  var meta = (link.client && link.client.getModelMetadata && link.client.getModelMetadata()) || {};
  var named = modelFromName(link.deviceName);
  var reported = knownModel(meta.model);
  /* The Bluetooth name decides which kinds this link prints. Print mode and a saved model do not. */
  var fromName = modelFromName(link.deviceName);
  link.model = fromName || detectModel('', meta, link.model);
  if (named && reported && named !== reported) link.head = named === 'B31' ? 600 : 384;
  else link.head = meta.printheadPixels || link.head || (link.model === 'B31' ? 600 : link.model === 'B1' ? 384 : 0);
  link.dir = meta.printDirection || link.dir || 'top';
  link.transport = transport;
  link.connected = true;
  link.expected = true;
  link.reconnecting = false;
  link.userDisconnect = false;
  var cfg = load();
  cfg.transport = state.transport || transport;
  cfg.model = state.model || link.model || cfg.model;
  if (!cfg.kindsByModel || typeof cfg.kindsByModel !== 'object') cfg.kindsByModel = {};
  if (link.model && !cfg.kindsByModel[link.model]) cfg.kindsByModel[link.model] = defaultKinds(link.model);
  cfg.kinds = null;
  cfg.links = [slotSnap(state), slotSnap(peer)];
  save(cfg);
  beat(link);
  rememberBle(link);
  drawChip();
  if (state.autoTries) {
    if (link.btId) delete state.autoTries[link.btId];
    delete state.autoTries['serial-' + slotIndex(link)];
  }
  clearAutoTimer(link.btId);
  clearAutoTimer('serial-' + slotIndex(link));
  refreshAutoNote();
  if (quiet) toast((link.model || 'Printer') + ' reconnected');
  else if (announce) toast((link.model || 'Printer') + ' connected.');
  startPoll();
  pump();
}
function connectOpts(device) {
  if (!device) return undefined;
  if (device.authorizedPort) return { authorizedPort: device.authorizedPort };
  if (device.authorizedDevice) return { authorizedDevice: device.authorizedDevice };
  return { authorizedDevice: device };
}
function begin(link, transport, device, token) {
  if (!liveAttempt(link, token)) return Promise.resolve();
  var L = lib();
  var client = transport === 'serial' ? new L.NiimbotSerialClient() : new L.NiimbotBluetoothClient();
  link.client = client;
  link.transport = transport;
  if (device) link.gattDevice = device;
  if (device && device.name) link.deviceName = device.name;
  watchLink(link, client);
  var who = (device && (device.name || device.id)) || transport || '';
  var p = Promise.resolve(client.connect(connectOpts(device))).then(function (info) {
    if (!liveAttempt(link, token) || link.client !== client) {
      dropGatt(device);
      if (client.disconnect) Promise.resolve(client.disconnect()).catch(function () {});
      return;
    }
    var named = info && (info.deviceName || info.name);
    if (named) link.deviceName = named;
    onConnected(link, transport);
  });
  return step(link, 'begin', p, LINK_MS, who);
}
function connectSlot(i, transport, device) {
  var L = lib();
  var link = i === 1 ? peer : state;
  if (!L) { toast('Printer library is not loaded'); return; }
  if (transport === 'bluetooth' && !canBt()) { toast('Bluetooth printing needs Chrome or Edge'); return; }
  if (transport === 'serial' && !canSerial()) { toast('USB printing needs Chrome or Edge on a computer'); return; }
  var prev = link.client;
  abortAttempt(link);
  link.userDisconnect = false;
  link.expected = true;
  link.opening = true;
  link.connected = false;
  var token = freshAttempt(link);
  if (device) link.gattDevice = device;
  if (prev && prev !== link.client && prev.disconnect) Promise.resolve(prev.disconnect()).catch(function () {});
  begin(link, transport, device, token).catch(function (err) {
    if (err && err.quiet === 'cancel') return;
    var c = abortAttempt(link, token);
    if (c === false) return;
    if (c && c.disconnect) Promise.resolve(c.disconnect()).catch(function () {});
    link.connected = false;
    drawChip();
    var name = err && err.name;
    if (name === 'NotFoundError' || name === 'AbortError') return;
    toast('Could not connect');
  });
  drawChip();
}
function connect(transport) { connectSlot(0, transport); }
function connectFree(transport) {
  var list = [state, peer], i;
  for (i = 0; i < list.length; i++) {
    if (!list[i].connected && !list[i].reconnecting) { connectSlot(i, transport); return; }
  }
  connectSlot(0, transport);
}
function disconnect(link) {
  if (!link || typeof link !== 'object') link = state;
  var c = link.client;
  link.userDisconnect = true;
  abortAttempt(link);
  link.userDisconnect = true;
  link.connected = false;
  link.expected = false;
  link.printing = false;
  link.away = false;
  clearAutoTimer(link.btId);
  clearAutoTimer('serial-' + slotIndex(link));
  if (state.autoTries) {
    delete state.autoTries[link.btId];
    delete state.autoTries['serial-' + slotIndex(link)];
  }
  if (state.autoModel) delete state.autoModel[link.btId];
  link.btId = '';
  refreshAutoNote();
  saveLinks();
  if (!anyUp()) stopPoll();
  drawChip();
  if (!c || !c.disconnect) { link.userDisconnect = false; return; }
  Promise.resolve(c.disconnect()).catch(function () {}).then(function () {
    link.userDisconnect = false;
    drawChip();
  });
}
function disconnectShown() {
  [state, peer].forEach(function (link) {
    if (link.connected || link.reconnecting) disconnect(link);
  });
}
function tellDown() {
  if (state.toldDown) return;
  state.toldDown = true;
  toast('Printer disconnected. Tap Printer to reconnect');
  setTimeout(function () { state.toldDown = false; }, 2500);
}
/* A failed page does not close the link. The library does, after five missed heartbeats, and the printer can also drop GATT while idle. */
function onLinkDown(link) {
  link = link || state;
  link.connected = false;
  link.printing = false;
  if (!anyUp()) stopPoll();
  if (link.userDisconnect) {
    link.userDisconnect = false;
    link.client = null;
    link.reconnecting = false;
    drawChip();
    return;
  }
  var now = Date.now();
  link.linkBurst = link.linkDownAt && (now - link.linkDownAt) < 8000 ? link.linkBurst + 1 : 1;
  link.linkDownAt = now;
  if (grantedName(link.deviceName) && canGetDevices()) {
    link.client = null;
    link.reconnecting = false;
    grantReconnect();
    drawChip();
    return;
  }
  if (link.linkBurst > 3) {
    link.client = null;
    link.reconnecting = false;
    tellDown();
    drawChip();
    return;
  }
  if (link.transport === 'serial') { quietSerial(link); return; }
  if (link.transport !== 'bluetooth') {
    link.client = null;
    link.reconnecting = false;
    tellDown();
    drawChip();
    return;
  }
  quietReconnect(link);
}
function releaseClient(c) {
  if (c && c.disconnect) Promise.resolve(c.disconnect()).catch(function () {});
}
function noteFail(link, token, id, model) {
  var c = abortAttempt(link, token);
  if (c === false) return;
  releaseClient(c);
  link.connected = false;
  link.away = true;
  if (!id) { drawChip(); return; }
  autoMaps();
  state.autoTries[id] = (state.autoTries[id] || 0) + 1;
  if (model) state.autoModel[id] = model;
  clearAutoTimer(id);
  refreshAutoNote();
  scheduleAuto(id);
  logMs('link retry', autoDelay(state.autoTries[id] || 1), id);
}
function quietReconnect(link) {
  link = link || state;
  var bt = root.navigator && navigator.bluetooth;
  if (link.reconnecting) return;
  if (!bt || typeof bt.getDevices !== 'function' || !link.btId) {
    link.client = null;
    tellDown();
    drawChip();
    return;
  }
  var token = freshAttempt(link);
  var id = link.btId;
  var model = link.model || grantedName(link.deviceName) || '';
  link.reconnecting = true;
  link.opening = false;
  link.auto = true;
  drawChip();
  logMs('link quietReconnect start', 0, id);
  Promise.resolve(bt.getDevices()).then(function (list) {
    if (!liveAttempt(link, token)) return;
    var device = null, i;
    list = list || [];
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === id) device = list[i];
    if (!device || !device.gatt || typeof device.gatt.connect !== 'function') {
      var missing = new Error('no device');
      missing.quiet = 'missing';
      throw missing;
    }
    link.gattDevice = device;
    return watchDevice(link, device, token).then(function () {
      if (!liveAttempt(link, token)) return;
      return step(link, 'gatt.connect', device.gatt.connect(), LINK_MS, device.name || id);
    }).then(function () {
      if (!liveAttempt(link, token)) return;
      return begin(link, 'bluetooth', device, token);
    });
  }).catch(function (err) {
    if (!liveAttempt(link, token)) return;
    if (err && err.quiet === 'missing') {
      abortAttempt(link, token);
      tellDown();
      drawChip();
      return;
    }
    noteFail(link, token, id, model);
  });
}
function scheduleSerial(link) {
  var id = 'serial-' + slotIndex(link);
  autoMaps();
  if (state.autoTimers[id]) return;
  if (!pageVisible()) { state.autoHold = true; return; }
  var wait = autoDelay(state.autoTries[id] || 1);
  logMs('link retry', wait, id);
  state.autoTimers[id] = setTimeout(function () {
    delete state.autoTimers[id];
    if (!pageVisible()) { state.autoHold = true; return; }
    if (link.connected || link.reconnecting) return;
    quietSerial(link);
  }, wait);
}
function quietSerial(link) {
  var serial = root.navigator && navigator.serial;
  if (link.reconnecting) return;
  if (!serial || typeof serial.getPorts !== 'function') {
    link.client = null;
    tellDown();
    drawChip();
    return;
  }
  var token = freshAttempt(link);
  var id = 'serial-' + slotIndex(link);
  link.reconnecting = true;
  link.opening = false;
  link.auto = true;
  drawChip();
  logMs('link quietSerial start', 0, id);
  Promise.resolve(serial.getPorts()).then(function (ports) {
    if (!liveAttempt(link, token)) return;
    ports = ports || [];
    var port = ports[slotIndex(link)];
    if (!port) port = ports[0];
    if (!port) {
      var missing = new Error('no port');
      missing.quiet = 'missing';
      throw missing;
    }
    return begin(link, 'serial', { authorizedPort: port }, token);
  }).catch(function (err) {
    if (!liveAttempt(link, token)) return;
    if (err && err.quiet === 'missing') {
      abortAttempt(link, token);
      tellDown();
      drawChip();
      return;
    }
    var c = abortAttempt(link, token);
    if (c === false) return;
    releaseClient(c);
    link.connected = false;
    link.away = true;
    autoMaps();
    state.autoTries[id] = (state.autoTries[id] || 0) + 1;
    if (link.model) state.autoModel[id] = link.model;
    clearAutoTimer(id);
    refreshAutoNote();
    scheduleSerial(link);
  });
}
/* Granted Bluetooth devices are named B1-… or B31-…. The Chrome flag is what makes getDevices return them. */
function grantedName(name) {
  var s = String(name || '').toUpperCase();
  if (/(?:^|[^A-Z0-9])B31-/.test(s)) return 'B31';
  if (/(?:^|[^A-Z0-9])B1-/.test(s)) return 'B1';
  return '';
}
function canGetDevices() {
  var bt = root.navigator && navigator.bluetooth;
  return !!(bt && typeof bt.getDevices === 'function');
}
function pageVisible() {
  return !document.visibilityState || document.visibilityState === 'visible';
}
function autoMaps() {
  if (!state.autoTries) state.autoTries = {};
  if (!state.autoTimers) state.autoTimers = {};
  if (!state.autoModel) state.autoModel = {};
  if (!state.autoBusy) state.autoBusy = {};
}
function autoDelay(fails) {
  if (fails <= 1) return 3000;
  if (fails === 2) return 10000;
  if (fails === 3) return 30000;
  return 60000;
}
function refreshAutoNote() {
  autoMaps();
  var names = [], id, model;
  for (id in state.autoTries) if (state.autoTries[id]) {
    model = state.autoModel[id] || '';
    if (model && names.indexOf(model) < 0) names.push(model);
  }
  state.autoNote = names.length ? names.join(' and ') + (names.length > 1 ? ' are' : ' is') + ' off or out of range' : '';
  drawChip();
}
function deviceBusy(device) {
  var id = device && device.id || '';
  var list = [state, peer], i, link;
  if (!id) return false;
  if (state.autoBusy && state.autoBusy[id]) return true;
  for (i = 0; i < list.length; i++) {
    link = list[i];
    if (link.btId === id && (link.connected || link.reconnecting || link.opening)) return true;
  }
  return false;
}
function slotFor(device) {
  var id = device && device.id || '';
  var list = [state, peer], i, link;
  for (i = 0; i < list.length; i++) {
    link = list[i];
    if (id && link.btId === id) {
      if (link.connected || link.reconnecting || link.opening) return null;
      return link;
    }
  }
  for (i = 0; i < list.length; i++) {
    link = list[i];
    if (link.connected || link.reconnecting || link.opening || link.btId) continue;
    return link;
  }
  return null;
}
function clearAutoTimer(id) {
  autoMaps();
  if (!id || !state.autoTimers[id]) return;
  clearTimeout(state.autoTimers[id]);
  delete state.autoTimers[id];
}
function scheduleAuto(id) {
  autoMaps();
  if (!id || state.autoTimers[id]) return;
  if (!pageVisible()) { state.autoHold = true; return; }
  var wait = autoDelay(state.autoTries[id] || 1);
  state.autoTimers[id] = setTimeout(function () {
    delete state.autoTimers[id];
    if (!pageVisible()) { state.autoHold = true; return; }
    grantReconnect(true);
  }, wait);
}
function reachDevice(link, device, token) {
  var who = (device && (device.name || device.id)) || '';
  return watchDevice(link, device, token).then(function () {
    if (!liveAttempt(link, token)) return;
    if (!device.gatt || typeof device.gatt.connect !== 'function') throw new Error('no gatt');
    return step(link, 'gatt.connect', device.gatt.connect(), LINK_MS, who);
  });
}
function attachGranted(device) {
  var id = device && device.id || '';
  var link = slotFor(device);
  var model = grantedName(device && device.name);
  if (!link || !model) return Promise.resolve();
  autoMaps();
  state.autoBusy[id] = 1;
  clearAutoTimer(id);
  var token = freshAttempt(link);
  link.reconnecting = true;
  link.opening = false;
  link.auto = true;
  link.away = false;
  link.expected = true;
  link.transport = 'bluetooth';
  link.btId = id || link.btId;
  link.deviceName = device.name || link.deviceName || '';
  link.model = model;
  link.gattDevice = device;
  drawChip();
  logMs('link attach start', 0, device.name || id);
  return reachDevice(link, device, token).then(function () {
    if (!liveAttempt(link, token)) return;
    return begin(link, 'bluetooth', device, token);
  }).then(function () {
    if (!liveAttempt(link, token)) return;
    delete state.autoBusy[id];
    link.away = false;
  }, function (err) {
    if (err && err.quiet === 'cancel') return;
    noteFail(link, token, id, model);
  });
}
/* Previously approved printers, without the pairing chooser. One try on load, then 3s, 10s, 30s, and every 60s while the page is visible. A stuck attempt does not hold the other slot. */
function grantReconnect(fromTimer) {
  if (!canGetDevices()) return;
  if (fromTimer && !pageVisible()) { state.autoHold = true; return; }
  state.autoHold = false;
  Promise.resolve(navigator.bluetooth.getDevices()).then(function (list) {
    var jobs = [], seen = {}, i, dev, id;
    list = list || [];
    for (i = 0; i < list.length; i++) {
      dev = list[i];
      if (!dev || !grantedName(dev.name)) continue;
      id = dev.id || dev.name;
      if (seen[id] || deviceBusy(dev)) continue;
      seen[id] = 1;
      jobs.push(attachGranted(dev));
    }
    return Promise.all(jobs);
  }).catch(function () {});
}
function retrySlot(link) {
  var c = abortAttempt(link);
  releaseClient(c);
  link.userDisconnect = false;
  link.away = false;
  link.connected = false;
  link.expected = true;
  link.printing = false;
  if (link.btId) {
    autoMaps();
    clearAutoTimer(link.btId);
    delete state.autoTries[link.btId];
    delete state.autoModel[link.btId];
  }
  clearAutoTimer('serial-' + slotIndex(link));
  if (state.autoTries) delete state.autoTries['serial-' + slotIndex(link)];
  refreshAutoNote();
  logMs('link retry tap', 0, link.deviceName || link.btId || String(slotIndex(link)));
  drawChip();
  if (link.transport === 'serial') { quietSerial(link); return; }
  if (canGetDevices() && (link.btId || grantedName(link.deviceName))) { grantReconnect(); return; }
  connectSlot(slotIndex(link), 'bluetooth');
}
function restoreLinks() {
  var cfg = load(), i, saved, link;
  for (i = 0; i < 2; i++) {
    saved = cfg.links[i];
    link = i === 1 ? peer : state;
    if (!saved || (!saved.model && !saved.transport)) continue;
    link.model = saved.model || link.model || '';
    link.btId = saved.btId || '';
    link.transport = saved.transport || '';
    if (!saved.transport) continue;
    link.expected = true;
    if (saved.transport === 'serial') quietSerial(link);
    else quietReconnect(link);
  }
  paintDots();
}

function chipText() {
  if (state.connected) return state.model || 'Printer';
  return 'Printer';
}
function connectNote() {
  if (ios()) return "iPad can't connect a printer. Stickers wait in the print queue.";
  return 'Open in Chrome or Edge to connect a printer';
}
function knownLinks() {
  return [state, peer].filter(function (link) { return !!link.model; });
}
function printerMarks() {
  var links = knownLinks();
  if (!links.length) return '<span class="oyp-pr-dot" aria-hidden="true"></span>';
  return '<span class="oyp-pr-status">' + links.map(function (link) {
    var on = link.connected && !link.reconnecting;
    return '<span class="oyp-pr-pair"><span class="oyp-pr-name">' + esc(link.model) + '</span><span class="oyp-pr-dot' + (on ? ' on' : '') + '" aria-hidden="true"></span></span>';
  }).join('') + '</span>';
}
function paintDots() {
  if (paintDots.busy) return;
  paintDots.busy = true;
  try {
    var links = knownLinks();
    var up = 0, i;
    for (i = 0; i < links.length; i++) if (links[i].connected && !links[i].reconnecting) up += 1;
    var title = 'Printer not connected';
    if (anyPrinting()) title = 'Printing';
    else if (state.reconnecting || peer.reconnecting) title = 'Reconnecting';
    else if (state.autoNote) title = state.autoNote;
    else if (links.length && up === links.length) title = 'Printer connected';
    else if (up) title = 'A printer is not connected';
    var html = 'Printer' + printerMarks();
    document.querySelectorAll('[data-oyp-printer]').forEach(function (el) {
      if (el.getAttribute('data-paint') !== html) {
        el.setAttribute('data-paint', html);
        el.innerHTML = html;
      }
      if (el.title !== title) el.title = title;
    });
    paintLinks();
    var sig = slotDebugText();
    if (paintDots.sig !== sig) {
      paintDots.sig = sig;
      if (state.last) paint(state.last);
    }
  } finally {
    paintDots.busy = false;
  }
}
function paintOneAuto(id, kind) {
  var box = document.getElementById(id);
  if (!box) return;
  var on = serverAuto(kind);
  box.checked = on;
  var spans = box.parentNode ? box.parentNode.querySelectorAll('span') : [];
  for (var i = 0; i < spans.length; i++) if (spans[i].textContent === 'On' || spans[i].textContent === 'Off') spans[i].textContent = on ? 'On' : 'Off';
}
function paintAuto() {
  paintOneAuto('prHeadJo', 'jo_card');
  paintOneAuto('prHeadTag', 'jewelry_tag');
  paintOneAuto('prAutoJo', 'jo_card');
  paintOneAuto('prAutoTag', 'jewelry_tag');
}
function setAuto(kind, on) {
  var prev = state.auto ? { jo_card: state.auto.jo_card !== false, jewelry_tag: state.auto.jewelry_tag !== false } : { jo_card: serverAuto('jo_card'), jewelry_tag: serverAuto('jewelry_tag') };
  state.auto = { jo_card: prev.jo_card, jewelry_tag: prev.jewelry_tag };
  state.auto[kind] = !!on;
  paintAuto();
  callPrint('printAutoSet', { kind: kind, on: on ? 1 : 0 }).then(function (r) {
    if (!r || r.ok === false || !r.auto) {
      state.auto = prev;
      paintAuto();
      toast((r && r.error) || 'Could not save auto-print');
      return;
    }
    state.auto = autoFrom(r.auto);
    var cfg = load();
    cfg.autoKinds = state.auto;
    save(cfg);
    if (r.rev != null) state.rev = String(r.rev);
    paintAuto();
    if (state.auto[kind]) kick();
  });
}
function ensurePrinterMenu() {
  var menu = document.getElementById('oypPrMenu');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = 'oypPrMenu';
  menu.className = 'whomenu oyp-pr-menu hidden';
  menu.setAttribute('role', 'menu');
  document.body.appendChild(menu);
  return menu;
}
function placePrinterMenu(menu, anchor) {
  if (!anchor || !anchor.getBoundingClientRect) return;
  var r = anchor.getBoundingClientRect();
  var wide = Math.min(280, (root.innerWidth || 360) - 16);
  var inSide = !!(anchor.closest && anchor.closest('.side'));
  var top = inSide ? r.top : r.bottom + 4;
  var left = inSide ? r.right + 8 : r.left;
  var limit = root.innerWidth || 360;
  if (left + wide > limit - 8) left = Math.max(8, limit - wide - 8);
  var height = root.innerHeight || 700;
  if (top + 280 > height - 8) top = Math.max(8, height - 288);
  menu.style.top = Math.max(8, top) + 'px';
  menu.style.left = Math.max(8, left) + 'px';
}
function fillPrinterMenu() {
  var menu = ensurePrinterMenu();
  var bits = [];
  var names = knownLinks().map(function (link) { return link.model; }).filter(Boolean);
  var free = [state, peer].some(function (link) { return !link.connected && !link.reconnecting; });
  bits.push('<label class="settog"><span class="oyp-k">JO sticker</span><input type="checkbox" id="prHeadJo"' + (serverAuto('jo_card') ? ' checked' : '') + '><span>' + (serverAuto('jo_card') ? 'On' : 'Off') + '</span></label>');
  bits.push('<label class="settog"><span class="oyp-k">Jewelry tag</span><input type="checkbox" id="prHeadTag"' + (serverAuto('jewelry_tag') ? ' checked' : '') + '><span>' + (serverAuto('jewelry_tag') ? 'On' : 'Off') + '</span></label>');
  if (names.length) bits.push('<p class="muted oyp-pr-note">' + esc(names.join(' · ')) + '</p>');
  if (!canBt() && !canSerial()) bits.push('<p class="muted oyp-pr-note" role="note">' + esc(connectNote()) + '</p>');
  else {
    if (free && canBt()) bits.push('<button type="button" data-pr="bluetooth">Connect by Bluetooth</button>');
    if (free && canSerial()) bits.push('<button type="button" data-pr="serial">Connect by USB</button>');
    if (anyUp()) bits.push('<button type="button" data-pr="disconnect">Disconnect</button>');
  }
  bits.push('<button type="button" data-pr="queue">Print queue</button>');
  menu.innerHTML = bits.join('');
  ['prHeadJo', 'prHeadTag'].forEach(function (id) {
    var box = document.getElementById(id);
    if (box) box.addEventListener('change', function () { setAuto(id === 'prHeadJo' ? 'jo_card' : 'jewelry_tag', box.checked); });
  });
}
function drawChip() {
  paintDots();
  if (!isScannerPage()) return;
  var slot = document.getElementById('printChip');
  if (!slot) {
    var top = document.querySelector('header.top');
    if (!top) return;
    slot = document.createElement('span');
    slot.id = 'printChip';
    slot.className = 'oyp-pr-slot';
    var logo = top.querySelector('img.logo');
    var end = top.querySelector('.topend');
    if (logo && logo.parentNode) logo.parentNode.insertBefore(slot, logo);
    else if (end) end.appendChild(slot);
    else top.appendChild(slot);
  }
  var on = anyUp();
  slot.innerHTML = '<span class="oyp-pr"><button type="button" class="pill sm' + (on ? '' : ' outline') + '" id="oypPrBtn" aria-haspopup="menu" aria-expanded="false">' + esc(chipText().toUpperCase()) + '</button></span>';
}
function toggleMenu(force, anchor) {
  var menu = ensurePrinterMenu();
  var show = force != null ? force : menu.classList.contains('hidden');
  if (show) {
    fillPrinterMenu();
    placePrinterMenu(menu, anchor || document.getElementById('oypPrBtn'));
  }
  menu.classList.toggle('hidden', !show);
  var btn = document.getElementById('oypPrBtn');
  if (btn) btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show && btn && (!anchor || anchor === btn)) {
    state.armUntil = Date.now() + 400;
    state.armBox = btn.getBoundingClientRect();
  } else if (!show) {
    state.armUntil = 0;
    state.armBox = null;
    state.printerEl = null;
  }
}
function armedAt(e) {
  var b = state.armBox;
  if (!b || Date.now() >= state.armUntil) return false;
  return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
}
function panelEl() { return document.getElementById('oypPrintPanel'); }
function panelOpen() { var p = panelEl(); return !!(p && !p.classList.contains('hidden')); }
function closePanel() { var p = panelEl(); if (p) p.classList.add('hidden'); }
function openPanel() {
  var p = ensurePanel();
  p.classList.remove('hidden');
  refresh();
}
function ensurePanel() {
  var p = document.getElementById('oypPrintPanel');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'oypPrintPanel';
  p.className = 'oyp-pr-panel set hidden';
  p.innerHTML = '<div class="oyp-pr-bar"><h3 class="lab seth">Print queue</h3><button type="button" class="oyp-pr-x" data-pr="close" aria-label="Close">✕</button></div><div data-oyp-q="1"></div>';
  document.body.appendChild(p);
  return p;
}

function mmSelect(id, value, label) {
  var html = '<select id="' + id + '" aria-label="' + label + '">', i, v;
  for (i = -10; i <= 10; i++) {
    v = i / 2;
    html += '<option value="' + v.toFixed(1) + '"' + (Math.abs(v - value) < 0.01 ? ' selected' : '') + '>' + (v > 0 ? '+' : '') + v.toFixed(1) + ' mm</option>';
  }
  return html + '</select>';
}
function darkSeg(value) {
  return '<div class="setdays" id="prDark" role="group" aria-label="Darkness">' + [1, 2, 3, 4, 5].map(function (n) {
    var on = value === n;
    return '<button type="button" class="pill sm' + (on ? ' on' : ' outline') + '" data-dark="' + n + '">' + n + '</button>';
  }).join('') + '</div>';
}
function linkRow(link, i, label) {
  var on = link.connected && !link.reconnecting;
  var named = !!link.model && !label;
  var dot = '<span class="oyp-pr-dot' + (on ? ' on' : '') + '" aria-hidden="true"></span>';
  var name = label ? '<span class="lab">' + esc(label) + '</span>' : (named ? '<span class="oyp-pr-name">' + esc(link.model) + '</span>' : '<span class="lab">Printer</span>');
  var k = kinds(named ? link : null);
  var which = [];
  if (named && k.jo_card) which.push('JO card');
  if (named && k.jewelry_tag) which.push('Jewelry tag');
  var note = link.away && !on ? 'Off or out of range' : (named ? (which.join(' · ') || 'No stickers') : 'Not connected');
  var controls;
  if (!label && link.connected) controls = '<button type="button" class="pill sm outline" data-slot="' + i + '" data-slot-act="disconnect">Disconnect</button>';
  else if (!label && (link.reconnecting || link.away)) controls = (link.reconnecting ? '<span class="muted">Reconnecting</span>' : '') + '<button type="button" class="pill sm" data-slot="' + i + '" data-slot-act="retry">Retry</button>';
  else controls = '<select data-slot-transport="' + i + '" aria-label="Connection"><option value="bluetooth"' + (link.transport === 'serial' ? '' : ' selected') + '>Bluetooth</option><option value="serial"' + (link.transport === 'serial' ? ' selected' : '') + '>USB</option></select><button type="button" class="pill sm" data-slot="' + i + '" data-slot-act="connect">Connect</button>';
  return '<div class="setrow pr-link" data-slot="' + i + '"><div class="setl"><span class="oyp-pr-pair">' + name + dot + '</span><span class="muted">' + esc(note) + '</span></div><div class="setv">' + controls + '</div></div>';
}
/* A slot with no model is free. opening is a connect the person just started, before the model comes back. */
function slotOpen(link) {
  return !link.model && !link.connected && !link.reconnecting && !link.opening;
}
function paintLinks() {
  var host = document.getElementById('prLinks');
  if (!host) return;
  var links = knownLinks();
  var html = links.length ? links.map(function (link) { return linkRow(link, slotIndex(link)); }).join('') : linkRow(state, 0);
  if (links.length === 1) {
    var other = links[0] === peer ? state : peer;
    if (slotOpen(other)) html += linkRow(other, slotIndex(other), 'Second printer');
  }
  html += slotDebugHtml();
  if (state.autoNote) html += '<p class="muted" id="prAutoNote">' + esc(state.autoNote) + '</p>';
  if (host.getAttribute('data-paint') === html) return;
  host.setAttribute('data-paint', html);
  host.innerHTML = html;
}
function kindChip(id, on, label) {
  return '<button type="button" class="dchip' + (on ? ' on' : '') + '" id="' + id + '">' + label + '</button>';
}
function mmPair(xid, x, xLabel, yid, y, yLabel) {
  return '<div class="setv two"><label><span class="setu">Horizontal</span>' + mmSelect(xid, x, xLabel) + '</label><label><span class="setu">Vertical</span>' + mmSelect(yid, y, yLabel) + '</label></div>';
}
function mountSettings(el) {
  if (!el) return;
  var cfg = load(), k = kinds(), b31 = offsetMm('B31'), b1 = offsetMm('B1');
  function tog(id, kind) {
    var on = serverAuto(kind);
    return '<label class="settog"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span>' + (on ? 'On' : 'Off') + '</span></label>';
  }
  var flagUrl = 'chrome://flags/#enable-web-bluetooth-new-permissions-backend';
  var flagRow = (!canGetDevices() && !ios() && root.navigator && navigator.bluetooth)
    ? '<div class="setrow" id="prFlag"><div class="setl"><span class="muted">To reconnect automatically, turn on ' + esc(flagUrl) + ' and relaunch Chrome</span></div><div class="setv"><button type="button" class="pill sm outline" id="prFlagCopy">Copy</button></div></div>'
    : '';
  el.innerHTML = '<div class="set"><div class="setbox">'
    + flagRow
    + '<div id="prLinks"></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">JO sticker</span><span class="muted">On queues and prints a new JO card. Off does not queue it.</span></div><div class="setv">' + tog('prAutoJo', 'jo_card') + '</div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">Jewelry tag</span><span class="muted">On queues and prints a jewelry tag. Off does not queue it. A manual batch still queues.</span></div><div class="setv">' + tog('prAutoTag', 'jewelry_tag') + '</div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">Darkness</span><span class="muted">1 is light, 5 is dark. 3 is the usual.</span></div><div class="setv">' + darkSeg(cfg.darkness) + '</div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">Print mode</span><span class="muted">Auto starts a B31 on the B1 page size, and remembers the task this printer answers. D110M_V4 and B1 stay as manual choices.</span></div><div class="setv"><select id="prTask" aria-label="Print mode">' + [['auto', 'Auto'], ['D110M_V4', 'D110M_V4'], ['B1', 'B1']].map(function (o) { return '<option value="' + o[0] + '"' + ((cfg.task || 'auto') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">This printer prints</span><span class="muted">A B1 prints jewelry tags. A B31 prints JO stickers. A saved choice can turn a kind off. A B1 does not print JO stickers.</span></div><div class="setv"><div class="setdays">' + kindChip('prJo', k.jo_card, 'JO card') + kindChip('prTag', k.jewelry_tag, 'Jewelry tag') + '</div></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">B31 offset</span><span class="muted">Zero is the centre measured on a T30×20 roll. Positive moves the print right, or down the feed.</span></div>' + mmPair('prX31', b31.x, 'B31 horizontal offset', 'prY31', b31.y, 'B31 vertical offset') + '</div>'
    + '<div class="setrow"><div class="setl"><span class="lab">B1 offset</span><span class="muted">Same steps, saved separately for the B1.</span></div>' + mmPair('prX1', b1.x, 'B1 horizontal offset', 'prY1', b1.y, 'B1 vertical offset') + '</div>'
    + '</div><p class="muted">Stickers print the JO number, not the client name. The queue still shows the name first, for example Elena Tan · 26-287.</p></div>';
  function persist() {
    var next = load();
    var darkBtn = el.querySelector('#prDark button.on');
    next.darkness = Math.max(1, Math.min(5, darkBtn ? (darkBtn.getAttribute('data-dark') | 0) : 3));
    var tk = document.getElementById('prTask'); next.task = tk ? tk.value : 'auto';
    var jo = document.getElementById('prJo'), tag = document.getElementById('prTag');
    var model = activeModel(next);
    next.kinds = null;
    if (model) {
      if (!next.kindsByModel || typeof next.kindsByModel !== 'object') next.kindsByModel = {};
      var picked = { jo_card: !!(jo && jo.classList.contains('on')), jewelry_tag: !!(tag && tag.classList.contains('on')) };
      if (model === 'B1') picked.jo_card = false;
      next.kindsByModel[model] = picked;
    }
    next.offsets = {
      B31: { x: stepMm(document.getElementById('prX31').value), y: stepMm(document.getElementById('prY31').value) },
      B1: { x: stepMm(document.getElementById('prX1').value), y: stepMm(document.getElementById('prY1').value) }
    };
    save(next);
    paintAuto();
    paintLinks();
  }
  ['prTask', 'prX31', 'prY31', 'prX1', 'prY1'].forEach(function (id) { var n = document.getElementById(id); if (n) n.onchange = persist; });
  [['prAutoJo', 'jo_card'], ['prAutoTag', 'jewelry_tag']].forEach(function (pair) {
    var n = document.getElementById(pair[0]);
    if (n) n.onchange = function () { setAuto(pair[1], n.checked); };
  });
  ['prJo', 'prTag'].forEach(function (id) {
    var n = document.getElementById(id);
    if (!n) return;
    n.onclick = function () {
      if (id === 'prJo' && activeModel() === 'B1') return;
      n.classList.toggle('on');
      persist();
    };
  });
  el.querySelectorAll('#prDark button').forEach(function (b) {
    b.onclick = function () {
      el.querySelectorAll('#prDark button').forEach(function (x) {
        var on = x === b;
        x.classList.toggle('on', on);
        x.classList.toggle('outline', !on);
      });
      persist();
    };
  });
  paintLinks();
  var copyBtn = el.querySelector && el.querySelector('#prFlagCopy');
  if (copyBtn) copyBtn.onclick = function () { copyFlag(flagUrl); };
}
function copyFlag(url) {
  var clip = root.navigator && navigator.clipboard;
  function fallback() {
    var input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    if (input.select) input.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast(url); }
    if (input.remove) input.remove();
  }
  if (clip && clip.writeText) Promise.resolve(clip.writeText(url)).then(function () { toast('Copied'); }, fallback);
  else fallback();
}
function mountQueue(el) {
  if (!el) return;
  el.setAttribute('data-oyp-q', '1');
  el.innerHTML = queueHtml(state.last);
  mountRange(document.getElementById('printRange'));
  refresh();
}
function mountChip() { drawChip(); }
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
      host.className = 'fbtns oyp-pr-acts';
      host.innerHTML = '<button type="button" class="pill sm" data-oyp-ask="1" data-jo="' + esc(jo2) + '">Print</button><button type="button" class="pill sm outline" data-oyp-png="jewelry_tag" data-jo="' + esc(jo2) + '">DOWNLOAD TAG PNG</button>';
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
  link.href = (base || '') + 'print.css?v=17';
  (document.head || document.documentElement).appendChild(link);
}
function start() {
  try { console.log('[oyp-print] print.js v' + PRINT_JS); } catch (e0) {}
  css();
  deviceId();
  installFetch();
  mountChip();
  addButtons();
  if (!state.obs && root.MutationObserver) {
    state.obs = new MutationObserver(function () { addButtons(); paintDots(); if (isScannerPage() && !document.getElementById('oypPrBtn')) drawChip(); });
    state.obs.observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('click', function (e) {
    var slotBtn = e.target.closest('[data-slot-act]');
    if (slotBtn) {
      var idx = slotBtn.getAttribute('data-slot') | 0;
      var slotAct = slotBtn.getAttribute('data-slot-act');
      var slotLink = idx === 1 ? peer : state;
      if (slotAct === 'disconnect') disconnect(slotLink);
      else if (slotAct === 'retry') retrySlot(slotLink);
      else {
        var sel = document.querySelector('[data-slot-transport="' + idx + '"]');
        connectSlot(idx, sel && sel.value === 'serial' ? 'serial' : 'bluetooth');
      }
      return;
    }
    var printer = e.target.closest('[data-oyp-printer]');
    if (printer) {
      e.preventDefault();
      var menu = document.getElementById('oypPrMenu');
      var open = menu && !menu.classList.contains('hidden') && state.printerEl === printer;
      state.printerEl = printer;
      toggleMenu(open ? false : true, printer);
      return;
    }
    var pr = e.target.closest('[data-pr]');
    if (pr) {
      if (pr.closest('#oypPrMenu') && armedAt(e)) return;
      var act = pr.getAttribute('data-pr');
      toggleMenu(false);
      if (act === 'bluetooth') connectFree('bluetooth');
      else if (act === 'serial') connectFree('serial');
      else if (act === 'disconnect') disconnectShown();
      else if (act === 'close') closePanel();
      else if (act === 'queue') openPanel();
      return;
    }
    if (e.target.closest('#oypPrBtn')) {
      if (armedAt(e)) return;
      if (panelOpen()) { closePanel(); toggleMenu(false); return; }
      toggleMenu();
      return;
    }
    if (!e.target.closest('#oypPrMenu')) toggleMenu(false);
    if (panelOpen() && !e.target.closest('#oypPrintPanel') && !e.target.closest('#oypKind')) closePanel();
    var ask = e.target.closest('[data-oyp-ask]');
    if (ask) { askPrint([ask.getAttribute('data-jo')]); return; }
    var b = e.target.closest('[data-oyp-print]');
    if (b) { printJo(b.getAttribute('data-oyp-print'), b.getAttribute('data-jo'), { reprint: true }); return; }
    var png = e.target.closest('[data-oyp-png]');
    if (png) { download(png.getAttribute('data-oyp-png'), { jo: png.getAttribute('data-jo') }); return; }
    if (e.target.closest('[data-q]')) onQueueClick(e);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.kindDone) { state.kindDone('cancel'); return; }
    toggleMenu(false);
    closePanel();
  });
  document.addEventListener('visibilitychange', function () {
    if (pageVisible()) {
      grantReconnect();
      if (state.autoHold) {
        [state, peer].forEach(function (link) {
          if (link.transport === 'serial' && link.expected && !link.connected && !link.reconnecting) quietSerial(link);
        });
      }
    }
    if (anyUp()) pump();
  });
  if (root.addEventListener) root.addEventListener('focus', function () { if (anyUp()) pump(); });
  restoreLinks();
  grantReconnect();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

root.OYPPrint = { summary: summary, mountSettings: mountSettings, mountQueue: mountQueue, printJo: printJo, printLocal: printLocal, printQueued: printQueued, printStickers: printStickers, askPrint: askPrint, enqueueBatch: enqueueBatch, download: download, connect: connect, connectSlot: connectSlot, disconnect: disconnect, printerMarks: printerMarks, refresh: refresh, labelOpts: labelOpts, load: load, save: save, offsetMm: offsetMm, shiftPx: shiftPx };
})(typeof window !== 'undefined' ? window : globalThis);
