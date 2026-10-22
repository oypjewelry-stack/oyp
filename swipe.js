/* Shared swipe-left for staff lists. Same pointer idea as Edit layout drag in app.js:
   an 8px move picks an axis, a tap still clicks, and touch and mouse both use pointer events.
   One row open at a time. The buttons behind the row are only actions the list already had.
   On a fine pointer, a row whose swipe removes it also gets a corner ×, unless the row
   already shows a button for that same action. The × runs the same action as the swipe
   (the same confirm, the same Undo). A full-width photo keeps its width and the × sits
   on the photo. Text rows keep a gap for it. Phones keep the swipe only. */
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
/* The corner × is only the action that takes the row off the list. Done and Snooze
   stay on the row (tick and ⋯). Reprint stays behind the swipe. */
function dismissAction(actions) {
  if (!actions || !actions.length) return null;
  var found = null, i, label;
  for (i = 0; i < actions.length; i++) {
    label = String(actions[i] && actions[i].label || '').trim().toLowerCase();
    if (label === 'cancel' || label === 'archive' || label === 'unarchive' || label === 'remove' || label === 'restore' || label === 'delete') found = actions[i];
  }
  return found;
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
function px(v) {
  var n = parseFloat(v);
  return n > 0 ? n : 0;
}
/* The row slides by every button, the gaps between them, the gap before the
   tray, and the row's own right padding so the tray can sit inside that padding.
   A fixed bar width from a zero offsetWidth is what left the row 10px open. */
function measure(clip) {
  var bar = clip.querySelector('.swacts');
  if (!bar) return 0;
  var face = clip.querySelector('.swface');
  var row = face && face.firstElementChild;
  var inset = 0;
  /* --swx-base is the row's own right padding. The corner × adds 34px on top of
     that, and that 34px is not part of the tray. */
  if (row && row.style && row.style.getPropertyValue('--swx-base') !== '') inset = px(row.style.getPropertyValue('--swx-base'));
  else if (row && root.getComputedStyle) inset = px(root.getComputedStyle(row).paddingRight);
  clip.style.setProperty('--sw-inset', inset + 'px');
  bar.style.width = '';
  var buttons = bar.querySelectorAll('.swbtn');
  var cs = root.getComputedStyle ? root.getComputedStyle(bar) : null;
  var gap = cs ? px(cs.columnGap || cs.gap) : 6;
  var w = (cs ? px(cs.paddingLeft) + px(cs.paddingRight) : 8);
  for (var i = 0; i < buttons.length; i++) {
    var bw = buttons[i].getBoundingClientRect ? buttons[i].getBoundingClientRect().width : 0;
    if (!(bw > 0)) bw = buttons[i].offsetWidth || buttons[i].scrollWidth || 0;
    w += bw;
    if (i) w += gap;
  }
  if (!(w > 8)) w = bar.scrollWidth || bar.getBoundingClientRect().width || 0;
  w = Math.ceil(w);
  var dist = Math.ceil(w + inset);
  clip.style.setProperty('--sw', dist + 'px');
  return dist;
}
function snap(clip, open) {
  if (!clip) return;
  clip.classList.remove('swdrag');
  var face = clip.querySelector('.swface');
  var dist = open ? measure(clip) : 0;
  clip.classList.toggle('open', !!open);
  if (face) {
    /* Apply the end position before the next paint. A CSS transition here is
       what screenshots caught as a 10px slide with only the pill's curve showing. */
    face.style.transition = 'none';
    face.style.transform = open ? 'translateX(' + (-dist) + 'px)' : '';
    void face.offsetWidth;
    face.style.transition = '';
  }
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
  var gone = dismissAction(actions);
  if (gone) addCorner(clip, face, row, gone);
  return clip;
}
function actionText(el) {
  return String(el && el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
/* Print already shows CANCEL, and a consignment row already shows Remove.
   Those stay the only control. A hidden button does not count. */
function actionAlreadyShown(row, action) {
  var name = String(action && action.label || '').trim().toLowerCase();
  if (!name || !row || !row.querySelectorAll) return false;
  var nodes = row.querySelectorAll('button, a'), i, el, cs;
  for (i = 0; i < nodes.length; i++) {
    el = nodes[i];
    if (!el.classList || el.classList.contains('swbtn') || el.classList.contains('swx')) continue;
    if (actionText(el) !== name) continue;
    if (root.getComputedStyle) {
      cs = root.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    }
    return true;
  }
  return false;
}
/* Inventory tiles and production cards are a photo across the top. A small
   thumb (review, the phone inventory row, a production list) is not. */
function photoHost(row) {
  if (!row || !row.querySelectorAll || !row.getBoundingClientRect) return null;
  var rowBox = row.getBoundingClientRect();
  if (!(rowBox.width >= 40)) return null;
  var nodes = row.querySelectorAll('.ivph, .pth'), i, el, box;
  for (i = 0; i < nodes.length; i++) {
    el = nodes[i];
    if (!el.classList || el.classList.contains('sm') || el.classList.contains('xs') || el.classList.contains('big')) continue;
    box = el.getBoundingClientRect();
    if (box.width < rowBox.width * 0.7 || box.height < 40) continue;
    if (box.top > rowBox.top + 16) continue;
    return el;
  }
  return null;
}
function addCorner(clip, face, row, action) {
  if (actionAlreadyShown(row, action)) return;
  var base = root.getComputedStyle ? px(root.getComputedStyle(row).paddingRight) : 0;
  row.style.setProperty('--swx-base', base + 'px');
  var b = root.document.createElement('button');
  b.type = 'button';
  b.className = 'swx';
  var name = String(action.label || '').trim();
  b.setAttribute('aria-label', name);
  b.setAttribute('title', name);
  if (action.attrs) Object.keys(action.attrs).forEach(function (k) {
    if (k === 'class' || k === 'aria-label' || k === 'title') return;
    b.setAttribute(k, action.attrs[k]);
  });
  b.innerHTML = '<svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true" focusable="false"><path d="M2.2 2.2 L9.8 9.8 M9.8 2.2 L2.2 9.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  b.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
  });
  b.addEventListener('click', function (e) { onAction(e, action, row); });
  var photo = photoHost(row);
  if (photo) {
    photo.appendChild(b);
    photo.classList.add('hasx');
    clip.classList.add('swphoto');
  } else face.appendChild(b);
  clip.classList.add('hasx');
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
  var sel = 'button, a, input, textarea, select, label, .swbtn, .swx';
  if (opt.ignore) sel += ', ' + opt.ignore;
  return !!(e.target.closest && e.target.closest(sel));
}
function onPointerDown(e) {
  if (gesture) return;
  if (e.button != null && e.button !== 0) return;
  var container = e.currentTarget;
  var opt = container.oypSwipeOpt;
  if (!opt) return;
  sync(container);
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
  sync(container);
  if (container.dataset && container.dataset.oypswipe) return;
  if (container.dataset) container.dataset.oypswipe = '1';
  container.addEventListener('pointerdown', onPointerDown);
  armDoc();
}
function sync(container) {
  var doc = root.document;
  if (!doc) return;
  var list = container ? [container] : (doc.querySelectorAll ? doc.querySelectorAll('[data-oypswipe]') : []);
  var i, el, opt, on;
  for (i = 0; i < list.length; i++) {
    el = list[i];
    if (!el || !el.classList) continue;
    opt = el.oypSwipeOpt;
    on = false;
    if (opt && typeof opt.off === 'function') {
      try { on = !!opt.off(); } catch (err) { on = false; }
    }
    el.classList.toggle('swsel', on);
  }
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

var api = { intent: intent, shouldOpen: shouldOpen, needsConfirm: needsConfirm, dismissAction: dismissAction, sync: sync, mount: mount, open: open, close: close };
root.OYPSwipe = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
