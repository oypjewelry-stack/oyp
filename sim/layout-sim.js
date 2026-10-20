/* Layout editing stays in Settings. Headers swap only when the pointer crosses the neighbor's header.
   Run: node sim/layout-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } }

const app = read('app.js'), dash = read('dash.js'), settings = read('settings.js'), css = read('app.css'), nav = read('nav.js'), index = read('staff/index.html');
function place(itemFirst, pos, mid) {
  if (itemFirst) return pos > mid ? 'after' : '';
  return pos < mid ? 'before' : '';
}
eq(app.includes("if (itemFirst) return pos > mid ? 'after' : '';"), 'the page uses the same header-crossing rule');
eq(place(true, 11, 10) === 'after' && place(true, 9, 10) === '', 'dragging down does not move the neighbor until the pointer passes its header');
eq(place(false, 9, 10) === 'before' && place(false, 11, 10) === '', 'dragging up does not move the neighbor until the pointer passes its header');
eq(app.includes("over.querySelector(':scope > .dtitle')"), 'a section compares against the neighbor header, not the whole card');
eq(app.includes("closest('#layBar')"), 'Done still turns editing off on the first tap after a drag');
eq(dash.includes("'.dtitle'"), 'dashboard sections drag from the header');
eq(/SEC_ORDER = \['todo',/.test(dash), 'To do stays in the saved section list');
eq(dash.includes('oypDashLoc:') && dash.includes('oypDashOrder:'), 'order and hidden tiles still use the same device keys');
eq(dash.includes("setHidden: setLocHidden"), 'Settings can hide one location tile');
eq(settings.includes('id="layEdit"') && settings.includes('id="layArch"') && settings.includes('id="layMore"'), 'Edit layout and the Archived tile live in Settings');
eq(settings.includes("setHidden(u, 'archived'"), 'the Archived toggle writes the existing hidden list');
eq(!/Edit layout/.test(nav), 'Edit layout is not a side-menu item');
eq(!/dmove|dgrip/.test(app + dash + settings), 'no move arrows are drawn');
eq(css.includes('.dmove,.dgrip,.nord,.lcord,.dord{display:none!important}'), 'leftover arrow controls stay hidden');
eq(css.includes('.dcard>.dtitle{') && css.includes('contain:layout'), 'each section header is its own box');
eq(index.includes('app.js?v=28') && index.includes('app.css?v=35') && index.includes('dash.js?v=30') && index.includes('settings.js?v=16') && index.includes('todo.css?v=3'), 'changed assets are cache-busted');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('ok layout editing');
