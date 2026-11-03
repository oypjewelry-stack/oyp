/**
 * OYP: who may see cost, price, markup, material cost, and rate formulas.
 * Paste as a NEW script file named Money. Do not paste this over another file.
 *
 * Admin may see money. A production manager (Susan) and plain staff may not.
 * Accounting is not decided here. Payments, quotes, and balances stay as they are.
 *
 * No new OAuth scopes. Do not add any scopes.
 *
 * The live readers and writers are not in this repo, so this file cannot FIND them.
 * After pasting Money.gs, call the helpers below from these live functions:
 *   invList_            InventoryPages.gs   strip cost, price, margin_pct on each job when moneyHidden_; set can.cost and can.price false. Leave the JO-photo gate alone.
 *   jobReviewSave_      JobSync.gs          rejectMoneyWrite_ before writing. Do not store a blank over an existing cost or price.
 *   matSave_ / matMove_ Materials           reject unit_cost, last_cost, stock_cost, total_cost when moneyHidden_. If the key is absent, leave the cell.
 *   prodJob_            Production.gs       do not send can.costs, labor_cost, or session cost when moneyHidden_.
 *   prodWorkerSave_     Production.gs       reject labor_code changes when moneyHidden_. A save that omits labor_code keeps the current rate.
 *   priceGet_ / priceSaveRate_ / priceJobCost_ / costRates_ / costSave_   Prices.gs and Costing.gs
 *                       return { ok: false, error: 'Not allowed', code: 'FORBIDDEN' } when moneyHidden_.
 *   dashboard_          Dashboard.gs        when moneyHidden_, omit sales totals, payment amounts, and consignment values (can.sales, can.prices, can.payments false).
 */
function moneyHidden_(user) {
  var role = String(user && user.role || '');
  return role === 'production_manager' || role === 'staff';
}

var MONEY_KEYS = {
  cost: 1, price: 1, margin: 1, margin_pct: 1, markup: 1, srp: 1,
  unit_cost: 1, last_cost: 1, stock_cost: 1, total_cost: 1, labor_cost: 1,
  quote_amount: 1, your_price: 1, agreed_value: 1, retail_price: 1, tag_price: 1, sold_price: 1
};

function stripMoney_(value, user) {
  if (!moneyHidden_(user) || value == null) return value;
  if (Object.prototype.toString.call(value) === '[object Array]') {
    value.forEach(function (row) { stripMoney_(row, user); });
    return value;
  }
  if (typeof value !== 'object') return value;
  Object.keys(value).forEach(function (k) {
    if (MONEY_KEYS[k] || /cost|price|markup|margin/i.test(k)) delete value[k];
    else stripMoney_(value[k], user);
  });
  if (value.can && typeof value.can === 'object') {
    value.can.cost = false;
    value.can.price = false;
    value.can.costs = false;
    value.can.prices = false;
    value.can.sales = false;
  }
  return value;
}

function rejectMoneyWrite_(req, user) {
  if (!moneyHidden_(user) || !req) return null;
  var bag = [], i, k;
  [req, req.set, req.item, req.body].forEach(function (obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (key) { if (MONEY_KEYS[key]) bag.push(key); });
  });
  var items = req.items;
  if (Object.prototype.toString.call(items) === '[object Array]') {
    for (i = 0; i < items.length; i++) {
      if (!items[i]) continue;
      for (k in items[i]) if (MONEY_KEYS[k] && items[i][k] !== '' && items[i][k] != null) bag.push(k);
    }
  }
  if (!bag.length) return null;
  return { ok: false, error: 'Cost and price are not for this role', code: 'FORBIDDEN' };
}
