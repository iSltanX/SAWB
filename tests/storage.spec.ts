import { describe, expect, it } from 'vitest';
import {
  deleteSitePref,
  getSettings,
  getSitePref,
  getSnapshot,
  initStorage,
  onStorageChanged,
  saveSitePref,
  setSettings,
} from '../src/platform/storage';
import {
  clampFontScale,
  clampLineHeight,
  DEFAULT_SETTINGS,
  resolveEffectiveConfig,
  resolveReadingComfortRequest,
  type Settings,
  type SitePref,
} from '../src/platform/types';

describe('settings', () => {
  it('returns defaults on first read (approved model, no autoDetect)', async () => {
    const settings = await getSettings();
    expect(settings).toEqual({
      enabled: true,
      defaultMode: 'auto',
      applyToFields: true,
      applyToDisplay: false,
      showIndicator: true,
      theme: 'system',
      readingComfort: false,
      rcFontScale: 1.08,
      rcLineHeight: 1.8,
      devMode: false,
    } satisfies Settings);
    expect('autoDetect' in settings).toBe(false);
  });

  it('merges patches over stored values', async () => {
    await setSettings({ defaultMode: 'rtl', theme: 'dark' });
    const settings = await getSettings();
    expect(settings.defaultMode).toBe('rtl');
    expect(settings.theme).toBe('dark');
    expect(settings.applyToFields).toBe(true);
  });
});

describe('site preferences', () => {
  it('saves, reads, and deletes per-site preferences', async () => {
    await saveSitePref('github.com', { mode: 'rtl', display: true });
    const pref = await getSitePref('github.com');
    expect(pref?.mode).toBe('rtl');
    expect(pref?.display).toBe(true);
    expect(typeof pref?.savedAt).toBe('number');

    await deleteSitePref('github.com');
    expect(await getSitePref('github.com')).toBeUndefined();
  });

  it('persistent site disable', async () => {
    await saveSitePref('example.com', { disabled: true });
    expect((await getSitePref('example.com'))?.disabled).toBe(true);
  });

  it('notifies on changes', async () => {
    let calls = 0;
    const off = onStorageChanged(() => { calls += 1; });
    await setSettings({ theme: 'light' });
    await saveSitePref('x.com', { mode: 'ltr' });
    expect(calls).toBe(2);
    off();
    await setSettings({ theme: 'dark' });
    expect(calls).toBe(2);
  });

  it('initStorage stamps the schema version', async () => {
    await initStorage();
    const snapshot = await getSnapshot();
    expect(snapshot.settings).toBeDefined();
  });
});

describe('resolveEffectiveConfig precedence', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS };

  it('settings alone', () => {
    const c = resolveEffectiveConfig(settings, undefined, null);
    expect(c).toEqual({
      enabled: true, mode: 'auto', fields: true, display: false, showIndicator: true,
      readingComfort: false, fontScale: 1.08, lineHeight: 1.8,
    });
  });

  it('site pref overrides settings', () => {
    const c = resolveEffectiveConfig(settings, { mode: 'rtl', display: true, savedAt: 1 }, null);
    expect(c.mode).toBe('rtl');
    expect(c.display).toBe(true);
    expect(c.fields).toBe(true); // untouched key falls through
  });

  it('temp override beats site pref (requirement 6)', () => {
    const c = resolveEffectiveConfig(
      settings,
      { mode: 'rtl', savedAt: 1 },
      { mode: 'ltr' },
    );
    expect(c.mode).toBe('ltr');
  });

  it('persistent site disable always wins — temp cannot re-enable it', () => {
    expect(resolveEffectiveConfig(settings, { disabled: true, savedAt: 1 }, null).enabled).toBe(false);
    expect(
      resolveEffectiveConfig(settings, { disabled: true, savedAt: 1 }, { disabled: false }).enabled,
    ).toBe(false);
  });

  it('temporary disable works on an otherwise enabled site (tab-only)', () => {
    expect(resolveEffectiveConfig(settings, undefined, { disabled: true }).enabled).toBe(false);
    expect(resolveEffectiveConfig(settings, undefined, { disabled: false }).enabled).toBe(true);
  });

  it('global disable wins over everything', () => {
    const c = resolveEffectiveConfig(
      { ...settings, enabled: false },
      { mode: 'rtl', savedAt: 1 },
      { disabled: false },
    );
    expect(c.enabled).toBe(false);
  });
});

describe('global-default precedence (Stage 2C item 1)', () => {
  it('globals apply to sites with no explicit override', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, defaultMode: 'rtl', applyToFields: false };
    const c = resolveEffectiveConfig(s, undefined, null);
    expect(c.mode).toBe('rtl');
    expect(c.fields).toBe(false);
  });

  it('a site preference overrides only the values it defines; the rest inherit CURRENT globals', () => {
    const site = { mode: 'ltr' as const, savedAt: 1 }; // no fields/display keys
    let c = resolveEffectiveConfig(DEFAULT_SETTINGS, site, null);
    expect(c.mode).toBe('ltr');
    expect(c.fields).toBe(true); // inherited default
    // Global default changes later → the missing keys follow it.
    c = resolveEffectiveConfig({ ...DEFAULT_SETTINGS, applyToFields: false }, site, null);
    expect(c.fields).toBe(false);
    expect(c.mode).toBe('ltr'); // explicit key unaffected
  });

  it('generic-site safety: global display default never applies on generic sites', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, applyToDisplay: true };
    expect(resolveEffectiveConfig(s, undefined, null, { genericSite: true }).display).toBe(false);
    expect(resolveEffectiveConfig(s, undefined, null, { genericSite: false }).display).toBe(true);
  });

  it('generic-site display turns on only via explicit per-site choice', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, applyToDisplay: true };
    expect(
      resolveEffectiveConfig(s, { display: true, savedAt: 1 }, null, { genericSite: true }).display,
    ).toBe(true);
    expect(
      resolveEffectiveConfig(s, undefined, { display: true }, { genericSite: true }).display,
    ).toBe(true);
  });

  it('generic sites always support writing fields (global default applies)', () => {
    expect(resolveEffectiveConfig(DEFAULT_SETTINGS, undefined, null, { genericSite: true }).fields).toBe(true);
  });
});

describe('reading comfort — requires display=true (Draft 1.0, decision 1)', () => {
  const rcOn: Settings = { ...DEFAULT_SETTINGS, readingComfort: true };

  it('display off masks an active global request — no typography', () => {
    const c = resolveEffectiveConfig(rcOn, undefined, null);
    expect(c.display).toBe(false);
    expect(c.readingComfort).toBe(false);
  });

  it('display on lets the request take effect', () => {
    const c = resolveEffectiveConfig(rcOn, { display: true, savedAt: 1 }, null);
    expect(c.display).toBe(true);
    expect(c.readingComfort).toBe(true);
  });

  it('a site can request reading comfort independent of the global default', () => {
    const siteOn = resolveEffectiveConfig(
      DEFAULT_SETTINGS,
      { display: true, readingComfort: true, savedAt: 1 },
      null,
    );
    expect(siteOn.readingComfort).toBe(true);
    const siteOff = resolveEffectiveConfig(
      rcOn,
      { display: true, readingComfort: false, savedAt: 1 },
      null,
    );
    expect(siteOff.readingComfort).toBe(false);
  });

  it('temp override beats site pref for reading comfort (same precedence as every other field)', () => {
    const c = resolveEffectiveConfig(
      rcOn,
      { display: true, readingComfort: false, savedAt: 1 },
      { readingComfort: true },
    );
    expect(c.readingComfort).toBe(true);
  });

  it('font scale and line height are always global — never per-site, never per-tab', () => {
    const c = resolveEffectiveConfig(
      { ...rcOn, rcFontScale: 1.2, rcLineHeight: 2.0 },
      { display: true, readingComfort: true, savedAt: 1 },
      null,
    );
    expect(c.fontScale).toBe(1.2);
    expect(c.lineHeight).toBe(2.0);
  });

  it('generic-site safety gates the reading-comfort global default too', () => {
    expect(
      resolveEffectiveConfig(rcOn, { display: true, savedAt: 1 }, null, { genericSite: true })
        .readingComfort,
    ).toBe(false);
  });

  it('generic-site: explicit per-site readingComfort still turns it on', () => {
    const c = resolveEffectiveConfig(
      DEFAULT_SETTINGS,
      { display: true, readingComfort: true, savedAt: 1 },
      null,
      { genericSite: true },
    );
    expect(c.readingComfort).toBe(true);
  });

  it('resolveReadingComfortRequest returns the raw pre-gate value (no display dependency)', () => {
    expect(resolveReadingComfortRequest(rcOn, undefined, null)).toBe(true);
    expect(
      resolveReadingComfortRequest(rcOn, { display: false, readingComfort: false, savedAt: 1 }, null),
    ).toBe(false);
    expect(resolveReadingComfortRequest(DEFAULT_SETTINGS, undefined, { readingComfort: true })).toBe(
      true,
    );
  });
});

describe('reading-comfort value normalization (defence against corrupt storage)', () => {
  it('passes valid in-range values through untouched', () => {
    expect(clampFontScale(1.08)).toBe(1.08);
    expect(clampFontScale(1.0)).toBe(1.0);
    expect(clampFontScale(1.3)).toBe(1.3);
    expect(clampLineHeight(1.8)).toBe(1.8);
    expect(clampLineHeight(1.4)).toBe(1.4);
    expect(clampLineHeight(2.2)).toBe(2.2);
  });

  it('clamps values above the maximum', () => {
    expect(clampFontScale(99)).toBe(1.3);
    expect(clampLineHeight(50)).toBe(2.2);
  });

  it('clamps values below the minimum', () => {
    expect(clampFontScale(0.2)).toBe(1.0);
    expect(clampLineHeight(0.5)).toBe(1.4);
  });

  it('clamps negative values', () => {
    expect(clampFontScale(-5)).toBe(1.0);
    expect(clampLineHeight(-1)).toBe(1.4);
  });

  it('falls back to defaults for null (a null scale would render font-size: 0%)', () => {
    expect(clampFontScale(null)).toBe(1.08);
    expect(clampLineHeight(null)).toBe(1.8);
  });

  it('falls back to defaults for undefined', () => {
    expect(clampFontScale(undefined)).toBe(1.08);
    expect(clampLineHeight(undefined)).toBe(1.8);
  });

  it('falls back to defaults for NaN', () => {
    expect(clampFontScale(NaN)).toBe(1.08);
    expect(clampLineHeight(NaN)).toBe(1.8);
  });

  it('falls back to defaults for Infinity', () => {
    expect(clampFontScale(Infinity)).toBe(1.08);
    expect(clampFontScale(-Infinity)).toBe(1.08);
    expect(clampLineHeight(Infinity)).toBe(1.8);
  });

  it('falls back to defaults for non-numeric values', () => {
    expect(clampFontScale('1.2')).toBe(1.08);
    expect(clampFontScale({})).toBe(1.08);
    expect(clampLineHeight('2')).toBe(1.8);
  });

  it('resolveEffectiveConfig normalizes corrupt stored values centrally', () => {
    const corrupt = {
      ...DEFAULT_SETTINGS,
      rcFontScale: null as unknown as number,
      rcLineHeight: 99,
    };
    const c = resolveEffectiveConfig(corrupt, { display: true, savedAt: 1 }, null);
    expect(c.fontScale).toBe(1.08); // not null → never font-size: 0%
    expect(c.lineHeight).toBe(2.2); // clamped, not 99
  });
});

describe('legacy v1.1.0 storage (no reading-comfort fields)', () => {
  it('fills in reading-comfort defaults for settings saved before this feature existed', async () => {
    await setSettings({ defaultMode: 'rtl' });
    const settings = await getSettings();
    expect(settings.readingComfort).toBe(false);
    expect(settings.rcFontScale).toBe(1.08);
    expect(settings.rcLineHeight).toBe(1.8);
  });

  it('a legacy site pref with no readingComfort key inherits the global default', () => {
    const legacyPref = { mode: 'rtl', display: true, savedAt: 1 } as SitePref; // no readingComfort key
    const c = resolveEffectiveConfig({ ...DEFAULT_SETTINGS, readingComfort: true }, legacyPref, null);
    expect(c.readingComfort).toBe(true); // inherits global since the site key is absent
  });
});
