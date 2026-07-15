import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initOptions } from '../src/ui/options/options';
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

async function openOptions(prefill?: { settings?: Partial<Settings>; sites?: SiteMap }) {
  if (prefill) chromeStub.storage.local.data = { ...prefill };
  document.body.innerHTML = body;
  await initOptions(document);
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

  it('shows version 1.0.0 in the sidebar card and About — never the prototype 1.2.0', async () => {
    await openOptions();
    const versions = Array.from(document.querySelectorAll('[data-version]')).map(
      (s) => s.textContent,
    );
    expect(versions).toEqual(['1.0.0', '1.0.0']);
    expect(document.body.textContent).not.toContain('1.2.0');
    expect(document.querySelector('.about-version')!.textContent).toBe('الإصدار 1.0.0 · رخصة MIT');
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

  it('hides the GitHub row while no repository URL exists (no empty control)', async () => {
    await openOptions();
    const row = el('github-row');
    expect(row.hidden).toBe(true);
    expect(row.textContent).toBe('');
    expect(document.querySelectorAll('#sec-about a').length).toBe(0);
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
});
