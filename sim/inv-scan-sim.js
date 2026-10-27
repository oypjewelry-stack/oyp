/* Inventory search on a phone: a scan fills the box on its own, typing stays available, and the page stays within the screen.
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
const docAt = inv.lastIndexOf("document.addEventListener('keydown'");
const docBlock = inv.slice(docAt, inv.indexOf('}, true);', docAt));
eq(index.includes('app.css?v=70') && index.includes('inv.js?v=37') && index.includes('pay.css?v=4') && index.includes('todo.css?v=8') && index.includes('settings.css?v=12'), 'staff pages load the new css and inventory script');
eq(read('staff/print-test.html').includes('app.css?v=70') && read('staff/print-test.html').includes('settings.css?v=12'), 'print test loads the same staff css');
eq(read('index.html').includes('app.css?v=30') && !read('index.html').includes('app.css?v=70'), 'the customer page stays on app.css?v=30');
eq(!index.includes('maximum-scale') && !read('staff/print-test.html').includes('maximum-scale'), 'the viewport is not locked with maximum-scale');
eq(inv.includes('inputmode="search"') && inv.includes('function ivSoftOpen') && inv.includes('function ivHardwareBurst') && inv.includes('function ivScanEnter') && inv.includes("localStorage.removeItem('oypIvQMode')") && inv.includes('function ivQKeep') && inv.includes('SCAN_GAP = 50') && inv.includes('SCAN_HARD_ENTER = 400'), 'a scan is a 50ms wedge or a hardware wedge while the software keyboard is closed');
eq(!inv.includes('id="ivQMode"') && !inv.includes('ivQSawScanner') && !inv.includes('QMODE_KEY') && !inv.includes('inputmode="none"') && !inv.includes('ivqmode') && inv.includes('does not draw a keyboard button'), 'the search box has no Scan/Type switch and no page keyboard button');
eq(!inv.includes('#ivScan') && !inv.includes('id="ivScan"'), 'capture does not use the old scan field');
eq(!scanBlock.includes("IV.q = ''") && scanBlock.includes('IV.q = ivQKeep(raw)') && scanBlock.includes('ivScanEnter(raw)') && scanBlock.includes('e.target.blur()'), 'a scan Enter keeps the number, blurs, and does not clear the box');
eq(docBlock.includes('IV.q = ivQKeep(raw)') && docBlock.includes('ivScanCommit(raw, false)') && !docBlock.includes("IV.q = ''"), 'a scan while the box is not focused still fills the search box');
eq(inv.includes('function ivReleaseSearch') && !inv.includes('ivRefocus') && inv.includes('function ivCaretEnd') && inv.includes('setSelectionRange(n, n)') && !inv.includes('.select()'), 'after a scan the caret is collapsed and the field is not refocused');
eq(css.includes('font-size:max(16px,calc(16px*var(--fs)))') && css.includes('.ivqrow{') && !css.includes('.ivqmode{') && css.includes('grid-template-columns:auto minmax(0,1fr) auto') && css.includes('.ivchips{flex-wrap:nowrap;overflow-x:auto'), 'phone fields are at least 16px and the header and chips can shrink');
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
      localStorage.setItem('oypIvQMode', 'scan');
    } catch (e) {}` });
    await send('Page.navigate', { url: pageUrl });
    let ready = null;
    for (let i = 0; i < 50; i++) {
      ready = await evalJs(`(() => {
        const q = document.getElementById('ivQ');
        const lay = document.getElementById('layEditBtn');
        const choose = document.getElementById('ivChoose');
        if (!q || !choose || document.querySelector('[aria-busy="true"]')) return null;
        const shown = !!(lay && getComputedStyle(lay).display !== 'none' && lay.getBoundingClientRect().height > 0);
        const modeBtn = document.getElementById('ivQMode');
        return q.getAttribute('inputmode') + '|' + (shown ? lay.textContent : 'hidden') + '|' + choose.textContent + '|' + (modeBtn ? 'button' : 'nobutton') + '|' + (localStorage.getItem('oypIvQMode') || '');
      })()`);
      if (ready) break;
      await sleep(150);
    }
    check(ready === 'search|hidden|Select|nobutton|', 'at ' + width + 'px Inventory opens ready to type, with Edit layout hidden and no saved scan mode (' + ready + ')');
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
      check(box && inside(box.top) && !box.lay && inside(box.choose) && inside(box.sum) && inside(box.chips) && inside(box.q) && !box.mode && box.q.w > box.w * 0.8, label + ' header, Select, stats, chips and search stay on screen with Edit layout hidden ' + JSON.stringify(box && { top: box.top, lay: box.lay, choose: box.choose, sum: box.sum, chips: box.chips, q: box.q, mode: box.mode }));
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
    check(typed && typed.value === 'sapphire' && typed.mode === 'search' && typed.active === 'ivQ' && typed.cards === '26-287' && typed.stored === '', 'at ' + width + 'px a typed search keeps the software keyboard and filters (' + JSON.stringify(typed) + ')');
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
    check(scanned && scanned.value === '26-300' && scanned.mode === 'search' && scanned.stored === '' && scanned.start === scanned.end && scanned.active !== 'ivQ' && scanned.on === '26-300' && scanned.cards === '26-300', 'at ' + width + 'px a fast scan keeps the number, leaves the keyboard mode alone, and does not highlight it (' + JSON.stringify(scanned) + ')');
    await fit('at ' + width + 'px scan Enter');
    if (width === 390) {
      const pic = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shots, 'inv_search_scan_390.png'), Buffer.from(pic.data, 'base64'));
    }
    const tapped = await evalJs(`(() => {
      const box = document.getElementById('ivQ');
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
      return { value: box.value, mode: box.getAttribute('inputmode'), active: document.activeElement && document.activeElement.id, start: box.selectionStart, end: box.selectionEnd };
    })()`);
    check(tapped && tapped.value === '26-300' && tapped.mode === 'search' && tapped.active === 'ivQ' && tapped.start === tapped.end && tapped.end === 6, 'at ' + width + 'px tapping the box after a scan restores typing with the caret at the end (' + JSON.stringify(tapped) + ')');
    const slow = await evalJs(`(async () => {
      const q0 = document.getElementById('ivQ');
      q0.focus();
      q0.value = '';
      q0.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      for (const ch of 'beads') {
        await new Promise(r => setTimeout(r, 70));
        const q = document.getElementById('ivQ');
        q.focus();
        q.value += ch;
        q.setSelectionRange(q.value.length, q.value.length);
        q.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
      }
      await new Promise(r => setTimeout(r, 70));
      document.getElementById('ivQ').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const box = document.getElementById('ivQ');
      return { value: box.value, mode: box.getAttribute('inputmode'), active: document.activeElement && document.activeElement.id };
    })()`);
    check(slow && slow.value === 'beads' && slow.mode === 'search' && slow.active === 'ivQ', 'at ' + width + 'px a slow word and Enter stays typing (' + JSON.stringify(slow) + ')');
    const unfocused = await evalJs(`(async () => {
      const q = document.getElementById('ivQ');
      q.blur();
      for (const ch of '26-281') document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const box = document.getElementById('ivQ');
      return {
        value: box.value, mode: box.getAttribute('inputmode'),
        active: document.activeElement && document.activeElement.id,
        on: (document.querySelector('.ivcard.on') || {}).dataset ? document.querySelector('.ivcard.on').dataset.jo : ''
      };
    })()`);
    check(unfocused && unfocused.value === '26-281' && unfocused.mode === 'search' && unfocused.active !== 'ivQ' && unfocused.on === '26-281', 'at ' + width + 'px a scan with the box unfocused still fills it (' + JSON.stringify(unfocused) + ')');
    const soft = await evalJs(`(() => { const vv = window.visualViewport; const h = window.innerHeight || 0; return !!(vv && h && vv.height < h * 0.75); })()`);
    const lagged = await evalJs(`(async () => {
      document.getElementById('ivQ').blur();
      for (const ch of 'pearl') document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      await new Promise(r => setTimeout(r, 150));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
      const box = document.getElementById('ivQ');
      return { value: box.value, mode: box.getAttribute('inputmode'), active: document.activeElement && document.activeElement.id };
    })()`);
    check(lagged && lagged.mode === 'search' && lagged.value === (soft ? '26-281' : 'pearl') && lagged.active !== 'ivQ', 'at ' + width + 'px a hardware wedge whose Enter lags ' + (soft ? 'stays a search while the software keyboard is open' : 'fills the box while the software keyboard is closed') + ' (' + JSON.stringify(lagged) + ')');
    await evalJs(`(() => { const s = document.getElementById('ivLoc'); s.value = 'showroom'; s.dispatchEvent(new Event('change', { bubbles: true })); const q = document.getElementById('ivQ'); q.focus(); q.value = '26-287'; q.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '26-287' })); })()`);
    await evalJs('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const filtered = await evalJs(`(() => ({ cards: [...document.querySelectorAll('.ivcard')].map(c => c.dataset.jo).join(','), q: document.getElementById('ivQ').value, active: document.activeElement && document.activeElement.id }))()`);
    check(filtered && filtered.cards === '26-287' && filtered.q === '26-287' && filtered.active === 'ivQ', 'at ' + width + 'px the location filter runs on a typed search (' + JSON.stringify(filtered) + ')');
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
