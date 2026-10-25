/* List cards at 2x: the 300px thumb is soft, the upgraded bitmap matches the card.
   Run: node sim/sharp-list-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}
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
  const port = 9600 + Math.floor(Math.random() * 300);
  const dir = '/tmp/chrome-sharp-list-' + Date.now();
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
    const width = 1100, height = 1800;
    for (const phase of ['before', 'after']) {
      await send('Emulation.setDeviceMetricsOverride', { width: width, height: height, deviceScaleFactor: 2, mobile: false });
      await send('Page.navigate', { url: 'file://' + path.join(root, 'sim/sharp-list-preview.html') + '?phase=' + phase });
      let ready = '';
      for (let i = 0; i < 80; i++) {
        ready = await evalJson('window.__ready || ""');
        if (ready === 'yes') break;
        await sleep(100);
      }
      eq(ready === 'yes', phase + ' cards painted');
      if (ready !== 'yes') continue;
      await send('Emulation.setDeviceMetricsOverride', { width: width, height: height, deviceScaleFactor: 2, mobile: false });
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const clean = await evalJson('JSON.stringify(window.__clean || [])');
      const rows = JSON.parse(await evalJson('window.__measure().then(function (rows) { return JSON.stringify(rows); })'));
      console.log(phase, 'clean', clean);
      console.log(phase, 'measure', JSON.stringify(rows));
      if (phase === 'after') {
        const parsed = JSON.parse(clean);
        parsed.forEach(row => eq(row.confident === true && row.w >= 600, row.jo + ' sketchClean on the 1600px page is confident (' + row.w + 'x' + row.h + ', ' + row.reason + ')'));
      }
      rows.forEach(row => {
        eq(row.dpr === 2 && row.cssW >= 340 && row.cssW <= 360, phase + ' ' + row.jo + ' card is about 350 CSS px at 2x (css ' + row.cssW + ', dpr ' + row.dpr + ')');
        if (phase === 'before') eq(row.bw <= 480, phase + ' ' + row.jo + ' bitmap is the small thumb (' + row.bw + 'x' + row.bh + ')');
        else eq(row.bw >= 600 && row.bw <= 900, phase + ' ' + row.jo + ' bitmap is the device-pixel tier (' + row.bw + 'x' + row.bh + ')');
      });
      const rects = JSON.parse(await evalJson(`JSON.stringify([...document.querySelectorAll('.ivph')].map(el => {
        const r = el.getBoundingClientRect();
        return { jo: el.dataset.th, x: r.x, y: r.y, w: r.width, h: r.height };
      }))`));
      for (const rect of rects) {
        const png = await send('Page.captureScreenshot', {
          format: 'png',
          clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }
        });
        const buf = Buffer.from(png.data, 'base64');
        const name = 'sharp_' + phase + '_' + rect.jo + '.png';
        fs.writeFileSync(path.join(art, name), buf);
        const md5 = crypto.createHash('md5').update(buf).digest('hex');
        shots.push({ name, md5, bytes: buf.length, phase });
        console.log('shot', name, md5, buf.length);
      }
    }
    const before = shots.filter(s => s.phase === 'before');
    const after = shots.filter(s => s.phase === 'after');
    eq(before.length === 4 && after.length === 4, 'eight crops were written');
    before.forEach(b => {
      const a = after.find(s => s.name.replace('after', 'before') === b.name);
      eq(a && a.md5 !== b.md5, b.name + ' differs from the sharp crop');
    });
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
  }
}

chrome().then(() => {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('sharp-list-sim ok');
}).catch(err => { console.error(err); process.exit(1); });
