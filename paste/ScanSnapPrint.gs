/* ScanSnap stickers. New file. Do not replace PrintQueue.gs or JoInbox.gs.
   Print jewelry tag queues jewelry_tag (B1 jewelry tag).
   Print QR tag queues jo_card (B31 JO sticker, 30x20, QR on the left). The queue has no qr_tag kind.
   Both default ON when the key is missing. The owner turns them off for a backlog batch.
   Keys scanner.snap_jewelry and scanner.snap_qr live in Script Properties, and on the Settings tab when that tab already has key and value columns.
   A repeat of the same JO + tag + scan file id does not call the queue again.
   printEnqueue_ is called with manual:true so the phone's print_auto switches are left alone. */
var SNAP_JEWELRY_KEY = 'scanner.snap_jewelry';
var SNAP_QR_KEY = 'scanner.snap_qr';
var SNAP_SEEN_SHEET = 'SnapSeen';
var SNAP_SEEN_PREFIX = 'oypSnap.';

function snapProps_() {
  try {
    if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) return null;
    return PropertiesService.getScriptProperties();
  } catch (e) { return null; }
}
function snapBlank_(v) { return v == null || String(v) === ''; }
function snapOn_(v) {
  if (snapBlank_(v)) return true;
  if (v === true || v === 1) return true;
  var s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}
function snapBit_(v) { return snapOn_(v) ? '1' : '0'; }
function snapRoleOk_(user) {
  return !!(user && user.username && (user.role === 'admin' || user.role === 'production_manager'));
}
function snapSheetValue_(key) {
  var rows = [], i;
  try {
    if (typeof jobRows_ === 'function') rows = jobRows_('Settings') || [];
  } catch (e) { rows = []; }
  for (i = 0; i < rows.length; i++) {
    if (!rows[i] || String(rows[i].key || '') !== key) continue;
    return { found: true, on: snapOn_(rows[i].value) };
  }
  return { found: false, on: true };
}
function snapPropValue_(key) {
  var p = snapProps_(), v;
  if (!p || !p.getProperty) return { found: false, on: true };
  v = p.getProperty(key);
  if (snapBlank_(v)) return { found: false, on: true };
  return { found: true, on: snapOn_(v) };
}
function snapFlag_(key) {
  var sheet = snapSheetValue_(key);
  if (sheet.found) return sheet.on;
  return snapPropValue_(key).on;
}
function snapLog_(ss, user, key, oldVal, value, now) {
  var sh, head, width, line, c, values;
  if (!ss || !ss.getSheetByName) return;
  sh = ss.getSheetByName('SettingsLog');
  if (!sh || sh.getLastRow() < 1) return;
  values = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues();
  head = [];
  for (c = 0; c < values[0].length; c++) head.push(String(values[0][c] || '').trim());
  width = head.length;
  if (!width || head.indexOf('key') < 0) return;
  line = [];
  for (c = 0; c < width; c++) line.push('');
  function put(name, val) { var i = head.indexOf(name); if (i >= 0) line[i] = val; }
  put('at', now);
  put('changed_at', now);
  put('by', user.username);
  put('changed_by', user.username);
  put('key', key);
  put('old_value', oldVal);
  put('new_value', value);
  put('note', 'Scan snap');
  sh.getRange(sh.getLastRow() + 1, 1, 1, width).setValues([line]);
}
function snapWriteSheet_(key, value, user) {
  var ss, sh, values, head, r, c, keyCol, valCol, width, line, now, oldVal;
  try {
    ss = typeof ss_ === 'function' ? ss_() : (typeof SpreadsheetApp !== 'undefined' ? SpreadsheetApp.getActive() : null);
  } catch (e) { return; }
  if (!ss || !ss.getSheetByName) return;
  sh = ss.getSheetByName('Settings');
  if (!sh || sh.getLastRow() < 1) return;
  values = sh.getDataRange().getValues();
  head = [];
  for (c = 0; c < values[0].length; c++) head.push(String(values[0][c] || '').trim());
  keyCol = head.indexOf('key');
  valCol = head.indexOf('value');
  if (keyCol < 0 || valCol < 0) return;
  now = (typeof now_ === 'function') ? now_() : new Date().toISOString();
  for (r = 1; r < values.length; r++) {
    if (String(values[r][keyCol] || '') !== key) continue;
    oldVal = String(values[r][valCol] || '');
    sh.getRange(r + 1, valCol + 1).setValue(value);
    if (head.indexOf('changed_at') >= 0) sh.getRange(r + 1, head.indexOf('changed_at') + 1).setValue(now);
    if (head.indexOf('changed_by') >= 0) sh.getRange(r + 1, head.indexOf('changed_by') + 1).setValue(user.username);
    snapLog_(ss, user, key, oldVal, value, now);
    return;
  }
  width = head.length;
  line = [];
  for (c = 0; c < width; c++) line.push('');
  line[keyCol] = key;
  line[valCol] = value;
  if (head.indexOf('changed_at') >= 0) line[head.indexOf('changed_at')] = now;
  if (head.indexOf('changed_by') >= 0) line[head.indexOf('changed_by')] = user.username;
  sh.getRange(sh.getLastRow() + 1, 1, 1, width).setValues([line]);
  snapLog_(ss, user, key, '', value, now);
}
function snapWrite_(key, bit, user) {
  var p = snapProps_();
  if (p && p.setProperty) p.setProperty(key, bit);
  snapWriteSheet_(key, bit, user);
}
function snapPrintGet_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  return { ok: true, jewelry: snapFlag_(SNAP_JEWELRY_KEY), qr: snapFlag_(SNAP_QR_KEY) };
}
function snapPrintSet_(req, user) {
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (!snapRoleOk_(user)) return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  req = req || {};
  if (req.jewelry != null) snapWrite_(SNAP_JEWELRY_KEY, snapBit_(req.jewelry), user);
  if (req.qr != null) snapWrite_(SNAP_QR_KEY, snapBit_(req.qr), user);
  return snapPrintGet_(req, user);
}
function isSnapPrintAction_(a) { return a === 'snapPrintGet' || a === 'snapPrintSet'; }
function handleSnapPrint_(req, user) {
  if (req && req.action === 'snapPrintSet') return snapPrintSet_(req, user);
  return snapPrintGet_(req, user);
}
function snapNorm_(s) {
  if (typeof printNormJo_ === 'function') return printNormJo_(s);
  var m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})([A-Z])?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : '';
}
/* One Script Property value is about 9KB. A single list of seen scans breaks around 250
   entries, and a 700 JO backlog would throw or print twice. Each JO + tag + scan file
   is its own short property, and the same id is a row on SnapSeen. Nothing is dropped:
   a rolling cap would forget an old file and queue it again. */
function snapSeenMem_() {
  if (!snapSeenMem_.map) snapSeenMem_.map = {};
  return snapSeenMem_.map;
}
function snapSeenId_(jo, kind, fileId) {
  return String(jo || '') + '|' + String(kind || '') + '|' + String(fileId || '');
}
function snapSeenKey_(id) {
  return SNAP_SEEN_PREFIX + String(id || '').replace(/[\r\n]/g, '');
}
function snapSs_() {
  try {
    if (typeof ss_ === 'function') return ss_();
    if (typeof SpreadsheetApp !== 'undefined') return SpreadsheetApp.getActive();
  } catch (e) {}
  return null;
}
function snapSeenSheet_(create) {
  var ss, sh;
  ss = snapSs_();
  if (!ss || !ss.getSheetByName) return null;
  sh = ss.getSheetByName(SNAP_SEEN_SHEET);
  if (sh || !create) return sh;
  try {
    if (!ss.insertSheet) return null;
    sh = ss.insertSheet(SNAP_SEEN_SHEET);
    if (sh && sh.getRange) sh.getRange(1, 1, 1, 2).setValues([['id', 'at']]);
    return sh;
  } catch (e1) { return null; }
}
function snapSeenInSheet_(id) {
  var sh, last, values, i;
  sh = snapSeenSheet_(false);
  if (!sh || !sh.getLastRow || sh.getLastRow() < 2) return false;
  last = sh.getLastRow();
  values = sh.getRange(2, 1, last - 1, 1).getValues();
  for (i = 0; i < values.length; i++) if (String(values[i][0] || '') === id) return true;
  return false;
}
function snapSeenHas_(id) {
  var mem, p, key;
  mem = snapSeenMem_();
  if (mem[id]) return true;
  key = snapSeenKey_(id);
  p = snapProps_();
  try {
    if (p && p.getProperty && p.getProperty(key) === '1') { mem[id] = 1; return true; }
  } catch (e) {}
  if (snapSeenInSheet_(id)) { mem[id] = 1; return true; }
  return false;
}
function snapSeenAdd_(id) {
  var mem, p, sh, row;
  mem = snapSeenMem_();
  mem[id] = 1;
  p = snapProps_();
  try { if (p && p.setProperty) p.setProperty(snapSeenKey_(id), '1'); } catch (e) {}
  sh = snapSeenSheet_(true);
  if (!sh || !sh.getRange) return;
  if (snapSeenInSheet_(id)) return;
  row = (sh.getLastRow ? sh.getLastRow() : 0) + 1;
  if (row < 2) {
    sh.getRange(1, 1, 1, 2).setValues([['id', 'at']]);
    row = 2;
  }
  sh.getRange(row, 1, 1, 2).setValues([[id, new Date().toISOString()]]);
}
/* Call this once after a ScanSnap file becomes a JO. jo is the filed number. fileId is that scan's Drive file id. */
function snapPrintAfterFile_(jo, fileId) {
  var plan, seen, i, row, id, calls;
  jo = snapNorm_(jo);
  fileId = String(fileId || '');
  if (!jo || !fileId) return { ok: false, error: 'Need a JO and a scan file', calls: 0 };
  if (typeof printEnqueue_ !== 'function') return { ok: true, calls: 0, queue: false };
  plan = [
    [SNAP_JEWELRY_KEY, 'jewelry_tag'],
    [SNAP_QR_KEY, 'jo_card']
  ];
  calls = 0;
  for (i = 0; i < plan.length; i++) {
    row = plan[i];
    if (!snapFlag_(row[0])) continue;
    id = snapSeenId_(jo, row[1], fileId);
    if (snapSeenHas_(id)) continue;
    try {
      printEnqueue_(jo, row[1], 'scansnap', { manual: true });
      snapSeenAdd_(id);
      calls++;
    } catch (e1) {}
  }
  return { ok: true, calls: calls };
}
