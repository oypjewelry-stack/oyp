/* Inventory viewer icons sit in the middle of the circles.
   Run: node sim/viewer-icon-sim.js */
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
const css = read('app.css');
const index = read('staff/index.html');
eq(index.includes('app.css?v=61') && index.includes('inv.js?v=28') && read('staff/print-test.html').includes('app.css?v=61'), 'staff pages load the new css and inventory script');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=61'), 'the customer page stays on app.css?v=29');
eq(inv.includes('stroke-width="2.5"') && inv.includes('viewBox="0 0 24 24"') && inv.includes('stroke="currentColor"') && inv.includes('stroke-linecap="round"'), 'the five controls are stroke icons');
eq(inv.includes('aria-label="Close"') && inv.includes('aria-label="Previous photo"') && inv.includes('aria-label="Next photo"') && inv.includes('aria-label="Zoom out"') && inv.includes('aria-label="Zoom in"'), 'the labels stay on the buttons');
eq(css.includes('.iview .ivx{display:grid;place-items:center;padding:0;') && css.includes('.iview .ivz{display:grid;place-items:center;padding:0;') && css.includes('place-items:center') && css.includes('.iview .ivprev,.iview .ivnext{display:grid}'), 'close, zoom, and the desktop arrows center with grid');
eq(css.includes('.iview .ivprev[hidden],.iview .ivnext[hidden]{display:none}') && css.includes('.iview.sketch .ivx,.iview.sketch .ivz{box-shadow:0 0 0 1px #111}') && css.includes('.iview.sketch .ivprev,.iview.sketch .ivnext{box-shadow:0 0 0 1px #111}'), 'hidden arrows and the sketch ring stay');
eq(inv.includes("e.key === 'ArrowLeft'") && inv.includes("e.key === 'ArrowRight'") && inv.includes('Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)'), 'keyboard and swipe still move inside the list');

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

async function chrome() {
  const port = 9410 + Math.floor(Math.random() * 400);
  const dir = '/tmp/chrome-viewer-icons-' + Date.now();
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
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
    for (const width of [390, 1280]) {
      const height = width < 800 ? 844 : 800;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
      await send('Page.navigate', { url: 'file://' + path.join(root, 'sim/viewer-icon-preview.html') + '?w=' + width });
      let ready = '';
      for (let i = 0; i < 40; i++) {
        ready = await evalJson('window.__ready ? "yes" : ""');
        if (ready === 'yes') break;
        await sleep(50);
      }
      eq(ready === 'yes', 'the viewer opened at ' + width);
      if (ready !== 'yes') continue;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const inner = await evalJson('window.innerWidth');
      eq(inner === width, 'layout width is ' + width + ' (got ' + inner + ')');
      const rows = JSON.parse(await evalJson('JSON.stringify(window.__measure())'));
      console.log('measure', width, JSON.stringify(rows));
      rows.forEach(row => {
        const centered = Math.abs(row.dx) <= 0.5 && Math.abs(row.dy) <= 0.5;
        eq(centered && row.bw === 44 && row.bh === 44 && row.sw === 24 && row.sh === 24, width + ' ' + row.name + ' icon is centered in the 44px circle (' + row.dx + ', ' + row.dy + ')');
        if (row.name === 'prev' || row.name === 'next') {
          eq(row.natural === (width < 800 ? 'none' : 'grid'), width + ' ' + row.name + ' keeps its show and hide rule (' + row.natural + ')');
        } else {
          eq(row.natural === 'grid' && row.pad === '0px', width + ' ' + row.name + ' is a grid button with no padding');
        }
      });
      const keys = await evalJson(`(() => {
        const pos = () => document.querySelector('#ivView .ivpos').textContent;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const after = pos();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        return { after: after, back: pos() };
      })()`);
      eq(keys && keys.after === '3 / 3' && keys.back === '2 / 3', 'arrow keys still move inside the three pages at ' + width);
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      await sleep(60);
      const png = await send('Page.captureScreenshot', { format: 'png' });
      const name = 'inv_viewer_icons_' + width + '.png';
      const buf = Buffer.from(png.data, 'base64');
      fs.writeFileSync(path.join(art, name), buf);
      const md5 = crypto.createHash('md5').update(buf).digest('hex');
      shots.push({ name, md5, bytes: buf.length });
      console.log('shot', name, md5, buf.length);
    }
    eq(shots.length === 2 && shots[0].md5 !== shots[1].md5, 'the 390 and 1280 viewer shots differ');
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
  }
}

chrome().then(() => {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('viewer-icon-sim ok');
}).catch(err => { console.error(err); process.exit(1); });
