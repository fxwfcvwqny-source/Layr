// Erzeugt die Microsoft-Store-Logos (build/appx/*.png) aus build/icon.png.
// Aufruf: npx electron build/make-appx-assets.mjs   (nur Electron-eigene nativeImage-Funktionen, keine Pakete)
import { app, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'appx');
const PAD = 0.8; // Querformate: Logo nimmt 80 % der Höhe ein, Rest ist transparenter Rand

// name, Breite, Höhe, Skalierungen (scale-N: Breite/Höhe), Ziel-Größen (targetsize-N, mit und ohne _altform-unplated)
const SETS = [
  { name: 'StoreLogo', w: 50, h: 50, scales: { 100: [50, 50], 125: [63, 63], 150: [75, 75], 200: [100, 100], 400: [200, 200] } },
  { name: 'Square44x44Logo', w: 44, h: 44, scales: { 100: [44, 44], 125: [55, 55], 150: [66, 66], 200: [88, 88], 400: [176, 176] }, targets: [16, 24, 32, 48, 256] },
  { name: 'Square150x150Logo', w: 150, h: 150, scales: { 100: [150, 150], 125: [188, 188], 150: [225, 225], 200: [300, 300], 400: [600, 600] } },
  { name: 'Wide310x150Logo', w: 310, h: 150, wide: true, scales: { 100: [310, 150], 125: [388, 188], 150: [465, 225], 200: [620, 300], 400: [1240, 600] } },
  { name: 'SmallTile', w: 71, h: 71 },
  { name: 'LargeTile', w: 310, h: 310 },
  { name: 'SplashScreen', w: 620, h: 300, wide: true, scales: { 200: [1240, 600] } },
];

function files() {
  const list = [];
  for (const s of SETS) {
    list.push({ file: `${s.name}.png`, w: s.w, h: s.h, wide: !!s.wide });
    for (const [k, [w, h]] of Object.entries(s.scales || {})) list.push({ file: `${s.name}.scale-${k}.png`, w, h, wide: !!s.wide });
    for (const t of s.targets || []) {
      list.push({ file: `${s.name}.targetsize-${t}.png`, w: t, h: t, wide: false });
      list.push({ file: `${s.name}.targetsize-${t}_altform-unplated.png`, w: t, h: t, wide: false });
    }
  }
  return list;
}

// Logo quadratisch skalieren, mittig auf eine transparente Fläche setzen
function render(icon, w, h, wide) {
  const side = Math.min(w, h) * (wide ? PAD : 1) | 0;
  const bmp = icon.resize({ width: side, height: side, quality: 'best' }).toBitmap();
  const canvas = Buffer.alloc(w * h * 4);
  const x0 = (w - side) >> 1, y0 = (h - side) >> 1;
  for (let y = 0; y < side; y++) bmp.copy(canvas, ((y0 + y) * w + x0) * 4, y * side * 4, (y + 1) * side * 4);
  return nativeImage.createFromBitmap(canvas, { width: w, height: h }).toPNG();
}

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(path.join(here, 'icon.png'));
  if (icon.isEmpty()) throw new Error('build/icon.png nicht lesbar');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of files()) fs.writeFileSync(path.join(outDir, f.file), render(icon, f.w, f.h, f.wide));
  console.log(`${files().length} Dateien in ${outDir}`);
}).catch(e => { console.error(e); process.exitCode = 1; }).finally(() => app.quit());
