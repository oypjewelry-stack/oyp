/* Edit layout is one pill. Headers swap only when the pointer crosses the neighbor's header.
   A hidden section keeps its own slot. Run: node sim/layout-sim.js */
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
eq(app.includes("closest('#layEditBtn, .layx, .layshow"), 'Done still turns editing off on the first tap after a drag');
eq(app.includes('handle.parentElement !== item'), 'a header only moves the section it belongs to');
eq(dash.includes("'.dtitle'"), 'dashboard sections drag from the header');
eq(/SEC_ORDER = \['todo',/.test(dash), 'To do stays in the saved section list');
eq(dash.includes('oypDashLoc:') && dash.includes('oypDashOrder:') && dash.includes('oypDashSecHide:'), 'order and hidden tiles still use the same device keys');
eq(dash.includes("setHidden: setLocHidden") && dash.includes('data-shide'), 'each section and location tile hides on its own');
eq(!settings.includes('id="layEdit"') && !settings.includes('id="layArch"') && !settings.includes('id="layMore"'), 'Settings does not keep a second Edit layout switch');
eq(app.includes("btn.textContent = on ? 'Done' : 'Edit layout'") && app.includes("toast('Layout saved')") && !app.includes('id="layBar"') && !css.includes('.laybar{'), 'one pill says Edit layout, then Done, and confirms with Layout saved');
eq(css.includes('button.laypill.pill.sm{height:34px') && css.includes('.layx,.laygrip,.layctl,.layshows{display:none!important}') && css.includes('html.layedit button.layx{display:inline-flex!important'), 'the pill is 34px and the controls stay hidden until editing');
eq(!/Edit layout/.test(nav), 'Edit layout is not a side-menu item');
eq(!/dmove|dgrip/.test(app + dash + settings), 'no move arrows are drawn');
eq(css.includes('.dmove,.dgrip,.nord,.lcord,.dord{display:none!important}'), 'leftover arrow controls stay hidden');
eq(css.includes('.dcard>.dtitle{') && css.includes('contain:layout'), 'each section header is its own box');
eq(!/\.dcard>\.dtitle h3\{[^}]*font-size:\s*19px/.test(css), 'section titles are not locked to one size');
eq(css.includes('--d-htodo-fp') && css.includes('--d-hboard-fp') && css.includes('--d-hloc-fp') && css.includes('--d-hsales-fp') && css.includes('--d-hconsign-fp') && css.includes('--d-hmsgs-fp') && css.includes('--d-hpay-fp') && css.includes('--d-hkpi-fp'), 'each dashboard title has its own size');
eq(css.includes('.dcard[data-dsec="todo"]>.dtitle h3') && css.includes('.dcard[data-dsec="board"]>.dtitle h3') && !css.includes('--d-hmenu-fp,var(--d-htodo'), 'a dashboard title does not share the menu header size');
eq(settings.includes('Dashboard headers') && settings.includes("['hkpi', 'htodo', 'hboard', 'hloc', 'hsales', 'hconsign', 'hmsgs', 'hpay']"), 'the controls live in Design');
eq(index.includes('app.js?v=40') && index.includes('app.css?v=59') && index.includes('dash.js?v=35') && index.includes('settings.js?v=21') && index.includes('design.js?v=6') && index.includes('todo.css?v=7') && index.includes('todo.js?v=6'), 'changed assets are cache-busted');

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

global.document.getElementById = () => null;
global.document.querySelector = () => null;
require(path.join(root, 'dash.js'));
const L = global.OYPDash.layout;
const canon = ['todo', 'board', 'loc', 'sales', 'consign', 'msgs', 'pay'];
const parked = L.sectionOrder(canon, ['todo', 'sales', 'loc', 'consign', 'msgs', 'pay'], ['board']);
eq(parked.join() === 'todo,board,sales,loc,consign,msgs,pay', 'a hidden Job board keeps its own slot instead of sitting on Location');
const moved = L.mergeSlots(parked, ['board'], ['todo', 'sales', 'consign', 'loc', 'msgs', 'pay']);
eq(moved[1] === 'board' && moved[3] === 'consign' && moved[4] === 'loc', 'reordering Location does not take the hidden Job board with it');
const who = { username: 'ada', role: 'admin' };
L.sections.setHidden(who, 'board', true);
eq(L.sections.hidden(who).join() === 'board', 'hiding one header does not hide its neighbor');
L.sections.setHidden(who, 'loc', true);
eq(L.sections.hidden(who).join() === 'board,loc', 'the next header hides on its own');
L.sections.setHidden(who, 'board', false);
eq(L.sections.hidden(who).join() === 'loc', 'showing one header leaves the other hidden');
store['oypDashLoc:ada'] = JSON.stringify({ order: ['sold', 'working', 'vault'], hide: ['archived'] });
const tiles = L.locations.fromList(['working', 'vault', 'archived', 'sold'].map(k => ({ key: k, label: k, count: 1 })), who);
eq(tiles.order.join() === 'sold,working,archived,vault', 'a hidden location tile keeps its slot when the others move');

const http = require('http');
const { spawn } = require('child_process');
function httpJson(url, method) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method || 'GET' }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(res.statusCode + ' ' + data.slice(0, 180)));
        else { try { resolve(JSON.parse(data)); } catch (err) { reject(err); } }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const USER = { username: 'ada', display_name: 'Ada', role: 'admin' };
const DASH = {
  ok: true, generated_at: '2026-10-22T08:00:00.000Z',
  counts: { active_jobs: 2, pending_work: 0, on_hand: 3, month_sales: 1000, consigned_out: 0, overdue_consignments: 0 },
  can: { sales: true, consign: true, payments: true }, overdue_days: 30,
  board: [{ key: 'bench', label: 'Bench', count: 0, cards: [] }],
  locations: ['working', 'vault', 'archived'].map(k => ({ key: k, label: k[0].toUpperCase() + k.slice(1), count: k === 'archived' ? 0 : 1 })),
  sales: { month: '2026-10', months: [{ month: '2026-10', total: 1000 }] },
  consignments: [], payments: []
};
function apiBody(action) {
  if (action === 'me') return { ok: true, user: USER };
  if (action === 'dashboard') return DASH;
  if (action === 'contactList') return { ok: true, missing: 0, total: 0, missing_jos: [] };
  if (action === 'portalSteps') return { ok: true, inbox: { items: [] } };
  if (action === 'todoList') return { ok: true, items: [], total: 0, done: [], people: [] };
  if (action === 'settingsDesign') return { ok: true };
  return { ok: true };
}
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      if (req.method === 'POST') {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
          let action = '';
          try { action = JSON.parse(raw || '{}').action || ''; } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(apiBody(action)));
        });
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      let file = decodeURIComponent(url.pathname);
      if (file.endsWith('/')) file += 'index.html';
      const full = path.normalize(path.join(root, file));
      if (!full.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
      fs.readFile(full, (err, buf) => {
        if (err) { res.writeHead(404); res.end('missing'); return; }
        const ext = path.extname(full);
        const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function chromeAt(width, port, pageUrl, shots) {
  const pointer = width < 800 ? 'primaryHoverType=1,primaryPointerType=2' : 'primaryHoverType=2,primaryPointerType=4';
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=/tmp/chrome-layout-' + width + '-' + Date.now(),
    '--blink-settings=' + pointer,
    '--window-size=' + width + ',900',
    'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  const notes = [];
  const check = (cond, msg) => { notes.push((cond ? 'ok ' : 'FAIL ') + msg); if (!cond) failed++; };
  try {
    let version;
    for (let i = 0; i < 40; i++) {
      try { version = await httpJson('http://127.0.0.1:' + port + '/json/version'); break; }
      catch (err) { await sleep(100); }
    }
    if (!version) throw new Error('chrome did not open a debugging port');
    const target = await httpJson('http://127.0.0.1:' + port + '/json/new?about:blank', 'PUT');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    });
    const send = (method, params) => {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
      });
    };
    const evalJs = async expr => {
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 500));
      return result.result && result.result.value;
    };
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try {
      localStorage.setItem('oypSession', 'sess-layout');
      localStorage.setItem('oypSessionExp', '2099-01-01T00:00:00.000Z');
      localStorage.setItem('oypUser', JSON.stringify({ username: 'ada', display_name: 'Ada', role: 'admin' }));
      localStorage.setItem('oypDevice', 'd-layout');
    } catch (e) {}` });
    await send('Page.navigate', { url: pageUrl });
    let ready = null;
    for (let i = 0; i < 50; i++) {
      ready = await evalJs(`(() => {
        const b = document.getElementById('layEditBtn');
        const board = document.querySelector('[data-dsec="board"]');
        const loc = document.querySelector('[data-dsec="loc"]');
        const busy = document.querySelector('[aria-busy="true"]');
        if (!b || !board || !loc || busy) return null;
        return b.textContent;
      })()`);
      if (ready) break;
      await sleep(200);
    }
    check(ready === 'Edit layout', 'at ' + width + 'px the pill reads Edit layout');
    const normal = await evalJs(`(() => {
      const b = document.getElementById('layEditBtn');
      const hide = document.querySelector('[data-shide]');
      const hs = hide ? getComputedStyle(hide).display : '';
      const grip = document.querySelector('.laygrip');
      const gs = grip ? getComputedStyle(grip).display : '';
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 }));
      const down = b.classList.contains('is-down');
      const dur = getComputedStyle(b).transitionDuration;
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
      b.classList.remove('is-down');
      const menu = document.getElementById('menu');
      document.getElementById('btnMenu').click();
      const last = menu.lastElementChild;
      const logoutLast = !!(last && last.matches('[data-logout]') && /Log out/.test(last.textContent));
      const side = document.getElementById('sideNav');
      const kids = side ? [...side.children] : [];
      const si = kids.findIndex(el => el.querySelector && el.querySelector('[data-nkey="settings"]'));
      const printerNext = si >= 0 && kids[si + 1] && kids[si + 1].matches('a[data-oyp-printer]');
      const whoOut = document.querySelector('#side [data-logout]');
      document.getElementById('btnMenu').click();
      return { h: getComputedStyle(b).height, hs, gs, down, dur, logoutLast, printerNext, who: whoOut && whoOut.textContent };
    })()`);
    check(normal && normal.h === '34px', 'at ' + width + 'px the pill is 34px tall');
    check(normal && normal.hs === 'none' && normal.gs === 'none', 'at ' + width + 'px hide and grip stay hidden');
    check(normal && normal.down === true && (normal.dur === '0.05s' || normal.dur === '50ms'), 'at ' + width + 'px press sets is-down and scales in 50ms');
    check(normal && normal.logoutLast && normal.printerNext && normal.who === 'Log out', 'at ' + width + 'px Log out is last and Printer stays under Settings');
    const shot = async name => {
      const pic = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shots, name), Buffer.from(pic.data, 'base64'));
    };
    const tag = width < 800 ? '390' : 'desktop';
    await shot('layout_normal_' + tag + '.png');
    await evalJs(`document.getElementById('layEditBtn').click()`);
    await sleep(150);
    let placed = 0;
    for (let i = 0; i < 12; i++) {
      placed = await evalJs(`(() => {
        const el = document.querySelector('[data-dsec="board"] .dtitle');
        if (!el) return 0;
        const y = el.getBoundingClientRect().top;
        if (y < 170 || y > 210) window.scrollTo(0, window.scrollY + y - 190);
        return Math.round(el.getBoundingClientRect().top);
      })()`);
      if (placed >= 170 && placed <= 230) break;
      await sleep(80);
    }
    const editing = await evalJs(`(() => {
      const b = document.getElementById('layEditBtn');
      const hide = document.querySelector('[data-dsec="board"] [data-shide]');
      const loc = document.querySelector('[data-dsec="loc"]');
      const el = document.querySelector('[data-dsec="board"] .dtitle');
      window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 150));
      return { text: b.textContent, pressed: b.getAttribute('aria-pressed'), show: hide ? getComputedStyle(hide).display : '', hh: hide ? getComputedStyle(hide).height : '', loc: !!loc };
    })()`);
    check(editing && editing.text === 'Done' && editing.pressed === 'true', 'at ' + width + 'px the pill reads Done while editing');
    check(editing && (editing.show === 'flex' || editing.show === 'inline-flex') && editing.hh === '34px' && editing.loc, 'at ' + width + 'px each header has its own 34px Hide');
    const geom = await evalJs(`(() => {
      const box = r => { const b = r.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) }; };
      return {
        pill: box(document.getElementById('layEditBtn')),
        head: box(document.querySelector('[data-dsec="board"] .dtitle')),
        hide: box(document.querySelector('[data-dsec="board"] [data-shide]'))
      };
    })()`);
    const clear = geom && geom.pill.b + 8 < geom.hide.t;
    check(clear, 'at ' + width + 'px the editing header sits below the pill (' + JSON.stringify(geom) + ')');
    await shot('layout_editing_' + tag + '.png');
    if (width < 800) {
      const hid = await evalJs(`(() => {
        document.querySelector('[data-dsec="board"] [data-shide]').click();
        const ids = [...document.querySelectorAll('#dsecs > [data-dsec]')].map(s => s.dataset.dsec);
        const raw = localStorage.getItem('oypDashSecHide:ada');
        return { ids: ids.join(), raw };
      })()`);
      check(hid && hid.ids.indexOf('board') < 0 && hid.ids.indexOf('loc') >= 0 && hid.raw === '["board"]', 'hiding Job board leaves Location on its own');
      await evalJs(`document.getElementById('layEditBtn').click()`);
      await sleep(80);
      const saved = await evalJs(`(() => {
        const t = document.getElementById('toast');
        const b = document.getElementById('layEditBtn');
        const hide = document.querySelector('[data-shide]');
        return { toast: t && t.textContent, hidden: t && t.classList.contains('hidden'), text: b.textContent, show: hide ? getComputedStyle(hide).display : '' };
      })()`);
      check(saved && saved.toast === 'Layout saved' && saved.hidden === false && saved.text === 'Edit layout' && saved.show === 'none', 'Done saves and shows Layout saved');
      await shot('layout_saved_390.png');
    }
    return notes;
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

(async () => {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  const shots = '/opt/cursor/artifacts';
  fs.mkdirSync(shots, { recursive: true });
  const srv = await startServer();
  const port = srv.address().port;
  const page = 'http://127.0.0.1:' + port + '/staff/index.html?api=' + encodeURIComponent('http://127.0.0.1:' + port + '/api') + '#/dashboard';
  try {
    for (const [width, dbg] of [[390, 9410], [1280, 9411]]) {
      try {
        const notes = await chromeAt(width, dbg, page, shots);
        notes.forEach(n => { if (n.indexOf('FAIL') === 0) console.error(n); else console.log(n); });
      } catch (err) {
        failed++;
        console.error('FAIL headless at ' + width + 'px: ' + String(err && err.stack || err).slice(0, 800));
      }
    }
  } finally { srv.close(); }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('ok layout editing');
})();
