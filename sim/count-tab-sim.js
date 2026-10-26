/* Inventory COUNT tab: the old menu item is gone, #/count opens the tab, and a saved menu order that still names count is ignored.
   Run: node sim/count-tab-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}

const store = new Map();
const memStore = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(String(k), String(v)); },
  removeItem(k) { store.delete(k); },
  key(i) { return [...store.keys()][i] || null; },
  get length() { return store.size; }
};
try { global.localStorage = memStore; } catch (e) { /* the runtime already has a store; the browser proof covers the saved order */ }
const nav = require(path.join(root, 'nav.js'));
const ada = { role: 'admin', username: 'ada', display_name: 'Ada' };
const canon = nav.OFFICE_NAV.admin.map(n => n[0]);
memStore.setItem('oypNavOrder:ada', JSON.stringify(['settings', 'count', 'dashboard', 'todo', 'jos', 'count']));
let ordered = [];
let threw = '';
try { ordered = nav.ordered(ada).map(n => n[0]); }
catch (e) { threw = e.message; }
eq(!threw, 'a saved menu order that contains count does not throw' + (threw ? ' (' + threw + ')' : ''));
eq(ordered.length === canon.length && canon.every(k => ordered.indexOf(k) >= 0) && ordered.indexOf('count') < 0 && ordered.join(',') !== canon.join(','), 'that saved order drops count and keeps every current item (' + ordered.join(',') + ')');
const side = nav.sideHtml(ada, 'jos', '');
eq(side.indexOf('Inventory count') < 0 && side.indexOf('>Inventory<') > 0 && side.indexOf('data-nkey="jos"') > 0 && side.indexOf('data-nkey="count"') < 0, 'the left menu renders Inventory and not the removed item');
eq(nav.OFFICE_NAV.staff.some(n => n[0] === 'jos' && n[1] === 'Inventory') && !nav.OFFICE_NAV.staff.some(n => n[0] === 'count') && nav.menuHtml({ role: 'staff', username: 'thea', display_name: 'Thea' }, 'jos', '').indexOf('Inventory count') < 0 && nav.menuHtml({ role: 'staff', username: 'thea', display_name: 'Thea' }, 'jos', '').indexOf('data-nkey="jos"') > 0, 'staff have an Inventory row and no Inventory count row');

const app = read('app.js');
const inv = read('inv.js');
const count = read('count.js');
const index = read('staff/index.html');
eq(app.includes("sessionStorage.setItem('oypInvView', 'count')") && app.includes("cur0 === 'count'") && app.includes("history.replaceState(null, '', '#/jos')"), '#/count redirects onto Inventory');
eq(app.includes('canon.indexOf(x) >= 0'), 'a hidden-menu list drops a key that is no longer in the menu');
eq(inv.includes('data-iv="count">COUNT</button>') && inv.includes('OYPCount.render') && inv.includes("keys.push('count')"), 'COUNT is the last Inventory tab and reuses the count page');
eq(count.includes('root.OYPInv.countOn') && count.includes("call('countFinish'") && count.includes('applyRead(ST.session, raw)'), 'the count page still owns its reads, and it paints inside the tab');
eq(index.includes('count.js?v=3') && index.includes('inv.js?v=32') && index.includes('nav.js?v=77') && index.includes('app.js?v=43') && index.includes('count.css?v=2') && index.includes('app.css?v=65'), 'changed files are cache-busted');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=65'), 'the customer page stays on app.css?v=29');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function mime(file) {
  const ext = path.extname(file);
  return { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
}

function startServer() {
  const types = mime;
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/api') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          let msg = {};
          try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) {}
          const staff = String(msg.session || '').indexOf('staff') === 0;
          const user = staff
            ? { username: 'thea', display_name: 'Thea', role: 'staff' }
            : { username: 'ada', display_name: 'Ada', role: 'admin' };
          let out = { ok: true };
          if (msg.action === 'me') out = { ok: true, user };
          if (msg.action === 'invList') out = {
            ok: true,
            can: { cost: true, price: true, edit: true },
            jobs: [{ jo: '26-287B', description: 'Sapphire ring', client: 'Elena Tan', location: 'vault', on_hand: true, item_type: 'ring', metal: 'gold', karat: '18' }],
            locations: [['vault', 'Vault'], ['working', 'Working'], ['archived', 'Archived'], ['sold', 'Sold']],
            stages: [['bench', 'Bench']],
            item_types: [['ring', 'Ring']]
          };
          if (msg.action === 'countLoad') out = { ok: true, items: [{ id: 'IT1', jo: '26-287B', description: 'Sapphire ring', client: 'Elena Tan', epc: '', location: 'vault' }] };
          if (msg.action === 'jobReviewList') out = { ok: true, jobs: [] };
          if (msg.action === 'joInboxList' || msg.action === 'joInboxStatus') out = { ok: true, rows: [], pending: 0 };
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        });
        return;
      }
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(root, rel || 'staff/index.html');
      if (file !== root && file.indexOf(root + path.sep) !== 0) { res.statusCode = 403; res.end('no'); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.statusCode = 404; res.end('missing ' + rel); return; }
        res.setHeader('Content-Type', types(file));
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function chrome(origin) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const dir = '/tmp/chrome-count-tab-' + Date.now();
  const chromeProc = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + dir,
    'about:blank'
  ], { stdio: 'ignore' });
  let ws, seq = 0;
  const pending = new Map();
  const onMsg = ev => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  };
  const send = (method, params) => {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  };
  const evalJson = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result && r.result.value;
  };
  const waitFor = async (expr, n) => {
    for (let i = 0; i < (n || 60); i++) {
      const v = await evalJson(expr);
      if (v) return v;
      await sleep(100);
    }
    return '';
  };
  const shots = [];
  try {
    let version = '';
    for (let i = 0; i < 50; i++) {
      try { version = await get('http://127.0.0.1:' + port + '/json/version'); break; }
      catch (e) { await sleep(100); }
    }
    if (!version) throw new Error('Chrome debug port did not open');
    const browser = new WebSocket(JSON.parse(version).webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { browser.addEventListener('open', resolve); browser.addEventListener('error', reject); });
    browser.addEventListener('message', onMsg);
    const sendB = (method, params) => {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        browser.send(JSON.stringify({ id, method, params: params || {} }));
      });
    };
    const { targetId } = await sendB('Target.createTarget', { url: 'about:blank' });
    browser.close();
    const list = JSON.parse(await get('http://127.0.0.1:' + port + '/json/list'));
    const page = list.find(t => t.id === targetId);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    seq = 0;
    pending.clear();
    ws.addEventListener('message', onMsg);
    await send('Page.enable');
    const added = await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try {
        localStorage.setItem('oypSession','admin1');
        localStorage.setItem('oypSessionExp','2099-01-01T00:00:00.000Z');
        localStorage.setItem('oypUser', JSON.stringify({username:'ada', display_name:'Ada', role:'admin'}));
        localStorage.removeItem('oypNavOrder:ada');
        localStorage.removeItem('oypNavHide:ada');
        localStorage.setItem('oypApi', ${JSON.stringify(origin + '/api')});
      } catch (e) {}`
    });
    const art = '/opt/cursor/artifacts';
    fs.mkdirSync(art, { recursive: true });
    const snap = async (width, file) => {
      const height = width < 800 ? 844 : 800;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const inner = await evalJson('window.innerWidth');
      eq(inner === width, 'layout width is ' + width + ' (got ' + inner + ')');
      const png = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(png.data, 'base64');
      fs.writeFileSync(path.join(art, file), buf);
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      shots.push({ file, md5, bytes: buf.length });
      console.log('shot', file, md5, buf.length);
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: origin + '/staff/index.html?api=' + encodeURIComponent(origin + '/api') + '#/jos' });
    const ready = await waitFor(`document.querySelector('[data-iv="all"]') && document.querySelector('[data-iv="count"]') ? 'yes' : ''`, 80);
    const early = await evalJson(`(document.getElementById('main') || {}).innerText || document.body.innerText || ''`);
    eq(ready === 'yes', 'Inventory opens with a COUNT tab (' + String(early).replace(/\s+/g, ' ').slice(0, 180) + ')');
    if (ready !== 'yes') return shots;
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await evalJson(`document.querySelector('[data-iv="count"]').click(), 'go'`);
    const onCount = await waitFor(`document.querySelector('#icStart') && document.querySelector('[data-iv="count"].on') && document.querySelector('#ivCount h2') ? 'yes' : ''`);
    eq(onCount === 'yes', 'choosing COUNT shows the count page');
    const labels = JSON.parse(await evalJson(`JSON.stringify([...document.querySelectorAll('.ivchips [data-iv]')].map(b => b.getAttribute('data-iv')))`));
    eq(labels[labels.length - 1] === 'count' && labels.indexOf('all') === 0 && labels.indexOf('count') === labels.length - 1, 'COUNT is the last tab (' + labels.join(',') + ')');
    await snap(390, 'inv_count_tab_390.png');
    await snap(1024, 'inv_count_tab_1024.png');
    eq(shots.length === 2 && shots[0].md5 !== shots[1].md5, 'the 390 and 1024 COUNT shots differ');
    const countText = await evalJson(`(document.querySelector('#ivCount') || { innerText: '' }).innerText`);
    eq(/inventory count/i.test(countText) && /start count/i.test(countText) && /link tag/i.test(countText), 'the COUNT tab keeps the count page wording (' + String(countText).replace(/\s+/g, ' ').slice(0, 220) + ')');
    await evalJson(`document.querySelector('[data-iv="all"]').click(), 'go'`);
    const back = await waitFor(`document.querySelector('#ivGrid') && !document.querySelector('#icStart') ? 'yes' : ''`);
    eq(back === 'yes', 'All returns to the inventory list');
    await evalJson(`document.querySelector('[data-iv="count"]').click(), 'go'`);
    const again = await waitFor(`document.querySelector('#icStart') && document.querySelector('[data-iv="count"].on') ? 'yes' : ''`);
    eq(again === 'yes', 'COUNT can be opened again');
    await evalJson(`location.hash = '#/count'; 'go'`);
    const hopped = await waitFor(`location.hash === '#/jos' && document.querySelector('#icStart') && document.querySelector('[data-iv="count"].on') ? 'yes' : ''`);
    eq(hopped === 'yes', '#/count lands on Inventory with COUNT selected');
    const menu = JSON.parse(await evalJson(`JSON.stringify({
      keys: [...document.querySelectorAll('#side a[data-nkey]')].map(a => a.getAttribute('data-nkey')),
      shows: [...document.querySelectorAll('[data-nshow]')].map(b => b.textContent),
      text: document.getElementById('side').innerText
    })`));
    eq(menu.keys[0] === 'dashboard' && menu.keys.indexOf('count') < 0 && menu.keys.indexOf('jos') >= 0 && menu.text.indexOf('Inventory count') < 0, 'the left menu lists Inventory and not Inventory count (' + menu.keys.join(',') + ')');
    await evalJson(`localStorage.setItem('oypNavOrder:ada', JSON.stringify(['settings','count','dashboard','todo','jos'])); location.hash = '#/todo'; 'go'`);
    const saved = await waitFor(`(document.querySelector('#side a[data-nkey]') || {}).getAttribute && document.querySelector('#side a[data-nkey]').getAttribute('data-nkey') === 'consignment' ? 'yes' : ''`);
    const savedKeys = JSON.parse(await evalJson(`JSON.stringify([...document.querySelectorAll('#side a[data-nkey]')].map(a => a.getAttribute('data-nkey')))`));
    eq(saved === 'yes' && savedKeys.indexOf('count') < 0 && savedKeys.indexOf('jos') >= 0 && savedKeys.indexOf('settings') >= 0 && savedKeys.join(',') !== canon.join(','), 'a saved order that names count still renders every current item (' + savedKeys.join(',') + ')');
    await evalJson(`localStorage.setItem('oypNavHide:ada', JSON.stringify(['count','shop'])); location.hash = '#/dashboard'; 'go'`);
    const hid = await waitFor(`[...document.querySelectorAll('[data-nshow]')].some(b => b.textContent === 'Show Shop listings') ? 'yes' : ''`);
    const shows = JSON.parse(await evalJson(`JSON.stringify([...document.querySelectorAll('#side a[data-nkey]')].map(a => a.getAttribute('data-nkey')).concat([...document.querySelectorAll('[data-nshow]')].map(b => b.textContent)))`));
    eq(hid === 'yes' && shows.indexOf('shop') < 0 && shows.indexOf('Show Shop listings') >= 0 && !shows.some(t => /count/i.test(t)), 'hiding the removed count item does not add a Show row (' + shows.join(' | ') + ')');
    if (added && added.identifier) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: added.identifier });
    await evalJson(`localStorage.setItem('oypSession','staff1'); localStorage.setItem('oypUser', JSON.stringify({username:'thea', display_name:'Thea', role:'staff'})); localStorage.removeItem('oypNavHide:ada'); 'go'`);
    await send('Page.navigate', { url: origin + '/staff/index.html?api=' + encodeURIComponent(origin + '/api') + '#/count' });
    const staff = await waitFor(`location.hash === '#/jos' && document.querySelector('#icStart') && document.querySelectorAll('.ivchips [data-iv]').length === 1 ? 'yes' : ''`, 80);
    const staffState = await evalJson(`JSON.stringify({ hash: location.hash, chips: [...document.querySelectorAll('.ivchips [data-iv]')].map(b => b.getAttribute('data-iv')), start: !!document.querySelector('#icStart'), role: (JSON.parse(localStorage.getItem('oypUser') || '{}')).role, side: ((document.getElementById('side') || {}).innerText || '').replace(/\\s+/g, ' ').slice(0, 240), main: ((document.getElementById('main') || {}).innerText || '').replace(/\\s+/g, ' ').slice(0, 240) })`);
    const staffInfo = JSON.parse(staffState || '{}');
    eq(staff === 'yes' && staffInfo.chips && staffInfo.chips.length === 1 && staffInfo.chips[0] === 'count' && !/inventory count/i.test(staffInfo.side) && /inventory/i.test(staffInfo.side) && /appointments/i.test(staffInfo.side), 'a staff #/count bookmark opens Inventory with only the COUNT tab (' + staffState + ')');
    return shots;
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  const srv = await startServer();
  const origin = 'http://127.0.0.1:' + srv.address().port;
  try { await chrome(origin); }
  finally { srv.close(); }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('count-tab-sim ok');
})().catch(err => { console.error(err); process.exit(1); });
