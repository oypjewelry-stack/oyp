/* Add button and Enter on the staff To do line.
   Run: node sim/todo-add-sim.js
   Proves typing + Enter and typing + clicking Add each create one row. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const fails = [];
function check(cond, msg, extra) {
  if (cond) { console.log('ok', msg); return; }
  fails.push(msg + (extra != null ? ' — ' + extra : ''));
  console.error('FAIL', msg, extra != null ? extra : '');
}

const css = read('todo.css');
const page = read('todo.js');
const card = read('dash.js');
const index = read('staff/index.html');
check(/\.tdadd \.tdaddgo\{[^}]*height:34px/.test(css), 'Add is 34px tall');
check(!/\.tdadd \.tdaddgo\{[^}]*(transition|transform)/.test(css), 'Add does not set its own press transition');
check(/@media \(max-width:760px\)\{\s*\.tdadd\{display:grid/.test(css) && css.includes('grid-column:1 / -1'), 'on a phone the text is its own row');
check(page.includes('type="submit"') && page.includes('>Add<') && page.includes('isAddEnter') && card.includes('isAddEnter'), 'both surfaces use the shared Enter check and the submit button');
check(index.includes('todo.js?v=5') && index.includes('todo.css?v=7') && index.includes('dash.js?v=34'), 'todo.js, todo.css, and dash.js are cache-busted');

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('missing'); return; }
        const ext = path.extname(file);
        const type = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8', '.png': 'image/png' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function httpJson(url, method) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method || 'GET' }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(res.statusCode + ' ' + data.slice(0, 180)));
        else { try { resolve(JSON.parse(data)); } catch (err) { reject(err); } }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function chromeBin() {
  const list = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const name of list) {
    try {
      const which = require('child_process').spawnSync('which', [name], { encoding: 'utf8' });
      if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
    } catch (e) {}
  }
  return '';
}

async function connect(port) {
  let version;
  for (let i = 0; i < 50; i++) {
    try { version = await httpJson('http://127.0.0.1:' + port + '/json/version'); break; }
    catch (err) { await sleep(100); }
  }
  if (!version) throw new Error('chrome did not open a debugging port');
  const target = await httpJson('http://127.0.0.1:' + port + '/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
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
  function send(method, params) {
    const msgId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
    });
  }
  async function evalJson(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 500));
    return result.result ? result.result.value : undefined;
  }
  return { ws, send, evalJson };
}

async function typeText(send, text) {
  await send('Input.insertText', { text });
}

async function pressEnter(send) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
}

async function clickSel(send, evalJson, sel) {
  const box = await evalJson(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: !!el.disabled }; })()`);
  if (box.disabled) throw new Error(sel + ' is disabled');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
}

function layoutOk(L, narrow) {
  const problems = [];
  if (Math.abs(L.btn.height - 34) > 1.2) problems.push('button height ' + L.btn.height);
  if (L.label !== 'Add' || L.type !== 'submit') problems.push('button is ' + L.type + ' ' + L.label);
  if (L.hint !== 'done' && L.hint !== 'enter') problems.push('enterkeyhint ' + L.hint);
  if (L.btn.right > L.form.right + 1.5) problems.push('Add sticks out of the form');
  if (L.scrollW > L.clientW + 2) problems.push('form scrolls sideways ' + L.scrollW + '>' + L.clientW);
  if (L.btn.left < 0 || L.btn.right > L.vw + 1) problems.push('Add is off screen');
  if (narrow) {
    if (L.input.width < L.form.width - 8) problems.push('text is not full width ' + Math.round(L.input.width) + '/' + Math.round(L.form.width));
    if (L.btn.top < L.input.bottom - 2) problems.push('Add is not on the next row');
    if (Math.abs(L.due.top - L.btn.top) > 6 || Math.abs(L.who.top - L.btn.top) > 6) problems.push('date, assignee, and Add are not one row');
    if (L.due.right > L.who.left + 1) problems.push('date overlaps assignee');
  } else if (Math.abs(L.btn.top - L.input.top) > 8) {
    problems.push('Add is not on the text row');
  }
  return problems;
}

(async function () {
  const bin = chromeBin();
  if (!bin) { check(false, 'headless chrome is installed'); process.exit(1); }
  const server = await serve();
  const port = server.address().port;
  const debug = 9410;
  const chrome = spawn(bin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--lang=en-US', '--remote-debugging-port=' + debug,
    '--user-data-dir=/tmp/chrome-todo-add',
    '--window-size=1280,900',
    'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  try {
    const cdp = await connect(debug);
    ws = cdp.ws;
    const { send, evalJson } = cdp;
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/sim/todo-add-preview.html' });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      ready = await evalJson('window.__ready ? window.__ready() : false');
      if (ready) break;
      await sleep(100);
    }
    check(ready, 'the dashboard card and the To do page both draw an add line');
    if (!ready) throw new Error('add line did not render');
    await sleep(500);

    async function settle(sel, text) {
      let last = null;
      for (let i = 0; i < 30; i++) {
        last = await evalJson(`window.__state(${JSON.stringify(sel)}, ${JSON.stringify(text)})`);
        if (last && last.calls >= 1 && last.rows >= 1) break;
        await sleep(40);
      }
      await sleep(120);
      return evalJson(`window.__state(${JSON.stringify(sel)}, ${JSON.stringify(text)})`);
    }

    const surfaces = [['#main', 'dashboard card'], ['#page', 'To do page']];
    for (const [sel, name] of surfaces) {
      const armed = await evalJson(`window.__arm(${JSON.stringify(sel)}, 'ada')`);
      check(armed, name + ' focuses the text field');
      const emptyBefore = await evalJson(`window.__state(${JSON.stringify(sel)}, 'Message Carlos')`);
      await pressEnter(send);
      await sleep(80);
      const emptyAfter = await evalJson(`window.__state(${JSON.stringify(sel)}, 'Message Carlos')`);
      check(emptyAfter.calls === emptyBefore.calls && emptyAfter.rows === 0, name + ' ignores Enter when the text is empty');

      await evalJson(`window.__arm(${JSON.stringify(sel)}, 'ada')`);
      await typeText(send, name === 'dashboard card' ? 'Message Carlos' : 'Wax the band');
      const typed = name === 'dashboard card' ? 'Message Carlos' : 'Wax the band';
      const mid = await evalJson(`window.__state(${JSON.stringify(sel)}, ${JSON.stringify(typed)})`);
      check(mid.value === typed && mid.disabled === false, name + ' enables Add once there is text', JSON.stringify(mid));
      const entersBefore = mid.enters;
      const submitsBefore = mid.submits;
      await pressEnter(send);
      const entered = await settle(sel, typed);
      check(entered.rows === 1 && entered.calls === 1, name + ' typing + Enter creates one row', JSON.stringify(entered));
      check(entered.enters === entersBefore + 1, name + ' saw one Enter', JSON.stringify(entered));
      check(entered.submits <= submitsBefore + 1, name + ' Enter does not submit twice', JSON.stringify(entered));
      check(entered.value === '' && entered.focused && entered.disabled, name + ' clears the text and keeps focus', JSON.stringify(entered));
      check(entered.toast === 'Added.', name + ' confirms with Added.', entered.toast);
      check(entered.payloads[0] && entered.payloads[0].due === '2026-10-29' && entered.payloads[0].assignee === 'ada', name + ' sends the date and assignee', JSON.stringify(entered.payloads));

      const clickText = name === 'dashboard card' ? 'Email Pia' : 'Stone count';
      await evalJson(`window.__arm(${JSON.stringify(sel)}, 'ada')`);
      await typeText(send, clickText);
      const beforeClick = await evalJson(`window.__state(${JSON.stringify(sel)}, ${JSON.stringify(clickText)})`);
      await clickSel(send, evalJson, sel + ' .tdaddgo');
      const clicked = await settle(sel, clickText);
      check(clicked.rows === 1 && clicked.calls === 1, name + ' typing + clicking Add creates one row', JSON.stringify(clicked));
      check(clicked.submits === beforeClick.submits + 1, name + ' Add submits once', JSON.stringify(clicked));
      check(clicked.value === '' && clicked.focused && clicked.toast === 'Added.', name + ' confirms the click and stays in the box', JSON.stringify(clicked));
    }

    await evalJson(`window.__arm('#main', 'rosanna')`);
    await typeText(send, 'Ask Rosanna');
    await clickSel(send, evalJson, '#main .tdaddgo');
    let outside = null;
    for (let i = 0; i < 30; i++) {
      outside = await evalJson(`window.__state('#main', 'Ask Rosanna')`);
      if (outside && outside.calls >= 1) break;
      await sleep(40);
    }
    await sleep(80);
    outside = await evalJson(`window.__state('#main', 'Ask Rosanna')`);
    check(outside.calls === 1 && outside.rows === 0 && outside.toast === 'Added. It is under Everyone.', 'a row for someone else says it is under Everyone', JSON.stringify(outside));
    await evalJson(`document.querySelector('#main [data-tdwho="everyone"]').click()`);
    await sleep(50);
    const shown = await evalJson(`window.__state('#main', 'Ask Rosanna')`);
    check(shown.rows === 1, 'that row is listed once under Everyone', JSON.stringify(shown));
    await evalJson(`document.querySelector('#main [data-tdwho="mine"]').click()`);

    const burst = await evalJson(`window.__burst('#page', 'Once only')`);
    await sleep(200);
    const burstState = await evalJson(`window.__state('#page', 'Once only')`);
    check(burstState.rows === 1 && burstState.calls === 1, 'Enter and a submit in the same turn add one row', JSON.stringify({ burst, burstState }));

    for (const [sel, name] of surfaces) {
      const wide = await evalJson(`window.__layout(${JSON.stringify(sel)})`);
      const wideProblems = layoutOk(wide, false);
      check(!wideProblems.length, name + ' keeps Add on the line at 1280', wideProblems.join('; ') || JSON.stringify({ btn: wide.btn, input: wide.input }));
    }

    async function shoot(width, file) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
      await sleep(150);
      await evalJson(`window.__fill('#main', 'Message Carlos', 'rosanna')`);
      await sleep(50);
      const box = await evalJson('window.__shotBox()');
      const narrow = width < 800;
      for (const [sel, name] of surfaces) {
        const L = await evalJson(`window.__layout(${JSON.stringify(sel)})`);
        const problems = layoutOk(L, narrow);
        check(!problems.length, name + ' add line fits at ' + width, problems.join('; ') || ('btn ' + Math.round(L.btn.height) + 'px'));
      }
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 } });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      console.log('shot', file, box.width + 'x' + box.height);
    }

    const art = '/opt/cursor/artifacts';
    await shoot(1280, path.join(art, 'screenshot_todo_add_1280.png'));
    await shoot(390, path.join(art, 'screenshot_todo_add_390.png'));
    await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    await sleep(100);
    for (const [sel, name] of surfaces) {
      const L = await evalJson(`window.__layout(${JSON.stringify(sel)})`);
      const problems = layoutOk(L, true);
      check(!problems.length, name + ' add line fits at 360', problems.join('; '));
    }
  } catch (err) {
    check(false, 'headless add test ran', String(err && err.stack || err).slice(0, 800));
  } finally {
    if (ws) try { ws.close(); } catch (e) {}
    chrome.kill('SIGKILL');
    server.close();
  }
  if (fails.length) {
    console.error(fails.length + ' failed');
    process.exit(1);
  }
  console.log('todo-add-sim passed');
})();
