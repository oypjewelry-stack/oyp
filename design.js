/* OYP Design (Settings › Design): the owner's text size, heading size, spacing, corners, box height and content width,
   applied as CSS variables on <html> (app.css: every size is calc(<original px>*var(--x)); 1 = the original look).
   Loaded in <head> before the page draws, so there is no flash. Same idea as the page-data cache in app.js (stale-while-revalidate):
   the last values are kept in localStorage and applied at once, then the server is asked again in the background (at most every
   5 minutes) and the page follows if they changed. Not tied to a sign-in, so it also works on the customer pages and after log out.
   Server: action settingsDesign (Settings.gs, no sign-in needed). Before that paste, a value saved on the Design page is kept on
   that device only (oypDesignLocal), and it wins on that device until it is saved for everyone or reset.
   Buttons & shapes: PARTS = one entry per type. Percent controls (t text, h height/padding, r corners, w width) still apply as
   --d-<type>-<control> (n/100) so an older save looks the same. A pixel the owner sets is kept in design.parts._px and wins for
   that one control (app.css reads --d-<type>-fp/hp/wp/rp). f = font, g = weight, c = color. New types (box, sw, arrow, hmenu,
   hbody, hprice) ride inside the same design.parts JSON — no new setting key. Fonts: design.font_body / font_head / font_label
   replace --body / --head / --label. A type's own font is f (--d-<type>-f). */
(function () {
  'use strict';
  var DEFAULT_API = 'https://script.google.com/macros/s/AKfycbzUmacbdvb0V2nw9ekharFhZPYdSqVgpFpADKiPM2qhSUUF3G5pJ_cAZ46eQPxeawhV/exec';
  // key: [css variable, default, min, max, step, unit] (the variable is value / default, so the default is exactly 1)
  var KEYS = { text: ['--fs', 16, 12, 22, 0.5, 'px'], head: ['--hs', 26, 18, 40, 1, 'px'], space: ['--sp', 100, 50, 200, 5, '%'],
    radius: ['--rad', 14, 0, 28, 1, 'px'], box: ['--bh', 100, 60, 200, 5, '%'], width: ['--cw', 100, 70, 150, 5, '%'] };
  // Slider units for the two globals that used to read as a percent. [px at 100%, min px, max px, step]
  var GPX = { box: [120, 72, 240, 1], width: [1200, 840, 1800, 10] };
  // type: [controls]; t/h/r/w may be a legacy percent or a pixel in parts._px. f font, g weight, c #rrggbb
  var PARTS = { btn: 'thrwfgc', btnout: 'thrwfgc', btnbig: 'thrfgc', btnsm: 'thrwfgc', link: 'tfgc', menu: 'thfgc', tabs: 'thrfgc', fchip: 'thrwfgc', chip: 'thrwfgc',
    field: 'thrfgc', card: 'thrwfgc', box: 'thrwfgc', pcard: 'thrfgc', modal: 'thrwfgc', toast: 'thrfgc', sw: 'tfgc', arrow: 'thc',
    hmenu: 'tfgc', hbody: 'tfgc', hprice: 'tfgc' };
  // [base px at the original look, min, max]. What the number means: t font-size, h outer height (or circle size), w outer width, r corner radius.
  var PX = {
    btn: { t: [18, 8, 48], h: [47, 24, 140], w: [101, 48, 420], r: [26, 0, 64] },
    btnout: { t: [18, 8, 48], h: [49, 24, 140], w: [130, 48, 420], r: [26, 0, 64] },
    btnbig: { t: [20, 10, 56], h: [54, 28, 180], r: [26, 0, 64] },
    btnsm: { t: [14, 8, 32], h: [34, 20, 90], w: [66, 40, 280], r: [26, 0, 48] },
    link: { t: [12, 8, 28] },
    menu: { t: [13, 8, 28], h: [43, 24, 80] },
    tabs: { t: [12, 8, 28], h: [39, 24, 80], r: [12, 0, 36] },
    fchip: { t: [12, 8, 28], h: [31, 18, 64], w: [73, 36, 280], r: [18, 0, 40] },
    chip: { t: [11, 8, 24], h: [22, 14, 48], w: [93, 36, 280], r: [12, 0, 32] },
    field: { t: [17, 10, 36], h: [44, 28, 88], r: [12, 0, 32] },
    card: { t: [16, 10, 32], h: [113, 48, 320], w: [280, 120, 640], r: [14, 0, 40] },
    box: { t: [16, 10, 32], h: [56, 32, 240], w: [760, 280, 1400], r: [14, 0, 40] },
    pcard: { t: [16, 10, 32], h: [160, 70, 420], r: [12, 0, 32] },
    modal: { t: [16, 10, 32], h: [80, 40, 280], w: [480, 240, 900], r: [18, 0, 48] },
    toast: { t: [14, 10, 28], h: [44, 24, 90], r: [20, 0, 48] },
    sw: { t: [12, 8, 24] },
    arrow: { t: [20, 10, 48], h: [38, 20, 84] },
    hmenu: { t: [20, 12, 56] },
    hbody: { t: [26, 14, 72] },
    hprice: { t: [26, 14, 72] }
  };
  // which global a legacy percent follows, so the pixel on the slider matches the screen. none = the sample's own px.
  var AXIS = {
    // Headers do not follow Headings or body text. A saved pixel is the size, and only that header's elements read it.
    t: { btn: 'hs', btnout: 'hs', btnbig: 'hs', btnsm: 'hs', hmenu: 'none', hbody: 'none', hprice: 'none' },
    h: { arrow: 'none' },
    w: { card: 'none', box: 'cw', modal: 'cw' },
    r: {}
  };
  // outer height = fixed + scale * spacing * heightPercent. scale is the padding (and, for the white button, the border) that the height control grows.
  var HPART = { btn: [21, 26], btnout: [20, 29], btnbig: [24, 30], btnsm: [16, 18], menu: [17, 26], tabs: [17, 22], fchip: [17, 14], chip: [16, 6], field: [20, 24], card: [81, 32], box: [28, 28], pcard: [144, 16], modal: [40, 40], toast: [20, 24] };
  // outer width = content * fontRatio + pad * spacing * widthPercent. Used only to label a legacy percent; a saved pixel sets the width itself.
  var WPART = { btn: [45, 56], btnout: [74, 56], btnsm: [30, 36], fchip: [47, 26], chip: [73, 20] };
  var ABS = { t: 'fp', h: 'hp', w: 'wp', r: 'rp' };
  var HEADER = { hmenu: 1, hbody: 1, hprice: 1 }; // pixel only: do not also publish a --d-<type>-t ratio other scopes could multiply
  var WEIGHTS = { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold' };
  // the fonts already loaded on every staff and customer page (Google Fonts link in each page's <head>): code: [name, the stack app.css uses]
  var FONTS = { libre: ['Libre Bodoni', "'Libre Bodoni','Bodoni 72',Didot,serif"], moda: ['Bodoni Moda', "'Bodoni Moda','Bodoni 72',Didot,serif"],
    inter: ['Inter', 'Inter,Helvetica,sans-serif'] };
  var FKEYS = { font_body: ['--body', 'moda'], font_head: ['--head', 'libre'], font_label: ['--label', 'inter'] }; // key: [variable, the original font]
  var CTL = { t: [70, 160], h: [50, 200], r: [0, 300], w: [50, 200] };
  var LS = 'oypDesign', LOCAL = 'oypDesignLocal', FRESH = 5 * 60e3, root = document.documentElement;
  var get = function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  var put = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function gRatio(g, axis) {
    g = g || {};
    if (axis === 'hs') return ((g.head != null ? g.head : KEYS.head[1]) / KEYS.head[1]);
    if (axis === 'fs') return ((g.text != null ? g.text : KEYS.text[1]) / KEYS.text[1]);
    if (axis === 'sp') return ((g.space != null ? g.space : KEYS.space[1]) / KEYS.space[1]);
    if (axis === 'rad') return ((g.radius != null ? g.radius : KEYS.radius[1]) / KEYS.radius[1]);
    if (axis === 'bh') return ((g.box != null ? g.box : KEYS.box[1]) / KEYS.box[1]);
    if (axis === 'cw') return ((g.width != null ? g.width : KEYS.width[1]) / KEYS.width[1]);
    return 1;
  }
  function axisOf(c, k) { var m = AXIS[k]; if (m && c in m) return m[c]; if (k === 't') return 'fs'; if (k === 'h') return 'sp'; if (k === 'r') return 'rad'; return 'none'; }
  function defaultPx(c, k, g) { var spec = PX[c] && PX[c][k]; if (!spec) return 0; return Math.round(spec[0] * gRatio(g, axisOf(c, k))); }
  function pctToPx(c, k, pct, g) {
    var spec = PX[c] && PX[c][k]; if (!spec) return 0;
    var p = pct == null ? 100 : pct, sp = gRatio(g, 'sp'), fs = gRatio(g, axisOf(c, 't'));
    if (k === 'h' && HPART[c]) return Math.max(spec[1], Math.round(HPART[c][0] * fs + HPART[c][1] * sp * p / 100));
    if (k === 'w' && WPART[c]) return Math.max(spec[1], Math.round(WPART[c][0] * fs + WPART[c][1] * sp * p / 100));
    return Math.round(spec[0] * gRatio(g, axisOf(c, k)) * p / 100);
  }
  // pixel the owner asked for -> the multiplier the existing CSS already understands (1 = original). Width of a button is a real width, not a multiplier.
  function pxToRatio(c, k, px, g) {
    var spec = PX[c] && PX[c][k]; if (!spec || !px) return 1;
    var sp = gRatio(g, 'sp'), fs = gRatio(g, axisOf(c, 't'));
    if (k === 'h' && HPART[c]) { var sc = HPART[c][1] * sp; return sc ? (px - HPART[c][0] * fs) / sc : 1; }
    if (k === 'w' && WPART[c]) { var pad = WPART[c][1] * sp; return pad ? (px - WPART[c][0] * fs) / pad : 1; }
    var den = spec[0] * gRatio(g, axisOf(c, k)); return den ? px / den : 1;
  }
  function sliderOf(stored) { // globals as the Design page shows them (box + width in px)
    var o = {}; stored = stored || {};
    Object.keys(KEYS).forEach(function (k) { o[k] = k in stored ? stored[k] : KEYS[k][1]; });
    Object.keys(GPX).forEach(function (k) { o[k] = Math.round(GPX[k][0] * o[k] / KEYS[k][1]); });
    return o;
  }
  function storedOf(slider) { // slider values -> the numbers settingsDesign already stores
    var o = Object.assign({}, slider || {});
    Object.keys(GPX).forEach(function (k) { if (k in o) o[k] = Math.round(o[k] / GPX[k][0] * KEYS[k][1] * 10) / 10; });
    return o;
  }
  function cleanPx(px) {
    var o = {}; px = px && typeof px === 'object' ? px : {};
    Object.keys(PX).forEach(function (c) { var x = px[c]; if (!x || typeof x !== 'object') return;
      Object.keys(PX[c]).forEach(function (k) { var spec = PX[c][k], n = Number(x[k]);
        if (x[k] !== '' && x[k] != null && !isNaN(n) && n >= spec[1] && n <= spec[2]) (o[c] = o[c] || {})[k] = Math.round(n); }); });
    return o;
  }
  function cleanParts(p) { // {type: {control}} plus _px. Percents: whole numbers in range, 100 left out. Pixels: inside PX range.
    var o = {}; if (typeof p === 'string') { try { p = JSON.parse(p || '{}'); } catch (e) { p = {}; } }
    p = p && typeof p === 'object' ? p : {};
    Object.keys(PARTS).forEach(function (c) { var x = p[c]; if (!x || typeof x !== 'object') return;
      PARTS[c].split('').forEach(function (k) {
        if (k === 'f') { if (FONTS[x.f]) (o[c] = o[c] || {}).f = x.f; return; }
        if (k === 'g') { var w = Number(x.g); if (WEIGHTS[w]) (o[c] = o[c] || {}).g = w; return; }
        if (k === 'c') { if (typeof x.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.c)) (o[c] = o[c] || {}).c = x.c.toLowerCase(); return; }
        var n = Number(x[k]);
        if (x[k] !== '' && x[k] != null && !isNaN(n) && n === Math.round(n) && n >= CTL[k][0] && n <= CTL[k][1] && n !== 100) (o[c] = o[c] || {})[k] = n;
      }); });
    var px = cleanPx(p._px); if (Object.keys(px).length) o._px = px;
    return o;
  }
  function clean(v) { // only known keys, numbers inside the range; anything else = default (left out). parts: only when changed
    var o = {}; v = v || {};
    Object.keys(KEYS).forEach(function (k) { var d = KEYS[k], n = Number(v[k]);
      if (v[k] !== '' && v[k] != null && !isNaN(n) && n >= d[2] && n <= d[3] && n !== d[1]) o[k] = n; });
    Object.keys(FKEYS).forEach(function (k) { if (FONTS[v[k]]) o[k] = v[k]; });
    var p = cleanParts(v.parts); if (Object.keys(p).length) o.parts = p;
    return o;
  }
  var noFonts = function (v) { Object.keys(FKEYS).forEach(function (k) { delete v[k]; }); return v; };
  function cleanFonts(f) { // {font_body.., pf: {type: font}} kept on this device before the fonts paste
    f = f && typeof f === 'object' ? f : {}; var o = {}, pf = {};
    Object.keys(FKEYS).forEach(function (k) { if (FONTS[f[k]]) o[k] = f[k]; });
    Object.keys(PARTS).forEach(function (c) { if (f.pf && FONTS[f.pf[c]]) pf[c] = f.pf[c]; }); o.pf = pf; return o; }
  var PVARS = []; Object.keys(PARTS).forEach(function (c) { PARTS[c].split('').forEach(function (k) { PVARS.push([c, k]); }); });
  function write(v) { // set (or remove) the variables; a default value removes it, so the stylesheet's 1 applies
    v = clean(v);
    Object.keys(KEYS).forEach(function (k) { var d = KEYS[k];
      if (k in v) root.style.setProperty(d[0], String(Math.round(v[k] / d[1] * 10000) / 10000)); else root.style.removeProperty(d[0]); });
    var p = v.parts || {}, px = p._px || {};
    PVARS.forEach(function (x) {
      var c = x[0], k = x[1], rec = p[c] || {}, name = '--d-' + c + '-' + k, abs = '--d-' + c + '-' + (ABS[k] || '');
      if (k === 'f') { if (rec.f && FONTS[rec.f]) root.style.setProperty(name, FONTS[rec.f][1]); else root.style.removeProperty(name); return; }
      if (k === 'g') { if (rec.g) root.style.setProperty(name, String(rec.g)); else root.style.removeProperty(name); return; }
      if (k === 'c') { if (rec.c) root.style.setProperty(name, rec.c); else root.style.removeProperty(name); return; }
      var nPx = px[c] && px[c][k];
      if (nPx != null) {
        root.style.setProperty(abs, nPx + 'px');
        // Header CSS reads only the pixel (--d-h*-fp). Do not also publish --d-h*-t; nothing else should scale from it.
        if (HEADER[c]) { root.style.removeProperty(name); }
        // Button / chip width is a real width (the percent only padded). Other pixels keep the multiplier in step
        // so inner text that follows --fs / --hs / --sp lands on the same pixel.
        else if (k === 'w' && WPART[c]) { if (rec[k] == null) root.style.removeProperty(name); else root.style.setProperty(name, String(rec[k] / 100)); }
        else {
          var ratio = pxToRatio(c, k, nPx, v);
          if (!isFinite(ratio) || ratio < 0.35) ratio = 0.35;
          if (ratio > 3) ratio = 3;
          root.style.setProperty(name, String(Math.round(ratio * 10000) / 10000));
        }
      } else {
        if (ABS[k]) root.style.removeProperty(abs);
        if (rec[k] == null) root.style.removeProperty(name); else root.style.setProperty(name, String(rec[k] / 100));
      }
    });
    Object.keys(FKEYS).forEach(function (k) { if (k in v) root.style.setProperty(FKEYS[k][0], FONTS[v[k]][1]); else root.style.removeProperty(FKEYS[k][0]); });
  }
  var srv = function () { var c = get(LS); return c && c.v ? clean(c.v) : {}; };
  // this device's own look (saved before a paste): {g: six sliders or null, parts: parts or null}; null = follow the server.
  // (Older format: a plain object of the six sliders.)
  var localRaw = function () { var l = get(LOCAL); if (!l || typeof l !== 'object') return null;
    if (!('g' in l) && !('parts' in l) && !('fonts' in l)) l = { g: l, parts: null };
    var o = { g: l.g ? noFonts(clean(l.g)) : null, parts: l.parts ? cleanParts(l.parts) : null, fonts: l.fonts ? cleanFonts(l.fonts) : null }; delete (o.g || {}).parts;
    return o.g || o.parts || o.fonts ? o : null; };
  var localFonts = function () { var l = localRaw(); return l && l.fonts ? l.fonts : null; }; // fonts kept on this device (before the fonts paste)
  var local = function () { var l = localRaw(); return l && l.g ? l.g : null; };            // the six sliders kept on this device
  var localParts = function () { var l = localRaw(); return l && l.parts ? l.parts : null; }; // the parts kept on this device
  var current = function () { // what this device shows when nobody is dragging a slider
    var s = srv(), g = local(), lp = localParts(), o = {};
    Object.keys(KEYS).forEach(function (k) { var src = g || s; if (k in src) o[k] = src[k]; });
    var lf = localFonts(), fs = lf || s;
    Object.keys(FKEYS).forEach(function (k) { if (fs[k]) o[k] = fs[k]; });
    var p = JSON.parse(JSON.stringify(lp || s.parts || {}));
    if (lf) { Object.keys(p).forEach(function (c) { if (c === '_px' || !p[c]) return; delete p[c].f; }); Object.keys(lf.pf).forEach(function (c) { (p[c] = p[c] || {}).f = lf.pf[c]; }); }
    Object.keys(p).forEach(function (c) { if (c === '_px') return; if (!p[c] || !Object.keys(p[c]).length) delete p[c]; });
    if (Object.keys(p).length) o.parts = p;
    return o; };
  var setLocalRaw = function (g, parts, fonts) { if (fonts === undefined) fonts = localFonts();
    put(LOCAL, g || parts || fonts ? { g: g || null, parts: parts || null, fonts: fonts || null } : null); };
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
    KEYS: KEYS, GPX: GPX, PARTS: PARTS, PX: PX, CTL: CTL, FONTS: FONTS, FKEYS: FKEYS, WEIGHTS: WEIGHTS, ABS: ABS,
    clean: clean, cleanParts: cleanParts, current: current, server: srv, local: local, localParts: localParts, localFonts: localFonts,
    defaultPx: defaultPx, pctToPx: pctToPx, sliderOf: sliderOf, storedOf: storedOf,
    preview: function (v) { previewing = true; write(v); },          // live preview while a slider moves (this page only)
    restore: function () { previewing = false; write(current()); }, // leave the page / cancel: back to the saved look
    setServer: function (v) { put(LS, { t: Date.now(), v: clean(v) }); },
    setLocal: function (v) { var c = noFonts(clean(v)); delete c.parts; setLocalRaw(c, localParts()); },        // the six sliders, this device only
    clearLocal: function () { setLocalRaw(null, localParts()); },
    setLocalParts: function (p) { var c = cleanParts(p); setLocalRaw(local(), Object.keys(c).length ? c : {}); }, // {} = "original look on this device"
    clearLocalParts: function () { setLocalRaw(local(), null); },
    setLocalFonts: function (f) { setLocalRaw(local(), localParts(), cleanFonts(f)); }, // fonts on this device only (before the fonts paste)
    clearLocalFonts: function () { setLocalRaw(local(), localParts(), null); },
    refresh: refresh
  };
})();
