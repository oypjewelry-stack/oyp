/* Inventory header: Select and Edit layout sit on the filter row.
   Edit layout stays above the title on every other back-office page.
   Run: node sim/inv-head-sim.js */
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
const inv = read('inv.js');
const app = read('app.js');
const css = read('app.css');
const index = read('staff/index.html');
const head = inv.slice(inv.indexOf('main.innerHTML = `<div class="iv'), inv.indexOf('function ivCard'));
eq(head.includes('class="ivfilt"') && head.includes('class="ivfiltacts"') && head.includes('id="ivChoose"'), 'Select lives in the filter actions');
eq(head.includes('<span class="dheadacts"><span class="lab">') && !head.includes('dheadacts"><span class="lab">${esc(plural(L.length, \'item\'))}</span><button'), 'the title row keeps the count and does not keep Select');
eq(head.indexOf('class="ivchips"') < head.indexOf('id="ivQ"') && head.indexOf('id="ivQ"') < head.indexOf('class="ivfilt"'), 'tabs and search stay above the filters');
eq(app.includes("main.querySelector('.ivfiltacts')") && app.includes('slot.appendChild(row)') && app.includes('main.insertBefore(row, main.firstChild)'), 'Edit layout moves into Inventory and stays at the top of every other page');
eq(app.includes("btn.textContent = on ? 'Done' : 'Edit layout'") && app.includes("toast('Layout saved')"), 'Edit layout still toggles and saves');
eq(inv.includes("if ($('#ivChoose')) $('#ivChoose').onclick") && inv.includes('IV.choose = !IV.choose') && inv.includes('class="ivbar"'), 'Select still enters select mode and the toolbar stays');
eq(css.includes('.ivfilt{display:flex;align-items:flex-end') && css.includes('.ivfilt .ivsels{flex-wrap:nowrap}') && css.includes('@media (max-width:760px){.ivfilt{flex-direction:column;align-items:stretch}'), 'desktop keeps one filter line and mobile stacks the buttons under it');
eq(index.includes('app.css?v=67') && index.includes('app.js?v=43') && index.includes('inv.js?v=34'), 'changed files are cache-busted');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=67'), 'the customer page stays on app.css?v=29');

const jobs = [];
for (let i = 0; i < 18; i++) {
  jobs.push({
    jo: '26-' + (400 + i), description: 'Gold ring ' + (i + 1), client: 'Ada',
    location: 'vault', item_type: 'ring', metal: 'Yellow gold', karat: '18',
    cost: 1200, price: 2400, on_hand: true, col: 'bench', stage: 'bench'
  });
}
const LIST = {
  ok: true, can: { cost: true, price: true },
  stages: [['bench', 'Bench'], ['qc', 'Quality check']],
  locations: [['vault', 'Vault'], ['bench', 'Bench']],
  item_types: [['ring', 'Ring']],
  jobs
};
const DASH = {
  ok: true, generated_at: '2026-10-22T08:00:00.000Z',
  counts: { active_jobs: 2, pending_work: 0, on_hand: 18, month_sales: 1000, consigned_out: 0, overdue_consignments: 0 },
  can: { sales: true, consign: true, payments: true }, overdue_days: 30,
  board: [{ key: 'bench', label: 'Bench', count: 0, cards: [] }],
  locations: ['working', 'vault', 'archived'].map(k => ({ key: k, label: k[0].toUpperCase() + k.slice(1), count: k === 'archived' ? 0 : 1 })),
  sales: { month: '2026-10', months: [{ month: '2026-10', total: 1000 }] },
  consignments: [], payments: []
};
function apiBody(action) {
  if (action === 'me') return { ok: true, user: { username: 'ada', display_name: 'Ada', role: 'admin' } };
  if (action === 'invList') return LIST;
  if (action === 'dashboard') return DASH;
  if (action === 'todoList') return { ok: true, items: [], total: 0, done: [], people: [] };
  if (action === 'contactList') return { ok: true, missing: 0, total: 0, missing_jos: [] };
  if (action === 'portalSteps') return { ok: true, inbox: { items: [] } };
  if (action === 'jobReviewList') return { ok: true, items: [] };
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
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
const MEASURE = `(() => {
  const box = el => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; };
  const sels = [...document.querySelectorAll('.ivsel')];
  const choose = document.getElementById('ivChoose');
  const lay = document.getElementById('layEditBtn');
  const h = document.querySelector('.iv .dhead h2');
  const lab = document.querySelector('.iv .dheadacts .lab');
  const main = document.querySelector('.main');
  const filt = document.querySelector('.ivfilt');
  const q = document.getElementById('ivQ');
  const chips = document.querySelector('.ivchips');
  const sum = document.querySelector('.ivsum');
  if (!sels.length || !choose || !lay || !h || !lab || !main || !filt) return null;
  const rowT = Math.min.apply(null, sels.map(s => s.getBoundingClientRect().top));
  const rowB = Math.max.apply(null, sels.map(s => s.getBoundingClientRect().bottom));
  const rowR = Math.max.apply(null, sels.map(s => s.getBoundingClientRect().right));
  const pad = parseFloat(getComputedStyle(main).paddingTop) || 0;
  const hb = box(h), lb = box(lab), cb = box(choose), yb = box(lay), fb = box(filt);
  const overlap = b => b.t < rowB - 0.5 && b.b > rowT + 0.5;
  const below = b => b.t >= rowB - 1;
  return {
    wide: window.innerWidth > 760,
    title: h.textContent,
    count: lab.textContent,
    choose: choose.textContent,
    lay: lay.textContent,
    inSlot: !!(choose.closest('.ivfiltacts') && lay.closest('.ivfiltacts')),
    inHead: !!document.querySelector('.dhead #ivChoose'),
    gap: Math.round((hb.t - main.getBoundingClientRect().top - pad) * 10) / 10,
    countOverlap: lb.t < hb.b && lb.b > hb.t,
    chooseOverlap: overlap(cb),
    layOverlap: overlap(yb),
    chooseBelow: below(cb),
    layBelow: below(yb),
    chooseRight: cb.l >= rowR - 1,
    layRight: yb.l >= rowR - 1,
    pair: cb.t < yb.b && cb.b > yb.t,
    right: Math.round((fb.r - Math.max(cb.r, yb.r)) * 10) / 10,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    order: hb.b <= (sum ? sum.getBoundingClientRect().top + 1 : hb.b) && chips.getBoundingClientRect().bottom <= q.getBoundingClientRect().top + 1 && q.getBoundingClientRect().bottom <= rowT + 1,
    rowT: rowT, rowB: rowB, cb: cb, yb: yb
  };
})()`;

async function chromeAt(width, port, pageUrl, art) {
  const dir = '/tmp/chrome-inv-head-' + width + '-' + Date.now();
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + port, '--user-data-dir=' + dir, 'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  try {
    let version = '';
    for (let i = 0; i < 50; i++) {
      try { version = await httpGet('http://127.0.0.1:' + port + '/json/version'); break; }
      catch (e) { await sleep(100); }
    }
    if (!version) throw new Error('chrome did not open');
    const browser = new WebSocket(JSON.parse(version).webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { browser.addEventListener('open', resolve); browser.addEventListener('error', reject); });
    let seq = 0;
    const pending = new Map();
    const onMsg = ev => {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    };
    browser.addEventListener('message', onMsg);
    const sendBrowser = (method, params) => {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        browser.send(JSON.stringify({ id, method, params: params || {} }));
      });
    };
    const { targetId } = await sendBrowser('Target.createTarget', { url: 'about:blank' });
    browser.close();
    const list = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json/list'));
    const page = list.find(t => t.id === targetId);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    seq = 0;
    pending.clear();
    ws.addEventListener('message', onMsg);
    const send = (method, params) => {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    };
    const evalJson = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
      return r.result && r.result.value;
    };
    const height = width < 800 ? 844 : 900;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try {
      localStorage.setItem('oypSession', 'sess-head');
      localStorage.setItem('oypSessionExp', '2099-01-01T00:00:00.000Z');
      localStorage.setItem('oypUser', JSON.stringify({ username: 'ada', display_name: 'Ada', role: 'admin' }));
      localStorage.setItem('oypDevice', 'd-head');
    } catch (e) {}` });
    await send('Page.navigate', { url: pageUrl });
    let m = null;
    for (let i = 0; i < 80; i++) {
      m = await evalJson(MEASURE);
      if (m && m.lay === 'Edit layout' && m.choose === 'Select') break;
      m = null;
      await sleep(100);
    }
    eq(!!m, 'the inventory header is ready at ' + width);
    if (!m) return;
    console.log('measure', width, JSON.stringify(m));
    eq(m.title === 'Inventory' && m.count === '18 items' && m.inSlot === true && m.inHead === false, 'the title keeps 18 items and both buttons sit in the filter row at ' + width);
    eq(m.gap < 8 && m.countOverlap === true && m.order === true, 'the title row has no leftover gap and the summary, tabs, and search stay put at ' + width + ' (gap ' + m.gap + ')');
    eq(m.overflow <= 1, 'the page does not overflow sideways at ' + width + ' (' + m.overflow + ')');
    eq(m.pair === true && m.right <= 2 && m.right >= -1, 'the two buttons share a line and sit on the right at ' + width);
    if (m.wide) eq(m.chooseOverlap === true && m.layOverlap === true && m.chooseRight === true && m.layRight === true, 'both buttons overlap the dropdown row at ' + width);
    else eq(m.chooseBelow === true && m.layBelow === true && m.chooseOverlap === false && m.layOverlap === false, 'both buttons sit below the dropdowns at ' + width);
    await evalJson('window.scrollTo(0,0); 1');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    await sleep(60);
    const png = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(png.data, 'base64');
    const name = 'inv_head_after_' + width + '.png';
    fs.writeFileSync(path.join(art, name), buf);
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    const beforePath = path.join(art, 'inv_head_before_' + width + '.png');
    const before = crypto.createHash('md5').update(fs.readFileSync(beforePath)).digest('hex');
    eq(md5 !== before, 'the ' + width + ' screenshot changed (' + before + ' -> ' + md5 + ')');
    if (width === 1024) {
      const picked = await evalJson(`(async () => {
        document.getElementById('ivChoose').click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const choose = document.getElementById('ivChoose');
        const lay = document.getElementById('layEditBtn');
        const on = document.querySelector('.iv.choose') && document.querySelector('.ivall');
        const layText = lay && lay.textContent;
        const slot = !!(choose && choose.closest('.ivfiltacts') && lay && lay.closest('.ivfiltacts'));
        document.querySelector('[data-ck]').click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const bar = !!document.querySelector('.ivbar');
        const print = document.getElementById('ivPrint') && document.getElementById('ivPrint').textContent;
        document.getElementById('ivChoose').click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const back = document.getElementById('ivChoose').textContent;
        const off = !document.querySelector('.iv.choose') && !document.querySelector('.ivbar');
        document.getElementById('layEditBtn').click();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const editing = document.documentElement.classList.contains('layedit') && document.getElementById('layEditBtn').textContent;
        document.getElementById('layEditBtn').click();
        await new Promise(r => setTimeout(r, 40));
        const toast = document.getElementById('toast');
        return { on: !!on, layText, slot, choose: choose.textContent, bar, print, back, off, editing, toast: toast && toast.textContent, lay: document.getElementById('layEditBtn').textContent };
      })()`);
      console.log('clicks', JSON.stringify(picked));
      eq(picked && picked.on && picked.choose === 'Done' && picked.layText === 'Edit layout' && picked.slot, 'Select enters select mode without toggling Edit layout');
      eq(picked && picked.bar && picked.print === 'Print stickers (1)' && picked.back === 'Select' && picked.off, 'the select toolbar still prints one sticker and Done leaves select mode');
      eq(picked && picked.editing === 'Done' && picked.toast === 'Layout saved' && picked.lay === 'Edit layout', 'Edit layout still toggles to Done and saves');
      const dash = await evalJson(`(async () => {
        location.hash = '#/dashboard';
        for (let i = 0; i < 40; i++) {
          const lay = document.getElementById('layEditBtn');
          const board = document.querySelector('[data-dsec="board"]');
          if (lay && board && !document.querySelector('.ivfiltacts')) {
            const row = document.getElementById('layRow');
            return { parent: row.parentElement && row.parentElement.id, first: row.parentElement.firstElementChild === row, text: lay.textContent };
          }
          await new Promise(r => setTimeout(r, 100));
        }
        return null;
      })()`);
      console.log('dashboard', JSON.stringify(dash));
      eq(dash && dash.parent === 'main' && dash.first === true && dash.text === 'Edit layout', 'the dashboard still has Edit layout at the top of the page');
    }
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chrome.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  const art = '/opt/cursor/artifacts';
  fs.mkdirSync(art, { recursive: true });
  const srv = await startServer();
  const port = srv.address().port;
  const page = 'http://127.0.0.1:' + port + '/staff/index.html?api=' + encodeURIComponent('http://127.0.0.1:' + port + '/api') + '#/jos';
  try {
    await chromeAt(390, 9611, page, art);
    await chromeAt(1024, 9612, page, art);
    await chromeAt(1280, 9613, page, art);
  } finally { srv.close(); }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('inv-head-sim ok');
})().catch(err => { console.error(err); process.exit(1); });
