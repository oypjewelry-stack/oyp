/* Niimbot sticker bitmaps. 203 dpi, print direction "top": canvas width is the printhead,
   canvas height is the feed. The 30 mm label is centred. Text is Inter Bold (OFL), drawn with
   fillText at 4x and reduced to the 1-bit label. QR modules stay crisp rectangles.
   The client name is never read. JO card: 30×20 (240×160). Jewelry tag: 30×25 head plus a
   45 mm blank tail, 560 px gap to gap. */
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
function canvasFor(kind, head) {
  var p = presetOf(kind);
  var labelW = px(p.wMm), labelH = px(p.hMm), tail = px(p.tailMm);
  return {
    head: head, labelW: labelW, labelH: labelH, tail: tail,
    offsetX: Math.round((head - labelW) / 2),
    width: head, height: labelH + tail, preset: p.id
  };
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
function fitSpecs(lines, maxW) {
  var size = SPEC_PX;
  while (size > SPEC_MIN && lines.some(function (t) { return metricsOf(t, size).w > maxW; })) size -= 1;
  return { size: size, lines: lines.map(function (t) { return ellipsis(t, maxW, size); }) };
}
function fitLine(text, maxW, start, min) {
  var size = sizeThatFits(text, maxW, start, min);
  if (size) return { text: text, size: size };
  return { text: ellipsis(text, maxW, min), size: min };
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
  var box = canvasFor(kind, head);
  var img = new Img(box.width, box.height);
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
    var specs = specLines(opts);
    var mods = jo ? makeQr(jo) : null;
    var mod = 3, quiet = 4;
    var innerW = box.labelW - pad * 2;
    var fitted = specs.length ? fitSpecs(specs, innerW) : { size: 0, lines: [] };
    specPx = fitted.size;
    var specInk = specPx ? metricsOf('H', specPx) : { ascent: 0, descent: 0 };
    var lineH = specInk.ascent + specInk.descent;
    var specGap = 4;
    var specBlock = fitted.lines.length ? fitted.lines.length * lineH + (fitted.lines.length - 1) * specGap : 0;
    var qpix = mods ? qrSize(mods, mod, quiet) : 0;
    var specTop = box.labelH - pad - specBlock;
    if (qpix > specTop - pad - 4) { mod = 2; qpix = mods ? qrSize(mods, mod, quiet) : 0; }
    var beside = Math.max(0, innerW - qpix - 8);
    var joMin = specPx ? specPx + 2 : 18;
    if (jo) {
      var besideSize = sizeThatFits(jo, beside, JO_MAX, joMin);
      if (besideSize) {
        joPx = besideSize;
        var jm = metricsOf(jo, joPx);
        var ty = pad + Math.max(0, Math.round((qpix - jm.ascent - jm.descent) / 2));
        lines.push(jo);
        runs.push({ text: jo, x: x0 + pad + qpix + 8, y: ty, size: joPx });
      } else {
        var under = fitLine(jo, innerW, JO_MAX, joMin);
        joPx = under.size;
        lines.push(under.text);
        runs.push({ text: under.text, x: x0 + pad, y: pad + qpix + 4, size: joPx });
      }
    }
    if (mods) qrBox = { x: x0 + pad, y: pad, size: qpix };
    fitted.lines.forEach(function (t, i) {
      lines.push(t);
      runs.push({ text: t, x: x0 + pad, y: specTop + i * (lineH + specGap), size: specPx });
    });
    stampText(img, runs, box);
    if (mods) img.qr(mods, qrBox.x, qrBox.y, mod, quiet);
  } else {
    var mods2 = jo ? makeQr(jo) : null;
    var mod2 = 3, quiet2 = 4;
    var qpix2 = mods2 ? qrSize(mods2, mod2, quiet2) : 0;
    if (qpix2 > box.labelH - pad * 2) { mod2 = 2; qpix2 = mods2 ? qrSize(mods2, mod2, quiet2) : 0; }
    var sub = smallLine(opts);
    var beside2 = box.labelW - pad * 2 - qpix2 - 8;
    if (jo) {
      var cardJo = fitLine(jo, beside2, 36, 18);
      joPx = cardJo.size;
      lines.push(cardJo.text);
    }
    var subFit = null;
    if (sub) {
      var subMax = Math.max(12, joPx - 4);
      subFit = fitLine(sub, beside2, Math.min(16, subMax), 12);
      if (subFit.size >= joPx) subFit = null;
      else lines.push(subFit.text);
    }
    var jm2 = jo ? metricsOf(lines[0], joPx) : { ascent: 0, descent: 0 };
    var sm2 = subFit ? metricsOf(subFit.text, subFit.size) : null;
    var block = jm2.ascent + jm2.descent + (sm2 ? 4 + sm2.ascent + sm2.descent : 0);
    var textY = Math.round((box.labelH - block) / 2);
    var textX = x0 + pad + qpix2 + 8;
    if (jo) runs.push({ text: lines[0], x: textX, y: textY, size: joPx });
    if (subFit) runs.push({ text: subFit.text, x: textX, y: textY + jm2.ascent + jm2.descent + 4, size: subFit.size });
    var qrY = Math.round((box.labelH - qpix2) / 2);
    if (mods2) qrBox = { x: x0 + pad, y: qrY, size: qpix2 };
    stampText(img, runs, box);
    if (mods2) img.qr(mods2, qrBox.x, qrBox.y, mod2, quiet2);
  }

  return {
    width: box.width, height: box.height, data: img.d, lines: lines, qr: qrText,
    offsetX: box.offsetX, labelW: box.labelW, labelH: box.labelH, tail: box.tail,
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

root.OYPLabel = {
  render: render, toCanvas: toCanvas, px: px, joCode: joCode, specLines: specLines, smallLine: smallLine,
  ready: ready, PRESETS: PRESETS, HEADS: HEADS, SPEC_PX: SPEC_PX, canvasFor: canvasFor
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPLabel;
})(typeof window !== 'undefined' ? window : globalThis);
