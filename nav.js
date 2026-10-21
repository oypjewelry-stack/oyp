/* OYP back-office menu: one list shared by the back office (oypjewelry.com) and the card scanner (jo-scanner).
   The scanner loads this file from https://oypjewelry.com/nav.js so both menus always match. */
(function (root) {
'use strict';
// back office lives at /staff/ since the site split (oypjewelry.com/ is the customer landing page)
const STAFF = 'https://oypjewelry.com/staff/';
const SITE = STAFF; // kept for older scanner builds that read OYPNav.SITE
const SCANNER = 'https://oypjewelry-stack.github.io/jo-scanner/';
// Default order with nothing saved on this device, and the order Reset returns to. A role still only sees the items it already had.
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['appts', 'Appointments'], ['jos', 'Inventory'], ['consignment', 'Consignment'], ['review', 'To review'], ['scanner', 'Scanner'], ['production', 'Production'], ['estimate', 'Cost estimator'], ['inventory', 'Materials'], ['prices', 'Material prices'], ['customers', 'Customers'], ['payments', 'Quotes / payments'], ['shop', 'Shop listings'], ['settings', 'Settings']], // 'Staff logins' hidden (Oct 18): staff accounts live in Settings › Staff accounts; #/users opens it
  production_manager: [['dashboard', 'Dashboard'], ['appts', 'Appointments'], ['jos', 'Inventory'], ['consignment', 'Consignment'], ['review', 'To review'], ['scanner', 'Scanner'], ['production', 'Production'], ['estimate', 'Cost estimator'], ['inventory', 'Materials'], ['prices', 'Material prices'], ['balances', 'Balances']],
  accounting: [['dashboard', 'Dashboard'], ['appts', 'Appointments'], ['jos', 'Inventory (view)'], ['payments', 'Payments'], ['quotes', 'Quotes'], ['balances', 'Balances'], ['clients', 'Clients (billing)']],
  staff: [['home', 'Home'], ['appts', 'Appointments'], ['scanner', 'Scanner']] // staff keep their simple home; Appointments opens in the back office. No Production (Susan + admins only)
};
// back-office only: kept out of the scanner menu (the scanner reads OYPNav.NAV); the back office reads OFFICE_NAV
const OFFICE_ONLY = { production: true, consignment: true };
const OFFICE_NAV = NAV;
const SCAN_NAV = {}; Object.keys(NAV).forEach(r => { SCAN_NAV[r] = NAV[r].filter(([k]) => !OFFICE_ONLY[k]); });
const ROLE_LABEL = { admin: 'Admin', production_manager: 'Production manager', accounting: 'Accounting', staff: 'Staff' };
const DONE = { production: true, settings: true, appts: true, home: true, prices: true, dashboard: true, review: true, estimate: true, users: true, scanner: true, customers: true, shop: true, jos: true, inventory: true, payments: true, quotes: true, balances: true, clients: true, consignment: true };
// link to the scanner that tells it whose menu to show (the role only picks menu items; every page still checks the sign-in)
const scannerLink = role => SCANNER + (role ? '?role=' + encodeURIComponent(role) : '');
function escNav(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
function readUser() {
  try {
    var exp = localStorage.getItem('oypSessionExp');
    if (!localStorage.getItem('oypSession') || !exp || new Date(exp) < new Date()) return null;
    return JSON.parse(localStorage.getItem('oypUser') || 'null');
  } catch (e) { return null; }
}
function arrange(canon, saved) {
  if (!saved || !saved.length) return canon.slice();
  var ids = canon.map(function (n) { return n[0]; }), by = {}, out = [], present = {};
  canon.forEach(function (n) { by[n[0]] = n; });
  ids.forEach(function (id) { present[id] = true; });
  saved.forEach(function (id) { if (present[id] && out.indexOf(id) < 0) out.push(id); });
  ids.forEach(function (id, i) {
    if (out.indexOf(id) >= 0) return;
    var at = out.length, j, k;
    for (j = i + 1; j < ids.length; j++) { k = out.indexOf(ids[j]); if (k >= 0) { at = k; break; } }
    out.splice(at, 0, id);
  });
  return out.map(function (id) { return by[id]; });
}
function ordered(user) {
  if (!user || !OFFICE_NAV[user.role]) return [];
  var canon = OFFICE_NAV[user.role];
  if (user.role !== 'admin') return canon;
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('oypNavOrder:' + (user.username || 'device')) || 'null'); } catch (e) {}
  return arrange(canon, Array.isArray(saved) ? saved.filter(function (x) { return typeof x === 'string'; }) : null);
}
/* Same phone menu as the back office. home is '' on the staff app and 'index.html' on a side page such as print-test. */
function menuHtml(user, page, home) {
  home = home || '';
  function link(k, t) {
    if (k === 'scanner') return '<a href="' + scannerLink(user && user.role) + '" data-nkey="scanner">' + escNav(t) + '</a>';
    return '<a href="' + home + '#/' + k + '"' + (k === page ? ' class="on"' : '') + ' data-nkey="' + escNav(k) + '">' + escNav(t) + (DONE[k] ? '' : '<small>soon</small>') + '</a>';
  }
  if (!user) return '<a href="' + SCANNER + '">Card scanner</a>';
  if ((user.role === 'staff' || !OFFICE_NAV[user.role]) && !(user.role === 'staff' && OFFICE_NAV.staff)) return '<a href="' + scannerLink(user.role) + '">Scan JO card</a><button type="button" data-logout>Log out</button>';
  var rows = user.role === 'staff' ? OFFICE_NAV.staff : ordered(user);
  return rows.map(function (n) { return link(n[0], n[1]); }).join('') + '<button type="button" data-logout>Log out</button>';
}
root.OYPNav = { SITE, STAFF, SCANNER, NAV: SCAN_NAV, OFFICE_NAV, ROLE_LABEL, scannerLink, readUser: readUser, ordered: ordered, menuHtml: menuHtml };
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPNav;
// The scanner cannot take a repo change from this site, but it already loads this file.
// JO card zones (scan-zones.js) ride along so a phone can label every section of the card without a scanner release.
// The start screen's stone photo is replaced with plain white the same way.
if (typeof document !== 'undefined' && document.createElement) {
  var cs = document.currentScript, tags, i, src;
  if (!cs) {
    tags = document.getElementsByTagName('script');
    for (i = tags.length - 1; i >= 0; i--) {
      src = tags[i].src || tags[i].getAttribute('src') || '';
      if (/(^|\/)nav\.js(\?|$)/.test(src)) { cs = tags[i]; break; }
    }
  }
  src = cs && (cs.src || '');
  var base = src ? src.replace(/[^/]*$/, '') : '';
  if (base && !document.querySelector('script[src*="print.js"]')) {
    ['vendor/qrcode.js?v=1', 'vendor/niimbluelib-0.47.1.js?v=1', 'print-label.js?v=5', 'print.js?v=6'].forEach(function (rel) {
      var ps = document.createElement('script');
      ps.src = base + rel;
      ps.async = false;
      (document.head || document.documentElement).appendChild(ps);
    });
  }
  if (base && !document.querySelector('script[src*="scan-zones.js"]')) {
    var zs = document.createElement('script');
    zs.src = base + 'scan-zones.js?v=3';
    (document.head || document.documentElement).appendChild(zs);
  }
  // Card Scanner start screen: drop the stone photo. Other screens are already white.
  var scanFlag = document.documentElement.getAttribute('data-oyp-scanner');
  var path = (typeof location !== 'undefined' && location && location.pathname) || '';
  var onScanner = scanFlag === '1' ? true : scanFlag === '0' ? false
    : /jo-scanner/.test(path)
    || !!(document.getElementById('btnMenu') && document.getElementById('menu') && !document.getElementById('vOffice'));
  if (onScanner && !document.getElementById('oyp-scan-plain')) {
    var plain = document.createElement('style');
    plain.id = 'oyp-scan-plain';
    plain.textContent = 'html.on-start,html.on-start body{background-color:#fff !important;background-image:none !important}'
      + 'html.on-start body::before{background-color:#fff !important;background-image:none !important}';
    (document.head || document.documentElement).appendChild(plain);
  }
}
})(typeof window !== 'undefined' ? window : globalThis);
