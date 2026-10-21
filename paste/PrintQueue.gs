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
  } else if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, PRINT_COLS.length).setValues([PRINT_COLS]);
  }
  return sh;
}
function printReadRows_() {
  var sh = printSheet_(), values = sh.getDataRange().getValues(), rows = [], head, r, c, o, idx;
  if (!values || !values.length) return { sh: sh, rows: rows };
  head = values[0].map(function (h) { return String(h || '').trim(); });
  for (r = 1; r < values.length; r++) {
    o = {};
    for (c = 0; c < PRINT_COLS.length; c++) {
      idx = head.indexOf(PRINT_COLS[c]);
      o[PRINT_COLS[c]] = idx < 0 ? '' : String(values[r][idx] == null ? '' : values[r][idx]);
    }
    if (o.print_id) rows.push(o);
  }
  return { sh: sh, rows: rows };
}
function printWriteRows_(sh, rows) {
  var out = [PRINT_COLS];
  rows.forEach(function (row) { out.push(PRINT_COLS.map(function (k) { return row[k] || ''; })); });
  sh.clearContents();
  sh.getRange(1, 1, out.length, PRINT_COLS.length).setValues(out);
}
function printSpecsFor_(jo) {
  var out = {}, want = printNormJo_(jo), rows, hit;
  if (!want || typeof jobRows_ !== 'function') return out;
  try { rows = jobRows_('JobOrders') || []; } catch (e) { return out; }
  rows.forEach(function (j) {
    if (hit || !j) return;
    if (printNormJo_(j.jo || j.JO || '') === want) hit = j;
  });
  if (!hit) return out;
  function pick(keys) {
    var i, v;
    for (i = 0; i < keys.length; i++) {
      v = hit[keys[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }
  out.client = pick(['client_name', 'client', 'name']);
  out.metal = pick(['metal']);
  out.karat = pick(['karat']);
  out.weight_g = pick(['weight_g', 'weight']);
  out.stone_type = pick(['stone_type', 'stone']);
  out.stone_size = pick(['stone_size']);
  out.size = pick(['size']);
  out.due_date = pick(['due_date', 'due']);
  out.current_stage = pick(['current_stage', 'stage']);
  return out;
}
function printDecorate_(item) {
  var spec = printSpecsFor_(item.jo), copy = {};
  PRINT_COLS.forEach(function (k) { copy[k] = item[k] || ''; });
  Object.keys(spec).forEach(function (k) { if (spec[k]) copy[k] = spec[k]; });
  return copy;
}
function printEnqueue_(jo, kind, actor, opts) {
  opts = opts || {};
  var by = typeof actor === 'string' ? actor : (actor && actor.username) || '';
  return printLock_(function () {
    var pack = printReadRows_(), now = new Date().toISOString();
    var res = printRowsEnqueue_(pack.rows, jo, kind, by, now, !!opts.reprint);
    if (res.created) printWriteRows_(pack.sh, pack.rows);
    if (res.item) res.item = printDecorate_(res.item);
    return res;
  });
}
function printMark_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  return printLock_(function () {
    var pack = printReadRows_(), now = new Date().toISOString();
    var res = printRowsMark_(pack.rows, String(req.print_id || ''), String(req.op || req.mark || ''), String(req.device_id || ''), user.username, now, req.error);
    if (res.ok) printWriteRows_(pack.sh, pack.rows);
    if (res.item) res.item = printDecorate_(res.item);
    return res;
  });
}
function printQueue_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  var pack = printReadRows_();
  return { ok: true, items: printRowsList_(pack.rows).map(printDecorate_) };
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
  try { printEnqueue_(jo, 'jewelry_tag', user && user.username, {}); } catch (e) {}
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
