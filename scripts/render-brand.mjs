// Rasterise the brand artwork into the PNG assets the app + PWA need.
// Source: brand/logo-master.png — the gold "sun over an open book, pierced by a spire" emblem on a
// transparent ground. The mark carries a textured foil fill that can't be reduced to flat SVG, so we
// composite the raster onto the brand's black ground at each size. The in-app <LogoMark> shows these
// as a rounded square, so every icon is full-bleed black with the emblem centred.
// Run after replacing the master:  npm run render-brand
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'brand');
const pub = join(root, 'public');

const GROUND = { r: 0, g: 0, b: 0, alpha: 1 }; // pure black — matches the brand presentation

// Trim the transparent margin from the master once, so padding is measured from the mark itself.
const trimmed = await sharp(join(brand, 'logo-master.png')).trim({ threshold: 12 }).toBuffer();

// The emblem, scaled to `content` fraction of the canvas (preserving aspect), centred on the ground.
async function icon(size, content) {
  const box = Math.round(size * content);
  const fitted = await sharp(trimmed)
    .resize(box, box, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const { width, height } = await sharp(fitted).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: GROUND } })
    .composite([{ input: fitted, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png()
    .toBuffer();
}

// Standard icons frame the mark at ~66%; the favicon runs a touch larger so it stays legible at tab
// size; the maskable variant keeps the mark well inside the safe-zone platforms crop (circle/squircle).
const jobs = [
  ['logo.png', 512, 0.66],
  ['pwa-512.png', 512, 0.66],
  ['pwa-192.png', 192, 0.66],
  ['apple-touch-icon.png', 180, 0.66],
  ['favicon.png', 96, 0.74],
  ['maskable-512.png', 512, 0.56],
];

for (const [name, size, content] of jobs) {
  const buf = await icon(size, content);
  await sharp(buf).toFile(join(pub, name));
  console.log(`✓ public/${name} (${size}×${size}, mark ${Math.round(content * 100)}%)`);
}
console.log('Brand assets rendered from brand/logo-master.png.');
