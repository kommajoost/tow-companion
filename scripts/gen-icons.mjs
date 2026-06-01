// Generates the app logo + PWA icons + favicon from the master logo source.
// Update SRC if the source file name changes. Chrome/Android need PNG 192 + 512 for the
// install prompt; iOS needs apple-touch-icon. The logo has its own dark background, so it
// doubles as a maskable icon.
// Run: node scripts/gen-icons.mjs

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'ChatGPT Image 31 mei 2026, 19_10_33.png');
const PUB = join(ROOT, 'public');

const targets = [
  { file: 'logo.png', size: 512 }, // in-app header/cover logo
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon.png', size: 48 },
];

for (const { file, size } of targets) {
  await sharp(SRC).resize(size, size, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(join(PUB, file));
  console.log(`wrote public/${file} (${size}×${size})`);
}
console.log('Done.');
