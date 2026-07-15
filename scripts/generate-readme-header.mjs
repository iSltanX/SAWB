/**
 * README header generator → docs/assets/readme/header.svg
 *
 * Composes the approved identity only: the LogoMark geometry (src/ui/logo.ts,
 * verbatim), the صَوْب/SAWB wordmark typography (Almarai 800 / Almarai 300 at
 * 0.16em tracking) and the approved palette. The bundled Almarai subsets are
 * embedded as data URIs so the artwork renders identically inside GitHub's
 * sandboxed <img> context, where external fonts are unavailable.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = path.join(root, 'src/ui/assets/fonts');
const out = path.join(root, 'docs/assets/readme/header.svg');

// Brand constants — identical to src/ui/logo.ts and src/ui/tokens.css.
const TEAL = '#1E9080';
const COPPER = '#B8763F';
const DEEP = '#0F1829';
const TEXT_DARK = '#EDE8DC';
const MUTED_DARK = '#8A9AAE';
const BORDER_DARK = 'rgba(237, 232, 220, 0.08)';

/** The two-arrow logo mark — same math as logoMarkSvg(size) in src/ui/logo.ts. */
function logoMark(size) {
  const cy1 = size * 0.37;
  const cy2 = size * 0.63;
  const x1 = size * 0.21;
  const x2 = size * 0.79;
  const hw = size * 0.115;
  const sw = Math.max(1.5, size * 0.062);
  return `<line x1="${x2}" y1="${cy1}" x2="${x1}" y2="${cy1}" stroke="${TEAL}" stroke-width="${sw}" stroke-linecap="round"/>
<polyline points="${x1 + hw},${cy1 - hw * 0.72} ${x1},${cy1} ${x1 + hw},${cy1 + hw * 0.72}" stroke="${TEAL}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<line x1="${x1}" y1="${cy2}" x2="${x2}" y2="${cy2}" stroke="${COPPER}" stroke-width="${sw}" stroke-linecap="round"/>
<polyline points="${x2 - hw},${cy2 - hw * 0.72} ${x2},${cy2} ${x2 - hw},${cy2 + hw * 0.72}" stroke="${COPPER}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
}

async function fontFace(family, weight, file, unicodeRange) {
  const data = await readFile(path.join(fontsDir, file));
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  src: url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');
  unicode-range: ${unicodeRange};
}`;
}

const ARABIC_RANGE = 'U+0600-06FF, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFC';
const LATIN_RANGE = 'U+0000-00FF, U+2000-206F';

const faces = [
  await fontFace('Almarai', 800, 'almarai-9-tssoApxBaigK_hnnS_qjtnqWo4z1oXli2g.woff2', ARABIC_RANGE),
  await fontFace('Almarai', 300, 'almarai-3-tssoApxBaigK_hnnS_antnqWo4z1oXli2g.woff2', ARABIC_RANGE),
  await fontFace('Almarai', 300, 'almarai-4-tssoApxBaigK_hnnS_antn-Wo4z1oXk.woff2', LATIN_RANGE),
].join('\n');

const W = 1200;
const H = 360;
const MARK = 76;

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="صَوْب — SAWB">
<style>
${faces}
text { font-family: 'Almarai', sans-serif; }
</style>
<rect width="${W}" height="${H}" rx="16" fill="${DEEP}"/>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="${BORDER_DARK}"/>
<g transform="translate(${(W - MARK) / 2}, 58)">
${logoMark(MARK)}
</g>
<text x="${W / 2}" y="216" text-anchor="middle" font-size="64" font-weight="800" fill="${TEXT_DARK}">صَوْب</text>
<text x="${W / 2}" y="252" text-anchor="middle" font-size="19" font-weight="300" letter-spacing="0.16em" fill="${MUTED_DARK}">SAWB</text>
<text x="${W / 2}" y="308" text-anchor="middle" font-size="20" font-weight="300" fill="${MUTED_DARK}" direction="rtl">إضافة متصفح تضبط اتجاه الكتابة تلقائيًا بين RTL وLTR</text>
</svg>
`;

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(`Wrote ${path.relative(root, out)} (${(svg.length / 1024).toFixed(1)} KB)`);
