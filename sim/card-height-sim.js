/* Inventory JO cards share one height at each breakpoint.
   Run: node sim/card-height-sim.js */
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
const card = inv.slice(inv.indexOf('function ivCard'), inv.indexOf('function ivFitPills'));
eq(index.includes('inv.js?v=36') && index.includes('app.css?v=70'), 'changed files are cache-busted');
eq(read('index.html').includes('app.css?v=30') && !read('index.html').includes('app.css?v=70'), 'the customer page stays on app.css?v=30');
eq(card.includes('title="${esc(desc)}"') && card.includes("esc(desc || 'No details yet')") && card.includes('class="ivsp"') && card.includes('class="ivmoney"'), 'the card keeps the full description, a specs line, and a price line');
eq(inv.includes('function ivFitPills') && inv.includes("badge.textContent = '+' + n") && inv.includes('ivFitPills(main)'), 'pills that do not fit become +N');
eq(css.includes('.ivcard .kd{display:-webkit-box') && css.includes('-webkit-line-clamp:2') && css.includes('min-height:2.6em') && css.includes('.ivcard .ivb{display:flex;flex-direction:column') && css.includes('height:180px') && css.includes('.ivcard{flex-direction:row') && css.includes('height:196px'), 'desktop and phone cards use a fixed body height and a two-line description');
eq(css.includes('.ivcard .kf{flex-wrap:nowrap') && css.includes('.ivcard .ivmoney{margin-top:auto') && css.includes('.ivcard .ivph{flex:none;width:100%}'), 'the pill row stays one line, the price pins to the bottom, and the photo box does not collapse');
eq(inv.includes("review: ['REVIEW'") && inv.includes("debug: ['DEBUG'") && inv.includes('size: 300, legacy: \'inv\', fallback: cost') && css.includes('.ivcard.on{border-color:#111}'), 'REVIEW, DEBUG, photo tiers, and selection stay');
eq(css.includes('.ivcard.on::after{content:"";position:absolute;inset:0;z-index:4;border:1px solid #111;border-radius:inherit;pointer-events:none}') && css.includes('.ivcard.on::after{border-width:2px;border-bottom-width:1px}') && !css.includes('.ivcard.on{border-color:#111;box-shadow:inset 0 0 0 1px #111}'), 'the selected ring is 2px over the photo, and the phone row does not double its bottom line');
eq(!css.includes('.ivsheet .kd{display:-webkit-box') && inv.includes('<p class="kd">${esc(j.description || \'No details\')}</p>'), 'opening a JO still shows the whole description');

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
  const port = 9800 + Math.floor(Math.random() * 200);
  const dir = '/tmp/chrome-card-height-' + Date.now();
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
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result && r.result.value;
  };
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
      { name: '390', width: 390, height: 1200, dpr: 2, mobile: true },
      { name: '1024', width: 1024, height: 900, dpr: 2, mobile: false }
    ];
    const measure = `(() => {
      const cards = [...document.querySelectorAll('.ivcard')];
      return cards.map(card => {
        const cr = card.getBoundingClientRect();
        const ph = card.querySelector('.ivph').getBoundingClientRect();
        const kd = card.querySelector('.kd');
        const row = card.querySelector('.kf');
        const money = card.querySelector('.ivmoney');
        const more = card.querySelector('.ivmore');
        const mr = money.getBoundingClientRect();
        const br = more.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(money);
        const tr = range.getBoundingClientRect();
        const pills = [...row.querySelectorAll('.chip')].filter(el => !el.hidden).map(el => {
          const r = el.getBoundingClientRect();
          return { text: el.textContent, right: r.right, sw: el.scrollWidth, cw: el.clientWidth, plus: el.classList.contains('ivplus') };
        });
        return {
          jo: card.dataset.jo,
          h: cr.height, w: cr.width,
          phw: ph.width, phh: ph.height,
          sketch: card.querySelector('.ivph').classList.contains('sketch'),
          has: card.querySelector('.ivph').classList.contains('has'),
          clamp: getComputedStyle(kd).webkitLineClamp,
          descOver: kd.scrollHeight - kd.clientHeight,
          title: kd.getAttribute('title') || '',
          text: kd.textContent,
          bodyOver: card.querySelector('.ivb').scrollHeight - card.querySelector('.ivb').clientHeight,
          moneyGap: cr.bottom - mr.bottom,
          menuGap: cr.bottom - br.bottom,
          textRight: tr.right, menuLeft: br.left,
          rowRight: row.getBoundingClientRect().right,
          pills: pills,
          all: [...row.querySelectorAll('.chip')].map(el => el.textContent),
          on: card.classList.contains('on')
        };
      });
    })()`;
    for (const view of views) {
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
      await send('Page.navigate', { url: 'file://' + path.join(root, 'sim/card-height-preview.html') });
      let ready = '';
      for (let i = 0; i < 80; i++) {
        ready = await evalJson('window.__ready || ""');
        if (ready === 'yes') break;
        await sleep(100);
      }
      eq(ready === 'yes', view.name + ' grid painted');
      if (ready !== 'yes') continue;
      await evalJson('document.fonts.ready');
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
      await evalJson('window.dispatchEvent(new Event("resize"))');
      await sleep(120);
      await evalJson('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const inner = await evalJson('window.innerWidth');
      eq(inner === view.width, 'layout width is ' + view.width + ' (got ' + inner + ')');
      const rows = JSON.parse(await evalJson('JSON.stringify(' + measure + ')'));
      console.log(view.name, JSON.stringify(rows.map(r => ({ jo: r.jo, h: r.h, ph: [r.phw, r.phh], gap: r.moneyGap, pills: r.pills.map(p => p.text), over: r.bodyOver }))));
      eq(rows.length === 4, view.name + ' shows the four cards');
      const heights = rows.map(r => r.h);
      const spread = Math.max.apply(null, heights) - Math.min.apply(null, heights);
      eq(spread <= 0.5, view.name + ' card heights match (spread ' + spread.toFixed(2) + 'px)');
      const phh = rows.map(r => Math.round(r.phh * 10) / 10);
      const phw = rows.map(r => Math.round(r.phw * 10) / 10);
      eq(Math.max.apply(null, phh) - Math.min.apply(null, phh) <= 0.5 && Math.max.apply(null, phw) - Math.min.apply(null, phw) <= 0.5, view.name + ' photo boxes match (' + phw[0] + '×' + phh[0] + ')');
      rows.forEach(r => {
        eq(r.clamp === '2', view.name + ' ' + r.jo + ' description is two lines');
        eq(r.bodyOver <= 1, view.name + ' ' + r.jo + ' body is not clipped (' + r.bodyOver + 'px)');
        eq(r.moneyGap >= 0 && r.moneyGap <= 20, view.name + ' ' + r.jo + ' price sits on the card bottom (gap ' + r.moneyGap.toFixed(1) + ')');
        eq(r.menuGap >= 0 && r.menuGap <= 12, view.name + ' ' + r.jo + ' menu sits on the card bottom (gap ' + r.menuGap.toFixed(1) + ')');
        eq(r.textRight <= r.menuLeft + 1, view.name + ' ' + r.jo + ' price text stays left of the menu');
        r.pills.forEach(p => {
          eq(p.right <= r.rowRight + 1, view.name + ' ' + r.jo + ' pill ' + p.text + ' stays inside the row');
          eq(p.sw <= p.cw + 1, view.name + ' ' + r.jo + ' pill ' + p.text + ' is not cut mid-word');
        });
      });
      const long = rows.find(r => r.jo === '26-501');
      const blank = rows.find(r => r.jo === '26-502');
      const many = rows.find(r => r.jo === '26-503');
      const bare = rows.find(r => r.jo === '26-504');
      eq(long && long.has && !long.sketch && long.title.indexOf('hidden clasp') >= 0 && long.text.indexOf('hidden clasp') >= 0 && long.descOver > 1, view.name + ' the long card keeps its photo and clamps the description with the full text on the title');
      eq(blank && !blank.has && !blank.sketch && blank.text === 'Ring', view.name + ' a card with no photo still has the blank box');
      eq(many && many.sketch && many.all.indexOf('REVIEW') >= 0 && many.pills.some(p => /^\+\d+$/.test(p.text)), view.name + ' the crowded card keeps REVIEW in the pill row and folds the rest into +N');
      eq(bare && bare.text === 'No details yet' && bare.title === '' && bare.pills.some(p => p.text === 'No location'), view.name + ' a short card keeps the empty description and one pill');
      const gaps = rows.map(r => Math.round(r.moneyGap));
      eq(Math.max.apply(null, gaps) - Math.min.apply(null, gaps) <= 1, view.name + ' the price line lands on the same bottom edge');
      await evalJson(`document.querySelectorAll('.ivmore').forEach(el => { el.style.opacity = '1'; })`);
      const png = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(png.data, 'base64');
      const name = 'card_height_' + view.name + '.png';
      fs.writeFileSync(path.join(art, name), buf);
      console.log('shot', name, buf.length);
      await evalJson(`(() => { document.querySelector('[data-jo="26-501"]').click(); return 1; })()`);
      const sheet = JSON.parse(await evalJson(`JSON.stringify((() => {
        const p = document.querySelector('#ivSheet .kd');
        if (!p) return { open: false };
        return { open: true, text: p.textContent, clamp: getComputedStyle(p).webkitLineClamp || 'none' };
      })())`));
      eq(sheet.open && sheet.text.indexOf('hidden clasp') >= 0 && sheet.clamp === 'none', view.name + ' the open JO shows the full description');
      await evalJson(`(() => { const b = document.querySelector('#ivSX'); if (b) b.click(); return 1; })()`);
      await evalJson(`(() => { document.querySelector('#ivChoose').click(); return 1; })()`);
      await evalJson(`(() => { document.querySelector('[data-ck="26-502"]').click(); return 1; })()`);
      const picked = JSON.parse(await evalJson('JSON.stringify(' + measure + ')'));
      const pickSpread = Math.max.apply(null, picked.map(r => r.h)) - Math.min.apply(null, picked.map(r => r.h));
      const on = picked.find(r => r.jo === '26-502');
      eq(pickSpread <= 0.5 && on && on.on, view.name + ' selecting a card keeps every card the same height');
      await evalJson(`(() => { document.querySelector('[data-iv="debug"]').click(); return 1; })()`);
      const debug = await evalJson(`document.querySelector('#ivDebug') ? document.querySelector('#ivDebug').textContent : ''`);
      eq(debug.indexOf('Held scans') >= 0, view.name + ' DEBUG still opens the held-scan list');
    }
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { chromeProc.kill('SIGKILL'); } catch (e) {}
  }
}
chrome().then(() => {
  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('card-height-sim ok');
}).catch(err => { console.error(err); process.exit(1); });
