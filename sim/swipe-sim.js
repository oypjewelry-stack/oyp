/* Swipe-left on staff lists.
   Run: node sim/swipe-sim.js
   Pure checks run here. The pointer checks run in sim/swipe-preview.html (headless Chrome). */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) { if (!cond) { failed++; console.error('FAIL', msg); } else console.log('ok', msg); }

const swipe = require(path.join(root, 'swipe.js'));
eq(swipe.intent(0, 0) === '' && swipe.intent(4, -4) === '', 'a short move is still a tap');
eq(swipe.intent(-20, 3) === 'open' && swipe.intent(20, 3) === 'close' && swipe.intent(3, 20) === 'scroll', '8px picks left, right, or vertical');
eq(swipe.shouldOpen(-39, 100) === false && swipe.shouldOpen(-40, 100) === true, 'a left swipe opens past 40% of the actions');
eq(swipe.shouldOpen(-48, 0) === false && swipe.shouldOpen(-49, 0) === true, 'with no measured width, 48px is the line');
eq(swipe.shouldOpen(20, 100) === false, 'a right move does not open');
eq(swipe.needsConfirm({ label: 'Delete' }) === true, 'Delete asks first');
eq(swipe.needsConfirm({ label: 'Delete', confirm: false }) === false, 'an explicit confirm:false is respected');
eq(swipe.needsConfirm({ label: 'Archive', undoable: true }) === false && swipe.needsConfirm({ label: 'Cancel', undoable: true }) === false, 'Archive and Cancel can be undone, so they do not ask');
eq(swipe.needsConfirm({ label: 'Remove', confirm: 'Remove this piece from the sheet?' }) === true, 'a confirm string always asks');
eq(swipe.needsConfirm({ label: 'Archive', destructive: true }) === true, 'a destructive action with no undo asks');
eq(swipe.dismissAction([{ label: 'Snooze' }, { label: 'Done' }]) == null, 'to do does not get a corner control');
eq(swipe.dismissAction([{ label: 'Reprint' }, { label: 'Cancel', undoable: true }]).label === 'Cancel', 'the print corner control is Cancel');
eq(swipe.dismissAction([{ label: 'Archive', undoable: true }]).label === 'Archive', 'Archive is the corner action');
eq(swipe.dismissAction([{ label: 'Unarchive', undoable: true }]).label === 'Unarchive', 'an archived row names Unarchive');
eq(swipe.dismissAction([{ label: 'Restore', undoable: true }]).label === 'Restore', 'an archived material names Restore');
eq(swipe.dismissAction([{ label: 'Remove', confirm: 'Remove this piece from the sheet?' }]).label === 'Remove', 'consignment names Remove');

const page = read('todo.js'), card = read('dash.js'), print = read('print.js'), index = read('staff/index.html');
eq(page.includes('function bindSwipe') && page.includes("'data-td': 'tick'") && page.includes("'data-td': 'done'") && page.includes("label: 'Snooze'") && page.includes("'data-td': 'more'") && page.includes('data-until="tomorrow"') && page.includes('data-until="3d"') && page.includes('data-until="7d"'), 'to-do swipe is Done plus Snooze, and Snooze opens the existing chips');
eq(page.includes('toastUndo') && page.includes('>Undo<') && !/confirm\(/.test(page), 'to-do delete still undoes from the toast and does not ask');
eq(card.includes('OYPTodo.bindSwipe') && card.indexOf('data-td="tick"') < 0 && card.includes('archiveJos'), 'the dashboard card uses the shared swipe, and drill rows archive');
eq(print.includes('bindQueueSwipe') && print.includes("label: 'Cancel'") && print.includes("label: 'Reprint'") && print.includes("toastUndo('Cancelled'"), 'the print queue swipes Cancel, and Reprint on a failed row');
eq(read('inv.js').includes("label: arch ? 'Unarchive' : 'Archive'") && read('inv.js').includes("label: item.active ? 'Archive' : 'Restore'") && read('inv.js').includes('off: () => IV.choose || IV.sel.size > 0'), 'inventory tiles and material rows swipe the archive they already had');
eq(read('production.js').includes("label: 'Archive'") && read('production.js').includes('off: () => S.choose') && read('production.js').includes('archiveJos'), 'production cards archive, and Select turns swipe off');
eq(read('review.js').includes('archiveJos') && read('review.js').includes("item: '.rvrow[data-jo]'"), 'to-review rows archive');
eq(read('consign.js').includes('Remove this piece from the sheet?') && read('consign.js').includes("item: '.csitem'"), 'a draft consignment piece swipes Remove and asks first');
eq(!read('appts.js').includes('OYP.swipe') && !read('pay.js').includes('OYP.swipe'), 'appointments and quotes have no row-level archive, cancel, or delete, so they are unchanged');
eq(read('app.js').includes('function toastUndo') && read('app.js').includes('async function archiveJos') && read('app.js').includes('swipe: (window.OYPSwipe && window.OYPSwipe.mount)'), 'undo and archive live on the shared OYP helper');
eq(read('app.css').includes('button.swbtn.pill.sm') && read('app.css').includes('font-family:var(--head)') && read('app.css').includes('height:34px') && read('app.css').includes('#b3261e') && read('app.css').includes('touch-action:pan-y') && read('app.css').includes('--sw-inset'), 'revealed buttons are 34px pills in the site face, inset by the row padding');
eq(read('app.css').includes('@media (hover:hover) and (pointer:fine)') && read('app.css').includes('.swx') && read('app.css').includes('width:34px') && read('app.css').includes('height:34px') && read('app.css').includes('color:#777') && read('app.css').includes('.swx:hover,.swx:focus-visible{color:#111}') && read('app.css').includes('.swsel .swclip.hasx .swx{display:none}') && read('app.css').includes('--swx-base') && read('app.css').includes('.swclip.hasx:not(.swphoto)>.swface>:first-child{padding-right:calc(var(--swx-base, 0px) + 34px)}') && read('app.css').includes('.swclip.swphoto .swx::before') && read('app.css').includes('border-radius:50%') && read('app.css').includes('rgba(255,255,255,.92)'), 'the corner control is a 34px grey hit area on a fine pointer, hidden while Select is on, and a photo keeps a round chip instead of a gap');
eq(read('app.css').includes('transition:transform 50ms') && read('app.css').includes('transform:scale(.97)') && read('nav.js').includes("classList.add('is-down')"), 'the 50ms press stays on buttons');
eq(index.includes('swipe.js?v=4') && index.includes('nav.js?v=47') && index.includes('app.js?v=34') && index.includes('app.css?v=48'), 'swipe.js is loaded and cache-busted');
eq(index.indexOf('swipe.js?v=4') < index.indexOf('app.js?v=34'), 'swipe.js loads before app.js');
eq(!read('scan/index.html').includes('swipe.js?v=4') && read('scan/index.html').includes('nav.js?v=47'), 'the scanner loads nav.js v47 and does not load the staff swipe script');

const http = require('http');
const { spawn } = require('child_process');

function httpJson(url, method) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method || 'GET' }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        if (res.statusCode >= 400) reject(new Error(res.statusCode + ' ' + data.slice(0, 180)));
        else { try { resolve(JSON.parse(data)); } catch (err) { reject(err); } }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function chromePage(width) {
  const port = 9300 + width;
  /* Headless Chrome reports pointer:none, so the media query never matches unless
     the process is started with a pointer. 4 is a fine pointer with hover; 2 is coarse. */
  const pointer = width < 800 ? 'primaryHoverType=1,primaryPointerType=2' : 'primaryHoverType=2,primaryPointerType=4';
  const chrome = spawn('google-chrome', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=' + port,
    '--user-data-dir=/tmp/chrome-swipe-sim-' + width,
    '--blink-settings=' + pointer,
    '--window-size=' + width + ',980',
    'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  try {
    let version;
    for (let i = 0; i < 40; i++) {
      try { version = await httpJson('http://127.0.0.1:' + port + '/json/version'); break; }
      catch (err) { await sleep(100); }
    }
    if (!version) throw new Error('chrome did not open a debugging port');
    const target = await httpJson('http://127.0.0.1:' + port + '/json/new?about:blank', 'PUT');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(function (resolve, reject) { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', function (ev) {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const waiter = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    });
    function send(method, params) {
      const msgId = ++id;
      return new Promise(function (resolve, reject) {
        pending.set(msgId, { resolve: resolve, reject: reject });
        ws.send(JSON.stringify({ id: msgId, method: method, params: params || {} }));
      });
    }
    await send('Emulation.setDeviceMetricsOverride', { width: width, height: 980, deviceScaleFactor: 1, mobile: width < 800 });
    await send('Page.enable');
    await send('Page.navigate', { url: 'file://' + path.join(root, 'sim/swipe-preview.html') + '?test=1&vw=' + width });
    let text = '';
    for (let i = 0; i < 50; i++) {
      const result = await send('Runtime.evaluate', { expression: 'document.getElementById("out") ? document.getElementById("out").textContent : ""', returnByValue: true });
      text = (result.result && result.result.value) || '';
      if (text.indexOf('SWIPE_OK') >= 0 || text.indexOf('FAIL') >= 0) break;
      await sleep(200);
    }
    return text;
  } finally {
    if (ws) ws.close();
    chrome.kill('SIGKILL');
  }
}

(async function () {
  for (const width of [390, 1280]) {
    try {
      const text = await chromePage(width);
      const fails = text.split('\n').filter(function (line) { return line.indexOf('FAIL') === 0; }).join(' | ');
      eq(text.indexOf('SWIPE_OK') >= 0, 'at ' + width + 'px the row slides by the tray and every button sits inside the card' + (fails ? ' — ' + fails : ''));
    } catch (err) {
      eq(false, 'headless gesture page ran at ' + width + ': ' + String(err && err.stack || err).slice(0, 600));
    }
  }
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('swipe-sim passed');
})();
