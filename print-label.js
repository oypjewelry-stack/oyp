/* Niimbot sticker bitmaps. 203 dpi, print direction "top": canvas width is the printhead,
   canvas height is the feed. The 30 mm label is centred. Text is Inter Bold (OFL), drawn with
   fillText at 4x and reduced to the 1-bit label. QR modules stay crisp rectangles.
   The client name is never read. JO card: 30×20 (240×160), QR on the left, tall.
   Jewelry tag: the same landscape reading on the 30×25 head (240×200), then a
   45 mm blank tail. B1 and B31 print direction is "top", so x is across the label.
   The printer draws columns 0..width-1 and does not centre a narrow bitmap,
   so the image stays the full head. A 30 mm label centred on the B31's 600 px
   head printed about 2 mm too far right, with extra blank above the picture, on a T30*20 roll.
   That measured correction is the B31 default. B1's head is 48 mm / 384 px. */
(function (root) {
'use strict';
if (root.OYPLabel) return;

var PX = 203 / 25.4;
function px(mm) { return Math.round(mm * PX); }

var PRESETS = [
  { id: '30x20', kind: 'jo_card', label: '30×20 production', wMm: 30, hMm: 20, tailMm: 0 },
  { id: '30x25x45', kind: 'jewelry_tag', label: '30×25+45 jewelry tag', wMm: 30, hMm: 25, tailMm: 45 }
];
var HEADS = { B31: 600, B1: 384, B3: 600 };
var SPEC_PX = 28; // em size. Inter Bold caps are about 0.75 em, so 28 px is a 2.6 mm cap
var SPEC_MIN = 14;
var JO_MAX = 40;
var SCALE = 4;
var FAMILY = 'OYPLabel, Inter, "Helvetica Neue", Arial, sans-serif';

function joCode(s) {
  var m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})([A-Z])?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : '';
}
function clean(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9 ./-]/g, ' ').replace(/\s+/g, ' ').trim();
}
var MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function shortDate(s) {
  var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return clean(s).slice(0, 16);
  return String(+m[3]) + ' ' + (MON[+m[2] - 1] || '');
}
/* One small line under the JO. Due date, else a date, else the stage. Empty if none of those is set. */
function smallLine(opts) {
  opts = opts || {};
  if (opts.due) return clean('DUE ' + shortDate(opts.due));
  if (opts.date) return clean(shortDate(opts.date));
  if (opts.stage) return clean(opts.stage).slice(0, 16);
  return '';
}
/* The jewelry tag prints the JO, then this note when a description exists. The client name is not a field here. */
function tagNote(opts) {
  var d = clean(opts && opts.description);
  return d ? [d] : [];
}
/* Up to three spec lines. Missing fields are skipped. Metal and karat share a line. Size and weight share the last. */
function specLines(opts) {
  opts = opts || {};
  var metal = clean([opts.karat, opts.metal].filter(Boolean).join(' '));
  var stone = clean([opts.stone || opts.stone_type, opts.stone_size].filter(Boolean).join(' '));
  var size = opts.size ? clean('SIZE ' + opts.size) : '';
  var w = opts.weight != null && opts.weight !== '' ? opts.weight : opts.weight_g;
  var weight = '';
  if (w != null && String(w).trim() !== '') weight = clean(String(w).replace(/\s*g$/i, '') + ' G');
  var out = [];
  if (metal) out.push(metal);
  if (stone) out.push(stone);
  var third = [size, weight].filter(Boolean).join(' ');
  if (third) out.push(clean(third));
  return out.slice(0, 3);
}
function headOf(opts) {
  if (opts && opts.head) return opts.head | 0;
  var m = String((opts && opts.model) || 'B1').toUpperCase();
  return HEADS[m] || 384;
}
function presetOf(kind) {
  if (kind === 'jewelry_tag' || kind === 'cal_tag') return PRESETS[1];
  return PRESETS[0];
}
/* Where a label sits on the head. The printer does not centre, and a label-width
   image would start at column 0, so the bitmap stays the full head.
   A calibration print centred on the B31's 600 px head (offset 180) put the
   border about 2 mm right of the T30*20 sticker, with more blank paper above
   the picture than below it. px(-2) is -16 and px(-0.5) is -4, so the default
   moves the print left and up. A saved offset is added on top of this.
   B1 was not in that print; its 384 px head stays centred. */
function placeBias(model) {
  if (String(model || '').toUpperCase() === 'B31') return { x: px(-2), y: px(-0.5) };
  return { x: 0, y: 0 };
}
function canvasFor(kind, head, model) {
  var p = presetOf(kind);
  var labelW = px(p.wMm), labelH = px(p.hMm), tail = px(p.tailMm);
  var bias = placeBias(model);
  return {
    head: head, labelW: labelW, labelH: labelH, tail: tail,
    offsetX: Math.round((head - labelW) / 2) + bias.x,
    biasY: bias.y,
    width: head, height: labelH + tail, preset: p.id
  };
}
/* Largest QR that fits maxPx. Quiet zone 4 when it fits, otherwise 3, module at least 3. */
function chooseQr(mods, maxPx) {
  var best = { mod: 2, quiet: 4, size: qrSize(mods, 2, 4) }, m, q, size;
  for (m = 8; m >= 3; m--) for (q = 4; q >= 2; q--) {
    size = qrSize(mods, m, q);
    if (size <= maxPx && size > best.size) best = { mod: m, quiet: q, size: size };
  }
  return best;
}

function Img(w, h) {
  this.w = w; this.h = h;
  this.d = new Uint8ClampedArray(w * h * 4);
  for (var i = 0; i < this.d.length; i += 4) { this.d[i] = this.d[i + 1] = this.d[i + 2] = this.d[i + 3] = 255; }
}
Img.prototype.set = function (x, y) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  var i = (y * this.w + x) * 4;
  this.d[i] = this.d[i + 1] = this.d[i + 2] = 0; this.d[i + 3] = 255;
};
Img.prototype.rect = function (x, y, w, h) {
  for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) this.set(x + xx, y + yy);
};
Img.prototype.qr = function (mods, x, y, mod, quiet) {
  var n = mods.length, q = quiet || 0;
  for (var row = 0; row < n; row++) for (var col = 0; col < n; col++) {
    if (mods[row].charAt(col) !== '1') continue;
    this.rect(x + (col + q) * mod, y + (row + q) * mod, mod, mod);
  }
};
Img.prototype.frame = function (x, y, w, h, t) {
  this.rect(x, y, w, t); this.rect(x, y + h - t, w, t);
  this.rect(x, y, t, h); this.rect(x + w - t, y, t, h);
};

function makeQr(text) {
  var factory = root.qrcode;
  if (typeof factory !== 'function') throw new Error('QR generator is not loaded');
  var qr = factory(0, 'M');
  qr.addData(text);
  qr.make();
  var n = qr.getModuleCount(), mods = [], y, x, row;
  for (y = 0; y < n; y++) {
    row = '';
    for (x = 0; x < n; x++) row += qr.isDark(y, x) ? '1' : '0';
    mods.push(row);
  }
  return mods;
}
function qrSize(mods, mod, quiet) { return (mods.length + (quiet || 0) * 2) * mod; }

function drawCentre(img, x, y, w, h) {
  var cx = x + (w >> 1), cy = y + (h >> 1), arm = 18;
  img.rect(cx, y + 8, 1, h - 16);
  img.rect(x + 8, cy, w - 16, 1);
  img.rect(cx - 2, cy - arm, 5, 1);
  img.rect(cx - 2, cy + arm, 5, 1);
  img.rect(cx - arm, cy - 2, 1, 5);
  img.rect(cx + arm, cy - 2, 1, 5);
  img.rect(cx - 1, cy - 1, 3, 3);
}

function fontUrl() {
  if (typeof document === 'undefined') return '';
  var tags = document.getElementsByTagName('script'), i, src;
  for (i = tags.length - 1; i >= 0; i--) {
    src = tags[i].src || '';
    if (/print-label\.js(\?|$)/.test(src)) return src.replace(/[^/]*$/, '') + 'vendor/Inter-Bold.woff2?v=1';
  }
  return 'vendor/Inter-Bold.woff2?v=1';
}
function ensureNodeFont() {
  if (root.__oypFontReady || typeof require !== 'function') return;
  var napi = null;
  try { napi = require('@napi-rs/canvas'); } catch (e) {}
  if (!napi) { try { napi = require('/tmp/napi-canvas/node_modules/@napi-rs/canvas'); } catch (e2) {} }
  if (!napi) return;
  var path = require('path');
  napi.GlobalFonts.registerFromPath(path.join(__dirname, 'vendor', 'Inter-Bold.ttf'), 'OYPLabel');
  root.__oypCreateCanvas = napi.createCanvas;
  root.__oypFontReady = true;
}
function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  ensureNodeFont();
  if (!root.__oypCreateCanvas) throw new Error('Label text needs a canvas');
  return root.__oypCreateCanvas(w, h);
}
var scratch = null;
function measureCtx() {
  if (!scratch) scratch = makeCanvas(8, 8).getContext('2d');
  return scratch;
}
function fontCss(size) { return '700 ' + (size * SCALE) + 'px ' + FAMILY; }
function metricsOf(text, size) {
  var ctx = measureCtx();
  ctx.font = fontCss(size);
  var m = ctx.measureText(text || 'H');
  return {
    w: m.width / SCALE,
    ascent: (m.actualBoundingBoxAscent || size * SCALE * 0.72) / SCALE,
    descent: (m.actualBoundingBoxDescent || size * SCALE * 0.05) / SCALE
  };
}
function sizeThatFits(text, maxW, start, min) {
  var size = start;
  while (size > min && metricsOf(text, size).w > maxW) size -= 1;
  return metricsOf(text, size).w <= maxW ? size : 0;
}
function ellipsis(text, maxW, size) {
  if (metricsOf(text, size).w <= maxW) return text;
  var cut = text;
  while (cut.length > 1 && metricsOf(cut.replace(/\s+$/, '') + '...', size).w > maxW) cut = cut.slice(0, -1);
  cut = cut.replace(/\s+$/, '');
  var out = (cut || text.charAt(0)) + '...';
  while (out.length > 4 && metricsOf(out, size).w > maxW) out = out.slice(0, -4).replace(/\s+$/, '') + '...';
  return out;
}
/* One size for every spec line. Shrink until the longest fits, then ellipsis. */
function fitSpecs(lines, maxW, cap) {
  var size = cap && cap < SPEC_PX ? cap : SPEC_PX;
  while (size > SPEC_MIN && lines.some(function (t) { return metricsOf(t, size).w > maxW; })) size -= 1;
  return { size: size, lines: lines.map(function (t) { return ellipsis(t, maxW, size); }) };
}
function fitLine(text, maxW, start, min) {
  var size = sizeThatFits(text, maxW, start, min);
  if (size) return { text: text, size: size };
  return { text: ellipsis(text, maxW, min), size: min };
}
/* Right edge of the ink, in label pixels, for text drawn at x = 0. Same 4× threshold as stampText. */
function inkSpan(text, size) {
  var m = metricsOf(text, size);
  var tw = Math.max(2, Math.ceil(m.w + 4));
  var th = Math.max(2, Math.ceil(m.ascent + m.descent + 4));
  var canvas = makeCanvas(tw * SCALE, th * SCALE);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = fontCss(size);
  var ascent = ctx.measureText(text).actualBoundingBoxAscent || size * SCALE * 0.72;
  ctx.fillText(text, 0, Math.round(ascent));
  var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  var maxX = -1, x, y, dy, dx, dark, si;
  for (y = 0; y < th; y++) for (x = 0; x < tw; x++) {
    dark = 0;
    for (dy = 0; dy < SCALE; dy++) for (dx = 0; dx < SCALE; dx++) {
      si = ((y * SCALE + dy) * canvas.width + (x * SCALE + dx)) * 4;
      if (data[si] < 150) dark++;
    }
    if (dark >= 6 && x > maxX) maxX = x;
  }
  return { right: maxX < 0 ? 0 : maxX };
}
/* Largest size whose ink ends on targetRight, at most 1 px short and never past it. */
function sizeForInk(text, targetRight, start, min) {
  var lo, hi, mid, span, best, guard;
  if (!text) return null;
  if (start < min) start = min;
  lo = min;
  hi = start;
  best = null;
  guard = 0;
  while (hi - lo > 0.05 && guard < 28) {
    guard++;
    mid = (lo + hi) / 2;
    span = inkSpan(text, mid);
    if (span.right > targetRight) hi = mid;
    else { best = { size: mid, span: span }; lo = mid; }
  }
  if (!best) {
    span = inkSpan(text, min);
    if (span.right > targetRight) {
      text = ellipsis(text, Math.max(8, targetRight), min);
      span = inkSpan(text, min);
    }
    return { text: text, size: min, span: span };
  }
  span = best.span;
  while (span.right < targetRight - 1 && best.size + 0.1 <= start + 0.001) {
    mid = Math.round((best.size + 0.1) * 1000) / 1000;
    span = inkSpan(text, mid);
    if (span.right > targetRight) break;
    best = { size: mid, span: span };
  }
  return { text: text, size: best.size, span: best.span };
}

/* 4x fillText, then a coverage threshold. Faint gray fringes stay white. QR is not on this canvas. */
function stampText(img, runs, box) {
  if (!runs.length) return;
  var tw = box.labelW * SCALE, th = box.labelH * SCALE;
  var canvas = makeCanvas(tw, th);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, tw, th);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  runs.forEach(function (run) {
    ctx.font = fontCss(run.size);
    var m = ctx.measureText(run.text);
    var ascent = m.actualBoundingBoxAscent || run.size * SCALE * 0.72;
    ctx.fillText(run.text, Math.round((run.x - box.offsetX) * SCALE), Math.round(run.y * SCALE + ascent));
  });
  var data = ctx.getImageData(0, 0, tw, th).data;
  var y, x, dy, dx, dark, si;
  for (y = 0; y < box.labelH; y++) {
    for (x = 0; x < box.labelW; x++) {
      dark = 0;
      for (dy = 0; dy < SCALE; dy++) for (dx = 0; dx < SCALE; dx++) {
        si = ((y * SCALE + dy) * tw + (x * SCALE + dx)) * 4;
        if (data[si] < 150) dark++;
      }
      if (dark >= 6) img.set(box.offsetX + x, y);
    }
  }
}

var ready = (function () {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve(false);
  try {
    var face = new FontFace('OYPLabel', 'url(' + fontUrl() + ')', { weight: '700', style: 'normal' });
    return face.load().then(function (f) { document.fonts.add(f); return true; }).catch(function () { return false; });
  } catch (e) { return Promise.resolve(false); }
})();

function render(opts) {
  opts = opts || {};
  ensureNodeFont();
  var kind = opts.kind || 'jo_card';
  var head = headOf(opts);
  var box = canvasFor(kind, head, opts.model);
  var img = new Img(box.width, box.height);
  var shiftX = opts.shiftX | 0, shiftY = (opts.shiftY | 0) + (box.biasY || 0);
  box.offsetX += shiftX;
  var rawSet = img.set.bind(img);
  img.set = function (x, y) { rawSet(x, y + shiftY); };
  var lines = [];
  var runs = [];
  var jo = joCode(opts.jo) || clean(opts.jo);
  var qrText = jo;
  var specPx = 0;
  var joPx = 0;
  var qrBox = null;
  var x0 = box.offsetX;
  var pad = px(1); // ~1 mm, so type does not touch the 30 mm edges

  if (kind === 'cal_jo' || kind === 'cal_tag') {
    img.frame(x0 + 4, 0 + 4, box.labelW - 8, box.labelH - 8, 2);
    drawCentre(img, x0, 0, box.labelW, box.labelH);
    if (kind === 'cal_tag') img.rect(x0 + 4, box.labelH - 1, box.labelW - 8, 1);
    img.rect(x0 + 6, 6, 8, 8);
  } else if (kind === 'jewelry_tag') {
    /* QR on the left, JO (largest) and spec lines on the right, inside the head.
       Two pixels of slack so the 4× threshold cannot spill into the 1 mm margin. */
    var specs = tagNote(opts);
    var mods = jo ? makeQr(jo) : null;
    var mod = 3, quiet = 4;
    var qpix = mods ? qrSize(mods, mod, quiet) : 0;
    var gap = qpix ? 8 : 0;
    /* Right ink margin matches the QR's left ink margin. The quiet zone is white, so the ink starts after it. */
    function tagTarget() {
      var leftInk = qpix ? pad + quiet * mod : pad;
      return Math.max(8, box.labelW - 1 - leftInk - (pad + qpix + gap));
    }
    var colW = tagTarget() + 1;
    /* Module 3 leaves a short column. Below 22 px, Inter caps are under about 2 mm, so drop the QR to module 2. */
    if (mods && specs.length && fitSpecs(specs, colW).size < 22 && qrSize(mods, 2, quiet) <= box.labelH - pad * 2) {
      mod = 2;
      qpix = qrSize(mods, mod, quiet);
      gap = 8;
      colW = tagTarget() + 1;
    }
    var target = tagTarget();
    var innerH = box.labelH - pad * 2 - 2;
    var specCap = SPEC_PX;
    var fitted = { size: 0, lines: [] };
    var joFit = null;
    var block = 0, joM = { ascent: 0, descent: 0 }, lineH = 0, guard = 0;
    while (guard < 40) {
      guard++;
      var longest = '', longestW = -1;
      specs.forEach(function (t) {
        var w = metricsOf(t, 16).w;
        if (w > longestW) { longestW = w; longest = t; }
      });
      var specInk = specs.length ? sizeForInk(longest, target, specCap, SPEC_MIN) : null;
      specPx = specInk ? specInk.size : 0;
      fitted = {
        size: specPx,
        lines: specs.map(function (t) {
          if (!specPx || inkSpan(t, specPx).right <= target) return t;
          return ellipsis(t, Math.max(8, target), specPx);
        })
      };
      var joMin = specPx ? specPx + 2 : 18;
      if (joMin > JO_MAX) joMin = JO_MAX;
      joFit = jo ? sizeForInk(jo, target, JO_MAX, joMin) : null;
      joPx = joFit ? joFit.size : 0;
      joM = joFit ? metricsOf(joFit.text, joPx) : { ascent: 0, descent: 0 };
      lineH = 0;
      if (specPx && fitted.lines.length) {
        var tall = { ascent: 0, descent: 0 };
        fitted.lines.forEach(function (t) {
          var m = metricsOf(t, specPx);
          if (m.ascent > tall.ascent) tall.ascent = m.ascent;
          if (m.descent > tall.descent) tall.descent = m.descent;
        });
        lineH = tall.ascent + tall.descent;
      }
      var specBlock = fitted.lines.length ? fitted.lines.length * lineH + (fitted.lines.length - 1) * 4 : 0;
      var joBlock = joFit ? joM.ascent + joM.descent : 0;
      block = joBlock + (joFit && fitted.lines.length ? 4 : 0) + specBlock;
      if (block <= innerH || specCap <= SPEC_MIN) break;
      specCap -= 1;
    }
    if (joFit) lines.push(joFit.text);
    fitted.lines.forEach(function (t) { lines.push(t); });
    var textX = x0 + pad + qpix + gap;
    var textY = pad + Math.max(0, Math.round((innerH - block) / 2));
    var yRun = textY;
    if (joFit) {
      runs.push({ text: joFit.text, x: textX, y: yRun, size: joPx });
      yRun += joM.ascent + joM.descent + (fitted.lines.length ? 4 : 0);
    }
    fitted.lines.forEach(function (t) {
      runs.push({ text: t, x: textX, y: yRun, size: specPx });
      yRun += lineH + 4;
    });
    var qrY = pad + Math.max(0, Math.round((innerH - qpix) / 2));
    if (mods) qrBox = { x: x0 + pad, y: qrY, size: qpix };
    stampText(img, runs, box);
    if (mods) img.qr(mods, qrBox.x, qrBox.y, mod, quiet);
  } else {
    /* QR stays the size that fills the 20 mm height. Its left ink margin is
       repeated on the right, and the JO shrinks into the width that is left. */
    var mods2 = jo ? makeQr(jo) : null;
    var qrMax = box.labelH - px(1.5) * 2;
    var picked = mods2 ? chooseQr(mods2, qrMax) : { mod: 3, quiet: 4, size: 0 };
    var mod2 = picked.mod, quiet2 = picked.quiet, qpix2 = picked.size;
    var gap2 = qpix2 ? 4 : 0;
    var leftInk2 = qpix2 ? pad + quiet2 * mod2 : pad;
    var target2 = Math.max(8, box.labelW - 1 - leftInk2 - (pad + qpix2 + gap2));
    var sub = smallLine(opts);
    var innerH = box.labelH - pad * 2;
    var cardJo = null;
    if (jo) {
      cardJo = sizeForInk(jo, target2, 72, 16);
      joPx = cardJo.size;
      lines.push(cardJo.text);
    }
    var subFit = null;
    function fitSub() {
      if (!sub || !cardJo) return null;
      var subStart = Math.max(12, Math.min(22, joPx - 6));
      var fit = sizeForInk(sub, cardJo.span.right, subStart, 9);
      if (fit.size >= joPx) return null;
      return fit;
    }
    subFit = fitSub();
    var guardCard = 0;
    while (jo && cardJo && guardCard < 40) {
      var jmTry = metricsOf(lines[0], joPx);
      var smTry = subFit ? metricsOf(subFit.text, subFit.size) : null;
      var tallC = jmTry.ascent + jmTry.descent + (smTry ? 4 + smTry.ascent + smTry.descent : 0);
      if (tallC <= innerH || joPx <= 16) break;
      joPx -= 1;
      cardJo = sizeForInk(lines[0], target2, joPx, 16);
      joPx = cardJo.size;
      lines[0] = cardJo.text;
      subFit = fitSub();
      guardCard++;
    }
    if (subFit) lines.push(subFit.text);
    var jm2 = jo ? metricsOf(lines[0], joPx) : { ascent: 0, descent: 0 };
    var sm2 = subFit ? metricsOf(subFit.text, subFit.size) : null;
    var block2 = jm2.ascent + jm2.descent + (sm2 ? 4 + sm2.ascent + sm2.descent : 0);
    var textY2 = pad + Math.max(0, Math.round((innerH - block2) / 2));
    var textX2 = x0 + pad + qpix2 + gap2;
    if (jo) runs.push({ text: lines[0], x: textX2, y: textY2, size: joPx });
    if (subFit) runs.push({ text: subFit.text, x: textX2, y: textY2 + jm2.ascent + jm2.descent + 4, size: subFit.size });
    var qrY2 = Math.round((box.labelH - qpix2) / 2);
    if (mods2) qrBox = { x: x0 + pad, y: qrY2, size: qpix2 };
    stampText(img, runs, box);
    if (mods2) img.qr(mods2, qrBox.x, qrBox.y, mod2, quiet2);
  }

  if (qrBox) qrBox = { x: qrBox.x, y: qrBox.y + shiftY, size: qrBox.size };

  return {
    width: box.width, height: box.height, data: img.d, lines: lines, qr: qrText,
    offsetX: box.offsetX, labelW: box.labelW, labelH: box.labelH, tail: box.tail,
    shiftX: shiftX, shiftY: shiftY,
    specPx: specPx, joPx: joPx, preset: box.preset, kind: kind, head: head, qrBox: qrBox
  };
}

function toCanvas(rendered) {
  if (typeof document === 'undefined') return null;
  var c = document.createElement('canvas');
  c.width = rendered.width; c.height = rendered.height;
  var ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var image = ctx.createImageData(rendered.width, rendered.height);
  image.data.set(rendered.data);
  ctx.putImageData(image, 0, 0);
  return c;
}

/* Display only. The print bitmap stays the full head. This crops to the sticker,
   30×20 or 30×25 plus the 45 mm tail, and draws it as paper: white, rounded,
   on a mid-gray field, so the edges and the margins are visible. A saved
   horizontal offset moves the ink inside that paper. The fold line is not printed. */
var PREVIEW_GRAY = '#8e8e8e';
function roundPath(ctx, x, y, w, h, r) {
  var rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function stickerPixels(rendered) {
  var w = rendered.labelW, h = rendered.labelH + (rendered.tail || 0);
  var data = new Uint8ClampedArray(w * h * 4);
  var i, sx0 = rendered.offsetX - (rendered.shiftX || 0), y, x, sy, sx, si, di;
  for (i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 255;
  for (y = 0; y < h; y++) {
    sy = y;
    if (sy < 0 || sy >= rendered.height) continue;
    for (x = 0; x < w; x++) {
      sx = sx0 + x;
      if (sx < 0 || sx >= rendered.width) continue;
      si = (sy * rendered.width + sx) * 4;
      di = (y * w + x) * 4;
      data[di] = rendered.data[si];
      data[di + 1] = rendered.data[si + 1];
      data[di + 2] = rendered.data[si + 2];
      data[di + 3] = 255;
    }
  }
  return { width: w, height: h, data: data };
}
function preview(rendered, opts) {
  opts = opts || {};
  var scale = opts.scale > 0 ? opts.scale : 4;
  var smooth = opts.smooth !== false;
  var labelW = rendered.labelW, labelH = rendered.labelH, tail = rendered.tail || 0;
  var stickerH = labelH + tail;
  var pad = px(4), radius = px(2);
  var src = stickerPixels(rendered);
  var srcCanvas = makeCanvas(labelW, stickerH);
  var sctx = srcCanvas.getContext('2d');
  var id = sctx.createImageData(labelW, stickerH);
  id.data.set(src.data);
  sctx.putImageData(id, 0, 0);
  var outW = (labelW + pad * 2) * scale, outH = (stickerH + pad * 2) * scale;
  var canvas = makeCanvas(outW, outH);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = PREVIEW_GRAY;
  ctx.fillRect(0, 0, outW, outH);
  var x = pad * scale, y = pad * scale, w = labelW * scale, h = stickerH * scale, rad = radius * scale;
  roundPath(ctx, x, y, w, h, rad);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.save();
  roundPath(ctx, x, y, w, h, rad);
  ctx.clip();
  ctx.imageSmoothingEnabled = !!smooth;
  if (smooth && 'imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, x, y, w, h);
  if (tail) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(60,60,60,0.28)';
    ctx.lineWidth = Math.max(1, scale);
    var fy = Math.round(y + labelH * scale) + 0.5;
    ctx.moveTo(x, fy);
    ctx.lineTo(x + w, fy);
    ctx.stroke();
  }
  ctx.restore();
  var out = ctx.getImageData(0, 0, outW, outH);
  return {
    width: outW, height: outH, data: out.data, canvas: canvas,
    labelW: labelW, labelH: labelH, tail: tail, scale: scale, pad: pad, radius: radius
  };
}

root.OYPLabel = {
  render: render, toCanvas: toCanvas, preview: preview, px: px, joCode: joCode, specLines: specLines, smallLine: smallLine,
  ready: ready, PRESETS: PRESETS, HEADS: HEADS, SPEC_PX: SPEC_PX, canvasFor: canvasFor, placeBias: placeBias
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPLabel;
})(typeof window !== 'undefined' ? window : globalThis);
