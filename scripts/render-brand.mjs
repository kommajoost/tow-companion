// Rasterise the brand SVGs in /brand into the PNG assets the app + PWA need.
// Run after editing any brand/*.svg:  node scripts/render-brand.mjs
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const brand = join(root, 'brand');
const pub = join(root, 'public');

const mark = await readFile(join(brand, 'logo-mark.svg'));
const maskable = await readFile(join(brand, 'logo-maskable.svg'));

// density high enough that the largest target (512) is supersampled then downscaled = crisp edges.
const png = (svg, size) =>
  sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer();

const jobs = [
  ['logo.png', mark, 512],
  ['pwa-512.png', mark, 512],
  ['pwa-192.png', mark, 192],
  ['apple-touch-icon.png', mark, 180],
  ['favicon.png', mark, 64],
  ['maskable-512.png', maskable, 512],
];

for (const [name, svg, size] of jobs) {
  const buf = await png(svg, size);
  await sharp(buf).toFile(join(pub, name));
  console.log(`✓ public/${name} (${size}×${size})`);
}
console.log('Brand assets rendered.');
