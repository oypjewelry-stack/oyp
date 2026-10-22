/* Shared swipe-left for staff lists. Same pointer idea as Edit layout drag in app.js:
   an 8px move picks an axis, a tap still clicks, and touch and mouse both use pointer events.
   One row open at a time. The buttons behind the row are only actions the list already had. */
(function (root) {
'use strict';
var THRESH = 8;

function intent(dx, dy, threshold) {
  var t = threshold == null ? THRESH : threshold;
  var ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < t && ay < t) return '';
  if (ay > ax) return 'scroll';
  return dx < 0 ? 'open' : 'close';
}
function shouldOpen(dx, width) {
  if (!(dx < 0)) return false;
  var dist = -dx;
  if (width > 0) return dist >= Math.min(width * 0.4, width);
  return dist > 48;
}
function needsConfirm(action) {
  if (!action) return false;
  if (action.confirm === false) return false;
  if (typeof action.confirm === 'string' && action.confirm) return true;
  if (/^delete$/i.test(String(action.label || '').trim())) return true;
  if (action.undo || action.undoable) return false;
  return !!action.destructive;
}
function isDanger(action) {
  return !!(action && (action.danger || /^delete$/i.test(String(action.label || '').trim())));
}

var gesture = null;
var kill = null;
var docOn = false;

function suppressClick() {
  if (kill) root.document.removeEventListener('click', kill, true);
  kill = function (e) {
    root.document.removeEventListener('click', kill, true);
    kill = null;
    e.preventDefault();
    e.stopPropagation();
  };
  root.document.addEventListener('click', kill, true);
}
function measure(clip) {
  var bar = clip.querySelector('.swacts');
  if (!bar) return 0;
  var max = clip.clientWidth || 0;
  var full = bar.scrollWidth || bar.offsetWidth || 0;
  var w = full;
  if (max && w > max) w = max;
  if (w) {
    clip.style.setProperty('--sw', w + 'px');
    bar.style.width = w + 'px';
  }
  return w;
}
function snap(clip, open) {
  if (!clip) return;
  clip.classList.remove('swdrag');
  if (open) measure(clip);
  clip.classList.toggle('open', !!open);
  var face = clip.querySelector('.swface');
  if (face) face.style.transform = '';
}
function closeAll(except) {
  var doc = root.document;
  if (!doc || !doc.querySelectorAll) return;
  var list = doc.querySelectorAll('.swclip.open');
  for (var i = 0; i < list.length; i++) if (list[i] !== except) snap(list[i], false);
}
function detach() {
  var doc = root.document;
  doc.removeEventListener('pointermove', onMove, true);
  doc.removeEventListener('pointerup', onUp, true);
  doc.removeEventListener('pointercancel', onCancel, true);
}
function shift(g, reveal) {
  if (reveal < 0) reveal = 0;
  if (g.width && reveal > g.width) reveal = g.width;
  g.reveal = reveal;
  var face = g.clip.querySelector('.swface');
  if (face) face.style.transform = 'translateX(' + (-reveal) + 'px)';
}
function onMove(e) {
  var g = gesture;
  if (!g || e.pointerId !== g.pid) return;
  g.lx = e.clientX;
  g.ly = e.clientY;
  var dx = g.lx - g.sx, dy = g.ly - g.sy;
  /* A kanban card starts its HTML5 drag after a few pixels. A left move turns that off
     before the drag can start; a right or downward move leaves the drag alone. */
  if (g.drag && !g.armed && Math.hypot(dx, dy) >= 3) {
    g.armed = true;
    if (dx < 0 && Math.abs(dx) >= Math.abs(dy)) g.row.draggable = false;
  }
  if (!g.locked) {
    var which = intent(dx, dy, THRESH);
    if (!which) return;
    if (which === 'scroll' || (which === 'close' && !g.opened)) {
      var row = g.row, drag = g.drag;
      detach();
      gesture = null;
      if (drag) row.draggable = true;
      return;
    }
    g.locked = 'swipe';
    g.clip.classList.add('swdrag');
    g.width = measure(g.clip) || g.width;
    if (g.drag) g.row.draggable = false;
    closeAll(g.clip);
    try { g.clip.setPointerCapture(g.pid); } catch (err) {}
  }
  if (g.locked !== 'swipe') return;
  if (e.cancelable) e.preventDefault();
  var base = g.opened ? g.width : 0;
  shift(g, base - dx);
}
function finish(e, cancel) {
  var g = gesture;
  if (!g || (e && e.pointerId != null && e.pointerId !== g.pid)) return;
  detach();
  gesture = null;
  var dx = ((e && e.clientX) || g.lx) - g.sx;
  var dy = ((e && e.clientY) || g.ly) - g.sy;
  if (g.locked === 'swipe') {
    var reveal = g.reveal || 0;
    var half = g.width ? g.width * 0.5 : 24;
    var open = !cancel && (g.opened ? reveal > half : shouldOpen(-reveal, g.width));
    snap(g.clip, open);
    suppressClick();
  } else if (!g.locked && g.opened && Math.hypot(dx, dy) < THRESH) {
    snap(g.clip, false);
    suppressClick();
  }
  if (g.drag) g.row.draggable = true;
}
function onUp(e) { finish(e, false); }
function onCancel(e) { finish(e, true); }
function onDragStart(e) {
  var g = gesture;
  if (!g || e.currentTarget !== g.row) return;
  var dx = g.lx - g.sx, dy = g.ly - g.sy;
  if (g.locked === 'swipe' || (dx < 0 && Math.abs(dx) >= Math.abs(dy) && Math.hypot(dx, dy) >= 3)) {
    e.preventDefault();
    return;
  }
  var row = g.row, drag = g.drag;
  detach();
  gesture = null;
  if (drag) row.draggable = true;
}
function onAction(e, action, row) {
  if (needsConfirm(action)) {
    var msg = typeof action.confirm === 'string' && action.confirm ? action.confirm : 'Delete this?';
    if (!root.confirm(msg)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }
  var clip = row.closest && row.closest('.swclip');
  if (clip) snap(clip, false);
  if (typeof action.run === 'function') {
    e.preventDefault();
    e.stopPropagation();
    try { action.run(row, action); } catch (err) {}
  }
}
function wrap(row, actions) {
  var parent = row.parentNode;
  if (!parent) return null;
  var clip = root.document.createElement('div');
  clip.className = 'swclip';
  var bar = root.document.createElement('div');
  bar.className = 'swacts';
  actions.forEach(function (a) {
    var b = root.document.createElement('button');
    b.type = 'button';
    b.className = 'swbtn pill sm outline' + (isDanger(a) ? ' swdanger' : '');
    b.textContent = a.label || '';
    if (a.attrs) Object.keys(a.attrs).forEach(function (k) { b.setAttribute(k, a.attrs[k]); });
    b.addEventListener('click', function (e) { onAction(e, a, row); });
    bar.appendChild(b);
  });
  var face = root.document.createElement('div');
  face.className = 'swface';
  parent.insertBefore(clip, row);
  clip.appendChild(bar);
  clip.appendChild(face);
  face.appendChild(row);
  row.addEventListener('dragstart', onDragStart);
  return clip;
}
function decorate(container, opt) {
  var rows = container.querySelectorAll(opt.item);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (row.tagName === 'TR') continue;
    if (row.closest('.swclip')) continue;
    var actions = [];
    try { actions = opt.actions(row) || []; } catch (e) { actions = []; }
    if (!actions.length) continue;
    wrap(row, actions);
  }
}
function ignored(e, opt) {
  var sel = 'button, a, input, textarea, select, label, .swbtn';
  if (opt.ignore) sel += ', ' + opt.ignore;
  return !!(e.target.closest && e.target.closest(sel));
}
function onPointerDown(e) {
  if (gesture) return;
  if (e.button != null && e.button !== 0) return;
  var container = e.currentTarget;
  var opt = container.oypSwipeOpt;
  if (!opt) return;
  if (typeof opt.off === 'function' && opt.off()) return;
  var html = root.document.documentElement;
  if (html && html.classList.contains('layedit') && e.target.closest('.dtitle, .dgrip, .lctile, [data-nkey], [data-lkey]')) return;
  if (ignored(e, opt)) return;
  var row = e.target.closest(opt.item);
  if (!row || !container.contains(row)) return;
  var clip = row.closest('.swclip');
  if (!clip || !container.contains(clip)) return;
  gesture = {
    row: row, clip: clip, pid: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY,
    locked: '', opened: clip.classList.contains('open'), width: measure(clip), reveal: clip.classList.contains('open') ? measure(clip) : 0,
    drag: row.draggable === true || row.getAttribute('draggable') === 'true', armed: false
  };
  var doc = root.document;
  doc.addEventListener('pointermove', onMove, { capture: true, passive: false });
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onCancel, true);
}
function onDocDown(e) {
  var doc = root.document;
  if (!doc.querySelector || !doc.querySelector('.swclip.open')) return;
  if (e.target.closest && e.target.closest('.swclip.open')) return;
  closeAll(null);
  suppressClick();
}
function armDoc() {
  if (docOn || !root.document) return;
  docOn = true;
  root.document.addEventListener('pointerdown', onDocDown, true);
}
function mount(container, opt) {
  if (!container || !opt || !opt.item || typeof opt.actions !== 'function') return;
  container.oypSwipeOpt = opt;
  decorate(container, opt);
  if (container.dataset && container.dataset.oypswipe) return;
  if (container.dataset) container.dataset.oypswipe = '1';
  container.addEventListener('pointerdown', onPointerDown);
  armDoc();
}
function clipOf(row) {
  if (!row) return null;
  if (row.classList && row.classList.contains('swclip')) return row;
  return row.closest ? row.closest('.swclip') : null;
}
function open(row) {
  var clip = clipOf(row);
  if (!clip) return;
  measure(clip);
  closeAll(clip);
  snap(clip, true);
}
function close(row) {
  if (!row) { closeAll(null); return; }
  var clip = clipOf(row);
  if (clip) snap(clip, false);
}

var api = { intent: intent, shouldOpen: shouldOpen, needsConfirm: needsConfirm, mount: mount, open: open, close: close };
root.OYPSwipe = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
