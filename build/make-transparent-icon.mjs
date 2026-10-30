// Builds the transparent Layr icon (window / taskbar variant) from build/icon.png: the black rounded square is removed,
// the document glyph gets a thin dark outline so it stays visible on light and dark bars.
// Writes build/icon-transparent.png (512), app/icon-transparent.png (copy for the window) and build/icon-transparent.ico (16..256).
// Usage: node build/make-transparent-icon.mjs   (pure Node, no packages)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BG = [20, 21, 28]; // black rounded-square colour in build/icon.png
const OUTLINE = [16, 20, 70], OUT_R = 7, MARGIN = 0.02; // outline colour, radius in 512px units, free margin around the glyph
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
function encodePng(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function decodePng(buf) { // 8-bit RGBA, non-interlaced (what build/icon.png is)
  let o = 8, w = 0, h = 0; const idat = [];
  while (o < buf.length) { const n = buf.readUInt32BE(o), t = buf.toString('latin1', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + n); if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[9] !== 6 || d[12] !== 0) throw new Error('need 8-bit RGBA non-interlaced PNG'); } else if (t === 'IDAT') idat.push(d); o += 12 + n; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), S = w * 4, px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (S + 1)], row = raw.subarray(y * (S + 1) + 1, (y + 1) * (S + 1));
    for (let i = 0; i < S; i++) {
      const a = i >= 4 ? px[y * S + i - 4] : 0, b = y ? px[(y - 1) * S + i] : 0, c = i >= 4 && y ? px[(y - 1) * S + i - 4] : 0;
      let p = 0; if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1; else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * S + i] = (row[i] + p) & 255;
    }
  }
  return { w, h, px };
}

// 1) remove the background: every glyph colour has blue = 255, so blue between the background (28) and 255 is the glyph coverage
const src = decodePng(fs.readFileSync(path.join(here, 'icon.png')));
const W = src.w, H = src.h, G = new Float32Array(W * H * 4); // straight colour in 0..255, alpha in 0..1
for (let i = 0; i < W * H; i++) {
  const r = src.px[i * 4], g = src.px[i * 4 + 1], b = src.px[i * 4 + 2], A = src.px[i * 4 + 3];
  const a = A < 255 ? 0 : Math.max(0, Math.min(1, (b - BG[2]) / (255 - BG[2])));
  if (a < 0.02) continue;
  G[i * 4] = Math.max(0, Math.min(255, (r - (1 - a) * BG[0]) / a)); G[i * 4 + 1] = Math.max(0, Math.min(255, (g - (1 - a) * BG[1]) / a)); G[i * 4 + 2] = Math.min(255, (b - (1 - a) * BG[2]) / a); G[i * 4 + 3] = a;
}
// 2) outline: dilate the coverage by OUT_R and put the glyph over it
const O = new Float32Array(W * H), R2 = OUT_R * OUT_R;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (G[(y * W + x) * 4 + 3] <= 0) continue;
  const a = G[(y * W + x) * 4 + 3];
  for (let dy = -OUT_R; dy <= OUT_R; dy++) for (let dx = -OUT_R; dx <= OUT_R; dx++) {
    if (dx * dx + dy * dy > R2) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    if (a > O[Y * W + X]) O[Y * W + X] = a;
  }
}
const C = new Float32Array(W * H * 4); // premultiplied result
for (let i = 0; i < W * H; i++) {
  const ga = G[i * 4 + 3], oa = O[i], A = ga + oa * (1 - ga);
  for (let k = 0; k < 3; k++) C[i * 4 + k] = G[i * 4 + k] * ga + OUTLINE[k] * oa * (1 - ga);
  C[i * 4 + 3] = A * 255;
}
// 3) crop to the glyph box plus a small margin, square
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (C[(y * W + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const side = Math.max(x1 - x0 + 1, y1 - y0 + 1) * (1 + 2 * MARGIN), cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, sx = cx - side / 2, sy = cy - side / 2;
const px = (x, y, k) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : C[(y * W + x) * 4 + k];
// 4) resample (premultiplied): box filter when shrinking, bilinear when enlarging
function render(n) {
  const s = side / n, out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = [0, 0, 0, 0];
    if (s >= 1) {
      const ax = sx + x * s, bx = ax + s, ay = sy + y * s, by = ay + s;
      for (let Y = Math.floor(ay); Y < Math.ceil(by); Y++) for (let X = Math.floor(ax); X < Math.ceil(bx); X++) {
        const w = (Math.min(bx, X + 1) - Math.max(ax, X)) * (Math.min(by, Y + 1) - Math.max(ay, Y));
        for (let k = 0; k < 4; k++) v[k] += px(X, Y, k) * w;
      }
      for (let k = 0; k < 4; k++) v[k] /= s * s;
    } else {
      const fx = sx + (x + 0.5) * s - 0.5, fy = sy + (y + 0.5) * s - 0.5, X = Math.floor(fx), Y = Math.floor(fy), tx = fx - X, ty = fy - Y;
      for (let k = 0; k < 4; k++) v[k] = px(X, Y, k) * (1 - tx) * (1 - ty) + px(X + 1, Y, k) * tx * (1 - ty) + px(X, Y + 1, k) * (1 - tx) * ty + px(X + 1, Y + 1, k) * tx * ty;
    }
    const a = v[3]; out[(y * n + x) * 4 + 3] = Math.round(a);
    for (let k = 0; k < 3; k++) out[(y * n + x) * 4 + k] = a > 0 ? Math.min(255, Math.round(v[k] * 255 / a)) : 0;
  }
  return encodePng(n, n, out);
}

const master = render(512);
fs.writeFileSync(path.join(here, 'icon-transparent.png'), master);
fs.writeFileSync(path.join(here, '..', 'app', 'icon-transparent.png'), master);
// ICO with PNG-compressed entries (Windows Vista and newer)
const imgs = SIZES.map(n => render(n));
const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let off = head.length;
imgs.forEach((b, i) => { const n = SIZES[i], e = 6 + 16 * i; head[e] = n === 256 ? 0 : n; head[e + 1] = n === 256 ? 0 : n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length; });
fs.writeFileSync(path.join(here, 'icon-transparent.ico'), Buffer.concat([head, ...imgs]));
console.log('wrote icon-transparent.png, app/icon-transparent.png, icon-transparent.ico (' + SIZES.join(',') + ')');
