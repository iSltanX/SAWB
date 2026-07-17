/**
 * «صَوْب للمطورين» — identity-layer guarantees.
 *
 * The developer identity is a presentation STATE of the same product:
 * canonical mark untouched, normal mode byte-identical, every dev rule scoped
 * under [data-dev-mode] (docs/sawb-dev-identity.md).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { logoMarkSvg, logoWordmarkHtml } from '../src/ui/logo';

describe('wordmark dev state', () => {
  it('default wordmark is exactly the pre-dev-identity wordmark (no dev traces)', () => {
    const html = logoWordmarkHtml(26);
    expect(html).not.toContain('للمطورين');
    expect(html).not.toContain('DEVS');
    expect(html).toContain('SAWB');
    expect(logoWordmarkHtml(26, {})).toBe(html); // empty options = same output
  });

  it('dev wordmark adds «للمطورين» in teal and the mono SAWB · DEVS caption', () => {
    const html = logoWordmarkHtml(26, { devMode: true });
    expect(html).toContain('للمطورين');
    expect(html).toContain('var(--sawb-teal)');
    expect(html).toContain('SAWB · DEVS');
    expect(html).toContain('var(--sawb-font-mono)');
    expect(html).toContain('صَوْب'); // the family wordmark itself is unchanged
  });

  it('the canonical mark is identical in both modes — the family constant', () => {
    // logoWordmarkHtml embeds logoMarkSvg verbatim; the mark takes no dev
    // parameter at all, so the arrows keep the official brand colors.
    const mark = logoMarkSvg(26);
    expect(logoWordmarkHtml(26)).toContain(mark);
    expect(logoWordmarkHtml(26, { devMode: true })).toContain(mark);
    expect(mark).toContain('#1E9080');
    expect(mark).toContain('#B8763F');
  });
});

describe('dev token layer isolation', () => {
  const css = readFileSync('src/ui/dev-mode.css', 'utf8');

  it('every :root rule in dev-mode.css is scoped to [data-dev-mode]', () => {
    // No bare `:root {` selector may exist — normal mode must be untouched.
    const bareRoot = css.match(/^\s*:root\s*(?:,|{)/m);
    expect(bareRoot).toBeNull();
    expect(css).toContain(':root[data-dev-mode]');
  });

  it('pins the FINAL owner-approved palette — direction 2 «تقني ومتوازن»', () => {
    // Approved by the product owner (docs/sawb-dev-identity.md): clear
    // technical separation from base SAWB without approaching neon.
    expect(css).toContain('#070C15'); // bg
    expect(css).toContain('#1E3C6A'); // steel border
    expect(css).toContain('#2ECFA8'); // dev teal
    expect(css).toContain('#D4892E'); // dev orange
    expect(css).toContain('#1E40B0'); // dev blue (auto/primary)
    expect(css).toContain('#A880E8'); // HOST badge — reserved for HOST only
    // Owner-approved contrast refinements over the reference values:
    expect(css).toContain('#6888B8'); // muted — AA for small text on dev surfaces
    expect(css).toContain('#4A6690'); // dim — legible micro-caps labels
    // No mixing of directions: direction 3's accents must not coexist here.
    expect(css).not.toContain('#00D9A6');
    expect(css).not.toContain('#F09030');
  });

  it('applies the owner-approved refinements: glow on focus only, border hierarchy', () => {
    // Glow: exactly one usage — the :focus-visible halo. Never on resting
    // surfaces (cards/pills/panels declare no glow).
    const glowUses = css.match(/var\(--sawb-dev-glow\)/g) ?? [];
    expect(glowUses.length).toBe(1);
    expect(css).toMatch(/:focus-visible\s*{[^}]*var\(--sawb-dev-glow\)/);
    // Border hierarchy: inspection panel heavy, secondary pill/rows light.
    expect(css).toMatch(/\.dev-diagnostics\s*{[^}]*border:\s*1\.5px/);
    expect(css).toMatch(/\.dev-pill\s*{[^}]*border:\s*1px/);
    expect(css).toMatch(/\.setting-row\s*{[^}]*border:\s*1px/);
  });

  it('is imported by both extension UI stylesheets, after the base layers', () => {
    for (const file of ['src/ui/popup/popup.css', 'src/ui/options/options.css']) {
      const sheet = readFileSync(file, 'utf8');
      const tokensAt = sheet.indexOf("@import '../tokens.css'");
      const devAt = sheet.indexOf("@import '../dev-mode.css'");
      expect(devAt).toBeGreaterThan(tokensAt);
    }
  });

  it('technical values use the mono token; Arabic labels never do', () => {
    // The diagnostics strip values and version caption are the mono surfaces.
    expect(css).toMatch(/\.dev-diag-value\s*{[^}]*var\(--sawb-font-mono\)/);
    expect(css).toMatch(/\.dev-diag-label\s*{[^}]*var\(--sawb-font-mono\)/);
    // The pill («وضع المطورين نشط») is Arabic text — no mono override on it.
    const pillRule = css.match(/\.dev-pill\s*{[^}]*}/g)?.join('') ?? '';
    expect(pillRule).not.toContain('--sawb-font-mono');
  });
});
