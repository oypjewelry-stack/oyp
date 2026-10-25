/* Handwriting is dropped from a page-2 stand-in and the drawing is centred.
   Run: node sim/sketchclean-sim.js */
'use strict';
const { sketchClean } = require('../sketchclean.js');
let failed = 0;
function eq(cond, msg) {
  if (!cond) { failed++; console.error('FAIL', msg); }
  else console.log('ok', msg);
}

const ROI = { x: 0.578, y: 0.150, w: 0.377, h: 0.815 };
const W = 1200, H = 800;

function page(withBlob) {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 248; rgba[i + 1] = 246; rgba[i + 2] = 240; rgba[i + 3] = 255;
  }
  const rx0 = Math.round(W * ROI.x), ry0 = Math.round(H * ROI.y);
  for (let y = ry0 + 80; y < ry0 + 82; y++) {
    for (let x = rx0 + 30; x < rx0 + 120; x++) {
      const o = (y * W + x) * 4;
      rgba[o] = 20; rgba[o + 1] = 20; rgba[o + 2] = 20; rgba[o + 3] = 255;
    }
  }
  if (withBlob) {
    const cx = rx0 + 220, cy = ry0 + 380, rad = 80;
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > rad * rad) continue;
        const o = (y * W + x) * 4;
        rgba[o] = 40; rgba[o + 1] = 160; rgba[o + 2] = 210; rgba[o + 3] = 255;
      }
    }
  }
  return rgba;
}

function ink(out) {
  const data = out.data, w = out.w, h = out.h;
  let minx = w, miny = h, maxx = -1, maxy = -1, dark = 0, color = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum < 200 || sat > 25) {
        if (x < minx) minx = x;
        if (y < miny) miny = y;
        if (x > maxx) maxx = x;
        if (y > maxy) maxy = y;
      }
      if (lum < 90 && sat < 25) dark++;
      if (sat > 40) color++;
    }
  }
  return { minx, miny, maxx, maxy, dark, color, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w, h };
}

let asked = 0;
const drawing = sketchClean(page(true), W, H, () => { asked++; return { x: 1, y: 1, w: 2, h: 2 }; });
eq(drawing.confident === true && drawing.reason === 'drawing kept' && drawing.out && drawing.out.w > 0, 'a coloured drawing in the design panel is kept');
const box = drawing.out && ink(drawing.out);
eq(!!box && box.color > 1000 && box.dark === 0, 'the text line is gone and the drawing colour stays (' + (box ? box.dark + ' dark, ' + box.color + ' colour' : 'none') + ')');
eq(!!box && Math.abs(box.cx - box.w / 2) / box.w < 0.03 && Math.abs(box.cy - box.h / 2) / box.h < 0.03, 'the drawing sits within 3% of the canvas centre');
eq(asked === 0, 'a confident drawing does not use the old ink box');

const textOnly = sketchClean(page(false), W, H, () => ({ x: 9, y: 9, w: 9, h: 9 }));
eq(textOnly.confident === false && textOnly.fallback === true && !textOnly.out, 'a text-only page is not confident and is not drawn');

if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('sketchclean-sim passed');
