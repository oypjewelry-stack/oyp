/* OYP Design (Settings › Design): the owner's text size, heading size, spacing, corners, box height and content width,
   applied as CSS variables on <html> (app.css: every size is calc(<original px>*var(--x)); 1 = the original look).
   Loaded in <head> before the page draws, so there is no flash. Same idea as the page-data cache in app.js (stale-while-revalidate):
   the last values are kept in localStorage and applied at once, then the server is asked again in the background (at most every
   5 minutes) and the page follows if they changed. Not tied to a sign-in, so it also works on the customer pages and after log out.
   Server: action settingsDesign (Settings.gs, no sign-in needed, returns only these 6 numbers). Before that paste, a value saved on the
   Design page is kept on that device only (oypDesignLocal), and it wins on that device until it is saved for everyone or reset.
   Buttons & shapes (Oct 18): PARTS = one entry per type of button / shape; each has its own text (t), height (h), corners (r) and width (w)
   in percent (100 = as the global sliders make it). Written as --d-<type>-<control> on <html> (app.css re-scopes the variables on that type),
   stored as ONE setting design.parts (JSON, only the changed values) and returned by settingsDesign as design.parts. Before the paste that
   adds design.parts, the parts are kept on this device only, separately from the six sliders (oypDesignLocal = {g, parts}). */
(function () {
  'use strict';
  var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
  // key: [css variable, default, min, max, step, unit] (the variable is value / default, so the default is exactly 1)
  var KEYS = { text: ['--fs', 16, 12, 22, 0.5, 'px'], head: ['--hs', 26, 18, 40, 1, 'px'], space: ['--sp', 100, 50, 200, 5, '%'],
    radius: ['--rad', 14, 0, 28, 1, 'px'], box: ['--bh', 100, 60, 200, 5, '%'], width: ['--cw', 100, 70, 150, 5, '%'] };
  // type: [controls] ; control: [min, max] in % (step 5, 100 = no change)
  var PARTS = { btn: 'thrw', btnout: 'thrw', btnbig: 'thr', btnsm: 'thrw', link: 't', menu: 'th', tabs: 'thr', fchip: 'thrw', chip: 'thrw',
    field: 'thr', card: 'thrw', pcard: 'thr', modal: 'thrw', toast: 'thr' };
  var CTL = { t: [70, 160], h: [50, 200], r: [0, 300], w: [50, 200] };
  var LS = 'oypDesign', LOCAL = 'oypDesignLocal', FRESH = 5 * 60e3, root = document.documentElement;
  var get = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  var put = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function cleanParts(p) { // {type: {control: %}} -> only known types/controls, whole numbers in range, 100 left out
    var o = {}; if (typeof p === 'string') { try { p = JSON.parse(p || '{}'); } catch (e) { p = {}; } }
    p = p && typeof p === 'object' ? p : {};
    Object.keys(PARTS).forEach(function (c) { var x = p[c]; if (!x || typeof x !== 'object') return;
      PARTS[c].split('').forEach(function (k) { var n = Number(x[k]);
        if (x[k] !== '' && x[k] != null && !isNaN(n) && n === Math.round(n) && n >= CTL[k][0] && n <= CTL[k][1] && n !== 100) (o[c] = o[c] || {})[k] = n; }); });
    return o;
  }
  function clean(v) { // only known keys, numbers inside the range; anything else = default (left out). parts: only when changed
    var o = {}; v = v || {};
    Object.keys(KEYS).forEach(function (k) { var d = KEYS[k], n = Number(v[k]);
      if (v[k] !== '' && v[k] != null && !isNaN(n) && n >= d[2] && n <= d[3] && n !== d[1]) o[k] = n; });
    var p = cleanParts(v.parts); if (Object.keys(p).length) o.parts = p;
    return o;
  }
  var PVARS = []; Object.keys(PARTS).forEach(function (c) { PARTS[c].split('').forEach(function (k) { PVARS.push([c, k]); }); });
  function write(v) { // set (or remove) the variables; a default value removes it, so the stylesheet's 1 applies
    v = clean(v);
    Object.keys(KEYS).forEach(function (k) { var d = KEYS[k];
      if (k in v) root.style.setProperty(d[0], String(Math.round(v[k] / d[1] * 10000) / 10000)); else root.style.removeProperty(d[0]); });
    var p = v.parts || {};
    PVARS.forEach(function (x) { var n = p[x[0]] && p[x[0]][x[1]], name = '--d-' + x[0] + '-' + x[1];
      if (n != null) root.style.setProperty(name, String(n / 100)); else root.style.removeProperty(name); });
  }
  var srv = function () { var c = get(LS); return c && c.v ? clean(c.v) : {}; };
  // this device's own look (saved before a paste): {g: six sliders or null, parts: parts or null}; null = follow the server.
  // (Older format: a plain object of the six sliders.)
  var localRaw = function () { var l = get(LOCAL); if (!l || typeof l !== 'object') return null;
    if (!('g' in l) && !('parts' in l)) l = { g: l, parts: null };
    var o = { g: l.g ? clean(l.g) : null, parts: l.parts ? cleanParts(l.parts) : null }; delete (o.g || {}).parts;
    return o.g || o.parts ? o : null; };
  var local = function () { var l = localRaw(); return l && l.g ? l.g : null; };            // the six sliders kept on this device
  var localParts = function () { var l = localRaw(); return l && l.parts ? l.parts : null; }; // the parts kept on this device
  var current = function () { // what this device shows when nobody is dragging a slider
    var s = srv(), g = local(), lp = localParts(), o = {};
    Object.keys(KEYS).forEach(function (k) { var src = g || s; if (k in src) o[k] = src[k]; });
    var p = lp || s.parts; if (p && Object.keys(p).length) o.parts = p;
    return o; };
  var setLocalRaw = function (g, parts) { put(LOCAL, g || parts ? { g: g || null, parts: parts || null } : null); };
  var previewing = false;
  function applyNow() { if (!previewing) write(current()); }
  applyNow(); // before the first paint
  var api = function () { try { return localStorage.getItem('oypApi') || DEFAULT_API; } catch (e) { return DEFAULT_API; } };
  function refresh(force) {
    var c = get(LS);
    if (!force && c && Date.now() - (c.t || 0) < FRESH) return Promise.resolve(false);
    return fetch(api(), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'settingsDesign', device_id: (function () { try { return localStorage.getItem('oypDevice') || ''; } catch (e) { return ''; } })() }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { if (!r || !r.ok || !r.design) { put(LS, { t: Date.now(), v: c && c.v ? c.v : null }); return false; } // not pasted yet: keep what we have, ask again in 5 min
        var before = JSON.stringify(srv()); put(LS, { t: Date.now(), v: clean(r.design) }); applyNow(); return before !== JSON.stringify(srv()); })
      .catch(function () { return false; });
  }
  if (get(LS)) setTimeout(function () { refresh(false); }, 1500); else refresh(true); // first visit on this device: ask at once; later: after the page's own first requests
  window.OYPDesign = {
    KEYS: KEYS, PARTS: PARTS, CTL: CTL, clean: clean, cleanParts: cleanParts, current: current, server: srv, local: local, localParts: localParts,
    preview: function (v) { previewing = true; write(v); },          // live preview while a slider moves (this page only)
    restore: function () { previewing = false; write(current()); }, // leave the page / cancel: back to the saved look
    setServer: function (v) { put(LS, { t: Date.now(), v: clean(v) }); },
    setLocal: function (v) { var c = clean(v); delete c.parts; setLocalRaw(c, localParts()); },        // the six sliders, this device only
    clearLocal: function () { setLocalRaw(null, localParts()); },
    setLocalParts: function (p) { var c = cleanParts(p); setLocalRaw(local(), Object.keys(c).length ? c : {}); }, // {} = "original look on this device"
    clearLocalParts: function () { setLocalRaw(local(), null); },
    refresh: refresh
  };
})();
