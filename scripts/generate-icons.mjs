#!/usr/bin/env node
// Rasterise public/icon.svg into the PNG sizes the PWA manifest references.
//
// Usage:
//   npm run gen:icons
//
// Produces:
//   public/icon-192.png   (PWA, Android)
//   public/icon-512.png   (PWA, Android maskable)
//   public/icon-180.png   (Apple touch icon)
//   public/og-image.png   (1200x630 social card; if base SVG present)
//   public/screenshot-1.png (480x640 store preview)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('sharp is required. Install it with:\n  npm i -D sharp');
  process.exit(2);
}

const svgPath = join(publicDir, 'icon.svg');
if (!existsSync(svgPath)) {
  console.error(`Missing ${svgPath}. Run from repo root.`);
  process.exit(1);
}
const svg = readFileSync(svgPath);

const TARGETS = [
  { name: 'icon-192.png',     size: 192, square: true },
  { name: 'icon-512.png',     size: 512, square: true },
  { name: 'icon-180.png',     size: 180, square: true },          // Apple touch icon
  { name: 'screenshot-1.png', size: 0,   width: 480, height: 640 }, // store screenshot, letterboxed
];

const PADDING_BG = '#0a0014';

for (const t of TARGETS) {
  const w = t.square ? t.size : t.width;
  const h = t.square ? t.size : t.height;
  const buf = await sharp(svg, { density: 384 })
    .resize({
      width: w,
      height: h,
      fit: 'contain',
      background: PADDING_BG,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(publicDir, t.name), buf);
  console.log(`✓ public/${t.name} ${w}×${h}`);
}

// Social card (OG image) — composite hero icon on a larger background.
{
  const og = await sharp({
    create: {
      width: 1200, height: 630, channels: 4,
      background: PADDING_BG,
    },
  })
  .composite([{
    input: await sharp(svg, { density: 384 }).resize({ width: 560, height: 560 }).png().toBuffer(),
    gravity: 'center',
  }])
  .png({ compressionLevel: 9 })
  .toBuffer();
  writeFileSync(join(publicDir, 'og-image.png'), og);
  console.log('✓ public/og-image.png 1200×630');
}
