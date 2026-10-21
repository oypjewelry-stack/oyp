var PRINT_COLS = ['print_id', 'jo', 'kind', 'status', 'created_at', 'created_by', 'printed_at', 'printed_by', 'device_id', 'error'];
var PRINT_STALE_MS = 180000;

function printNormJo_(s) {
  var m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})([A-Z])?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : '';
}
function printKind_(k) {
  k = String(k || '');
  return k === 'jo_card' || k === 'jewelry_tag' ? k : '';
}
function printIsFinal_(dest, res) {
  res = res || {};
  if (res.final === true || res.final === 1 || String(res.final) === '1' || res.final_step === true) return true;
  var d = String(dest || res.to || res.stage_code || res.col || '').toLowerCase();
  return d === 'pickup' || d === 'notify' || d === 'for_pickup';
}
function printFindRow_(rows, printId) {
  var id = String(printId || ''), i;
  for (i = 0; i < rows.length; i++) if (rows[i].print_id === id) return rows[i];
  return null;
}
function printRowsEnqueue_(rows, jo, kind, by, now, reprint) {
  jo = printNormJo_(jo);
  kind = printKind_(kind);
  if (!jo || !kind) return { ok: false, error: 'Need a JO and a sticker type' };
  var i, row, queued = null, any = null;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row.jo !== jo || row.kind !== kind) continue;
    any = row;
    if (row.status === 'queued') queued = row;
  }
  if (queued) return { ok: true, item: queued, created: false };
  if (!reprint && any) return { ok: true, item: any, created: false, skipped: true };
  var item = {
    print_id: 'pq-' + String(now || '').replace(/\W/g, '').slice(-12) + '-' + Math.floor(Math.random() * 1000000),
    jo: jo, kind: kind, status: 'queued', created_at: String(now || ''), created_by: String(by || ''),
    printed_at: '', printed_by: '', device_id: '', error: ''
  };
  rows.push(item);
  return { ok: true, item: item, created: true };
}
function printRowsClaim_(rows, printId, device, now, staleMs) {
  var row = printFindRow_(rows, printId);
  if (!row) return { ok: false, error: 'Not in the queue', code: 'MISSING' };
  if (row.status !== 'queued') return { ok: false, error: 'Already ' + row.status, code: 'TAKEN' };
  staleMs = staleMs || PRINT_STALE_MS;
  var mine = row.device_id && row.device_id === device;
  var t = Date.parse(row.printed_at || '');
  var fresh = !!(row.device_id && t && (Date.parse(now) - t) < staleMs);
  if (fresh && !mine) return { ok: false, error: 'Another printer has this sticker', code: 'TAKEN' };
  row.device_id = String(device || '');
  row.printed_at = String(now || '');
  return { ok: true, item: row, claimed: true };
}
function printRowsMark_(rows, printId, op, device, user, now, error) {
  op = String(op || '');
  if (op === 'cancel') op = 'cancelled';
  if (op === 'claim') return printRowsClaim_(rows, printId, device, now);
  var row = printFindRow_(rows, printId);
  if (!row) return { ok: false, error: 'Not in the queue', code: 'MISSING' };
  if (op === 'cancelled') {
    if (row.status !== 'queued' && row.status !== 'failed') return { ok: false, error: 'Cannot cancel', code: 'STATE' };
    row.status = 'cancelled';
    row.error = '';
    return { ok: true, item: row };
  }
  if (op === 'printed' || op === 'failed') {
    if (row.status !== 'queued') return { ok: false, error: 'Not queued', code: 'STATE' };
    row.status = op === 'printed' ? 'printed' : 'failed';
    row.printed_at = String(now || '');
    row.printed_by = String(user || '');
    row.device_id = String(device || row.device_id || '');
    row.error = op === 'failed' ? String(error || 'print failed').slice(0, 180) : '';
    return { ok: true, item: row };
  }
  return { ok: false, error: 'Unknown mark' };
}
function printRowsList_(rows) {
  var out = [], i;
  for (i = 0; i < rows.length; i++) if (rows[i].status === 'queued' || rows[i].status === 'failed') out.push(rows[i]);
  return out;
}

function isPrintAction_(a) { return a === 'printMark' || a === 'printEnqueue' || a === 'printReprint'; }

function printLock_(fn) {
  if (typeof withLock_ === 'function') return withLock_(fn);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function printSheet_() {
  var ss = typeof ss_ === 'function' ? ss_() : SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('PrintQueue');
  if (!sh) {
    sh = ss.insertSheet('PrintQueue');
    sh.getRange(1, 1, 1, PRINT_COLS.length).setValues([PRINT_COLS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), PRINT_COLS.length).setNumberFormat('@'); // plain text, so times and ids are not turned into dates
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, PRINT_COLS.length).setValues([PRINT_COLS]);
  }
  return sh;
}
function printCell_(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v);
}
function printReadRows_() {
  var sh = printSheet_(), values = sh.getDataRange().getValues(), rows = [], head, r, c, o, idx;
  if (!values || !values.length) return { sh: sh, rows: rows, head: PRINT_COLS.slice() };
  head = values[0].map(function (h) { return String(h || '').trim(); });
  for (r = 1; r < values.length; r++) {
    o = {};
    for (c = 0; c < PRINT_COLS.length; c++) {
      idx = head.indexOf(PRINT_COLS[c]);
      o[PRINT_COLS[c]] = idx < 0 ? '' : printCell_(values[r][idx]);
    }
    if (o.print_id) { Object.defineProperty(o, '_r', { value: r + 1, enumerable: false, writable: true }); rows.push(o); }
  }
  return { sh: sh, rows: rows, head: head };
}
/* One row only: a new row is appended, a changed row is written in place. The rest of the tab is never rewritten. */
function printWriteRow_(pack, row) {
  var head = pack.head && pack.head.length ? pack.head : PRINT_COLS;
  var width = Math.max(head.length, 1), line = [], c, k;
  for (c = 0; c < width; c++) { k = head[c]; line.push(PRINT_COLS.indexOf(k) >= 0 ? String(row[k] || '') : ''); }
  if (!row._r) {
    var r = pack.sh.getLastRow() + 1;
    pack.sh.getRange(r, 1, 1, width).setNumberFormat('@').setValues([line]);
    Object.defineProperty(row, '_r', { value: r, enumerable: false, writable: true });
    return;
  }
  for (c = 0; c < width; c++) if (PRINT_COLS.indexOf(head[c]) < 0) line[c] = null; // leave any extra column alone
  var cells = pack.sh.getRange(row._r, 1, 1, width), cur = cells.getValues()[0];
  for (c = 0; c < width; c++) if (line[c] === null) line[c] = cur[c];
  cells.setValues([line]);
}
function printDay_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var tz = typeof Session !== 'undefined' && Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Asia/Manila';
    if (typeof Utilities !== 'undefined') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
  }
  return String(v).trim();
}
/* One read of JobOrders (and Clients, for the on-screen name) per request, not one per queued row. */
function printLookup_() {
  var jobs = {}, names = {};
  try {
    if (typeof jobRows_ === 'function') (jobRows_('JobOrders') || []).forEach(function (j) {
      var k = j && printNormJo_(j.jo || j.JO || '');
      if (k && !jobs[k]) jobs[k] = j;
    });
  } catch (e) {}
  try {
    if (typeof jobRows_ === 'function') (jobRows_('Clients') || []).forEach(function (c) {
      if (c && c.client_id) names[String(c.client_id)] = String(c.name || '').trim();
    });
  } catch (e2) {}
  return { jobs: jobs, names: names };
}
function printSpecsFor_(jo, look) {
  var out = {}, want = printNormJo_(jo), hit;
  look = look || printLookup_();
  if (!want) return out;
  hit = look.jobs[want] || look.jobs[want.replace(/[A-Z]$/, '')];
  if (!hit) return out;
  function pick(keys) {
    var i, v;
    for (i = 0; i < keys.length; i++) {
      v = hit[keys[i]];
      if (v != null && String(v).trim() !== '') return keys[i].indexOf('due') === 0 ? printDay_(v) : String(v).trim();
    }
    return '';
  }
  out.client = pick(['client_name', 'client']) || (hit.client_id ? (look.names[String(hit.client_id)] || '') : ''); // screen only, never printed
  out.metal = pick(['metal']);
  out.karat = pick(['karat']);
  out.weight_g = pick(['weight_g', 'weight']);
  out.stone_type = pick(['stone_type', 'stone']);
  out.stone_size = pick(['stone_size']);
  out.size = pick(['size']);
  out.due_date = pick(['due_date', 'due']);
  out.current_stage = pick(['current_stage']);
  return out;
}
function printDecorate_(item, look) {
  var spec = printSpecsFor_(item.jo, look), copy = {};
  PRINT_COLS.forEach(function (k) { copy[k] = item[k] || ''; });
  Object.keys(spec).forEach(function (k) { if (spec[k]) copy[k] = spec[k]; });
  return copy;
}
function printEnqueueRun_(jo, kind, by, reprint) {
  var pack = printReadRows_(), now = new Date().toISOString();
  var res = printRowsEnqueue_(pack.rows, jo, kind, by, now, reprint);
  if (res.created) printWriteRow_(pack, res.item);
  if (res.item) res.item = printDecorate_(res.item);
  return res;
}
function printEnqueue_(jo, kind, actor, opts) {
  opts = opts || {};
  var by = typeof actor === 'string' ? actor : (actor && actor.username) || '';
  if (opts.locked) return printEnqueueRun_(jo, kind, by, !!opts.reprint); // the caller already holds the script lock (prodMove_)
  return printLock_(function () { return printEnqueueRun_(jo, kind, by, !!opts.reprint); });
}
function printMark_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  return printLock_(function () {
    var pack = printReadRows_(), now = new Date().toISOString();
    var res = printRowsMark_(pack.rows, String(req.print_id || ''), String(req.op || req.mark || ''), String(req.device_id || ''), user.username, now, req.error);
    if (res.ok && res.item) printWriteRow_(pack, res.item);
    if (res.item) res.item = printDecorate_(res.item);
    return res;
  });
}
function printQueue_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  var pack = printReadRows_(), look = printLookup_();
  var out = { ok: true, items: printRowsList_(pack.rows).map(function (r) { return printDecorate_(r, look); }) };
  if (req && req.jo && printNormJo_(req.jo)) out.spec = printDecorate_({ jo: printNormJo_(req.jo) }, look); // read only: specs for a PNG of one JO
  return out;
}
function handlePrint_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (req.action === 'printMark') return printMark_(req, user);
  return printEnqueue_(req.jo, req.kind, user.username, { reprint: req.action === 'printReprint' || !!req.reprint });
}
function printAfterMove_(req, res, user) {
  if (!res || res.ok === false) return;
  var dest = (res && (res.to || res.stage_code || res.col)) || (req && req.to) || '';
  if (!printIsFinal_(dest, res)) return;
  var jo = (req && req.jo) || (res && res.jo);
  try { printEnqueue_(jo, 'jewelry_tag', user && user.username, { locked: true }); } catch (e) {} // prodMove_ runs inside withLock_
}
function printScanOp_(req) {
  var actor = { username: 'scanner' };
  if (req.op === 'printQueue') return printQueue_(req, actor);
  if (req.op === 'printMark') return printMark_(req, actor);
  if (req.op === 'printEnqueue' || req.op === 'printReprint') return printEnqueue_(req.jo, req.kind, 'scanner', { reprint: req.op === 'printReprint' || !!req.reprint });
  return { ok: false, error: 'Unknown op' };
}
function setupPrintQueue() {
  var sh = printSheet_();
  Logger.log('PrintQueue tab ready (' + sh.getLastRow() + ' rows including the header).');
}
