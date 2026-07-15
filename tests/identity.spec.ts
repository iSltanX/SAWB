/**
 * Creator-identity consistency — the official sultan_calligraphy.svg is used
 * everywhere unmodified: the runtime copy and the docs copy are byte-identical,
 * and the dark README variant differs in presentation (fill) only, never in
 * geometry.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const RUNTIME = 'src/ui/assets/brand/sultan_calligraphy.svg';
const DOCS = 'docs/assets/brand/sultan_calligraphy.svg';
const DOCS_DARK = 'docs/assets/brand/sultan_calligraphy-dark.svg';

const pathData = (svg: string) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);

describe('creator signature assets', () => {
  it('runtime and docs copies are byte-identical', () => {
    expect(readFileSync(RUNTIME, 'utf8')).toBe(readFileSync(DOCS, 'utf8'));
  });

  it('the dark variant preserves the calligraphy geometry exactly', () => {
    const light = readFileSync(DOCS, 'utf8');
    const dark = readFileSync(DOCS_DARK, 'utf8');
    expect(pathData(dark)).toEqual(pathData(light));
    expect(pathData(dark).length).toBe(2);
    // Presentation-only difference: a fill on the group element.
    expect(dark).toContain('fill="#EDE8DC"');
    expect(dark.replace('fill="#EDE8DC" ', '')).toBe(light);
  });

  it('the About page renders the signature from the untouched runtime asset', () => {
    const css = readFileSync('src/ui/options/options.css', 'utf8');
    expect(css).toContain("mask: url('../assets/brand/sultan_calligraphy.svg')");
    const html = readFileSync('src/ui/options/options.html', 'utf8');
    expect(html).toContain('aria-label="توقيع سلطان بالخط العربي"');
  });
});
