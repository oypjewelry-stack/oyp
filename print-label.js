/* Niimbot sticker bitmaps. Pure black on white, nearest-neighbour glyphs, no client name.
   Print direction "top" (B31 and B1 in niimbluelib printer_models): canvas width is the
   printhead, canvas height is the feed. 203 dpi ≈ 8 px/mm. The 30 mm label is centred on the head.
   JO card: 30×20 mm (240×160) on a 600 px (B31) or 384 px (B1) head.
   Jewelry tag: 30×25 mm printable head plus a 45 mm blank tail. Gap to gap is px(25)+px(45) = 560. */
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
var SPEC_PX = 22; // 22 px at 203 dpi is 2.75 mm, the jewelry-tag spec size

/* 5×7, row strings, '1' is black. Enough for a JO, a date, and short specs. */
var FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  'C': ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  'G': ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  'I': ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  'J': ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  'N': ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  'W': ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

function joCode(s) {
  var m = String(s || '').toUpperCase().match(/(\d{2})\s*[-,.\/ ]?\s*(\d{3,4})([A-Z])?/);
  return m ? m[1] + '-' + m[2] + (m[3] || '') : '';
}
function clean(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9 ./-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function metrics(cap) {
  var cw = Math.max(3, Math.round(cap * 5 / 7));
  var gap = Math.max(1, Math.round(cap / 8));
  return { cw: cw, ch: cap, gap: gap, step: cw + gap };
}
function measure(text, cap, bold) {
  var m = metrics(cap);
  if (!text) return 0;
  return text.length * m.step - m.gap + (bold ? 1 : 0);
}
function fitCap(text, maxW, maxH, minH, bold) {
  var h = maxH;
  while (h > minH && measure(text, h, bold) > maxW) h -= 1;
  return h;
}
function clipTo(text, cap, maxW, bold) {
  var t = text;
  while (t.length > 1 && measure(t, cap, bold) > maxW) t = t.slice(0, -1).replace(/\s+$/, '');
  return t;
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
Img.prototype.glyph = function (rows, x, y, cw, ch, bold) {
  var gh = rows.length, gw = rows[0].length;
  for (var py = 0; py < ch; py++) {
    var sy = Math.floor(py * gh / ch); if (sy >= gh) sy = gh - 1;
    for (var px0 = 0; px0 < cw; px0++) {
      var sx = Math.floor(px0 * gw / cw);
      if (rows[sy].charAt(sx) === '1') { this.set(x + px0, y + py); if (bold) this.set(x + px0 + 1, y + py); }
    }
  }
};
Img.prototype.text = function (text, x, y, cap, bold) {
  var m = metrics(cap), cx = x;
  for (var i = 0; i < text.length; i++) {
    var g = FONT[text.charAt(i)] || FONT[' '];
    this.glyph(g, cx, y, m.cw, m.ch, bold);
    cx += m.step;
  }
  return cx - m.gap + (bold ? 1 : 0) - x;
};
Img.prototype.qr = function (mods, x, y, mod, quiet) {
  var n = mods.length, q = quiet || 0, size = (n + q * 2) * mod;
  for (var row = 0; row < n; row++) for (var col = 0; col < n; col++) {
    if (mods[row].charAt(col) !== '1') continue;
    this.rect(x + (col + q) * mod, y + (row + q) * mod, mod, mod);
  }
  return size;
};
Img.prototype.frame = function (x, y, w, h, t) {
  this.rect(x, y, w, t); this.rect(x, y + h - t, w, t);
  this.rect(x, y, t, h); this.rect(x + w - t, y, t, h);
};
Img.prototype.blackRow = function (y) {
  if (y < 0 || y >= this.h) return false;
  var i = y * this.w * 4;
  for (var x = 0; x < this.w; x++) if (this.d[i + x * 4] !== 255) return true;
  return false;
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

function render(opts) {
  opts = opts || {};
  var kind = opts.kind || 'jo_card';
  var head = headOf(opts);
  var box = canvasFor(kind, head);
  var img = new Img(box.width, box.height);
  var lines = [];
  var jo = joCode(opts.jo) || clean(opts.jo);
  var qrText = jo;
  var specPx = 0;
  var qrBox = null;
  var x0 = box.offsetX, y0 = 0;

  if (kind === 'cal_jo' || kind === 'cal_tag') {
    img.frame(x0 + 4, y0 + 4, box.labelW - 8, box.labelH - 8, 2);
    drawCentre(img, x0, y0, box.labelW, box.labelH);
    if (kind === 'cal_tag') img.rect(x0 + 4, box.labelH - 1, box.labelW - 8, 1); // where the blank tail starts
    img.rect(x0 + 6, y0 + 6, 8, 8); // leading corner, so the feed direction is obvious
  } else if (kind === 'jewelry_tag') {
    var specs = specLines(opts);
    var mods = jo ? makeQr(jo) : null;
    var mod = 3, quiet = 4;
    var qpix = mods ? qrSize(mods, mod, quiet) : 0;
    var pad = 6;
    var innerW = box.labelW - pad * 2;
    specPx = SPEC_PX;
    if (specs.length) {
      while (specPx > 16 && specs.some(function (t) { return measure(t, specPx, true) > innerW; })) specPx -= 1;
      specs = specs.map(function (t) { return clipTo(t, specPx, innerW, true); });
    }
    var specBlock = specs.length ? specs.length * specPx + (specs.length - 1) * 3 : 0;
    var top = box.labelH - pad * 2 - specBlock - (specs.length ? 6 : 0);
    if (qpix > top - 4) { mod = 2; qpix = mods ? qrSize(mods, mod, quiet) : 0; }
    var beside = Math.max(0, innerW - qpix - 8);
    var joPx = jo ? fitCap(jo, beside, 28, 16, true) : 0;
    if (jo && measure(jo, joPx, true) > beside) {
      /* JO under the QR when it will not fit beside it. Specs stay at the bottom. */
      var under = top - qpix - 4;
      joPx = fitCap(jo, innerW, Math.min(28, Math.max(16, under)), 16, true);
      if (mods) { qrBox = { x: x0 + pad, y: pad, size: qpix }; img.qr(mods, qrBox.x, qrBox.y, mod, quiet); }
      var jx = x0 + pad;
      var jy = pad + qpix + 4;
      lines.push(jo); img.text(jo, jx, jy, joPx, true);
    } else if (jo) {
      if (mods) { qrBox = { x: x0 + pad, y: pad, size: qpix }; img.qr(mods, qrBox.x, qrBox.y, mod, quiet); }
      var tx = x0 + pad + qpix + 8;
      var ty = pad + Math.max(0, Math.round((qpix - joPx) / 2));
      lines.push(jo); img.text(jo, tx, ty, joPx, true);
    }
    var sy = box.labelH - pad - specBlock;
    specs.forEach(function (t, i) {
      lines.push(t);
      img.text(t, x0 + pad, sy + i * (specPx + 3), specPx, true);
    });
  } else {
    var mods2 = jo ? makeQr(jo) : null;
    var mod2 = 3, quiet2 = 4;
    var qpix2 = mods2 ? qrSize(mods2, mod2, quiet2) : 0;
    var pad2 = 6;
    if (qpix2 > box.labelH - pad2 * 2) { mod2 = 2; qpix2 = mods2 ? qrSize(mods2, mod2, quiet2) : 0; }
    var sub = smallLine(opts);
    var beside2 = box.labelW - pad2 * 2 - qpix2 - 8;
    var joPx2 = jo ? fitCap(jo, beside2, 32, 16, true) : 0;
    var subPx = 14;
    if (sub && measure(sub, subPx, false) > beside2) sub = clipTo(sub, subPx, beside2, false);
    if (sub && measure(sub, subPx, false) > beside2) sub = '';
    var block = joPx2 + (sub ? 4 + subPx : 0);
    var qrY = Math.round((box.labelH - qpix2) / 2);
    var textY = Math.round((box.labelH - block) / 2);
    if (mods2) { qrBox = { x: x0 + pad2, y: qrY, size: qpix2 }; img.qr(mods2, qrBox.x, qrBox.y, mod2, quiet2); }
    if (jo) { lines.push(jo); img.text(jo, x0 + pad2 + qpix2 + 8, textY, joPx2, true); }
    if (sub) { lines.push(sub); img.text(sub, x0 + pad2 + qpix2 + 8, textY + joPx2 + 4, subPx, false); }
  }

  return {
    width: box.width, height: box.height, data: img.d, lines: lines, qr: qrText,
    offsetX: box.offsetX, labelW: box.labelW, labelH: box.labelH, tail: box.tail,
    specPx: specPx, preset: box.preset, kind: kind, head: head, qrBox: qrBox
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
  PRESETS: PRESETS, HEADS: HEADS, SPEC_PX: SPEC_PX, canvasFor: canvasFor
};
if (typeof module !== 'undefined' && module.exports) module.exports = root.OYPLabel;
})(typeof window !== 'undefined' ? window : globalThis);
