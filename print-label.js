/* Niimbot sticker bitmaps. 203 dpi, print direction "top": canvas width is the printhead,
   canvas height is the feed. The 30 mm label is centred. The thermal head still receives a
   1-bit raster. On screen, a jewelry tag's words are HTML text. SVG is only the QR
   modules and the logo bits. Inter Bold (OFL) is the face.
   The client name is never read. JO card: 30×20 (240×160), QR on the left, tall.
   Jewelry tag: T30*25+45 cable label. The NIIMBOT app designs the flag upright,
   25 mm wide by 30 mm high, with the 45 mm tail to the right of that picture.
   The B1 prints direction "top": bitmap x increases to the right across the head,
   bitmap y is the feed, and row 0 is the flap end. Seen from the printed side,
   flaps on top and the tail below, that bitmap is the paper. The upright design
   is turned 90° clockwise onto it, a rotation rather than a mirror. The top of
   the design lands on the right flap. The right edge of the design, where the
   tail sits in the app, runs into the blank tail. Turn the paper so the tail is
   on the right and every word reads with the NIIMBOT picture. The liner gap is
   not in the bitmap. WithGaps starts the next label on the next pair of flaps.
   B1 and B31 print direction is "top", so x on the bitmap is across the head.
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
/* Small jewelry lines only (stone, JO, SKU, location, weight). Inter Bold is the
   only face shipped; a requested Black would be a synthetic bold and look muddy.
   A sub-pixel stroke under the fill, a little letter-spacing, and a higher
   coverage cut keep the 1-bit stems solid instead of a gray halo. Price, the
   description, and the metal row stay on the lighter pass. */
var CRISP_TRACK = 0.55;
var CRISP_STROKE = 0.8;
var CRISP_THRESH = 9;

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
/* Kept for callers. The jewelry tag no longer prints this under the JO. The client name is not a field. */
function tagNote(opts) {
  var d = clean(opts && opts.description);
  return d ? [d] : [];
}
function textOf(v) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}
/* ₱11,500.00 when the value is numeric. A value that already has letters is printed as stored. Blank stays blank. */
function moneyText(v) {
  var s = textOf(v);
  if (!s) return '';
  if (/[A-Za-z]/.test(s)) return s;
  var n = Number(s.replace(/[₱$,\s]/g, ''));
  if (!isFinite(n)) return s;
  var neg = n < 0;
  var parts = Math.abs(n).toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + '₱' + parts[0] + '.' + parts[1];
}
/* 7, 7g, and "7 g" all print as 7g. Anything else is printed as stored. */
function weightText(v) {
  var s = textOf(v);
  if (!s) return '';
  var m = s.match(/^(-?\d+(?:\.\d+)?)\s*g?$/i);
  if (!m) return s;
  var n = m[1];
  if (n.indexOf('.') >= 0) n = n.replace(/0+$/, '').replace(/\.$/, '');
  return n + 'g';
}
function upOf(v) { return textOf(v).toUpperCase(); }
/* Piece type, not the job type and not the sticker kind. */
function pieceType(opts) {
  opts = opts || {};
  var t = textOf(opts.item_type || opts.piece_type || '');
  if (!t) {
    t = textOf(opts.type);
    if (/^(jewelry tag|jewelry_tag|jo card|jo_card|repair|revision|new|new job)$/i.test(t)) t = '';
  }
  return upOf(t);
}
/* The stone sentence when it is already one field, otherwise type, size, and grade. Not the item name. */
function stoneText(opts) {
  opts = opts || {};
  var full = textOf(opts.stones);
  if (full) return full;
  var bits = [];
  var stone = textOf(opts.stone || opts.stone_type);
  if (stone) bits.push(stone);
  if (textOf(opts.stone_size)) bits.push(textOf(opts.stone_size));
  if (textOf(opts.grade)) bits.push(textOf(opts.grade));
  return bits.join(' ');
}
/* OYP wordmark, 36×20, from logo.png. Any opaque pixel is ink. */
var LOGO_ROWS = [
  '000000111111110000000000000001110000',
  '000011110000111000000000000001111100',
  '000110000000001110000000000001101110',
  '001100000000000010000000000001101110',
  '011000000000000011000000010001111011',
  '010000000000000001101100110001110001',
  '110000000000000001111100110011100001',
  '110000000000000000111101111111100001',
  '100000000000000001111101111001100001',
  '100000000000000011111111110001100011',
  '100000000000000000111111100001100110',
  '100000000000000000100011100001101100',
  '110000000000000000100111100001111000',
  '010000000000000001101101000001100000',
  '011000000000000011001111000001100000',
  '001100000000000011001011000001100000',
  '000110000000001110011010000001100000',
  '000011100000111100011110000001100000',
  '000001111111110000011100000001100000'
];
function blitBits(img, rows, x, y) {
  var r, c, row, cap;
  for (r = 0; r < rows.length; r++) {
    row = rows[r];
    for (c = 0; c < row.length; c++) if (row.charAt(c) === '1') {
      img.set(x + c, y + r);
      cap = root.__oypCapture;
      if (cap) cap.rects.push({ x: x + c, y: y + r, w: 1, h: 1, role: 'logo' });
    }
  }
}
function dashes(img, x, y, w) {
  var on = 3, gap = 2, i = 0, n, cap;
  while (i < w) {
    n = Math.min(on, w - i);
    img.rect(x + i, y, n, 1);
    cap = root.__oypCapture;
    if (cap) cap.rects.push({ x: x + i, y: y, w: n, h: 1, role: 'fold' });
    i += on + gap;
  }
}
/* Words wrap to maxLines. The last line ellipsizes when the rest does not fit. */
function wrapLines(text, maxW, size, maxLines, bold, track) {
  var words = text.split(' ').filter(Boolean), lines = [], cur = '', i, trial;
  if (!words.length || maxLines < 1) return lines;
  for (i = 0; i < words.length; i++) {
    trial = cur ? cur + ' ' + words[i] : words[i];
    if (metricsOf(trial, size, bold, track).w <= maxW) { cur = trial; continue; }
    if (cur && lines.length < maxLines - 1) { lines.push(cur); cur = ''; i--; continue; }
    lines.push(ellipsis(cur ? cur + ' ' + words.slice(i).join(' ') : words.slice(i).join(' '), maxW, size, bold, track));
    return lines;
  }
  if (cur) lines.push(cur);
  return lines;
}
function blockHeight(lines, size, bold, track) {
  var tall = 0, i, m;
  for (i = 0; i < lines.length; i++) {
    m = metricsOf(lines[i], size, bold, track);
    tall += Math.ceil(m.ascent + m.descent) + (i ? 2 : 0);
  }
  return tall;
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
/* Largest QR that fits maxPx, quiet zone included. Never larger than maxPx:
   the old fallback (module 2, quiet 4) could be taller than the 20 mm card,
   and the bitmap then dropped the bottom of the code. */
function chooseQr(mods, maxPx) {
  var best = null, m, q, size;
  for (m = 8; m >= 1; m--) for (q = 4; q >= 2; q--) {
    size = qrSize(mods, m, q);
    if (size <= maxPx && (!best || size > best.size)) best = { mod: m, quiet: q, size: size };
  }
  if (best) return best;
  size = qrSize(mods, 1, 2);
  return { mod: 1, quiet: 2, size: size <= maxPx ? size : maxPx };
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
  var n = mods.length, q = quiet || 0, cap, rx, ry;
  for (var row = 0; row < n; row++) for (var col = 0; col < n; col++) {
    if (mods[row].charAt(col) !== '1') continue;
    rx = x + (col + q) * mod;
    ry = y + (row + q) * mod;
    this.rect(rx, ry, mod, mod);
    cap = root.__oypCapture;
    if (cap) cap.rects.push({ x: rx, y: ry, w: mod, h: mod, role: 'qr' });
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
function fontCss(size, bold) {
  var weight = (bold === 0 || bold === false) ? '400' : '700';
  return weight + ' ' + (size * SCALE) + 'px ' + FAMILY;
}
/* The scratch context is reused, so letter-spacing is set on every measure.
   A crisp stroke is centered on the outline; its width is added so a tracked
   line still wraps before it meets the QR. */
function setTrack(ctx, track) {
  var value = ((+track || 0) * SCALE) + 'px';
  try { ctx.letterSpacing = value; } catch (e) {}
}
function metricsOf(text, size, bold, track) {
  var ctx = measureCtx();
  ctx.font = fontCss(size, bold);
  setTrack(ctx, track);
  var m = ctx.measureText(text || 'H');
  return {
    w: m.width / SCALE + (track ? CRISP_STROKE : 0),
    ascent: (m.actualBoundingBoxAscent || size * SCALE * 0.72) / SCALE,
    descent: (m.actualBoundingBoxDescent || size * SCALE * 0.05) / SCALE
  };
}
function sizeThatFits(text, maxW, start, min) {
  var size = start;
  while (size > min && metricsOf(text, size).w > maxW) size -= 1;
  return metricsOf(text, size).w <= maxW ? size : 0;
}
function ellipsis(text, maxW, size, bold, track) {
  if (metricsOf(text, size, bold, track).w <= maxW) return text;
  var cut = text;
  while (cut.length > 1 && metricsOf(cut.replace(/\s+$/, '') + '...', size, bold, track).w > maxW) cut = cut.slice(0, -1);
  cut = cut.replace(/\s+$/, '');
  var out = (cut || text.charAt(0)) + '...';
  while (out.length > 4 && metricsOf(out, size, bold, track).w > maxW) out = out.slice(0, -4).replace(/\s+$/, '') + '...';
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
    ctx.font = fontCss(run.size, run.bold);
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
/* Same 4× sample as stampText, in the image's own pixels. run.y is the top of the line.
   Plain runs (price, name, metal) keep the old 6-of-16 cut. Crisp runs stroke then
   fill, and a pixel is black only when CRISP_THRESH of 16 samples are dark, so the
   gray fringe stays white and the stem stays one solid width. */
function stampLocal(img, runs) {
  if (!runs.length) return;
  var tw = img.w * SCALE, th = img.h * SCALE;
  var canvas = makeCanvas(tw, th);
  var ctx = canvas.getContext('2d');
  var anyPlain = false, anyCrisp = false, i;
  for (i = 0; i < runs.length; i++) {
    if (runs[i].crisp) anyCrisp = true;
    else anyPlain = true;
  }
  function pass(crisp, thresh) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    setTrack(ctx, 0);
    runs.forEach(function (run) {
      if (!!run.crisp !== crisp) return;
      ctx.font = fontCss(run.size, run.bold);
      setTrack(ctx, run.track);
      var m = ctx.measureText(run.text);
      var ascent = m.actualBoundingBoxAscent || run.size * SCALE * 0.72;
      if (root.__oypCapture && run.text) {
        var fontUp = m.fontBoundingBoxAscent || ascent;
        root.__oypCapture.texts.push({
          text: run.text,
          x: run.x,
          y: run.y + ascent / SCALE,
          ascent: fontUp / SCALE,
          size: run.size,
          track: run.track || 0,
          weight: (run.bold === 0 || run.bold === false) ? 400 : 700
        });
      }
      var x = Math.round(run.x * SCALE);
      var y = Math.round(run.y * SCALE + ascent);
      if (crisp) {
        ctx.lineWidth = CRISP_STROKE * SCALE;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(run.text, x, y);
      }
      ctx.fillText(run.text, x, y);
    });
    var data = ctx.getImageData(0, 0, tw, th).data;
    var y, x, dy, dx, dark, si;
    for (y = 0; y < img.h; y++) {
      for (x = 0; x < img.w; x++) {
        dark = 0;
        for (dy = 0; dy < SCALE; dy++) for (dx = 0; dx < SCALE; dx++) {
          si = ((y * SCALE + dy) * tw + (x * SCALE + dx)) * 4;
          if (data[si] < 150) dark++;
        }
        if (dark >= thresh) img.set(x, y);
      }
    }
  }
  if (anyPlain) pass(false, 6);
  if (anyCrisp) pass(true, CRISP_THRESH);
}
/* Saved positions are millimetres from the top-left of the readable label.
   No opts.layout keeps the built-in NIIMBOT drawer below. A layout draws each
   element where it was saved, so the editor, the preview, and the print match. */
var LAYOUT_FIELDS = [
  { id: 'price', label: 'Price', kind: 'text' },
  { id: 'logo', label: 'Logo', kind: 'logo' },
  { id: 'name', label: 'Name', kind: 'text' },
  { id: 'type', label: 'Type', kind: 'text' },
  { id: 'metal', label: 'Metal', kind: 'text' },
  { id: 'karat', label: 'Karat', kind: 'text' },
  { id: 'fold', label: 'Fold line', kind: 'fold' },
  { id: 'stones', label: 'Stones', kind: 'text' },
  { id: 'weight', label: 'Weight', kind: 'text' },
  { id: 'jo', label: 'JO', kind: 'text' },
  { id: 'sku', label: 'SKU', kind: 'text' },
  { id: 'location', label: 'Location', kind: 'text' },
  { id: 'qr', label: 'QR', kind: 'qr' },
  { id: 'line', label: 'Due line', kind: 'text', card: 1 }
];
var LAYOUT_BASE = {
  jewelry_tag: {
    price: { show: 1, x: 1, y: 1, size: 17, bold: 1, align: 'left', w: 14, wrap: 1 },
    logo: { show: 1, x: 19.5, y: 1 },
    name: { show: 1, x: 1, y: 4.1, size: 15, bold: 1, align: 'left', w: 23, wrap: 2 },
    type: { show: 1, x: 1, y: 11.2, size: 12, bold: 1, align: 'left', w: 7, wrap: 1 },
    metal: { show: 1, x: 9, y: 11.2, size: 12, bold: 1, align: 'center', w: 7, wrap: 1 },
    karat: { show: 1, x: 16.5, y: 11.2, size: 12, bold: 1, align: 'right', w: 7.5, wrap: 1 },
    fold: { show: 0, x: 1, y: 15, w: 23 },
    stones: { show: 1, x: 1, y: 16, size: 16, bold: 1, align: 'left', w: 23, wrap: 3 },
    weight: { show: 1, x: 1, y: 26.6, size: 14, bold: 1, align: 'left', w: 13, wrap: 1 },
    jo: { show: 1, x: 1, y: 20.4, size: 14, bold: 1, align: 'left', w: 13, wrap: 1 },
    sku: { show: 1, x: 1, y: 22.5, size: 14, bold: 1, align: 'left', w: 13, wrap: 1 },
    location: { show: 1, x: 1, y: 24.5, size: 14, bold: 1, align: 'left', w: 13, wrap: 2 },
    qr: { show: 1, x: 13.6, y: 19.6, qr: 9.4 },
    line: { show: 0, x: 1, y: 20, size: 9, bold: 1, align: 'left', w: 16, wrap: 1 }
  },
  jo_card: {
    price: { show: 0, x: 1, y: 1, size: 12, bold: 1, align: 'left', w: 14, wrap: 1 },
    logo: { show: 0, x: 24, y: 1 },
    name: { show: 0, x: 1, y: 4, size: 12, bold: 1, align: 'left', w: 16, wrap: 1 },
    type: { show: 0, x: 1, y: 7, size: 10, bold: 1, align: 'left', w: 8, wrap: 1 },
    metal: { show: 0, x: 10, y: 7, size: 10, bold: 1, align: 'center', w: 8, wrap: 1 },
    karat: { show: 0, x: 19, y: 7, size: 10, bold: 1, align: 'right', w: 8, wrap: 1 },
    fold: { show: 0, x: 1, y: 10, w: 28 },
    stones: { show: 0, x: 1, y: 11, size: 9, bold: 1, align: 'left', w: 16, wrap: 2 },
    weight: { show: 0, x: 1, y: 16, size: 9, bold: 1, align: 'left', w: 8, wrap: 1 },
    jo: { show: 1, x: 18.6, y: 4.2, size: 22, bold: 1, align: 'left', w: 10.4, wrap: 1 },
    sku: { show: 0, x: 18.6, y: 13, size: 10, bold: 1, align: 'left', w: 10, wrap: 1 },
    location: { show: 0, x: 18.6, y: 15, size: 10, bold: 1, align: 'left', w: 10, wrap: 1 },
    qr: { show: 1, x: 1, y: 1.5, qr: 17 },
    line: { show: 1, x: 18.6, y: 10.2, size: 12, bold: 1, align: 'left', w: 10.4, wrap: 1 }
  }
};
function copyFields(src) {
  var out = {}, k;
  for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  return out;
}
function paperMm(kind) {
  if (kind === 'jewelry_tag' || kind === 'cal_tag') return { w: 70, h: 30 };
  return { w: 30, h: 20 };
}
function elementDefaults(kind) {
  var src = LAYOUT_BASE[kind === 'jo_card' ? 'jo_card' : 'jewelry_tag'];
  var out = {}, id;
  for (id in src) if (Object.prototype.hasOwnProperty.call(src, id)) out[id] = copyFields(src[id]);
  return out;
}
function layoutFields(kind) {
  var card = kind === 'jo_card', out = [], i, field;
  for (i = 0; i < LAYOUT_FIELDS.length; i++) {
    field = LAYOUT_FIELDS[i];
    if (!card && field.card) continue;
    if (!card && field.id === 'fold') continue;
    out.push(field);
  }
  return out;
}
function clampMm(v, fallback, min, max) {
  var n = Math.round(Number(v) * 10) / 10;
  if (!isFinite(n)) n = fallback;
  if (n < min) n = min;
  if (n > max) n = max;
  return n;
}
function alignOf(v) { return v === 'center' || v === 'right' ? v : 'left'; }
function normalizeLayout(kind, saved) {
  var base = elementDefaults(kind);
  var paper = paperMm(kind);
  var id, src, el;
  saved = saved && typeof saved === 'object' ? saved : {};
  for (id in base) {
    if (!Object.prototype.hasOwnProperty.call(base, id)) continue;
    src = saved[id] && typeof saved[id] === 'object' ? saved[id] : {};
    el = base[id];
    if (src.show === 0 || src.show === false) el.show = 0;
    else if (src.show === 1 || src.show === true) el.show = 1;
    el.x = clampMm(src.x != null ? src.x : el.x, el.x, 0, Math.max(0, paper.w - 2));
    el.y = clampMm(src.y != null ? src.y : el.y, el.y, 0, Math.max(0, paper.h - 2));
    if (el.size != null) {
      el.size = Math.round(Number(src.size != null ? src.size : el.size));
      if (!isFinite(el.size)) el.size = 12;
      if (el.size < 6) el.size = 6;
      if (el.size > 72) el.size = 72;
    }
    if (el.bold != null) el.bold = (src.bold === 0 || src.bold === false) ? 0 : 1;
    if (el.align != null) el.align = alignOf(src.align != null ? src.align : el.align);
    if (el.w != null) el.w = clampMm(src.w != null ? src.w : el.w, el.w, 1, paper.w);
    if (el.wrap != null) {
      el.wrap = Math.round(Number(src.wrap != null ? src.wrap : el.wrap));
      if (!isFinite(el.wrap) || el.wrap < 1) el.wrap = 1;
      if (el.wrap > 8) el.wrap = 8;
    }
    if (el.qr != null) el.qr = clampMm(src.qr != null ? src.qr : el.qr, el.qr, 2, Math.min(paper.w, paper.h));
  }
  return base;
}
/* Text for one element. The client name is not a field. */
function elementText(id, opts) {
  opts = opts || {};
  if (id === 'price') return moneyText(opts.price);
  if (id === 'name') return textOf(opts.name || opts.description);
  if (id === 'type') return pieceType(opts);
  if (id === 'metal') return upOf(opts.metal);
  if (id === 'karat') return upOf(opts.karat);
  if (id === 'stones') return stoneText(opts);
  if (id === 'weight') return weightText(opts.weight != null && opts.weight !== '' ? opts.weight : opts.weight_g);
  if (id === 'jo' || id === 'qr') return joCode(opts.jo) || textOf(opts.jo);
  if (id === 'sku') return textOf(opts.sku || opts.item_id);
  if (id === 'location') return textOf(opts.location);
  if (id === 'line') return smallLine(opts);
  return '';
}
function fitQrBox(mods, boxPx) {
  var mod = 1, best = 0, size;
  while (mod < 16) {
    size = qrSize(mods, mod, 2);
    if (size > boxPx) break;
    best = mod;
    mod++;
  }
  if (!best) return null;
  return { mod: best, quiet: 2, size: qrSize(mods, best, 2) };
}
/* Top-left of the quiet-zone square, inside bounds. A request bigger than the
   label shrinks until the quiet zone fits; it is not drawn past the edge. */
function placeQr(mods, x, y, request, bounds) {
  var room = Math.max(1, Math.min(bounds.w, bounds.h));
  var want = Math.max(1, request | 0);
  var fit = fitQrBox(mods, Math.min(want, room)) || fitQrBox(mods, room);
  var mod = fit ? fit.mod : 1, quiet = fit ? fit.quiet : 2;
  var size = fit ? fit.size : Math.min(room, qrSize(mods, 1, 2));
  var px0 = x, py0 = y;
  if (px0 < bounds.x) px0 = bounds.x;
  if (py0 < bounds.y) py0 = bounds.y;
  if (px0 + size > bounds.x + bounds.w) px0 = bounds.x + bounds.w - size;
  if (py0 + size > bounds.y + bounds.h) py0 = bounds.y + bounds.h - size;
  if (px0 < bounds.x) px0 = bounds.x;
  if (py0 < bounds.y) py0 = bounds.y;
  return { x: px0, y: py0, mod: mod, quiet: quiet, size: size };
}
function paintLayout(img, layout, opts, kind, bounds) {
  var fields = layoutFields(kind);
  var runs = [], placed = [], lines = [];
  var specPx = 0, joPx = 0, qrInfo = null, i, field, el, text, x, y, w, size, wrapN, bold, block, cursor, li, m, tw, tx, lineH;
  for (i = 0; i < fields.length; i++) {
    field = fields[i];
    el = layout[field.id];
    if (!el || !el.show) continue;
    if (field.kind === 'logo') {
      x = px(el.x); y = px(el.y);
      blitBits(img, LOGO_ROWS, x, y);
      placed.push({ id: 'logo', x: x, y: y, w: LOGO_ROWS[0].length, h: LOGO_ROWS.length });
      continue;
    }
    if (field.kind === 'fold') {
      /* The jewelry tag no longer prints the fold guide. Its y still marks
         where the rows sit, so hiding the dashes does not move them. */
      if (kind === 'jewelry_tag') continue;
      x = px(el.x); y = px(el.y); w = Math.max(1, px(el.w || 1));
      dashes(img, x, y, w);
      placed.push({ id: 'fold', x: x, y: y > 3 ? y - 3 : 0, w: w, h: 8 });
      continue;
    }
    if (field.kind === 'qr') {
      text = elementText('qr', opts);
      x = px(el.x); y = px(el.y); w = Math.max(8, px(el.qr || 6));
      var boxBounds = bounds || { x: 0, y: 0, w: img.w, h: img.h };
      /* A code that sits wholly on the jewelry tail stays there. One that crosses
         the flag edge is pulled onto the flag, so the tail does not cut it. */
      if (boxBounds.flag && x >= boxBounds.x + boxBounds.w) boxBounds = { x: boxBounds.x + boxBounds.w, y: 0, w: img.w - (boxBounds.x + boxBounds.w), h: img.h };
      if (text) {
        var mods = makeQr(text), fit = placeQr(mods, x, y, w, boxBounds);
        img.qr(mods, fit.x, fit.y, fit.mod, fit.quiet);
        qrInfo = { x: fit.x, y: fit.y, size: fit.size, text: text };
        x = fit.x; y = fit.y; w = fit.size;
      }
      placed.push({ id: 'qr', x: x, y: y, w: w, h: w });
      continue;
    }
    text = elementText(field.id, opts);
    x = px(el.x); y = px(el.y); w = Math.max(4, px(el.w || 4));
    size = el.size | 0; wrapN = el.wrap | 0 || 1; bold = el.bold ? 1 : 0;
    block = [];
    var track = 0;
    if (text && kind === 'jewelry_tag' && (field.id === 'stones' || field.id === 'jo' || field.id === 'sku' || field.id === 'location' || field.id === 'weight')) {
      track = CRISP_TRACK;
      var minSize = field.id === 'stones' ? 11 : 10;
      var maxH = 0, fitGuard = 0, fitTall;
      function roomUntil(id) {
        var next = layout[id];
        if (!next || !next.show) return 0;
        return px(next.y) - y - 2;
      }
      if (field.id === 'stones') maxH = roomUntil('qr');
      else if (field.id === 'jo') maxH = roomUntil('sku');
      else if (field.id === 'sku') maxH = roomUntil('location');
      else if (field.id === 'location') maxH = roomUntil('weight');
      else if (field.id === 'weight') maxH = px(29) - y;
      if (maxH < 0) maxH = 0;
      if (field.id === 'stones' && maxH && maxH < 8) maxH = 8;
      while (size > minSize && wrapN <= 1 && metricsOf(text, size, bold, track).w > w) size--;
      while (fitGuard++ < 24) {
        block = wrapN <= 1 ? [metricsOf(text, size, bold, track).w <= w ? text : ellipsis(text, w, size, bold, track)] : wrapLines(text, w, size, wrapN, bold, track);
        fitTall = blockHeight(block, size, bold, track);
        if (!maxH || fitTall <= maxH || size <= minSize && wrapN <= 1) break;
        if (size > minSize) { size--; continue; }
        if (wrapN > 1) { wrapN--; continue; }
        break;
      }
    } else if (text) block = wrapN <= 1 ? [ellipsis(text, w, size, bold)] : wrapLines(text, w, size, wrapN, bold);
    if (field.id === 'stones') specPx = size;
    if (field.id === 'jo') joPx = size;
    if (!block.length) {
      placed.push({ id: field.id, x: x, y: y, w: w, h: Math.max(8, size) });
      continue;
    }
    cursor = y;
    for (li = 0; li < block.length; li++) {
      m = metricsOf(block[li], size, bold, track);
      tw = m.w;
      if (el.align === 'right') tx = x + w - tw;
      else if (el.align === 'center') tx = x + (w - tw) / 2;
      else tx = x;
      lineH = Math.ceil(m.ascent + m.descent);
      runs.push({ text: block[li], x: Math.round(tx), y: cursor, size: size, bold: bold, crisp: track ? 1 : 0, track: track });
      lines.push(block[li]);
      cursor += lineH + 2;
    }
    placed.push({ id: field.id, x: x, y: y, w: w, h: Math.max(8, cursor - y) });
  }
  stampLocal(img, runs);
  return { lines: lines, placed: placed, specPx: specPx, joPx: joPx, qr: qrInfo };
}
/* 90° clockwise onto the print. Top of the design (small dy) becomes the right flap.
   Feed follows design x, so the tail drawn to the right of the flag prints after the flaps.
   One axis is flipped, so the glyphs stay a rotation and not a mirror. */
function rotatePaper(img, box, paper) {
  var dy, dx, pi, contentH = paper.h;
  for (dy = 0; dy < paper.h; dy++) {
    for (dx = 0; dx < paper.w; dx++) {
      pi = (dy * paper.w + dx) * 4;
      if (paper.d[pi] !== 0) continue;
      img.set(box.offsetX + (contentH - 1 - dy), dx);
    }
  }
}
/* Paper x is the feed. After the printer offset, that axis still has to stay
   on the 25 mm flag. The tail is past contentW, and that is the edge that
   cuts the bottom of the printed QR. */
function flagBounds(flagW, flagH, shiftY) {
  var x0 = Math.max(0, -(shiftY || 0));
  var x1 = Math.min(flagW, flagW - (shiftY || 0));
  if (x1 < x0) x1 = x0;
  return { x: x0, y: 0, w: Math.max(1, x1 - x0), h: flagH, flag: 1 };
}
/* y is the feed on a JO card. The bitmap is the full 20 mm, and the gap cuts
   the trailing rows, so a quiet zone that ends on that edge prints as only
   the top of the code. Keep it 3 mm inside both feed edges. shiftY is added
   when the pixels are drawn. */
function feedBounds(w, h, shiftY) {
  var inset = px(3);
  var y0 = Math.max(0, -(shiftY || 0)) + inset;
  var y1 = Math.min(h, h - (shiftY || 0)) - inset;
  if (y1 < y0) y1 = y0;
  return { x: 0, y: y0, w: w, h: Math.max(1, y1 - y0) };
}
function drawJewelryLayout(img, box, opts) {
  var contentW = box.labelH, contentH = box.labelW;
  var paper = new Img(contentW + box.tail, contentH);
  var drawn = paintLayout(paper, normalizeLayout('jewelry_tag', opts.layout), opts, 'jewelry_tag', flagBounds(contentW, contentH, box.inkShift || 0));
  var qrBox = null;
  if (drawn.qr) qrBox = { x: box.offsetX + (contentH - drawn.qr.y - drawn.qr.size), y: drawn.qr.x, size: drawn.qr.size };
  rotatePaper(img, box, paper);
  return { lines: drawn.lines, specPx: drawn.specPx, joPx: drawn.joPx, qr: drawn.qr ? drawn.qr.text : '', qrBox: qrBox, paper: paper, sheet: paper, placed: drawn.placed };
}
function drawCardLayout(img, box, opts) {
  var sheet = new Img(box.labelW, box.labelH);
  var drawn = paintLayout(sheet, normalizeLayout('jo_card', opts.layout), opts, 'jo_card', feedBounds(box.labelW, box.labelH, box.inkShift || 0));
  var dy, dx, pi, qrBox = null;
  for (dy = 0; dy < sheet.h; dy++) {
    for (dx = 0; dx < sheet.w; dx++) {
      pi = (dy * sheet.w + dx) * 4;
      if (sheet.d[pi] !== 0) continue;
      img.set(box.offsetX + dx, dy);
    }
  }
  if (drawn.qr) qrBox = { x: box.offsetX + drawn.qr.x, y: drawn.qr.y, size: drawn.qr.size };
  return { lines: drawn.lines, specPx: drawn.specPx, joPx: drawn.joPx, qr: drawn.qr ? drawn.qr.text : '', qrBox: qrBox, sheet: sheet, placed: drawn.placed };
}
/* Readable cable label: 25×30 mm flag, tail to the right, then rotated into the print bitmap. */
function drawJewelry(img, box, opts) {
  if (opts && opts.layout) return drawJewelryLayout(img, box, opts);
  var contentW = box.labelH, contentH = box.labelW;
  var paper = new Img(contentW + box.tail, contentH);
  var pad = px(1);
  var left = pad, right = contentW - pad, top = pad, bottom = contentH - pad;
  var innerW = right - left;
  var foldY = contentH >> 1;
  var lines = [];
  var runs = [];
  var price = moneyText(opts.price);
  var name = textOf(opts.name || opts.description);
  var spread = [pieceType(opts), upOf(opts.metal), upOf(opts.karat)].filter(Boolean);
  var stones = stoneText(opts);
  var weight = weightText(opts.weight != null && opts.weight !== '' ? opts.weight : opts.weight_g);
  var jo = joCode(opts.jo) || textOf(opts.jo);
  var sku = textOf(opts.sku || opts.item_id);
  var loc = textOf(opts.location);
  var logoW = LOGO_ROWS[0].length, logoH = LOGO_ROWS.length;
  var specPx = 0, joPx = 0;
  var nameBottom = top + logoH;

  if (price) {
    var priceMax = Math.max(8, innerW - logoW - 6);
    var priceSize = sizeThatFits(price, priceMax, 17, 12) || 12;
    if (metricsOf(price, priceSize).w > priceMax) price = ellipsis(price, priceMax, priceSize);
    var pm = metricsOf(price, priceSize);
    runs.push({ text: price, x: left, y: top + Math.max(0, Math.round((logoH - pm.ascent - pm.descent) / 2)), size: priceSize });
    lines.push(price);
  }
  blitBits(paper, LOGO_ROWS, right - logoW, top);

  if (name) {
    var nameY = top + logoH + 6;
    var nameRoom = Math.max(12, (foldY - pad - 20) - nameY);
    var nameSize = 15;
    var nameLines = wrapLines(name, innerW, nameSize, 2);
    while (nameSize > 11 && blockHeight(nameLines, nameSize) > nameRoom) {
      nameSize--;
      nameLines = wrapLines(name, innerW, nameSize, 2);
    }
    if (blockHeight(nameLines, nameSize) > nameRoom) nameLines = [ellipsis(name, innerW, nameSize)];
    var nameCursor = nameY, ni;
    for (ni = 0; ni < nameLines.length; ni++) {
      var nameM = metricsOf(nameLines[ni], nameSize);
      runs.push({ text: nameLines[ni], x: left, y: nameCursor, size: nameSize });
      lines.push(nameLines[ni]);
      nameCursor += Math.ceil(nameM.ascent + nameM.descent) + 2;
    }
    nameBottom = nameCursor;
  }

  if (spread.length) {
    var spreadSize = 12;
    function spreadFits(sz) {
      var ws = spread.map(function (t) { return metricsOf(t, sz).w; });
      var sum = 0, i;
      for (i = 0; i < ws.length; i++) sum += ws[i];
      if (spread.length === 1) return ws[0] <= innerW;
      if (spread.length === 2) return sum + 8 <= innerW;
      var mid = (left + right) / 2;
      return mid - ws[1] / 2 >= left + ws[0] + 4 && mid + ws[1] / 2 <= right - ws[2] - 4;
    }
    while (spreadSize > 8 && !spreadFits(spreadSize)) spreadSize--;
    var placed = spread.slice();
    if (!spreadFits(spreadSize)) {
      var slot = Math.max(8, Math.floor(innerW / placed.length) - 4);
      placed = placed.map(function (t) { return ellipsis(t, slot, spreadSize); });
    }
    var ws2 = placed.map(function (t) { return metricsOf(t, spreadSize).w; });
    var xs = [];
    if (placed.length === 1) xs = [left];
    else if (placed.length === 2) xs = [left, right - ws2[1]];
    else {
      var mid2 = (left + right) / 2;
      xs = [left, mid2 - ws2[1] / 2, right - ws2[2]];
    }
    var sm = metricsOf(placed[0], spreadSize);
    var spreadH = Math.ceil(sm.ascent + sm.descent);
    /* The row sits just above the fold, the way the template does. */
    var spreadY = foldY - pad - spreadH;
    if (spreadY < nameBottom + 6) spreadY = nameBottom + 6;
    placed.forEach(function (t, i) {
      runs.push({ text: t, x: Math.round(xs[i]), y: spreadY, size: spreadSize });
      lines.push(t);
    });
  }

  /* Lower flap. Stone starts at 16 px (2.0 mm, 5.7 pt). JO, location, and weight
     start at 14 px (1.8 mm, 5.0 pt). The QR uses 3 px modules, about 9.4 mm on a
     short JO, and stops 2 mm short of the flag edge that feeds into the tail.
     That edge is the bottom of the printed code. A line shrinks only when the
     full words would leave the flag or cover the QR. Price, the description,
     the metal row, and the logo stay as they are. */
  var STONE_PX = 16, STONE_MIN = 11, META_PX = 14, META_MIN = 10;
  var mods = jo ? makeQr(jo) : null;
  var mod = 3, quiet = 2;
  var qpix = mods ? qrSize(mods, mod, quiet) : 0;
  var stoneTop = foldY + pad;
  var tailGap = px(2);
  var maxQr = Math.min(bottom - stoneTop - 4 - STONE_PX, contentW - tailGap - pad);
  while (mods && mod > 1 && qpix > maxQr) {
    mod--;
    qpix = qrSize(mods, mod, quiet);
  }
  var qx0 = qpix ? contentW - tailGap - qpix : 0;
  var qy0 = qpix ? bottom - qpix : 0;
  if (mods && qpix) {
    var held = placeQr(mods, qx0, qy0, qpix, flagBounds(contentW, contentH, box.inkShift || 0));
    mod = held.mod; quiet = held.quiet; qpix = held.size; qx0 = held.x; qy0 = held.y;
  }
  var colRight = qpix ? qx0 - 4 : right;
  var colW = Math.max(8, colRight - left);
  function fitMeta(text, wrapN) {
    var size = META_PX, linesAt, track = CRISP_TRACK;
    if (wrapN > 1 && metricsOf(text, size, undefined, track).w > colW) {
      linesAt = wrapLines(text, colW, size, wrapN, undefined, track);
      if (linesAt.length && linesAt.join(' ').indexOf('...') < 0) return { lines: linesAt, size: size };
    }
    while (size > META_MIN && metricsOf(text, size, undefined, track).w > colW) size--;
    if (metricsOf(text, size, undefined, track).w <= colW) return { lines: [text], size: size };
    if (wrapN > 1) {
      linesAt = wrapLines(text, colW, META_MIN, wrapN, undefined, track);
      return { lines: linesAt.length ? linesAt : [ellipsis(text, colW, META_MIN, undefined, track)], size: META_MIN };
    }
    return { lines: [ellipsis(text, colW, META_MIN, undefined, track)], size: META_MIN };
  }
  var meta = [];
  if (jo) meta.push(fitMeta(jo, 1));
  if (sku) meta.push(fitMeta(sku, 1));
  if (loc) meta.push(fitMeta(loc, 2));
  if (weight) meta.push(fitMeta(weight, 1));
  joPx = jo ? meta[0].size : 0;
  var metaGap = 2, metaH = 0, mi, mj;
  for (mi = 0; mi < meta.length; mi++) {
    for (mj = 0; mj < meta[mi].lines.length; mj++) {
      metaH += Math.ceil(metricsOf(meta[mi].lines[mj], meta[mi].size, undefined, CRISP_TRACK).ascent + metricsOf(meta[mi].lines[mj], meta[mi].size, undefined, CRISP_TRACK).descent) + (metaH ? metaGap : 0);
    }
  }
  var clusterBottom = bottom;
  var clusterH = Math.max(qpix, metaH);
  var clusterTop = clusterBottom - clusterH;
  var stoneRoom = clusterTop - 4 - stoneTop;
  var stoneLines = [];
  if (stones && stoneRoom > 8) {
    specPx = STONE_PX;
    var stoneWrap = 3, stoneGuard = 0;
    while (stoneGuard++ < 24) {
      var trial = stoneWrap <= 1 ? [metricsOf(stones, specPx, undefined, CRISP_TRACK).w <= innerW ? stones : ellipsis(stones, innerW, specPx, undefined, CRISP_TRACK)] : wrapLines(stones, innerW, specPx, stoneWrap, undefined, CRISP_TRACK);
      if (blockHeight(trial, specPx, undefined, CRISP_TRACK) <= stoneRoom) { stoneLines = trial; break; }
      if (specPx > STONE_MIN) { specPx--; continue; }
      if (stoneWrap > 1) { stoneWrap--; continue; }
      stoneLines = trial;
      break;
    }
    var sy = stoneTop;
    stoneLines.forEach(function (t) {
      var m = metricsOf(t, specPx, undefined, CRISP_TRACK);
      runs.push({ text: t, x: left, y: sy, size: specPx, crisp: 1, track: CRISP_TRACK });
      lines.push(t);
      sy += Math.ceil(m.ascent + m.descent) + 2;
    });
  }

  var metaTop = qpix ? (bottom - qpix) + Math.max(0, Math.round((qpix - metaH) / 2)) : clusterTop;
  if (metaTop + metaH > bottom) metaTop = bottom - metaH;
  if (metaTop < clusterTop) metaTop = clusterTop;
  var metaY = metaTop;
  meta.forEach(function (row) {
    row.lines.forEach(function (t) {
      var m = metricsOf(t, row.size, undefined, CRISP_TRACK);
      runs.push({ text: t, x: left, y: metaY, size: row.size, crisp: 1, track: CRISP_TRACK });
      lines.push(t);
      metaY += Math.ceil(m.ascent + m.descent) + metaGap;
    });
  });

  stampLocal(paper, runs);
  /* foldY still places the metal row and the stone. The dashed guide is not drawn. */
  var qrBox = null;
  if (mods) {
    paper.qr(mods, qx0, qy0, mod, quiet);
    qrBox = { x: box.offsetX + (contentH - qy0 - qpix), y: qx0, size: qpix };
  }
  rotatePaper(img, box, paper);
  return { lines: lines, specPx: specPx, joPx: joPx, qr: jo, qrBox: qrBox, paper: paper };
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
  box.inkShift = shiftY;
  var rawSet = img.set.bind(img);
  img.set = function (x, y) { rawSet(x, y + shiftY); };
  var lines = [];
  var runs = [];
  var jo = joCode(opts.jo) || clean(opts.jo);
  var qrText = jo;
  var specPx = 0;
  var joPx = 0;
  var qrBox = null;
  var paperOut = null;
  var sheetOut = null;
  var placed = [];
  var x0 = box.offsetX;
  var pad = px(1); // ~1 mm, so type does not touch the 30 mm edges

  if (kind === 'cal_jo' || kind === 'cal_tag') {
    img.frame(x0 + 4, 0 + 4, box.labelW - 8, box.labelH - 8, 2);
    drawCentre(img, x0, 0, box.labelW, box.labelH);
    if (kind === 'cal_tag') img.rect(x0 + 4, box.labelH - 1, box.labelW - 8, 1);
    img.rect(x0 + 6, 6, 8, 8);
  } else if (kind === 'jewelry_tag') {
    var tag = drawJewelry(img, box, opts);
    lines = tag.lines;
    specPx = tag.specPx;
    joPx = tag.joPx;
    qrText = tag.qr;
    qrBox = tag.qrBox;
    paperOut = tag.paper;
    sheetOut = tag.sheet || null;
    placed = tag.placed || [];
  } else if (opts && opts.layout) {
    var cardLay = drawCardLayout(img, box, opts);
    lines = cardLay.lines;
    specPx = cardLay.specPx;
    joPx = cardLay.joPx;
    qrText = cardLay.qr;
    qrBox = cardLay.qrBox;
    sheetOut = cardLay.sheet;
    placed = cardLay.placed || [];
  } else {
    /* The bitmap is the full 20 mm feed, and the gap cuts the trailing rows.
       A code that fills that height loses its bottom. Four millimetres of
       clear feed leaves the quiet zone inside the 3 mm the gap needs, including
       the B31's 0.5 mm shift. The left ink margin is repeated on the right,
       and the JO shrinks into the width that is left. */
    var mods2 = jo ? makeQr(jo) : null;
    var cardRoom = feedBounds(box.labelW, box.labelH, shiftY);
    var qrMax = box.labelH - px(4) * 2;
    if (qrMax > cardRoom.h) qrMax = cardRoom.h;
    if (qrMax > cardRoom.w) qrMax = cardRoom.w;
    var picked = mods2 ? chooseQr(mods2, qrMax) : { mod: 3, quiet: 4, size: 0 };
    var mod2 = picked.mod, quiet2 = picked.quiet, qpix2 = picked.size;
    var gap2 = qpix2 ? 4 : 0;
    var leftInk2 = qpix2 ? pad + quiet2 * mod2 : pad;
    var target2 = Math.max(8, box.labelW - 1 - leftInk2 - (pad + qpix2 + gap2));
    var sub = smallLine(opts);
    var innerH = box.labelH - pad * 2;
    var cardJo = null;
    if (jo) {
      cardJo = sizeForInk(jo, target2, 72, 12); // a 7-character JO plus a letter (26-1234A) is wider than the old 16 px floor
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
    var qrY2 = qpix2 ? Math.round((box.labelH - qpix2) / 2) : 0;
    var qrX2 = pad;
    if (mods2) {
      if (qrX2 < cardRoom.x) qrX2 = cardRoom.x;
      if (qrY2 < cardRoom.y) qrY2 = cardRoom.y;
      if (qrX2 + qpix2 > cardRoom.x + cardRoom.w) qrX2 = cardRoom.x + cardRoom.w - qpix2;
      if (qrY2 + qpix2 > cardRoom.y + cardRoom.h) qrY2 = cardRoom.y + cardRoom.h - qpix2;
      qrBox = { x: x0 + qrX2, y: qrY2, size: qpix2 };
    }
    stampText(img, runs, box);
    if (mods2) img.qr(mods2, qrBox.x, qrBox.y, mod2, quiet2);
  }

  if (qrBox) qrBox = { x: qrBox.x, y: qrBox.y + shiftY, size: qrBox.size };

  return {
    width: box.width, height: box.height, data: img.d, lines: lines, qr: qrText,
    offsetX: box.offsetX, labelW: box.labelW, labelH: box.labelH, tail: box.tail,
    shiftX: shiftX, shiftY: shiftY,
    specPx: specPx, joPx: joPx, preset: box.preset, kind: kind, head: head, qrBox: qrBox,
    paper: paperOut ? paperOut.d : null, paperW: paperOut ? paperOut.w : 0, paperH: paperOut ? paperOut.h : 0,
    sheet: sheetOut ? sheetOut.d : null, sheetW: sheetOut ? sheetOut.w : 0, sheetH: sheetOut ? sheetOut.h : 0,
    placed: placed || []
  };
}

/* The label itself, 1:1, with no grey pad. Jewelry is the readable cable label.
   A JO card is the sticker. Printer offsets stay on the print bitmap. */
function labelCanvas(rendered) {
  var w, h, data, src;
  if (rendered.sheetW && rendered.sheet) {
    w = rendered.sheetW; h = rendered.sheetH; data = rendered.sheet;
  } else if (rendered.paperW && rendered.paper) {
    w = rendered.paperW; h = rendered.paperH; data = rendered.paper;
  } else {
    src = stickerPixels(rendered);
    w = src.width; h = src.height; data = src.data;
  }
  var c = makeCanvas(w, h);
  var ctx = c.getContext('2d');
  var image = ctx.createImageData(w, h);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return c;
}
/* Exit orientation: flaps side by side, tail below. This is the bitmap the printer feeds. */
function exitCanvas(rendered) {
  var src = stickerPixels(rendered);
  var c = makeCanvas(src.width, src.height);
  var ctx = c.getContext('2d');
  var image = ctx.createImageData(src.width, src.height);
  image.data.set(src.data);
  ctx.putImageData(image, 0, 0);
  return c;
}
/* Two flap rectangles on the print bitmap. The fold line sits on the shared edge. The tail is outside both. */
function flapRects(img) {
  var x0 = (img.offsetX | 0) - (img.shiftX | 0);
  var y0 = -(img.shiftY | 0);
  var half = px(15);
  var flag = px(25);
  var across = img.labelW || px(30);
  return [
    { x: x0, y: y0, w: half, h: flag },
    { x: x0 + half, y: y0, w: across - half, h: flag }
  ];
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

/* Display only. The print bitmap stays the full head. A JO card is its sticker.
   A jewelry tag is shown as it leaves the printer: two flaps, then the 45 mm tail.
   A saved offset moves ink inside that paper. */
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
function addRound(ctx, x, y, w, h, r) {
  var rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
/* Die-cut in exit pixels. Two 15×25 mm flaps, then the 45 mm tail. scale multiplies label pixels. */
function tagOutline(ctx, ox, oy, scale) {
  var u = function (mm) { return px(mm) * scale; };
  var r = u(2);
  addRound(ctx, ox, oy, u(15), u(25), r);
  addRound(ctx, ox + u(15), oy, u(15), u(25), r);
  addRound(ctx, ox, oy + u(25), u(30), u(45), r);
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
/* Printed side, flaps at the top, tail below. B1 direction "top" lays bitmap x to the right
   and bitmap y down the feed, and row 0 is the flap end. This is that label, without the head margin. */
function paperView(rendered) {
  var src = stickerPixels(rendered);
  return {
    width: src.width, height: src.height, data: src.data,
    labelW: rendered.labelW, labelH: rendered.labelH, tail: rendered.tail || 0
  };
}
function preview(rendered, opts) {
  opts = opts || {};
  var scale = opts.scale > 0 ? opts.scale : 4;
  /* Smoothing is opt-in. The default scales the 203 dpi 1-bit bitmap by whole
     pixels, so a CSS preview can use image-rendering: pixelated and stay black. */
  var smooth = opts.smooth === true;
  var labelW = rendered.labelW, labelH = rendered.labelH, tail = rendered.tail || 0;
  var jewelry = rendered.kind === 'jewelry_tag' && tail;
  var readable = !jewelry && rendered.paperW > 0 && rendered.paper;
  var srcW = readable ? rendered.paperW : (jewelry ? labelW : labelW);
  var srcH = readable ? rendered.paperH : labelH + tail;
  var pad = px(4), radius = px(2);
  var src = readable ? { width: srcW, height: srcH, data: rendered.paper } : stickerPixels(rendered);
  var showH = srcH;
  if (jewelry && !opts.full) showH = Math.min(srcH, labelH + px(8));
  var srcCanvas = makeCanvas(srcW, srcH);
  var sctx = srcCanvas.getContext('2d');
  var id = sctx.createImageData(srcW, srcH);
  id.data.set(src.data);
  sctx.putImageData(id, 0, 0);
  var outW = (srcW + pad * 2) * scale, outH = (showH + pad * 2) * scale;
  var canvas = makeCanvas(outW, outH);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = PREVIEW_GRAY;
  ctx.fillRect(0, 0, outW, outH);
  var x = pad * scale, y = pad * scale, w = srcW * scale, h = showH * scale, rad = radius * scale;
  ctx.save();
  if (jewelry) {
    ctx.beginPath();
    tagOutline(ctx, x, y, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
  } else {
    roundPath(ctx, x, y, w, h, rad);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
  }
  ctx.imageSmoothingEnabled = !!smooth;
  if (smooth && 'imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, srcW, showH, x, y, w, h);
  ctx.restore();
  if (jewelry) {
    ctx.beginPath();
    tagOutline(ctx, x, y, scale);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = Math.max(1, scale);
    ctx.stroke();
  } else if (!readable && tail) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(60,60,60,0.28)';
    ctx.lineWidth = Math.max(1, scale);
    var fy = Math.round(y + labelH * scale) + 0.5;
    ctx.moveTo(x, fy);
    ctx.lineTo(x + w, fy);
    ctx.stroke();
  }
  var out = ctx.getImageData(0, 0, outW, outH);
  return {
    width: outW, height: outH, data: out.data, canvas: canvas,
    labelW: labelW, labelH: labelH, tail: tail, scale: scale, pad: pad, radius: radius
  };
}

/* Readable jewelry tag for the screen. Words are text records the page draws as HTML.
   QR modules and the logo are rectangles the page draws as SVG. The Niimbot send path
   still uses render()'s 1-bit raster. */
function tagScene(opts) {
  opts = Object.assign({ kind: 'jewelry_tag' }, opts || {});
  opts.kind = 'jewelry_tag';
  var capture = { texts: [], rects: [] };
  root.__oypCapture = capture;
  var rendered;
  try { rendered = render(opts); }
  finally { root.__oypCapture = null; }
  return {
    width: rendered.paperW || 0,
    height: rendered.paperH || 0,
    texts: capture.texts,
    rects: capture.rects,
    placed: rendered.placed || [],
    lines: rendered.lines || []
  };
}

root.OYPLabel = {
  render: render, toCanvas: toCanvas, preview: preview, labelCanvas: labelCanvas, exitCanvas: exitCanvas, tagOutline: tagOutline, flapRects: flapRects, px: px, joCode: joCode, specLines: specLines, smallLine: smallLine,
  tagScene: tagScene,
  normalizeLayout: normalizeLayout, elementDefaults: elementDefaults, layoutFields: layoutFields, paperMm: paperMm,
  ready: ready, PRESETS: PRESETS, HEADS: HEADS, SPEC_PX: SPEC_PX, canvasFor: canvasFor, placeBias: placeBias, paperView: paperView
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPLabel;
})(typeof window !== 'undefined' ? window : globalThis);
