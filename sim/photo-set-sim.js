/* Add photo: role gate, resize, cache drop, and the not-yet-pasted message.
   Run: node sim/photo-set-sim.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}

const gs = read('paste/PhotoSet.gs');
const patch = read('paste/Auth.gs.photoset.patch.txt');
const steps = read('paste/SETUP-photo-set.txt');
const photos = read('photos.js');
const inv = read('inv.js');
const css = read('app.css');
const app = read('app.js');
const index = read('staff/index.html');
const fast = read('paste/Fast.gs.photo.patch.txt');
const setFn = photos.slice(photos.indexOf('async function setPhoto'), photos.indexOf('\nprime();'));
const cardFn = inv.slice(inv.indexOf('function ivCard'), inv.indexOf('function ivSheet'));
const fastLine = "if (typeof isPhotoFastAction_ === 'function' && isPhotoFastAction_(a)) return handlePhotoFast_(req, s.user); // PhotoFast.gs";
const setLine = "if (typeof isPhotoSetAction_ === 'function' && isPhotoSetAction_(a)) return handlePhotoSet_(req, s.user); // PhotoSet.gs";

new vm.Script(gs, { filename: 'paste/PhotoSet.gs' });
eq(true, 'PhotoSet.gs parses');
eq(!/\bconst\b|\blet\b|=>|`/.test(gs), 'PhotoSet.gs stays on var and function, like PhotoFast');
eq(!/setTrashed|\.trash\(/.test(gs), 'PhotoSet never deletes the previous Drive file');
eq(gs.includes("product_photo_file_id: fileId") && gs.includes('updated_at: t') && gs.includes('updated_by: user.username') && gs.includes('drive_folder_id'), 'the sheet write is the photo id, the audit columns, and a folder id only when needed');
eq(gs.includes('pfj2:') && gs.includes('pfc2:') && gs.includes("'pf1:'") && gs.includes('removeAll'), 'thumbnail cache keys for that JO are cleared');
eq(gs.includes("audit_(by, action, jo, device, detail)") && gs.includes("getSheetByName('AuditLog')"), 'the change is written to AuditLog');
eq(patch.includes(fastLine) && patch.includes(setLine) && patch.indexOf(setLine) > patch.indexOf(fastLine), 'the Auth hook is one line under the PhotoFast hook');
eq(steps.includes('https://script.google.com/home/projects/17TdK0I66eGV_3XpM8OSPw9L7BlEbknYvJKI8JEMecrSCxLh4bhdihCXJ/edit') && steps.includes('Manage deployments') && steps.includes('pencil') && steps.includes('New version') && steps.includes('Do not use New deployment'), 'the paste steps name the editor and Manage deployments, pencil, New version');
eq(steps.includes("Photo upload isn't switched on yet"), 'the steps name the message shown until the paste is deployed');
eq(!app.includes('photoSet') && !fast.includes('photoSet'), 'photoSet is not added to the read cache');
eq(photos.includes("toDataURL('image/jpeg', 0.85)") && photos.includes('PHOTO_MAX = 1600') && photos.includes('PHOTO_PART = 80000'), 'a chosen photo is resized to 1600px jpeg 0.85 and split under the cache limit');
eq(setFn.includes("Photo upload isn't switched on yet") && setFn.indexOf('dropStandIn(jo)') > setFn.indexOf("Photo upload isn't switched on yet"), 'an unknown photoSet drops nothing');
eq(!cardFn.includes('Add photo') && !cardFn.includes('ivadd') && !cardFn.includes('Change photo'), 'list cards do not grow an Add photo button or a caption');
eq(inv.includes('Add photo') && inv.includes('Change photo') && inv.includes("accept = 'image/*'") && inv.includes("className = 'ivadd'") && inv.includes('if (!ivEdit()'), 'the detail frame has the button for admin and production manager');
eq(!inv.includes('capture'), 'the phone sheet offers the camera and the library');
eq(inv.includes('root._jo') && inv.includes('root._setProfile') && inv.includes("it.key === 'piece'"), 'a saved photo replaces the first slide in an open viewer');
eq(css.includes('.ivph.big.phstage.sketch{padding-bottom:52px}') && css.includes('.ivadd{position:absolute;z-index:4;right:8px;bottom:8px;'), 'the button sits in the padding under a sketch');
eq(index.includes('photos.js?v=11') && index.includes('inv.js?v=25') && index.includes('app.css?v=59') && read('staff/print-test.html').includes('app.css?v=59'), 'changed files are cache-busted');
eq(read('index.html').includes('app.css?v=29') && !read('index.html').includes('app.css?v=59'), 'the customer page stays on app.css?v=29');

const bag = {};
const cache = {
  get: k => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
  put: (k, v) => { bag[k] = String(v); },
  remove: k => { delete bag[k]; },
  getAll: keys => {
    const o = {};
    (keys || []).forEach(k => { if (bag[k] != null) o[k] = bag[k]; });
    return o;
  },
  putAll: obj => { Object.keys(obj || {}).forEach(k => { bag[k] = String(obj[k]); }); },
  removeAll: keys => { (keys || []).forEach(k => { delete bag[k]; }); }
};
const trashed = [];
const created = [];
const sets = [];
const audits = [];
const auditRows = [];
const rootLooks = [];
const lockWaits = [];
let released = 0;
let seq = 0;
let locks = 0;
function iter(list) {
  let i = 0;
  return { hasNext: () => i < list.length, next: () => list[i++] };
}
function makeFile(id, name) {
  return {
    id: id,
    name: name,
    getId: function () { return id; },
    getName: function () { return this.name; },
    setName: function (n) { this.name = n; },
    isTrashed: function () { return false; },
    setTrashed: function () { trashed.push(id); }
  };
}
function makeFolder(id) {
  const folder = {
    id: id,
    subs: {},
    getId: function () { return id; },
    isTrashed: function () { return false; },
    getFoldersByName: function (name) { return iter(folder.subs[name] ? [folder.subs[name]] : []); },
    createFolder: function (name) {
      const child = makeFolder('fold-' + name);
      folder.subs[name] = child;
      return child;
    },
    createFile: function (blob) {
      const f = makeFile('ph' + (++seq), blob.name);
      f.bytes = Buffer.from(blob.bytes);
      f.mime = blob.mime;
      f.folder = id;
      created.push(f);
      return f;
    }
  };
  return folder;
}
const fold425 = makeFolder('fold425');
const cards = makeFolder('cardsRoot');
cards.subs['26-430'] = makeFolder('fold430');
const trashedFold = { getId: () => 'trashedFold', isTrashed: () => true, createFile: () => { throw new Error('trashed'); } };
const jobs = [
  { _row: 2, jo: '26-425', description: 'gold ring', drive_folder_id: 'fold425', product_photo_file_id: 'old425', photo_file_id: 'shot425', piece_photo_file_id: '' },
  { _row: 3, jo: '26-426', description: 'chain', drive_folder_id: '', product_photo_file_id: '', photo_file_id: '', piece_photo_file_id: '' },
  { _row: 4, jo: '26-427', description: 'band', drive_folder_id: 'fold425', product_photo_file_id: 'old427', photo_file_id: '', piece_photo_file_id: '' },
  { _row: 5, jo: '26-430', description: 'stud', drive_folder_id: '', product_photo_file_id: '', photo_file_id: '', piece_photo_file_id: '' },
  { _row: 6, jo: '26-431', description: 'hoop', drive_folder_id: 'trashedFold', product_photo_file_id: 'old431', photo_file_id: '', piece_photo_file_id: '' }
];
const gsBox = {
  DriveApp: {
    getFolderById: id => {
      if (id === 'fold425') return fold425;
      if (id === 'trashedFold') return trashedFold;
      throw new Error('missing folder');
    },
    getFoldersByName: name => { rootLooks.push(name); return iter(name === 'Job Order Cards' ? [cards] : []); },
    createFolder: name => makeFolder('new-' + name)
  },
  CacheService: { getScriptCache: () => cache },
  LockService: { getScriptLock: () => ({ waitLock: ms => { lockWaits.push(ms); }, releaseLock: () => { released++; } }) },
  Session: { getScriptTimeZone: () => 'Asia/Manila' },
  Utilities: {
    formatDate: (d, tz, fmt) => { gsBox._fmt = { tz: tz, fmt: fmt }; return '20261025-161500'; },
    base64Decode: s => Buffer.from(String(s), 'base64'),
    newBlob: (bytes, mime, name) => ({ bytes: bytes, mime: mime, name: name })
  },
  jobRows_: () => jobs,
  jobKey_: s => String(s || '').trim().toUpperCase(),
  jobStr_: s => String(s == null ? '' : s).trim(),
  jobSet_: (sheet, rowNum, patch) => {
    sets.push({ sheet: sheet, row: rowNum, patch: Object.assign({}, patch) });
    const row = jobs.find(j => j._row === rowNum);
    if (row) Object.keys(patch).forEach(k => { row[k] = patch[k]; });
  },
  withLock_: fn => { locks++; return fn(); },
  audit_: (by, action, jo, device, detail) => { audits.push({ by: by, action: action, jo: jo, device: device, detail: detail }); },
  now_: () => '2026-10-25T00:00:00.000Z',
  ss_: () => ({
    getSheetByName: name => {
      if (name === 'JobOrders') return { name: name };
      if (name === 'AuditLog') return { appendRow: row => { auditRows.push(row); } };
      return null;
    }
  })
};
vm.createContext(gsBox);
vm.runInContext(gs, gsBox, { filename: 'PhotoSet.gs' });

const admin = { username: 'a', role: 'admin' };
const pm = { username: 'p', role: 'production_manager' };
function call(user, body) {
  return gsBox.handlePhotoSet_(Object.assign({ action: 'photoSet', device_id: 'dev1' }, body), user);
}
function denied(user, msg) {
  const before = { created: created.length, sets: sets.length, locks: locks, waits: lockWaits.length };
  const r = call(user, { jo: '26-425', data: 'QUJD' });
  eq(r.ok === false && r.code === 'FORBIDDEN' && created.length === before.created && sets.length === before.sets && locks === before.locks && lockWaits.length === before.waits, msg);
}

eq(call(null, { jo: '26-425', data: 'QUJD' }).code === 'NO_SESSION', 'a signed-out caller gets nothing');
denied({ username: 's', role: 'staff' }, 'staff cannot save a photo');
denied({ username: 'c', role: 'accounting' }, 'accounting cannot save a photo');
denied({ username: 'e', role: 'executive' }, 'an executive cannot save a photo');
eq(audits.filter(a => a.action === 'denied').length === 3 && created.length === 0, 'a refused role is logged and writes nothing');

bag['pfj2:26-425'] = '{"found":false}';
bag['pfj1:26-425'] = 'old';
bag['pfd2:26-425'] = '{}';
bag['pfd1:26-425'] = '{}';
bag['pfc2:26-425'] = '{}';
bag['pfc1:26-425'] = '{}';
bag['pf1:300:old425'] = 'thumb';
bag['pf1:1600:old425'] = 'med';
bag['pf1:300:old425#n'] = '2';
bag['pf1:300:old425#0'] = 'aa';
bag['pf1:300:shot425'] = 'shot';
const saved = call(admin, { jo: '26-425', name: 'evil.png', mime: 'image/png', data: 'data:image/jpeg;base64,QUJD' });
eq(saved.ok === true && saved.id === 'ph1' && saved.name === '26-425-photo-20261025-161500.jpg', 'admin saves <JO>-photo-<timestamp>.jpg and ignores the client file name');
eq(gsBox._fmt.tz === 'Asia/Manila' && gsBox._fmt.fmt === 'yyyyMMdd-HHmmss', 'the stamp uses the script time zone');
eq(created.length === 1 && created[0].folder === 'fold425' && created[0].mime === 'image/jpeg' && created[0].bytes.toString() === 'ABC' && rootLooks.length === 0, 'the file goes in the JO folder already on the row');
const patch0 = sets[0].patch;
eq(Object.keys(patch0).sort().join() === 'product_photo_file_id,updated_at,updated_by', 'only the photo cell and the audit columns are written');
eq(patch0.product_photo_file_id === 'ph1' && patch0.updated_at === '2026-10-25T00:00:00.000Z' && patch0.updated_by === 'a', 'the new file id, updated_at, and updated_by are the written values');
eq(jobs[0].description === 'gold ring' && jobs[0].photo_file_id === 'shot425' && trashed.length === 0, 'the description and the old file stay');
eq(!bag['pfj2:26-425'] && !bag['pfj1:26-425'] && !bag['pfd2:26-425'] && !bag['pfc2:26-425'] && !bag['pf1:300:old425'] && !bag['pf1:1600:old425'] && !bag['pf1:300:old425#0'] && !bag['pf1:300:shot425'], 'cached thumbs for that JO are removed');
eq(audits.some(a => a.action === 'photoSet' && a.jo === '26-425' && a.detail === 'ph1' && a.by === 'a' && a.device === 'dev1'), 'AuditLog records the new file id');

const made = call(admin, { jo: '26-426', data: 'QUJD' });
eq(made.ok && made.name === '26-426-photo-20261025-161500.jpg' && created[1].folder === 'fold-26-426' && rootLooks[0] === 'Job Order Cards', 'a JO with no folder is filed under Job Order Cards/<JO>');
eq(sets[1].patch.drive_folder_id === 'fold-26-426' && Object.keys(sets[1].patch).sort().join() === 'drive_folder_id,product_photo_file_id,updated_at,updated_by', 'drive_folder_id is written only when the cell was empty');

const found = call(admin, { jo: '26-430', data: 'QUJD' });
eq(found.ok && created[2].folder === 'fold430' && sets[2].patch.drive_folder_id === 'fold430', 'an existing Job Order Cards child is reused');

const dead = call(admin, { jo: '26-431', data: 'QUJD' });
eq(dead.ok && created[3].folder === 'fold-26-431' && !Object.prototype.hasOwnProperty.call(sets[3].patch, 'drive_folder_id') && jobs[4].description === 'hoop', 'a trashed folder id is left as it is, and the new file still lands in Job Order Cards');

const beforeChunk = created.length;
const mid = call(admin, { jo: '26-427', data: 'QU', part: 0, parts: 2, upload: 'abc12345upload' });
eq(mid.ok === true && !mid.id && created.length === beforeChunk && bag['psu:abc12345upload:0'] === 'QU', 'the first chunk is stored and does not write the sheet');
const end = call(admin, { jo: '26-427', data: 'JD', part: 1, parts: 2, upload: 'abc12345upload' });
eq(end.ok && end.id && created.length === beforeChunk + 1 && created[created.length - 1].bytes.toString() === 'ABC' && !bag['psu:abc12345upload:0'] && !bag['psu:abc12345upload:1'], 'the last chunk assembles the file and clears the parts');
eq(jobs[2].description === 'band' && jobs[2].product_photo_file_id === end.id, 'the chunked save updates only that JO photo cell');

eq(call(admin, { jo: '26-425', data: 'A'.repeat(90001) }).ok === false && created.length === beforeChunk + 1, 'a part over 90k characters is refused');
eq(call(admin, { jo: '26/425', data: 'QUJD' }).ok === false, 'a JO with a slash is refused');
eq(call(admin, { jo: '26-999', data: 'QUJD' }).error === 'Not found' && created.length === beforeChunk + 1, 'a missing JO does not grow a JobOrders row');

gsBox.withLock_ = undefined;
const byPm = call(pm, { jo: '26-425', data: 'QUJD' });
eq(byPm.ok && byPm.id && lockWaits[0] === 20000 && released === 1 && sets[sets.length - 1].patch.updated_by === 'p', 'a production manager saves through the script lock');
gsBox.withLock_ = fn => { locks++; return fn(); };

gsBox.audit_ = undefined;
const logged = call(admin, { jo: '26-426', data: 'QUJD' });
eq(logged.ok && auditRows.length === 1 && auditRows[0][2] === 'photoSet' && auditRows[0][5] === logged.id, 'when audit_ is missing the row is appended to AuditLog');

const SKETCH = 'data:image/jpeg;base64,SKETCH425';
const REAL = 'data:image/jpeg;base64,REAL425';
const data = new Map();
data.set('sk:26-425|c425', { src: SKETCH, jo: '26-425', id: 'c425', at: Date.now(), sketch: true, size: 300 });
function makeStore() {
  return {
    openCursor() {
      const keys = [...data.keys()];
      let i = 0;
      const req = {};
      const step = () => {
        if (i >= keys.length) { req.result = null; if (req.onsuccess) req.onsuccess(); return; }
        const key = keys[i++];
        req.result = { key: key, value: data.get(key), continue() { queueMicrotask(step); } };
        if (req.onsuccess) req.onsuccess();
      };
      queueMicrotask(step);
      return req;
    },
    get() { const req = {}; queueMicrotask(() => { req.result = undefined; if (req.onsuccess) req.onsuccess(); }); return req; },
    put(value, key) { data.set(key, value); },
    delete(key) { data.delete(key); }
  };
}
const calls = [];
let mode = 'unknown';
const store = {};
const ctx = {
  setTimeout, clearTimeout, Promise, Map, queueMicrotask, Date, Math, JSON,
  indexedDB: {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction() { return { objectStore: () => makeStore() }; }
        };
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    }
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  }
};
ctx.window = ctx;
ctx.window.OYP = {
  call(action, body) {
    calls.push({ action: action, data: body });
    if (action !== 'photoSet') return Promise.resolve({ ok: false, error: 'Unknown action' });
    if (mode === 'unknown') return Promise.resolve({ ok: false, error: 'Unknown action' });
    if (mode === 'chunk') {
      if (body.part < body.parts - 1) return Promise.resolve({ ok: true, part: body.part, parts: body.parts });
      return Promise.resolve({ ok: true, id: 'file425', jo: body.jo });
    }
    return Promise.resolve({ ok: true, id: 'file425', jo: body.jo });
  }
};
vm.createContext(ctx);
vm.runInContext(photos, ctx, { filename: 'photos.js' });
const P = ctx.window.OYPPhotos;

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
(async () => {
  const box = P.photoBox(3200, 1600);
  const same = P.photoBox(800, 600);
  const tall = P.photoBox(1600, 3200);
  eq(box.w === 1600 && box.h === 800 && same.w === 800 && same.h === 600 && tall.w === 800 && tall.h === 1600, 'photoBox scales the long side to 1600 and leaves a smaller photo alone');
  eq(P.photoBox(0, 400).w === 0 && P.photoParts('A'.repeat(80001)).length === 2 && P.photoParts('A'.repeat(80000)).length === 1, 'an empty image is rejected and a long upload splits at 80k');
  await P.ready;
  eq(P.peek({ jo: '26-425', kind: 'piece', size: 300, fallback: true }) === SKETCH, 'the stand-in is what the detail frame is showing');
  const empty = await P.setPhoto('26-425', { width: 0, height: 0, data: REAL });
  eq(empty.ok === false && calls.length === 0 && P.peek({ jo: '26-425', kind: 'piece', size: 300, fallback: true }) === SKETCH, 'a photo that cannot be sized never calls photoSet');
  const off = await P.setPhoto('26-425', { width: 400, height: 300, data: REAL });
  eq(off.ok === false && off.error === "Photo upload isn't switched on yet" && calls.length === 1 && calls[0].action === 'photoSet', 'Unknown action shows Photo upload isn\'t switched on yet');
  eq(P.peek({ jo: '26-425', kind: 'piece', size: 300, fallback: true }) === SKETCH && !store['oypPhJ:26-425'] && data.has('sk:26-425|c425'), 'that message writes nothing and keeps the stand-in');
  mode = 'save';
  const progress = [];
  const ok = await P.setPhoto('26-425', { width: 400, height: 300, data: REAL }, { progress: t => progress.push(t) });
  await wait(30);
  eq(ok.ok === true && ok.id === 'file425' && calls.length === 2 && calls[1].data.mime === 'image/jpeg' && calls[1].data.parts === 1, 'a real photo is sent once as jpeg');
  eq(progress[0] === 'Preparing…' && progress.indexOf('Uploading…') > 0, 'the button is told preparing, then uploading');
  eq(P.peek({ jo: '26-425', kind: 'piece', size: 300, fallback: true }) === REAL && P.peek({ jo: '26-425', kind: 'piece', size: 300, sketch: true }) !== SKETCH, 'the saved photo replaces the stand-in in memory');
  eq(store['oypPhJ:26-425'] === 'file425' && store['oypPh:file425'] === REAL && data.get('jo:26-425|300') === REAL && !data.has('sk:26-425|c425'), 'IndexedDB and localStorage keep the photo and forget the stand-in');

  mode = 'chunk';
  const notes = [];
  const big = 'data:image/jpeg;base64,' + 'B'.repeat(80001);
  const chunked = await P.setPhoto('26-500', { width: 100, height: 80, data: big }, { progress: t => notes.push(t) });
  const sent = calls.slice(2);
  eq(chunked.ok && sent.length === 2 && sent[0].data.part === 0 && sent[1].data.part === 1 && sent[0].data.parts === 2 && sent[0].data.upload === sent[1].data.upload && /^[a-z0-9]{16}$/.test(sent[0].data.upload), 'a long photo is uploaded in order and shares one upload id');
  eq(notes.indexOf('Uploading 1/2') >= 0 && notes.indexOf('Uploading 2/2') >= 0, 'progress names each chunk');
  eq(P.peek({ jo: '26-500', kind: 'piece', size: 300 }) === big, 'the chunked photo is the new profile');

  if (failed) { console.error(failed + ' failed'); process.exit(1); }
  console.log('photo-set-sim ok');
})().catch(err => { console.error(err); process.exit(1); });
