/* OYP Design (Settings › Design): the owner's text size, heading size, spacing, corners, box height and content width,
   applied as CSS variables on <html> (app.css: every size is calc(<original px>*var(--x)); 1 = the original look).
   Loaded in <head> before the page draws, so there is no flash. Same idea as the page-data cache in app.js (stale-while-revalidate):
   the last values are kept in localStorage and applied at once, then the server is asked again in the background (at most every
   5 minutes) and the page follows if they changed. Not tied to a sign-in, so it also works on the customer pages and after log out.
   Server: action settingsDesign (Settings.gs, no sign-in needed, returns only these 6 numbers). Before that paste, a value saved on the
   Design page is kept on that device only (oypDesignLocal), and it wins on that device until it is saved for everyone or reset. */
(function () {
  'use strict';
  var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
  // key: [css variable, default, min, max, step, unit] (the variable is value / default, so the default is exactly 1)
  var KEYS = { text: ['--fs', 16, 12, 22, 0.5, 'px'], head: ['--hs', 26, 18, 40, 1, 'px'], space: ['--sp', 100, 50, 200, 5, '%'],
    radius: ['--rad', 14, 0, 28, 1, 'px'], box: ['--bh', 100, 60, 200, 5, '%'], width: ['--cw', 100, 70, 150, 5, '%'] };
  var LS = 'oypDesign', LOCAL = 'oypDesignLocal', FRESH = 5 * 60e3, root = document.documentElement;
  var get = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  var put = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function clean(v) { // only known keys, numbers inside the range; anything else = default (left out)
    var o = {}; v = v || {};
    Object.keys(KEYS).forEach(function (k) { var d = KEYS[k], n = Number(v[k]);
      if (v[k] !== '' && v[k] != null && !isNaN(n) && n >= d[2] && n <= d[3] && n !== d[1]) o[k] = n; });
    return o;
  }
  function write(v) { // set (or remove) the variables; a default value removes it, so the stylesheet's 1 applies
    v = clean(v);
    Object.keys(KEYS).forEach(function (k) { var d = KEYS[k];
      if (k in v) root.style.setProperty(d[0], String(Math.round(v[k] / d[1] * 10000) / 10000)); else root.style.removeProperty(d[0]); });
  }
  var srv = function () { var c = get(LS); return c && c.v ? clean(c.v) : {}; };
  var local = function () { var l = get(LOCAL); return l ? clean(l) : null; };
  var current = function () { return local() || srv(); }; // what this device shows when nobody is dragging a slider
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
    KEYS: KEYS, clean: clean, current: current, server: srv, local: local,
    preview: function (v) { previewing = true; write(v); },          // live preview while a slider moves (this page only)
    restore: function () { previewing = false; write(current()); }, // leave the page / cancel: back to the saved look
    setServer: function (v) { put(LS, { t: Date.now(), v: clean(v) }); },
    setLocal: function (v) { put(LOCAL, clean(v)); },
    clearLocal: function () { put(LOCAL, null); },
    refresh: refresh
  };
})();
