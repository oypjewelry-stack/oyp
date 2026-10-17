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
  ['log', 'Change history', 'Who changed what, and when']];
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
  if (!S.r) main.innerHTML = '<h2>Settings</h2><p class="muted">Loading…</p>';
  const r = await window.OYP.call('settingsGet'); if (!live()) return;
  if (!r || !r.ok) { main.innerHTML = `<h2>Settings</h2><p class="muted">${esc(!r || r.error === 'Unknown action' ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return; }
  S.r = r; S.dirty = {}; draw(main);
}
async function reload(main) { const live = window.OYP.here(); const r = await window.OYP.call('settingsGet'); if (!live()) return; if (r && r.ok) { S.r = r; S.dirty = {}; draw(main); } }
function draw(main) {
  const s = sec(), ok = SECS.find(x => x[0] === s);
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
  if (k === 'log') { const l = S.r.log[0]; return l ? 'Last: ' + when(l.at) + ' by ' + l.by : 'No changes yet'; }
  return '';
}
function landing() {
  return `<h2>Settings</h2><p class="muted">Change the shop's numbers here. Every change is saved with your name in the Change history. Empty fields use the default.</p>
    <div class="setgrid">${SECS.map(([k, t, d]) => `<a class="setcard tap" href="#/settings/${k}"><span class="lab">${esc(t)}</span><b>${esc(summary(k))}</b><span class="muted">${esc(d)}</span><span class="chev">›</span></a>`).join('')}</div>`;
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
  if (s === 'log') return head(t[1], 'The newest 40 changes. The full list is in the SettingsLog tab of the Sheet.') + logBox();
  return '';
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
function logVal(k, v) { const it = item(k); if (v === '') return it ? 'default' : '—'; if (it && it.type === 'types') { try { return JSON.parse(v).map(t => t.label + (t.on ? '' : ' (off)')).join(', '); } catch (e) { return v; } }
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
window.addEventListener('hashchange', () => { S.types = null; S.typesDirty = false; });
window.OYPSettings = { render };
})();
