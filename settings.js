/* OYP back office: Settings (#/settings, admin only). Change the shop's numbers without code.
   Server: Settings.gs (settingsGet, settingsSave, settingsReset, settingsRate, settingsPremium, settingsUser*). Every change is written to
   the SettingsLog tab (who, when, old -> new). Empty = the default (the value the system used before Settings existed).
   Sections: #/settings (list) -> #/settings/<section>, '‹ BACK' returns to the list. */
(() => {
'use strict';
const PASTE_NOTE = 'This page needs the Settings paste in Apps Script (see the instructions).';
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const LENS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];
const SECS = [
  ['prices', 'Prices & markups', 'Markups, labor rates, metal premiums and purity'],
  ['payments', 'Payments', 'When a balance counts as overdue'],
  ['hours', 'Store hours', 'Opening hours, open days and booking limits'],
  ['bulletin', 'Morning post', 'Time and days of the Telegram morning post'],
  ['appts', 'Appointments', 'Default length and visit types'],
  ['stages', 'Stage delays', 'Days a JO may stay in a stage before it is flagged'],
  ['staff', 'Staff accounts', 'Add, turn off, role, new code'],
  ['scanner', 'Scanner', 'Page rotation and auto-snap for every phone'],
  ['design', 'Design', 'Text size, fonts, spacing, corners, widths, and each type of button and shape'],
  ['log', 'Change history', 'Who changed what, and when']];
// Hidden from the Settings list (owner, Oct 18): Stage delays is unused (Production uses optional target dates, no standard days).
// The values stay in the Settings tab and in the Change history; nothing is deleted. Remove a key here to show the section again.
const HIDDEN = { stages: true };
const SHOWN = SECS.filter(s => !HIDDEN[s[0]]);
const S = { r: null, dirty: {}, code: null, busy: false };
const $ = id => document.getElementById(id);
const esc = s => window.OYP.esc(s);
const item = k => S.r.items.find(i => i.key === k);
const eff = it => it.value !== '' ? it.value : it.def;
const pad = n => String(n).padStart(2, '0');
const clock = v => { if (!v) return ''; let [h, m] = v.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ' ' + ap; };
const dayList = v => { const a = String(v).split(',').map(Number); const o = DAYS.filter(d => a.includes(d[0])).map(d => d[1]);
  return o.join(',') === 'Mon,Tue,Wed,Thu,Fri' ? 'Mon–Fri' : o.join(', '); };
const when = iso => { if (!iso) return ''; const d = new Date(Date.parse(iso) + 8 * 36e5);
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + clock(pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes())); };
const show = (it, v) => it.type === 'time' ? clock(v) : it.type === 'days' ? dayList(v) : it.type === 'bool' ? (v === 'true' ? 'On' : 'Off') : it.type === 'choice' ? (it.choices[v] || v) : v === '' ? 'Off' : v;
const sec = () => (location.hash.match(/^#\/settings\/(\w+)/) || [])[1] || '';
const peso = n => n === '' || n == null ? '—' : '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

async function render(main, u) {
  const live = window.OYP.here();
  if (!S.r) main.innerHTML = '<h2>Settings</h2><div class="skel" aria-busy="true" aria-label="Loading"><i></i><i></i><i></i><i></i><i></i></div>';
  const r = await window.OYP.call('settingsGet'); if (!live()) return;
  if (!r || !r.ok) { main.innerHTML = `<h2>Settings</h2><p class="muted">${esc(!r || r.error === 'Unknown action' ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return; }
  S.r = r; S.dirty = {}; draw(main);
}
async function reload(main) { const live = window.OYP.here(); const r = await window.OYP.call('settingsGet'); if (!live()) return; if (r && r.ok) { S.r = r; S.dirty = {}; draw(main); } }
function draw(main) {
  const s = sec(), ok = SHOWN.find(x => x[0] === s);
  main.innerHTML = `<div class="set">${!S.r.setup ? '<div class="setwarn">Almost ready: run <b>setupSettings</b> once in Apps Script. Until then you can look, but not save.</div>' : ''}${ok ? section(s) : landing()}</div>`;
  wire(main);
}

/* ---------- list of sections ---------- */
function summary(k) {
  const I = key => { const it = item(key); return it ? show(it, eff(it)) : ''; };
  if (k === 'prices') { const R = S.r.rates, m = R.markups.find(x => x.code === 'materials'); return R.markups.length ? (m ? 'Materials ×' + m.rate + ' · ' : '') + R.markups.length + ' markups · ' + R.labor.length + ' labor rates' : 'No Rates tab yet'; }
  if (k === 'payments') return 'Overdue after ' + I('pay.grace_days') + ' business days';
  if (k === 'hours') return I('store.days') + ' · ' + I('store.open') + '–' + I('store.close');
  if (k === 'bulletin') return I('bulletin.time') + ' · ' + I('bulletin.days');
  if (k === 'appts') { const T = JSON.parse(eff(item('appt.types'))); return I('appt.default_min') + ' min · ' + T.filter(t => t.on).map(t => t.label).join(', '); }
  if (k === 'stages') { const n = S.r.items.filter(i => i.group === 'stages' && i.value !== '').length; return n ? n + ' stage' + (n > 1 ? 's' : '') + ' with a limit' : 'No limits set'; }
  if (k === 'staff') { const a = S.r.users.filter(x => x.active).length; return a + ' active · ' + (S.r.users.length - a) + ' off'; }
  if (k === 'scanner') return I('scanner.rotate').replace(/ \(.*\)/, '') + ' · auto-snap ' + I('scanner.auto_snap').toLowerCase();
  if (k === 'design') { const v = dsStart(), D = window.OYPDesign; if (!D) return '';
    const on = Object.keys(DS).filter(x => v[x] !== D.KEYS[x][1]), np = Object.keys(dpStart()).length, f = dfStart();
    const s = on.map(x => DS[x][0] + ' ' + dsFmt(x, v[x])).concat(Object.keys(DF).filter(k => f[k]).map(k => DF[k][0] + ' ' + fName(f[k]))).concat(np ? [np + ' button & shape type' + (np > 1 ? 's' : '') + ' changed'] : []); return s.length ? s.join(' · ') : 'Original look'; }
  if (k === 'log') { const l = S.r.log[0]; return l ? 'Last: ' + when(l.at) + ' by ' + l.by : 'No changes yet'; }
  return '';
}
function landing() {
  return `<h2>Settings</h2><p class="muted">Change the shop's numbers here. Every change is saved with your name in the Change history. Empty fields use the default.</p>
    <div class="setgrid">${SHOWN.map(([k, t, d]) => `<a class="setcard tap" href="#/settings/${k}"><span class="lab">${esc(t)}</span><b>${esc(summary(k))}</b><span class="muted">${esc(d)}</span><span class="chev">›</span></a>`).join('')}</div>`;
}

/* ---------- one section ---------- */
function head(t, d) { return `<a class="lnk dback" href="#/settings">‹ BACK</a><h2>${esc(t)}</h2>${d ? `<p class="muted">${d}</p>` : ''}`; }
function meta(it) {
  const ch = it.value !== '' ? `Changed ${esc(when(it.changed_at))} by ${esc(it.changed_by)} · <button class="lnk" data-reset="${esc(it.key)}">Back to default</button>` : 'Default';
  const dv = it.type === 'types' ? JSON.parse(it.def).map(t => t.label).join(', ') : show(it, it.def);
  return `<span class="setmeta">${ch}${it.value !== '' && it.def !== '' ? ` · default ${esc(dv)}` : ''}</span>`;
}
function input(it) {
  const v = S.dirty[it.key] !== undefined ? S.dirty[it.key] : eff(it), dis = it.off || !S.r.setup ? ' disabled' : '', k = esc(it.key);
  if (it.type === 'time') { let o = ''; for (let m = 6 * 60; m <= 21 * 60; m += 15) { const hv = pad(Math.floor(m / 60)) + ':' + pad(m % 60); o += `<option value="${hv}"${hv === v ? ' selected' : ''}>${clock(hv)}</option>`; }
    return `<select data-k="${k}"${dis}>${o}</select>`; }
  if (it.type === 'days') { const a = String(v).split(',').filter(Boolean).map(Number);
    return `<div class="setdays" data-days="${k}">${DAYS.map(([n, l]) => `<button type="button" class="dchip${a.includes(n) ? ' on' : ''}" data-d="${n}"${dis}>${l}</button>`).join('')}</div>`; }
  if (it.type === 'bool') return `<label class="settog"><input type="checkbox" data-k="${k}"${v === 'true' ? ' checked' : ''}${dis}><span>${v === 'true' ? 'On' : 'Off'}</span></label>`;
  if (it.type === 'choice') return `<select data-k="${k}"${dis}>${Object.entries(it.choices).map(([c, l]) => `<option value="${esc(c)}"${c === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (it.key === 'appt.default_min') return `<select data-k="${k}"${dis}>${LENS.map(n => `<option value="${n}"${String(n) === String(v) ? ' selected' : ''}>${n} min</option>`).join('')}</select>`;
  return `<input data-k="${k}" inputmode="decimal" value="${esc(v)}"${it.blank ? ' placeholder="off"' : ''}${dis}>`;
}
function field(key, label, help) {
  const it = item(key); if (!it) return '';
  return `<div class="setrow${it.off ? ' off' : ''}"><div class="setl"><span class="lab">${esc(label || it.label)}</span>${help ? `<span class="muted">${help}</span>` : ''}${it.off ? `<span class="chip">Needs the ${esc(it.needs)} paste</span>` : meta(it)}</div><div class="setv">${input(it)}</div></div>`;
}
const saveBar = (id = 'setSave') => S.r.setup ? `<div class="setbar"><button class="pill" id="${id}" disabled>SAVE</button><span class="muted" id="setMsg"></span></div>` : '';
function section(s) {
  const t = SECS.find(x => x[0] === s);
  if (s === 'payments') return head(t[1], 'A JO with a balance becomes <b>overdue</b> only after this many business days (Mon–Fri) past its due date. A sold piece with a balance is always overdue.')
    + `<div class="setbox">${field('pay.grace_days', 'Business days after the due date')}</div>` + saveBar();
  if (s === 'hours') return head(t[1], 'Visits inside the store hours book straight away. Outside them (or on a closed day) staff must confirm. Nothing can be booked before the earliest time or end after the latest.')
    + `<div class="setbox">${field('store.days', 'Open days')}${field('store.open', 'Opens')}${field('store.close', 'Closes')}${field('booking.earliest', 'Earliest booking', 'Even with the confirm')}${field('booking.latest', 'Latest end of a visit', 'Even with the confirm')}</div>` + saveBar();
  if (s === 'bulletin') return head(t[1], 'The Telegram group gets the day\'s visits, pickups and payments at this time. On other days it posts only when a visit is booked.')
    + `<div class="setbox">${field('bulletin.time', 'Time')}${field('bulletin.days', 'Days')}</div>` + saveBar();
  if (s === 'scanner') return head(t[1], 'The default for every phone that scans JO cards. A phone where someone picked its own setting in the scanner keeps that.')
    + `<div class="setbox">${field('scanner.rotate', 'Page rotation')}${field('scanner.auto_snap', 'Auto-snap', 'Takes the photo by itself when the card is steady')}</div>` + saveBar();
  if (s === 'stages') return head(t[1], 'A JO that stays in a stage longer than this is flagged as delayed. Leave empty for no limit.')
    + `<div class="setbox setstages">${S.r.stages.map(([c, l]) => field('stage.' + c, l)).join('')}</div>` + saveBar();
  if (s === 'appts') return head(t[1], 'New visits start with the default length. Types can be renamed, given a minimum length, or turned off. A type is never removed, so old visits keep it.')
    + `<div class="setbox">${field('appt.default_min', 'Default length')}${typesBox()}</div>` + saveBar();
  if (s === 'prices') return head(t[1], 'These are the rates the cost estimator and quotes use. Metal prices per gram are changed on <a href="#/prices">Material prices</a>.') + pricesBox() + saveBar();
  if (s === 'staff') return head(t[1], 'Accounts are never deleted: turn them off instead. A new code is shown only once. Changing someone\'s role or code signs them out on every device.') + staffBox();
  if (s === 'design') return head(t[1], 'Drag a slider and this page changes right away, so you can see it before saving. <b>SAVE</b> makes it the look for everyone: every staff phone and computer, and the customer pages (order lookup, shop). Other devices pick it up within a few minutes.') + designBox();
  if (s === 'log') return head(t[1], 'The newest 40 changes. The full list is in the SettingsLog tab of the Sheet.') + logBox();
  return '';
}
/* ---------- Design (sliders -> CSS variables, design.js) ---------- */
const DS = { // key -> [short name, label, what it changes]
  text: ['Text', 'Text size', 'Everyday text: descriptions, tables, labels, menus, form fields'],
  head: ['Headings', 'Heading size', 'Page titles, JO numbers, names, big numbers and the black buttons'],
  space: ['Spacing', 'Spacing', 'Space inside and between boxes, cards, rows and buttons'],
  radius: ['Corners', 'Corner roundness', 'How round the corners of cards, boxes, fields and buttons are (0 = square)'],
  box: ['Card height', 'Card and box height', 'Production JO cards (all stay the same height) and the minimum height of boxes and columns'],
  width: ['Width', 'Content width', 'How wide pages can grow on a big screen (the customer pages too)'] };
const dsPasted = () => !!item('design.text');
const dsFmt = (k, v) => window.OYPDesign.KEYS[k][5] === '%' ? v + '%' : v + ' px';
function dsStart() { const D = window.OYPDesign, o = {}, loc = D.local();
  Object.keys(DS).forEach(k => { const it = item('design.' + k), def = D.KEYS[k][1];
    o[k] = loc && k in loc ? loc[k] : loc ? def : it && it.value !== '' ? Number(it.value) : def; });
  return o; }
/* ---------- Buttons & shapes (one row per type; design.js PARTS, app.css --d-<type>-<control>) ---------- */
const PRV = { // preview markup = the real classes, styled by the real CSS
  btn: '<button class="pill" type="button" tabindex="-1">SAVE</button>',
  btnout: '<button class="pill outline" type="button" tabindex="-1">CANCEL</button>',
  btnbig: '<button class="pill wide" type="button" tabindex="-1">MOVE TO CASTING ▸</button>',
  btnsm: '<button class="pill sm" type="button" tabindex="-1">ADD</button><button class="pill sm outline" type="button" tabindex="-1">EDIT</button>',
  link: '<button class="lnk" type="button" tabindex="-1">Reset</button><span class="lnk dback">‹ BACK</span>',
  menu: '<div class="menu"><a class="on">Production</a><a>Appointments</a></div>',
  tabs: '<div class="seg"><button class="on" type="button" tabindex="-1">DAY</button><button type="button" tabindex="-1">WEEK</button><button type="button" tabindex="-1">MONTH</button></div>',
  fchip: '<button class="fchip on" type="button" tabindex="-1">ALL <b>12</b></button><button class="fchip" type="button" tabindex="-1">LATE <b>2</b></button>',
  chip: '<span class="chip">Due Oct 24</span><span class="chip gold">Paid</span>',
  field: '<input type="text" value="Baby Buenaventura" tabindex="-1" readonly aria-label="Sample field">',
  card: '<div class="kpi"><span class="lab">Balance due</span><b>₱226,750</b><small>Final payment · BPI</small></div>',
  pcard: '<div class="pcard"><div class="pcm"><div class="pth"><span>No scan</span></div><div class="pbd"><div class="kjo"><span class="pjn">JO 1234</span></div><div class="kd">18k yellow gold ring, oval sapphire</div><div class="kc">Baby Buenaventura · <b>Susan</b></div><div class="prun pslot"></div></div></div><div class="kf"><span class="chip">Due Oct 24</span></div></div>',
  modal: '<div class="pmbox"><span class="lab">JO 1234</span><b class="dpmh">Move to Casting?</b><button class="pill wide" type="button" tabindex="-1">YES, MOVE</button></div>',
  toast: '<div class="toast">Saved for everyone</div>' };
const DP = { // type -> [name, where it is used, height label, width label]
  btn: ['Black buttons', 'Save, Sign in, Upload, Confirm', 'Height', 'Width'],
  btnout: ['White outline buttons', 'Cancel, Edit, Back-up choices (customer Sign in too)', 'Height', 'Width'],
  btnbig: ['Big and full-width buttons', 'Home page tiles, Move to…, Yes / OK in pop-ups', 'Height', ''],
  btnsm: ['Small buttons', 'Add, Edit, Rotate inside lists and panels', 'Height', 'Width'],
  link: ['Text links', 'Reset, Back, Show more (underlined words)', '', ''],
  menu: ['Menu items', 'Side menu, phone menu and the name menu', 'Height', ''],
  tabs: ['Tabs and switches', 'Day / Week / Month, Board / Workers, Cash / GCash', 'Height', ''],
  fchip: ['Filter chips', 'All / Late filters, day buttons in Settings', 'Height', 'Width'],
  chip: ['Status badges', 'Due, Paid, Delayed, Archived labels', 'Height', 'Width'],
  field: ['Form fields', 'Every text box and drop-down (customer pages too)', 'Height', ''],
  card: ['Cards and boxes', 'Dashboard numbers, panels, Settings boxes, inventory and shop tiles', 'Padding', 'Max width'],
  pcard: ['Production JO cards', 'Board cards (all stay the same height)', 'Card height', ''],
  modal: ['Pop-ups and side panels', 'Move JO pop-up, inventory panel, menus', 'Padding', 'Width'],
  toast: ['Notices', 'The black "Saved" message at the bottom', 'Height', ''] };
const DPC = { t: 'Text size', r: 'Corners' };
const dpPasted = () => !!item('design.parts');
const dpParse = s => window.OYPDesign.cleanParts(s || '{}');
function dpServer() { const it = item('design.parts'); return it ? dpParse(it.value) : {}; }
function dpStart() { const D = window.OYPDesign, lp = D.localParts(), lf = D.localFonts(), p = JSON.parse(JSON.stringify(lp || dpServer()));
  if (lf || !dfPasted()) Object.keys(p).forEach(c => { delete p[c].f; }); // fonts not on the server yet: a type's font comes from this device
  if (lf) Object.keys(lf.pf).forEach(c => { (p[c] = p[c] || {}).f = lf.pf[c]; });
  Object.keys(p).forEach(c => { if (!Object.keys(p[c]).length) delete p[c]; }); return p; }
/* ---------- Fonts (only the fonts every page already loads: design.js FONTS) ---------- */
const DF = { font_body: ['Body text', 'Everyday text: descriptions, tables, form fields'], font_head: ['Headings', 'Page titles, names, JO numbers, big numbers and the black buttons'],
  font_label: ['Labels and menus', 'Small capital labels, menus, chips, tabs and links'] };
const dfPasted = () => !!item('design.font_body');
const fName = v => window.OYPDesign.FONTS[v] ? window.OYPDesign.FONTS[v][0] : 'Default';
const fStack = v => window.OYPDesign.FONTS[v][1];
function dfServer() { const o = {}; Object.keys(DF).forEach(k => { const it = item('design.' + k); o[k] = it && window.OYPDesign.FONTS[it.value] ? it.value : ''; }); return o; }
function dfStart() { const lf = window.OYPDesign.localFonts(), s = dfServer(), o = {}; Object.keys(DF).forEach(k => { o[k] = lf ? lf[k] || '' : s[k]; }); return o; }
function dfSaved() { return dfStart(); }
const fontChips = (attr, cur, defName, dis, defCode) => ['', 'libre', 'moda', 'inter'].map(v => `<button type="button" class="dsfont${(cur || '') === v ? ' on' : ''}" ${attr} data-fv="${v}"
  style="font-family:${v || defCode ? fStack(v || defCode).replace(/'/g, '&#39;') : 'var(--label)'}"${dis}>${v ? esc(fName(v)) : 'Default' + (defName ? ' <small>(' + esc(defName) + ')</small>' : '')}</button>`).join('');
function fontsBox(dis) {
  const D = window.OYPDesign;
  return `<h3 class="seth">Fonts</h3><p class="muted dsph">Only the fonts the website already uses, so nothing new has to load. <b>Default</b> keeps today's font.</p>
    ${!dfPasted() ? '<div class="setwarn">Saving fonts for everyone needs the new <b>Design</b> paste in Apps Script. Until then fonts are saved on <b>this device only</b>.</div>'
      : D.localFonts() ? '<div class="setwarn">This device shows its own fonts (saved here before the paste). SAVE to make them everyone\'s, or Reset all.</div>' : ''}
    <div class="setbox">${Object.keys(DF).map(k => { const it = item('design.' + k);
      return `<div class="setrow col dsfrow"><div class="setl"><span class="lab">${esc(DF[k][0])}</span><span class="muted">${esc(DF[k][1])}</span>
        <span class="setmeta">${it && it.value !== '' && it.value !== 'default' && !D.localFonts() ? `Saved ${esc(when(it.changed_at))} by ${esc(it.changed_by)} · ` : ''}Default ${esc(fName(D.FKEYS[k][1]))}</span></div>
        <div class="dsfonts">${fontChips(`data-dsf="${k}"`, S.df[k], fName(D.FKEYS[k][1]), dis, D.FKEYS[k][1])}<button class="lnk" data-dsfreset="${k}"${S.df[k] ? '' : ' disabled'}${dis}>Reset</button></div></div>`; }).join('')}</div>`;
}
const dpVal = (c, k) => (S.dp[c] && S.dp[c][k] != null ? S.dp[c][k] : 100);
const dpLab = (c, k) => k === 't' || k === 'r' ? DPC[k] : k === 'f' ? 'Font' : k === 'h' ? DP[c][2] : DP[c][3];
const dpFmt = (k, v) => k === 'f' ? fName(v) : v + '%';
const dpText = p => { const o = []; Object.keys(DP).forEach(c => { const x = p[c]; if (!x) return;
  o.push(DP[c][0] + ': ' + Object.keys(x).map(k => dpLab(c, k).toLowerCase() + ' ' + dpFmt(k, x[k])).join(', ')); }); return o.join(' · '); };
const dpShort = (c, p) => { const x = (p || S.dp)[c]; return x && Object.keys(x).length ? Object.keys(x).map(k => dpLab(c, k) + ' ' + dpFmt(k, x[k])).join(' · ') : 'Original'; };
function partsBox(dis) {
  const D = window.OYPDesign, srv = dpServer(), it = item('design.parts');
  const row = c => { const ctl = D.PARTS[c].split('');
    return `<details class="dspart" data-dp="${c}"${S.dpOpen && S.dpOpen[c] ? ' open' : ''}><summary>
      <span class="dspn"><b>${esc(DP[c][0])}</b><span class="muted">${esc(DP[c][1])}</span><span class="dpst${S.dp[c] ? ' on' : ''}" id="dpS_${c}">${esc(dpShort(c))}</span></span>
      <span class="dspv dspv-${c}" aria-hidden="true">${PRV[c]}</span><span class="dschev" aria-hidden="true">›</span></summary>
      <div class="dspc">${ctl.filter(k => k !== 'f').map(k => { const [mn, mx] = D.CTL[k], v = dpVal(c, k);
        return `<div class="dpctl"><span class="lab">${esc(dpLab(c, k))}</span><input type="range" data-dpc="${c}" data-dpk="${k}" min="${mn}" max="${mx}" step="5" value="${v}" aria-label="${esc(DP[c][0] + ' ' + dpLab(c, k))}"${dis}>
          <output class="dsout" id="dpO_${c}_${k}">${v}%</output><button class="lnk" data-dpreset="${c}" data-dpk="${k}"${v === 100 ? ' disabled' : ''}${dis}>Reset</button></div>`; }).join('')}
        ${ctl.includes('f') ? `<div class="dpctl dpfont"><span class="lab">Font</span><div class="dsfonts">${fontChips(`data-dpf="${c}"`, S.dp[c] && S.dp[c].f, '', dis)}</div>
          <button class="lnk" data-dpreset="${c}" data-dpk="f"${S.dp[c] && S.dp[c].f ? '' : ' disabled'}${dis}>Reset</button></div>` : ''}
        <div class="dpfoot"><span class="setmeta">100% = as the sliders above make it · Default font = the fonts above${srv[c] ? ' · saved: ' + esc(dpShort(c, srv)) : ''}</span><button class="lnk" data-dpreset="${c}" data-dpk=""${S.dp[c] ? '' : ' disabled'}${dis}>Reset ${esc(DP[c][0].toLowerCase())}</button></div></div></details>`; };
  return `<h3 class="seth">Buttons &amp; shapes</h3><p class="muted dsph">Tap a row to change that one type of button or shape. Its sliders work on top of the ones above (100% = no change), and the whole site changes while you drag.${it && it.value !== '' && !D.localParts() ? ` <span class="setmeta">Saved ${esc(when(it.changed_at))} by ${esc(it.changed_by)}</span>` : ''}</p>
    ${!dpPasted() ? '<div class="setwarn">Saving buttons &amp; shapes for everyone needs the new <b>Design</b> paste in Apps Script. Until then they are saved on <b>this device only</b>' + (dsPasted() ? ' (the sliders above still save for everyone)' : '') + '.</div>'
      : D.localParts() ? '<div class="setwarn">This device shows its own buttons &amp; shapes (saved here before the paste). SAVE to make them everyone\'s, or Reset all.</div>' : ''}
    <div class="dsparts">${Object.keys(DP).map(row).join('')}</div>`;
}
function dpDirty() { return JSON.stringify(window.OYPDesign.cleanParts(S.dp)) !== JSON.stringify(window.OYPDesign.cleanParts(dpSavedNow())); }
function dpSavedNow() { const D = window.OYPDesign, cur = S.dp; S.dp = null; const p = dpStart(); S.dp = cur; return p; } // what is saved now (server / this device)
function dfDirty() { const s = dfSaved(); return Object.keys(DF).filter(k => (S.df[k] || '') !== (s[k] || '')); }
function designBox() {
  const D = window.OYPDesign; if (!D) return '<p class="muted">Reload the page to use Design.</p>';
  const v = S.ds || (S.ds = dsStart()), pasted = dsPasted(), loc = D.local(), dis = pasted && !S.r.setup ? ' disabled' : '';
  if (!S.dp) S.dp = dpStart(); if (!S.df) S.df = dfStart();
  const row = k => { const [, def, mn, mx, st] = D.KEYS[k], it = item('design.' + k);
    return `<div class="setrow dsrow"><div class="setl"><span class="lab">${esc(DS[k][1])}</span><span class="muted">${esc(DS[k][2])}</span>
      <span class="setmeta">${it && it.value !== '' && !loc ? `Saved ${esc(when(it.changed_at))} by ${esc(it.changed_by)} · ` : ''}Default ${esc(dsFmt(k, def))}</span></div>
      <div class="setv dsv"><input type="range" data-ds="${k}" min="${mn}" max="${mx}" step="${st}" value="${v[k]}" aria-label="${esc(DS[k][1])}"${dis}>
      <output class="dsout" id="dsO_${k}">${esc(dsFmt(k, v[k]))}</output><button class="lnk" data-dsreset="${k}"${v[k] === def ? ' disabled' : ''}${dis}>Reset</button></div></div>`; };
  return `${!pasted ? '<div class="setwarn">Saving for everyone needs the <b>Design</b> paste in Apps Script. Until then SAVE keeps the look on <b>this device only</b>.</div>'
      : loc ? '<div class="setwarn">This device shows its own look (saved here before the Design paste). SAVE to make it everyone\'s look, or Reset all.</div>' : ''}
    <div class="dsprev" aria-label="Sample"><span class="lab">Sample</span>
      <div class="dsgrid"><div class="kpi"><span class="lab">Balance due</span><b>₱226,750</b><small>Final payment · BPI</small></div>
      <div class="pcard"><div class="pcm"><div class="pth"><span>No scan</span></div><div class="pbd"><div class="kjo"><span class="pjn">JO 1234</span></div>
        <div class="kd">18k yellow gold ring, oval sapphire</div><div class="kc">Baby Buenaventura · <b>Susan</b></div><div class="prun pslot" aria-hidden="true"></div></div></div>
        <div class="kf"><span class="chip">Due Oct 24</span><span class="chip pdays">2 days in step</span></div></div>
      <div class="dsside"><h3 class="dsh">Heading</h3><p>Everyday text looks like this. <span class="chip gold">Chip</span></p><button class="pill" type="button" tabindex="-1">BUTTON</button></div></div></div>
    <div class="setbox">${Object.keys(DS).map(row).join('')}</div>
    ${fontsBox(dis)}
    ${partsBox(dis)}
    <div class="setbar"><button class="pill" id="dsSave" disabled>${pasted || dpPasted() ? 'SAVE' : 'SAVE ON THIS DEVICE'}</button><button class="lnk" id="dsAll"${dis}>Reset all</button><span class="muted" id="dsMsg"></span></div>`;
}
function dsDirty() { const D = window.OYPDesign, a = S.ds, b = dsSaved(); return Object.keys(DS).filter(k => a[k] !== b[k]); }
function dsSaved() { const D = window.OYPDesign, cur = D.current(), o = {}; Object.keys(DS).forEach(k => { o[k] = k in cur ? cur[k] : D.KEYS[k][1]; }); return o; }
function dsMark() { const D = window.OYPDesign, pd = S.dp && dpDirty(), fd = S.df ? dfDirty().length : 0, sd = dsDirty().length, n = sd + (pd ? 1 : 0) + fd, b = $('dsSave'), m = $('dsMsg');
  if (b) b.disabled = (!n && !(dsPasted() && D.local()) && !(dpPasted() && D.localParts()) && !(dfPasted() && D.localFonts())) || S.busy;
  const what = [sd ? sd + ' slider' + (sd > 1 ? 's' : '') : '', fd ? fd + ' font' + (fd > 1 ? 's' : '') : '', pd ? 'buttons & shapes' : ''].filter(Boolean).join(' + ');
  if (m && !S.busy) m.textContent = n ? 'Preview only: not saved yet (' + what + ')' : '';
  if (S.df) { Object.keys(DF).forEach(k => { document.querySelectorAll(`[data-dsf="${k}"]`).forEach(x => x.classList.toggle('on', x.dataset.fv === (S.df[k] || '')));
    const rr = document.querySelector(`[data-dsfreset="${k}"]`); if (rr) rr.disabled = !S.df[k]; }); }
  if (S.dp) Object.keys(DP).forEach(c => document.querySelectorAll(`[data-dpf="${c}"]`).forEach(x => x.classList.toggle('on', x.dataset.fv === ((S.dp[c] && S.dp[c].f) || ''))));
  Object.keys(DS).forEach(k => { const r = document.querySelector(`[data-dsreset="${k}"]`); if (r) r.disabled = S.ds[k] === D.KEYS[k][1]; });
  if (S.dp) Object.keys(DP).forEach(c => { const st = $('dpS_' + c); if (st) { st.textContent = dpShort(c); st.classList.toggle('on', !!S.dp[c]); }
    D.PARTS[c].split('').forEach(k => { const r = document.querySelector(`[data-dpreset="${c}"][data-dpk="${k}"]`); if (r) r.disabled = dpVal(c, k) === 100; });
    const ra = document.querySelector(`[data-dpreset="${c}"][data-dpk=""]`); if (ra) ra.disabled = !S.dp[c]; }); }
const dsLook = () => Object.assign({}, S.ds, S.df || {}, { parts: S.dp || {} }); // what the page previews: the six sliders + fonts + buttons & shapes
function dsWire(main) {
  const D = window.OYPDesign; if (!D || !$('dsSave')) return;
  const set = (k, v) => { S.ds[k] = v; const i = main.querySelector(`[data-ds="${k}"]`); if (i) i.value = v; $('dsO_' + k).textContent = dsFmt(k, v); };
  const prev = () => { D.preview(dsLook()); dsMark(); };
  const pset = (c, k, v) => { const x = S.dp[c] || (S.dp[c] = {}); if (k === 'f' ? !D.FONTS[v] : v === 100) delete x[k]; else x[k] = v; if (!Object.keys(x).length) delete S.dp[c];
    if (k === 'f') return; const i = main.querySelector(`[data-dpc="${c}"][data-dpk="${k}"]`); if (i) i.value = v; const o = $('dpO_' + c + '_' + k); if (o) o.textContent = v + '%'; };
  main.querySelectorAll('[data-dpf]').forEach(b => b.onclick = () => { pset(b.dataset.dpf, 'f', b.dataset.fv); prev(); });
  main.querySelectorAll('[data-dsf]').forEach(b => b.onclick = () => { S.df[b.dataset.dsf] = b.dataset.fv; prev(); });
  main.querySelectorAll('[data-dsfreset]').forEach(b => b.onclick = () => { S.df[b.dataset.dsfreset] = ''; prev(); });
  main.querySelectorAll('[data-dpc]').forEach(el => el.oninput = el.onchange = () => { pset(el.dataset.dpc, el.dataset.dpk, Number(el.value)); prev(); });
  main.querySelectorAll('[data-dpreset]').forEach(b => b.onclick = () => { const c = b.dataset.dpreset; (b.dataset.dpk ? [b.dataset.dpk] : D.PARTS[c].split('')).forEach(k => pset(c, k, 100)); prev(); });
  main.querySelectorAll('details.dspart').forEach(d => d.ontoggle = () => { (S.dpOpen = S.dpOpen || {})[d.dataset.dp] = d.open; });
  main.querySelectorAll('[data-ds]').forEach(el => el.oninput = el.onchange = () => { set(el.dataset.ds, Number(el.value)); prev(); });
  main.querySelectorAll('[data-dsreset]').forEach(b => b.onclick = () => { set(b.dataset.dsreset, D.KEYS[b.dataset.dsreset][1]); prev(); });
  $('dsAll').onclick = () => { Object.keys(DS).forEach(k => set(k, D.KEYS[k][1])); Object.keys(DF).forEach(k => { S.df[k] = ''; }); Object.keys(DP).forEach(c => D.PARTS[c].split('').forEach(k => pset(c, k, 100))); prev(); };
  $('dsSave').onclick = () => dsSave(main);
  if (dsDirty().length || dpDirty() || dfDirty().length) D.preview(dsLook()); dsMark();
}
async function dsSave(main) {
  // Each part goes to the server when its paste is in, else it is kept on this device: the six sliders (design.text..), buttons & shapes
  // (design.parts), fonts (design.font_body/head/label + each type's font f inside design.parts). One settingsSave = one save in the Change history.
  const D = window.OYPDesign, { call, toast } = window.OYP, v = Object.assign({}, S.ds), p = D.cleanParts(S.dp || {}), F = Object.assign({}, S.df || {});
  const gSrv = dsPasted(), pSrv = dpPasted(), fSrv = dfPasted(), values = {}, seen = {};
  const pNoF = JSON.parse(JSON.stringify(p)), pf = {}; Object.keys(pNoF).forEach(c => { if (pNoF[c].f) pf[c] = pNoF[c].f; delete pNoF[c].f; if (!Object.keys(pNoF[c]).length) delete pNoF[c]; });
  const pSend = fSrv ? p : pNoF;
  if (gSrv) Object.keys(DS).forEach(k => { const it = item('design.' + k), sv = it.value !== '' ? Number(it.value) : D.KEYS[k][1];
    if (v[k] !== sv) { values['design.' + k] = String(v[k]); seen['design.' + k] = it.changed_at || ''; } });
  if (pSrv) { const it = item('design.parts'); if (JSON.stringify(pSend) !== JSON.stringify(dpServer())) { values['design.parts'] = JSON.stringify(pSend); seen['design.parts'] = it.changed_at || ''; } }
  if (fSrv) { const s = dfServer(); Object.keys(DF).forEach(k => { if ((F[k] || '') !== s[k]) { values['design.' + k] = F[k] || 'default'; seen['design.' + k] = item('design.' + k).changed_at || ''; } }); }
  if (Object.keys(values).length) { S.busy = true; dsMark(); $('dsMsg').textContent = 'Saving…';
    const r = await call('settingsSave', { values, seen }); S.busy = false;
    if (!r || !r.ok) { dsMark(); $('dsMsg').textContent = ''; return toast((r && r.error) || 'Could not save'); } }
  const srv = Object.assign({}, D.server()), old = D.server(), localOnly = [];
  if (gSrv) { Object.keys(DS).forEach(k => { delete srv[k]; }); Object.assign(srv, D.KEYS && (() => { const c = D.clean(v); delete c.parts; Object.keys(DF).forEach(k => delete c[k]); return c; })()); D.clearLocal(); }
  else { const c = D.clean(v); delete c.parts; if (Object.keys(c).length) { D.setLocal(c); localOnly.push('sliders'); } else D.clearLocal(); }
  if (pSrv) { if (Object.keys(pSend).length) srv.parts = pSend; else delete srv.parts; D.clearLocalParts(); }
  else if (JSON.stringify(pNoF) !== JSON.stringify(D.cleanParts(old.parts || {}))) { D.setLocalParts(pNoF); localOnly.push('buttons & shapes'); } else D.clearLocalParts();
  if (fSrv) { Object.keys(DF).forEach(k => { if (F[k]) srv[k] = F[k]; else delete srv[k]; }); D.clearLocalFonts(); }
  else if (Object.keys(DF).some(k => F[k]) || Object.keys(pf).length) { const lf = { pf }; Object.keys(DF).forEach(k => { if (F[k]) lf[k] = F[k]; }); D.setLocalFonts(lf); localOnly.push('fonts'); }
  else D.clearLocalFonts();
  D.setServer(srv); D.restore(); S.ds = null; S.dp = null; S.df = null;
  toast(!localOnly.length ? 'Saved for everyone' : gSrv || pSrv || fSrv ? 'Saved (' + localOnly.join(', ') + ' on this device only)' : 'Saved on this device');
  if (gSrv || pSrv || fSrv) reload(main); else draw(main);
}
function typesBox() {
  const it = item('appt.types'), T = S.types || (S.types = JSON.parse(eff(it))), dis = it.off || !S.r.setup ? ' disabled' : '';
  return `<div class="setrow col"><div class="setl"><span class="lab">Visit types</span>${it.off ? `<span class="chip">Needs the ${esc(it.needs)} paste</span>` : meta(it)}</div>
    <table class="settab"><thead><tr><th><span class="lab">Name</span></th><th><span class="lab">At least</span></th><th><span class="lab">On</span></th></tr></thead><tbody>
    ${T.map((t, i) => `<tr class="${t.on ? '' : 'muted'}"><td><input data-ti="${i}" data-tf="label" value="${esc(t.label)}" maxlength="24"${dis}></td>
      <td><select data-ti="${i}" data-tf="min"${dis}>${LENS.map(n => `<option value="${n}"${n === Number(t.min) ? ' selected' : ''}>${n} min</option>`).join('')}</select></td>
      <td><label class="settog"><input type="checkbox" data-ti="${i}" data-tf="on"${t.on ? ' checked' : ''}${dis}><span>${t.on ? 'On' : 'Off'}</span></label></td></tr>`).join('')}</tbody></table>
    ${dis ? '' : '<button class="lnk" id="tAdd">+ Add a type</button>'}</div>`;
}
function pricesBox() {
  const R = S.r.rates, dis = !S.r.setup ? ' disabled' : '', pOff = !S.r.modules.Prices;
  const rate = (x, unit) => `<div class="setrow"><div class="setl"><span class="lab">${esc(x.label)}</span></div><div class="setv"><span class="setu">${unit}</span><input data-rate="${esc(x.rate_id)}" data-seen="${esc(x.rate)}" inputmode="decimal" value="${esc(x.rate)}"${dis}></div></div>`;
  if (!R.markups.length && !R.labor.length) return '<p class="muted">No Rates tab yet (run setupCosting).</p>';
  return `<h3 class="lab seth">Markups</h3><div class="setbox">${R.markups.map(x => rate(x, '×')).join('')}</div>
    <h3 class="lab seth">Labor rates (per hour)</h3><div class="setbox">${R.labor.map(x => rate(x, '₱')).join('')}</div>
    <h3 class="lab seth">Metals</h3><div class="setbox">${R.metals.map(x => { const it = item(x.purity_key);
      return `<div class="setrow"><div class="setl"><span class="lab">${esc(x.label)}</span><span class="muted">${peso(x.rate)} per g today</span>${it && it.value !== '' ? meta(it) : ''}</div>
      <div class="setv two"><label><span class="setu">Premium</span><input data-prem="${esc(x.code)}" data-seen="${esc(x.premium_pct)}" inputmode="decimal" value="${esc(x.premium_pct)}" placeholder="—"${dis || (pOff ? ' disabled' : '')}><span class="setu">%</span></label>
      ${it ? `<label><span class="setu">Purity</span><input data-k="${esc(it.key)}" inputmode="decimal" value="${esc(S.dirty[it.key] !== undefined ? S.dirty[it.key] : eff(it))}"${dis || (pOff ? ' disabled' : '')}></label>` : ''}</div></div>`; }).join('')}</div>
    ${pOff ? '<p class="muted">Premium and purity need the Material prices paste.</p>' : ''}`;
}
const ROLE = r => window.OYP.ROLE_LABEL[r] || r;
function staffBox() {
  const U = S.r.users.slice().sort((a, b) => (b.active - a.active) || a.display_name.localeCompare(b.display_name)), dis = !S.r.setup ? ' disabled' : '';
  const opts = v => S.r.roles.map(r => `<option value="${r}"${r === v ? ' selected' : ''}>${esc(ROLE(r))}</option>`).join('');
  return `${S.code ? `<div class="codebox"><span class="lab">Code for ${esc(S.code.username)} · shown once</span><div class="c">${esc(S.code.code)}</div><span class="muted">Give it to them privately. They sign in with their first name and this code.</span></div>` : ''}
    ${S.r.setup ? `<div class="addrow"><label><span class="lab">First name</span><input id="nuName" placeholder="Thea" maxlength="24"></label>
    <label><span class="lab">Role</span><select id="nuRole">${opts('staff')}</select></label><button id="nuAdd" class="pill">ADD &amp; MAKE CODE</button></div>` : ''}
    <div class="setstaff">${U.map(x => { const me = x.username === S.r.me;
      return `<div class="setp${x.active ? '' : ' off'}"><div class="setpn"><b class="cn">${esc(x.display_name)}</b> <span class="muted">(${esc(x.username)})${me ? ' · you' : ''}</span>
        <span>${!x.active ? '<span class="chip">Off</span>' : x.locked ? '<span class="chip gold">Locked</span>' : '<span class="chip">Active</span>'}</span></div>
        <div class="setpa"><select data-role="${esc(x.username)}"${me || dis ? ' disabled' : ''}>${opts(x.role)}</select>
        <button class="lnk" data-uact="settingsUserCode" data-u="${esc(x.username)}"${dis}>New code</button>
        ${x.locked ? `<button class="lnk" data-uact="settingsUserUnlock" data-u="${esc(x.username)}"${dis}>Unlock</button>` : ''}
        ${me ? '' : `<button class="lnk" data-uact="settingsUserActive" data-on="${x.active ? '' : '1'}" data-u="${esc(x.username)}"${dis}>${x.active ? 'Turn off' : 'Turn on'}</button>`}</div></div>`; }).join('')}</div>`;
}
const KEYLAB = k => { const it = item(k); if (it) return (SECS.find(s => s[0] === it.group) || [0, ''])[1] + ' · ' + (it.group === 'stages' ? 'Stage ' : '') + it.label;
  const m = k.match(/^(rate|premium)\.(.+)$/); if (m) { const R = S.r.rates, x = R.markups.concat(R.labor, R.metals).find(r => r.code === m[2]); return (x ? x.label : m[2]) + (m[1] === 'premium' ? ' · premium %' : ''); }
  const u = k.match(/^user\.([^.]+)(?:\.(\w+))?$/); if (u) return 'Staff · ' + u[1] + (u[2] ? ' · ' + ({ active: 'on / off', role: 'role', code: 'code', unlock: 'unlock' }[u[2]] || u[2]) : '');
  return k; };
function logVal(k, v) { const it = item(k); if (v === '') return it ? 'default' : '—'; if (k === 'design.parts' && window.OYPDesign) return dpText(dpParse(v)) || 'original look'; if (/^design\.font_/.test(k) && window.OYPDesign) return fName(v); if (/^design\./.test(k) && window.OYPDesign) return dsFmt(k.slice(7), v); if (it && it.type === 'types') { try { return JSON.parse(v).map(t => t.label + (t.on ? '' : ' (off)')).join(', '); } catch (e) { return v; } }
  if (/\.active$/.test(k)) return v === 'true' ? 'On' : 'Off';
  if (/\.role$/.test(k) || /^user\.[^.]+$/.test(k)) return v.replace(/(admin|production_manager|accounting|staff)/, r => ROLE(r)); return it ? show(it, v) : v; }
function logBox() {
  const L = S.r.log; if (!L.length) return '<p class="muted">No changes yet.</p>';
  return `<div class="setlog">${L.map(l => `<div class="setli"><span class="lab">${esc(when(l.at))} · ${esc(l.by)}</span><b>${esc(KEYLAB(l.key))}</b>
    <span>${esc(logVal(l.key, l.old_value))} → ${esc(logVal(l.key, l.new_value))}${l.note && !/^back to default/.test(l.note) ? ` <span class="muted">· ${esc(l.note)}</span>` : ''}</span></div>`).join('')}</div>`;
}

/* ---------- events ---------- */
function mark() { const b = $('setSave'), n = Object.keys(S.dirty).length + document.querySelectorAll('.set [data-rate].chg,.set [data-prem].chg').length + (S.typesDirty ? 1 : 0);
  if (b) b.disabled = !n || S.busy; const m = $('setMsg'); if (m && !S.busy) m.textContent = n ? n + ' change' + (n > 1 ? 's' : '') + ' not saved yet' : ''; }
function wire(main) {
  const { call, toast } = window.OYP;
  main.querySelectorAll('[data-k]').forEach(el => { const on = () => { const it = item(el.dataset.k), v = el.type === 'checkbox' ? String(el.checked) : el.value.trim();
    if (v === eff(it)) delete S.dirty[it.key]; else S.dirty[it.key] = v;
    if (el.type === 'checkbox') el.nextElementSibling.textContent = el.checked ? 'On' : 'Off'; mark(); }; el.oninput = on; el.onchange = on; });
  main.querySelectorAll('[data-days]').forEach(box => box.querySelectorAll('.dchip').forEach(b => b.onclick = () => { b.classList.toggle('on');
    const it = item(box.dataset.days), v = [...box.querySelectorAll('.dchip.on')].map(x => x.dataset.d).map(Number).sort().join(',');
    if (v === eff(it)) delete S.dirty[it.key]; else S.dirty[it.key] = v; mark(); }));
  main.querySelectorAll('[data-rate],[data-prem]').forEach(el => el.oninput = () => { el.classList.toggle('chg', el.value.trim() !== el.dataset.seen); mark(); });
  main.querySelectorAll('[data-ti]').forEach(el => el.onchange = el.oninput = () => { const t = S.types[el.dataset.ti], f = el.dataset.tf;
    t[f] = f === 'on' ? el.checked : f === 'min' ? Number(el.value) : el.value; S.typesDirty = true;
    if (f === 'on') { el.nextElementSibling.textContent = el.checked ? 'On' : 'Off'; el.closest('tr').classList.toggle('muted', !el.checked); } mark(); });
  if ($('tAdd')) $('tAdd').onclick = () => { S.types.push({ code: '', label: '', min: 60, on: true }); S.typesDirty = true; draw(main); const L = main.querySelectorAll('[data-tf="label"]'); L[L.length - 1].focus(); mark(); };
  main.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { const it = item(b.dataset.reset);
    if (!confirm('Set "' + it.label + '" back to the default?')) return;
    const r = await call('settingsReset', { key: it.key }); if (!r.ok) return toast(r.error); toast('Back to default'); S.types = null; S.typesDirty = false; reload(main); });
  if ($('setSave')) $('setSave').onclick = () => save(main);
  // staff
  if ($('nuAdd')) $('nuAdd').onclick = async () => { const name = $('nuName').value.trim(); if (!name) return $('nuName').focus();
    const r = await call('settingsUserAdd', { username: name, display_name: name, role: $('nuRole').value }); if (!r.ok) return toast(r.error);
    S.code = { username: r.username, code: r.code }; reload(main); };
  main.querySelectorAll('[data-role]').forEach(sel => sel.onchange = async () => { const un = sel.dataset.role, x = S.r.users.find(u => u.username === un);
    if (!confirm('Make ' + x.display_name + ' ' + ROLE(sel.value) + '? They are signed out on every device and see the new menu next time.')) { sel.value = x.role; return; }
    const r = await call('settingsUserRole', { username: un, role: sel.value }); if (!r.ok) { sel.value = x.role; return toast(r.error); } toast('Role changed'); reload(main); });
  main.querySelectorAll('[data-uact]').forEach(b => b.onclick = async () => { const a = b.dataset.uact, un = b.dataset.u;
    if (a === 'settingsUserCode' && !confirm('Make a new code for ' + un + '? Their old code stops working and their phones are signed out.')) return;
    if (a === 'settingsUserActive' && !b.dataset.on && !confirm('Turn off ' + un + '? They are signed out and cannot sign in until you turn them on again. Nothing is deleted.')) return;
    const r = await call(a, { username: un, active: !!b.dataset.on }); if (!r.ok) return toast(r.error);
    S.code = r.code ? { username: r.username, code: r.code } : null; reload(main); });
  if (!sec() || sec() !== 'staff') S.code = null;
  if (sec() === 'design') dsWire(main);
  mark();
}
async function save(main) {
  const { call, toast } = window.OYP; S.busy = true; mark(); $('setMsg').textContent = 'Saving…';
  const fail = e => { S.busy = false; mark(); $('setMsg').textContent = ''; toast(e); };
  for (const el of main.querySelectorAll('[data-rate].chg')) { const r = await call('settingsRate', { rate_id: el.dataset.rate, rate: el.value.trim(), seen: el.dataset.seen }); if (!r.ok) return fail(r.error); }
  for (const el of main.querySelectorAll('[data-prem].chg')) { const r = await call('settingsPremium', { code: el.dataset.prem, pct: el.value.trim() }); if (!r.ok) return fail(r.error); }
  const values = Object.assign({}, S.dirty), seen = {};
  if (S.typesDirty) values['appt.types'] = JSON.stringify(S.types);
  Object.keys(values).forEach(k => { seen[k] = item(k).changed_at || ''; });
  if (Object.keys(values).length) { const r = await call('settingsSave', { values, seen }); if (!r.ok) return fail(r.error); }
  S.busy = false; S.types = null; S.typesDirty = false; toast('Saved'); reload(main);
}
window.addEventListener('hashchange', () => { S.types = null; S.typesDirty = false; if ((S.ds || S.dp || S.df) && sec() !== 'design') { S.ds = null; S.dp = null; S.df = null; if (window.OYPDesign) window.OYPDesign.restore(); } }); // leaving Design unsaved: back to the saved look
window.OYPSettings = { render };
})();
