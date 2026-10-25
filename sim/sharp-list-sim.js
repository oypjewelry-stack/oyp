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
    const views = [
      { name: '390', width: 390, height: 844, dpr: 3, mobile: true },
      { name: '1024', width: 1024, height: 900, dpr: 2, mobile: false }
    ];
    for (const view of views) {
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
      await send('Page.navigate', { url: 'file://' + path.join(root, 'sim/sharp-list-preview.html') + '?view=' + view.name });
      let ready = '';
      for (let i = 0; i < 80; i++) {
        ready = await evalJson('window.__ready || ""');
        if (ready === 'yes') break;
        await sleep(100);
      }
      eq(ready === 'yes', view.name + ' cards painted');
      if (ready !== 'yes') continue;
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const inner = await evalJson('window.innerWidth');
      eq(inner === view.width, 'layout width is ' + view.width + ' (got ' + inner + ')');
      const rows = JSON.parse(await evalJson('window.__measure().then(function (rows) { return JSON.stringify(rows); })'));
      const big = await evalJson('window.__big || 0');
      console.log(view.name, 'big', big, 'measure', JSON.stringify(rows));
      rows.forEach(row => {
        eq(row.dpr === view.dpr, view.name + ' ' + row.jo + ' uses DPR ' + view.dpr + ' (got ' + row.dpr + ')');
        if (view.name === '390') {
          eq(row.cssW >= 70 && row.cssW <= 84 && row.tier === 0 && row.bw <= 300 && row.paints === 1, view.name + ' ' + row.jo + ' stays on the 300px thumb (' + row.cssW + ' CSS px, bitmap ' + row.bw + 'x' + row.bh + ', tier ' + row.tier + ')');
        } else {
          const long = Math.max(row.bw, row.bh);
          eq(row.cssW >= 200 && (row.tier === 600 || row.tier === 900) && row.paints >= 2 && long > 300 && long <= row.tier, view.name + ' ' + row.jo + ' upgrades to its tier (' + row.cssW + ' CSS px, bitmap ' + row.bw + 'x' + row.bh + ', tier ' + row.tier + ')');
        }
      });
      if (view.name === '390') eq(big === 0, 'the phone list does not request a 1600px image');
      else eq(big >= 1, 'the desktop list requests the larger image');
      const pagePng = await send('Page.captureScreenshot', { format: 'png' });
      const pageBuf = Buffer.from(pagePng.data, 'base64');
      const pageName = 'sharp_list_' + view.name + '.png';
      fs.writeFileSync(path.join(art, pageName), pageBuf);
      shots.push({ name: pageName, md5: crypto.createHash('md5').update(pageBuf).digest('hex'), bytes: pageBuf.length, view: view.name });
      console.log('shot', pageName, shots[shots.length - 1].md5, pageBuf.length);
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
        const name = 'sharp_' + view.name + '_' + rect.jo + '.png';
        fs.writeFileSync(path.join(art, name), buf);
        const md5 = crypto.createHash('md5').update(buf).digest('hex');
        shots.push({ name, md5, bytes: buf.length, view: view.name });
        console.log('shot', name, md5, buf.length);
      }
    }
    const phone = shots.filter(s => s.view === '390' && s.name.indexOf('26-') >= 0);
    const desk = shots.filter(s => s.view === '1024' && s.name.indexOf('26-') >= 0);
    eq(phone.length === 4 && desk.length === 4, 'both viewports wrote four tile crops');
    phone.forEach(p => {
      const d = desk.find(s => s.name.slice(s.name.indexOf('_26')) === p.name.slice(p.name.indexOf('_26')));
      eq(d && d.md5 !== p.md5, p.name + ' differs from the desktop crop');
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
