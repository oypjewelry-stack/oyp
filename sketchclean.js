/* Isolate the hand-drawn jewelry drawing on a JO card page-2 scan, drop handwriting, centre the drawing on a white canvas. Pure JS on RGBA arrays. */
var SKETCHCLEAN_ROI = { x: 0.578, y: 0.150, w: 0.377, h: 0.815 };
var SKETCHCLEAN_HEAD = { x: 0.725, y: 0.150, w: 0.085, h: 0.0365 };

function sketchClean(rgba, w, h, fallbackBox, opt) {
  opt = opt || {};
  var R = SKETCHCLEAN_ROI, HD = SKETCHCLEAN_HEAD;
  w = w | 0; h = h | 0;
  if (!rgba || w < 200 || h < 120) return { ok: false, confident: false, reason: 'tiny image' };
  var rx0 = Math.round(w * R.x), ry0 = Math.round(h * R.y);
  var rx1 = Math.min(w, Math.round(w * (R.x + R.w))), ry1 = Math.min(h, Math.round(h * (R.y + R.h)));
  var rw = rx1 - rx0, rh = ry1 - ry0;
  var f = Math.max(1, Math.round(rh / 700));
  var gw = Math.floor(rw / f), gh = Math.floor(rh / f), n = gw * gh;
  var L = new Float32Array(n), S = new Uint8Array(n), ff = f * f;
  for (var gy = 0; gy < gh; gy++) for (var gx = 0; gx < gw; gx++) {
    var sr = 0, sg = 0, sb = 0;
    for (var yy = 0; yy < f; yy++) {
      var o = ((ry0 + gy * f + yy) * w + rx0 + gx * f) * 4;
      for (var xx = 0; xx < f; xx++, o += 4) { sr += rgba[o]; sg += rgba[o + 1]; sb += rgba[o + 2]; }
    }
    var p = gy * gw + gx;
    L[p] = (0.299 * sr + 0.587 * sg + 0.114 * sb) / ff;
    S[p] = (Math.max(sr, sg, sb) - Math.min(sr, sg, sb)) / ff;
  }
  var T = 24, tw = Math.ceil(gw / T), th = Math.ceil(gh / T), P = new Float32Array(tw * th), hist = new Uint32Array(256);
  var all = new Uint32Array(256);
  for (var i = 0; i < n; i += 3) all[L[i] | 0]++;
  var tot = 0, c = 0, gpaper = 240; for (i = 0; i < 256; i++) tot += all[i];
  for (i = 0; i < 256; i++) { c += all[i]; if (c >= tot * 0.9) { gpaper = i; break; } }
  for (var ty = 0; ty < th; ty++) for (var tx = 0; tx < tw; tx++) {
    hist.fill(0); var cnt = 0;
    for (gy = ty * T; gy < Math.min(gh, ty * T + T); gy++) for (gx = tx * T; gx < Math.min(gw, tx * T + T); gx++) { hist[L[gy * gw + gx] | 0]++; cnt++; }
    var q = 0; c = 0; for (i = 0; i < 256; i++) { c += hist[i]; if (c >= cnt * 0.85) { q = i; break; } }
    P[ty * tw + tx] = Math.max(q, gpaper * 0.93);
  }
  var Pg = new Float32Array(n);
  for (gy = 0; gy < gh; gy++) {
    var fy = Math.max(0, Math.min(th - 1, (gy - T / 2) / T)), y0 = Math.floor(fy), y1 = Math.min(th - 1, y0 + 1), wy = fy - y0;
    for (gx = 0; gx < gw; gx++) {
      var fx = Math.max(0, Math.min(tw - 1, (gx - T / 2) / T)), x0 = Math.floor(fx), x1 = Math.min(tw - 1, x0 + 1), wx = fx - x0;
      Pg[gy * gw + gx] = (P[y0 * tw + x0] * (1 - wx) + P[y0 * tw + x1] * wx) * (1 - wy) + (P[y1 * tw + x0] * (1 - wx) + P[y1 * tw + x1] * wx) * wy;
    }
  }
  var M = new Uint8Array(n), D = new Uint8Array(n), C = new Uint8Array(n);
  for (i = 0; i < n; i++) {
    var lr = L[i] / Pg[i];
    var col = S[i] > 42 && lr < 0.97 && lr > 0.45;
    if (lr < 0.64) D[i] = 1;
    if (col) C[i] = 1;
    if (lr < 0.84 || col) M[i] = 1;
  }
  function label(mask, W, H, minArea) {
    var lab = new Int32Array(W * H), stack = new Int32Array(W * H), cc = [null], id = 0;
    for (var s = 0; s < W * H; s++) {
      if (!mask[s] || lab[s]) continue;
      id++; var sp = 0; stack[sp++] = s; lab[s] = id;
      var area = 0, minx = W, miny = H, maxx = 0, maxy = 0;
      while (sp) {
        var p = stack[--sp], x = p % W, y = (p / W) | 0; area++;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x + 1 < W && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - W] && !lab[p - W]) { lab[p - W] = id; stack[sp++] = p - W; }
        if (y + 1 < H && mask[p + W] && !lab[p + W]) { lab[p + W] = id; stack[sp++] = p + W; }
      }
      cc.push({ id: id, area: area, x0: minx, y0: miny, x1: maxx, y1: maxy });
    }
    return { lab: lab, cc: cc, count: id };
  }
  var A = label(M, gw, gh);
  var ccs = A.cc, lab = A.lab;
  for (i = 1; i < ccs.length; i++) { ccs[i].dark = 0; ccs[i].col = 0; ccs[i].drop = false; }
  for (i = 0; i < n; i++) if (lab[i]) { var k = ccs[lab[i]]; if (D[i]) k.dark++; if (C[i]) k.col++; }
  var hx0 = (w * HD.x - rx0) / f, hy0 = (h * HD.y - ry0) / f, hx1 = hx0 + w * HD.w / f, hy1 = hy0 + h * HD.h / f;
  for (i = 1; i < ccs.length; i++) {
    k = ccs[i]; var bw = k.x1 - k.x0 + 1, bh = k.y1 - k.y0 + 1;
    if (bh <= 8 && bw > gw * 0.55) k.drop = 'rule';
    else if (bw <= 8 && bh > gh * 0.55) k.drop = 'rule';
    else if (Math.min(bw, bh) <= 4 && Math.max(bw, bh) >= gh * 0.06 && k.area > Math.max(bw, bh) * Math.min(bw, bh) * 0.7) k.drop = 'line';
    else if (k.x0 >= hx0 && k.x1 <= hx1 && k.y0 >= hy0 && k.y1 <= hy1) k.drop = 'heading';
    else if (k.area < 5) k.drop = 'speck';
    else if (k.dark < Math.max(2, k.area * 0.12) && k.col < 3) k.drop = 'faint';
    else if ((k.x0 <= 1 || k.x1 >= gw - 2 || k.y1 >= gh - 2) && (bw > gw * 0.3 || bh > gh * 0.3) && Math.max(bw / bh, bh / bw) > 6) k.drop = 'edge';
  }
  var K = new Uint8Array(n);
  for (i = 0; i < n; i++) if (lab[i] && !ccs[lab[i]].drop) K[i] = 1;
  var thin = gh * 0.0108;
  var kn = ccs.length, cls = new Uint8Array(kn);
  var why = new Array(kn), feat = new Array(kn);
  var ccE = new Int32Array(kn);
  var E0 = erode2(K, gw, gh);
  for (i = 0; i < n; i++) if (lab[i] && E0[i]) ccE[lab[i]]++;
  for (i = 1; i < kn; i++) {
    k = ccs[i]; if (k.drop) continue;
    var cw2 = k.x1 - k.x0 + 1, ch2 = k.y1 - k.y0 + 1;
    var relh = ch2 / gh, relw = cw2 / gh, relmax = Math.max(relh, relw), ar = cw2 / ch2;
    var colorFrac = k.col / k.area, solid = ccE[i] / k.area, fill = k.area / (cw2 * ch2);
    var wy = '';
    if (colorFrac >= 0.10 && k.col >= 20) wy = 'colour';
    else if (solid >= 0.10 && fill >= 0.5 && k.area >= 100) wy = 'filled';
    else if (k.area < thin * Math.max(cw2, ch2)) wy = '';
    else if (relw >= 0.28 && relh >= 0.02) wy = 'long';
    else if ((relh >= 0.10 && ar <= 2.6) || relh >= 0.15) wy = 'compact';
    if (wy) { cls[i] = 1; why[i] = wy; }
  }
  var CM = new Uint8Array(n), anyCore = 0;
  for (i = 0; i < n; i++) if (lab[i] && cls[lab[i]] === 1) { CM[i] = 1; anyCore++; }
  var res = { ok: true, confident: false, debug: {} };
  if (!anyCore) {
    var fb = fallbackBox ? fallbackBox(rgba, w, h) : null;
    res.reason = 'no drawing found'; res.box = fb; res.fallback = true; res.ok = !!fb;
    return res;
  }
  var near = dilate(CM, gw, gh, Math.max(2, Math.round(gh * 0.0055)));
  for (i = 0; i < n; i++) if (lab[i] && near[i] && cls[lab[i]] === 0 && !ccs[lab[i]].drop) cls[lab[i]] = 2;
  for (i = 1; i < kn; i++) if (cls[i] === 2) {
    k = ccs[i]; var big = Math.max(k.x1 - k.x0, k.y1 - k.y0) + 1;
    if (big > gh * 0.30 || (big > gh * 0.08 && k.area < thin * big)) cls[i] = 0;
  }
  var dInk = 0, tInk = 0, dMax = 0;
  for (i = 1; i < kn; i++) { k = ccs[i]; if (k.drop) continue; if (cls[i]) { dInk += k.area; dMax = Math.max(dMax, (k.x1 - k.x0 + 1) / gh, (k.y1 - k.y0 + 1) / gh); } else tInk += k.area; }
  if (dMax < 0.20 && dInk < 0.25 * tInk) {
    var fb2 = fallbackBox ? fallbackBox(rgba, w, h) : null;
    res.reason = 'only a small mark among handwriting'; res.box = fb2; res.fallback = true; res.ok = !!fb2;
    return res;
  }
  var kd = Math.max(2, Math.round(gh * 0.012));
  var KM = new Uint8Array(n), bx0 = gw, by0 = gh, bx1 = -1, by1 = -1;
  for (i = 0; i < n; i++) if (lab[i] && cls[lab[i]]) {
    KM[i] = 1; gx = i % gw; gy = (i / gw) | 0;
    if (gx < bx0) bx0 = gx; if (gx > bx1) bx1 = gx; if (gy < by0) by0 = gy; if (gy > by1) by1 = gy;
  }
  var KD = dilate(KM, gw, gh, kd);
  var out0 = new Uint8Array(n), st = new Int32Array(n), sp2 = 0;
  for (gx = 0; gx < gw; gx++) { if (!KD[gx]) { out0[gx] = 1; st[sp2++] = gx; } p = (gh - 1) * gw + gx; if (!KD[p]) { out0[p] = 1; st[sp2++] = p; } }
  for (gy = 0; gy < gh; gy++) { p = gy * gw; if (!KD[p] && !out0[p]) { out0[p] = 1; st[sp2++] = p; } p = gy * gw + gw - 1; if (!KD[p] && !out0[p]) { out0[p] = 1; st[sp2++] = p; } }
  while (sp2) {
    p = st[--sp2]; gx = p % gw; gy = (p / gw) | 0;
    if (gx > 0 && !KD[p - 1] && !out0[p - 1]) { out0[p - 1] = 1; st[sp2++] = p - 1; }
    if (gx + 1 < gw && !KD[p + 1] && !out0[p + 1]) { out0[p + 1] = 1; st[sp2++] = p + 1; }
    if (gy > 0 && !KD[p - gw] && !out0[p - gw]) { out0[p - gw] = 1; st[sp2++] = p - gw; }
    if (gy + 1 < gh && !KD[p + gw] && !out0[p + gw]) { out0[p + gw] = 1; st[sp2++] = p + gw; }
  }
  var inside = new Uint8Array(n);
  for (i = 0; i < n; i++) inside[i] = out0[i] ? 0 : 1;
  var cx0 = rx0 + bx0 * f, cy0 = ry0 + by0 * f, cw = (bx1 - bx0 + 1) * f, ch = (by1 - by0 + 1) * f;
  var m = Math.round(Math.max(cw, ch) * 0.14) + 6;
  var padS = kd * f;
  var CW = cw + 2 * m, CH = ch + 2 * m, asp = Math.max(1, Math.min(4 / 3, CW / CH));
  if (CW / CH < asp) CW = Math.round(CH * asp); else CH = Math.round(CW / asp);
  var out = new Uint8ClampedArray(CW * CH * 4); out.fill(255);
  var offx = Math.round((CW - cw) / 2), offy = Math.round((CH - ch) / 2);
  for (var oy = -padS; oy < ch + padS; oy++) {
    var sy = cy0 + oy; if (sy < ry0 || sy >= ry0 + gh * f) continue;
    var ty2 = oy + offy; if (ty2 < 0 || ty2 >= CH) continue;
    for (var ox = -padS; ox < cw + padS; ox++) {
      var sx = cx0 + ox; if (sx < rx0 || sx >= rx0 + gw * f) continue;
      var tx2 = ox + offx; if (tx2 < 0 || tx2 >= CW) continue;
      var gp = (((sy - ry0) / f) | 0) * gw + (((sx - rx0) / f) | 0);
      if (!inside[gp]) continue;
      var si = (sy * w + sx) * 4, di = (ty2 * CW + tx2) * 4, sc = 250 / Pg[gp];
      var rr = rgba[si] * sc, gg2 = rgba[si + 1] * sc, bb2 = rgba[si + 2] * sc;
      var lum = (0.299 * rr + 0.587 * gg2 + 0.114 * bb2);
      var t = lum > 232 ? 1 : lum > 205 ? (lum - 205) / 27 : 0;
      out[di] = Math.min(255, rr + (255 - rr) * t); out[di + 1] = Math.min(255, gg2 + (255 - gg2) * t); out[di + 2] = Math.min(255, bb2 + (255 - bb2) * t); out[di + 3] = 255;
    }
  }
  res.confident = true; res.reason = 'drawing kept';
  res.box = { x: cx0, y: cy0, w: cw, h: ch };
  res.out = { data: out, w: CW, h: CH };
  return res;
}
function erode2(src, W, H) {
  var inv = new Uint8Array(W * H), i;
  for (i = 0; i < inv.length; i++) inv[i] = src[i] ? 0 : 1;
  var d = dilate(inv, W, H, 2), out = new Uint8Array(W * H);
  for (i = 0; i < out.length; i++) out[i] = d[i] ? 0 : 1;
  return out;
}
function dilate(src, W, H, r) {
  var tmp = new Uint8Array(W * H), out = new Uint8Array(W * H), x, y, run;
  for (y = 0; y < H; y++) {
    run = 0;
    for (x = 0; x < W; x++) { if (src[y * W + x]) run = r + 1; if (run > 0) { tmp[y * W + x] = 1; run--; } }
    run = 0;
    for (x = W - 1; x >= 0; x--) { if (src[y * W + x]) run = r + 1; if (run > 0) { tmp[y * W + x] = 1; run--; } }
  }
  for (x = 0; x < W; x++) {
    run = 0;
    for (y = 0; y < H; y++) { if (tmp[y * W + x]) run = r + 1; if (run > 0) { out[y * W + x] = 1; run--; } }
    run = 0;
    for (y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) run = r + 1; if (run > 0) { out[y * W + x] = 1; run--; } }
  }
  return out;
}
if (typeof window !== 'undefined') { window.sketchClean = sketchClean; }
if (typeof module !== 'undefined') module.exports = { sketchClean: sketchClean };
