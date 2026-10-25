/* OYP back-office menu: one list shared by the back office (oypjewelry.com) and the card scanner (jo-scanner).
   The scanner loads this file from https://oypjewelry.com/nav.js so both menus always match. */
(function (root) {
'use strict';
// back office lives at /staff/ since the site split (oypjewelry.com/ is the customer landing page)
const STAFF = 'https://oypjewelry.com/staff/';
const SITE = STAFF; // kept for older scanner builds that read OYPNav.SITE
const SCANNER = 'https://oypjewelry.com/scan/';
// Default order with nothing saved on this device, and the order Reset returns to. A role still only sees the items it already had.
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['todo', 'To do'], ['appts', 'Appointments'], ['jos', 'Inventory'], ['consignment', 'Consignment'], ['scanner', 'Scanner'], ['production', 'Production'], ['estimate', 'Cost estimator'], ['inventory', 'Materials'], ['customers', 'Customers'], ['payments', 'Quotes / payments'], ['shop', 'Shop listings'], ['settings', 'Settings']], // 'Staff logins' hidden (Oct 18): staff accounts live in Settings › Staff accounts; #/users opens it. REVIEW, DEBUG, and COUNT live inside Inventory. Material prices is the Prices tab on Materials.
  production_manager: [['dashboard', 'Dashboard'], ['todo', 'To do'], ['appts', 'Appointments'], ['jos', 'Inventory'], ['consignment', 'Consignment'], ['scanner', 'Scanner'], ['production', 'Production'], ['estimate', 'Cost estimator'], ['inventory', 'Materials'], ['balances', 'Balances']],
  accounting: [['dashboard', 'Dashboard'], ['todo', 'To do'], ['appts', 'Appointments'], ['jos', 'Inventory (view)'], ['payments', 'Payments'], ['quotes', 'Quotes'], ['balances', 'Balances'], ['clients', 'Clients (billing)']],
  staff: [['home', 'Home'], ['todo', 'To do'], ['appts', 'Appointments'], ['jos', 'Inventory'], ['scanner', 'Scanner']] // staff keep their simple home. Appointments and Inventory open in the back office. Inventory shows only the COUNT tab. No Production (Susan + admins only)
};
// back-office only: kept out of the scanner menu (the scanner reads OYPNav.NAV); the back office reads OFFICE_NAV
const OFFICE_ONLY = { production: true, consignment: true, todo: true };
const OFFICE_NAV = NAV;
const SCAN_NAV = {}; Object.keys(NAV).forEach(r => { SCAN_NAV[r] = NAV[r].filter(([k]) => !OFFICE_ONLY[k]); });
const ROLE_LABEL = { admin: 'Admin', production_manager: 'Production manager', accounting: 'Accounting', staff: 'Staff' };
const DONE = { production: true, settings: true, appts: true, home: true, prices: true, dashboard: true, todo: true, review: true, look: true, estimate: true, users: true, scanner: true, customers: true, shop: true, jos: true, inventory: true, count: true, payments: true, quotes: true, balances: true, clients: true, consignment: true };
// Roles that had the Material prices menu item. Prices is now a tab on Materials; a role absent here sees only Stock.
const MAT_PRICE_ROLES = { admin: true, production_manager: true };
const COUNT_ROLES = { admin: true, production_manager: true, staff: true }; // roles that had Inventory count. Accounting did not. A saved menu key "count" is ignored: it is no longer in the list.
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
/* Printer is a menu row, not a header pill. It stays directly under Settings for every role that can print. */
function printerItemHtml() {
  return '<a data-oyp-printer="1" role="button" tabindex="0" title="Printer not connected">Printer<span class="oyp-pr-dot" aria-hidden="true"></span></a>';
}
function withPrinter(parts) {
  var out = [], placed = false, i;
  for (i = 0; i < parts.length; i++) {
    out.push(parts[i][1]);
    if (parts[i][0] === 'settings') { out.push(printerItemHtml()); placed = true; }
  }
  if (!placed) out.push(printerItemHtml());
  return out.join('');
}
/* Same phone menu as the back office. home is '' on the staff app and 'index.html' on a side page such as print-test. */
function navParts(user, page, home) {
  home = home || '';
  function link(k, t) {
    if (k === 'scanner') return '<a href="' + home + '#/scanner"' + (page === 'scanner' ? ' class="on"' : '') + ' data-nkey="scanner">' + escNav(t) + '</a>';
    var count = k === 'jos' ? '<span class="ncount" data-ncount="review" hidden></span>' : '';
    return '<a href="' + home + '#/' + k + '"' + (k === page ? ' class="on"' : '') + ' data-nkey="' + escNav(k) + '">' + escNav(t) + (DONE[k] ? '' : '<small>soon</small>') + count + '</a>';
  }
  if (!user) return '<a href="' + SCANNER + '">Card scanner</a>';
  if ((user.role === 'staff' || !OFFICE_NAV[user.role]) && !(user.role === 'staff' && OFFICE_NAV.staff)) return '<a href="' + scannerLink(user.role) + '">Scan JO card</a>' + printerItemHtml();
  var list = user.role === 'staff' ? OFFICE_NAV.staff : ordered(user);
  return withPrinter(list.map(function (n) { return [n[0], link(n[0], n[1])]; }));
}
/* Scanner phone menu, after the staff rows. Log out is last. JO card zones is inserted before Scanner settings. */
function scannerTailHtml(opts) {
  opts = opts || {};
  var n = (Number(opts.pending) || 0) + (Number(opts.failed) || 0);
  var badge = n ? ' <span class="badge">' + n + '</span>' : '';
  var print = escNav(opts.printTest || 'https://oypjewelry.com/staff/print-test.html');
  var h = '<hr><a href="#" data-m="queue">Pending uploads' + badge + '</a><a href="#" data-m="settings">Scanner settings</a><a href="' + print + '">Print test</a>';
  if (opts.logoutHref) h += '<a href="' + escNav(opts.logoutHref) + '" data-m="logout">Log out</a>';
  return h;
}
function menuHtml(user, page, home) {
  var rows = navParts(user, page, home);
  if (!user) return rows;
  return rows + '<button type="button" data-logout>Log out</button>';
}
function sideHtml(user, page, home) {
  var who = '';
  if (user) {
    var role = ROLE_LABEL[user.role] || '';
    var name = user.display_name || user.username || '';
    who = '<div class="who"><div id="whoMenu" class="whomenu hidden" role="menu"><button role="menuitem" data-logout>Log out</button></div><button id="whoBtn" class="whobtn tap" aria-haspopup="menu" aria-expanded="false"><span class="lab">' + escNav(role) + '</span><b>' + escNav(name) + '</b><span class="chev" aria-hidden="true">▾</span></button></div>';
  }
  return '<div class="sidenav" id="sideNav">' + navParts(user, page, home) + '</div>' + who;
}
root.OYPNav = { SITE, STAFF, SCANNER, NAV: SCAN_NAV, OFFICE_NAV, ROLE_LABEL, MAT_PRICE_ROLES, COUNT_ROLES, scannerLink, readUser: readUser, ordered: ordered, menuHtml: menuHtml, sideHtml: sideHtml, printerItemHtml: printerItemHtml, scannerTailHtml: scannerTailHtml };
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPNav;
// The scanner cannot take a repo change from this site, but it already loads this file.
// JO card zones (scan-zones.js) ride along so a phone can label every section of the card without a scanner release.
// The start screen's stone photo is replaced with plain white the same way.
if (typeof document !== 'undefined' && document.createElement && document.addEventListener && document.querySelectorAll) {
  // Pressed look on pointerdown, before any click handler can await. Cleared on release.
  var pressSel = 'button, [role="button"], a.pill, a.fchip, a.lnk, .tap';
  function pressClear() {
    var nodes = document.querySelectorAll('.is-down'), n;
    for (n = 0; n < nodes.length; n++) nodes[n].classList.remove('is-down');
  }
  document.addEventListener('pointerdown', function (e) {
    var t = e.target, b;
    if (!t || !t.closest) return;
    b = t.closest(pressSel);
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    b.classList.add('is-down');
  }, true);
  document.addEventListener('pointerup', pressClear, true);
  document.addEventListener('pointercancel', pressClear, true);
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
    ['vendor/qrcode.js?v=1', 'vendor/niimbluelib-0.47.1.js?v=1', 'print-label.js?v=21', 'print.js?v=37'].forEach(function (rel) {
      var ps = document.createElement('script');
      ps.src = base + rel;
      ps.async = false;
      (document.head || document.documentElement).appendChild(ps);
    });
  }
  if (base && !document.querySelector('script[src*="scan-zones.js"]')) {
    var zs = document.createElement('script');
    zs.src = base + 'scan-zones.js?v=21';
    (document.head || document.documentElement).appendChild(zs);
  }
  // Card Scanner start screen: drop the stone photo. Other screens are already white.
  var scanFlag = document.documentElement.getAttribute('data-oyp-scanner');
  var path = (typeof location !== 'undefined' && location && location.pathname) || '';
  var onScanPath = /jo-scanner/.test(path) || /(^|\/)scan(\/|$)/.test(path);
  var onScanner = scanFlag === '1' ? true : scanFlag === '0' ? false
    : onScanPath
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
