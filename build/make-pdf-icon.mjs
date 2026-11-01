// Builds the PDF document icon (file association): white page with folded corner and a small Layr page-stack mark,
// dark outline, transparent background. Drawn analytically with supersampling, same palette as build/icon-transparent.png.
// Writes build/pdf-icon.ico (16..256, PNG-compressed entries).
// Usage: node build/make-pdf-icon.mjs   (pure Node, no packages)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 24, 32, 48, 64, 128, 256], SS = 4;
const OUTLINE = [20, 21, 28], WHITE = [255, 255, 255], B1 = [43, 59, 255], B2 = [132, 141, 255], B3 = [204, 208, 255];

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
function encodePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Shapes in unit square; each returns a signed distance (<=0 inside). Outline of width T is drawn inside the shape edge.
const R2 = Math.SQRT2;
const page = (x, y) => Math.max(0.16 - x, x - 0.84, 0.04 - y, y - 0.96, (x - y - 0.54) / R2);
const flap = (x, y) => Math.max(0.58 - x, y - 0.30, (x - y - 0.54) / R2);
const rrect = (x0, y0, x1, y1, r) => (x, y) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, qx = Math.abs(x - cx) - (x1 - x0) / 2 + r, qy = Math.abs(y - cy) - (y1 - y0) / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
// painter's order: [shape, fill, outline thickness]
const T = 0.035, Tm = 0.022;
const LAYERS = [
  [page, WHITE, T], [flap, B3, Tm],
  [rrect(0.46, 0.50, 0.74, 0.78, 0.045), B3, Tm], [rrect(0.40, 0.56, 0.68, 0.84, 0.045), B2, Tm], [rrect(0.34, 0.62, 0.62, 0.90, 0.045), B1, Tm],
];
function sample(x, y) { // returns [r,g,b,a] straight, a in 0/1
  let c = null;
  for (const [f, fill, t] of LAYERS) { const d = f(x, y); if (d <= 0) c = d > -t ? OUTLINE : fill; }
  return c;
}
function render(n) {
  const out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const c = sample((x + (i + 0.5) / SS) / n, (y + (j + 0.5) / SS) / n); if (c) { r += c[0]; g += c[1]; b += c[2]; a++; } }
    const o = (y * n + x) * 4; if (a) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = Math.round(255 * a / (SS * SS)); }
  }
  return encodePng(n, n, out);
}
const imgs = SIZES.map(render);
const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach((b, i) => { const n = SIZES[i], e = 6 + 16 * i; head[e] = n === 256 ? 0 : n; head[e + 1] = n === 256 ? 0 : n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; });
fs.writeFileSync(path.join(here, 'pdf-icon.ico'), Buffer.concat([head, ...imgs]));
console.log('wrote pdf-icon.ico (' + SIZES.join(',') + ')');
