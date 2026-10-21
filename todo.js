/* OYP back office: manual to-dos on the dashboard card and the To do page (#/todo).
   The chip is the same in both places: Mine, or From the person who assigned it, plus the due date. */
(function (root) {
'use strict';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AREAS = [['all', 'All'], ['appt', 'Appointments'], ['prod', 'Production'], ['pay', 'Payments'], ['quote', 'Quotes'], ['cons', 'Consignment'], ['stock', 'Stock & rate'], ['msg', 'Messages'], ['shop', 'Shop'], ['rev', 'To review']];
const SCOPES = [['mine', 'Mine'], ['everyone', 'Everyone'], ['overdue', 'Overdue'], ['done', 'Done']];
const BUCKET = { today: 'Today', week: 'This week', idea: 'Suggestions' };
const RANK = { today: 0, week: 1, idea: 2 };

function addD(day, n) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow(day) { return new Date(day + 'T00:00:00Z').getUTCDay(); }
function monday(day) { return addD(day, -((dow(day) + 6) % 7)); }
function today() { return new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10); }
function meOf(user) { return user && String(user.username || '').trim().toLowerCase(); }
function dueBit(due, day) {
  if (!due) return '';
  const mon = monday(day), sun = addD(mon, 6);
  if (due >= mon && due <= sun) return DOW[dow(due)];
  return MONS[Number(due.slice(5, 7)) - 1] + ' ' + Number(due.slice(8, 10));
}
function chipLabel(it, user, day) {
  if (!it || !it.manual) return ((it && it.flag) ? it.flag + ' · ' : '') + ((it && it.tag) || '');
  const mine = meOf(user) && String(it.created_by || '').trim().toLowerCase() === meOf(user);
  let label = mine ? 'Mine' : ('From ' + (it.created_name || it.created_by || 'someone'));
  if (it.due) label += ' · ' + dueBit(it.due, day || today());
  return label;
}
function isMine(it, user) {
  if (!it || !it.manual) return false;
  const me = meOf(user);
  if (!me) return false;
  if (String(it.created_by || '').trim().toLowerCase() === me) return true;
  const a = String(it.assignee || '').trim().toLowerCase();
  return !!a && a !== 'everyone' && a !== 'all' && a === me;
}
function visible(it, user) {
  if (!it || !it.manual) return true;
  if (user && user.role === 'admin') return true;
  const me = meOf(user);
  if (me && String(it.created_by || '').trim().toLowerCase() === me) return true;
  const a = String(it.assignee || '').trim().toLowerCase();
  if (!a || a === 'everyone' || a === 'all') return true;
  return a === me;
}
function bucketOf(due, day) {
  day = day || today();
  if (!due) return { bucket: 'week', late: 0 };
  if (due < day) return { bucket: 'today', late: 1 };
  if (due === day) return { bucket: 'today', late: 0 };
  return { bucket: 'week', late: 0 };
}
function compare(a, b) {
  const ra = RANK[a.bucket] == null ? 9 : RANK[a.bucket], rb = RANK[b.bucket] == null ? 9 : RANK[b.bucket];
  return (ra - rb) || ((b.late || 0) - (a.late || 0)) || String(a.due || '9999-99-99').localeCompare(String(b.due || '9999-99-99')) || String(a.text).localeCompare(String(b.text));
}
function fresh(user, fields) {
  const day = today(), b = bucketOf(fields.due || '', day);
  return {
    id: fields.id, manual: 1, area: 'manual', text: fields.text, due: fields.due || '', assignee: fields.assignee || '',
    created_by: user && user.username || '', created_name: (user && (user.display_name || user.username)) || '',
    bucket: b.bucket, late: b.late, sug: 0, status: 'open', tag: '', flag: '', href: '#/todo', jo: '', open: ''
  };
}
function mark(esc, text) { return esc(text || '').replace(/(\d{2}-\d{3,}|CS-[\w-]+)/g, '<span style="white-space:nowrap">$1</span>'); }
function whoOpts(esc, people, value) {
  const list = people || [];
  let html = '<option value="">Everyone</option>';
  if (value && !list.some(p => p.username === value)) html += `<option value="${esc(value)}" selected>${esc(value)}</option>`;
  list.forEach(p => { html += `<option value="${esc(p.username)}"${p.username === value ? ' selected' : ''}>${esc(p.name || p.username)}</option>`; });
  return html;
}
function addBar(esc, people) {
  return `<form class="tdadd" autocomplete="off"><input class="tdaddin" placeholder="Add a to-do" aria-label="Add a to-do" maxlength="240" enterkeyhint="done"><input type="date" class="tdadddue" aria-label="Due date"><select class="tdaddwho" aria-label="Assignee">${whoOpts(esc, people, '')}</select></form>`;
}
function autoActs(esc, it) {
  const go = it.open || (it.jo ? 'Open ' + it.jo : 'Open');
  return `<div class="tdacts"><a class="pill sm" href="${esc(it.href || '#/dashboard')}" data-td="go" data-id="${esc(it.id)}">${esc(go)}</a><button type="button" class="pill sm outline" data-td="done" data-id="${esc(it.id)}">Done</button><span class="tdsnz"><span class="lab">Snooze</span><button type="button" class="fchip" data-td="snooze" data-until="tomorrow" data-id="${esc(it.id)}">Tomorrow</button><button type="button" class="fchip" data-td="snooze" data-until="3d" data-id="${esc(it.id)}">3 days</button><button type="button" class="fchip" data-td="snooze" data-until="7d" data-id="${esc(it.id)}">1 week</button></span></div>`;
}
function rowHtml(esc, it, o) {
  const day = o.today || today();
  const open = o.open ? ' open' : '';
  const late = it.late ? ' late' : '';
  if (it.manual) {
    const label = chipLabel(it, o.user, day);
    const on = it.status === 'done' ? ' on' : '';
    const word = it.status === 'done' ? 'Mark not done' : 'Done';
    const tick = `<button type="button" class="tdtick${on}" data-td="tick" data-id="${esc(it.id)}" aria-label="${word}"></button>`;
    const body = o.editing
      ? `<form class="tdedit" autocomplete="off"><input class="tdin" aria-label="To-do" maxlength="240" value="${esc(it.text)}"><input type="date" class="tddue" aria-label="Due date" value="${esc(it.due || '')}"><select class="tdwho" aria-label="Assignee">${whoOpts(esc, o.people, it.assignee || '')}</select></form>`
      : `<span class="tdtxt">${mark(esc, it.text)}</span>`;
    const del = o.page ? `<button type="button" class="lnk tddel" data-td="del" data-id="${esc(it.id)}">Delete</button>` : '';
    return `<div class="tdrow manual${late}${open}" data-id="${esc(it.id)}">${tick}<span class="chip tdtag${it.late ? ' gold' : ''}">${esc(label)}</span>${body}${del}</div>`;
  }
  const label = (it.flag ? it.flag + ' · ' : '') + (it.tag || '');
  const acts = o.open ? autoActs(esc, it) : '';
  return `<div class="tdrow${late}${it.sug ? ' sug' : ''}${open}" data-id="${esc(it.id)}"><span class="chip tdtag${it.late ? ' gold' : ''}">${esc(label)}</span><span class="tdtxt">${mark(esc, it.text)}</span><button type="button" class="tdmore" data-td="more" data-id="${esc(it.id)}" aria-label="More">⋯</button><span class="tdgo">›</span>${acts}</div>`;
}
function listHtml(esc, items, o) {
  const groups = ['today', 'week', 'idea'].map(b => items.filter(it => (it.bucket || 'week') === b)).filter(g => g.length);
  if (!items.length) return o.empty || '<p class="muted">All clear.</p>';
  return groups.map(g => `<div class="tdgrp"><div class="tdgh"><span class="lab">${BUCKET[g[0].bucket] || 'This week'}</span><span class="kn">${g.length}</span></div>${g.map(it => rowHtml(esc, it, Object.assign({}, o, { open: o.openId === it.id || o.editId === it.id, editing: o.editId === it.id }))).join('')}</div>`).join('');
}

const S = { data: null, scope: 'everyone', area: 'all', openId: '', editId: '', user: null, focus: false };
function toastUndo(msg, fn) {
  const el = document.getElementById('toast');
  if (!el || !root.OYP) return;
  try { clearTimeout(root.OYP.toast && root.OYP.toast.t); } catch (e) {}
  el.innerHTML = root.OYP.esc(msg) + ' <button type="button" class="tdundo">Undo</button>';
  el.classList.remove('hidden');
  const btn = el.querySelector('.tdundo');
  if (btn) btn.onclick = () => { el.classList.add('hidden'); clearTimeout(toastUndo.t); fn(); };
  clearTimeout(toastUndo.t);
  toastUndo.t = setTimeout(() => el.classList.add('hidden'), 5000);
}
function pool() {
  const d = S.data || {}, user = S.user;
  return {
    open: (d.items || []).filter(it => visible(it, user) && it.status !== 'done'),
    done: (d.done || []).filter(it => visible(it, user))
  };
}
function scoped(name) {
  const p = pool();
  if (name === 'done') return p.done;
  if (name === 'mine') return p.open.filter(it => isMine(it, S.user));
  if (name === 'overdue') return p.open.filter(it => it.late);
  return p.open;
}
function findItem(id) {
  const d = S.data || {};
  return (d.items || []).concat(d.done || []).find(x => x.id === id);
}
function draw(main) {
  const esc = root.OYP.esc, d = S.data, day = today();
  const title = document.getElementById('title');
  if (title) title.textContent = 'TO DO';
  if (!d) { main.innerHTML = '<section class="dcard todo" data-tdpage="1"><div class="skel tdskel" aria-busy="true" aria-label="Loading to do"><i></i><i></i><i></i></div></section>'; return; }
  if (d.ok === false) { main.innerHTML = `<section class="dcard todo" data-tdpage="1"><p class="muted">${esc(d.error || 'Could not load')}</p></section>`; return; }
  const p = pool();
  const scopeN = { mine: p.open.filter(it => isMine(it, S.user)).length, everyone: p.open.length, overdue: p.open.filter(it => it.late).length, done: p.done.length };
  const base = scoped(S.scope);
  const counts = {};
  base.forEach(it => { if (it.area && it.area !== 'manual') counts[it.area] = (counts[it.area] || 0) + 1; });
  if (S.area !== 'all' && !counts[S.area]) S.area = 'all';
  const areas = AREAS.filter(([k]) => k === 'all' || counts[k]);
  const shown = S.area === 'all' ? base : base.filter(it => it.area === S.area);
  const empty = S.scope === 'done' ? '<p class="muted">Nothing done yet.</p>' : '<p class="muted">All clear.</p>';
  main.innerHTML = `<section class="dcard todo" data-tdpage="1">${addBar(esc, d.people || [])}
    <div class="rvchips tdchips" role="tablist" aria-label="Whose to-dos">${SCOPES.map(([k, lab]) => `<button type="button" class="fchip${S.scope === k ? ' on' : ''}" data-tdscope="${k}">${lab}<b>${scopeN[k]}</b></button>`).join('')}</div>
    <div class="rvchips tdchips" role="tablist" aria-label="To do areas">${areas.map(([k, lab]) => `<button type="button" class="fchip${S.area === k ? ' on' : ''}" data-tdf="${k}">${lab}<b>${k === 'all' ? base.length : counts[k]}</b></button>`).join('')}</div>
    ${listHtml(esc, shown, { user: S.user, today: day, people: d.people || [], openId: S.openId, editId: S.editId, page: true, empty: empty })}</section>`;
  wire(main);
  const edit = S.focus && main.querySelector('.tdin');
  if (edit) { edit.focus(); const n = edit.value.length; try { edit.setSelectionRange(n, n); } catch (e) {} }
  S.focus = false;
}
function readAdd(main) {
  const text = (main.querySelector('.tdaddin') || {}).value || '';
  const due = (main.querySelector('.tdadddue') || {}).value || '';
  const assignee = (main.querySelector('.tdaddwho') || {}).value || '';
  return { text: String(text).trim(), due: due, assignee: assignee };
}
async function submitAdd(main) {
  const fields = readAdd(main);
  if (!fields.text) { const inp = main.querySelector('.tdaddin'); if (inp) inp.focus(); return; }
  const { call, toast } = root.OYP;
  const temp = 'tmp-' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
  const item = fresh(S.user, Object.assign({ id: temp }, fields));
  S.data.items = S.data.items || [];
  S.data.items.push(item);
  S.data.items.sort(compare);
  if (S.data.total != null) S.data.total++;
  const box = main.querySelector('.tdaddin'), due = main.querySelector('.tdadddue'), who = main.querySelector('.tdaddwho');
  if (box) box.value = ''; if (due) due.value = ''; if (who) who.value = '';
  draw(main);
  const r = await call('todoAdd', fields);
  const cur = (S.data.items || []).find(x => x.id === temp);
  if (!r || !r.ok) {
    S.data.items = (S.data.items || []).filter(x => x.id !== temp);
    if (S.data.total > 0) S.data.total--;
    draw(main);
    const again = main.querySelector('.tdaddin');
    if (again) { again.value = fields.text; again.focus(); }
    return toast((r && r.error) || 'Could not save');
  }
  if (cur && r.item) Object.assign(cur, r.item);
  draw(main);
}
async function saveEdit(main, row) {
  if (!row || S.skip) return;
  const id = row.dataset.id, it = findItem(id);
  const textEl = row.querySelector('.tdin');
  if (!textEl) return;
  const text = textEl.value.trim(), due = (row.querySelector('.tddue') || {}).value || '', assignee = (row.querySelector('.tdwho') || {}).value || '';
  if (!text) return root.OYP.toast('Type a to-do');
  const same = it && it.text === text && (it.due || '') === due && (it.assignee || '') === assignee;
  S.editId = '';
  if (same) { draw(main); return; }
  const prev = it ? { text: it.text, due: it.due, assignee: it.assignee, bucket: it.bucket, late: it.late } : null;
  if (it) {
    const b = bucketOf(due, today());
    it.text = text; it.due = due; it.assignee = assignee; it.bucket = b.bucket; it.late = b.late;
    if (S.data.items) S.data.items.sort(compare);
  }
  draw(main);
  const r = await root.OYP.call('todoUpdate', { id: id, text: text, due: due, assignee: assignee });
  const now = findItem(id);
  if (!r || !r.ok) {
    if (now && prev) Object.assign(now, prev);
    draw(main);
    return root.OYP.toast((r && r.error) || 'Could not save');
  }
  if (now && r.item) Object.assign(now, r.item);
  draw(main);
}
async function tick(main, it) {
  const { call, toast } = root.OYP, data = S.data, undo = it.status === 'done';
  if (!data.items) data.items = [];
  if (!data.done) data.done = [];
  const from = undo ? data.done : data.items, to = undo ? data.items : data.done;
  const i = from.findIndex(x => x.id === it.id); if (i >= 0) from.splice(i, 1);
  it.status = undo ? 'open' : 'done';
  if (undo) { it.done_at = ''; it.done_by = ''; }
  to.push(it);
  if (data.items) data.items.sort(compare);
  if (!undo && data.total > 0) data.total--;
  if (undo && data.total != null) data.total++;
  S.editId = '';
  draw(main);
  const r = await call(undo ? 'todoUndo' : 'todoDone', { id: it.id });
  if (!r || !r.ok) { toast((r && r.error) || 'Could not save'); S.data = null; return render(main, S.user); }
  if (r.item) Object.assign(it, r.item);
  draw(main);
  toast(undo ? 'Back on the list' : 'Done');
}
async function remove(main, it) {
  const { call, toast } = root.OYP, data = S.data;
  data.items = (data.items || []).filter(x => x.id !== it.id);
  data.done = (data.done || []).filter(x => x.id !== it.id);
  if (data.total > 0) data.total--;
  S.editId = ''; S.openId = '';
  draw(main);
  const r = await call('todoDelete', { id: it.id });
  if (!r || !r.ok) {
    (it.status === 'done' ? data.done : data.items).push(it);
    if (data.items) data.items.sort(compare);
    if (data.total != null) data.total++;
    draw(main);
    return toast((r && r.error) || 'Could not delete');
  }
  toastUndo('Deleted', async () => {
    const u = await call('todoUndo', { id: it.id });
    if (!u || !u.ok) return toast((u && u.error) || 'Could not undo');
    const back = u.item || Object.assign({}, it, { status: 'open' });
    data.items.push(back);
    data.items.sort(compare);
    if (data.total != null) data.total++;
    draw(main);
  });
}
function wire(main) {
  const sec = main.querySelector('[data-tdpage]');
  if (!sec || sec.dataset.tdwire) return;
  sec.dataset.tdwire = '1';
  sec.addEventListener('submit', e => {
    if (e.target.classList.contains('tdadd')) { e.preventDefault(); submitAdd(main); return; }
    if (e.target.classList.contains('tdedit')) { e.preventDefault(); saveEdit(main, e.target.closest('.tdrow')); }
  });
  sec.addEventListener('change', e => {
    if (e.target.classList.contains('tddue') || e.target.classList.contains('tdwho')) saveEdit(main, e.target.closest('.tdrow'));
  });
  sec.addEventListener('mousedown', e => { if (e.target.closest('[data-td="del"]')) S.skip = true; });
  sec.addEventListener('focusout', e => {
    if (!e.target.classList.contains('tdin')) return;
    const row = e.target.closest('.tdrow');
    setTimeout(() => {
      if (S.skip) { S.skip = false; return; }
      if (!row || !row.isConnected || S.editId !== row.dataset.id) return;
      if (document.activeElement && row.contains(document.activeElement)) return;
      saveEdit(main, row);
    }, 80);
  });
  sec.addEventListener('click', async e => {
    const scope = e.target.closest('[data-tdscope]');
    if (scope) { S.scope = scope.dataset.tdscope; S.openId = ''; S.editId = ''; draw(main); return; }
    const chip = e.target.closest('[data-tdf]');
    if (chip) { S.area = chip.dataset.tdf; S.openId = ''; draw(main); return; }
    const btn = e.target.closest('[data-td]');
    const row = e.target.closest('.tdrow');
    if (!btn && !row) return;
    const id = (btn && btn.dataset.id) || (row && row.dataset.id);
    const act = btn ? btn.dataset.td : 'go';
    const it = findItem(id);
    if (act === 'more') { e.preventDefault(); S.openId = S.openId === id ? '' : id; S.editId = ''; draw(main); return; }
    if (act === 'tick') { e.preventDefault(); e.stopPropagation(); if (it && it.manual && String(it.id).indexOf('tmp-') !== 0) tick(main, it); return; }
    if (act === 'del') {
      e.preventDefault(); e.stopPropagation(); S.skip = false;
      if (it && it.manual) remove(main, it);
      return;
    }
    if (act === 'done' || act === 'snooze') {
      e.preventDefault(); e.stopPropagation();
      if (btn) btn.disabled = true;
      const r = await root.OYP.call(act === 'done' ? 'todoDone' : 'todoSnooze', act === 'done' ? { id: id } : { id: id, until: btn.dataset.until });
      if (!r || !r.ok) { if (btn) btn.disabled = false; return root.OYP.toast((r && r.error) || 'Could not save'); }
      S.data.items = (S.data.items || []).filter(x => x.id !== id);
      if (S.data.total > 0) S.data.total--;
      if (act === 'done' && it) { it.status = 'done'; S.data.done = (S.data.done || []).concat([it]); }
      S.openId = '';
      draw(main);
      root.OYP.toast(act === 'done' ? 'Done' : 'Snoozed');
      return;
    }
    if (act === 'go' && it && it.manual) { e.preventDefault(); if (S.editId !== id) { S.editId = id; S.openId = ''; S.focus = true; draw(main); } return; }
    if (!it) return;
    if (btn && btn.dataset.td === 'go') e.preventDefault();
    if (it.manual) return;
    const href = it.href || '#/dashboard';
    if (href === '#dMsgs') { const el = document.getElementById('dMsgs'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (href.charAt(0) === '#') location.hash = href;
  });
}
function render(main, u) {
  S.user = u;
  const title = document.getElementById('title');
  if (title) title.textContent = 'TO DO';
  const live = root.OYP.here();
  if (!S.data || S.forUser !== (u && u.username)) { S.data = null; S.forUser = u && u.username; main.innerHTML = '<section class="dcard todo" data-tdpage="1"><div class="skel tdskel" aria-busy="true" aria-label="Loading to do"><i></i><i></i><i></i></div></section>'; }
  root.OYP.call('todoList').then(r => {
    if (!live()) return;
    S.data = (r && r.ok) ? r : { ok: false, items: [], done: [], people: [], total: 0, error: (r && r.error) || 'Could not load' };
    S.forUser = u && u.username;
    draw(main);
  }).catch(() => { if (!live()) return; S.data = { ok: false, items: [], done: [], people: [], error: 'Could not load' }; draw(main); });
}
root.OYPTodo = { today: today, chipLabel: chipLabel, dueBit: dueBit, isMine: isMine, visible: visible, bucketOf: bucketOf, compare: compare, fresh: fresh, areas: AREAS, addBar: addBar, listHtml: listHtml, rowHtml: rowHtml, render: render };
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPTodo;
})(typeof window !== 'undefined' ? window : globalThis);
