/**
 * OYP staff: save or clear a JO profile photo from Inventory (Add photo / Change photo / Remove photo).
 * Paste as a NEW script file named PhotoSet, or replace the whole PhotoSet file on an update.
 * Do not paste this over PhotoFast.gs, InventoryPages.gs, JobSync.gs, or Auth.gs.
 *
 * Auth.gs handleAction_, on its own line immediately UNDER the PhotoFast hook (already there after the first paste):
 *   if (typeof isPhotoSetAction_ === 'function' && isPhotoSetAction_(a)) return handlePhotoSet_(req, s.user); // PhotoSet.gs
 *
 * photoSet is a write. Do not add it to Fast.gs FAST.READS or FAST.CACHE.
 * Remove photo uses the same photoSet action (req.remove === true). No new Auth.gs line.
 * Full steps: paste/SETUP-photo-set.txt
 * Editor: https://script.google.com/home/projects/17TdK0I66eGV_3XpM8OSPw9L7BlEbknYvJKI8JEMecrSCxLh4bhdihCXJ/edit
 * Then Deploy > Manage deployments > pencil > New version > Deploy. Do not use New deployment.
 *
 * Saves <JO>-photo-<timestamp>.jpg into the JO folder (JobOrders.drive_folder_id,
 * or Job Order Cards/<JO> when that cell is empty). Sets product_photo_file_id,
 * updated_at, and updated_by. Writes drive_folder_id only when the cell was empty.
 * Does not delete the previous Drive file and does not change any other cell.
 * Remove photo clears only product_photo_file_id (plus updated_at and updated_by).
 * The Drive file stays. AuditLog action photoRemove stores the old file id.
 */
var PHOTO_SET_ROLES = { admin: true, production_manager: true };
var PHOTO_SET_PART = 90000;
var PHOTO_SET_MAX = 8000000;

function isPhotoSetAction_(a) {
  a = String(a || '');
  return a === 'photoSet';
}

function handlePhotoSet_(req, user) {
  if (!user || !user.username) {
    try {
      var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req && req.session) : null;
      if (sess && sess.user) user = sess.user;
    } catch (e0) {}
  }
  if (!user || !user.role) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  if (!req || req.action !== 'photoSet') return { ok: false, error: 'Unknown action' };
  if (!PHOTO_SET_ROLES[user.role]) {
    psAudit_((user && user.username) || '', 'denied', 'photoSet', req.device_id, 'role ' + (user.role || ''));
    return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  }
  try {
    if (typeof withLock_ === 'function') return withLock_(function () { return photoSet_(req, user); });
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return photoSet_(req, user); }
    finally { lock.releaseLock(); }
  } catch (err) {
    return { ok: false, error: String(err && err.message || err).slice(0, 300) };
  }
}

function photoSet_(req, user) {
  if (typeof jobSet_ !== 'function' || typeof jobRows_ !== 'function') return { ok: false, error: 'JobOrders is not available' };
  if (typeof ss_ === 'function') {
    var book = ss_();
    if (!book || !book.getSheetByName || !book.getSheetByName('JobOrders')) return { ok: false, error: 'JobOrders tab is missing' };
  }
  var joRaw = psStr_(req.jo);
  if (!psJoOk_(joRaw)) return { ok: false, error: 'Missing JO' };
  var key = psKey_(joRaw);
  var rows = jobRows_('JobOrders') || [];
  var row = null, i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i] && psKey_(rows[i].jo) === key) { row = rows[i]; break; }
  }
  if (!row || !row._row) return { ok: false, error: 'Not found' };
  var joName = psStr_(row.jo);
  if (!psJoOk_(joName)) return { ok: false, error: 'Missing JO' };

  if (req.remove === true) {
    var oldOnly = psStr_(row.product_photo_file_id);
    if (!oldOnly) return { ok: true, removed: false, jo: joName };
    var tRem = (typeof now_ === 'function') ? now_() : new Date().toISOString();
    jobSet_('JobOrders', row._row, { product_photo_file_id: '', updated_at: tRem, updated_by: user.username });
    psCacheClear_(key, [oldOnly, psStr_(row.photo_file_id), psStr_(row.piece_photo_file_id)]);
    psAudit_(user.username, 'photoRemove', joName, req.device_id, oldOnly);
    return { ok: true, removed: true, jo: joName, old_id: oldOnly };
  }

  var parts = psInt_(req.parts);
  if (isNaN(parts) || parts < 1) parts = 1;
  if (parts > 80) return { ok: false, error: 'That photo is too large' };
  var part = psInt_(req.part);
  if (isNaN(part)) part = 0;
  if (part < 0 || part >= parts) return { ok: false, error: 'Upload was interrupted. Try the photo again' };
  var b64 = psB64_(req.data);
  if (!b64) return { ok: false, error: 'That file is not a photo' };
  if (b64.length > PHOTO_SET_PART) return { ok: false, error: 'That photo is too large' };
  if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return { ok: false, error: 'That file is not a photo' };

  var token = '';
  if (parts > 1) {
    token = String(req.upload || '');
    if (!/^[a-z0-9]{8,40}$/.test(token)) return { ok: false, error: 'Upload was interrupted. Try the photo again' };
    var cache = CacheService.getScriptCache();
    cache.put('psu:' + token + ':' + part, b64, 600);
    if (part < parts - 1) return { ok: true, part: part, parts: parts };
    b64 = '';
    for (i = 0; i < parts; i++) {
      var bit = cache.get('psu:' + token + ':' + i);
      if (!bit) return { ok: false, error: 'Upload was interrupted. Try the photo again' };
      b64 += bit;
    }
    if (b64.length > PHOTO_SET_MAX) return { ok: false, error: 'That photo is too large' };
  } else if (b64.length > PHOTO_SET_MAX) {
    return { ok: false, error: 'That photo is too large' };
  }

  var bytes;
  try { bytes = Utilities.base64Decode(b64); }
  catch (e1) { return { ok: false, error: 'That file is not a photo' }; }
  if (!bytes || !bytes.length || bytes.length > 6000000) return { ok: false, error: 'That photo is too large' };

  var place = psJoFolder_(row, joName);
  if (!place || !place.folder) return { ok: false, error: 'Could not open the JO folder' };
  var fname = joName + '-photo-' + psStamp_() + '.jpg';
  var blob = Utilities.newBlob(bytes, 'image/jpeg', fname);
  var file = place.folder.createFile(blob);
  if (!file || !file.getId()) return { ok: false, error: 'Could not save the photo' };
  try { if (file.getName() !== fname && file.setName) file.setName(fname); } catch (e2) {}
  var fileId = String(file.getId());

  var oldProduct = psStr_(row.product_photo_file_id);
  var oldPhoto = psStr_(row.photo_file_id);
  var oldPiece = psStr_(row.piece_photo_file_id);
  var hadFolder = psStr_(row.drive_folder_id);
  var t = (typeof now_ === 'function') ? now_() : new Date().toISOString();
  var patch = { product_photo_file_id: fileId, updated_at: t, updated_by: user.username };
  var folderId = '';
  try { folderId = place.folder.getId ? String(place.folder.getId() || '') : ''; } catch (e3) { folderId = ''; }
  if (!hadFolder && folderId) patch.drive_folder_id = folderId;
  jobSet_('JobOrders', row._row, patch);
  psCacheClear_(key, [fileId, oldProduct, oldPhoto, oldPiece]);
  if (parts > 1) psCacheDrop_(token, parts);
  psAudit_(user.username, 'photoSet', joName, req.device_id, fileId);
  return { ok: true, id: fileId, jo: joName, name: fname };
}

function psJoOk_(s) {
  s = String(s || '');
  if (!s || s.length > 40) return false;
  if (s.indexOf('/') >= 0 || s.indexOf('\\') >= 0) return false;
  return true;
}

function psStr_(s) {
  if (typeof jobStr_ === 'function') return jobStr_(s);
  return String(s == null ? '' : s).trim();
}

function psKey_(s) {
  if (typeof jobKey_ === 'function') return jobKey_(s);
  return String(s || '').trim().toUpperCase();
}

function psInt_(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.floor(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return NaN;
}

function psB64_(data) {
  var s = String(data || '').replace(/\s/g, '');
  var c = s.indexOf(',');
  if (s.indexOf('base64') >= 0 && c >= 0) s = s.slice(c + 1);
  return s;
}

function psStamp_() {
  var d = new Date();
  try {
    var tz = 'Asia/Manila';
    try { if (typeof Session !== 'undefined' && Session.getScriptTimeZone) tz = Session.getScriptTimeZone() || tz; } catch (e1) {}
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) return Utilities.formatDate(d, tz, 'yyyyMMdd-HHmmss');
  } catch (e2) {}
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return String(d.getUTCFullYear()) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + '-' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds());
}

function psAlive_(f) {
  if (!f) return false;
  try { if (f.isTrashed && f.isTrashed()) return false; } catch (e) { return false; }
  return true;
}

function psFirstAlive_(it) {
  var f;
  if (!it) return null;
  while (it.hasNext && it.hasNext()) {
    f = it.next();
    if (psAlive_(f)) return f;
  }
  return null;
}

function psRootCards_() {
  var found = psFirstAlive_(DriveApp.getFoldersByName('Job Order Cards'));
  if (found) return found;
  return DriveApp.createFolder('Job Order Cards');
}

function psChild_(parent, name) {
  var found = psFirstAlive_(parent.getFoldersByName(name));
  if (found) return found;
  return parent.createFolder(name);
}

function psJoFolder_(row, joName) {
  var id = psStr_(row.drive_folder_id), folder = null;
  if (id) {
    try { folder = DriveApp.getFolderById(id); } catch (e) { folder = null; }
    if (psAlive_(folder)) return { folder: folder };
  }
  return { folder: psChild_(psRootCards_(), joName) };
}

function psCacheClear_(joKey, ids) {
  var cache = CacheService.getScriptCache();
  var keys = [], seen = {}, i, n, id, px, base, prefixes, p;
  prefixes = ['pfj1:', 'pfj2:', 'pfd1:', 'pfd2:', 'pfc1:', 'pfc2:'];
  for (p = 0; p < prefixes.length; p++) keys.push(prefixes[p] + joKey);
  for (i = 0; i < ids.length; i++) {
    id = ids[i];
    if (!id || seen[id]) continue;
    seen[id] = 1;
    for (px = 0; px < 2; px++) {
      base = 'pf1:' + (px === 0 ? 300 : 1600) + ':' + id;
      keys.push(base);
      keys.push(base + '#n');
      for (n = 0; n < 4; n++) keys.push(base + '#' + n);
    }
  }
  try {
    if (cache.removeAll) cache.removeAll(keys);
    else for (i = 0; i < keys.length; i++) { try { cache.remove(keys[i]); } catch (e1) {} }
  } catch (e2) {
    for (i = 0; i < keys.length; i++) { try { cache.remove(keys[i]); } catch (e3) {} }
  }
}

function psCacheDrop_(token, parts) {
  var cache = CacheService.getScriptCache(), keys = [], i;
  for (i = 0; i < parts; i++) keys.push('psu:' + token + ':' + i);
  try {
    if (cache.removeAll) cache.removeAll(keys);
    else for (i = 0; i < keys.length; i++) { try { cache.remove(keys[i]); } catch (e1) {} }
  } catch (e2) {
    for (i = 0; i < keys.length; i++) { try { cache.remove(keys[i]); } catch (e3) {} }
  }
}

function psAudit_(by, action, jo, device, detail) {
  if (typeof audit_ === 'function') {
    try { audit_(by, action, jo, device, detail); } catch (e) {}
    return;
  }
  try {
    if (typeof ss_ !== 'function') return;
    var book = ss_();
    var sh = book && book.getSheetByName && book.getSheetByName('AuditLog');
    if (sh && sh.appendRow) sh.appendRow([new Date(), by || '', action || '', jo || '', device || '', detail || '']);
  } catch (e2) {}
}
