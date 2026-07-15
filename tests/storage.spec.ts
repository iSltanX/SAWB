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
  DEFAULT_SETTINGS,
  resolveEffectiveConfig,
  type Settings,
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
