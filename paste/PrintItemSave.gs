/**
 * Save tag fields onto an existing JobOrders row. Action: printItemSave.
 * Not called by the page yet. Paste this, then add the Auth.gs hook, when the
 * preview's Save to item control is turned on.
 *
 * Auth.gs handleAction_, immediately after the print hook:
 *   if (typeof isPrintItemSaveAction_ === 'function' && isPrintItemSaveAction_(a)) return handlePrintItemSave_(req, s.user); // PrintItemSave.gs
 *
 * Writes only headers that already exist (jobSet_ skips a missing header).
 * No new columns. No new OAuth scopes. Does not clear JobOrders.
 * jo is the row key. A JO typed on the sticker is print-only and is never written.
 * The job type column "type" (new / repair / revision) is not this field. Piece type
 * goes to item_type, or piece_type when that is the header that exists.
 * Stones are written only when a stones header exists. They are not split into stone_type.
 */
var PRINT_ITEM_SAVE_ROLES = { admin: true, production_manager: true };

function isPrintItemSaveAction_(a) { return String(a || '') === 'printItemSave'; }

function printItemJo_(s) {
  if (typeof printNormJo_ === 'function') return printNormJo_(s);
  var m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})([A-Z])?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : '';
}

function printItemCol_(header, names) {
  var i;
  header = header || [];
  for (i = 0; i < names.length; i++) if (header.indexOf(names[i]) >= 0) return names[i];
  return '';
}

function handlePrintItemSave_(req, user) {
  if (!user || !user.username) {
    try {
      var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req || {}) : null;
      if (sess && sess.user) user = sess.user;
      else if (sess && sess.username) user = sess;
    } catch (e) {}
  }
  if (!req || req.action !== 'printItemSave') return { ok: false, error: 'Unknown action' };
  if (!user || !PRINT_ITEM_SAVE_ROLES[user.role]) {
    try { audit_((user && user.username) || '', 'denied', 'printItemSave', req.device_id, 'role ' + ((user && user.role) || '')); } catch (e2) {}
    return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' };
  }
  var run = function () { return printItemSave_(req, user); };
  try { return (typeof withLock_ === 'function') ? withLock_(run) : run(); }
  catch (err) { return { ok: false, error: String(err && err.message || err).slice(0, 300) }; }
}

function printItemSave_(req, user) {
  if (typeof ss_ !== 'function' || typeof jobRows_ !== 'function' || typeof jobSet_ !== 'function' || typeof jobHeader_ !== 'function' || typeof jobStr_ !== 'function') {
    return { ok: false, error: 'JobOrders writer is not in this project' };
  }
  if (!ss_().getSheetByName('JobOrders')) return { ok: false, error: 'JobOrders tab is missing' };
  var jo = printItemJo_(req.jo);
  if (!jo) return { ok: false, error: 'Need a JO' };
  var set = req.set || {};
  var header = jobHeader_(ss_().getSheetByName('JobOrders')) || [];
  var map = [
    ['price', ['price', 'price_php']],
    ['name', ['name', 'description']],
    ['item_type', ['item_type', 'piece_type']],
    ['metal', ['metal']],
    ['karat', ['karat']],
    ['stones', ['stones']],
    ['weight', ['weight_g', 'weight']],
    ['sku', ['sku', 'item_id']],
    ['location', ['location']]
  ];
  var patch = {}, wrote = [], skipped = [], i, col, key;
  for (i = 0; i < map.length; i++) {
    key = map[i][0];
    if (!Object.prototype.hasOwnProperty.call(set, key)) continue;
    col = printItemCol_(header, map[i][1]);
    if (!col) { skipped.push(key); continue; }
    patch[col] = String(set[key] == null ? '' : set[key]);
    wrote.push(col);
  }
  if (header.indexOf('updated_at') >= 0) patch.updated_at = (typeof now_ === 'function') ? now_() : new Date().toISOString();
  if (header.indexOf('updated_by') >= 0) patch.updated_by = user.username;
  var row = null;
  jobRows_('JobOrders').forEach(function (j) {
    if (!row && printItemJo_(j.jo) === jo) row = j;
  });
  if (!row || row._row == null) return { ok: false, error: 'No item with that JO' };
  if (!wrote.length) return { ok: true, jo: jo, wrote: [], skipped: skipped };
  jobSet_('JobOrders', row._row, patch);
  try { audit_(user.username, 'printItemSave', jo, req.device_id, wrote.join(',')); } catch (e3) {}
  return { ok: true, jo: jo, wrote: wrote, skipped: skipped };
}
