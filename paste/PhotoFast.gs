/**
 * OYP staff photos: small thumbnails for lists, a medium image when a JO is opened.
 * Paste as a NEW script file named PhotoFast. Do not paste this over InventoryPages.gs,
 * Production.gs, JobSync.gs, or CustomerView.gs.
 *
 * Auth.gs handleAction_, on its own line immediately BEFORE the JobSync hook:
 *   if (typeof isPhotoFastAction_ === 'function' && isPhotoFastAction_(a)) return handlePhotoFast_(req, s.user); // PhotoFast.gs
 *
 * No new OAuth scopes. Uses the Drive scope and the external-request scope already granted,
 * and the Drive advanced service (v3) already enabled for OCR. Drive files stay private.
 * Lists ask for size 300. Opening a photo asks for size 1600. Size "original" is the full file,
 * and only the Open original button asks for it.
 */
var PF = { TILE: 300, MED: 1600, MAX: 60, CACHE: 95000, SECS: 21600, ORIG: 6000000, TILE_CAP: 150000, MED_CAP: 500000, WALKS: 4 };

function isPhotoFastAction_(a) {
  a = String(a || '');
  return a === 'photoThumbs' || a === 'photoFile';
}

function handlePhotoFast_(req, user) {
  if (!user || !user.username) {
    try {
      var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req && req.session) : null;
      if (sess && sess.user) user = sess.user;
    } catch (e0) {}
  }
  if (!user || !user.role) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  try {
    if (req.action === 'photoThumbs') return pfThumbs_(req, user);
    if (req.action === 'photoFile') return pfFile_(req, user);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err).slice(0, 300) };
  }
  return { ok: false, error: 'Unknown action' };
}

function pfPx_(size) {
  if (size === 'original' || size === 'orig') return 0;
  var n = parseInt(size, 10);
  return n >= 1000 ? PF.MED : PF.TILE;
}

function pfIdOk_(id) { return /^[a-zA-Z0-9_-]{8,80}$/.test(String(id || '')); }

function pfKey_(s) {
  if (typeof jobKey_ === 'function') return jobKey_(s);
  if (typeof normJO_ === 'function') return normJO_(s);
  return String(s || '').trim().toUpperCase();
}

function pfRows_(name) {
  if (typeof jobRows_ === 'function') return jobRows_(name);
  if (typeof readOpt_ === 'function') return readOpt_(name);
  if (typeof rows_ === 'function') return rows_(name);
  return [];
}

function pfScanRole_(user) {
  return user && (user.role === 'admin' || user.role === 'production_manager' || user.role === 'staff');
}

function pfJos_(v) {
  var a = Array.isArray(v) ? v : [], out = [], seen = {}, i, raw, key;
  for (i = 0; i < a.length && out.length < PF.MAX; i++) {
    raw = String(a[i] == null ? '' : a[i]).trim();
    key = pfKey_(raw);
    if (!key || seen[key]) continue;
    seen[key] = 1;
    out.push({ raw: raw, key: key });
  }
  return out;
}

function pfPairs_(v) {
  var a = Array.isArray(v) ? v : [], out = [], seen = {}, i, it, id, jo;
  for (i = 0; i < a.length && out.length < PF.MAX; i++) {
    it = a[i] || {};
    id = String(it.id || it.file_id || '');
    jo = pfKey_(it.jo);
    if (!pfIdOk_(id) || !jo || seen[id]) continue;
    seen[id] = 1;
    out.push({ jo: jo, id: id });
  }
  return out;
}

function pfOcr_() {
  var byJo = {}, all = {};
  pfRows_('OcrLog').forEach(function (r) {
    if (!r.file_id) return;
    if (r.review_state === 'discarded' || r.review_state === 'deleted' || r.review_state === 'replaced') return;
    var id = String(r.file_id), k = pfKey_(r.jo);
    all[id] = 1;
    if (!k) return;
    if (!byJo[k]) byJo[k] = {};
    byJo[k][id] = 1;
  });
  return { byJo: byJo, all: all };
}

function pfJobs_() {
  var map = {};
  pfRows_('JobOrders').forEach(function (j) {
    var k = pfKey_(j.jo);
    if (k && !map[k]) map[k] = j;
  });
  return map;
}

function pfCache_() { return CacheService.getScriptCache(); }

function pfPieceIds_(jo, job, scans) {
  scans = scans || {};
  var key = pfKey_(jo), cache = pfCache_(), hit = cache.get('pfj1:' + key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var j = job || null;
  if (!j) return { ids: [], found: null };
  if (typeof cvPhotoIds_ === 'function') {
    try {
      var cv = cvPhotoIds_(j) || [];
      if (cv.length) {
        var packed = { ids: cv.map(String), found: true };
        try { cache.put('pfj1:' + key, JSON.stringify(packed), 600); } catch (e2) {}
        return packed;
      }
    } catch (e3) {}
  }
  var out = [], scanName = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([A-Z])?-p\\d+', 'i');
  function ok(f) {
    if (!f || (f.isTrashed && f.isTrashed())) return false;
    var id = f.getId();
    if (!id || scans[id] || out.indexOf(id) >= 0) return false;
    if (scanName.test(String(f.getName() || ''))) return false;
    if (String(f.getMimeType() || '').indexOf('image/') !== 0) return false;
    return true;
  }
  var cols = ['product_photo_file_id', 'photo_file_id', 'piece_photo_file_id'];
  var raw = [];
  cols.forEach(function (c) { if (j[c]) raw.push(String(j[c])); });
  String(j.photo_file_ids || '').split(',').forEach(function (s) { if (s.trim()) raw.push(s.trim()); });
  raw.forEach(function (id) {
    if (!pfIdOk_(id)) return;
    try { var f = DriveApp.getFileById(id); if (ok(f)) out.push(f.getId()); } catch (e4) {}
  });
  var walks = PF.WALKS;
  function walk(folder) {
    if (!folder || walks <= 0 || out.length) return;
    ['product', 'cad', 'photos', 'piece'].forEach(function (name) {
      if (walks <= 0 || out.length) return;
      walks--;
      try {
        var it = folder.getFoldersByName(name);
        while (it.hasNext()) {
          var files = it.next().getFiles();
          while (files.hasNext()) { var x = files.next(); if (ok(x)) out.push(x.getId()); }
        }
      } catch (e5) {}
    });
  }
  if (!out.length && j.drive_folder_id) {
    try { walk(DriveApp.getFolderById(String(j.drive_folder_id))); } catch (e6) {}
  }
  var found = out.length ? true : (raw.length || j.drive_folder_id ? false : null);
  var pack = { ids: out, found: found };
  if (found !== null) { try { cache.put('pfj1:' + key, JSON.stringify(pack), 600); } catch (e7) {} }
  return pack;
}

function pfHeader_(res, name) {
  var h = (res && res.getHeaders && res.getHeaders()) || {}, want = String(name || '').toLowerCase(), keys = Object.keys(h), i;
  for (i = 0; i < keys.length; i++) if (String(keys[i]).toLowerCase() === want) return String(h[keys[i]] || '');
  return '';
}

function pfFetchAll_(urls, token) {
  if (!urls.length) return [];
  var first;
  try {
    first = UrlFetchApp.fetchAll(urls.map(function (u) {
      return { url: u, muteHttpExceptions: true, followRedirects: false, headers: { Authorization: 'Bearer ' + token } };
    }));
  } catch (e) { return urls.map(function () { return null; }); }
  var again = [], map = [], i, code, loc;
  for (i = 0; i < first.length; i++) {
    if (!first[i]) continue;
    code = first[i].getResponseCode();
    if (code !== 301 && code !== 302 && code !== 303 && code !== 307) continue;
    loc = pfHeader_(first[i], 'Location');
    if (loc.indexOf('https://') !== 0) continue;
    again.push({ url: loc, muteHttpExceptions: true, followRedirects: true });
    map.push(i);
  }
  if (again.length) {
    try {
      var second = UrlFetchApp.fetchAll(again);
      second.forEach(function (res, j) { first[map[j]] = res; });
    } catch (e2) {}
  }
  return first;
}

function pfBlobOk_(res, px) {
  if (!res || !res.getResponseCode) return null;
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) return null;
  var blob = res.getBlob();
  if (!blob) return null;
  var ct = String(blob.getContentType() || '');
  if (ct.indexOf('image/') !== 0) return null;
  var bytes = blob.getBytes();
  if (!bytes || !bytes.length) return null;
  if (bytes.length > (px <= PF.TILE ? PF.TILE_CAP : PF.MED_CAP)) return null;
  return { ct: ct, bytes: bytes };
}

function pfWave_(ids, urlOf, token, px) {
  var ok = {}, miss = [], i, part, urls, got, n;
  for (i = 0; i < ids.length; i += 40) {
    part = ids.slice(i, i + 40);
    urls = part.map(urlOf);
    got = pfFetchAll_(urls, token);
    for (n = 0; n < part.length; n++) {
      var hit = pfBlobOk_(got[n], px);
      if (hit) ok[part[n]] = hit; else miss.push(part[n]);
    }
  }
  return { ok: ok, miss: miss };
}

function pfRewrite_(link, px) {
  var s = String(link || '');
  if (!s) return '';
  if (/=s\d+/.test(s)) return s.replace(/=s\d+/, '=s' + px);
  if (/[?&]sz=s?\d+/.test(s)) return s.replace(/([?&]sz=)s?\d+/, '$1s' + px);
  return s + (s.indexOf('=s') < 0 ? (s.indexOf('?') < 0 ? '=s' + px : '&sz=s' + px) : '');
}

function pfViaLink_(ids, px, token) {
  var ok = {}, i, meta, url, hit;
  for (i = 0; i < ids.length && i < 12; i++) {
    meta = null;
    try { meta = Drive.Files.get(ids[i], { fields: 'thumbnailLink,mimeType,trashed' }); } catch (e) { meta = null; }
    if (!meta || meta.trashed || !meta.thumbnailLink) continue;
    url = pfRewrite_(meta.thumbnailLink, px);
    if (!url) continue;
    hit = pfBlobOk_(pfFetchAll_([url], token)[0], px);
    if (hit) ok[ids[i]] = hit;
  }
  return ok;
}

function pfViaThumb_(ids) {
  var ok = {}, i, f, b, bytes;
  for (i = 0; i < ids.length && i < 12; i++) {
    try {
      f = DriveApp.getFileById(ids[i]);
      b = f.getThumbnail();
      if (!b || !b.getBytes) continue;
      bytes = b.getBytes();
      if (!bytes || !bytes.length || bytes.length > PF.TILE_CAP) continue;
      var ct = String(b.getContentType() || 'image/jpeg');
      if (ct.indexOf('image/') !== 0) continue;
      ok[ids[i]] = { ct: ct, bytes: bytes };
    } catch (e) {}
  }
  return ok;
}

function pfPull_(ids, px) {
  var out = {}, token = '';
  try { token = ScriptApp.getOAuthToken(); } catch (e) { token = ''; }
  if (!ids.length) return out;
  var left = ids.slice();
  if (token) {
    var w1 = pfWave_(left, function (id) { return 'https://lh3.googleusercontent.com/d/' + id + '=s' + px; }, token, px);
    Object.keys(w1.ok).forEach(function (k) { out[k] = w1.ok[k]; });
    left = w1.miss;
    if (left.length) {
      var w2 = pfWave_(left, function (id) { return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=s' + px; }, token, px);
      Object.keys(w2.ok).forEach(function (k) { out[k] = w2.ok[k]; });
      left = w2.miss;
    }
    if (left.length && typeof Drive !== 'undefined' && Drive.Files && Drive.Files.get) {
      var w3 = pfViaLink_(left, px, token);
      Object.keys(w3).forEach(function (k) { out[k] = w3[k]; });
      left = left.filter(function (id) { return !out[id]; });
    }
  }
  if (left.length && px <= PF.TILE) {
    var w4 = pfViaThumb_(left);
    Object.keys(w4).forEach(function (k) { out[k] = w4[k]; });
  }
  return out;
}

function pfData_(ct, bytes) {
  var t = String(ct || 'image/jpeg');
  if (t.indexOf('image/') !== 0) t = 'image/jpeg';
  return 'data:' + t + ';base64,' + Utilities.base64Encode(bytes).replace(/\s/g, '');
}

function pfCacheKey_(id, px) { return 'pf1:' + px + ':' + id; }

function pfCacheGet_(ids, px) {
  var cache = pfCache_(), out = {}, keys = ids.map(function (id) { return pfCacheKey_(id, px); }), got = {};
  try { got = cache.getAll(keys) || {}; } catch (e) { got = {}; }
  var miss = [];
  ids.forEach(function (id) {
    var v = got[pfCacheKey_(id, px)];
    if (v) out[id] = v; else miss.push(id);
  });
  if (!miss.length) return out;
  var ik = miss.map(function (id) { return pfCacheKey_(id, px) + '#n'; }), idx = {};
  try { idx = cache.getAll(ik) || {}; } catch (e2) { idx = {}; }
  var parts = [], back = [];
  miss.forEach(function (id) {
    var n = parseInt(idx[pfCacheKey_(id, px) + '#n'], 10);
    if (!(n > 1 && n <= 4)) return;
    for (var i = 0; i < n; i++) { parts.push(pfCacheKey_(id, px) + '#' + i); back.push(id); }
  });
  if (!parts.length) return out;
  var pv = {};
  try { pv = cache.getAll(parts) || {}; } catch (e3) { pv = {}; }
  var acc = {};
  parts.forEach(function (k, i) {
    var id = back[i];
    if (!pv[k]) { acc[id] = null; return; }
    if (acc[id] !== null) acc[id] = (acc[id] || '') + pv[k];
  });
  Object.keys(acc).forEach(function (id) { if (acc[id]) out[id] = acc[id]; });
  return out;
}

function pfCachePut_(id, px, src) {
  if (!src) return;
  var cache = pfCache_(), k = pfCacheKey_(id, px);
  try {
    if (src.length <= PF.CACHE) { cache.put(k, src, PF.SECS); return; }
    var n = Math.ceil(src.length / PF.CACHE);
    if (n > 4) return;
    var obj = {};
    obj[k + '#n'] = String(n);
    for (var i = 0; i < n; i++) obj[k + '#' + i] = src.slice(i * PF.CACHE, (i + 1) * PF.CACHE);
    try { cache.remove(k); } catch (e1) {}
    cache.putAll(obj, PF.SECS);
  } catch (e2) {}
}

function pfSrc_(pulled, id, px) {
  if (!pulled[id]) return '';
  var src = pfData_(pulled[id].ct, pulled[id].bytes);
  pfCachePut_(id, px, src);
  return src;
}

function pfOriginal_(id) {
  var f = DriveApp.getFileById(id);
  if (f.isTrashed && f.isTrashed()) return { ok: true, src: '' };
  if (f.getSize() > PF.ORIG) return { ok: false, error: 'Photo too large to show' };
  var b = f.getBlob(), bytes = b.getBytes();
  if (!bytes || bytes.length > PF.ORIG) return { ok: false, error: 'Photo too large to show' };
  var ct = String(b.getContentType() || '');
  if (ct.indexOf('image/') !== 0) return { ok: true, src: '' };
  return { ok: true, src: pfData_(ct, bytes) };
}

function pfThumbs_(req, user) {
  var px = pfPx_(req.size);
  if (!px) px = PF.TILE;
  var jos = pfJos_(req.piece);
  var pairs = pfScanRole_(user) ? pfPairs_(req.scan) : [];
  var jobs = jos.length ? pfJobs_() : {};
  var ocr = (jos.length || pairs.length) ? pfOcr_() : { byJo: {}, all: {} };
  var piece = {}, need = [], want = {};
  jos.forEach(function (row) {
    var pack = pfPieceIds_(row.key, jobs[row.key] || null, ocr.all);
    var id = pack.ids && pack.ids[0] || '';
    piece[row.raw] = { id: id, src: '', found: pack.found };
    if (id) { want[id] = 1; need.push(id); }
  });
  var scan = {};
  pairs.forEach(function (p) {
    scan[p.id] = '';
    if (ocr.byJo[p.jo] && ocr.byJo[p.jo][p.id] && !want[p.id]) {
      want[p.id] = 1;
      need.push(p.id);
    }
  });
  var cached = need.length ? pfCacheGet_(need, px) : {};
  var miss = need.filter(function (id) { return !cached[id]; });
  var pulled = miss.length ? pfPull_(miss, px) : {};
  function srcFor(id) {
    if (cached[id]) return cached[id];
    return pfSrc_(pulled, id, px);
  }
  Object.keys(piece).forEach(function (jo) { if (piece[jo].id) piece[jo].src = srcFor(piece[jo].id); });
  Object.keys(scan).forEach(function (id) {
    var allowed = pairs.some(function (p) { return p.id === id && ocr.byJo[p.jo] && ocr.byJo[p.jo][id]; });
    if (allowed) scan[id] = srcFor(id);
  });
  return { ok: true, size: px, piece: piece, scan: scan };
}

function pfFile_(req, user) {
  var kind = req.kind === 'piece' ? 'piece' : 'scan';
  if (kind === 'scan' && !pfScanRole_(user)) return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  var jo = pfKey_(req.jo), id = String(req.id || req.file_id || '');
  var px = pfPx_(req.size);
  if (kind === 'piece') {
    var jobs = pfJobs_(), ocr = pfOcr_(), pack = pfPieceIds_(jo, jobs[jo] || null, ocr.all);
    if (!pfIdOk_(id)) id = pack.ids[0] || '';
    if (!pfIdOk_(id) || pack.ids.indexOf(id) < 0) return { ok: true, src: '' };
  } else {
    var map = pfOcr_();
    if (!pfIdOk_(id) || !jo || !map.byJo[jo] || !map.byJo[jo][id]) {
      try { audit_(user.username, 'denied', 'photoFile', req.device_id, jo + ' ' + id); } catch (e) {}
      return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
    }
  }
  if (!px) return pfOriginal_(id);
  var hit = pfCacheGet_([id], px);
  if (hit[id]) return { ok: true, src: hit[id] };
  var pulled = pfPull_([id], px);
  return { ok: true, src: pfSrc_(pulled, id, px) };
}
