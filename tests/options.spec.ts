import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initOptions, type OptionsOverrides } from '../src/ui/options/options';
import { GITHUB_LINKS } from '../src/config/links';
import { chromeStub, tick } from './helpers/setup';
import type { Settings, SiteMap } from '../src/platform/types';

const html = readFileSync('src/ui/options/options.html', 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/)![1]!;

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function storedSettings(): Partial<Settings> | undefined {
  return (chromeStub.storage.local.data as { settings?: Partial<Settings> }).settings;
}

async function openOptions(
  prefill?: { settings?: Partial<Settings>; sites?: SiteMap },
  overrides?: OptionsOverrides,
) {
  if (prefill) chromeStub.storage.local.data = { ...prefill };
  document.body.innerHTML = body;
  await initOptions(document, overrides);
  await tick();
}

describe('settings page rendering', () => {
  it('shows the general section by default with stored values', async () => {
    await openOptions();
    expect(el('sec-general').hidden).toBe(false);
    expect(el('sec-sites').hidden).toBe(true);
    expect(
      document.querySelector('#sec-general [data-mode="auto"]')!.getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      document.querySelector('#theme-selector [data-value="system"]')!.getAttribute('aria-checked'),
    ).toBe('true');
    expect(el('indicator-toggle').getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
  });

  it('shows version 1.1.0 in the sidebar card and About — never the prototype 1.2.0', async () => {
    await openOptions();
    const versions = Array.from(document.querySelectorAll('[data-version]')).map(
      (s) => s.textContent,
    );
    expect(versions).toEqual(['1.1.0', '1.1.0']);
    expect(document.body.textContent).not.toContain('1.2.0');
    expect(document.querySelector('.about-version')!.textContent).toBe('الإصدار 1.1.0');
  });

  it('never places MIT next to the version; the license is a quiet closing line', async () => {
    await openOptions();
    expect(document.querySelector('.about-version')!.textContent).not.toContain('MIT');
    expect(document.querySelector('.about-header')!.textContent).not.toContain('MIT');
    const license = document.querySelector('.about-license')!;
    expect(license.textContent).toBe('الرخصة: MIT License');
    // The license line is the last element of the About section.
    expect(el('sec-about').lastElementChild).toBe(license);
  });

  it('lists the four keyboard shortcuts exactly', async () => {
    await openOptions();
    const rows = Array.from(document.querySelectorAll('.shortcut-row'));
    expect(rows.map((r) => r.querySelector('.shortcut-action')!.textContent)).toEqual([
      'تبديل الاتجاه إلى RTL',
      'تبديل الاتجاه إلى LTR',
      'تفعيل الوضع التلقائي',
      'تعطيل الإضافة مؤقتًا',
    ]);
    expect(rows[0]!.querySelectorAll('kbd').length).toBe(3);
  });

  it('renders the privacy box and the four checklist items', async () => {
    await openOptions();
    expect(document.querySelector('.privacy-title')!.textContent).toBe('🔒 يعمل بالكامل على جهازك');
    expect(document.querySelectorAll('.privacy-check').length).toBe(4);
    expect(document.querySelector('#privacy-checks')!.textContent).toContain(
      'التفضيلات في chrome.storage.local فقط',
    );
  });

  it('About shows both identities: صَوْب with SAWB, privacy line, and browsers', async () => {
    await openOptions();
    expect(document.querySelector('.about-name')!.textContent).toBe('صَوْب');
    expect(document.querySelector('.about-latin')!.textContent).toBe('SAWB');
    expect(document.querySelector('.about-privacy')!.textContent).toBe(
      'يعمل محليًا، بلا حساب أو خادم، ولا يرسل نصوصك.',
    );
    expect(document.querySelector('.about-compat')!.textContent).toBe(
      'متوافقة مع: Chrome · Edge · Brave · Arc',
    );
  });

  it('creator section: signature with Arabic alt text, تصميم وبرمجة سلطان, By Sultan', async () => {
    await openOptions();
    const sig = document.querySelector('.creator-sig')!;
    expect(sig.getAttribute('role')).toBe('img');
    expect(sig.getAttribute('aria-label')).toBe('توقيع سلطان بالخط العربي');
    expect(document.querySelector('.creator-name')!.textContent).toBe('تصميم وبرمجة سلطان');
    expect(document.querySelector('.creator-latin')!.textContent).toBe('By Sultan');
    // Creator is secondary: it appears after the product content and actions.
    const about = el('sec-about');
    const children = Array.from(about.children);
    expect(children.indexOf(document.querySelector('.creator-block')!)).toBeGreaterThan(
      children.indexOf(el('about-actions')),
    );
  });

  it('renders the profile and repository buttons from the central links config', async () => {
    // Isolated from the releases flag so this test only asserts the two
    // always-present buttons and their config-sourced hrefs.
    await openOptions(undefined, { releasesPublished: false });
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#about-actions a'));
    expect(links.map((a) => a.textContent)).toEqual(['حسابي على GitHub', 'المشروع على GitHub']);
    expect(links.map((a) => a.href)).toEqual([GITHUB_LINKS.creator, GITHUB_LINKS.repository]);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noreferrer');
    }
  });

  it('the releases button does not exist while releasesPublished is false — no placeholder', async () => {
    await openOptions(undefined, { releasesPublished: false });
    expect(document.body.textContent).not.toContain('آخر التحديثات');
    expect(document.querySelector(`a[href="${GITHUB_LINKS.releases}"]`)).toBeNull();
    expect(document.querySelectorAll('#about-actions a').length).toBe(2);
  });

  it('the releases button is visible by default (a real release is now published) and opens the real Releases URL', async () => {
    await openOptions();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('#about-actions a'));
    expect(links.map((a) => a.textContent)).toEqual([
      'حسابي على GitHub',
      'المشروع على GitHub',
      'آخر التحديثات',
    ]);
    const releaseLink = links[2]!;
    expect(releaseLink.href).toBe(GITHUB_LINKS.releases);
    expect(releaseLink.href).toBe('https://github.com/iSltanX/SAWB/releases');
    expect(releaseLink.target).toBe('_blank');
    expect(releaseLink.rel).toBe('noreferrer');
  });

  it('keyboard access: every interactive element in About is a real link or button, releases button included', async () => {
    await openOptions();
    const interactive = Array.from(el('sec-about').querySelectorAll('a, button'));
    expect(interactive.length).toBeGreaterThan(0);
    const releaseLink = interactive.find((n) => n.textContent === 'آخر التحديثات')!;
    expect(releaseLink.tagName).toBe('A');
    expect(releaseLink.getAttribute('href')).toBe(GITHUB_LINKS.releases);
    for (const node of interactive) {
      if (node.tagName === 'A') expect(node.getAttribute('href')).toBeTruthy();
    }
    // Focus visibility is enforced globally by the shared stylesheet.
    const componentsCss = readFileSync('src/ui/components.css', 'utf8');
    expect(componentsCss).toMatch(/:focus-visible\s*{[^}]*outline: 2px solid var\(--ring\)/);
  });

  it('sidebar navigation switches sections with aria-current', async () => {
    await openOptions();
    const privacyButton = document.querySelector<HTMLElement>('[data-section="privacy"]')!;
    privacyButton.click();
    expect(el('sec-privacy').hidden).toBe(false);
    expect(el('sec-general').hidden).toBe(true);
    expect(privacyButton.getAttribute('aria-current')).toBe('true');
    expect(
      document.querySelector('[data-section="general"]')!.getAttribute('aria-current'),
    ).toBe('false');
  });
});

describe('settings behavior', () => {
  it('changes the default direction mode', async () => {
    await openOptions();
    document.querySelector<HTMLElement>('#sec-general [data-mode="rtl"]')!.click();
    await tick();
    expect(storedSettings()?.defaultMode).toBe('rtl');
    expect(
      document.querySelector('#sec-general [data-mode="rtl"]')!.getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('theme control persists and applies immediately (تلقائي/فاتح/داكن)', async () => {
    await openOptions();
    document.querySelector<HTMLElement>('#theme-selector [data-value="dark"]')!.click();
    await tick();
    expect(storedSettings()?.theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.querySelector<HTMLElement>('#theme-selector [data-value="light"]')!.click();
    await tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggles the direction indicator', async () => {
    await openOptions();
    el('indicator-toggle').click();
    await tick();
    expect(storedSettings()?.showIndicator).toBe(false);
    expect(el('indicator-toggle').getAttribute('aria-checked')).toBe('false');
  });

  it('global writing-fields and displayed-text rows persist their defaults', async () => {
    await openOptions();
    expect(el('fields-toggle').getAttribute('aria-checked')).toBe('true'); // default
    expect(el('display-toggle').getAttribute('aria-checked')).toBe('false'); // default
    el('fields-toggle').click();
    await tick();
    el('display-toggle').click();
    await tick();
    expect(storedSettings()?.applyToFields).toBe(false);
    expect(storedSettings()?.applyToDisplay).toBe(true);
    // Unrelated settings keep their values.
    expect(storedSettings()?.defaultMode).toBe('auto');
    expect(storedSettings()?.theme).toBe('system');
    expect(el('fields-toggle').getAttribute('aria-checked')).toBe('false');
    expect(el('display-toggle').getAttribute('aria-checked')).toBe('true');
  });

  it('general section order: الاتجاه الافتراضي، حقول الكتابة، النصوص المعروضة، إظهار مؤشر الاتجاه، المظهر', async () => {
    await openOptions();
    const labels = Array.from(
      document.querySelectorAll('#sec-general .control-label, #sec-general .setting-label'),
    ).map((n) => n.textContent);
    expect(labels).toEqual([
      'الاتجاه الافتراضي',
      'حقول الكتابة',
      'النصوص المعروضة',
      'إظهار مؤشر الاتجاه',
      'راحة القراءة',
      'تفعيل راحة القراءة',
      'المظهر',
    ]);
  });
});

describe('saved sites list', () => {
  const SITES: SiteMap = {
    'chatgpt.com': { mode: 'rtl', savedAt: 1 },
    'notion.so': { mode: 'auto', savedAt: 2 },
    'substack.com': { mode: 'ltr', savedAt: 3 },
    'example.com': { disabled: true, savedAt: 4 },
  };

  it('renders count, domains, mode badges, and supported labels', async () => {
    await openOptions({ sites: SITES });
    document.querySelector<HTMLElement>('[data-section="sites"]')!.click();
    expect(el('sites-count').textContent).toBe('4 مواقع');
    const rows = Array.from(document.querySelectorAll('.site-row'));
    expect(rows.length).toBe(4);

    const byDomain = new Map(
      rows.map((r) => [r.querySelector('.site-row-domain')!.textContent, r]),
    );
    expect(byDomain.get('chatgpt.com')!.querySelector('.site-mode-badge')!.textContent).toBe('RTL ←');
    expect(byDomain.get('chatgpt.com')!.querySelector('.site-row-supported')!.textContent).toBe(
      'مدعوم رسميًا',
    );
    expect(byDomain.get('notion.so')!.querySelector('.site-mode-badge')!.textContent).toBe('تلقائي');
    expect(byDomain.get('notion.so')!.querySelector('.site-row-supported')).toBeNull();
    expect(byDomain.get('substack.com')!.querySelector('.site-mode-badge')!.textContent).toBe('LTR →');
    expect(byDomain.get('example.com')!.querySelector('.site-mode-badge')!.textContent).toBe('معطّلة');
  });

  it('delete removes the preference (reset to default) and re-renders', async () => {
    await openOptions({ sites: SITES });
    document.querySelector<HTMLElement>('[data-section="sites"]')!.click();
    const row = Array.from(document.querySelectorAll('.site-row')).find(
      (r) => r.querySelector('.site-row-domain')!.textContent === 'notion.so',
    )!;
    row.querySelector<HTMLElement>('.site-delete')!.click();
    await tick();
    const sites = (chromeStub.storage.local.data as { sites?: SiteMap }).sites!;
    expect(sites['notion.so']).toBeUndefined();
    expect(el('sites-count').textContent).toBe('3 مواقع');
  });

  it('empty state shows a zero count and no rows', async () => {
    await openOptions();
    document.querySelector<HTMLElement>('[data-section="sites"]')!.click();
    expect(el('sites-count').textContent).toBe('0 مواقع');
    expect(document.querySelectorAll('.site-row').length).toBe(0);
  });

  it('a disabled site shows a reactivate button; a non-disabled one does not', async () => {
    await openOptions({ sites: SITES });
    document.querySelector<HTMLElement>('[data-section="sites"]')!.click();
    const rows = Array.from(document.querySelectorAll('.site-row'));
    const byDomain = new Map(rows.map((r) => [r.querySelector('.site-row-domain')!.textContent, r]));
    expect(byDomain.get('example.com')!.querySelector('.site-reactivate')).not.toBeNull();
    expect(byDomain.get('chatgpt.com')!.querySelector('.site-reactivate')).toBeNull();
  });

  it('reactivating a site with no other saved values deletes the entry entirely', async () => {
    await openOptions({ sites: SITES });
    document.querySelector<HTMLElement>('[data-section="sites"]')!.click();
    const row = Array.from(document.querySelectorAll('.site-row')).find(
      (r) => r.querySelector('.site-row-domain')!.textContent === 'example.com',
    )!;
    row.querySelector<HTMLElement>('.site-reactivate')!.click();
    await tick();
    const sites = (chromeStub.storage.local.data as { sites?: SiteMap }).sites!;
    expect(sites['example.com']).toBeUndefined();
  });

  it('reactivating a site that also has other saved values keeps them and drops only disabled', async () => {
    const sitesWithBoth: SiteMap = {
      'chatgpt.com': { mode: 'rtl', readingComfort: true, disabled: true, savedAt: 1 },
    };
    await openOptions({ sites: sitesWithBoth });
    document.querySelector<HTMLElement>('[data-section="sites"]')!.click();
    document.querySelector<HTMLElement>('.site-reactivate')!.click();
    await tick();
    const sites = (chromeStub.storage.local.data as { sites?: SiteMap }).sites!;
    expect(sites['chatgpt.com']).toMatchObject({ mode: 'rtl', readingComfort: true });
    expect(sites['chatgpt.com']!.disabled).toBeUndefined();
  });
});

describe('reading comfort settings (Draft 1.0)', () => {
  it('renders off by default with the documented starting values, sliders disabled', async () => {
    await openOptions();
    expect(el('rc-toggle').getAttribute('aria-checked')).toBe('false');
    expect((el('rc-font-scale') as HTMLInputElement).value).toBe('108');
    expect(el('rc-font-scale-value').textContent).toBe('108%');
    expect((el('rc-line-height') as HTMLInputElement).value).toBe('1.8');
    expect(el('rc-line-height-value').textContent).toBe('1.8');
    expect((el('rc-font-scale') as HTMLInputElement).disabled).toBe(true);
    expect((el('rc-line-height') as HTMLInputElement).disabled).toBe(true);
    expect(el('reading-comfort-block').classList.contains('rc-disabled')).toBe(true);
  });

  it('toggling the master switch persists it and enables the sliders', async () => {
    await openOptions();
    el('rc-toggle').click();
    await tick();
    expect(storedSettings()?.readingComfort).toBe(true);
    expect(el('rc-toggle').getAttribute('aria-checked')).toBe('true');
    expect((el('rc-font-scale') as HTMLInputElement).disabled).toBe(false);
    expect(el('reading-comfort-block').classList.contains('rc-disabled')).toBe(false);
  });

  it('changing the font-size slider persists rcFontScale as a fraction', async () => {
    await openOptions();
    const input = el('rc-font-scale') as HTMLInputElement;
    input.value = '120';
    input.dispatchEvent(new Event('input'));
    expect(el('rc-font-scale-value').textContent).toBe('120%'); // live label, no write yet
    input.dispatchEvent(new Event('change'));
    await tick();
    expect(storedSettings()?.rcFontScale).toBe(1.2);
  });

  it('changing the line-height slider persists rcLineHeight', async () => {
    await openOptions();
    const input = el('rc-line-height') as HTMLInputElement;
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    expect(el('rc-line-height-value').textContent).toBe('2');
    input.dispatchEvent(new Event('change'));
    await tick();
    expect(storedSettings()?.rcLineHeight).toBe(2);
  });

  it('the reset button restores the documented defaults', async () => {
    await openOptions();
    el('rc-toggle').click();
    await tick();
    const fontInput = el('rc-font-scale') as HTMLInputElement;
    fontInput.value = '130';
    fontInput.dispatchEvent(new Event('change'));
    await tick();
    el('rc-reset').click();
    await tick();
    expect(storedSettings()?.readingComfort).toBe(false);
    expect(storedSettings()?.rcFontScale).toBe(1.08);
    expect(storedSettings()?.rcLineHeight).toBe(1.8);
  });
});
