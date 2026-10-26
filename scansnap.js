/* Scanner menu: Scan snap (default) and Mobile.
   Scan snap files the Fujitsu ScanSnap drop in JO Inbox. CHECK FOR NEW SCANS runs joInboxRun at once, the same check as the 5-minute trigger.
   Print jewelry tag and Print QR tag default on. The server keeps them (snapPrintGet / snapPrintSet) so the trigger sees them.
   Checked jewelry queues the tag after the JO is confirmed. Unchecked never queues it. The QR tag prints when the scan is filed.
   Until that paste is in, both stay checked and the page says the change is not saved.
   Mobile loads the phone scanner (scan/index.html) and does not change it. */
(function (root) {
'use strict';
const HINT = 'Scanned something? Tap to file it now instead of waiting up to 5 minutes.';
const WHEN = 'The jewelry tag queues after you confirm the JO. Unchecked, it never queues. The QR tag prints when the scan is filed.';
const CHECK = 'CHECK FOR NEW SCANS';
const NOT_SAVED = "Changes aren't saved yet.";
const S = { user: null, ready: false, jewelry: true, qr: true, run: { busy: false, text: '' } };

function api() { return root.OYP || {}; }
function esc(s) {
  const f = api().esc;
  if (f) return f(s);
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
function canEdit(u) { return !!(u && (u.role === 'admin' || u.role === 'production_manager')); }
function tabFromHash() { return /\/mobile\b/.test(String((root.location && root.location.hash) || '')) ? 'mobile' : 'snap'; }
function liveToken() { return api().here ? api().here() : function () { return true; }; }
function missing(r) {
  if (!r || r.ok) return false;
  const code = String(r.code || '').toUpperCase();
  const err = String(r.error || '').toLowerCase();
  return code === 'UNKNOWN' || code === 'UNKNOWN_ACTION' || err.indexOf('unknown action') >= 0;
}
function plural(n, one) { return n + ' ' + one + (n === 1 ? '' : 's'); }
/* n new scans filed, n waiting, and errors when the check reports them. */
function resultText(r) {
  if (!r || r.ok === false) {
    if (missing(r)) return 'Needs the latest script paste';
    if (String(r && r.code || '').toUpperCase() === 'BUSY') return 'A check is already running. Try again in a minute.';
    return String((r && r.error) || 'Could not check for scans');
  }
  if (r.waiting === true && r.message) return String(r.message);
  const filed = Number(r.filed) || 0;
  let waiting = 0;
  if (typeof r.waiting === 'number') waiting = r.waiting;
  else if (r.pending != null && r.pending !== '') waiting = Number(r.pending) || 0;
  else waiting = Number(r.check) || 0;
  const problems = Number(r.problem) || (Array.isArray(r.errors) ? r.errors.length : 0);
  let text = plural(filed, 'new scan') + ' filed, ' + waiting + ' waiting';
  if (problems) text += ', ' + plural(problems, 'error');
  else if (r.error) text += ', ' + String(r.error);
  return text;
}
function tabsHtml(tab) {
  function chip(id, label) {
    return '<button type="button" class="fchip tap' + (tab === id ? ' on' : '') + '" data-stab="' + id + '">' + label + '</button>';
  }
  return '<div class="rvchips mattabs" id="scanTabs">' + chip('snap', 'Scan snap') + chip('mobile', 'Mobile') + '</div>';
}
function snapHtml() {
  const dis = canEdit(S.user) ? '' : ' disabled';
  const note = S.ready ? ' hidden' : '';
  return '<div class="snappage" data-scan-tab="snap"><h2>Scanner</h2>' + tabsHtml('snap')
    + '<div class="snapchecks">'
    + '<label class="settog"><input type="checkbox" id="snapJewelry"' + (S.jewelry ? ' checked' : '') + dis + '> <span>Print jewelry tag</span></label>'
    + '<label class="settog"><input type="checkbox" id="snapQr"' + (S.qr ? ' checked' : '') + dis + '> <span>Print QR tag</span></label>'
    + '</div>'
    + '<p class="muted snaphint" id="snapWhen">' + esc(WHEN) + '</p>'
    + '<p class="snapnote" id="snapNote"' + note + '>' + esc(NOT_SAVED) + '</p>'
    + '<button type="button" class="pill" id="snapNow"' + (S.run.busy ? ' disabled aria-busy="true"' : '') + '>' + (S.run.busy ? 'Checking…' : CHECK) + '</button>'
    + '<p class="muted snaphint" id="snapHint">' + esc(HINT) + '</p>'
    + '<p class="snapresult" id="snapResult" role="status">' + esc(S.run.text || '') + '</p></div>';
}
function mobileSrc(role) {
  return '../scan/index.html' + (role ? '?role=' + encodeURIComponent(role) : '');
}
function mobileHtml() {
  const role = S.user && S.user.role;
  return '<div class="snappage" data-scan-tab="mobile"><h2>Scanner</h2>' + tabsHtml('mobile')
    + '<iframe class="scanframe" title="Mobile scanner" src="' + esc(mobileSrc(role)) + '"></iframe></div>';
}
function wireTabs(main) {
  main.querySelectorAll('[data-stab]').forEach(function (b) {
    b.onclick = function () {
      const next = b.getAttribute('data-stab') === 'mobile' ? '#/scanner/mobile' : '#/scanner';
      if (root.location.hash !== next) root.location.hash = next;
    };
  });
}
function wireSnap(main) {
  wireTabs(main);
  const jew = main.querySelector('#snapJewelry');
  const qr = main.querySelector('#snapQr');
  const now = main.querySelector('#snapNow');
  async function save() {
    if (!canEdit(S.user) || !jew || !qr) return;
    if (!S.ready) {
      S.jewelry = true;
      S.qr = true;
      jew.checked = true;
      qr.checked = true;
      const note = main.querySelector('#snapNote');
      if (note) note.hidden = false;
      return;
    }
    const wantJ = !!jew.checked, wantQ = !!qr.checked;
    let r;
    try { r = await api().call('snapPrintSet', { jewelry: wantJ, qr: wantQ }); }
    catch (e) { r = { ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }; }
    if (missing(r) || !r || !r.ok) {
      if (missing(r)) {
        S.ready = false;
        S.jewelry = true;
        S.qr = true;
        jew.checked = true;
        qr.checked = true;
        const note = main.querySelector('#snapNote');
        if (note) { note.hidden = false; note.textContent = NOT_SAVED; }
      } else if (api().toast) api().toast((r && r.error) || 'Could not save');
      jew.checked = S.jewelry;
      qr.checked = S.qr;
      return;
    }
    S.jewelry = !!r.jewelry;
    S.qr = !!r.qr;
    S.ready = true;
    jew.checked = S.jewelry;
    qr.checked = S.qr;
    const note = main.querySelector('#snapNote');
    if (note) note.hidden = true;
  }
  if (jew) jew.onchange = save;
  if (qr) qr.onchange = save;
  if (now) now.onclick = function () { scanNow(main); };
}
async function scanNow(main) {
  if (S.run.busy) return;
  S.run = { busy: true, text: '' };
  if (main) { main.innerHTML = snapHtml(); wireSnap(main); }
  let r;
  try { r = await api().call('joInboxRun', {}); }
  catch (e) { r = { ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }; }
  if (r && r.code === 'NO_SESSION') { S.run = { busy: false, text: '' }; return; }
  S.run = { busy: false, text: resultText(r) };
  if (main && tabFromHash() === 'snap') { main.innerHTML = snapHtml(); wireSnap(main); }
}
async function render(main, user) {
  S.user = user || S.user;
  if (!main) return;
  const tab = tabFromHash();
  if (tab === 'mobile') {
    main.innerHTML = mobileHtml();
    wireTabs(main);
    return;
  }
  if (!S.ready) { S.jewelry = true; S.qr = true; }
  main.innerHTML = snapHtml();
  wireSnap(main);
  const token = liveToken();
  let r;
  try { r = await api().call('snapPrintGet', {}); }
  catch (e) { r = { ok: false, error: 'No connection. Check the internet and try again.', code: 'NET' }; }
  if (!token() || tabFromHash() !== 'snap') return;
  if (r && r.code === 'NO_SESSION') return;
  if (r && r.ok) {
    S.ready = true;
    S.jewelry = !!r.jewelry;
    S.qr = !!r.qr;
  } else {
    S.ready = false;
    S.jewelry = true;
    S.qr = true;
  }
  main.innerHTML = snapHtml();
  wireSnap(main);
}
root.OYPScanSnap = {
  render: render, resultText: resultText, snapHtml: snapHtml, mobileHtml: mobileHtml, mobileSrc: mobileSrc,
  canEdit: canEdit, tabFromHash: tabFromHash, HINT: HINT, WHEN: WHEN, CHECK: CHECK, NOT_SAVED: NOT_SAVED, missing: missing
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPScanSnap;
})(typeof window !== 'undefined' ? window : globalThis);
