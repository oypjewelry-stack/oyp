/**
 * Shared label layout. Actions: printLayout, printLayoutSet.
 * Not called successfully until this file is pasted and the Auth.gs hook is added.
 * Until then the page keeps the layout in localStorage and ignores a failed call.
 *
 * Auth.gs handleAction_, immediately after the print hook:
 *   if (typeof isPrintLayoutAction_ === 'function' && isPrintLayoutAction_(a)) return handlePrintLayout_(req, s.user, a); // PrintLayout.gs
 *
 * One Script Property, print_layout. No sheet writes. No new columns. No new OAuth scopes.
 * Do not add these actions to FAST.READS, FAST.CACHE, or DCACHE.READS.
 * Any signed-in user can read and save. The layout is per label kind, not per person,
 * so every station that can reach this script prints the same tag.
 */
function isPrintLayoutAction_(a) {
  a = String(a || '');
  if (a !== 'printLayout' && a !== 'printLayoutSet') return false;
  return true;
}

function printLayoutRead_() {
  var raw = '';
  try { raw = PropertiesService.getScriptProperties().getProperty('print_layout') || ''; }
  catch (e) { return {}; }
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e2) { return {}; }
}

function handlePrintLayout_(req, user, action) {
  if (!user || !user.username) {
    try {
      var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req || {}) : null;
      if (sess && sess.user) user = sess.user;
      else if (sess && sess.username) user = sess;
    } catch (e) {}
  }
  if (!user || !user.username) return { ok: false, error: 'Not signed in', code: 'NO_SESSION' };
  action = String(action || (req && (req.action || req.op)) || '');
  if (action === 'printLayout') return { ok: true, layout: printLayoutRead_() };
  if (action !== 'printLayoutSet') return { ok: false, error: 'Unknown action' };
  req = req || {};
  var kind = String(req.kind || '');
  if (kind !== 'jewelry_tag' && kind !== 'jo_card') return { ok: false, error: 'Pick a sticker type' };
  var all = printLayoutRead_();
  if (req.layout && typeof req.layout === 'object') all[kind] = req.layout;
  else delete all[kind];
  var text = JSON.stringify(all);
  if (text.length > 8000) return { ok: false, error: 'Layout is too large' };
  PropertiesService.getScriptProperties().setProperty('print_layout', text);
  return { ok: true, layout: all };
}
