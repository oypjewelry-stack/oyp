/* Niimbot sticker bitmaps. 203 dpi, print direction "top": canvas width is the printhead,
   canvas height is the feed. The 30 mm label is centred. Text is Inter Bold (OFL), drawn with
   fillText at 4x and reduced to the 1-bit label. QR modules stay crisp rectangles.
   The client name is never read. JO card: 30×20 (240×160), QR on the left, tall.
   Jewelry tag: T30*25+45 cable label, read as 25 mm wide × 30 mm high with a
   45 mm blank tail to the right (the NIIMBOT Direction ← layout). That picture is
   drawn upright, then turned into the print bitmap so direction "top" matches it:
   the 30 mm is across the head and the 25 mm plus the tail run down the feed.
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
  var r, c, row;
  for (r = 0; r < rows.length; r++) {
    row = rows[r];
    for (c = 0; c < row.length; c++) if (row.charAt(c) === '1') img.set(x + c, y + r);
  }
}
function dashes(img, x, y, w) {
  var on = 3, gap = 2, i = 0, n;
  while (i < w) {
    n = Math.min(on, w - i);
    img.rect(x + i, y, n, 1);
    i += on + gap;
  }
}
/* Words wrap to maxLines. The last line ellipsizes when the rest does not fit. */
function wrapLines(text, maxW, size, maxLines, bold) {
  var words = text.split(' ').filter(Boolean), lines = [], cur = '', i, trial;
  if (!words.length || maxLines < 1) return lines;
  for (i = 0; i < words.length; i++) {
    trial = cur ? cur + ' ' + words[i] : words[i];
    if (metricsOf(trial, size, bold).w <= maxW) { cur = trial; continue; }
    if (cur && lines.length < maxLines - 1) { lines.push(cur); cur = ''; i--; continue; }
    lines.push(ellipsis(cur ? cur + ' ' + words.slice(i).join(' ') : words.slice(i).join(' '), maxW, size, bold));
    return lines;
  }
  if (cur) lines.push(cur);
  return lines;
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
function fontCss(size, bold) {
  var weight = (bold === 0 || bold === false) ? '400' : '700';
  return weight + ' ' + (size * SCALE) + 'px ' + FAMILY;
}
function metricsOf(text, size, bold) {
  var ctx = measureCtx();
  ctx.font = fontCss(size, bold);
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
function ellipsis(text, maxW, size, bold) {
  if (metricsOf(text, size, bold).w <= maxW) return text;
  var cut = text;
  while (cut.length > 1 && metricsOf(cut.replace(/\s+$/, '') + '...', size, bold).w > maxW) cut = cut.slice(0, -1);
  cut = cut.replace(/\s+$/, '');
  var out = (cut || text.charAt(0)) + '...';
  while (out.length > 4 && metricsOf(out, size, bold).w > maxW) out = out.slice(0, -4).replace(/\s+$/, '') + '...';
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
/* Same 4× threshold as stampText, in the image's own pixels. run.y is the top of the line. */
function stampLocal(img, runs) {
  if (!runs.length) return;
  var tw = img.w * SCALE, th = img.h * SCALE;
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
    ctx.fillText(run.text, Math.round(run.x * SCALE), Math.round(run.y * SCALE + ascent));
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
      if (dark >= 6) img.set(x, y);
    }
  }
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
    price: { show: 1, x: 1, y: 0.8, size: 17, bold: 1, align: 'left', w: 14, wrap: 1 },
    logo: { show: 1, x: 19.5, y: 1 },
    name: { show: 1, x: 1, y: 4.1, size: 15, bold: 1, align: 'left', w: 23, wrap: 1 },
    type: { show: 1, x: 1, y: 12.5, size: 12, bold: 1, align: 'left', w: 7, wrap: 1 },
    metal: { show: 1, x: 9, y: 12.5, size: 12, bold: 1, align: 'center', w: 7, wrap: 1 },
    karat: { show: 1, x: 16.5, y: 12.5, size: 12, bold: 1, align: 'right', w: 7.5, wrap: 1 },
    fold: { show: 1, x: 1, y: 15, w: 23 },
    stones: { show: 1, x: 1, y: 15.5, size: 10, bold: 1, align: 'left', w: 23, wrap: 3 },
    weight: { show: 1, x: 1, y: 27.2, size: 9, bold: 1, align: 'left', w: 10, wrap: 1 },
    jo: { show: 1, x: 8, y: 23.2, size: 9, bold: 1, align: 'right', w: 9.2, wrap: 1 },
    sku: { show: 1, x: 8, y: 24.6, size: 9, bold: 1, align: 'right', w: 9.2, wrap: 1 },
    location: { show: 1, x: 8, y: 26, size: 9, bold: 1, align: 'right', w: 9.2, wrap: 1 },
    qr: { show: 1, x: 17.8, y: 22.8, qr: 6.2 },
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
  var card = kind === 'jo_card', out = [], i;
  for (i = 0; i < LAYOUT_FIELDS.length; i++) if (card || !LAYOUT_FIELDS[i].card) out.push(LAYOUT_FIELDS[i]);
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
  var mod = 1, best = 1, size;
  while (mod < 16) {
    size = qrSize(mods, mod, 2);
    if (size > boxPx) break;
    best = mod;
    mod++;
  }
  return { mod: best, quiet: 2, size: qrSize(mods, best, 2) };
}
function paintLayout(img, layout, opts, kind) {
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
      x = px(el.x); y = px(el.y); w = Math.max(1, px(el.w || 1));
      dashes(img, x, y, w);
      placed.push({ id: 'fold', x: x, y: y > 3 ? y - 3 : 0, w: w, h: 8 });
      continue;
    }
    if (field.kind === 'qr') {
      text = elementText('qr', opts);
      x = px(el.x); y = px(el.y); w = Math.max(8, px(el.qr || 6));
      if (text) {
        var mods = makeQr(text), fit = fitQrBox(mods, w);
        img.qr(mods, x, y, fit.mod, fit.quiet);
        qrInfo = { x: x, y: y, size: fit.size, text: text };
      }
      placed.push({ id: 'qr', x: x, y: y, w: w, h: w });
      continue;
    }
    text = elementText(field.id, opts);
    x = px(el.x); y = px(el.y); w = Math.max(4, px(el.w || 4));
    size = el.size | 0; wrapN = el.wrap | 0 || 1; bold = el.bold ? 1 : 0;
    if (field.id === 'stones') specPx = size;
    if (field.id === 'jo') joPx = size;
    block = [];
    if (text) block = wrapN <= 1 ? [ellipsis(text, w, size, bold)] : wrapLines(text, w, size, wrapN, bold);
    if (!block.length) {
      placed.push({ id: field.id, x: x, y: y, w: w, h: Math.max(8, size) });
      continue;
    }
    cursor = y;
    for (li = 0; li < block.length; li++) {
      m = metricsOf(block[li], size, bold);
      tw = m.w;
      if (el.align === 'right') tx = x + w - tw;
      else if (el.align === 'center') tx = x + (w - tw) / 2;
      else tx = x;
      lineH = Math.ceil(m.ascent + m.descent);
      runs.push({ text: block[li], x: Math.round(tx), y: cursor, size: size, bold: bold });
      lines.push(block[li]);
      cursor += lineH + 2;
    }
    placed.push({ id: field.id, x: x, y: y, w: w, h: Math.max(8, cursor - y) });
  }
  stampLocal(img, runs);
  return { lines: lines, placed: placed, specPx: specPx, joPx: joPx, qr: qrInfo };
}
function rotatePaper(img, box, paper) {
  var contentH = box.labelW, dy, dx, pi;
  for (dy = 0; dy < paper.h; dy++) {
    for (dx = 0; dx < paper.w; dx++) {
      pi = (dy * paper.w + dx) * 4;
      if (paper.d[pi] !== 0) continue;
      img.set(box.offsetX + (contentH - 1 - dy), dx);
    }
  }
}
function drawJewelryLayout(img, box, opts) {
  var contentW = box.labelH, contentH = box.labelW;
  var paper = new Img(contentW + box.tail, contentH);
  var drawn = paintLayout(paper, normalizeLayout('jewelry_tag', opts.layout), opts, 'jewelry_tag');
  var qrBox = null;
  if (drawn.qr) qrBox = { x: box.offsetX + (contentH - drawn.qr.y - drawn.qr.size), y: drawn.qr.x, size: drawn.qr.size };
  rotatePaper(img, box, paper);
  return { lines: drawn.lines, specPx: drawn.specPx, joPx: drawn.joPx, qr: drawn.qr ? drawn.qr.text : '', qrBox: qrBox, paper: paper, sheet: paper, placed: drawn.placed };
}
function drawCardLayout(img, box, opts) {
  var sheet = new Img(box.labelW, box.labelH);
  var drawn = paintLayout(sheet, normalizeLayout('jo_card', opts.layout), opts, 'jo_card');
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
    var nameSize = sizeThatFits(name, innerW, 15, 11) || 11;
    if (metricsOf(name, nameSize).w > innerW) name = ellipsis(name, innerW, nameSize);
    var nameY = top + logoH + 6;
    var nameM = metricsOf(name, nameSize);
    runs.push({ text: name, x: left, y: nameY, size: nameSize });
    lines.push(name);
    nameBottom = nameY + Math.ceil(nameM.ascent + nameM.descent);
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
    var spreadY = foldY - 6 - spreadH;
    if (spreadY < nameBottom + 6) spreadY = nameBottom + 6;
    placed.forEach(function (t, i) {
      runs.push({ text: t, x: Math.round(xs[i]), y: spreadY, size: spreadSize });
      lines.push(t);
    });
  }

  var mods = jo ? makeQr(jo) : null;
  var mod = 2, quiet = 2;
  var qpix = mods ? qrSize(mods, mod, quiet) : 0;
  var codes = [];
  if (jo) codes.push(jo);
  if (sku) codes.push(sku);
  if (loc) codes.push(loc);
  var metaSize = 9;
  var codeMax = Math.max(8, (qpix ? right - 4 - qpix : right) - left - 36);
  while (metaSize > 7 && codes.some(function (t) { return metricsOf(t, metaSize).w > codeMax; })) metaSize--;
  codes = codes.map(function (t) {
    if (t === jo && metricsOf(t, metaSize).w <= codeMax) return t;
    return metricsOf(t, metaSize).w <= codeMax ? t : ellipsis(t, codeMax, metaSize);
  });
  if (jo && codes.length && codes[0] !== jo && metricsOf(jo, 7).w <= codeMax) {
    metaSize = 7;
    codes[0] = jo;
  }
  joPx = jo ? metaSize : 0;
  var clusterBottom = bottom;
  var clusterH = qpix || (codes.length ? codes.length * 12 : 0);
  var clusterTop = clusterBottom - clusterH;
  var stoneTop = foldY + 4;
  var stoneRoom = clusterTop - 4 - stoneTop;
  var stoneLines = [];
  if (stones && stoneRoom > 8) {
    specPx = 10;
    while (specPx > 8) {
      var trial = wrapLines(stones, innerW, specPx, 3);
      var tall = 0, li;
      for (li = 0; li < trial.length; li++) {
        var tm = metricsOf(trial[li], specPx);
        tall += Math.ceil(tm.ascent + tm.descent) + (li ? 2 : 0);
      }
      if (tall <= stoneRoom) { stoneLines = trial; break; }
      specPx--;
    }
    if (!stoneLines.length) {
      specPx = 8;
      stoneLines = wrapLines(stones, innerW, specPx, 3);
    }
    var sy = stoneTop;
    stoneLines.forEach(function (t) {
      var m = metricsOf(t, specPx);
      runs.push({ text: t, x: left, y: sy, size: specPx });
      lines.push(t);
      sy += Math.ceil(m.ascent + m.descent) + 2;
    });
  }

  var codeGap = 2;
  var codeH = 0;
  codes.forEach(function (t, i) {
    var m = metricsOf(t, metaSize);
    codeH += Math.ceil(m.ascent + m.descent) + (i ? codeGap : 0);
  });
  var codeY = qpix ? clusterTop + Math.max(0, Math.round((qpix - codeH) / 2)) : clusterTop;
  var codesRight = qpix ? right - qpix - 4 : right;
  codes.forEach(function (t) {
    var m = metricsOf(t, metaSize);
    var w = m.w;
    runs.push({ text: t, x: Math.round(codesRight - w), y: codeY, size: metaSize });
    lines.push(t);
    codeY += Math.ceil(m.ascent + m.descent) + codeGap;
  });
  if (weight) {
    var wm = metricsOf(weight, metaSize);
    var weightY = clusterBottom - Math.ceil(wm.ascent + wm.descent);
    runs.push({ text: weight, x: left, y: weightY, size: metaSize });
    lines.push(weight);
  }

  stampLocal(paper, runs);
  dashes(paper, left, foldY, innerW);
  var qrBox = null;
  if (mods) {
    var qx = right - qpix, qy = bottom - qpix;
    paper.qr(mods, qx, qy, mod, quiet);
    qrBox = { x: box.offsetX + (contentH - qy - qpix), y: qx, size: qpix };
  }
  var dy, dx, pi;
  for (dy = 0; dy < paper.h; dy++) {
    for (dx = 0; dx < paper.w; dx++) {
      pi = (dy * paper.w + dx) * 4;
      if (paper.d[pi] !== 0) continue;
      img.set(box.offsetX + (contentH - 1 - dy), dx);
    }
  }
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

/* Display only. The print bitmap stays the full head. A JO card crops to the
   sticker. A jewelry tag shows the readable cable label: 25×30 mm, tail to the
   right, dashed fold already in the ink. White rounded paper on a mid-gray field.
   A saved offset moves JO-card ink inside that paper. */
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
  var readable = rendered.paperW > 0 && rendered.paper;
  var srcW = readable ? rendered.paperW : labelW;
  var srcH = readable ? rendered.paperH : labelH + tail;
  var pad = px(4), radius = px(2);
  var src = readable ? { width: srcW, height: srcH, data: rendered.paper } : stickerPixels(rendered);
  var srcCanvas = makeCanvas(srcW, srcH);
  var sctx = srcCanvas.getContext('2d');
  var id = sctx.createImageData(srcW, srcH);
  id.data.set(src.data);
  sctx.putImageData(id, 0, 0);
  var outW = (srcW + pad * 2) * scale, outH = (srcH + pad * 2) * scale;
  var canvas = makeCanvas(outW, outH);
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = PREVIEW_GRAY;
  ctx.fillRect(0, 0, outW, outH);
  var x = pad * scale, y = pad * scale, w = srcW * scale, h = srcH * scale, rad = radius * scale;
  roundPath(ctx, x, y, w, h, rad);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.save();
  roundPath(ctx, x, y, w, h, rad);
  ctx.clip();
  ctx.imageSmoothingEnabled = !!smooth;
  if (smooth && 'imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, x, y, w, h);
  if (!readable && tail) {
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
  render: render, toCanvas: toCanvas, preview: preview, labelCanvas: labelCanvas, px: px, joCode: joCode, specLines: specLines, smallLine: smallLine,
  normalizeLayout: normalizeLayout, elementDefaults: elementDefaults, layoutFields: layoutFields, paperMm: paperMm,
  ready: ready, PRESETS: PRESETS, HEADS: HEADS, SPEC_PX: SPEC_PX, canvasFor: canvasFor, placeBias: placeBias
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPLabel;
})(typeof window !== 'undefined' ? window : globalThis);
