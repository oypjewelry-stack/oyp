/* OYP back office: Appointments (#/appts). Store visits on the Google Calendar "Appointments".
   Server: Appointments.gs (apptList, apptClients, apptSave, apptCancel). The server checks every rule (store hours Mon-Fri 9 AM-4 PM Manila:
   other times / weekends need a confirm; 1 h default; same staff + same type overlap needs a confirm; client email / mobile); this page draws and asks.
   Weekend columns and early / late hours show only when a visit is booked there.
   Views: month / week / day. Desktop opens on the week, phone on the day (a list). */
(() => {
'use strict';
const PASTE_NOTE = 'This page needs the Appointments paste in Apps Script (see the instructions).';
const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let ALLT = [['fitting', 'Fitting'], ['pickup', 'Pickup'], ['appraisal', 'Appraisal'], ['repair', 'Repair']], TYPES = ALLT; // the server's list (Settings) replaces these
const tLab = t => (ALLT.find(x => x[0] === t) || [t, t])[1];
const pad = n => String(n).padStart(2, '0');
const hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
const clock = (m, short) => { let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return short && !mm ? h + ' ' + ap : h + ':' + pad(mm) + (short ? '' : ' ' + ap); };
const clockAP = m => clock(m).replace(' ', '\u202f');
const dur = m => m % 60 ? (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min' : (m / 60) + ' h';
const addD = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = day => new Date(day + 'T00:00:00Z').getUTCDay();
const todayPH = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);
const nowMinPH = () => { const d = new Date(Date.now() + 8 * 36e5); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const openDay = day => { while (dow(day) === 0 || dow(day) === 6) day = addD(day, 1); return day; }; // weekends -> Monday
const monday = day => addD(day, -((dow(day) + 6) % 7));
const dLab = (day, long) => DN[dow(day)] + (long ? ', ' : ' ') + MN[Number(day.slice(5, 7)) - 1] + ' ' + Number(day.slice(8)) + (long && day.slice(0, 4) !== todayPH().slice(0, 4) ? ', ' + day.slice(0, 4) : '');
const narrow = () => innerWidth < 760;
const $ = id => document.getElementById(id);
const isWe = day => S.r && S.r.hours && S.r.hours.days ? !S.r.hours.days.includes(dow(day)) : dow(day) === 0 || dow(day) === 6; // closed weekday (Settings: open days)
const DN3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const daysTxt = h => { const d = (h && h.days || [1, 2, 3, 4, 5]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); return d.join() === '1,2,3,4,5' ? 'Mon–Fri' : d.map(x => DN3[x]).join(', '); };
const hrsTxt = h => daysTxt(h) + ' · ' + clock(h.open, true) + '–' + clock(h.close, true);
const hol = day => (S.r && S.r.holidays || []).find(x => x.day === day) || null; // {name, status: pending / closed / open}
const shut = day => isWe(day) || (hol(day) && hol(day).status === 'closed'); // closed day: weekend or store holiday
const holAsk = day => !!hol(day) && hol(day).status !== 'open'; // closed or not decided: booking needs the confirm
const offHrs = (a, h) => isWe(a.day) || holAsk(a.day) || a.start_min < h.open || a.start_min + a.minutes > h.close; // outside store hours (booked after a confirm)
let G = { open: 540, close: 960 }; // the hours the grid shows: store hours, stretched to fit visits booked outside them
const S = { view: null, day: null, staff: '', r: null, key: '', open: null, form: null, back: null, busy: false };
let U = null;

function range() {
  if (S.view === 'day') return [S.day, S.day];
  if (S.view === 'week') return [monday(S.day), addD(monday(S.day), 6)];
  const first = S.day.slice(0, 8) + '01', last = addD(addD(first, 32).slice(0, 8) + '01', -1);
  return [monday(first), addD(monday(last), 6)];
}
async function load(force) {
  const [from, to] = range(), key = from + to;
  if (!force && S.r && S.key === key) return S.r;
  const r = await window.OYP.call('apptList', { from, to }); if (r && r.ok) { S.r = r; S.key = key; if (r.types && r.types.length) { ALLT = r.types; TYPES = ALLT.filter(t => !(r.types_off || {})[t[0]]); } } return r;
}
async function render(main, u) {
  const { esc } = window.OYP, live = window.OYP.here(); U = u;
  if (!S.view) S.view = localStorage.getItem('oypApptView' + (narrow() ? 'P' : 'D')) || (narrow() ? 'day' : 'week');
  if (!S.day) S.day = openDay(todayPH());
  S.open = null; S.form = null;
  if (!S.r) main.innerHTML = '<h2>Appointments</h2><p class="muted">Loading…</p>';
  const r = await load(); if (!live()) return;
  if (!r || !r.ok) { main.innerHTML = `<h2>Appointments</h2><p class="muted">${esc(!r || r.error === 'Unknown action' ? PASTE_NOTE : r.error || 'Could not load')}</p>`; return; }
  draw(main);
}
async function reload(main, force) { const live = window.OYP.here(); const r = await load(force); if (!live()) return; if (r && r.ok) draw(main); else window.OYP.toast((r && r.error) || 'Could not load'); }

/* ---------- page ---------- */
function draw(main) {
  const { esc } = window.OYP, r = S.r, sel = S.staff;
  const list = r.appts.filter(a => !sel || a.staff === sel);
  const lab = S.view === 'day' ? dLab(S.day, true) + (S.day === todayPH() ? ' · Today' : '')
    : S.view === 'week' ? (() => { const sh = shown(monday(S.day)), a = sh[0], b = sh[sh.length - 1]; return MN[Number(a.slice(5, 7)) - 1] + ' ' + Number(a.slice(8)) + ' – ' + (a.slice(5, 7) === b.slice(5, 7) ? '' : MN[Number(b.slice(5, 7)) - 1] + ' ') + Number(b.slice(8)) + ', ' + b.slice(0, 4); })()
    : MONTHS[Number(S.day.slice(5, 7)) - 1] + ' ' + S.day.slice(0, 4);
  const staffChips = `<div class="rvchips apstaff"><button class="fchip ${!sel ? 'on' : ''}" data-st="">All staff</button>${r.staff.map(s => `<button class="fchip ${sel === s.username ? 'on' : ''}" data-st="${esc(s.username)}">${esc(s.name)}</button>`).join('')}</div>`;
  const [f0, t0] = range(); span(list.filter(a => a.day >= f0 && a.day <= t0 && (S.view !== 'day' || a.day === S.day)));
  const body = S.view === 'month' ? monthView(list) : S.view === 'week' ? (narrow() ? weekList(list) : weekGrid(list)) : (narrow() ? dayList(list) : dayGrid(list));
  main.innerHTML = `<div class="ap">
    ${S.back ? `<button class="lnk dback apback" id="apBack">‹ BACK</button>` : ''}
    <div class="dhead aphead"><h2>Appointments</h2>${r.setup ? '<button class="pill sm" id="apNew">+ NEW</button>' : ''}</div>
    ${r.setup ? '' : '<div class="apwarn">Almost ready: run <b>setupAppointments</b> once in Apps Script (see the instructions). Until then nothing can be booked.</div>'}
    <div class="aptools"><div class="seg apseg">${['day', 'week', 'month'].map(v => `<button class="${S.view === v ? 'on' : ''}" data-v="${v}">${v.toUpperCase()}</button>`).join('')}</div>
      <div class="apnav"><button class="apar" data-go="-1" aria-label="Previous">‹</button><b class="aplab">${esc(lab)}</b><button class="apar" data-go="1" aria-label="Next">›</button>
      <button class="lnk aptoday" data-go="0">Today</button></div></div>
    ${staffChips}
    <div class="aplegend">${TYPES.map(([k, l]) => `<span><i class="apdot t-${k}"></i>${l}</span>`).join('')}<span class="muted">Store hours ${hrsTxt(S.r.hours)}</span></div>
    ${body}
  </div>${S.open ? sheet(S.open) : ''}${S.form ? formSheet() : ''}`;
  wire(main);
}
function wire(main) {
  const r = S.r;
  main.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; S.back = null; localStorage.setItem('oypApptView' + (narrow() ? 'P' : 'D'), S.view); reload(main); });
  main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const n = Number(b.dataset.go); S.back = null;
    if (!n) S.day = openDay(todayPH());
    else if (S.view === 'day') { let d = addD(S.day, n); while (dow(d) === 0 || dow(d) === 6) d = addD(d, n); S.day = d; }
    else if (S.view === 'week') S.day = addD(monday(S.day), 7 * n);
    else { const [y, m] = S.day.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + n, 1)); S.day = openDay(d.toISOString().slice(0, 10)); }
    reload(main);
  });
  main.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { S.staff = b.dataset.st; draw(main); });
  main.querySelectorAll('[data-day]').forEach(b => b.onclick = e => { if (e.target.closest('[data-ap]')) return; S.back = { view: S.view, day: S.day }; S.view = 'day'; S.day = b.dataset.day; reload(main); });
  main.querySelectorAll('[data-ap]').forEach(b => b.onclick = e => { e.stopPropagation(); S.open = r.appts.find(a => a.appt_id === b.dataset.ap); S.form = null; draw(main); });
  main.querySelectorAll('[data-slot]').forEach(b => b.onclick = e => {
    if (e.target.closest('[data-ap]') || !r.setup) return;
    const [day, st] = b.dataset.slot.split('|'); let start;
    if (b.dataset.y) { const box = b.getBoundingClientRect(), y = e.clientY - box.top; start = G.open + Math.floor(y / box.height * (G.close - G.open) / 30) * 30; }
    else start = Number(b.dataset.min);
    newForm({ day, start: Math.max(r.hours.earliest || 420, Math.min(start, (r.hours.latest || 1080) - 60)), staff: st || '' }); draw(main);
  });
  const nb = $('apNew'); if (nb) nb.onclick = () => { newForm({ day: S.view === 'day' ? S.day : openDay(S.day < todayPH() ? todayPH() : S.day) }); draw(main); };
  const bk = $('apBack'); if (bk) bk.onclick = () => { S.view = S.back.view; S.day = S.back.day; S.back = null; reload(main); };
  if (S.open) wireSheet(main);
  if (S.form) wireForm(main);
}

/* ---------- views ---------- */
function shown(mon) { const a = S.r.appts; return [0, 1, 2, 3, 4, 5, 6].map(n => addD(mon, n)).filter(d => !isWe(d) || a.some(x => x.day === d)); } // Sat / Sun only when booked
function span(list) {
  const h = S.r.hours; let o = h.open, c = h.close;
  list.forEach(a => { o = Math.min(o, Math.floor(a.start_min / 60) * 60); c = Math.max(c, Math.ceil((a.start_min + a.minutes) / 60) * 60); });
  G = { open: o, close: c };
}
const PX = 66; // desktop: px per hour
function lanes(list) { // side-by-side when visits overlap in one column
  const L = list.slice().sort((a, b) => a.start_min - b.start_min || b.minutes - a.minutes), out = [];
  let grp = [], end = -1;
  const flush = () => { const ends = []; grp.forEach(a => { let i = ends.findIndex(e => e <= a.start_min); if (i < 0) { i = ends.length; ends.push(0); } ends[i] = a.start_min + a.minutes; a._lane = i; }); grp.forEach(a => { a._lanes = ends.length; out.push(a); }); grp = []; };
  L.forEach(a => { if (a.start_min >= end && grp.length) { flush(); end = -1; } grp.push(a); end = Math.max(end, a.start_min + a.minutes); }); if (grp.length) flush();
  return out;
}
function block(a) {
  const { esc } = window.OYP, h = G, top = (a.start_min - h.open) / 60 * PX, ht = Math.max(a.minutes / 60 * PX - 3, 20), w = 100 / (a._lanes || 1);
  const small = a.minutes < 60;
  return `<button class="apblk t-${a.type} ${a.status === 'cancelled' ? 'cx' : ''} ${small ? 'sm' : ''}" data-ap="${esc(a.appt_id)}" style="top:${top}px;height:${ht}px;left:calc(${w * (a._lane || 0)}% + 2px);width:calc(${w}% - 4px)">
    <span class="apt">${clock(a.start_min, true)}–${clock(a.start_min + a.minutes, true)}${a.status === 'cancelled' ? ' · CANCELLED' : ''}</span>
    <b>${esc(a.client_name)}</b>${small ? '' : `<span class="aps">${esc(tLab(a.type))} · ${esc(a.staff_name)}${a.jo ? ' · ' + esc(a.jo) : ''}</span>`}</button>`;
}
function hoursCol() {
  const h = G; let s = '';
  for (let m = h.open; m <= h.close; m += 60) s += `<span style="top:${(m - h.open) / 60 * PX}px">${clock(m, true)}</span>`;
  return `<div class="aphrs" style="height:${(h.close - h.open) / 60 * PX}px">${s}</div>`;
}
function nowLine(day) {
  const h = G, m = nowMinPH();
  return day === todayPH() && m >= h.open && m <= h.close ? `<i class="apnow" style="top:${(m - h.open) / 60 * PX}px"></i>` : '';
}
function weekGrid(list) {
  const { esc } = window.OYP, h = G, mon = monday(S.day), days = shown(mon), H = (h.close - h.open) / 60 * PX;
  return `<div class="apgrid wk" style="--n:${days.length}"><div class="aphd"><span></span>${days.map(d => `<button class="apdh ${d === todayPH() ? 'today' : ''} ${isWe(d) || holAsk(d) ? 'we' : ''}" data-day="${d}"><span class="lab">${DN[dow(d)]}${isWe(d) ? ' · closed' : ''}</span>${hol(d) ? `<span class="aphol ${hol(d).status}">${esc(hol(d).name)} · ${hol(d).status === 'pending' ? 'not decided' : hol(d).status}</span>` : ''}<b>${Number(d.slice(8))}</b><small>${list.filter(a => a.day === d && a.status !== 'cancelled').length || ''}</small></button>`).join('')}</div>
    <div class="apbody">${hoursCol()}${days.map(d => `<div class="apcol ${d < todayPH() ? 'past' : ''}" data-slot="${d}|" data-y="1" style="height:${H}px">${lines(d)}${lanes(list.filter(a => a.day === d)).map(block).join('')}${nowLine(d)}</div>`).join('')}</div></div>
    <p class="muted apnote">Tap an empty time to book it. Tap a visit to see, move or cancel it. Changes made in Google Calendar show here within 5 minutes.</p>`;
}
function lines(day) { // half-hour lines; outside store hours shaded
  const h = G, st = S.r.hours, y = m => (m - h.open) / 60 * PX; let s = '';
  for (let m = h.open + 30; m < h.close; m += 30) s += `<i class="apln ${m % 60 ? 'half' : ''}" style="top:${y(m)}px"></i>`;
  const off = (a, b) => b > a ? `<i class="apoff" style="top:${y(a)}px;height:${y(b) - y(a)}px"></i>` : '';
  return s + (isWe(day) || holAsk(day) ? off(h.open, h.close) : off(h.open, st.open) + off(st.close, h.close));
}
function dayGrid(list) {
  const { esc } = window.OYP, h = G, H = (h.close - h.open) / 60 * PX, d = S.day;
  const staff = S.staff ? S.r.staff.filter(s => s.username === S.staff) : S.r.staff.filter(s => list.some(a => a.day === d && a.staff === s.username)).concat(S.r.staff.filter(s => !list.some(a => a.day === d && a.staff === s.username)));
  const gone = [...new Set(list.filter(a => a.day === d && !S.r.staff.some(s => s.username === a.staff)).map(a => a.staff))];
  const cols = staff.map(s => [s.username, s.name]).concat(gone.map(x => [x, x ? x + ' (off)' : 'Unassigned']));
  return `<div class="apgrid dy" style="--n:${cols.length}"><div class="aphd"><span></span>${cols.map(([k, n]) => `<div class="apdh st"><b>${esc(n)}</b><small>${list.filter(a => a.day === d && a.staff === k && a.status !== 'cancelled').length || ''}</small></div>`).join('')}</div>
    <div class="apbody">${hoursCol()}${cols.map(([k]) => `<div class="apcol ${d < todayPH() ? 'past' : ''}" data-slot="${d}|${esc(k)}" data-y="1" style="height:${H}px">${lines(d)}${lanes(list.filter(a => a.day === d && a.staff === k)).map(block).join('')}${nowLine(d)}</div>`).join('')}</div></div>
    <p class="muted apnote">One column per staff member. Tap an empty time to book it for them.</p>`;
}
function card(a) {
  const { esc } = window.OYP;
  return `<button class="apcard t-${a.type} ${a.status === 'cancelled' ? 'cx' : ''}" data-ap="${esc(a.appt_id)}"><span class="apct">${clock(a.start_min)}<small>${dur(a.minutes)}</small></span>
    <span class="apcb"><b>${esc(a.client_name)}</b><span class="aps">${esc(tLab(a.type))} · ${esc(a.staff_name)}${a.jo ? ' · JO ' + esc(a.jo) : ''}</span>
    ${offHrs(a, S.r.hours) ? '<span class="apinv off">Outside store hours</span>' : ''}${a.status === 'cancelled' ? '<span class="chip">Cancelled</span>' : a.invite === 'sent' ? '<span class="apinv">Invite sent</span>' : '<span class="apinv no">No invite · mobile only</span>'}</span><span class="chev">›</span></button>`;
}
function dayList(list) { // phone: the day as a list with the free hours in between
  const h = S.r.hours, d = S.day, L = list.filter(a => a.day === d).sort((a, b) => a.start_min - b.start_min), out = [];
  let t = h.open; const past = d < todayPH() || (d === todayPH());
  const free = (a, b) => { for (let m = a; m + 60 <= b; m += 60) { if (d === todayPH() && m < nowMinPH()) continue; if (d < todayPH()) continue; out.push(`<button class="apfree" data-slot="${d}|" data-min="${m}"><span>${clock(m)}</span><b>+ Free · book</b></button>`); } };
  if (!shut(d)) { L.filter(a => a.status !== 'cancelled').forEach(a => { free(Math.min(t, h.close), Math.min(a.start_min, h.close)); t = Math.max(t, a.start_min + a.minutes); }); free(Math.min(t, h.close), h.close); }
  const items = L.map(a => [a.start_min, card(a)]).concat(out.map(x => [Number((x.match(/data-min="(\d+)"/) || [])[1]), x])).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  return `<div class="aplist">${isWe(d) ? `<p class="muted apempty">${dow(d) === 0 || dow(d) === 6 ? 'Weekend' : 'Closed day'}: the store is closed. Visits booked anyway are listed here.</p>` : hol(d) ? `<p class="muted apempty aphold">Holiday: ${window.OYP.esc(hol(d).name)} · ${hol(d).status === 'closed' ? 'store closed' : hol(d).status === 'open' ? 'store open' : 'not decided yet (bookings need a confirm)'}</p>` : ''}${L.length ? '' : '<p class="muted apempty">Nothing booked yet.</p>'}${items.join('')}</div>${past && !L.length && d < todayPH() ? '' : ''}`;
}
function weekList(list) { // phone week: a list per day
  const mon = monday(S.day);
  return shown(mon).map(d => { const L = list.filter(a => a.day === d).sort((a, b) => a.start_min - b.start_min);
    return `<div class="apwd"><button class="dgrp apdg" data-day="${d}"><b class="cn">${dLab(d)}${d === todayPH() ? ' · Today' : ''}</b><span class="kn">${L.filter(a => a.status !== 'cancelled').length || 'Free'} ›</span></button>${L.map(card).join('')}</div>`; }).join('');
}
function monthView(list) {
  const { esc } = window.OYP, [from, to] = range(), m = S.day.slice(0, 7), weeks = [];
  for (let w = from; w <= to; w = addD(w, 7)) weeks.push(w);
  const n = narrow(), K = list.some(a => a.day >= from && a.day <= to && isWe(a.day) && a.status !== 'cancelled') ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  return `<div class="apmonth ${n ? 'ph' : ''}" style="--n:${K.length}"><div class="apmh">${K.map(k => `<span class="lab">${DN[(k + 1) % 7]}</span>`).join('')}</div>
    ${weeks.map(w => `<div class="apmw">${K.map(k => { const d = addD(w, k), L = list.filter(a => a.day === d && a.status !== 'cancelled').sort((a, b) => a.start_min - b.start_min);
      return `<button class="apmd ${isWe(d) || holAsk(d) ? 'we' : ''} ${d.slice(0, 7) !== m ? 'out' : ''} ${d === todayPH() ? 'today' : ''} ${d < todayPH() ? 'past' : ''}" data-day="${d}"><span class="apmn">${Number(d.slice(8))}</span>${hol(d) ? `<span class="aphol ${hol(d).status}">${n ? '●' : esc(hol(d).name) + (hol(d).status === 'closed' ? ' · closed' : hol(d).status === 'open' ? ' · open' : ' · not decided')}</span>` : ''}
        ${n ? `<span class="apmdots">${L.slice(0, 6).map(a => `<i class="apdot t-${a.type}"></i>`).join('')}</span>${L.length ? `<small>${L.length}</small>` : ''}`
          : L.slice(0, 3).map(a => `<span class="apmi"><i class="apdot t-${a.type}"></i>${clock(a.start_min, true)} ${esc(a.client_name.split(' ')[0])}</span>`).join('') + (L.length > 3 ? `<span class="apmore">+${L.length - 3} more</span>` : '')}</button>`; }).join('')}</div>`).join('')}
  </div><p class="muted apnote">${K.length === 7 ? 'Sat / Sun are shown because a visit is booked on a weekend.' : 'Weekends are closed, so only Monday to Friday are shown.'} Tap a day to open it.</p>`;
}

/* ---------- one visit ---------- */
function sheet(a) {
  const { esc } = window.OYP, can = a.status !== 'cancelled' && S.r.setup;
  return `<div class="ivsheet" id="apSheet"><div class="ivsbox apsbox"><button class="lnk dback" id="apSX">‹ BACK</button>
    <div class="apsh t-${a.type}"><span class="chip">${esc(tLab(a.type))}</span>${offHrs(a, S.r.hours) ? ' <span class="chip gold">Outside store hours</span>' : ''}${a.status === 'cancelled' ? ' <span class="chip">Cancelled</span>' : ''}${a.source === 'telegram' ? ' <span class="chip">Telegram</span>' : ''}${a.source === 'calendar' ? ' <span class="chip">Added in Google Calendar</span>' : a.updated_by === 'calendar' ? ' <span class="chip">Changed in Google Calendar</span>' : ''}${!a.staff ? ' <span class="chip red">No staff: pick one</span>' : ''}
    <h3>${esc(a.client_name)}</h3><p class="apwhen">${dLab(a.day, true)} · ${clock(a.start_min)}–${clock(a.start_min + a.minutes)} <span class="muted">(${dur(a.minutes)})</span></p></div>
    <div class="ivfs"><div class="ivf"><span class="lab">Staff</span><b>${esc(a.staff_name)}</b></div><div class="ivf"><span class="lab">JO</span><b>${esc(a.jo) || '—'}</b></div>
    <div class="ivf"><span class="lab">Mobile</span><b>${esc(a.client_phone) || '—'}</b></div><div class="ivf"><span class="lab">Email</span><b class="apem">${esc(a.client_email) || '—'}</b></div></div>
    <p class="apinvl">${a.invite === 'sent' ? '✓ Google Calendar invite emailed to the client.' : 'No calendar invite: the client has no email on file (mobile only).'}</p>
    ${a.notes ? `<div class="apnotes"><span class="lab">Notes · staff only</span><p>${esc(a.notes)}</p></div>` : ''}
    ${a.status === 'cancelled' ? `<p class="muted">Cancelled by ${esc(a.cancelled_by)}${a.cancel_reason ? ': ' + esc(a.cancel_reason) : ''}</p>` : ''}
    <p class="muted apby">Booked by ${esc(a.created_by)}${a.updated_by && a.updated_by !== a.created_by ? ' · last change by ' + esc(a.updated_by) : ''}</p>
    ${can ? `<div class="apacts"><button class="pill" id="apEdit">MOVE / EDIT</button><button class="pill outline" id="apCx">CANCEL VISIT</button></div>
    <div id="apCxBox" class="apcx hidden"><label class="fsec"><span class="lab">Why? (optional, staff only)</span><input id="apCxWhy" placeholder="e.g. client asked to move it"></label>
      <p class="muted">${a.invite === 'sent' ? (S.r.notify_changes ? 'The client gets a cancellation email from Google Calendar.' : 'The client is not emailed about this: tell them.') : 'Mobile only: text or call the client.'} The row stays in the Sheet as cancelled.</p>
      <div class="apacts"><button class="pill" id="apCxYes">YES, CANCEL IT</button><button class="lnk" id="apCxNo">Keep it</button></div></div>` : ''}
  </div></div>`;
}
function wireSheet(main) {
  const a = S.open, close = () => { S.open = null; draw(main); };
  $('apSX').onclick = close; $('apSheet').onclick = e => { if (e.target.id === 'apSheet') close(); };
  if (!$('apEdit')) return;
  $('apEdit').onclick = () => { S.form = { id: a.appt_id, base: a.updated_at, type: a.type, day: a.day, start: a.start_min, minutes: a.minutes, staff: a.staff, jo: a.jo, notes: a.notes,
    client: { client_id: a.client_id, name: a.client_name, email: a.client_email, phone: a.client_phone }, locked: true }; S.open = null; draw(main); check(main); };
  $('apCx').onclick = () => { $('apCxBox').classList.remove('hidden'); $('apCx').classList.add('hidden'); $('apCxWhy').focus(); };
  $('apCxNo').onclick = () => { $('apCxBox').classList.add('hidden'); $('apCx').classList.remove('hidden'); };
  $('apCxYes').onclick = async () => {
    const live = window.OYP.here(); $('apCxYes').disabled = true;
    const r = await window.OYP.call('apptCancel', { appt_id: a.appt_id, reason: $('apCxWhy').value, base_updated_at: a.updated_at });
    if (!r.ok) { if ($('apCxYes')) $('apCxYes').disabled = false; return window.OYP.toast(r.error); }
    window.OYP.toast(r.notified ? 'Cancelled. Google Calendar emails the client.' : a.invite === 'sent' ? 'Cancelled. The client was not emailed: tell them.' : 'Cancelled. Text or call the client.');
    if (!live()) return; S.open = null; reload(main, true);
  };
}

/* ---------- new / edit form ---------- */
function newForm(o) {
  const st = S.r.staff.some(s => s.username === (o.staff || U.username)) ? (o.staff || U.username) : '';
  let start = o.start != null ? o.start : 600;
  if (o.day === todayPH() && start <= nowMinPH()) start = Math.ceil((nowMinPH() + 1) / 30) * 30;
  S.form = { id: '', type: '', day: o.day, start: Math.min(start, (S.r.hours.latest || 1080) - 60), minutes: S.r.default_min, staff: st, jo: '', notes: '', client: null, q: '', hits: null, newc: null, warn: null, force: false };
  S.open = null;
}
function lens(type) { const min = (S.r.min_min || {})[type] || 60, out = []; for (let m = min; m <= 420; m += min < 60 ? 15 : 30) out.push(m); if (type === 'appraisal') return out; return out.filter(m => m >= 60); }
function formSheet() {
  const { esc } = window.OYP, f = S.form, h = S.r.hours, c = f.client;
  const starts = [], lo = h.earliest || 420, hi = h.latest || 1080; for (let m = lo; m < hi; m += h.step) starts.push(m);
  const L = lens(f.type || 'fitting');
  const cl = c ? `<div class="apclient"><div><b class="cn">${esc(c.name)}</b>${c.client_id ? '' : ' <span class="chip gold">New client</span>'}
      <div class="aps">${esc(c.phone || '')}${c.phone && c.email ? ' · ' : ''}${esc(c.email || '')}</div></div>${f.locked ? '' : '<button class="lnk" id="apCChange">Change</button>'}</div>
      ${c.client_id && !c.email && !f.locked ? `<div class="fgrid"><label class="fsec"><span class="lab">Email · for the invite (saved on the client)</span><input id="apCEmail" value="${esc(f.addEmail || '')}" placeholder="optional"></label>
        ${!c.phone ? `<label class="fsec"><span class="lab">Mobile (saved on the client)</span><input id="apCPhone" inputmode="tel" value="${esc(f.addPhone || '')}" placeholder="optional"></label>` : ''}</div>` : ''}
      <p class="apinvl">${c.email || f.addEmail ? '✓ Google Calendar invite will be emailed to ' + esc(c.email || f.addEmail) + '.' : 'No email: no calendar invite (mobile only).'}</p>`
    : f.newc ? `<div class="apnewc"><span class="lab">New client · added to Clients</span><div class="fgrid">
        <label class="fsec"><span class="lab">Name</span><input id="apNN" value="${esc(f.newc.name)}"></label>
        <label class="fsec"><span class="lab">Mobile</span><input id="apNP" inputmode="tel" value="${esc(f.newc.mobile)}" placeholder="0917 …"></label></div>
        <label class="fsec"><span class="lab">Email · gets the calendar invite</span><input id="apNE" value="${esc(f.newc.email)}" placeholder="name@example.com"></label>
        <p class="muted apfn">An email or a mobile is needed. Email = they get a Google Calendar invite. Mobile only = no invite.</p><button class="lnk" id="apNX">Search the client list instead</button></div>`
    : `<label class="fsec"><span class="lab">Client · search name or mobile</span><input id="apQ" value="${esc(f.q)}" placeholder="Maria or 0917…" autocomplete="off"></label>
      <div class="aphits">${f.hits ? f.hits.map((x, i) => `<button class="aphit" data-hit="${i}"><b>${esc(x.name)}</b><span class="aps">${esc(x.phone || '')}${x.phone && x.email ? ' · ' : ''}${esc(x.email || 'no email')}</span></button>`).join('')
        + (f.q.trim().length >= 2 ? `<button class="aphit new" id="apNew2"><b>+ New client${/\d/.test(f.q) ? '' : ': ' + esc(f.q.trim())}</b><span class="aps">Not in the list</span></button>` : '') : ''}</div>`;
  const w = f.warn;
  const clashL = x => `<div>${clock(x.start_min)}–${clock(x.start_min + x.minutes)} · ${esc(x.staff_name)} · ${esc(tLab(x.type))} · ${esc(x.client_name)}</div>`;
  const force = f.tried ? '<div class="apacts"><button class="pill" id="apForce">BOOK ANYWAY</button><button class="lnk" id="apChg">Change the time</button></div>' : '';
  const warn = !w ? '' : w.code === 'OUTSIDE_HOURS' ? `<div class="apclash"><b>⚠ ${esc(w.error)}</b>${w.clashes && w.clashes.length ? `<b>⚠ Same staff + same type at that time:</b>${w.clashes.map(clashL).join('')}` : ''}
      <p>You can still book it${w.clashes && w.clashes.length ? ' (one confirm covers both)' : ''}.</p>${force}</div>`
    : w.code === 'OVERLAP' ? `<div class="apclash"><b>⚠ ${esc(w.error)}</b>${w.clashes.map(x => `<div>${clock(x.start_min)}–${clock(x.start_min + x.minutes)} · ${esc(x.client_name)}</div>`).join('')}
      <p>Same staff member, same type, same time. You can still book it.</p>${f.tried ? '<div class="apacts"><button class="pill" id="apForce">BOOK ANYWAY</button><button class="lnk" id="apChg">Change the time</button></div>' : ''}</div>`
    : w.ok ? (w.others && w.others.length ? `<div class="apinfo">Also at this time: ${w.others.map(x => esc(x.staff_name) + ' · ' + esc(tLab(x.type))).join(', ')}. That is fine (other staff or other type).</div>` : '')
    : `<div class="apclash red"><b>⚠ ${esc(w.error)}</b></div>`;
  return `<div class="ivsheet" id="apFS"><div class="ivsbox apsbox apform"><button class="lnk dback" id="apFX">‹ BACK</button>
    <h3 class="apfh">${f.id ? 'Move / edit visit' : 'New appointment'}</h3>
    <div class="fsec"><span class="lab">Type</span><div class="seg aptypes">${TYPES.map(([k, l]) => `<button class="${f.type === k ? 'on' : ''}" data-ty="${k}">${l}</button>`).join('')}</div></div>
    ${cl}
    <div class="fgrid"><label class="fsec"><span class="lab">Day</span><input type="date" id="apD" value="${f.day}" min="${f.id ? '' : todayPH()}"></label>
      <label class="fsec"><span class="lab">Staff</span><select id="apS"><option value="">Pick…</option>${S.r.staff.map(s => `<option value="${esc(s.username)}" ${s.username === f.staff ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
    <div class="fgrid"><label class="fsec"><span class="lab">Start</span><select id="apT">${starts.map(m => `<option value="${m}" ${m === f.start ? 'selected' : ''}>${clock(m)}${m < h.open || m >= h.close ? ' · outside hours' : ''}</option>`).join('')}</select></label>
      <label class="fsec"><span class="lab">Length${f.type === 'appraisal' ? ' · any' : ''}</span><select id="apL">${L.map(m => `<option value="${m}" ${m === f.minutes ? 'selected' : ''}>${dur(m)}${m === 60 ? ' (usual)' : ''}</option>`).join('')}</select></label></div>
    <p class="apend">Until ${clock(f.start + f.minutes)}${offHrs({ day: f.day, start_min: f.start, minutes: f.minutes }, h) ? ` · <span class="apoffn">${isWe(f.day) ? 'weekend, ' : hol(f.day) ? esc(hol(f.day).name) + ', ' : ''}outside store hours (${hrsTxt(h)}): you will be asked to confirm</span>` : ''}${f.start + f.minutes > hi ? ` · <span class="red">past ${clock(hi)}</span>` : ''}</p>
    <div class="fgrid"><label class="fsec"><span class="lab">JO · optional</span><input id="apJ" value="${esc(f.jo)}" placeholder="26-101"></label>
      <label class="fsec"><span class="lab">Notes · staff only</span><input id="apNo" value="${esc(f.notes)}" placeholder="not in the invite"></label></div>
    <div id="apWarn">${warn}</div>
    <div class="apacts"><button class="pill" id="apSave">${f.id ? 'SAVE CHANGES' : 'BOOK'}</button><button class="lnk" id="apFX2">Cancel</button></div>
  </div></div>`;
}
let qT = null, cT = null;
function wireForm(main) {
  const f = S.form, close = () => { S.form = null; draw(main); };
  $('apFX').onclick = close; $('apFX2').onclick = close; $('apFS').onclick = e => { if (e.target.id === 'apFS') close(); };
  const keep = (fn) => { const el = document.activeElement, id = el && el.id, pos = el && el.selectionStart; fn(); draw(main); const n = id && $(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} } };
  main.querySelectorAll('[data-ty]').forEach(b => b.onclick = () => { f.type = b.dataset.ty; const L = lens(f.type); if (!L.includes(f.minutes)) f.minutes = L.includes(60) ? 60 : L[0]; draw(main); check(main); });
  const q = $('apQ'); if (q) q.oninput = () => { f.q = q.value; clearTimeout(qT); const live = window.OYP.here(), my = f;
    qT = setTimeout(async () => { if (f.q.trim().length < 2) { f.hits = null; return keep(() => {}); } const r = await window.OYP.call('apptClients', { q: f.q }); if (!live() || S.form !== my) return; f.hits = r.ok ? r.clients : []; keep(() => {}); }, 250); };
  main.querySelectorAll('[data-hit]').forEach(b => b.onclick = () => { f.client = f.hits[Number(b.dataset.hit)]; f.hits = null; draw(main); check(main); });
  const n2 = $('apNew2'); if (n2) n2.onclick = () => { const v = f.q.trim(); f.newc = /\d/.test(v) ? { name: '', mobile: v, email: '' } : /@/.test(v) ? { name: '', mobile: '', email: v } : { name: v, mobile: '', email: '' }; draw(main); };
  ['apNN', 'apNP', 'apNE'].forEach((id, i) => { const el = $(id); if (el) el.oninput = () => { f.newc[['name', 'mobile', 'email'][i]] = el.value; if (i === 2) { clearTimeout(cT); cT = setTimeout(() => keep(() => {}), 600); } }; });
  const nx = $('apNX'); if (nx) nx.onclick = () => { f.newc = null; draw(main); };
  const cc = $('apCChange'); if (cc) cc.onclick = () => { f.client = null; f.addEmail = ''; f.addPhone = ''; draw(main); };
  const ce = $('apCEmail'); if (ce) ce.oninput = () => { f.addEmail = ce.value; clearTimeout(cT); cT = setTimeout(() => keep(() => {}), 600); };
  const cp = $('apCPhone'); if (cp) cp.oninput = () => { f.addPhone = cp.value; };
  $('apD').onchange = e => { f.day = e.target.value; f.tried = false; draw(main); check(main); };
  $('apS').onchange = e => { f.staff = e.target.value; f.tried = false; draw(main); check(main); };
  $('apT').onchange = e => { f.start = Number(e.target.value); f.tried = false; draw(main); check(main); };
  $('apL').onchange = e => { f.minutes = Number(e.target.value); f.tried = false; draw(main); check(main); };
  $('apJ').oninput = e => { f.jo = e.target.value; }; $('apNo').oninput = e => { f.notes = e.target.value; };
  $('apSave').onclick = () => save(main, false);
  const fo = $('apForce'); if (fo) fo.onclick = () => save(main, true);
  const chg = $('apChg'); if (chg) chg.onclick = () => { f.tried = false; $('apT').focus(); };
}
function payload(force, dry) {
  const f = S.form, c = f.client;
  const client = f.locked ? undefined : c ? (c.client_id ? { client_id: c.client_id, email: f.addEmail || '', mobile: f.addPhone || '' } : c) : f.newc ? { name: f.newc.name, email: f.newc.email, mobile: f.newc.mobile } : null;
  return { appt_id: f.id || undefined, base_updated_at: f.base, type: f.type, staff: f.staff, day: f.day, start: hm(f.start), minutes: f.minutes, client, jo: f.jo, notes: f.notes, confirm_overlap: !!force, confirm_outside_hours: !!force, dry_run: !!dry };
}
async function check(main) { // live warning: hours + overlap, nothing saved
  const f = S.form; if (!f || !f.type || !f.staff || !f.day) return;
  const live = window.OYP.here(), my = f, p = payload(false, true);
  const r = await window.OYP.call('apptSave', p); if (!live() || S.form !== my) return;
  f.warn = r.ok || r.code === 'OVERLAP' || r.code === 'OUTSIDE_HOURS' || r.code === 'PAST' || r.code === 'TOO_SHORT' ? r : null;
  const el = $('apWarn'); if (el) { draw(main); }
}
async function save(main, force) {
  const f = S.form, { toast } = window.OYP;
  if (!f.type) return toast('Pick the type: Fitting, Pickup, Appraisal or Repair');
  if (!f.client && !f.newc && !f.locked) return toast('Pick the client (search the name or mobile)');
  if (f.newc && !f.newc.name.trim()) return toast('Type the new client’s name');
  if (f.newc && !f.newc.email.trim() && !f.newc.mobile.trim()) return toast('New client: add their email or mobile');
  if (!f.staff) return toast('Pick the staff member');
  if (f.start + f.minutes > (S.r.hours.latest || 1080)) return toast('That runs past ' + clock(S.r.hours.latest || 1080) + '. Pick an earlier start or a shorter length.');
  if (S.busy) return; S.busy = true; const live = window.OYP.here(); const b = $('apSave'); if (b) b.disabled = true;
  const r = await window.OYP.call('apptSave', payload(force, false)); S.busy = false;
  if (!live() || S.form !== f) return;
  if (!r.ok) { if (r.code === 'OVERLAP' || r.code === 'OUTSIDE_HOURS') { f.warn = r; f.tried = true; draw(main); const el = $('apWarn'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); return; }
    if (b) b.disabled = false; f.warn = { error: r.error }; draw(main); return toast(r.error); }
  const a = r.appt;
  toast((f.id ? 'Saved' : 'Booked') + ': ' + tLab(a.type) + ' · ' + a.client_name + ', ' + dLab(a.day) + ' ' + clock(a.start_min) + (r.invite === 'sent' ? (f.id ? (r.notified ? ' · client emailed' : ' · client not emailed, tell them') : ' · invite emailed') : ' · no invite (mobile only)'));
  S.form = null; S.day = a.day; reload(main, true);
}

window.OYPAppts = { render };
})();
