/* Add button and Enter on the staff To do line.
   Run: node sim/todo-add-sim.js
   Proves typing + Enter and typing + clicking Add each create one row. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
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
check(index.includes('todo.js?v=6') && index.includes('todo.css?v=7') && index.includes('dash.js?v=35'), 'todo.js, todo.css, and dash.js are cache-busted');

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
  // A target opened with PUT /json/new evaluates scripts, but its capture surface stays white.
  let list = [];
  for (let i = 0; i < 20; i++) {
    list = await httpJson('http://127.0.0.1:' + port + '/json');
    if (list.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    await sleep(100);
  }
  const target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!target) throw new Error('chrome has no page target');
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

function pngDecode(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || interlace) throw new Error('unsupported png');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!ch) throw new Error('color type ' + colorType);
  const stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rows = [];
  let i = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const row = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    if (filter === 1 || filter === 3 || filter === 4) {
      for (let x = 0; x < stride; x++) {
        const left = x >= ch ? row[x - ch] : 0;
        const up = prev[x];
        const ul = x >= ch ? prev[x - ch] : 0;
        let pred = 0;
        if (filter === 1) pred = left;
        else if (filter === 3) pred = Math.floor((left + up) / 2);
        else {
          const p = left + up - ul;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          pred = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : ul);
        }
        row[x] = (row[x] + pred) & 255;
      }
    } else if (filter === 2) {
      for (let x = 0; x < stride; x++) row[x] = (row[x] + prev[x]) & 255;
    } else if (filter !== 0) throw new Error('filter ' + filter);
    rows.push(row);
    prev = row;
  }
  return { width: width, height: height, ch: ch, rows: rows };
}

function pngEncode(img) {
  const colorType = img.ch === 4 ? 6 : img.ch === 3 ? 2 : img.ch === 2 ? 4 : 0;
  const stride = img.width * img.ch;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[(stride + 1) * y] = 0;
    img.rows[y].copy(raw, (stride + 1) * y + 1, 0, stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const chunk = (type, data) => {
    const head = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head, data])) >>> 0, 0);
    return Buffer.concat([len, head, data, crc]);
  };
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function countNonwhite(img) {
  let n = 0;
  for (const row of img.rows) {
    for (let x = 0; x < img.width; x++) {
      const i = x * img.ch;
      const r = row[i], g = img.ch > 1 ? row[i + 1] : r, b = img.ch > 2 ? row[i + 2] : r;
      if (r < 250 || g < 250 || b < 250) n++;
    }
  }
  return n;
}

function darkRatio(img, rect) {
  if (!rect || rect.width < 2 || rect.height < 2) return 0;
  const x0 = Math.max(0, Math.floor(rect.x + 2));
  const y0 = Math.max(0, Math.floor(rect.y + 2));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width - 2));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height - 2));
  let dark = 0, total = 0;
  for (let y = y0; y < y1; y++) {
    const row = img.rows[y];
    if (!row) continue;
    for (let x = x0; x < x1; x++) {
      const i = x * img.ch;
      const r = row[i], g = img.ch > 1 ? row[i + 1] : r, b = img.ch > 2 ? row[i + 2] : r;
      total++;
      if (r < 45 && g < 45 && b < 45) dark++;
    }
  }
  return total ? dark / total : 0;
}

function scaleBox(box, sx, sy) {
  return { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
}

function cropImage(img, box) {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(img.width, Math.round(box.x + box.width));
  const y1 = Math.min(img.height, Math.round(box.y + box.height));
  if (x1 - x0 < 20 || y1 - y0 < 20) throw new Error('crop is ' + (x1 - x0) + 'x' + (y1 - y0));
  const rows = [];
  for (let y = y0; y < y1; y++) rows.push(img.rows[y].subarray(x0 * img.ch, x1 * img.ch));
  return { width: x1 - x0, height: y1 - y0, ch: img.ch, rows: rows, ox: x0, oy: y0 };
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

    const press = await evalJson(`(() => {
      const btn = document.querySelector('#main .tdaddgo');
      const cs = getComputedStyle(btn);
      let reached = false;
      document.addEventListener('pointerdown', () => { reached = true; }, true);
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      return { prop: cs.transitionProperty, dur: cs.transitionDuration, reached: reached };
    })()`);
    check(press && press.reached, 'pointerdown still reaches the document, so the shared press handler can run', JSON.stringify(press));
    check(press && /transform/.test(press.prop) && (press.dur === '0.05s' || press.dur === '50ms'), 'Add uses the 50ms scale transition and does not replace it', JSON.stringify(press));

    for (const [sel, name] of surfaces) {
      const wide = await evalJson(`window.__layout(${JSON.stringify(sel)})`);
      const wideProblems = layoutOk(wide, false);
      check(!wideProblems.length, name + ' keeps Add on the line at 1280', wideProblems.join('; ') || JSON.stringify({ btn: wide.btn, input: wide.input }));
    }

    async function metrics(width) {
      await send('Emulation.setDeviceMetricsOverride', { width: width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
      await sleep(180);
    }
    async function reloadPreview() {
      await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/sim/todo-add-preview.html' });
      let again = false;
      for (let i = 0; i < 50; i++) {
        again = await evalJson('window.__ready ? window.__ready() : false');
        if (again) break;
        await sleep(100);
      }
      if (!again) throw new Error('preview did not render for screenshots');
      await evalJson('Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(ok => setTimeout(ok, 2500))])');
      await evalJson('new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))');
    }
    async function bitmap() {
      // Clip captures of this page come back solid white. Capture the viewport and crop.
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const img = pngDecode(Buffer.from(shot.data, 'base64'));
      const nw = countNonwhite(img);
      if (nw < 1000) throw new Error('viewport screenshot is blank (' + nw + ' nonwhite, ' + img.width + 'x' + img.height + ')');
      return img;
    }
    function rectXY(rect) {
      return { x: rect.x != null ? rect.x : rect.left, y: rect.y != null ? rect.y : rect.top, width: rect.width, height: rect.height };
    }
    function saveShot(file, img, box, dark) {
      const vw = box && box.vw ? box.vw : img.width;
      const vh = box && box.vh ? box.vh : img.height;
      const sx = img.width / vw;
      const sy = img.height / vh;
      const cropped = box && box.width ? cropImage(img, scaleBox(box, sx, sy)) : Object.assign({ ox: 0, oy: 0 }, img);
      const out = pngEncode(cropped);
      const checkImg = pngDecode(out);
      const nw = countNonwhite(checkImg);
      if (nw < 400) throw new Error(path.basename(file) + ' is blank (' + nw + ' nonwhite, ' + checkImg.width + 'x' + checkImg.height + ')');
      if (dark) {
        const d = rectXY(dark);
        const local = { x: d.x * sx - (cropped.ox || 0), y: d.y * sy - (cropped.oy || 0), width: d.width * sx, height: d.height * sy };
        const ratio = darkRatio(checkImg, local);
        if (ratio < 0.25) throw new Error(path.basename(file) + ' has no black control (' + ratio.toFixed(2) + ' at ' + Math.round(local.x) + ',' + Math.round(local.y) + ')');
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, out);
      console.log('shot', file, checkImg.width + 'x' + checkImg.height, 'nonwhite', nw, 'bytes', out.length);
    }

    async function shootFilled(width, sel, file) {
      await metrics(width);
      await evalJson(`window.__fill(${JSON.stringify(sel)}, 'Message Carlos', 'rosanna')`);
      await evalJson('new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))');
      const narrow = width < 800;
      const L = await evalJson(`window.__layout(${JSON.stringify(sel)})`);
      const problems = layoutOk(L, narrow);
      check(!problems.length, (sel === '#main' ? 'dashboard card' : 'To do page') + ' add line fits at ' + width, problems.join('; '));
      check(L.text === 'Message Carlos' && L.disabled === false, (sel === '#main' ? 'dashboard card' : 'To do page') + ' shows typed text and an enabled Add at ' + width, JSON.stringify({ text: L.text, disabled: L.disabled }));
      const box = await evalJson(`Object.assign(window.__shotBox(${JSON.stringify(sel)}), { vw: window.innerWidth, vh: window.innerHeight })`);
      const img = await bitmap();
      saveShot(file, img, box, L.btn);
    }

    const art = '/opt/cursor/artifacts';
    await reloadPreview();
    await shootFilled(1280, '#main', path.join(art, 'screenshot_todo_card_1280.png'));
    await shootFilled(390, '#main', path.join(art, 'screenshot_todo_card_390.png'));
    await shootFilled(1280, '#page', path.join(art, 'screenshot_todo_page_1280.png'));
    await shootFilled(390, '#page', path.join(art, 'screenshot_todo_page_390.png'));

    await metrics(1280);
    await evalJson(`window.__arm('#main', 'ada')`);
    await typeText(send, 'Message Carlos');
    await clickSel(send, evalJson, '#main .tdaddgo');
    let added = null;
    for (let i = 0; i < 30; i++) {
      added = await evalJson(`window.__state('#main', 'Message Carlos')`);
      if (added && added.calls >= 1 && added.rows >= 1 && added.toast === 'Added.') break;
      await sleep(40);
    }
    await sleep(80);
    added = await evalJson(`window.__state('#main', 'Message Carlos')`);
    check(added.rows === 1 && added.toast === 'Added.', 'the after-add shot has the new row and the Added toast', JSON.stringify(added));
    const frame = await evalJson(`window.__addedFrame('Message Carlos')`);
    check(frame && frame.toastText === 'Added.' && !frame.toastHidden && frame.row && frame.row.height > 10, 'Added. is on screen with the new row', JSON.stringify(frame));
    const toastImg = await bitmap();
    saveShot(path.join(art, 'screenshot_todo_added_toast.png'), toastImg, { vw: frame.vw, vh: frame.vh }, frame.toast);
    const rowBox = scaleBox(frame.row, toastImg.width / frame.vw, toastImg.height / frame.vh);
    const rowPixels = countNonwhite(cropImage(toastImg, rowBox));
    check(rowPixels > 20, 'the new row is painted in the after-add shot', 'nonwhite ' + rowPixels);
    await evalJson(`document.getElementById('pageOffice').style.display = ''`);
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
