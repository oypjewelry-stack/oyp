/* Swipe-left on staff lists.
   Run: node sim/swipe-sim.js
   Pure checks run here. The pointer checks run in sim/swipe-preview.html (headless Chrome). */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }

const swipe = require(path.join(root, 'swipe.js'));
eq(swipe.intent(0, 0) === '' && swipe.intent(4, -4) === '', 'a short move is still a tap');
eq(swipe.intent(-20, 3) === 'open' && swipe.intent(20, 3) === 'close' && swipe.intent(3, 20) === 'scroll', '8px picks left, right, or vertical');
eq(swipe.shouldOpen(-39, 100) === false && swipe.shouldOpen(-40, 100) === true, 'a left swipe opens past 40% of the actions');
eq(swipe.shouldOpen(-48, 0) === false && swipe.shouldOpen(-49, 0) === true, 'with no measured width, 48px is the line');
eq(swipe.shouldOpen(20, 100) === false, 'a right move does not open');
eq(swipe.needsConfirm({ label: 'Delete' }) === true, 'Delete asks first');
eq(swipe.needsConfirm({ label: 'Delete', confirm: false }) === false, 'an explicit confirm:false is respected');
eq(swipe.needsConfirm({ label: 'Archive', undoable: true }) === false && swipe.needsConfirm({ label: 'Cancel', undoable: true }) === false, 'Archive and Cancel can be undone, so they do not ask');
eq(swipe.needsConfirm({ label: 'Remove', confirm: 'Remove this piece from the sheet?' }) === true, 'a confirm string always asks');
eq(swipe.needsConfirm({ label: 'Archive', destructive: true }) === true, 'a destructive action with no undo asks');

const page = read('todo.js'), card = read('dash.js'), print = read('print.js'), index = read('staff/index.html');
eq(page.includes('function bindSwipe') && page.includes("'data-td': 'tick'") && page.includes("'data-td': 'done'") && page.includes("label: 'Snooze'") && page.includes("'data-td': 'more'") && page.includes('data-until="tomorrow"') && page.includes('data-until="3d"') && page.includes('data-until="7d"'), 'to-do swipe is Done plus Snooze, and Snooze opens the existing chips');
eq(page.includes('toastUndo') && page.includes('>Undo<') && !/confirm\(/.test(page), 'to-do delete still undoes from the toast and does not ask');
eq(card.includes('OYPTodo.bindSwipe') && card.indexOf('data-td="tick"') < 0 && card.includes('archiveJos'), 'the dashboard card uses the shared swipe, and drill rows archive');
eq(print.includes('bindQueueSwipe') && print.includes("label: 'Cancel'") && print.includes("label: 'Reprint'") && print.includes("toastUndo('Cancelled'"), 'the print queue swipes Cancel, and Reprint on a failed row');
eq(read('inv.js').includes("label: arch ? 'Unarchive' : 'Archive'") && read('inv.js').includes("label: item.active ? 'Archive' : 'Restore'") && read('inv.js').includes('off: () => IV.choose || IV.sel.size > 0'), 'inventory tiles and material rows swipe the archive they already had');
eq(read('production.js').includes("label: 'Archive'") && read('production.js').includes('off: () => S.choose') && read('production.js').includes('archiveJos'), 'production cards archive, and Select turns swipe off');
eq(read('review.js').includes('archiveJos') && read('review.js').includes("item: '.rvrow[data-jo]'"), 'to-review rows archive');
eq(read('consign.js').includes('Remove this piece from the sheet?') && read('consign.js').includes("item: '.csitem'"), 'a draft consignment piece swipes Remove and asks first');
eq(!read('appts.js').includes('OYP.swipe') && !read('pay.js').includes('OYP.swipe'), 'appointments and quotes have no row-level archive, cancel, or delete, so they are unchanged');
eq(read('app.js').includes('function toastUndo') && read('app.js').includes('async function archiveJos') && read('app.js').includes('swipe: (window.OYPSwipe && window.OYPSwipe.mount)'), 'undo and archive live on the shared OYP helper');
eq(read('app.css').includes('button.swbtn.pill.sm') && read('app.css').includes('font-family:var(--head)') && read('app.css').includes('height:34px') && read('app.css').includes('#b3261e') && read('app.css').includes('touch-action:pan-y') && read('app.css').includes('--sw-inset'), 'revealed buttons are 34px pills in the site face, inset by the row padding');
eq(index.includes('swipe.js?v=2') && index.includes('app.js?v=34') && index.includes('app.css?v=44'), 'swipe.js is loaded and cache-busted');
eq(index.indexOf('swipe.js?v=2') < index.indexOf('app.js?v=34'), 'swipe.js loads before app.js');

[390, 1280].forEach(function (width) {
  const chromeRun = spawnSync('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=/tmp/chrome-swipe-sim-' + width, '--window-size=' + width + ',980', '--dump-dom', 'file://' + path.join(root, 'sim/swipe-preview.html') + '?test=1'], { encoding: 'utf8', timeout: 30000 });
  const text = (chromeRun.stdout || '').replace(/<[^>]+>/g, ' ');
  if (!chromeRun.stdout) eq(false, 'headless gesture page produced no page at ' + width, (chromeRun.stderr || chromeRun.error || '').toString().slice(0, 400));
  else eq(chromeRun.stdout.includes('SWIPE_OK'), 'at ' + width + 'px the tray is fully visible and the gestures still behave', text.slice(text.indexOf('ok '), 900));
});

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('swipe-sim passed');
