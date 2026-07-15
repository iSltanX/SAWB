/**
 * SAWB logo — verbatim port of LogoMark from the authoritative design
 * (design-reference/src/app/App.tsx). Same geometry, same colors.
 */

const TEAL = '#1E9080';
const COPPER = '#B8763F';

/** The two-arrow logo mark as an SVG string. */
export function logoMarkSvg(size = 36): string {
  const cy1 = size * 0.37;
  const cy2 = size * 0.63;
  const x1 = size * 0.21;
  const x2 = size * 0.79;
  const hw = size * 0.115;
  const sw = Math.max(1.5, size * 0.062);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<line x1="${x2}" y1="${cy1}" x2="${x1}" y2="${cy1}" stroke="${TEAL}" stroke-width="${sw}" stroke-linecap="round"/>
<polyline points="${x1 + hw},${cy1 - hw * 0.72} ${x1},${cy1} ${x1 + hw},${cy1 + hw * 0.72}" stroke="${TEAL}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<line x1="${x1}" y1="${cy2}" x2="${x2}" y2="${cy2}" stroke="${COPPER}" stroke-width="${sw}" stroke-linecap="round"/>
<polyline points="${x2 - hw},${cy2 - hw * 0.72} ${x2},${cy2} ${x2 - hw},${cy2 + hw * 0.72}" stroke="${COPPER}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

/**
 * Full wordmark (mark + «صَوْب» + SAWB). Font sizes, weights, letter-spacing
 * and colors follow LogoWordmark in App.tsx exactly; colors resolve through
 * the theme tokens (text/muted swap between light and dark).
 */
export function logoWordmarkHtml(size = 32): string {
  return `<div class="sawb-wordmark" style="display:flex;align-items:center;gap:10px">
${logoMarkSvg(size)}
<div style="font-family:var(--sawb-font-brand);line-height:1.1;user-select:none">
<div style="font-size:${size * 0.56}px;font-weight:800;color:var(--sawb-text)">صَوْب</div>
<div style="font-size:${size * 0.27}px;font-weight:300;color:var(--sawb-muted);letter-spacing:0.16em;direction:ltr;margin-top:2px">SAWB</div>
</div>
</div>`;
}
