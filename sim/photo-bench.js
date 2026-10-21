/* Bytes and local decode time for a 24-tile list and one photo tap.
   Samples are noisy card JPEGs at the sizes the pipeline uses. Apps Script is private,
   so the 3–9s call floor is the comment in app.js, not a live stopwatch.
   Run: node sim/photo-bench.js
   Writes sim/out/photo-bench.json. Does not keep the JPEGs. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oyp-photo-'));
const py = `
import io, json, os
from PIL import Image, ImageDraw
def card(w, h, amp):
    base = Image.new('RGB', (w, h), (244, 242, 236))
    dr = ImageDraw.Draw(base)
    m = max(8, w // 20)
    dr.rectangle([m, m, w - m - 1, h - m - 1], fill=(255, 255, 255), outline=(17, 17, 17), width=max(2, w // 300))
    dr.rectangle([int(w * 0.08), int(h * 0.08), int(w * 0.42), int(h * 0.22)], outline=(17, 17, 17), width=max(2, w // 500))
    for i in range(14):
        y = m + int((h - 2 * m) * (0.28 + i * 0.045))
        dr.line([(m + 16, y), (w - m - 16, y)], fill=(176, 170, 156), width=max(1, w // 900))
    nz = Image.frombytes('RGB', (w, h), os.urandom(w * h * 3)).point(lambda p: 128 + int((p - 128) * amp / 128))
    return Image.blend(base, nz, 0.35)
specs = [
    ('phone_4032_q90', 4032, 3024, 90, 40),
    ('scanner_1600_q80', 1600, 1200, 80, 40),
    ('drive_s1600_q72', 1600, 1200, 72, 40),
    ('drive_s300_q72', 300, 225, 72, 48),
    ('drive_thumb_s220_q70', 220, 165, 70, 48),
]
out = {}
for name, w, h, q, amp in specs:
    buf = io.BytesIO()
    card(w, h, amp).save(buf, 'JPEG', quality=q, optimize=False)
    raw = buf.getvalue()
    open(os.path.join(${JSON.stringify(dir)}, name + '.jpg'), 'wb').write(raw)
    out[name] = {'w': w, 'h': h, 'q': q, 'bytes': len(raw)}
print(json.dumps(out))
`;
const gen = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
if (gen.status !== 0) { console.error(gen.stderr || gen.stdout); process.exit(1); }
const files = JSON.parse(gen.stdout.trim());
const prefix = 'data:image/jpeg;base64,';
function dataUrl(name) {
  const b64 = fs.readFileSync(path.join(dir, name + '.jpg')).toString('base64');
  return prefix + b64;
}
const src = {};
Object.keys(files).forEach(name => {
  const url = dataUrl(name);
  src[name] = url;
  files[name].base64 = url.length - prefix.length;
  files[name].data_url = url.length;
});
function parseMs(obj) {
  const text = JSON.stringify(obj);
  const t0 = process.hrtime.bigint();
  JSON.parse(text);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { json_bytes: Buffer.byteLength(text), parse_ms: Math.round(ms * 100) / 100 };
}
const N = 24;
const tile = src.drive_s300_q72;
const oldThumb = src.drive_thumb_s220_q70;
const full = src.phone_4032_q90;
const med = src.drive_s1600_q72;
const piece = {};
for (let i = 0; i < N; i++) piece['26-' + (200 + i)] = { id: 'f' + i, src: tile, found: true };
const oldPiece = {};
for (let i = 0; i < N; i++) oldPiece['26-' + (200 + i)] = oldThumb;
const fullPiece = {};
for (let i = 0; i < 12; i++) fullPiece['26-' + (200 + i)] = full;
const afterList = parseMs({ ok: true, size: 300, piece, scan: {} });
const beforeThumbList = parseMs({ ok: true, thumbs: oldPiece });
const beforeFullBatch = parseMs({ ok: true, thumbs: fullPiece });
const beforeTap = parseMs({ ok: true, src: full });
const afterTap = parseMs({ ok: true, src: med });
const html = `<!doctype html><meta charset="utf-8"><body><pre id="o"></pre><script>
const src = ${JSON.stringify({ full, med, tile, oldThumb })};
function dec(url) {
  return new Promise(res => {
    const im = new Image();
    const t0 = performance.now();
    im.onload = () => res(Math.round((performance.now() - t0) * 100) / 100);
    im.onerror = () => res(-1);
    im.src = url;
  });
}
(async () => {
  const out = {};
  for (const k of Object.keys(src)) out[k] = await dec(src[k]);
  document.getElementById('o').textContent = JSON.stringify(out);
})();
</script>`;
const page = path.join(dir, 'decode.html');
fs.writeFileSync(page, html);
const chrome = fs.existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : 'google-chrome';
const shot = spawnSync(chrome, [
  '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', 'file://' + page
], { encoding: 'utf8', timeout: 30000 });
const m = (shot.stdout || '').match(/<pre id="o">([^<]*)<\/pre>/);
const decode = m ? JSON.parse(m[1]) : { error: (shot.stderr || '').slice(0, 400), status: shot.status };
const report = {
  note: 'Private Apps Script was not called. Each call is 3–9s in app.js. Samples are noisy card JPEGs, not live Drive files.',
  samples: files,
  calls: {
    before_inventory_24: { requests: 2, batch: 12, cap: 60, note: 'invThumbs. Server body is not in either repo. Customers.gs thumb_() is getThumbnail() or the full file.' },
    before_production_24: { requests: 24, note: 'one prodPhoto per card, size omitted, so the same getThumbnail-or-full-file path as jobPhoto.' },
    before_review_visible: { requests: 'one jobPhoto per visible row', size: 'thumb (getThumbnail, or the full file if Drive has no thumbnail)' },
    before_tap: { requests: 1, size: 'full', note: 'jobPhoto and prodPhoto size full call getBlob() of the original. Inventory reused the list image and did not fetch again.' },
    after_list_24: { requests: 1, size: 300, note: 'one photoThumbs call for the tiles on screen. Tiles off screen wait.' },
    after_tap: { requests: 1, size: 1600, note: '300px is already on screen. Original is a separate photoFile and is not cached.' }
  },
  payload: {
    before_list_if_drive_thumbnail: { json_bytes: beforeThumbList.json_bytes, parse_ms: beforeThumbList.parse_ms, images: N, each: 'drive_thumb_s220_q70' },
    before_inventory_one_batch_of_12_full_files: { json_bytes: beforeFullBatch.json_bytes, parse_ms: beforeFullBatch.parse_ms, images: 12, each: 'phone_4032_q90' },
    before_tap_one_original: { json_bytes: beforeTap.json_bytes, parse_ms: beforeTap.parse_ms, each: 'phone_4032_q90' },
    after_list_24_s300: { json_bytes: afterList.json_bytes, parse_ms: afterList.parse_ms, images: N, each: 'drive_s300_q72' },
    after_tap_one_s1600: { json_bytes: afterTap.json_bytes, parse_ms: afterTap.parse_ms, each: 'drive_s1600_q72' }
  },
  decode_ms: decode,
  cache: {
    script_cache_value_max_chars: 95000,
    s300_chunks: 1,
    s1600_chunks: Math.ceil(files.drive_s1600_q72.data_url / 95000),
    original_cached: false
  }
};
const outDir = path.join(root, 'sim', 'out');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'photo-bench.json'), JSON.stringify(report, null, 2) + '\n');
fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({
  phone_bytes: files.phone_4032_q90.bytes,
  s300_bytes: files.drive_s300_q72.bytes,
  s1600_bytes: files.drive_s1600_q72.bytes,
  thumb_bytes: files.drive_thumb_s220_q70.bytes,
  scanner_bytes: files.scanner_1600_q80.bytes,
  before_tap_json: beforeTap.json_bytes,
  after_tap_json: afterTap.json_bytes,
  before_list_json: beforeThumbList.json_bytes,
  after_list_json: afterList.json_bytes,
  before_full_batch_json: beforeFullBatch.json_bytes,
  decode
}, null, 2));
