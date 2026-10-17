/* OYP back-office menu: one list shared by the back office (oypjewelry.com) and the card scanner (jo-scanner).
   The scanner loads this file from https://oypjewelry.com/nav.js so both menus always match. */
(function (root) {
'use strict';
// back office lives at /staff/ since the site split (oypjewelry.com/ is the customer landing page)
const STAFF = 'https://oypjewelry.com/staff/';
const SITE = STAFF; // kept for older scanner builds that read OYPNav.SITE
const SCANNER = 'https://oypjewelry-stack.github.io/jo-scanner/';
const NAV = {
  admin: [['dashboard', 'Dashboard'], ['review', 'To review'], ['estimate', 'Cost estimator'], ['jos', 'Inventory'], ['scanner', 'Scanner'], ['inventory', 'Materials'], ['prices', 'Material prices'], ['customers', 'Customers'], ['shop', 'Shop listings'], ['payments', 'Quotes / payments'], ['users', 'Staff logins'], ['settings', 'Settings']],
  production_manager: [['dashboard', 'Dashboard'], ['review', 'To review'], ['estimate', 'Cost estimator'], ['jos', 'Inventory'], ['scanner', 'Scanner'], ['production', 'Production'], ['inventory', 'Materials'], ['prices', 'Material prices']],
  accounting: [['dashboard', 'Dashboard'], ['payments', 'Payments'], ['quotes', 'Quotes'], ['balances', 'Balances'], ['clients', 'Clients (billing)'], ['jos', 'Inventory (view)']]
};
const ROLE_LABEL = { admin: 'Admin', production_manager: 'Production manager', accounting: 'Accounting', staff: 'Staff' };
// link to the scanner that tells it whose menu to show (the role only picks menu items; every page still checks the sign-in)
const scannerLink = role => SCANNER + (role ? '?role=' + encodeURIComponent(role) : '');
root.OYPNav = { SITE, STAFF, SCANNER, NAV, ROLE_LABEL, scannerLink };
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPNav;
})(typeof window !== 'undefined' ? window : globalThis);
