/* Inventory search on a phone: Scan/Type, a scan keeps the number, and the page stays within the screen.
   Run: node sim/inv-scan-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}
const inv = read('inv.js');
const css = read('app.css');
const index = read('staff/index.html');
const scanBlock = inv.slice(inv.indexOf("if ($('#ivQ')) $('#ivQ').onkeydown"), inv.indexOf("if ($('#ivStage'))"));
eq(index.includes('app.css?v=67') && index.includes('inv.js?v=34') && index.includes('pay.css?v=4') && index.includes('todo.css?v=8') && index.includes('settings.css?v=12'), 'staff pages load the new css and inventory script');
eq(read('staff/print-test.html').includes('app.css?v=67') && read('staff/print-test.html').includes('settings.css?v=12'), 'print test loads the same staff css');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=67'), 'the customer page stays on app.css?v=29');
eq(!index.includes('maximum-scale') && !read('staff/print-test.html').includes('maximum-scale'), 'the viewport is not locked with maximum-scale');
eq(inv.includes('id="ivQMode"') && inv.includes("inputmode=\"${scan ? 'none' : 'search'}\"") && inv.includes("QMODE_KEY = 'oypIvQMode'") && inv.includes('function ivQSawScanner') && inv.includes('function ivQKeep'), 'the search box has a Scan/Type toggle remembered on this device');
eq(!inv.includes('#ivScan') && !inv.includes('id="ivScan"'), 'the toggle is not the old scan field');
eq(!scanBlock.includes("IV.q = ''") && scanBlock.includes('IV.q = ivQKeep(raw)') && scanBlock.includes('ivQSawScanner'), 'a scan Enter keeps the number and does not clear the box');
eq(inv.includes('function ivCaretEnd') && inv.includes('setSelectionRange(n, n)') && !inv.includes('.select()'), 'the caret stays at the end of the search box');
eq(css.includes('font-size:max(16px,calc(16px*var(--fs)))') && css.includes('.ivqrow{') && css.includes('grid-template-columns:auto minmax(0,1fr) auto') && css.includes('.ivchips{flex-wrap:nowrap;overflow-x:auto'), 'phone fields are at least 16px and the header and chips can shrink');
eq(read('pay.css').includes('font-size:max(16px,calc(15px*var(--fs)))') && read('settings.css').includes('font-size:max(16px,calc(15px*var(--fs)))') && read('todo.css').includes('font-size:max(16px,var(--d-btnsm-fp,calc(14px*var(--hs))))'), 'other text fields on a phone stay at least 16px');

const JOBS = [
  { jo: '26-287', client: 'Ana Cruz', description: 'Oval sapphire ring', location: 'showroom', item_type: 'ring', metal: 'gold', karat: '18', stone_type: 'sapphire', on_hand: true, price: 18500, cost: 9000, stage: '', col: '' },
  { jo: '26-300', client: 'Bea Santos', description: 'LongNecklaceDescriptionWithoutSpaces' + 'X'.repeat(40), location: 'vault', item_type: 'necklace', on_hand: true, price: 12000, cost: 4000, stage: '', col: '' },
  { jo: '26-281', client: 'Cara Lim', description: 'Repair chain', location: 'working', type: 'repair', stage: 'bench', col: 'bench', on_hand: false }
];
function apiBody(action) {
  if (action === 'me') return { ok: true, user: { username: 'ada', display_name: 'Ada', role: 'admin' } };
  if (action === 'invList') return {
    ok: true, can: { cost: true, price: true },
    stages: [['bench', 'Bench'], ['qc', 'Quality check']],
    locations: [['showroom', 'Showroom'], ['vault', 'Vault'], ['working', 'Working'], ['sold', 'Sold'], ['archived', 'Archived']],
    item_types: [['ring', 'Ring'], ['necklace', 'Necklace']],
    jobs: JOBS
  };
  if (action === 'jobReviewList') return { ok: true, jobs: [] };
  if (action === 'contactList') return { ok: true, missing: 0, total: 0, missing_jos: [], jobs: [] };
  if (action === 'portalSteps') return { ok: true, inbox: { items: [] } };
  if (action === 'todoList') return { ok: true, items: [], total: 0, done: [], people: [] };
  if (action === 'dashboard') return { ok: true, counts: {}, can: {}, board: [], locations: [], sales: { months: [] }, consignments: [], payments: [] };
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
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function chromeAt(width, port, pageUrl, shots) {
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=/tmp/chrome-inv-scan-' + width + '-' + Date.now(),
    '--blink-settings=primaryHoverType=1,primaryPointerType=2',
    '--window-size=' + width + ',844',
    'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  const notes = [];
  const check = (cond, msg) => { notes.push((cond ? 'ok ' : 'FAIL ') + msg); if (!cond) failed++; };
  try {
    let version;
    for (let i = 0; i < 40; i++) {
      try {
        version = await new Promise((resolve, reject) => {
          http.get('http://127.0.0.1:' + port + '/json/version', res => {
            let d = ''; res.on('data', c => { d += c; }); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
          }).on('error', reject);
        });
        break;
      } catch (err) { await sleep(100); }
    }
    if (!version) throw new Error('chrome did not open a debugging port');
    const target = await new Promise((resolve, reject) => {
      const req = http.request('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }, res => {
        let d = ''; res.on('data', c => { d += c; }); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
      });
      req.on('error', reject); req.end();
    });
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
    const send = (method, params) => new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
    });
    const evalJs = async expr => {
      const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 700));
      return result.result && result.result.value;
    };
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try {
      localStorage.setItem('oypSession', 'sess-inv-scan');
      localStorage.setItem('oypSessionExp', '2099-01-01T00:00:00.000Z');
      localStorage.setItem('oypUser', JSON.stringify({ username: 'ada', display_name: 'Ada', role: 'admin' }));
      localStorage.setItem('oypDevice', 'd-inv-scan');
      localStorage.removeItem('oypIvQMode');
    } catch (e) {}` });
    await send('Page.navigate', { url: pageUrl });
    let ready = null;
    for (let i = 0; i < 50; i++) {
      ready = await evalJs(`(() => {
        const q = document.getElementById('ivQ');
        const lay = document.getElementById('layEditBtn');
        const choose = document.getElementById('ivChoose');
        if (!q || !lay || !choose || document.querySelector('[aria-busy="true"]')) return null;
        return q.getAttribute('inputmode') + '|' + lay.textContent + '|' + choose.textContent;
      })()`);
      if (ready) break;
      await sleep(150);
    }
    check(ready === 'search|Edit layout|Select', 'at ' + width + 'px Inventory opens in Type with Edit layout and Select (' + ready + ')');
    const fit = async (label) => {
      const box = await evalJs(`(() => {
        const w = window.innerWidth;
        const sw = document.documentElement.scrollWidth;
        const pick = sel => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) };
        };
        const fonts = [...document.querySelectorAll('input, select, textarea')].filter(el => {
          const ty = (el.getAttribute('type') || '').toLowerCase();
          if (ty === 'checkbox' || ty === 'radio' || ty === 'hidden' || ty === 'range') return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden';
        }).map(el => ({ id: el.id || el.className, fs: parseFloat(getComputedStyle(el).fontSize) }));
        return { w, sw, fonts, top: pick('header.top'), lay: pick('#layEditBtn'), choose: pick('#ivChoose'), sum: pick('.ivsum'), chips: pick('.ivchips'), q: pick('#ivQ'), mode: pick('#ivQMode'), sels: pick('.ivsels') };
      })()`);
      const inside = part => part && part.l >= -1 && part.r <= box.w + 1 && part.w > 0;
      check(box && box.sw <= box.w, label + ' scrollWidth ' + (box && box.sw) + ' <= ' + (box && box.w));
      check(box && inside(box.top) && inside(box.lay) && inside(box.choose) && inside(box.sum) && inside(box.chips) && inside(box.q) && inside(box.mode), label + ' header, Edit layout, Select, stats, chips and search stay on screen ' + JSON.stringify(box && { top: box.top, lay: box.lay, choose: box.choose, sum: box.sum, chips: box.chips, q: box.q, mode: box.mode }));
      if (box && box.sels) check(inside(box.sels), label + ' filters stay on screen ' + JSON.stringify(box.sels));
      const small = (box && box.fonts || []).filter(f => !(f.fs >= 16));
      check(box && box.fonts.length > 0 && small.length === 0, label + ' inputs and selects are at least 16px ' + JSON.stringify(small));
      return box;
    };
    await evalJs(`(() => {
      const q = document.getElementById('ivQ');
      q.focus();
      q.value = 'sapphire';
      q.setSelectionRange(q.value.length, q.value.length);
      q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'sapphire' }));
      const again = document.getElementById('ivQ');
      again.focus();
      return again.value;
    })()`);
    await evalJs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const typed = await evalJs(`(() => {
      const q = document.getElementById('ivQ');
      q.focus();
      return { value: q.value, mode: q.getAttribute('inputmode'), active: document.activeElement && document.activeElement.id, cards: [...document.querySelectorAll('.ivcard')].map(c => c.dataset.jo).join(','), stored: localStorage.getItem('oypIvQMode') || '' };
    })()`);
    check(typed && typed.value === 'sapphire' && typed.mode === 'search' && typed.active === 'ivQ' && typed.cards === '26-287' && typed.stored === '', 'at ' + width + 'px a typed search stays in Type and filters (' + JSON.stringify(typed) + ')');
    await fit('at ' + width + 'px typed search');
    if (width === 390) {
      const pic = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shots, 'inv_search_typed_390.png'), Buffer.from(pic.data, 'base64'));
    }
    const scanned = await evalJs(`(async () => {
      const text = '26-300';
      for (const ch of text) {
        const q = document.getElementById('ivQ');
        q.focus();
        q.value = (q.value === 'sapphire' ? '' : q.value) + ch;
        if (q.value.length === 1) q.value = ch;
        const pos = q.value.length;
        q.setSelectionRange(pos, pos);
        q.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
      }
      const q = document.getElementById('ivQ');
      q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const box = document.getElementById('ivQ');
      return {
        value: box.value, mode: box.getAttribute('inputmode'),
        start: box.selectionStart, end: box.selectionEnd,
        active: document.activeElement && document.activeElement.id,
        stored: localStorage.getItem('oypIvQMode') || '',
        on: (document.querySelector('.ivcard.on') || {}).dataset ? document.querySelector('.ivcard.on').dataset.jo : '',
        cards: [...document.querySelectorAll('.ivcard')].map(c => c.dataset.jo).join(',')
      };
    })()`);
    check(scanned && scanned.value === '26-300' && scanned.mode === 'none' && scanned.stored === 'scan' && scanned.start === scanned.end && scanned.start === 6 && scanned.active === 'ivQ' && scanned.on === '26-300', 'at ' + width + 'px a fast scan keeps the number, collapses the highlight, and switches to Scan (' + JSON.stringify(scanned) + ')');
    await fit('at ' + width + 'px scan Enter');
    if (width === 390) {
      const pic = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shots, 'inv_search_scan_390.png'), Buffer.from(pic.data, 'base64'));
    }
    const typedAgain = await evalJs(`(async () => {
      document.getElementById('ivQMode').click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const before = document.getElementById('ivQ').getAttribute('inputmode');
      const text = '26-287';
      const q0 = document.getElementById('ivQ');
      q0.value = '';
      q0.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      for (const ch of text) {
        const q = document.getElementById('ivQ');
        q.focus();
        q.value += ch;
        q.setSelectionRange(q.value.length, q.value.length);
        q.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
      }
      document.getElementById('ivQ').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const box = document.getElementById('ivQ');
      return { before, value: box.value, mode: box.getAttribute('inputmode'), stored: localStorage.getItem('oypIvQMode') || '', active: document.activeElement && document.activeElement.id, start: box.selectionStart, end: box.selectionEnd };
    })()`);
    check(typedAgain && typedAgain.before === 'search' && typedAgain.value === '26-287' && typedAgain.mode === 'search' && typedAgain.stored === 'type' && typedAgain.active === 'ivQ' && typedAgain.start === typedAgain.end, 'at ' + width + 'px Type stays Type after another scan and the number stays put (' + JSON.stringify(typedAgain) + ')');
    await evalJs(`(() => { const s = document.getElementById('ivLoc'); s.value = 'showroom'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await evalJs('new Promise(r => requestAnimationFrame(() => r(1)))');
    const filtered = await evalJs(`(() => ({ cards: [...document.querySelectorAll('.ivcard')].map(c => c.dataset.jo).join(','), q: document.getElementById('ivQ').value }))()`);
    check(filtered && filtered.cards === '26-287' && filtered.q === '26-287', 'at ' + width + 'px the location filter runs on the kept search (' + JSON.stringify(filtered) + ')');
    await fit('at ' + width + 'px filters');
    await evalJs(`document.getElementById('ivChoose').click()`);
    await evalJs(`(() => { const q = document.getElementById('ivQ'); if (q) q.focus(); })()`);
    await evalJs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const chosen = await evalJs(`(() => ({ choose: document.getElementById('ivChoose').textContent, bar: !!document.querySelector('.ivbar'), active: document.activeElement && document.activeElement.id }))()`);
    check(chosen && chosen.choose === 'Done' && chosen.bar && chosen.active === 'ivQ', 'at ' + width + 'px Select mode keeps the search focused (' + JSON.stringify(chosen) + ')');
    await fit('at ' + width + 'px select mode');
    if (width === 390) {
      const pic = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shots, 'inv_search_select_390.png'), Buffer.from(pic.data, 'base64'));
    }
    return notes;
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chrome.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  if (failed) { console.error(failed + ' failed before chrome'); process.exit(1); }
  const shots = '/opt/cursor/artifacts/inv-scan';
  fs.mkdirSync(shots, { recursive: true });
  const srv = await startServer();
  const port = srv.address().port;
  const page = 'http://127.0.0.1:' + port + '/staff/index.html?api=' + encodeURIComponent('http://127.0.0.1:' + port + '/api') + '#/jos';
  try {
    for (const [width, dbg] of [[390, 9520], [375, 9521]]) {
      try {
        const notes = await chromeAt(width, dbg, page, shots);
        notes.forEach(n => { if (n.indexOf('FAIL') === 0) console.error(n); else console.log(n); });
      } catch (err) {
        failed++;
        console.error('FAIL headless at ' + width + 'px: ' + String(err && err.stack || err).slice(0, 900));
      }
    }
  } finally { srv.close(); }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('ok inventory scan and phone width');
})();
