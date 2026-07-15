/**
 * README integrity — every referenced asset exists, every repository link
 * matches the central config, and nothing forbidden (local paths, fake
 * badges, design sources) leaks in.
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GITHUB_LINKS } from '../src/config/links';

const readme = readFileSync('README.md', 'utf8');

/** All link/image targets: markdown [..](x) and ![..](x), plus HTML src/srcset/href. */
function targets(): string[] {
  const out: string[] = [];
  for (const m of readme.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) out.push(m[1]!);
  for (const m of readme.matchAll(/(?:src|srcset|href)="([^"]+)"/g)) out.push(m[1]!);
  return out;
}

const isExternal = (t: string) => /^[a-z]+:\/\//.test(t) || t.startsWith('#');

describe('README asset paths', () => {
  it('every relative image and link target exists in the repository', () => {
    const relative = targets().filter((t) => !isExternal(t));
    expect(relative.length).toBeGreaterThan(0);
    for (const t of relative) {
      expect(existsSync(t), `README references missing file: ${t}`).toBe(true);
    }
  });

  it('contains no local filesystem paths and no links into build output', () => {
    expect(readme).not.toContain('/Users/');
    expect(readme).not.toContain('file://');
    for (const t of targets()) {
      expect(t, `README must not link into build output: ${t}`).not.toMatch(
        /^(dist|dist-packages)\//,
      );
    }
  });

  it('contains no fake badges or counters', () => {
    expect(readme).not.toContain('shields.io');
    expect(readme).not.toContain('badge');
  });

  it('never references the design sources', () => {
    expect(readme).not.toContain('design-reference');
    expect(readme).not.toContain('Complete Visual Identity Design');
  });
});

describe('README repository links', () => {
  it('external GitHub links match the central config exactly', () => {
    const github = targets().filter((t) => t.startsWith('https://github.com/'));
    expect(github).toContain(GITHUB_LINKS.releases);
    expect(github).toContain(GITHUB_LINKS.creator);
    expect(readme).toContain(`git clone ${GITHUB_LINKS.repository}.git`);
    for (const t of github) {
      expect(t.startsWith(GITHUB_LINKS.creator), `unexpected GitHub link: ${t}`).toBe(true);
    }
  });
});

describe('README content', () => {
  it('carries the product identity, creator credit, and honest release wording', () => {
    expect(readme).toContain('صَوْب');
    expect(readme).toContain('SAWB');
    expect(readme).toContain('تصميم وبرمجة سلطان');
    expect(readme).toContain('By Sultan');
    expect(readme).toContain('الإصدار الرسمي الحالي هو **v1.1.0**');
    expect(readme).toContain('manifest.json');
  });

  it('lists the supported sites and browsers', () => {
    for (const site of ['ChatGPT', 'Claude', 'Gemini', 'Google AI Studio', 'GitHub', 'Substack']) {
      expect(readme).toContain(site);
    }
    for (const browser of ['Chrome', 'Edge', 'Brave', 'Arc']) {
      expect(readme).toContain(browser);
    }
  });

  it('uses the official creator signature with Arabic alt text, adapted per theme', () => {
    expect(readme).toContain('docs/assets/brand/sultan_calligraphy.svg');
    expect(readme).toContain('docs/assets/brand/sultan_calligraphy-dark.svg');
    expect(readme).toContain('alt="توقيع سلطان بالخط العربي"');
    expect(readme).toContain('prefers-color-scheme: dark');
  });
});
