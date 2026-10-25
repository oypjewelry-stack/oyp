/* Print one sits above Print a range. A missing JO is a plain error. An existing JO opens the preview and queues only after confirm.
   Run: node sim/print-one-sim.js */
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

const settings = read('settings.js');
const testPage = read('staff/print-test.html');
const printSrc = read('print.js');
eq(settings.indexOf('id="printOne"') > 0 && settings.indexOf('id="printOne"') < settings.indexOf('id="printRange"'), 'Settings puts Print one above Print a range');
eq(testPage.indexOf('id="printOne"') > 0 && testPage.indexOf('id="printOne"') < testPage.indexOf('id="printRange"'), 'the print test page puts Print one above Print a range');
eq(printSrc.includes('>Print one<') && printSrc.includes('>JO card<') && printSrc.includes('>Jewelry tag<') && printSrc.includes('>Both<') && printSrc.includes('openPreview(itemsForChoice([jo], kind))') && printSrc.includes('No JO with that number.') && printSrc.includes('preview: 1') && !printSrc.includes("id=\"prOneGo\">Queue"), 'Print one reuses the preview and does not queue from its own button');
eq(read('paste/PrintQueue.gs').includes('jos: names') && read('paste/PrintQueue.gs').includes('preview: true'), 'the range preview names the JOs it found and still does not queue them');

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
const KNOWN = ['26-280', '26-283', '26-283A', '26-287', '26-287B'];
function parts(jo) {
  const m = String(jo || '').toUpperCase().match(/(\d{2})-(\d{3,4})([A-Z])?/);
  return m ? { yy: m[1], n: parseInt(m[2], 10), jo: m[1] + '-' + m[2] + (m[3] || '') } : null;
}
function rangeJos(from, to) {
  const a = parts(from), b = parts(to);
  if (!a || !b || a.yy !== b.yy) return [];
  const lo = Math.min(a.n, b.n), hi = Math.max(a.n, b.n);
  return KNOWN.filter(k => { const p = parts(k); return p && p.yy === a.yy && p.n >= lo && p.n <= hi; });
}

function startServer(batches) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/api') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          let msg = {};
          try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (e) {}
          const action = msg.action || msg.op;
          let out = { ok: true };
          if (action === 'printEnqueueBatch') {
            batches.push(msg);
            if (msg.preview === 1 || msg.preview === true || msg.preview === '1') {
              const jos = rangeJos(msg.from, msg.to);
              out = { ok: true, preview: true, count: jos.length, jos: jos };
            } else out = { ok: true, queued: (msg.items || []).length, skipped: 0 };
          } else if (action === 'printQueue') out = { ok: true, items: [], rev: '1', auto: { jo_card: false, jewelry_tag: false } };
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(out));
        });
        return;
      }
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const file = path.resolve(root, rel || 'staff/print-test.html');
      if (file !== root && file.indexOf(root + path.sep) !== 0) { res.statusCode = 403; res.end('no'); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.statusCode = 404; res.end('missing ' + rel); return; }
        res.setHeader('Content-Type', mime(file));
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function chrome(origin, batches) {
  const port = 9700 + Math.floor(Math.random() * 200);
  const dir = '/tmp/chrome-print-one-' + Date.now();
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
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try {
        localStorage.setItem('oypSession','admin1');
        localStorage.setItem('oypSessionExp','2099-01-01T00:00:00.000Z');
        localStorage.setItem('oypUser', JSON.stringify({username:'ada', display_name:'Ada', role:'admin'}));
        localStorage.setItem('oypApi', ${JSON.stringify(origin + '/api')});
      } catch (e) {}`
    });
    const art = '/opt/cursor/artifacts';
    fs.mkdirSync(art, { recursive: true });
    const snap = async (width, file) => {
      const height = width < 800 ? 844 : 800;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
      await evalJson(`(() => {
        const el = document.getElementById('printOne');
        const bar = document.querySelector('header.top');
        const y = el.getBoundingClientRect().top + window.scrollY - ((bar && bar.getBoundingClientRect().height) || 0) - 8;
        window.scrollTo(0, Math.max(0, y));
        return 1;
      })()`);
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
    await send('Page.navigate', { url: origin + '/staff/print-test.html' });
    const ready = await waitFor(`document.querySelector('#prOneGo') && document.querySelector('#prRangeGo') && document.querySelector('#prOneKind option[value="both"]') ? 'yes' : ''`, 80);
    const early = await evalJson(`((document.getElementById('printOne') || {}).innerText || '') + ' | ' + ((document.getElementById('printRange') || {}).innerText || '')`);
    eq(ready === 'yes', 'Print one and Print a range are on the page (' + String(early).replace(/\s+/g, ' ').slice(0, 220) + ')');
    if (ready !== 'yes') return;
    const order = await evalJson(`document.getElementById('printOne').compareDocumentPosition(document.getElementById('printRange')) & 4 ? 'above' : 'below'`);
    eq(order === 'above', 'Print one is above Print a range');
    const opts = await evalJson(`[...document.querySelectorAll('#prOneKind option')].map(o => o.value + '=' + o.textContent).join(',')`);
    eq(opts === 'jo_card=JO card,jewelry_tag=Jewelry tag,both=Both', 'the sticker choices match Print a range, plus Both (' + opts + ')');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await snap(390, 'print_one_390.png');
    await snap(1024, 'print_one_1024.png');
    eq(shots.length === 2 && shots[0].md5 !== shots[1].md5, 'the 390 and 1024 shots differ');
    await evalJson(`document.getElementById('prOneJo').value = 'hello'; document.getElementById('prOneGo').click(); 'go'`);
    const bad = await waitFor(`/Use a JO number/.test(document.getElementById('prOneN').textContent) && !document.getElementById('oypPrev') ? 'yes' : ''`);
    eq(bad === 'yes', 'a value that is not a JO is a plain error and does not open the preview');
    await evalJson(`document.getElementById('prOneJo').value = '26-283B'; document.getElementById('prOneGo').click(); 'go'`);
    const miss = await waitFor(`/No JO with that number/.test(document.getElementById('prOneN').textContent) && !document.getElementById('oypPrev') ? 'yes' : ''`);
    eq(miss === 'yes', 'a JO that is not on the list is a plain error');
    eq(batches.every(b => b.preview === 1), 'checking a JO does not queue it (' + batches.length + ' previews)');
    const before = batches.length;
    await evalJson(`document.getElementById('prOneKind').value = 'both'; document.getElementById('prOneJo').value = '26-287B'; document.getElementById('prOneGo').click(); 'go'`);
    const opened = await waitFor(`document.getElementById('oypPrev') && /Print all \\(2\\)/.test(document.body.innerText) ? 'yes' : ''`);
    eq(opened === 'yes', 'an existing JO opens the preview for Both before anything is queued');
    eq(batches.length === before + 1 && batches[batches.length - 1].preview === 1 && batches.every(b => b.preview === 1), 'opening the preview still has not queued a sticker');
    await evalJson(`document.querySelector('#oypPrev [data-print="cancel"]').click(); 'go'`);
    const closed = await waitFor(`!document.getElementById('oypPrev') ? 'yes' : ''`);
    eq(closed === 'yes' && batches.every(b => b.preview === 1), 'Cancel closes the preview and queues nothing');
    await evalJson(`document.getElementById('prOneGo').click(); 'go'`);
    const again = await waitFor(`document.querySelector('#oypPrev [data-print="one"]') ? 'yes' : ''`);
    eq(again === 'yes', 'Print opens the preview again');
    await evalJson(`document.querySelector('#oypPrev [data-print="one"]').click(); 'go'`);
    let saw = false;
    for (let i = 0; i < 30; i++) {
      const real = batches.filter(b => b.preview !== 1 && b.preview !== true);
      if (real.length === 1 && real[0].items && real[0].items.length === 1 && real[0].items[0].jo === '26-287B') { saw = true; break; }
      await sleep(100);
    }
    eq(saw, 'Print this one is the first queue, for the JO she confirmed (' + JSON.stringify(batches.filter(b => !b.preview).map(b => b.items)) + ')');
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  const batches = [];
  const srv = await startServer(batches);
  const origin = 'http://127.0.0.1:' + srv.address().port;
  try { await chrome(origin, batches); }
  finally { srv.close(); }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('print-one-sim ok');
})().catch(err => { console.error(err); process.exit(1); });
