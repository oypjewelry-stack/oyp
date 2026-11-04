/**
 * OYP money gate. Paste as a NEW script file named Money.
 * Do not paste this over Auth.gs. No new OAuth scopes.
 *
 * Admin may see cost, price, markup, and material cost. Accounting is not
 * moneyHidden_, so Payments, Quotes, and Balances stay as they are.
 * A production manager and plain staff are moneyHidden_.
 *
 * Code.gs doPost wraps fastAction_ and handleAction_ with moneyGate_.
 * moneyPrepare_ runs in handleAction_ after the signed-in check, where s.user
 * exists, and again inside moneyGate_ before a Fast.gs cached read. moneyOut_
 * strips a copy after that read is stored. A stripped copy is never written back.
 */
function moneyHidden_(user) {
  var role = String(user && user.role || '');
  return role === 'production_manager' || role === 'staff';
}

/* Keys the staff pages actually read as money. weight_g, status, qty, jo, and
   client are not in this list. total is a to-do count as well as a price, so
   it is not stripped; the Review page hides q.total itself. */
var MONEY_KEYS = {
  cost: 1, price: 1, sell_price: 1, unit_cost: 1, last_cost: 1, stock_cost: 1,
  total_cost: 1, labor_cost: 1, material_cost: 1, cost_total: 1, today_cost_total: 1,
  margin: 1, margin_pct: 1, markup: 1, markups: 1, srp: 1, quote_amount: 1,
  your_price: 1, retail_price: 1, tag_price: 1, sold_price: 1, agreed_value: 1,
  value: 1, amount: 1, balance: 1, paid: 1, owed: 1, quoted: 1, month_sales: 1,
  premium_pct: 1, rate: 1, rates: 1,
  labor: 1, labor_repair: 1, labor_stock: 1, unit_price_php: 1, total_php: 1,
  price_php: 1, spot_php_g: 1, suggested_php_g: 1, srp_total: 1, quoted_cost_total: 1,
  cost_stones: 1, cost_materials: 1, cost_labor: 1, new_rate: 1, old_rate: 1,
  rates_used: 1, rates_json: 1, premium: 1, at_srp: 1, at_srp_pct: 1,
  at_your_price: 1, at_your_price_pct: 1, paid_amount: 1, sales: 1, sales_month: 1,
  stone_price: 1, selling_price: 1, profit: 1
};
var MONEY_ACTIONS = {
  costRates: 1, priceGet: 1, priceHistory: 1, priceJobCost: 1, costQuotes: 1, costCalc: 1,
  payData: 1, payReceipt: 1, settingsRate: 1, settingsPremium: 1, pricePremium: 1,
  priceAccept: 1, priceRefresh: 1, costSave: 1, costRateSave: 1, portalMarkApproved: 1,
  portalUnlockCost: 1
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
    if ((k === 'quotes' || k === 'accepted') && value[k] && typeof value[k] === 'object') stripQuoteTotals_(value[k]);
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
/* portalSteps quotes and accepted quotes carry a peso total. A to-do total is a count and stays. */
function stripQuoteTotals_(bag) {
  var list, i, one, ids;
  if (Object.prototype.toString.call(bag) === '[object Array]') list = bag;
  else {
    list = [];
    ids = Object.keys(bag);
    for (i = 0; i < ids.length; i++) list.push(bag[ids[i]]);
  }
  for (i = 0; i < list.length; i++) {
    one = list[i];
    if (one && typeof one === 'object') delete one.total;
  }
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
      walk(obj[k]);
    });
  }
  walk(req);
  if (!found) return null;
  return { ok: false, error: 'Cost and price are not for this role', code: 'FORBIDDEN' };
}

function moneyPrepare_(req, user) {
  if (moneyHidden_(user) && MONEY_ACTIONS[String(req && req.action || '')]) {
    return { ok: false, error: 'Cost and price are not for this role', code: 'FORBIDDEN' };
  }
  return rejectMoneyWrite_(req, user);
}

/* sessionFrom_ takes the session string, the same way PhotoFast calls sessionFrom_(req.session). */
function moneyUser_(req, s) {
  if (s && s.user && (s.user.role || s.user.username)) return s.user;
  if (s && s.username && !s.user) return s;
  try {
    var sess = (typeof sessionFrom_ === 'function') ? sessionFrom_(req && req.session) : null;
    if (sess && sess.user && (sess.user.username || sess.user.role)) return sess.user;
    if (sess && sess.username) return sess;
  } catch (e) {}
  return null;
}

function moneyStripCopy_(user, out) {
  if (!moneyHidden_(user) || out == null || typeof out !== 'object') return out;
  var copy = out;
  try { copy = JSON.parse(JSON.stringify(out)); } catch (e2) { copy = out; }
  return stripMoney_(copy, user);
}

function moneyOut_(req, s, out) {
  var user = moneyUser_(req, s);
  if (req && String(req.action) === 'login' && out && out.user) user = out.user;
  return moneyStripCopy_(user, out);
}

/* Called from Code.gs doPost before fastAction_ or handleAction_ runs. */
function moneyGate_(req, run) {
  if (typeof fastInstall_ === 'function') { try { fastInstall_(); } catch (eF) {} }
  var denied = moneyPrepare_(req, moneyUser_(req, null));
  if (denied) return denied;
  var out = run();
  return moneyOut_(req, null, out);
}
