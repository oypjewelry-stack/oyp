/**
 * OYP money gate. Paste as a NEW script file named Money.
 * Do not paste this over Auth.gs. No new OAuth scopes.
 *
 * Admin may see cost, price, markup, and material cost. Accounting is not
 * moneyHidden_, so Payments, Quotes, and Balances stay as they are.
 * A production manager and plain staff are moneyHidden_.
 *
 * doPost is the choke point. moneyPrepare_ runs at the top of handleAction_,
 * before any handler and before a cache write. moneyOut_ runs where doPost
 * serializes the result, on a copy, after dcacheRead_ has already stored the
 * full answer. A stripped copy is never written back. Inventory, materials,
 * production, prices, consignment, and the dashboard need no edits.
 */
function moneyHidden_(user) {
  var role = String(user && user.role || '');
  return role === 'production_manager' || role === 'staff';
}

/* Keys the staff pages actually read as money. weight_g, status, qty, jo, and
   client are not in this list. total is a to-do count as well as a price, so
   it is not stripped; cost_total and month_sales are. */
var MONEY_KEYS = {
  cost: 1, price: 1, sell_price: 1, unit_cost: 1, last_cost: 1, stock_cost: 1,
  total_cost: 1, labor_cost: 1, material_cost: 1, cost_total: 1, today_cost_total: 1,
  margin: 1, margin_pct: 1, markup: 1, markups: 1, srp: 1, quote_amount: 1,
  your_price: 1, retail_price: 1, tag_price: 1, sold_price: 1, agreed_value: 1,
  value: 1, amount: 1, balance: 1, paid: 1, owed: 1, quoted: 1, month_sales: 1,
  premium_pct: 1, rate: 1, rates: 1
};

function stripMoney_(value, user) {
  if (!moneyHidden_(user) || value == null) return value;
  if (Object.prototype.toString.call(value) === '[object Array]') {
    for (var i = 0; i < value.length; i++) stripMoney_(value[i], user);
    return value;
  }
  if (typeof value !== 'object') return value;
  var keys = Object.keys(value), n, k;
  for (n = 0; n < keys.length; n++) {
    k = keys[n];
    if (MONEY_KEYS[k]) { delete value[k]; continue; }
    if (k === 'can' && value.can && typeof value.can === 'object') {
      value.can.cost = false;
      value.can.price = false;
      value.can.costs = false;
      value.can.prices = false;
      value.can.sales = false;
      continue;
    }
    stripMoney_(value[k], user);
  }
  return value;
}

function rejectMoneyWrite_(req, user) {
  if (!moneyHidden_(user) || !req || typeof req !== 'object') return null;
  var found = false;
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Object.prototype.toString.call(obj) === '[object Array]') {
      for (var i = 0; i < obj.length; i++) walk(obj[i]);
      return;
    }
    Object.keys(obj).forEach(function (k) {
      if (MONEY_KEYS[k]) { found = true; delete obj[k]; return; }
      if (k === 'set' || k === 'item' || k === 'items' || k === 'body') walk(obj[k]);
    });
  }
  walk(req);
  if (!found) return null;
  return { ok: false, error: 'Cost and price are not for this role', code: 'FORBIDDEN' };
}

function moneyPrepare_(req, user) { return rejectMoneyWrite_(req, user); }

/* Same session lookup the handlers use when s.user was not passed in.
   Quoted from paste/InventoryCount.gs countUser_. */
function moneyUser_(req, s) {
  if (s && s.user && (s.user.role || s.user.username)) return s.user;
  if (s && s.username && !s.user) return s;
  try {
    var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req || {}) : null;
    if (sess && sess.user && sess.user.username) return sess.user;
    if (sess && sess.username) return sess;
  } catch (e) {}
  return null;
}

/* Strip a copy. The object handleAction_ returned is left intact, so a shared
   cache that still points at it keeps cost and price for admin. */
function moneyOut_(req, s, out) {
  var user = moneyUser_(req, s);
  if (!moneyHidden_(user) || out == null || typeof out !== 'object') return out;
  var copy = out;
  try { copy = JSON.parse(JSON.stringify(out)); } catch (e2) { copy = out; }
  return stripMoney_(copy, user);
}
