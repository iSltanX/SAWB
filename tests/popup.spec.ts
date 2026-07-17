import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initPopup } from '../src/ui/popup/popup';
import { chromeStub, tick } from './helpers/setup';
import { DEFAULT_SETTINGS, resolveEffectiveConfig, resolveReadingComfortRequest } from '../src/platform/types';
import type { SiteMap, Settings, TempOverride } from '../src/platform/types';
import type { PageState, SawbMessage } from '../src/platform/messages';
import type { SupportLevel } from '../src/adapters/types';

const html = readFileSync('src/ui/popup/popup.html', 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/)![1]!;

/**
 * Simulate the content script of the active tab: it answers get-state and
 * apply-temp against the stub storage plus its own in-memory temp override —
 * the same contract as src/content/index.ts.
 */
function installFakePage(host: string, level: SupportLevel = 'full') {
  let temp: TempOverride | null = null;
  const adapterId = level === 'generic' ? 'generic' : level === 'partial' ? 'claude' : 'chatgpt';
  chromeStub.tabs.sendMessage = async (_tabId: number, raw: unknown) => {
    const msg = raw as SawbMessage;
    if (msg.type === 'sawb/apply-temp') temp = { ...temp, ...msg.override };
    const data = chromeStub.storage.local.data as { settings?: Partial<Settings>; sites?: SiteMap };
    const settings: Settings = { ...DEFAULT_SETTINGS, ...data.settings };
    const sites = data.sites ?? {};
    return {
      host,
      adapterId,
      supported: level !== 'generic',
      supportLevel: level,
      config: resolveEffectiveConfig(settings, sites[host], temp, { genericSite: level === 'generic' }),
      hasTempOverride: temp !== null,
      rcRequested: resolveReadingComfortRequest(settings, sites[host], temp, {
        genericSite: level === 'generic',
      }),
    } satisfies PageState;
  };
  return {
    getTemp: () => temp,
  };
}

function sites(): SiteMap {
  return ((chromeStub.storage.local.data as Record<string, unknown>).sites as SiteMap) ?? {};
}

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

async function openPopup(host = 'chatgpt.com', level: SupportLevel = 'full') {
  const fake = installFakePage(host, level);
  document.body.innerHTML = body;
  await initPopup(document);
  await tick();
  return fake;
}

describe('popup rendering', () => {
  it('shows hostname, supported badge, and default state', async () => {
    await openPopup('chatgpt.com', 'full');
    expect(el('site-domain').textContent).toBe('chatgpt.com');
    expect(el('site-badge').hidden).toBe(false);
    expect(el('site-badge').textContent).toBe('موقع مدعوم ✓');
    expect(el('site-badge').className).toContain('badge-teal');
    expect(el('enabled-badge').hidden).toBe(false);
    expect(el('master-toggle').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('[data-mode="auto"]')!.getAttribute('aria-checked')).toBe('true');
    expect(el('mode-desc').textContent).toBe('يُكشف الاتجاه تلقائيًا من أول حرف تكتبه');
    expect(el('fields-toggle').getAttribute('aria-checked')).toBe('true');
    expect(el('display-toggle').getAttribute('aria-checked')).toBe('false');
    expect(el('save-toggle').getAttribute('aria-checked')).toBe('false');
    expect(el('disable-toggle').getAttribute('aria-checked')).toBe('false');
    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
  });

  it('shows the generic-mode badge «وضع عام» on unsupported sites', async () => {
    await openPopup('example.com', 'generic');
    expect(el('site-badge').textContent).toBe('وضع عام');
    expect(el('site-badge').className).toContain('badge-auto');
  });

  it('applies the stored theme to the popup document', async () => {
    chromeStub.storage.local.data = { settings: { theme: 'dark' } };
    await openPopup();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('handles pages without a content script (unavailable state)', async () => {
    document.body.innerHTML = body;
    await initPopup(document); // stub sendMessage throws by default
    await tick();
    expect(document.body.classList.contains('page-unavailable')).toBe(true);
    expect(el('site-domain').textContent).toBe('—');
    expect(el('site-badge').hidden).toBe(true);
  });
});

describe('site-badge states — focused verification (Stage 2B item 1)', () => {
  it('supported hostname → «موقع مدعوم ✓» visible in teal', async () => {
    await openPopup('chatgpt.com', 'full');
    const badge = el('site-badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('موقع مدعوم ✓');
    expect(badge.className).toBe('badge badge-teal');
  });

  it('unsupported site via generic adapter → «وضع عام» visible in autoBlue', async () => {
    await openPopup('example.com', 'generic');
    const badge = el('site-badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('وضع عام');
    expect(badge.className).toBe('badge badge-auto');
  });

  it('restricted page (no content script) → no site badge, unavailable state', async () => {
    document.body.innerHTML = body;
    await initPopup(document); // default stub sendMessage throws
    await tick();
    expect(el('site-badge').hidden).toBe(true);
    expect(document.body.classList.contains('page-unavailable')).toBe(true);
  });

  it('a persistently disabled SUPPORTED site keeps «موقع مدعوم ✓» — never «وضع عام»', async () => {
    await openPopup('chatgpt.com', 'full');
    el('disable-toggle').click();
    await tick();
    const badge = el('site-badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('موقع مدعوم ✓');
    expect(el('enabled-badge').hidden).toBe(true); // مفعّلة hides, per mockup
  });

  it('changing values while persistently disabled never re-enables the engine', async () => {
    const fake = await openPopup('chatgpt.com', 'full');
    el('disable-toggle').click();
    await tick();
    // Mode + display changes while disabled (controls stay editable by design)
    (document.querySelector('[data-mode="rtl"]') as HTMLElement).click();
    await tick();
    el('display-toggle').click();
    await tick();
    // The persistent disable is untouched and the effective config stays off.
    expect(sites()['chatgpt.com']).toMatchObject({ disabled: true });
    const state = (await chromeStub.tabs.sendMessage(1, { type: 'sawb/get-state' })) as PageState;
    expect(state.config.enabled).toBe(false);
    expect(fake.getTemp()?.disabled ?? undefined).not.toBe(false); // temp never re-enables
    // Values were recorded for when the user re-enables.
    expect(state.config.mode).toBe('rtl');
  });
});

/**
 * General badge-mechanism regression (not a claim about any specific site's
 * current status — claude.ai reached "full" support once its display
 * selectors were live-verified; see tests/adapters/claude.spec.ts). Uses a
 * hypothetical partially-verified site to prove the popup still renders the
 * partial badge correctly whenever a FUTURE adapter is display-unverified.
 */
describe('partial-support badge (general mechanism)', () => {
  it('a dedicated adapter with unverified display shows partial-support, never «موقع مدعوم ✓»', async () => {
    await openPopup('example-ai.test', 'partial');
    const badge = el('site-badge');
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('دعم جزئي — الحقول فقط');
    expect(badge.textContent).not.toBe('موقع مدعوم ✓');
    // Reuses the existing badge-auto style — no new component/color.
    expect(badge.className).toBe('badge badge-auto');
  });

  it('partial support still allows normal field control (fields are verified)', async () => {
    await openPopup('example-ai.test', 'partial');
    expect(el('fields-toggle').getAttribute('aria-checked')).toBe('true');
    (document.querySelector('[data-mode="rtl"]') as HTMLElement).click();
    await tick();
    expect(document.querySelector('[data-mode="rtl"]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('a persistently disabled partial-support site keeps the partial badge, not موقع مدعوم ✓', async () => {
    await openPopup('example-ai.test', 'partial');
    el('disable-toggle').click();
    await tick();
    expect(el('site-badge').textContent).toBe('دعم جزئي — الحقول فقط');
  });
});

describe('temporary vs saved behavior (requirement 6)', () => {
  it('mode change with saving OFF applies a tab-only override, no storage write', async () => {
    const fake = await openPopup();
    (document.querySelector('[data-mode="rtl"]') as HTMLElement).click();
    await tick();
    expect(fake.getTemp()).toEqual({ mode: 'rtl' });
    expect(sites()['chatgpt.com']).toBeUndefined();
    expect(document.querySelector('[data-mode="rtl"]')!.getAttribute('aria-checked')).toBe('true');
    expect(el('mode-desc').textContent).toBe('جميع حقول الكتابة تُجبر على RTL');
    // Mode colors are token references so the dev-identity layer can remap
    // them; in normal mode --sawb-teal still resolves to the brand #1E9080.
    expect(el('fields-toggle').style.getPropertyValue('--toggle-color')).toBe('var(--sawb-teal)');
  });

  it('turning saving ON persists the current effective state', async () => {
    const fake = await openPopup();
    (document.querySelector('[data-mode="rtl"]') as HTMLElement).click();
    await tick();
    el('save-toggle').click();
    await tick();
    const pref = sites()['chatgpt.com'];
    expect(pref).toMatchObject({ mode: 'rtl', fields: true, display: false });
    expect(pref!.disabled).toBeUndefined();
    expect(fake.getTemp()).toEqual({ mode: 'rtl' }); // temp untouched
    expect(el('save-toggle').getAttribute('aria-checked')).toBe('true');
  });

  it('changes while saving is ON persist to storage', async () => {
    await openPopup();
    el('save-toggle').click();
    await tick();
    (document.querySelector('[data-mode="ltr"]') as HTMLElement).click();
    await tick();
    el('display-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ mode: 'ltr', display: true });
  });

  it('turning saving OFF deletes the entry and keeps state as temp only', async () => {
    const fake = await openPopup();
    el('save-toggle').click();
    await tick();
    (document.querySelector('[data-mode="rtl"]') as HTMLElement).click();
    await tick();
    el('save-toggle').click(); // off
    await tick();
    expect(sites()['chatgpt.com']).toBeUndefined();
    expect(fake.getTemp()).toMatchObject({ mode: 'rtl' });
  });
});

describe('persistent site disable (requirement 1)', () => {
  it('is persistent even when saving is OFF', async () => {
    await openPopup();
    el('disable-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ disabled: true });
    expect(el('disable-toggle').getAttribute('aria-checked')).toBe('true');
    expect(el('enabled-badge').hidden).toBe(true); // mockup hides مفعّلة
  });

  it('re-enabling removes the entry when nothing else is saved', async () => {
    await openPopup();
    el('disable-toggle').click();
    await tick();
    el('disable-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toBeUndefined();
    expect(el('enabled-badge').hidden).toBe(false);
  });

  it('preserves saved preferences across disable/enable', async () => {
    await openPopup();
    el('save-toggle').click();
    await tick();
    (document.querySelector('[data-mode="rtl"]') as HTMLElement).click();
    await tick();
    el('disable-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ mode: 'rtl', disabled: true });
    el('disable-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ mode: 'rtl' });
    expect(sites()['chatgpt.com']!.disabled).toBeUndefined();
  });
});

describe('master toggle and external changes', () => {
  it('toggles the global enabled setting and hides the badge', async () => {
    await openPopup();
    el('master-toggle').click();
    await tick();
    const settings = (chromeStub.storage.local.data as { settings?: Partial<Settings> }).settings;
    expect(settings?.enabled).toBe(false);
    expect(el('enabled-badge').hidden).toBe(true);
    expect(el('master-toggle').getAttribute('aria-checked')).toBe('false');
  });

  it('re-renders when storage changes from elsewhere (another window)', async () => {
    await openPopup();
    await chromeStub.storage.local.set({
      settings: { ...DEFAULT_SETTINGS, theme: 'light', enabled: false },
    });
    await tick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(el('master-toggle').getAttribute('aria-checked')).toBe('false');
  });
});

describe('reading-comfort quick toggle (Draft 1.0 — flips the raw request, not the gated value)', () => {
  it('with display on, turning it on with saving OFF sends a temp override', async () => {
    const fake = await openPopup();
    el('display-toggle').click();
    await tick();
    expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('false');
    el('reading-comfort-toggle').click();
    await tick();
    expect(fake.getTemp()).toMatchObject({ readingComfort: true });
    expect(sites()['chatgpt.com']).toBeUndefined();
  });

  it('turning it on requires display too — enabling both makes the toggle show active', async () => {
    await openPopup();
    el('display-toggle').click();
    await tick();
    el('reading-comfort-toggle').click();
    await tick();
    expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('true');
  });

  it('toggle is disabled when display is off, and says why', async () => {
    await openPopup(); // display defaults to false
    const toggle = el('reading-comfort-toggle');
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(el('reading-comfort-row').classList.contains('row-disabled')).toBe(true);
    expect(el('reading-comfort-sub').textContent).toBe('يتطلب تفعيل النصوص المعروضة');
  });

  it('aria state and explanatory text return to normal once display is on', async () => {
    await openPopup();
    el('display-toggle').click();
    await tick();
    const toggle = el('reading-comfort-toggle');
    expect(toggle.getAttribute('aria-disabled')).toBe('false');
    expect(el('reading-comfort-row').classList.contains('row-disabled')).toBe(false);
    expect(el('reading-comfort-sub').textContent).toBe(
      'تحسين حجم الخط وتباعد الأسطر للنص العربي المعروض',
    );
  });

  it('clicking it while disabled does not mutate temp or site preferences', async () => {
    const fake = await openPopup(); // display off → toggle inert
    el('reading-comfort-toggle').click();
    await tick();
    expect(fake.getTemp()).toBeNull();
    expect(sites()['chatgpt.com']).toBeUndefined();
  });

  it('clicking it while disabled never rewrites a saved rcRequested behind the UI', async () => {
    chromeStub.storage.local.data = {
      sites: { 'chatgpt.com': { display: false, readingComfort: true, savedAt: 1 } },
    };
    const fake = await openPopup();
    expect(el('reading-comfort-toggle').getAttribute('aria-disabled')).toBe('true');
    el('reading-comfort-toggle').click();
    await tick();
    // The stored request is untouched: an inert control must not mutate state
    // the user cannot see change.
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true, display: false });
    expect(fake.getTemp()).toBeNull();
  });

  it('saved rcRequested survives display off → on → off', async () => {
    chromeStub.storage.local.data = {
      sites: { 'chatgpt.com': { display: false, readingComfort: true, savedAt: 1 } },
    };
    await openPopup();
    expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('false'); // gated

    el('display-toggle').click(); // display on → the saved request takes effect
    await tick();
    expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('true');
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true });

    el('display-toggle').click(); // display off again → gated, but not lost
    await tick();
    expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('false');
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true });
  });

  it('with saving ON, clicking persists readingComfort on the SitePref', async () => {
    await openPopup();
    el('save-toggle').click();
    await tick();
    el('display-toggle').click();
    await tick();
    el('reading-comfort-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true, display: true });
  });

  it(
    'critical case: turning saving OFF while display=false preserves the RAW stored request ' +
      'instead of the gated value — the two diverge exactly here',
    async () => {
      // The save-toggle runs regardless of display, and mirrors the current
      // state into a temp override. With display off, cfg.readingComfort is
      // false while the stored request is true: mirroring the GATED value
      // would silently downgrade the user's intent to false.
      chromeStub.storage.local.data = {
        sites: { 'chatgpt.com': { display: false, readingComfort: true, savedAt: 1 } },
      };
      const fake = await openPopup();
      expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('false'); // gated
      expect(el('save-toggle').getAttribute('aria-checked')).toBe('true'); // saved values exist

      el('save-toggle').click(); // turn saving off
      await tick();

      expect(sites()['chatgpt.com']).toBeUndefined(); // entry dropped
      expect(fake.getTemp()).toMatchObject({ readingComfort: true }); // RAW request carried over
    },
  );

  it(
    're-enabling display later automatically restores a preserved readingComfort request',
    async () => {
      chromeStub.storage.local.data = {
        sites: { 'chatgpt.com': { display: false, readingComfort: true, savedAt: 1 } },
      };
      await openPopup();
      expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('false');
      el('display-toggle').click();
      await tick();
      // No click on the reading-comfort toggle itself — the stored request
      // (true) takes effect automatically the moment display turns back on.
      expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('true');
    },
  );

  it('re-enabling a disabled site carries the saved readingComfort forward', async () => {
    chromeStub.storage.local.data = {
      sites: {
        'chatgpt.com': { display: true, readingComfort: true, disabled: true, savedAt: 1 },
      },
    };
    await openPopup();
    el('disable-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true, display: true });
    expect(sites()['chatgpt.com']!.disabled).toBeUndefined();
  });

  it('disabling a site stops SAWB via enabled=false, while the saved readingComfort request is preserved', async () => {
    await openPopup();
    el('save-toggle').click();
    await tick();
    el('display-toggle').click();
    await tick();
    el('reading-comfort-toggle').click();
    await tick();
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true, display: true });

    el('disable-toggle').click();
    await tick();

    // What actually stops every SAWB edit on a disabled site is enabled=false
    // — the content script calls engine.stop() on that alone (see
    // content/index.ts sync()). This is the assertion that matters.
    const state = (await chromeStub.tabs.sendMessage(1, { type: 'sawb/get-state' })) as PageState;
    expect(state.config.enabled).toBe(false);

    // readingComfort/display keep reporting the CONFIGURED intent rather than
    // being falsified — exactly as fields/display already do — and the saved
    // request survives so re-enabling the site restores it untouched.
    expect(state.config.readingComfort).toBe(true);
    expect(state.rcRequested).toBe(true);
    expect(sites()['chatgpt.com']).toMatchObject({ readingComfort: true, disabled: true });
    expect(el('reading-comfort-toggle').getAttribute('aria-checked')).toBe('true');
  });

  it('turning saving OFF mirrors the raw request into the temp override so the page does not jump', async () => {
    const fake = await openPopup();
    el('save-toggle').click();
    await tick();
    el('display-toggle').click();
    await tick();
    el('reading-comfort-toggle').click();
    await tick();
    el('save-toggle').click(); // off
    await tick();
    expect(sites()['chatgpt.com']).toBeUndefined();
    expect(fake.getTemp()).toMatchObject({ readingComfort: true, display: true });
  });

  it('tints with the active mode color like the other content toggles', async () => {
    await openPopup();
    expect(el('reading-comfort-toggle').style.getPropertyValue('--toggle-color')).toBe('var(--sawb-navy)');
  });
});
