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

  it('site disable wins unless temp re-enables', () => {
    expect(resolveEffectiveConfig(settings, { disabled: true, savedAt: 1 }, null).enabled).toBe(false);
    expect(
      resolveEffectiveConfig(settings, { disabled: true, savedAt: 1 }, { disabled: false }).enabled,
    ).toBe(true);
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
