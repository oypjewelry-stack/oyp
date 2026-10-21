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
var state = { client: null, model: '', head: 0, dir: 'top', transport: '', connected: false, printing: false, reconnecting: false, userDisconnect: false, btId: '', linkDownAt: 0, linkBurst: 0, timer: 0, worker: null, workerUrl: '', pumping: false, busy: {}, open: '', armUntil: 0, chain: Promise.resolve() };
var PAGE_MS = 20000;
var ATTEMPT_MS = 45000;
var END_MS = 4000;
var JOB_MS = 120000;
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
  var o = { darkness: 3, auto: true, transport: '', kinds: null, kindsByModel: {}, taskByModel: {}, model: '', offsets: {} };
  try { var raw = JSON.parse(localStorage.getItem(KEY) || '{}'); if (raw && typeof raw === 'object') o = Object.assign(o, raw); } catch (e) {}
  o.darkness = Math.max(1, Math.min(5, o.darkness | 0 || 3));
  if (!o.offsets || typeof o.offsets !== 'object') o.offsets = {};
  if (!o.kindsByModel || typeof o.kindsByModel !== 'object') o.kindsByModel = {};
  if (!o.taskByModel || typeof o.taskByModel !== 'object') o.taskByModel = {};
  /* An old browser saved one kinds object for every printer. Keep it only on the model it was saved for. */
  if (o.kinds && typeof o.kinds === 'object') {
    if (o.model && !o.kindsByModel[o.model]) o.kindsByModel[o.model] = { jo_card: !!o.kinds.jo_card, jewelry_tag: !!o.kinds.jewelry_tag };
    o.kinds = null;
  }
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
/* A print that never answers must not sit on this chain. The next Print tap would look like it did nothing. */
function work(fn) {
  var run = state.chain.then(function () { return fn(); }, function () { return fn(); });
  var capped = withTimeout(run, JOB_MS, 'Print timed out');
  state.chain = capped.then(function () {}, function () {});
  return capped;
}
function defaultKinds(model) {
  if (model === 'B31') return { jo_card: true, jewelry_tag: false };
  if (model === 'B1') return { jo_card: false, jewelry_tag: true };
  return { jo_card: true, jewelry_tag: true };
}
function activeModel(cfg) {
  return state.model || (cfg || load()).model || '';
}
function kinds() {
  var cfg = load();
  var model = activeModel(cfg);
  var saved = model && cfg.kindsByModel[model];
  if (saved && typeof saved === 'object') return { jo_card: !!saved.jo_card, jewelry_tag: !!saved.jewelry_tag };
  return defaultKinds(model);
}
function printsKind(kind) { return !!kinds()[kind]; }
function summary() {
  var cfg = load(), k = kinds();
  var who = state.connected ? (state.model || 'Printer') : (cfg.model ? cfg.model + ' not connected' : 'Not connected');
  var bits = [who, cfg.auto ? 'auto on' : 'auto off', 'darkness ' + cfg.darkness];
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
function labelOpts(item, kind) {
  item = item || {};
  var model = item.model || state.model || load().model || 'B1';
  var sh = shiftPx(model);
  return {
    kind: kind || item.kind || 'jo_card',
    model: model,
    shiftX: sh.x,
    shiftY: sh.y,
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
function tasks() { return (lib() && lib().printTasks) || {}; }
function taskKnown(name) { return !!(name && tasks()[name]); }
/* Settings > Labels > Print mode. Auto uses the task that last finished for this model, else the one niimbluelib names. */
function taskName(client) {
  var forced = load().task;
  if (forced && forced !== 'auto' && taskKnown(forced)) return forced;
  var meta = client && client.getModelMetadata && client.getModelMetadata();
  var model = state.model || (meta && meta.model) || '';
  var saved = (load().taskByModel || {})[model];
  if (taskKnown(saved)) return saved;
  var named = client && client.getPrintTaskType && client.getPrintTaskType();
  if (taskKnown(named)) return named;
  var info = client && client.getPrinterInfo ? client.getPrinterInfo() : {};
  var found = model && lib().findPrintTask && lib().findPrintTask(model, info && info.protocolVersion);
  if (taskKnown(found)) return found;
  var head = (meta && meta.printheadPixels) || state.head || 0;
  if (head >= 500 && taskKnown('D110M_V4')) return 'D110M_V4';
  return taskKnown('B1') ? 'B1' : 'D110M_V4';
}
/* One retry, and only on Auto: the detected task, then B1, then D110M_V4. A manual choice is not replaced. */
function taskChoices(client) {
  var forced = load().task;
  if (forced && forced !== 'auto' && taskKnown(forced)) return [forced];
  var out = [], first = taskName(client);
  function add(name) { if (taskKnown(name) && out.indexOf(name) < 0) out.push(name); }
  add(first);
  add('B1');
  add('D110M_V4');
  if (!out.length) out.push(first || 'B1');
  return out.slice(0, 2);
}
function rememberTask(name) {
  if ((load().task || 'auto') !== 'auto' || !state.model || !taskKnown(name)) return;
  var cfg = load();
  if (cfg.taskByModel[state.model] === name) return;
  cfg.taskByModel[state.model] = name;
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
function headPixels() {
  var meta = state.client && state.client.getModelMetadata && state.client.getModelMetadata();
  var head = (meta && meta.printheadPixels) || state.head || 0;
  if (!head && root.OYPLabel && root.OYPLabel.HEADS) head = root.OYPLabel.HEADS[state.model] || 0;
  return head | 0;
}
/* The encoder's column count is the canvas width rounded up to a byte. The B31 head is 600, so the bitmap must be exactly that wide. */
function fitHead(canvas) {
  var head = headPixels();
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
function sendToPrinter(item) {
  var L = lib();
  if (!state.client || !state.connected) return Promise.reject(new Error('Not connected'));
  if (!root.OYPLabel) return Promise.reject(new Error('Label renderer is not loaded'));
  return labelReady().then(function () { return sendPrepared(item); });
}
function runTask(name, encoded) {
  var L = lib();
  var task = state.client.protocol.newPrintTask(name, {
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
  var attempt = Promise.resolve(task.printInit()).then(function () {
    return task.printPage(encoded, 1);
  }).then(function () {
    return task.waitForFinished();
  });
  return withTimeout(attempt, ATTEMPT_MS, 'Print timed out').then(function () {
    return Promise.resolve(end()).then(function () { rememberTask(name); });
  }, function (err) {
    return Promise.resolve(end()).then(function () { throw err; });
  });
}
function sendPrepared(item) {
  var L = lib();
  var rendered = root.OYPLabel.render(labelOpts(item));
  var canvas = fitHead(root.OYPLabel.toCanvas(rendered));
  if (!canvas) return Promise.reject(new Error('No canvas'));
  var encoded = L.ImageEncoder.encodeCanvas(canvas, L.PageColorType.SingleColor, state.dir || 'top');
  var names = taskChoices(state.client), i = 0;
  function once() {
    return runTask(names[i], encoded).catch(function (err) {
      if (i + 1 < names.length && isPageEndTimeout(err)) { i += 1; return once(); }
      throw err;
    });
  }
  return once();
}
function claimFresh(item, now) {
  if (!item || item.status !== 'queued') return false;
  if (!item.device_id || item.device_id === deviceId()) return true;
  var t = Date.parse(item.printed_at || '');
  if (!t || (now - t) >= STALE) return true;
  return false;
}
function markPrinting(on) {
  state.printing = !!on;
  document.querySelectorAll('[data-q]').forEach(function (b) { b.disabled = !!on; });
  paintDots();
}
function claimAndPrint(item) {
  var job = work(function () {
    if (!item) return;
    if (!state.connected) { toast('Connect a printer first'); return; }
    var id = item.print_id;
    markPrinting(true);
    function stop() { markPrinting(false); }
    function finish(p) {
      return Promise.resolve(p).then(function (v) { stop(); return v; }, function (err) { stop(); throw err; });
    }
    function go(row) {
      toast('Printing…');
      return sendToPrinter(row).then(function () {
        toast('Printed');
      }, function (err) {
        toast(failToast(err));
        throw err;
      });
    }
    if (!id) return finish(go(item).catch(function () {}));
    return finish(callPrint('printMark', { print_id: id, mark: 'claim', device_id: deviceId() }).then(function (r) {
      if (markFailed(r, 'Could not print that sticker')) return;
      var printed = r.item ? Object.assign({}, item, r.item) : item;
      return go(printed).then(function () {
        return callPrint('printMark', { print_id: id, mark: 'printed', device_id: deviceId() }).then(function (done) {
          markFailed(done, 'Printed, but the queue did not update');
        });
      }).catch(function (err) {
        return callPrint('printMark', { print_id: id, mark: 'failed', device_id: deviceId(), error: failRow(err) }).then(function (done) {
          markFailed(done, 'The sticker failed, and the queue did not update');
        });
      }).then(function () { paintFrom(printed); });
    }));
  });
  return Promise.resolve(job).then(function (v) { return v; }, function (err) {
    markPrinting(false);
    toast(failToast(err));
  });
}
function printJo(kind, jo, opts) {
  opts = opts || {};
  var reprint = opts.reprint !== false;
  return callPrint('printEnqueue', { jo: jo, kind: kind, reprint: reprint }).then(function (r) {
    if (!r || r.ok === false) { toast((r && r.error) || 'Sticker did not print'); return r; }
    var item = r.item || { jo: jo, kind: kind };
    if (!state.connected) { toast('Connect a printer to print. The sticker stays in the queue.'); refresh(); return r; }
    if (item.status && item.status !== 'queued') { toast('That sticker is already ' + item.status); refresh(); return r; }
    return claimAndPrint(item).then(function () { refresh(); return r; });
  }).catch(function () { toast('Sticker did not print'); });
}
function printAgain(item) {
  if (!item) return;
  return callPrint('printMark', { print_id: item.print_id, mark: 'requeue', device_id: deviceId() }).then(function (r) {
    if (markFailed(r, 'Could not print that sticker')) return;
    var row = Object.assign({}, item, (r && r.item) || {});
    row.status = 'queued';
    row.error = '';
    if (!state.connected) { toast('Connect a printer to print. The sticker stays in the queue.'); refresh(); return; }
    return claimAndPrint(row).then(function () { refresh(); });
  });
}
function printLocal(opts) {
  var item = Object.assign({}, opts || {});
  delete item.model; delete item.head; delete item.client;
  var job = work(function () {
    if (!state.connected) { toast('Connect a printer first'); return; }
    markPrinting(true);
    toast('Printing…');
    return sendToPrinter(item).then(function () {
      toast('Printed');
    }, function (err) {
      toast(failToast(err));
    }).then(function () { markPrinting(false); }, function () { markPrinting(false); });
  });
  return Promise.resolve(job).then(function (v) { return v; }, function (err) {
    markPrinting(false);
    toast(failToast(err));
  });
}
/* The PNG is the label only (240 px wide), not the whole printhead, so the Niimbot app does not shrink it.
   A tag button only knows the JO, so its specs are read first (printQueue with jo is a read). The name is dropped. */
function download(kind, item) {
  if (!root.OYPLabel) return;
  item = Object.assign({}, item || {});
  delete item.client;
  var needSpecs = kind === 'jewelry_tag' && item.jo && !item.metal && !item.karat && !item.stone_type && !item.stone && !item.size && !item.weight_g && !item.weight;
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
  return callPrint('printMark', { print_id: id, mark: 'cancelled', device_id: deviceId() }).then(function (r) {
    markFailed(r, 'Could not cancel that sticker');
    refresh();
  });
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
  document.querySelectorAll('[data-oyp-q]').forEach(function (el) {
    el.innerHTML = queueHtml(r);
    drawQueuePreviews(el, r);
  });
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
function queueHtml(r) {
  if (!r || !r.ok) return '<p class="muted oyp-qempty">' + esc(queueNote(r)) + '</p>';
  var items = r.items || [];
  if (!items.length) return '<p class="muted oyp-qempty">No stickers waiting</p>';
  var dis = state.printing ? ' disabled' : '';
  return items.map(function (it, i) {
    var kind = it.kind === 'jewelry_tag' ? 'Jewelry tag' : 'JO card';
    var failed = it.status === 'failed';
    var st = failed ? 'Failed' : 'Queued';
    var id = esc(it.print_id);
    var err = failed ? rowError(it.error) : '';
    var buttons = failed
      ? '<button type="button" class="pill sm" data-q="again" data-id="' + id + '"' + dis + '>PRINT</button><button type="button" class="pill sm outline" data-q="cancel" data-id="' + id + '"' + dis + '>CANCEL</button>'
      : '<button type="button" class="pill sm" data-q="now" data-id="' + id + '"' + dis + '>PRINT</button><button type="button" class="pill sm outline" data-q="reprint" data-id="' + id + '"' + dis + '>REPRINT</button><button type="button" class="pill sm outline" data-q="cancel" data-id="' + id + '"' + dis + '>CANCEL</button>';
    return '<div class="setp oyp-qrow"><canvas class="oyp-qprev" data-qi="' + i + '" aria-label="' + esc(kind) + ' preview"></canvas><div class="setl oyp-qmain"><b class="cn">' + screenLabel(it) + '</b><span class="kf"><span class="chip">' + esc(kind) + '</span><span class="chip">' + esc(st) + '</span></span>'
      + (err ? '<span class="muted oyp-qerr">' + esc(err) + '</span>' : '')
      + '</div><div class="fbtns oyp-qbtns">' + buttons + '</div></div>';
  }).join('');
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
function refresh() {
  return callPrint('printQueue', {}).then(function (r) { paint(r); return r; }).catch(function () { return null; });
}
function itemById(id) {
  var items = (state.last && state.last.items) || [];
  for (var i = 0; i < items.length; i++) if (items[i].print_id === id) return items[i];
  return null;
}
function onQueueClick(e) {
  var b = e.target.closest('[data-q]'); if (!b || b.disabled || state.printing) return;
  var it = itemById(b.getAttribute('data-id')); if (!it) return;
  var q = b.getAttribute('data-q');
  if (q === 'cancel') cancel(it.print_id);
  else if (q === 'again') printAgain(it);
  else if (q === 'reprint') reprint(it);
  else printJo(it.kind, it.jo, { reprint: false });
}

function isFinal(req, res) {
  if (res && (res.final === true || res.final_step === true)) return true;
  var d = String((res && (res.to || res.stage_code || res.col)) || (req && req.to) || '').toLowerCase();
  return d === 'pickup' || d === 'notify' || d === 'for_pickup';
}
function afterOk(req, res) {
  if (!res || res.ok === false) return;
  var kind = '', jo = req.jo;
  if (req.imageBase64 && !req.op && !req.action && (parseInt(req.page, 10) || 1) === 1) kind = 'jo_card'; // same page rule as Code.gs
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
    if (raw.indexOf('"prodMove"') < 0 && raw.indexOf('"imageBase64"') < 0) return p; // only a move or a scan upload can queue a sticker; skip parsing everything else
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
  if (!state.connected) return;
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
  if (state.timer || state.worker) return;
  var WorkerFn = root.Worker, BlobFn = root.Blob, URLFn = root.URL, started = false;
  try {
    if (typeof WorkerFn === 'function' && typeof BlobFn === 'function' && URLFn && typeof URLFn.createObjectURL === 'function') {
      var blob = new BlobFn(['setInterval(function(){postMessage(1)},' + POLL + ')'], { type: 'text/javascript' });
      state.workerUrl = URLFn.createObjectURL(blob);
      state.worker = new WorkerFn(state.workerUrl);
      state.worker.onmessage = function () { pump(); };
      started = true;
    }
  } catch (e) { started = false; }
  if (!started) {
    if (state.worker) { try { state.worker.terminate(); } catch (e2) {} }
    state.worker = null;
    if (state.workerUrl && URLFn && typeof URLFn.revokeObjectURL === 'function') { try { URLFn.revokeObjectURL(state.workerUrl); } catch (e3) {} }
    state.workerUrl = '';
    if (!state.timer) state.timer = setInterval(pump, POLL);
  }
}
function stopPoll() {
  if (state.timer) { clearInterval(state.timer); state.timer = 0; }
  if (state.worker) { try { state.worker.terminate(); } catch (e) {} state.worker = null; }
  if (state.workerUrl && root.URL && typeof root.URL.revokeObjectURL === 'function') { try { root.URL.revokeObjectURL(state.workerUrl); } catch (e2) {} }
  state.workerUrl = '';
}

function beat() {
  var c = state.client;
  if (!c) return;
  /* niimbluelib also starts this on its own connect event. Calling it here covers a client that did not. */
  if (c.startHeartbeat) c.startHeartbeat();
  else if (c.setHeartbeatAutoStart) c.setHeartbeatAutoStart(true);
}
function rememberBle() {
  var bt = root.navigator && navigator.bluetooth;
  if (!bt || typeof bt.getDevices !== 'function') return Promise.resolve();
  return Promise.resolve(bt.getDevices()).then(function (list) {
    list = list || [];
    var i, d;
    for (i = 0; i < list.length; i++) {
      d = list[i];
      if (d && d.gatt && d.gatt.connected && d.id) { state.btId = d.id; return; }
    }
    if (list.length === 1 && list[0] && list[0].id) state.btId = list[0].id;
  }).catch(function () {});
}
function watchLink(client) {
  if (!client || !client.on || client.__oypWatch) return;
  client.__oypWatch = true;
  client.on('disconnect', function () {
    if (state.client !== client) return;
    onLinkDown();
  });
}
function onConnected(transport) {
  var meta = (state.client.getModelMetadata && state.client.getModelMetadata()) || {};
  state.model = meta.model || state.model || '';
  state.head = meta.printheadPixels || (state.model === 'B31' ? 600 : state.model === 'B1' ? 384 : 0);
  state.dir = meta.printDirection || 'top';
  state.transport = transport;
  state.connected = true;
  state.reconnecting = false;
  state.userDisconnect = false;
  var cfg = load();
  cfg.transport = transport;
  cfg.model = state.model || cfg.model;
  if (!cfg.kindsByModel || typeof cfg.kindsByModel !== 'object') cfg.kindsByModel = {};
  if (state.model && !cfg.kindsByModel[state.model]) cfg.kindsByModel[state.model] = defaultKinds(state.model);
  cfg.kinds = null;
  save(cfg);
  beat();
  rememberBle();
  drawChip();
  startPoll();
  pump();
}
function begin(transport, device) {
  var L = lib();
  var client = transport === 'serial' ? new L.NiimbotSerialClient() : new L.NiimbotBluetoothClient();
  state.client = client;
  state.transport = transport;
  watchLink(client);
  return Promise.resolve(client.connect(device ? { authorizedDevice: device } : undefined)).then(function () {
    onConnected(transport);
  });
}
function connect(transport) {
  var L = lib();
  if (!L) { toast('Printer library is not loaded'); return; }
  if (transport === 'bluetooth' && !canBt()) { toast('Bluetooth printing needs Chrome or Edge'); return; }
  if (transport === 'serial' && !canSerial()) { toast('USB printing needs Chrome or Edge on a computer'); return; }
  state.userDisconnect = false;
  begin(transport).catch(function (err) {
    if (!state.connected) state.client = null;
    state.reconnecting = false;
    drawChip();
    var name = err && err.name;
    if (name === 'NotFoundError' || name === 'AbortError') return;
    toast('Could not connect');
  });
}
function disconnect() {
  var c = state.client;
  state.userDisconnect = true;
  state.reconnecting = false;
  state.connected = false;
  stopPoll();
  drawChip();
  if (!c || !c.disconnect) { state.client = null; state.userDisconnect = false; return; }
  Promise.resolve(c.disconnect()).catch(function () {}).then(function () {
    if (state.client === c) state.client = null;
    state.userDisconnect = false;
    drawChip();
  });
}
/* A failed page does not close the link. The library does, after five missed heartbeats, and the printer can also drop GATT while idle. */
function onLinkDown() {
  state.connected = false;
  state.printing = false;
  stopPoll();
  if (state.userDisconnect) {
    state.userDisconnect = false;
    state.client = null;
    state.reconnecting = false;
    drawChip();
    return;
  }
  var now = Date.now();
  state.linkBurst = state.linkDownAt && (now - state.linkDownAt) < 8000 ? state.linkBurst + 1 : 1;
  state.linkDownAt = now;
  if (state.linkBurst > 3 || state.transport !== 'bluetooth') {
    state.client = null;
    state.reconnecting = false;
    toast('Printer disconnected. Tap Printer to reconnect');
    drawChip();
    return;
  }
  quietReconnect();
}
function quietReconnect() {
  var bt = root.navigator && navigator.bluetooth;
  if (state.reconnecting) return;
  if (!bt || typeof bt.getDevices !== 'function' || !state.btId) {
    state.client = null;
    toast('Printer disconnected. Tap Printer to reconnect');
    drawChip();
    return;
  }
  state.reconnecting = true;
  drawChip();
  Promise.resolve(bt.getDevices()).then(function (list) {
    var device = null, i;
    list = list || [];
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id === state.btId) device = list[i];
    if (!device || !device.gatt || typeof device.gatt.connect !== 'function') throw new Error('no device');
    return device.gatt.connect().then(function () { return device; });
  }).then(function (device) {
    return begin('bluetooth', device);
  }).catch(function () {
    state.client = null;
    state.connected = false;
    state.reconnecting = false;
    toast('Printer disconnected. Tap Printer to reconnect');
    drawChip();
  });
}

function chipText() {
  if (state.connected) return state.model || 'Printer';
  return 'Printer';
}
function connectNote() {
  if (ios()) return "iPad can't connect a printer. Stickers wait in the print queue.";
  return 'Open in Chrome or Edge to connect a printer';
}
function paintDots() {
  var mode = (state.reconnecting || state.printing) ? 'busy' : (state.connected ? 'on' : 'off');
  var title = mode === 'busy' ? (state.reconnecting ? 'Reconnecting' : 'Printing') : (mode === 'on' ? 'Printer connected' : 'Printer not connected');
  document.querySelectorAll('[data-oyp-printer]').forEach(function (el) {
    var dot = el.querySelector('.oyp-pr-dot');
    if (dot) {
      dot.classList.toggle('on', mode === 'on');
      dot.classList.toggle('busy', mode === 'busy');
    }
    el.title = title;
  });
}
function paintAuto() {
  var on = load().auto;
  var head = document.getElementById('prHeadAuto');
  if (head) {
    head.checked = on;
    var span = head.parentNode && head.parentNode.querySelector('span');
    if (span) span.textContent = on ? 'Auto on' : 'Auto off';
  }
  var box = document.getElementById('prAuto');
  if (box) box.checked = on;
  var lab = document.querySelector('#prAuto + span');
  if (lab) lab.textContent = on ? 'On' : 'Off';
}
function setAuto(on) {
  var cfg = load();
  cfg.auto = !!on;
  cfg.kinds = null;
  save(cfg);
  paintAuto();
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
  var on = state.connected;
  var bits = [];
  var auto = load().auto;
  bits.push('<label class="settog"><input type="checkbox" id="prHeadAuto"' + (auto ? ' checked' : '') + '><span>' + (auto ? 'Auto on' : 'Auto off') + '</span></label>');
  if (on) bits.push('<p class="muted oyp-pr-note">' + esc(state.model || 'Printer') + '</p>');
  if (!canBt() && !canSerial()) bits.push('<p class="muted oyp-pr-note" role="note">' + esc(connectNote()) + '</p>');
  else if (!on) {
    if (canBt()) bits.push('<button type="button" data-pr="bluetooth">Connect by Bluetooth</button>');
    if (canSerial()) bits.push('<button type="button" data-pr="serial">Connect by USB</button>');
  } else {
    if (canBt()) bits.push('<button type="button" data-pr="bluetooth">Bluetooth</button>');
    if (canSerial()) bits.push('<button type="button" data-pr="serial">USB serial</button>');
    bits.push('<button type="button" data-pr="disconnect">Disconnect</button>');
  }
  bits.push('<button type="button" data-pr="queue">Print queue</button>');
  menu.innerHTML = bits.join('');
  var head = document.getElementById('prHeadAuto');
  if (head) head.addEventListener('change', function () { setAuto(head.checked); });
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
  var on = state.connected;
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
function kindChip(id, on, label) {
  return '<button type="button" class="dchip' + (on ? ' on' : '') + '" id="' + id + '">' + label + '</button>';
}
function mmPair(xid, x, xLabel, yid, y, yLabel) {
  return '<div class="setv two"><label><span class="setu">Horizontal</span>' + mmSelect(xid, x, xLabel) + '</label><label><span class="setu">Vertical</span>' + mmSelect(yid, y, yLabel) + '</label></div>';
}
var autoNote = "Auto-print keeps working in the background. Don't close this tab or put the computer to sleep.";
function mountSettings(el) {
  if (!el) return;
  var cfg = load(), k = kinds(), b31 = offsetMm('B31'), b1 = offsetMm('B1');
  el.innerHTML = '<div class="set"><div class="setbox">'
    + '<div class="setrow"><div class="setl"><span class="lab">Auto-print</span><span class="muted">Print a new JO card or a finished tag when this printer is connected. Off still keeps the queue.</span><span class="muted">' + autoNote + '</span></div><div class="setv"><label class="settog"><input type="checkbox" id="prAuto"' + (cfg.auto ? ' checked' : '') + '><span>' + (cfg.auto ? 'On' : 'Off') + '</span></label></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">Darkness</span><span class="muted">1 is light, 5 is dark. 3 is the usual.</span></div><div class="setv">' + darkSeg(cfg.darkness) + '</div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">Print mode</span><span class="muted">Auto uses the task this printer answers, and remembers it. D110M_V4 and B1 stay as manual choices.</span></div><div class="setv"><select id="prTask" aria-label="Print mode">' + [['auto', 'Auto'], ['D110M_V4', 'D110M_V4'], ['B1', 'B1']].map(function (o) { return '<option value="' + o[0] + '"' + ((cfg.task || 'auto') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">This printer prints</span><span class="muted">A B31 starts on JO cards. A B1 starts on jewelry tags. Either one can print both.</span></div><div class="setv"><div class="setdays">' + kindChip('prJo', k.jo_card, 'JO card') + kindChip('prTag', k.jewelry_tag, 'Jewelry tag') + '</div></div></div>'
    + '<div class="setrow"><div class="setl"><span class="lab">B31 offset</span><span class="muted">Zero is the centre measured on a T30×20 roll. Positive moves the print right, or down the feed.</span></div>' + mmPair('prX31', b31.x, 'B31 horizontal offset', 'prY31', b31.y, 'B31 vertical offset') + '</div>'
    + '<div class="setrow"><div class="setl"><span class="lab">B1 offset</span><span class="muted">Same steps, saved separately for the B1.</span></div>' + mmPair('prX1', b1.x, 'B1 horizontal offset', 'prY1', b1.y, 'B1 vertical offset') + '</div>'
    + '</div><p class="muted">Stickers print the JO number, not the client name. The queue still shows the name first, for example Elena Tan · 26-287.</p></div>';
  function persist() {
    var next = load();
    var auto = document.getElementById('prAuto');
    next.auto = !!(auto && auto.checked);
    var darkBtn = el.querySelector('#prDark button.on');
    next.darkness = Math.max(1, Math.min(5, darkBtn ? (darkBtn.getAttribute('data-dark') | 0) : 3));
    var tk = document.getElementById('prTask'); next.task = tk ? tk.value : 'auto';
    var jo = document.getElementById('prJo'), tag = document.getElementById('prTag');
    var model = activeModel(next);
    next.kinds = null;
    if (model) {
      if (!next.kindsByModel || typeof next.kindsByModel !== 'object') next.kindsByModel = {};
      next.kindsByModel[model] = { jo_card: !!(jo && jo.classList.contains('on')), jewelry_tag: !!(tag && tag.classList.contains('on')) };
    }
    next.offsets = {
      B31: { x: stepMm(document.getElementById('prX31').value), y: stepMm(document.getElementById('prY31').value) },
      B1: { x: stepMm(document.getElementById('prX1').value), y: stepMm(document.getElementById('prY1').value) }
    };
    save(next);
    paintAuto();
  }
  ['prAuto', 'prTask', 'prX31', 'prY31', 'prX1', 'prY1'].forEach(function (id) { var n = document.getElementById(id); if (n) n.onchange = persist; });
  ['prJo', 'prTag'].forEach(function (id) {
    var n = document.getElementById(id);
    if (!n) return;
    n.onclick = function () { n.classList.toggle('on'); persist(); };
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
}
function mountQueue(el) {
  if (!el) return;
  el.setAttribute('data-oyp-q', '1');
  el.innerHTML = queueHtml(state.last);
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
      host.innerHTML = '<button type="button" class="pill sm outline" data-oyp-print="jo_card" data-jo="' + esc(jo2) + '">PRINT STICKER</button><button type="button" class="pill sm outline" data-oyp-print="jewelry_tag" data-jo="' + esc(jo2) + '">PRINT TAG</button><button type="button" class="pill sm outline" data-oyp-png="jewelry_tag" data-jo="' + esc(jo2) + '">DOWNLOAD TAG PNG</button>';
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
  link.href = (base || '') + 'print.css?v=10';
  (document.head || document.documentElement).appendChild(link);
}
function start() {
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
      if (act === 'bluetooth') connect('bluetooth');
      else if (act === 'serial') connect('serial');
      else if (act === 'disconnect') disconnect();
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
    if (panelOpen() && !e.target.closest('#oypPrintPanel')) closePanel();
    var b = e.target.closest('[data-oyp-print]');
    if (b) { printJo(b.getAttribute('data-oyp-print'), b.getAttribute('data-jo'), { reprint: true }); return; }
    var png = e.target.closest('[data-oyp-png]');
    if (png) { download(png.getAttribute('data-oyp-png'), { jo: png.getAttribute('data-jo') }); return; }
    if (e.target.closest('[data-q]')) onQueueClick(e);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    toggleMenu(false);
    closePanel();
  });
  document.addEventListener('visibilitychange', function () { if (state.connected) pump(); });
  if (root.addEventListener) root.addEventListener('focus', function () { if (state.connected) pump(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

root.OYPPrint = { summary: summary, mountSettings: mountSettings, mountQueue: mountQueue, printJo: printJo, printLocal: printLocal, download: download, connect: connect, disconnect: disconnect, refresh: refresh, labelOpts: labelOpts, load: load, save: save, offsetMm: offsetMm, shiftPx: shiftPx };
})(typeof window !== 'undefined' ? window : globalThis);
