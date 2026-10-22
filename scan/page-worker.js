/* Trim a photo to the card, turn it upright, and crop the JO zone off the main thread.
   The main thread keeps the live camera. This worker is the Scan JO photo path. */
let heldPage = null;
function dropHeld() { if (heldPage) { try { heldPage.delete(); } catch (e) {} heldPage = null; } }
self.onmessage = async (e) => {
  const d = e.data || {};
  const reply = (o, transfer) => self.postMessage(Object.assign({ id: d.id }, o), transfer || []);
  try {
    if (d.op === 'ping') {
      await boot(d.cvUrls || [d.cvUrl], d.detUrl);
      reply({ ready: true });
      return;
    }
    if (d.op === 'page') {
      const out = await buildPage(d);
      const transfer = [];
      if (out.bitmap) transfer.push(out.bitmap);
      if (out.zoneBitmap) transfer.push(out.zoneBitmap);
      reply(out, transfer);
      return;
    }
    if (d.op === 'enhance') {
      const cv = await boot(d.cvUrls || [d.cvUrl], d.detUrl);
      if (!heldPage) { reply({ error: 'nothing to enhance' }); return; }
      let page = heldPage;
      heldPage = null;
      try {
        const e2 = self.CardDetector.enhance(cv, page);
        if (e2 && e2 !== page) { page.delete(); page = e2; }
      } catch (err) {}
      const bitmap = bitmapFromMat(cv, page);
      const width = bitmap.width, height = bitmap.height;
      page.delete();
      reply({ bitmap, width, height }, [bitmap]);
      return;
    }
    reply({ error: 'unknown op' });
  } catch (err) {
    reply({ error: String(err && err.message || err) });
  }
};

let cvReady = null;
function boot(urls, detUrl) {
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    const list = (urls || []).filter(Boolean);
    let loaded = false, err = null;
    for (let i = 0; i < list.length; i++) {
      try { importScripts(list[i]); loaded = true; break; }
      catch (e) { err = e; }
    }
    if (!loaded) { cvReady = null; reject(err || new Error('opencv')); return; }
    const finish = () => {
      try { importScripts(detUrl); }
      catch (e) { cvReady = null; reject(e); return; }
      if (!(self.cv && self.cv.Mat) || !self.CardDetector) { cvReady = null; reject(new Error('detector failed')); return; }
      resolve(self.cv);
    };
    const c = self.cv;
    if (c && c.Mat) { finish(); return; }
    if (c && typeof c.then === 'function') {
      c.then(m => {
        try { delete m.then; } catch (e) {}
        if (m && typeof m.then === 'function') m.then = undefined;
        self.cv = m || self.cv;
        finish();
      });
      return;
    }
    if (c) c.onRuntimeInitialized = () => finish();
    else { cvReady = null; reject(new Error('no cv')); }
  });
  return cvReady;
}

function matFromBitmap(cv, bmp) {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return cv.matFromImageData(ctx.getImageData(0, 0, bmp.width, bmp.height));
}
function bitmapFromMat(cv, mat) {
  const canvas = new OffscreenCanvas(mat.cols, mat.rows);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(mat.cols, mat.rows);
  const src = mat.data, dst = img.data, ch = mat.channels ? mat.channels() : 4;
  if (ch === 4) dst.set(src.subarray(0, dst.length));
  else if (ch === 1) { for (let i = 0, p = 0; i < src.length && p < dst.length; i++, p += 4) { dst[p] = dst[p + 1] = dst[p + 2] = src[i]; dst[p + 3] = 255; } }
  else { for (let i = 0, p = 0; i + 2 < src.length && p < dst.length; i += ch, p += 4) { dst[p] = src[i]; dst[p + 1] = src[i + 1]; dst[p + 2] = src[i + 2]; dst[p + 3] = 255; } }
  ctx.putImageData(img, 0, 0);
  return canvas.transferToImageBitmap();
}
function legacyQuarters(w, h, key) {
  const k = (key === 'cw' || key === 'ccw') && w > h ? 'none' : (key || 'cw');
  return k === 'ccw' ? 3 : k === '180' ? 2 : k === 'none' ? 0 : 1;
}
function round4(n) { return Math.round(n * 10000) / 10000; }
function turnZone(zone, quarters) {
  const q = ((Number(quarters) || 0) % 4 + 4) % 4;
  const x = Number(zone.x) || 0, y = Number(zone.y) || 0, w = Number(zone.w) || 0, h = Number(zone.h) || 0;
  const n = q === 1 ? { x: 1 - (y + h), y: x, w: h, h: w }
    : q === 2 ? { x: 1 - (x + w), y: 1 - (y + h), w: w, h: h }
    : q === 3 ? { x: y, y: 1 - (x + w), w: h, h: w }
    : { x: x, y: y, w: w, h: h };
  return { x: round4(n.x), y: round4(n.y), w: round4(n.w), h: round4(n.h) };
}
function cropMat(cv, mat, zone) {
  const W = mat.cols, H = mat.rows;
  let x = Math.round(zone.x * W), y = Math.round(zone.y * H), w = Math.round(zone.w * W), h = Math.round(zone.h * H);
  if (x < 0) x = 0; if (y < 0) y = 0;
  if (x + w > W) w = W - x; if (y + h > H) h = H - y;
  if (w < 8 || h < 8) return null;
  // Clone the pixels. A ROI header shares the page buffer, and deleting it can free that buffer.
  const roi = mat.roi(new cv.Rect(x, y, w, h));
  const out = roi.clone();
  roi.delete();
  return out;
}
function scaleTo(cv, mat, w, h) {
  if (mat.cols === w && mat.rows === h) return mat;
  const out = new cv.Mat();
  cv.resize(mat, out, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
  return out;
}
function fitStandard(cv, mat, maxPx) {
  const pair = self.CardDetector.standardPage(maxPx || 1600);
  const land = mat.cols >= mat.rows;
  const W = land ? pair[0] : pair[1], H = land ? pair[1] : pair[0];
  const out = scaleTo(cv, mat, W, H);
  return out;
}

async function buildPage(d) {
  const cv = await boot(d.cvUrls || [d.cvUrl], d.detUrl);
  const CD = self.CardDetector;
  const bmp = d.bitmap;
  if (!bmp || !bmp.width) throw new Error('empty photo');
  const full = matFromBitmap(cv, bmp);
  if (bmp.close) bmp.close();
  const ms = {};
  const t = () => performance.now();
  let quad = null;
  if (d.crop !== false) {
    const a = t();
    const DW = 480, s = DW / Math.max(full.cols, full.rows);
    const sm = new cv.Mat();
    cv.resize(full, sm, new cv.Size(Math.max(1, Math.round(full.cols * s)), Math.max(1, Math.round(full.rows * s))), 0, 0, cv.INTER_AREA);
    try {
      const r = CD.detectQuad(cv, sm, { size: DW });
      quad = r ? CD.order(r.quad) : null;
    } finally { sm.delete(); }
    if (quad) {
      try { quad = CD.order(CD.refineQuad(cv, full, quad)); }
      catch (e) { quad = CD.order(quad); }
    }
    ms.trim = Math.round(t() - a);
  }
  let page = full;
  const maxPx = d.maxPx || 1600;
  if (quad) {
    let a = t();
    const warped = CD.warpQuad(cv, full, quad, maxPx);
    if (warped !== full) full.delete();
    page = warped;
    ms.warp = Math.round(t() - a);
    a = t();
    try {
      const desk = CD.deskew(cv, page);
      if (desk && desk.mat && desk.mat !== page) { page.delete(); page = desk.mat; }
    } catch (e) {}
    ms.deskew = Math.round(t() - a);
    a = t();
    const legacy = legacyQuarters(page.cols, page.rows, d.rotateKey);
    const up = CD.uprightTurns(cv, page, legacy);
    const turned = CD.rotateCW(cv, page, up);
    if (turned !== page) page.delete();
    page = turned;
    const extra = (up - legacy + 4) % 4;
    const fitted = fitStandard(cv, page, maxPx);
    if (fitted !== page) page.delete();
    page = fitted;
    ms.orient = Math.round(t() - a);
    // The tile is this bitmap. Copy it before the zone crop, which reads the same mat.
    const bitmap = bitmapFromMat(cv, page);
    const width = bitmap.width, height = bitmap.height;
    let zoneBitmap = null;
    a = t();
    if (d.zone && d.zone.w && d.zone.h) {
      const roi = cropMat(cv, page, turnZone(d.zone, extra));
      if (roi) { zoneBitmap = bitmapFromMat(cv, roi); roi.delete(); }
    }
    ms.crop = Math.round(t() - a);
    dropHeld();
    if (d.enhance) { heldPage = page; return { bitmap, width, height, extra, quad, zoneBitmap, ms, hold: true }; }
    page.delete();
    return { bitmap, width, height, extra, quad, zoneBitmap, ms, hold: false };
  }
  const legacy = legacyQuarters(page.cols, page.rows, d.rotateKey);
  const long = Math.max(page.cols, page.rows);
  const sc = Math.min(1, maxPx / long);
  const scaled = scaleTo(cv, page, Math.max(1, Math.round(page.cols * sc)), Math.max(1, Math.round(page.rows * sc)));
  if (scaled !== page) page.delete();
  page = scaled;
  const turned = CD.rotateCW(cv, page, legacy);
  if (turned !== page) page.delete();
  page = turned;
  const bitmap = bitmapFromMat(cv, page);
  const width = bitmap.width, height = bitmap.height;
  dropHeld();
  if (d.enhance) { heldPage = page; return { bitmap, width, height, extra: 0, quad: null, zoneBitmap: null, ms, hold: true }; }
  page.delete();
  return { bitmap, width, height, extra: 0, quad: null, zoneBitmap: null, ms, hold: false };
}
