/**
 * OYP staff inventory count for the UHF RFID handheld.
 * Paste as a NEW script file named InventoryCount. Do not paste this over
 * InventoryPages.gs, JobSync.gs, or Auth.gs.
 *
 * The handheld is a keyboard wedge: it types an EPC (hex) and Enter. The page
 * keeps those reads until Finish. countLoad only adds missing header cells.
 * linkEpc writes one EPC cell, after the page has confirmed. countFinish writes
 * last_counted and count_status. It writes missing rows only when mark_missing
 * is true (the page asks before it sends that).
 *
 * Auth.gs handleAction_ (the action router doPost calls), on its own line
 * immediately after the InvBulk hook, or after the JobSync hook if InvBulk
 * is not there. Before the unknown-action error. Same names as that hook:
 *   if (typeof isCountAction_ === 'function' && isCountAction_(a)) return handleCount_(req, s.user); // InventoryCount.gs
 *
 * No new OAuth scopes. The JO is stored with its letter (26-287B stays 26-287B).
 */
var COUNT_ROLES = { admin: 1, production_manager: 1, staff: 1 };
var COUNT_HEADERS = ['EPC', 'last_counted', 'count_status'];
var COUNT_OFF = { sold: 1, archived: 1, consigned: 1, cancelled: 1, canceled: 1, draft: 1, shipped: 1, picked_up: 1, working: 1, queue: 1 };

function isCountAction_(a) {
  a = String(a || '');
  return a === 'countLoad' || a === 'linkEpc' || a === 'countFinish';
}

function countUser_(req, user) {
  if (user && user.username && user.role) return user;
  try {
    var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req || {}) : null;
    if (sess && sess.user && sess.user.username) return sess.user;
    if (sess && sess.username) return sess;
  } catch (e0) {}
  return user || null;
}

function countLocked_(fn) {
  if (typeof withLock_ === 'function') return withLock_(fn);
  return fn();
}

function handleCount_(req, user) {
  user = countUser_(req, user);
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (!COUNT_ROLES[String(user.role || '')]) {
    try { audit_(user.username || '', 'denied', 'count', req && req.device_id, 'role ' + (user.role || '')); } catch (e1) {}
    return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  }
  var a = String(req && req.action || '');
  try {
    if (a === 'countLoad') return countLocked_(function () { return countLoad_(req, user); });
    if (a === 'linkEpc') return countLocked_(function () { return linkEpc_(req, user); });
    if (a === 'countFinish') return countLocked_(function () { return countFinish_(req, user); });
  } catch (err) {
    return { ok: false, error: String(err && err.message || err).slice(0, 300) };
  }
  return { ok: false, error: 'Unknown action' };
}

function countSheet_() {
  if (typeof ss_ !== 'function') return null;
  var ss = ss_();
  if (!ss || !ss.getSheetByName) return null;
  return ss.getSheetByName('Items');
}

function countStr_(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v.toISOString();
  return String(v).trim();
}

function countCols_(sheet) {
  var last = sheet.getLastColumn();
  if (!last) return { headers: [], map: {} };
  var row = sheet.getRange(1, 1, 1, last).getValues()[0];
  var headers = [], map = {}, i, name;
  for (i = 0; i < row.length; i++) {
    name = countStr_(row[i]);
    headers.push(name);
    if (name && !map[name.toLowerCase()]) map[name.toLowerCase()] = i + 1;
  }
  return { headers: headers, map: map };
}

/** Header cells only. Never writes a data cell, and never replaces a header that is already there. */
function countEnsure_(sheet) {
  var info = countCols_(sheet), added = [], i, name, col;
  for (i = 0; i < COUNT_HEADERS.length; i++) {
    name = COUNT_HEADERS[i];
    if (info.map[name.toLowerCase()]) continue;
    col = info.headers.length + 1;
    sheet.getRange(1, col).setValue(name);
    info.headers.push(name);
    info.map[name.toLowerCase()] = col;
    added.push(name);
  }
  return { headers: info.headers, map: info.map, added: added };
}

function countTable_(sheet) {
  var ensured = countEnsure_(sheet);
  var lastRow = sheet.getLastRow();
  var width = ensured.headers.length;
  var values = (lastRow < 2 || !width) ? [] : sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var rows = [], i, c, obj, key;
  for (i = 0; i < values.length; i++) {
    obj = { _row: i + 2 };
    for (c = 0; c < ensured.headers.length; c++) {
      key = ensured.headers[c];
      if (!key) continue;
      obj[key] = values[i][c];
    }
    rows.push(obj);
  }
  return { headers: ensured.headers, map: ensured.map, rows: rows, added: ensured.added };
}

function countCell_(row, names) {
  var i, k, keys, want, v;
  keys = Object.keys(row);
  for (i = 0; i < names.length; i++) {
    want = String(names[i]).toLowerCase();
    for (k = 0; k < keys.length; k++) {
      if (keys[k] === '_row' || keys[k].toLowerCase() !== want) continue;
      v = row[keys[k]];
      if (v == null || v === '') continue;
      return v;
    }
  }
  return '';
}

function countJo_(raw) {
  var s = countStr_(raw).toUpperCase().replace(/\s+/g, '');
  var m = s.match(/^(\d{2})-(\d{3,4})([A-Z])?$/);
  if (m) return m[1] + '-' + m[2] + (m[3] || '');
  m = s.match(/^(\d{2})(\d{3,4})([A-Z])?$/);
  if (m) return m[1] + '-' + m[2] + (m[3] || '');
  return '';
}

function countEpc_(raw) {
  var s = countStr_(raw).toUpperCase().replace(/[\s:\-]+/g, '');
  if (!/^[0-9A-F]{8,128}$/.test(s)) return '';
  return s;
}

function countOnHand_(row) {
  var flag = countStr_(countCell_(row, ['on_hand'])).toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  var loc = countStr_(countCell_(row, ['location'])).toLowerCase();
  var st = countStr_(countCell_(row, ['status'])).toLowerCase();
  if (COUNT_OFF[loc] || COUNT_OFF[st]) return false;
  return !!(countJo_(countCell_(row, ['jo', 'job', 'jo_number'])) || countStr_(countCell_(row, ['item_id', 'sku', 'code'])));
}

function countPhoto_(row) {
  var url = countStr_(countCell_(row, ['photo', 'photo_url', 'image', 'thumb', 'picture']));
  var id = countStr_(countCell_(row, ['photo_id', 'photo_file_id', 'file_id']));
  if (/^https?:|^data:|^blob:|^\//i.test(url)) return { photo: url, photo_id: '' };
  if (/^[a-zA-Z0-9_-]{8,80}$/.test(url) && !id) return { photo: '', photo_id: url };
  if (/^[a-zA-Z0-9_-]{8,80}$/.test(id)) return { photo: '', photo_id: id };
  return { photo: '', photo_id: '' };
}

function countPublic_(row) {
  var jo = countJo_(countCell_(row, ['jo', 'job', 'jo_number']));
  var itemId = countStr_(countCell_(row, ['item_id', 'sku', 'code']));
  var ph = countPhoto_(row);
  return {
    id: itemId || ('r' + row._row),
    row: row._row,
    item_id: itemId,
    jo: jo,
    description: countStr_(countCell_(row, ['description', 'name', 'title'])),
    client: countStr_(countCell_(row, ['client', 'client_name', 'customer'])),
    location: countStr_(countCell_(row, ['location'])),
    epc: countEpc_(countCell_(row, ['epc'])),
    photo: ph.photo,
    photo_id: ph.photo_id,
    last_counted: countStr_(countCell_(row, ['last_counted'])),
    count_status: countStr_(countCell_(row, ['count_status']))
  };
}

function countFind_(rows, spec) {
  spec = spec || {};
  var id = countStr_(spec.id);
  var itemId = countStr_(spec.item_id);
  var jo = countJo_(spec.jo);
  var i, pub, joHit = null;
  for (i = 0; i < rows.length; i++) {
    pub = countPublic_(rows[i]);
    if (id && pub.id === id) return rows[i];
    if (itemId && pub.item_id === itemId) return rows[i];
    if (jo && pub.jo === jo && !joHit) joHit = rows[i];
  }
  if (id || itemId) return null;
  return joHit;
}

function countEpcOwner_(rows, epc, exceptRow) {
  var i, cur;
  for (i = 0; i < rows.length; i++) {
    if (rows[i]._row === exceptRow) continue;
    cur = countEpc_(countCell_(rows[i], ['epc']));
    if (cur && cur === epc) return rows[i];
  }
  return null;
}

function countSet_(sheet, map, row, key, value) {
  var col = map[String(key).toLowerCase()];
  if (!col) return false;
  sheet.getRange(row, col).setValue(value);
  return true;
}

function countLoad_(req, user) {
  var sheet = countSheet_();
  if (!sheet) return { ok: false, error: 'Items tab is missing' };
  var table = countTable_(sheet), items = [], i;
  for (i = 0; i < table.rows.length; i++) {
    if (!countOnHand_(table.rows[i])) continue;
    items.push(countPublic_(table.rows[i]));
  }
  return { ok: true, items: items };
}

function linkEpc_(req, user) {
  var epc = countEpc_(req && req.epc);
  if (!epc) return { ok: false, error: 'Scan a tag' };
  var sheet = countSheet_();
  if (!sheet) return { ok: false, error: 'Items tab is missing' };
  var table = countTable_(sheet);
  var row = countFind_(table.rows, req || {});
  if (!row) return { ok: false, error: 'No item for that JO' };
  var owner = countEpcOwner_(table.rows, epc, row._row);
  if (owner) {
    var other = countPublic_(owner);
    return { ok: false, error: 'That tag is already linked to ' + (other.jo || other.item_id || 'another item') };
  }
  var pub = countPublic_(row);
  var label = pub.jo || pub.item_id;
  if (!label) return { ok: false, error: 'That row has no JO' };
  if (pub.epc !== epc) countSet_(sheet, table.map, row._row, 'epc', epc);
  try { audit_(user.username, 'linkEpc', label, req.device_id, epc); } catch (e2) {}
  return { ok: true, jo: pub.jo, item_id: pub.item_id, epc: epc, message: 'Linked to ' + label };
}

function countFinish_(req, user) {
  var sheet = countSheet_();
  if (!sheet) return { ok: false, error: 'Items tab is missing' };
  var table = countTable_(sheet);
  var t = (typeof now_ === 'function') ? now_() : new Date().toISOString();
  var found = (req && Array.isArray(req.found)) ? req.found : [];
  var mark = !!(req && (req.mark_missing === true || req.mark_missing === 'true' || req.mark_missing === 1));
  var missing = (mark && req && Array.isArray(req.missing)) ? req.missing : [];
  if (found.length + missing.length > 2000) return { ok: false, error: 'Too many rows' };
  var nFound = 0, nMiss = 0, skipped = [], touched = {}, i, row, spec;
  for (i = 0; i < found.length; i++) {
    spec = found[i] || {};
    row = countFind_(table.rows, spec);
    if (!row || !countOnHand_(row)) { skipped.push(countStr_(spec.jo || spec.id)); continue; }
    countSet_(sheet, table.map, row._row, 'last_counted', t);
    countSet_(sheet, table.map, row._row, 'count_status', 'found');
    touched[row._row] = 1;
    nFound++;
  }
  for (i = 0; i < missing.length; i++) {
    spec = missing[i] || {};
    row = countFind_(table.rows, spec);
    if (!row || touched[row._row] || !countOnHand_(row)) { skipped.push(countStr_(spec.jo || spec.id)); continue; }
    countSet_(sheet, table.map, row._row, 'last_counted', t);
    countSet_(sheet, table.map, row._row, 'count_status', 'missing');
    touched[row._row] = 1;
    nMiss++;
  }
  var unknown = (req && Array.isArray(req.unknown)) ? req.unknown.length : 0;
  try { audit_(user.username, 'countFinish', '', req && req.device_id, nFound + ' found' + (mark ? ', ' + nMiss + ' missing' : '')); } catch (e3) {}
  return { ok: true, found: nFound, missing: nMiss, unknown: unknown, at: t, skipped: skipped };
}
