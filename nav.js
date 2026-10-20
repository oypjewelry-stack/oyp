/* OYP back-office menu: one list shared by the back office (oypjewelry.com) and the card scanner (jo-scanner).
   The scanner loads this file from https://oypjewelry.com/nav.js so both menus always match. */
(function (root) {
'use strict';
// back office lives at /staff/ since the site split (oypjewelry.com/ is the customer landing page)
const STAFF = 'https://oypjewelry.com/staff/';
const SITE = STAFF; // kept for older scanner builds that read OYPNav.SITE
const SCANNER = 'https://oypjewelry-stack.github.io/jo-scanner/';
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['appts', 'Appointments'], ['review', 'To review'], ['estimate', 'Cost estimator'], ['jos', 'Inventory'], ['consignment', 'Consignment'], ['production', 'Production'], ['scanner', 'Scanner'], ['inventory', 'Materials'], ['prices', 'Material prices'], ['customers', 'Customers'], ['shop', 'Shop listings'], ['payments', 'Quotes / payments'], ['settings', 'Settings']], // 'Staff logins' hidden (Oct 18): staff accounts live in Settings › Staff accounts; #/users opens it
  production_manager: [['dashboard', 'Dashboard'], ['appts', 'Appointments'], ['review', 'To review'], ['estimate', 'Cost estimator'], ['jos', 'Inventory'], ['consignment', 'Consignment'], ['scanner', 'Scanner'], ['production', 'Production'], ['inventory', 'Materials'], ['prices', 'Material prices'], ['balances', 'Balances']],
  accounting: [['dashboard', 'Dashboard'], ['appts', 'Appointments'], ['payments', 'Payments'], ['quotes', 'Quotes'], ['balances', 'Balances'], ['clients', 'Clients (billing)'], ['jos', 'Inventory (view)']],
  staff: [['home', 'Home'], ['appts', 'Appointments'], ['scanner', 'Scanner']] // staff keep their simple home; Appointments opens in the back office. No Production (Susan + admins only)
};
// back-office only: kept out of the scanner menu (the scanner reads OYPNav.NAV); the back office reads OFFICE_NAV
const OFFICE_ONLY = { production: true, consignment: true };
const OFFICE_NAV = NAV;
const SCAN_NAV = {}; Object.keys(NAV).forEach(r => { SCAN_NAV[r] = NAV[r].filter(([k]) => !OFFICE_ONLY[k]); });
const ROLE_LABEL = { admin: 'Admin', production_manager: 'Production manager', accounting: 'Accounting', staff: 'Staff' };
// link to the scanner that tells it whose menu to show (the role only picks menu items; every page still checks the sign-in)
const scannerLink = role => SCANNER + (role ? '?role=' + encodeURIComponent(role) : '');
root.OYPNav = { SITE, STAFF, SCANNER, NAV: SCAN_NAV, OFFICE_NAV, ROLE_LABEL, scannerLink };
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
