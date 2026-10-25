/* Inventory card pills: the label sits in the middle of every chip, and chips on one line share a height and a top.
   Run: node sim/chip-align-sim.js */
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
const css = read('app.css');
const index = read('staff/index.html');
eq(index.includes('app.css?v=65') && read('staff/print-test.html').includes('app.css?v=65'), 'staff pages load the new css');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=65'), 'the customer page stays on app.css?v=29');
eq(css.includes('display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;line-height:1') && css.includes('letter-spacing:.04em;text-indent:.04em'), 'chips are a centered flex line and the letter-spacing indent matches');
eq(css.includes('.ivcard .kf .chip{white-space:nowrap}') && !css.includes('.kf .chip.tbr'), 'a card pill, including REVIEW, uses the row size');
eq(css.includes('.ivtag .chip.tbr{font-size:calc(12px*var(--fs));line-height:1;white-space:nowrap;letter-spacing:.02em;text-indent:.02em'), 'the detail REVIEW badge keeps its size and its own indent');
eq(read('joinbox.css').includes('.jifields .chip{letter-spacing:.08em;text-indent:.08em}') && index.includes('joinbox.css?v=3'), 'the join-box chip uses the same indent as its wider tracking');

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
function near(n, limit) { return Math.abs(n) <= limit; }

async function chrome() {
  const port = 9740 + Math.floor(Math.random() * 200);
  const dir = '/tmp/chrome-chip-align-' + Date.now();
  const chromeProc = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--allow-file-access-from-files',
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
    const art = '/opt/cursor/artifacts';
    fs.mkdirSync(art, { recursive: true });
    const views = [
      { name: '390', width: 390, height: 844, dpr: 2, mobile: true },
      { name: '1024', width: 1024, height: 900, dpr: 2, mobile: false }
    ];
    for (const view of views) {
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
      await send('Page.navigate', { url: 'file://' + path.join(root, 'sim/chip-align-preview.html') });
      await sleep(250);
      await evalJson('document.fonts.ready');
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const inner = await evalJson('window.innerWidth');
      eq(inner === view.width, 'layout width is ' + view.width + ' (got ' + inner + ')');
      const data = JSON.parse(await evalJson('JSON.stringify(window.__measure())'));
      console.log(view.name, JSON.stringify(data));
      eq(data.dpr === 2, view.name + ' device pixel ratio is 2');
      eq(data.pills.length === 4, view.name + ' shows the four pills');
      const heights = data.pills.map(p => p.h);
      const heightGap = Math.max.apply(null, heights) - Math.min.apply(null, heights);
      eq(heightGap <= 0.5, view.name + ' pills share a height (spread ' + heightGap.toFixed(3) + 'px)');
      const lines = [];
      data.pills.forEach(p => {
        let line = lines.find(g => Math.abs(g.top - p.top) <= 0.5);
        if (!line) { line = { top: p.top, pills: [] }; lines.push(line); }
        line.pills.push(p);
      });
      lines.forEach(line => {
        const tops = line.pills.map(p => p.top);
        const topGap = Math.max.apply(null, tops) - Math.min.apply(null, tops);
        eq(topGap <= 0.5, view.name + ' line shares a top (spread ' + topGap.toFixed(3) + 'px, ' + line.pills.map(p => p.text).join(', ') + ')');
      });
      data.pills.forEach(p => {
        eq(near(p.dx, 0.5) && near(p.dy, 0.5), view.name + ' ' + p.text + ' text center dx ' + p.dx.toFixed(3) + ' dy ' + p.dy.toFixed(3));
        eq(p.disp === 'flex' && p.bs === 'border-box' && p.lh === '10px' && p.fs === '10px', view.name + ' ' + p.text + ' is a 10px flex chip (' + p.disp + ', ' + p.lh + ', ' + p.fs + ')');
      });
      eq(near(data.detail.dx, 0.5) && near(data.detail.dy, 0.5), view.name + ' detail REVIEW text center dx ' + data.detail.dx.toFixed(3) + ' dy ' + data.detail.dy.toFixed(3));
      const rect = JSON.parse(await evalJson(`JSON.stringify((() => {
        const row = document.getElementById('row');
        const kd = document.querySelector('.kd');
        const r = row.getBoundingClientRect();
        const d = kd.getBoundingClientRect();
        const x = Math.max(0, Math.min(r.x, d.x) - 10);
        const y = Math.max(0, d.y - 8);
        const right = Math.max(r.right, d.right) + 10;
        const bottom = r.bottom + 10;
        return { x: x, y: y, w: Math.max(220, right - x), h: bottom - y };
      })())`));
      const png = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }
      });
      const buf = Buffer.from(png.data, 'base64');
      const name = 'chip_after_' + view.name + '.png';
      fs.writeFileSync(path.join(art, name), buf);
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      shots.push({ name, md5, view: view.name });
      console.log('shot', name, md5, buf.length);
      const beforePath = path.join(art, 'chip_before_' + view.name + '.png');
      if (fs.existsSync(beforePath)) {
        const beforeMd5 = crypto.createHash('md5').update(fs.readFileSync(beforePath)).digest('hex');
        eq(beforeMd5 !== md5, view.name + ' after screenshot differs from before');
      }
    }
    eq(shots.length === 2 && shots[0].md5 !== shots[1].md5, 'the 390 and 1024 crops differ');
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
  }
}

chrome().then(() => {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('chip-align-sim ok');
}).catch(err => { console.error(err); process.exit(1); });
