/* Scan snap tabs, checkbox defaults, and the Apps Script hook.
   Run: node sim/scansnap-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const vm = require('vm');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }

const nav = require(path.join(root, 'nav.js'));
const app = read('app.js');
const index = read('staff/index.html');
const scanApp = read('scan/app.js');
const gs = read('paste/ScanSnapPrint.gs');
const hook = read('paste/JoInbox.gs.snapsnap.patch.txt');
const auth = read('paste/Auth.gs.snapsnap.patch.txt');

eq(index.includes('scansnap.js?v=2') && index.includes('app.js?v=43') && index.includes('app.css?v=66') && index.includes('nav.js?v=77'), 'the scanner page is cache-busted');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=66'), 'the customer page stays on app.css?v=29');
eq(app.includes("page === 'scanner'") && app.includes('OYPScanSnap.render') && !app.includes('OYPJoInbox.render'), 'Scanner is a back-office page and Needs a look is not rendered from the router');
eq(app.includes('snapPrintGet: 1') && !/snapPrintSet\s*:/.test(app), 'snapPrintGet is a fresh read and snapPrintSet stays a write');
eq(app.includes("cur0 === 'scanner'") && app.includes('href="#/scanner"'), 'staff can open Scanner in the back office, and the side menu stays in the app');
const ada = { role: 'admin', username: 'ada', display_name: 'Ada' };
const menu = nav.menuHtml(ada, 'scanner', '');
eq(menu.includes('href="#/scanner"') && menu.includes('class="on"') && menu.includes('data-nkey="scanner"') && menu.indexOf('https://oypjewelry.com/scan/') < 0, 'a signed-in Scanner menu item opens the tab page');
eq(nav.menuHtml(null, '', '').indexOf('https://oypjewelry.com/scan/') >= 0, 'a signed-out menu still links to the phone scanner');
eq(read('scan/index.html').includes('data-sticker="jo"') && read('scan/index.html').includes('Jewelry tag') && scanApp.includes('function stickersSoon') && !scanApp.includes('snapPrint') && !scanApp.includes('Print QR tag'), 'the phone scanner page is unchanged');

global.location = { hash: '#/scanner' };
const Snap = require(path.join(root, 'scansnap.js'));
eq(Snap.tabFromHash() === 'snap', 'the scanner opens on Scan snap');
global.location.hash = '#/scanner/mobile';
eq(Snap.tabFromHash() === 'mobile', 'a mobile hash opens the Mobile tab');
global.location.hash = '#/scanner';
eq(Snap.canEdit(ada) && Snap.canEdit({ role: 'production_manager', username: 'sue' }) && !Snap.canEdit({ role: 'staff', username: 'ann' }), 'admin and production manager can change the boxes');
eq(Snap.HINT === 'Scanned something? Tap to file it now instead of waiting up to 5 minutes.' && Snap.CHECK === 'CHECK FOR NEW SCANS', 'the button files now and the hint is one line');
eq(Snap.NOT_SAVED === "Changes aren't saved yet.", 'the page says changes are not saved yet');
const html = Snap.snapHtml();
eq(html.includes('>Scan snap<') && html.indexOf('>Scan snap<') < html.indexOf('>Mobile<') && html.includes('class="fchip tap on"') && html.includes('data-stab="snap"'), 'Scan snap is the first tab and it starts selected');
eq(html.includes('id="snapJewelry" checked') && html.includes('>Print jewelry tag<') && html.includes('id="snapQr" checked') && html.includes('>Print QR tag<'), 'both boxes start checked');
eq(html.includes('saved yet.') && html.indexOf('id="snapNote" hidden') < 0 && html.includes('>' + Snap.CHECK + '<') && html.includes(Snap.HINT) && html.indexOf('Scan now') < 0, 'before a save the note, the check button, and the hint are on the page');
eq(Snap.mobileHtml().includes('../scan/index.html') && Snap.mobileHtml().includes('title="Mobile scanner"') && Snap.mobileSrc('admin') === '../scan/index.html?role=admin', 'Mobile loads the existing scanner page');
eq(Snap.resultText({ ok: true, filed: 2, waiting: 1, problem: 0 }) === '2 new scans filed, 1 waiting', 'a check reports new scans and how many are waiting');
eq(Snap.resultText({ ok: true, filed: 1, waiting: 0, problem: 2 }) === '1 new scan filed, 0 waiting, 2 errors', 'errors are counted on the result line');
eq(Snap.resultText({ ok: true, waiting: true, message: 'The scanner is still sending pages. Try again in a few seconds.' }).indexOf('still sending') >= 0, 'a scanner that is still sending shows that message');
eq(Snap.resultText({ ok: false, error: 'Unknown action' }) === 'Needs the latest script paste', 'the check before the paste says the script is not in yet');
eq(Snap.resultText({ ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }).indexOf('No connection') >= 0, 'a dropped connection stays an error');

eq(!/\bconst\b|\blet\b|=>|`/.test(gs) && gs.includes('scanner.snap_jewelry') && gs.includes('scanner.snap_qr') && gs.includes("printEnqueue_(jo, row[1], 'scansnap', { manual: true })"), 'the paste is Apps Script style and queues through printEnqueue_');
eq(hook.includes('function snapPrintAfterFiled_') && hook.includes('snapPrintAfterFiled_(FILED_JO, SCAN_FILE_ID)') && auth.includes('isSnapPrintAction_') && gs.includes("insertSheet(SNAP_SEEN_SHEET)") && gs.includes('SnapSeen') && !gs.includes('oypSnapSeen') && !gs.includes('SNAP_SEEN_CAP'), 'the hook is one call and each seen id is its own property plus a SnapSeen row');
eq(scanApp.includes('function breakOut') && scanApp.includes('target="_top"') && scanApp.includes("href[1] === '#'"), 'office links in the scanner menu leave the Mobile frame');

const bag = {};
const calls = [];
const rows = [];
const sheets = {};
function Sheet(grid) { this.grid = grid; }
Sheet.prototype.getLastRow = function () { return this.grid.length; };
Sheet.prototype.getLastColumn = function () { return this.grid[0].length; };
Sheet.prototype.getRange = function (r, c, nr, nc) {
  const grid = this.grid;
  if (nr == null) { nr = 1; nc = 1; }
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const line = [];
        for (let j = 0; j < nc; j++) line.push((grid[r - 1 + i] || [])[c - 1 + j] || '');
        out.push(line);
      }
      return out;
    },
    setValue: function (v) {
      while (grid.length < r) grid.push(new Array(grid[0].length).fill(''));
      grid[r - 1][c - 1] = v;
    },
    setValues: function (vals) {
      for (let i = 0; i < vals.length; i++) {
        while (grid.length < r + i) grid.push(new Array(Math.max(grid[0].length, vals[i].length)).fill(''));
        for (let j = 0; j < vals[i].length; j++) grid[r - 1 + i][c - 1 + j] = vals[i][j];
      }
    }
  };
};
Sheet.prototype.getDataRange = function () { return this.getRange(1, 1, this.grid.length, this.grid[0].length); };
function sheetRows(name) {
  const g = sheets[name].grid, head = g[0], out = [];
  for (let i = 1; i < g.length; i++) {
    const o = {};
    head.forEach(function (h, c) { o[h] = g[i][c]; });
    if (o.key) out.push(o);
  }
  return out;
}
const ctx = {
  bag: bag,
  PropertiesService: {
    getScriptProperties: function () {
      return {
        getProperty: function (k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
        setProperty: function (k, v) { bag[k] = String(v); }
      };
    }
  },
  printEnqueue_: function (jo, kind, actor, opts) {
    calls.push({ jo: jo, kind: kind, actor: actor, manual: !!(opts && opts.manual) });
    for (let i = 0; i < rows.length; i++) if (rows[i].jo === jo && rows[i].kind === kind) return { ok: true, created: false, skipped: true };
    rows.push({ jo: jo, kind: kind });
    return { ok: true, created: true };
  }
};
vm.createContext(ctx);
vm.runInContext(gs, ctx);
const admin = { username: 'ada', role: 'admin' };
const boss = { username: 'sue', role: 'production_manager' };
const staff = { username: 'ann', role: 'staff' };
let got = ctx.snapPrintGet_({}, admin);
eq(got.ok && got.jewelry === true && got.qr === true, 'missing keys default both stickers on');
got = ctx.snapPrintSet_({ jewelry: false, qr: false }, admin);
eq(got.ok && got.jewelry === false && got.qr === false && bag['scanner.snap_jewelry'] === '0' && bag['scanner.snap_qr'] === '0', 'an admin can turn both off and the values round-trip');
const denied = ctx.snapPrintSet_({ jewelry: true, qr: true }, staff);
eq(denied.ok === false && denied.code === 'FORBIDDEN' && ctx.snapPrintGet_({}, admin).jewelry === false && ctx.snapPrintGet_({}, admin).qr === false, 'staff cannot change the boxes');
let filed = ctx.snapPrintAfterFile_('26-428', 'fileA');
eq(filed.ok && filed.calls === 0 && calls.length === 0, 'unchecked queues nothing');
filed = ctx.snapPrintAfterFile_('26-428', 'fileA');
eq(filed.calls === 0 && calls.length === 0, 'a repeat while unchecked still queues nothing');
got = ctx.snapPrintSet_({ jewelry: true, qr: true }, boss);
eq(got.ok && got.jewelry === true && got.qr === true, 'a production manager can turn both back on');
filed = ctx.snapPrintAfterFile_('26-428', 'fileA');
eq(filed.calls === 2 && calls.length === 2 && calls[0].kind === 'jewelry_tag' && calls[1].kind === 'jo_card' && calls.every(c => c.actor === 'scansnap' && c.manual === true && c.jo === '26-428'), 'checked queues the jewelry tag and the JO sticker once');
filed = ctx.snapPrintAfterFile_('26-428', 'fileA');
eq(filed.calls === 0 && calls.length === 2 && rows.length === 2, 'the same JO, tag, and scan file do not queue again');
ctx.snapPrintAfterFile_('26-428', 'fileB');
eq(rows.length === 2 && rows.filter(r => r.kind === 'jewelry_tag').length === 1 && rows.filter(r => r.kind === 'jo_card').length === 1, 'a second file of the same JO does not add a second queue row');
let missed = 0, huge = false, blob = false;
for (let i = 0; i < 300; i++) {
  const one = ctx.snapPrintAfterFile_('27-' + (1000 + i), 'drive' + i);
  if (!one.ok || one.calls !== 2) missed++;
}
const replay = ctx.snapPrintAfterFile_('27-1000', 'drive0');
Object.keys(bag).forEach(function (k) {
  if (k === 'oypSnapSeen') blob = true;
  if (String(bag[k]).length > 9000) huge = true;
});
eq(missed === 0 && replay.calls === 0 && !blob && !huge, 'three hundred scans stay idempotent and no property value approaches 9KB');
ctx.snapPrintSet_({ jewelry: false, qr: true }, admin);
calls.length = 0;
ctx.snapPrintAfterFile_('26-500', 'fileC');
eq(calls.length === 1 && calls[0].kind === 'jo_card', 'jewelry off queues only the QR sticker');

sheets.Settings = new Sheet([['key', 'value', 'changed_at', 'changed_by']]);
sheets.SettingsLog = new Sheet([['at', 'by', 'key', 'old_value', 'new_value', 'note']]);
ctx.ss_ = function () { return { getSheetByName: function (name) { return sheets[name] || null; } }; };
ctx.jobRows_ = function (name) { return name === 'Settings' ? sheetRows('Settings') : []; };
got = ctx.snapPrintSet_({ jewelry: false, qr: 0 }, admin);
const saved = sheetRows('Settings');
eq(got.qr === false && saved.some(r => r.key === 'scanner.snap_qr' && String(r.value) === '0') && saved.some(r => r.key === 'scanner.snap_jewelry' && String(r.value) === '0'), 'the two keys are written on the Settings tab');
bag['scanner.snap_qr'] = '1';
eq(ctx.snapPrintGet_({}, admin).qr === false, 'a Settings tab value wins over a stale script property');
eq(sheetRows('SettingsLog').some(r => r.key === 'scanner.snap_qr' && r.note === 'Scan snap'), 'the change is logged when SettingsLog exists');
ctx.ss_ = function () {
  return {
    getSheetByName: function (name) { return sheets[name] || null; },
    insertSheet: function (name) {
      sheets[name] = new Sheet([['id', 'at']]);
      return sheets[name];
    }
  };
};
ctx.snapPrintSet_({ qr: true }, admin);
const sheeted = ctx.snapPrintAfterFile_('26-900', 'fileSheet');
const seenId = '26-900|jo_card|fileSheet';
eq(sheeted.calls === 1 && sheets.SnapSeen && sheets.SnapSeen.grid.some(r => String(r[0]) === seenId), 'the first filed scan creates SnapSeen and stores that file');
ctx.snapSeenMem_.map = {};
delete bag['oypSnap.' + seenId];
eq(ctx.snapPrintAfterFile_('26-900', 'fileSheet').calls === 0, 'SnapSeen alone stops the same JO, tag, and scan file');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}
function startServer() {
  const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/api') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          let j = {};
          try { j = JSON.parse(body || '{}'); } catch (e) {}
          let out = { ok: true };
          if (j.action === 'me') out = { ok: true, user: { username: 'ada', display_name: 'Ada', role: 'admin' } };
          else if (j.action === 'snapPrintGet' || j.action === 'snapPrintSet') out = { ok: false, error: 'Unknown action', code: 'UNKNOWN' };
          else if (j.action === 'joInboxRun') out = { ok: true, filed: 2, waiting: 1, problem: 0 };
          else if (j.action === 'joInboxStatus') out = { ok: true, counts: { check: 0 } };
          else if (j.action === 'joInboxList') out = { ok: true, cards: [], counts: { check: 0 }, total: 0 };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(out));
        });
        return;
      }
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end('missing'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function chromeAt(width, port, pageUrl, art) {
  const dir = '/tmp/chrome-scansnap-' + width;
  fs.rmSync(dir, { recursive: true, force: true });
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + dir,
    '--window-size=' + width + ',900',
    'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  try {
    let version = '';
    for (let i = 0; i < 50; i++) {
      try { version = await httpGet('http://127.0.0.1:' + port + '/json/version'); break; }
      catch (e) { await sleep(100); }
    }
    if (!version) throw new Error('no debugger');
    const browserUrl = JSON.parse(version).webSocketDebuggerUrl;
    const browser = new WebSocket(browserUrl);
    await new Promise((resolve, reject) => { browser.addEventListener('open', resolve); browser.addEventListener('error', reject); });
    let seq = 0;
    const pending = new Map();
    const onMsg = ev => {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const w = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) w.reject(new Error(JSON.stringify(msg.error)));
      else w.resolve(msg.result);
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
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 700));
      return r.result && r.result.value;
    };
    const height = width < 800 ? 844 : 900;
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try {
      localStorage.setItem('oypSession', 'sess-snap');
      localStorage.setItem('oypSessionExp', '2099-01-01T00:00:00.000Z');
      localStorage.setItem('oypUser', JSON.stringify({ username: 'ada', display_name: 'Ada', role: 'admin' }));
      localStorage.setItem('oypDevice', 'd-snap');
    } catch (e) {}` });
    await send('Page.navigate', { url: pageUrl });
    let m = null;
    for (let i = 0; i < 80; i++) {
      m = await evalJson(`(() => {
        const j = document.getElementById('snapJewelry');
        const q = document.getElementById('snapQr');
        const note = document.getElementById('snapNote');
        const hint = document.getElementById('snapHint');
        const btn = document.getElementById('snapNow');
        const on = document.querySelector('#scanTabs .fchip.on');
        if (!j || !q || !note || !hint || !on || !btn) return null;
        const main = document.getElementById('main');
        return {
          j: j.checked, q: q.checked, jDis: j.disabled,
          note: note.textContent, noteHidden: note.hidden,
          hint: hint.textContent, check: btn.textContent, tab: on.textContent,
          frame: !!document.querySelector('.scanframe'),
          overflow: main ? main.scrollWidth - main.clientWidth : 0
        };
      })()`);
      if (m && m.note) break;
      m = null;
      await sleep(100);
    }
    eq(!!m, 'Scan snap is on screen at ' + width);
    if (!m) return {};
    console.log('snap', width, JSON.stringify(m));
    eq(m.tab === 'Scan snap' && m.j === true && m.q === true && m.jDis === false && m.noteHidden === false && m.note === "Changes aren't saved yet." && m.hint === 'Scanned something? Tap to file it now instead of waiting up to 5 minutes.' && m.check === 'CHECK FOR NEW SCANS' && m.frame === false, 'before the paste both boxes are checked and the note is showing at ' + width);
    eq(m.overflow <= 1, 'Scan snap does not overflow at ' + width);
    const clicked = await evalJson(`(async () => {
      document.getElementById('snapJewelry').click();
      await new Promise(r => setTimeout(r, 50));
      const j = document.getElementById('snapJewelry');
      const note = document.getElementById('snapNote');
      document.getElementById('snapNow').click();
      let text = '';
      for (let i = 0; i < 40; i++) {
        const el = document.getElementById('snapResult');
        text = el ? el.textContent : '';
        if (text.indexOf('filed') >= 0) break;
        await new Promise(r => setTimeout(r, 50));
      }
      return { j: j.checked, note: note && note.textContent, noteHidden: note && note.hidden, text: text };
    })()`);
    console.log('scan now', width, JSON.stringify(clicked));
    eq(clicked && clicked.j === true && clicked.noteHidden === false && clicked.text === '2 new scans filed, 1 waiting', 'unchecking before the paste does not stick, and the check reports the result at ' + width);
    await evalJson('window.scrollTo(0,0); 1');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    await sleep(40);
    const snapPng = await send('Page.captureScreenshot', { format: 'png' });
    const snapBuf = Buffer.from(snapPng.data, 'base64');
    const snapName = 'scansnap_check_' + width + '.png';
    fs.writeFileSync(path.join(art, snapName), snapBuf);
    const mobile = await evalJson(`(async () => {
      document.querySelector('[data-stab="mobile"]').click();
      for (let i = 0; i < 40; i++) {
        const fr = document.querySelector('.scanframe');
        const doc = fr && fr.contentDocument;
        const text = doc && doc.body ? doc.body.innerText : '';
        if (text.indexOf('Scan a job order card') >= 0) {
          return { src: fr.getAttribute('src'), text: text.slice(0, 80), tab: document.querySelector('#scanTabs .fchip.on').textContent };
        }
        await new Promise(r => setTimeout(r, 50));
      }
      const fr = document.querySelector('.scanframe');
      return { src: fr && fr.getAttribute('src'), text: '', tab: '', hash: location.hash };
    })()`);
    console.log('mobile', width, JSON.stringify(mobile));
    eq(mobile && mobile.tab === 'Mobile' && mobile.src && mobile.src.indexOf('../scan/index.html') >= 0 && mobile.text.indexOf('Scan a job order card') >= 0, 'Mobile loads the phone scanner at ' + width);
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 800 });
    await sleep(80);
    const mobPng = await send('Page.captureScreenshot', { format: 'png' });
    const mobBuf = Buffer.from(mobPng.data, 'base64');
    const mobName = 'scansnap_check_mobile_' + width + '.png';
    fs.writeFileSync(path.join(art, mobName), mobBuf);
    return { snap: crypto.createHash('md5').update(snapBuf).digest('hex'), mobile: crypto.createHash('md5').update(mobBuf).digest('hex') };
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chrome.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  if (failed) { console.error(failed + ' failed before chrome'); process.exit(1); }
  const art = '/opt/cursor/artifacts';
  fs.mkdirSync(art, { recursive: true });
  const srv = await startServer();
  const port = srv.address().port;
  const page = 'http://127.0.0.1:' + port + '/staff/index.html?api=' + encodeURIComponent('http://127.0.0.1:' + port + '/api') + '#/scanner';
  try {
    const a = await chromeAt(390, 9721, page, art);
    const b = await chromeAt(1024, 9722, page, art);
    const hashes = [a.snap, a.mobile, b.snap, b.mobile];
    console.log('md5', hashes.join(' '));
    eq(hashes.every(Boolean) && new Set(hashes).size === 4, 'the four screenshots are different files');
  } finally { srv.close(); }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('scansnap-sim ok');
})().catch(err => { console.error(err); process.exit(1); });
