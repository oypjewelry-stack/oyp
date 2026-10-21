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
eq(!/\.dcard>\.dtitle h3\{[^}]*font-size:\s*19px/.test(css), 'section titles are not locked to one size');
eq(css.includes('--d-htodo-fp') && css.includes('--d-hboard-fp') && css.includes('--d-hloc-fp') && css.includes('--d-hsales-fp') && css.includes('--d-hconsign-fp') && css.includes('--d-hmsgs-fp') && css.includes('--d-hpay-fp') && css.includes('--d-hkpi-fp'), 'each dashboard title has its own size');
eq(css.includes('.dcard[data-dsec="todo"]>.dtitle h3') && css.includes('.dcard[data-dsec="board"]>.dtitle h3') && !css.includes('--d-hmenu-fp,var(--d-htodo'), 'a dashboard title does not share the menu header size');
eq(settings.includes('Dashboard headers') && settings.includes("['hkpi', 'htodo', 'hboard', 'hloc', 'hsales', 'hconsign', 'hmsgs', 'hpay']"), 'the controls live in Design');
eq(index.includes('app.js?v=33') && index.includes('app.css?v=39') && index.includes('dash.js?v=31') && index.includes('settings.js?v=19') && index.includes('design.js?v=6') && index.includes('todo.css?v=5') && index.includes('todo.js?v=1'), 'changed assets are cache-busted');

const props = {};
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.document = { documentElement: { style: { setProperty: (k, v) => { props[k] = String(v); }, removeProperty: k => { delete props[k]; } } } };
global.window = global;
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({ ok: false }) });
require(path.join(root, 'design.js'));
const D = global.OYPDesign;
const saved = D.cleanParts({ htodo: { f: 'inter', g: 700 }, hboard: { f: 'libre', g: 400 }, _px: { htodo: { t: 36 }, hboard: { t: 15 } } });
eq(saved._px.htodo.t === 36 && saved._px.hboard.t === 15 && saved.htodo.f === 'inter' && saved.hboard.g === 400, 'two headers keep different sizes, fonts and weights');
eq(!saved.hmenu && !saved.hbody && !saved.hprice && !saved.hkpi, 'saving two headers does not write the others');
Object.keys(props).forEach(k => delete props[k]);
D.preview({ parts: saved });
eq(props['--d-htodo-fp'] === '36px' && props['--d-hboard-fp'] === '15px', 'the page publishes two different header sizes');
eq(props['--d-htodo-g'] === '700' && props['--d-hboard-g'] === '400' && props['--d-htodo-f'] !== props['--d-hboard-f'], 'font and weight stay on the header they were set on');
eq(!props['--d-hmenu-fp'] && !props['--d-hbody-fp'] && !props['--d-hprice-fp'] && !props['--d-hloc-fp'], 'menu, body, pricing and the other dashboard titles stay unset');
eq(!props['--d-htodo-t'] && !props['--d-hboard-t'], 'a saved header size is a pixel, not a shared ratio');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('ok layout editing');
