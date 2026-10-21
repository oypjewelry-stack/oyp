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
function printRowReset_(row) {
  row.status = 'queued';
  row.error = '';
  row.device_id = '';
  row.printed_at = '';
  row.printed_by = '';
  return row;
}
function printRowsEnqueue_(rows, jo, kind, by, now, reprint, allowCreate) {
  jo = printNormJo_(jo);
  kind = printKind_(kind);
  if (!jo || !kind) return { ok: false, error: 'Need a JO and a sticker type' };
  var i, row, queued = null, failed = null, any = null;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row.jo !== jo || row.kind !== kind) continue;
    any = row;
    if (row.status === 'queued') queued = row;
    if (row.status === 'failed') failed = row;
  }
  if (queued) return { ok: true, item: queued, created: false };
  /* Reprint must not add a second row while a failed one is still on screen. Put that row back in the queue. */
  if (failed && reprint) return { ok: true, item: printRowReset_(failed), created: false, requeued: true };
  if (!reprint && any) return { ok: true, item: any, created: false, skipped: true };
  if (allowCreate === false) return { ok: true, skipped: true, auto: false };
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
  if (op === 'requeue') {
    if (row.status === 'queued') return { ok: true, item: row };
    if (row.status !== 'failed') return { ok: false, error: 'Not failed', code: 'STATE' };
    for (var q = 0; q < rows.length; q++) {
      if (rows[q] !== row && rows[q].jo === row.jo && rows[q].kind === row.kind && rows[q].status === 'queued') {
        return { ok: true, item: rows[q] };
      }
    }
    return { ok: true, item: printRowReset_(row), requeued: true };
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

function isPrintAction_(a) { return a === 'printMark' || a === 'printEnqueue' || a === 'printReprint' || a === 'printAutoSet' || a === 'printEnqueueBatch'; }

function printLock_(fn) {
  if (typeof withLock_ === 'function') return withLock_(fn);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
var PRINT_REV_KEY = 'oypPrintRev';
function printCache_() {
  try {
    if (typeof CacheService === 'undefined' || !CacheService.getScriptCache) return null;
    return CacheService.getScriptCache();
  } catch (e) { return null; }
}
function printRevRead_() {
  var c = printCache_();
  if (!c) return null;
  var v = c.get(PRINT_REV_KEY);
  return v == null || v === '' ? null : String(v);
}
function printRevBump_() {
  var c = printCache_();
  if (!c) return;
  c.put(PRINT_REV_KEY, String(new Date().getTime()), 21600);
}
function printRevEnsure_() {
  var v = printRevRead_();
  if (v != null) return v;
  var c = printCache_();
  if (!c) return null;
  c.put(PRINT_REV_KEY, '1', 21600);
  return '1';
}
function printBrief_(req) {
  if (!req) return false;
  var b = req.brief;
  return b === 1 || b === true || b === '1' || b === 'true';
}
function printProps_() {
  try {
    if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) return null;
    return PropertiesService.getScriptProperties();
  } catch (e) { return null; }
}
function printAutoOn_() {
  var p = printProps_();
  if (!p) return true;
  var v = p.getProperty('print_auto');
  if (v == null || v === '') return true;
  return v === '1' || v === 'true' || v === 'on';
}
function printAutoSet_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  var p = printProps_();
  if (!p) return { ok: false, error: 'Auto-print is not available yet' };
  var on = true;
  if (req && (req.on === false || req.on === 0 || req.on === '0' || req.auto === false || req.auto === 0 || req.auto === '0')) on = false;
  p.setProperty('print_auto', on ? '1' : '0');
  printRevBump_();
  return { ok: true, auto: on, rev: printRevRead_() };
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
function printEnqueueRun_(jo, kind, by, reprint, manual) {
  var pack = printReadRows_(), now = new Date().toISOString();
  var allow = !!manual || !!reprint || printAutoOn_();
  var res = printRowsEnqueue_(pack.rows, jo, kind, by, now, reprint, allow);
  if (res.created || res.requeued) {
    printWriteRow_(pack, res.item);
    printRevBump_();
  }
  if (res.item) res.item = printDecorate_(res.item);
  res.auto = printAutoOn_();
  return res;
}
var PRINT_BATCH_CAP = 200;
function printJoParts_(jo) {
  var n = printNormJo_(jo);
  var m = n.match(/^(\d{2})-(\d{3,4})([A-Z])?$/);
  if (!m) return null;
  return { yy: m[1], n: parseInt(m[2], 10), suf: m[3] || '', jo: n };
}
function printBatchJobs_(req) {
  req = req || {};
  var list = [], i, it, jo, kind, items = req.items || req.jobs || [];
  if (items && items.length) {
    for (i = 0; i < items.length; i++) {
      it = items[i] || {};
      jo = printNormJo_(typeof it === 'string' ? it : it.jo);
      kind = printKind_((it && it.kind) || req.kind);
      if (jo && kind) list.push({ jo: jo, kind: kind });
    }
  } else if (req.from || req.to) {
    kind = printKind_(req.kind);
    if (!kind) return { ok: false, error: 'Pick a sticker type' };
    var a = printJoParts_(req.from), b = printJoParts_(req.to);
    if (!a || !b) return { ok: false, error: 'Use JO numbers like 26-280 and 26-300' };
    if (a.yy !== b.yy) return { ok: false, error: 'From and To need the same year' };
    var lo = Math.min(a.n, b.n), hi = Math.max(a.n, b.n);
    var look = printLookup_(), hit = {}, keys = Object.keys(look.jobs), p;
    keys.forEach(function (key) {
      p = printJoParts_(key);
      if (!p || p.yy !== a.yy || p.n < lo || p.n > hi) return;
      hit[p.jo] = p;
    });
    Object.keys(hit).sort(function (x, y) {
      if (hit[x].n !== hit[y].n) return hit[x].n - hit[y].n;
      return hit[x].suf < hit[y].suf ? -1 : hit[x].suf > hit[y].suf ? 1 : 0;
    }).forEach(function (id) { list.push({ jo: id, kind: kind }); });
  } else return { ok: false, error: 'Need stickers to queue' };
  var seen = {}, uniq = [];
  list.forEach(function (job) {
    var id = job.jo + '\n' + job.kind;
    if (seen[id]) return;
    seen[id] = 1;
    uniq.push(job);
  });
  if (uniq.length > PRINT_BATCH_CAP) return { ok: false, error: 'Queue up to 200 stickers at a time', code: 'CAP', count: uniq.length };
  return { ok: true, jobs: uniq };
}
function printBatchOne_(rows, jo, kind, by, now) {
  jo = printNormJo_(jo);
  kind = printKind_(kind);
  if (!jo || !kind) return null;
  var queued = null, failed = null, i, row;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row.jo !== jo || row.kind !== kind) continue;
    if (row.status === 'queued') queued = row;
    else if (row.status === 'failed' && !failed) failed = row;
  }
  if (queued) return { item: queued, created: false, duplicate: true };
  if (failed) return { item: printRowReset_(failed), created: false, requeued: true };
  var item = {
    print_id: 'pq-' + String(now || '').replace(/\W/g, '').slice(-12) + '-' + rows.length + '-' + Math.floor(Math.random() * 1000000),
    jo: jo, kind: kind, status: 'queued', created_at: String(now || ''), created_by: String(by || ''),
    printed_at: '', printed_by: '', device_id: '', error: ''
  };
  rows.push(item);
  return { item: item, created: true };
}
function printWriteRows_(pack, rows) {
  if (!rows || !rows.length || !pack || !pack.sh || !pack.sh.getRange) return;
  var head = pack.head && pack.head.length ? pack.head : PRINT_COLS;
  var width = Math.max(head.length, 1), lines = [], r, c, k, line;
  for (r = 0; r < rows.length; r++) {
    line = [];
    for (c = 0; c < width; c++) { k = head[c]; line.push(PRINT_COLS.indexOf(k) >= 0 ? String(rows[r][k] || '') : ''); }
    lines.push(line);
  }
  var start = pack.sh.getLastRow() + 1;
  pack.sh.getRange(start, 1, lines.length, width).setNumberFormat('@').setValues(lines);
  for (r = 0; r < rows.length; r++) Object.defineProperty(rows[r], '_r', { value: start + r, enumerable: false, writable: true });
}
function printEnqueueBatch_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  var plan = printBatchJobs_(req);
  if (!plan.ok) return plan;
  if (req && (req.preview === 1 || req.preview === true || req.preview === '1')) return { ok: true, preview: true, count: plan.jobs.length, auto: printAutoOn_() };
  return printLock_(function () {
    var pack = printReadRows_(), now = new Date().toISOString(), by = user.username;
    var fresh = [], re = [], skipped = 0, i, one;
    for (i = 0; i < plan.jobs.length; i++) {
      one = printBatchOne_(pack.rows, plan.jobs[i].jo, plan.jobs[i].kind, by, now);
      if (!one) continue;
      if (one.created) fresh.push(one.item);
      else if (one.requeued) re.push(one.item);
      else skipped++;
    }
    if (fresh.length) printWriteRows_(pack, fresh);
    for (i = 0; i < re.length; i++) printWriteRow_(pack, re[i]);
    if (fresh.length || re.length) printRevBump_();
    return { ok: true, queued: fresh.length + re.length, skipped: skipped, auto: printAutoOn_() };
  });
}
function printEnqueue_(jo, kind, actor, opts) {
  opts = opts || {};
  var by = typeof actor === 'string' ? actor : (actor && actor.username) || '';
  if (opts.locked) return printEnqueueRun_(jo, kind, by, !!opts.reprint, !!opts.manual); // the caller already holds the script lock (prodMove_)
  return printLock_(function () { return printEnqueueRun_(jo, kind, by, !!opts.reprint, !!opts.manual); });
}
function printMark_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  return printLock_(function () {
    var pack = printReadRows_(), now = new Date().toISOString();
    var res = printRowsMark_(pack.rows, String(req.print_id || ''), String(req.mark || req.op || ''), String(req.device_id || ''), user.username, now, req.error);
    if (res.ok && res.item) {
      printWriteRow_(pack, res.item);
      printRevBump_();
    }
    if (res.item) res.item = printDecorate_(res.item);
    return res;
  });
}
function printQueue_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (printBrief_(req) && !(req.jo && printNormJo_(req.jo))) return { ok: true, brief: true, rev: printRevRead_(), auto: printAutoOn_() };
  var pack = printReadRows_(), look = printLookup_();
  var out = { ok: true, rev: printRevEnsure_(), auto: printAutoOn_(), items: printRowsList_(pack.rows).map(function (r) { return printDecorate_(r, look); }) };
  if (req && req.jo && printNormJo_(req.jo)) out.spec = printDecorate_({ jo: printNormJo_(req.jo) }, look); // read only: specs for a PNG of one JO
  return out;
}
function handlePrint_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (req.action === 'printMark') return printMark_(req, user);
  if (req.action === 'printAutoSet') return printAutoSet_(req, user);
  if (req.action === 'printEnqueueBatch') return printEnqueueBatch_(req, user);
  return printEnqueue_(req.jo, req.kind, user.username, { reprint: req.action === 'printReprint' || !!req.reprint, manual: !!req.manual });
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
