/**
 * Extension icon generator.
 *
 * Replicates the ExtIcon component from the authoritative design
 * (design-reference/src/app/App.tsx) EXACTLY — same geometry, same colors,
 * same stroke math (including the 1.5px stroke floor) — and rasterizes it to
 * the Chrome icon sizes. Do not restyle.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets/icons');

const NAVY = '#1A2540';
const TEAL = '#1E9080';
const COPPER = '#B8763F';

/** Verbatim port of ExtIcon({ size, variant: "color" }) from App.tsx. */
function extIconSvg(size) {
  const r = size * 0.22;
  const cy1 = size * 0.36;
  const cy2 = size * 0.64;
  const x1 = size * 0.2;
  const x2 = size * 0.8;
  const hw = size * 0.1;
  const sw = Math.max(1.5, size * 0.056);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" fill="${NAVY}"/>
  <line x1="${x2}" y1="${cy1}" x2="${x1}" y2="${cy1}" stroke="${TEAL}" stroke-width="${sw}" stroke-linecap="round"/>
  <polyline points="${x1 + hw * 1.1},${cy1 - hw * 0.8} ${x1},${cy1} ${x1 + hw * 1.1},${cy1 + hw * 0.8}" stroke="${TEAL}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <line x1="${x1}" y1="${cy2}" x2="${x2}" y2="${cy2}" stroke="${COPPER}" stroke-width="${sw}" stroke-linecap="round"/>
  <polyline points="${x2 - hw * 1.1},${cy2 - hw * 0.8} ${x2},${cy2} ${x2 - hw * 1.1},${cy2 + hw * 0.8}" stroke="${COPPER}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

await mkdir(outDir, { recursive: true });

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const svg = extIconSvg(size);
  await writeFile(path.join(outDir, `icon-${size}.svg`), svg);
  // Rasterize at 4× then downsample for clean antialiasing at small sizes.
  const png = await sharp(Buffer.from(extIconSvg(size * 4)))
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(path.join(outDir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png`);
}

console.log('Done.');
