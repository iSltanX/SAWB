/**
 * Storage layer — `storage.local` only. No sync, no cloud, no telemetry.
 */

import { ext } from './ext';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type Settings,
  type SiteMap,
  type SitePref,
} from './types';

const KEY_SETTINGS = 'settings';
const KEY_SITES = 'sites';
const KEY_SCHEMA = 'schemaVersion';

export async function getSettings(): Promise<Settings> {
  const data = await ext.storage.local.get(KEY_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(data[KEY_SETTINGS] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await ext.storage.local.set({ [KEY_SETTINGS]: next });
  return next;
}

export async function getSites(): Promise<SiteMap> {
  const data = await ext.storage.local.get(KEY_SITES);
  return (data[KEY_SITES] as SiteMap | undefined) ?? {};
}

export async function getSitePref(host: string): Promise<SitePref | undefined> {
  const sites = await getSites();
  return sites[host];
}

export async function saveSitePref(host: string, pref: Omit<SitePref, 'savedAt'>): Promise<void> {
  const sites = await getSites();
  sites[host] = { ...pref, savedAt: Date.now() };
  await ext.storage.local.set({ [KEY_SITES]: sites });
}

/** Deleting a site preference and resetting it to defaults are the same operation. */
export async function deleteSitePref(host: string): Promise<void> {
  const sites = await getSites();
  if (host in sites) {
    delete sites[host];
    await ext.storage.local.set({ [KEY_SITES]: sites });
  }
}

export async function initStorage(): Promise<void> {
  const data = await ext.storage.local.get(KEY_SCHEMA);
  if (data[KEY_SCHEMA] !== SCHEMA_VERSION) {
    // Future migrations branch on the stored version here.
    await ext.storage.local.set({ [KEY_SCHEMA]: SCHEMA_VERSION });
  }
}

export interface StorageSnapshot {
  settings: Settings;
  sites: SiteMap;
}

export async function getSnapshot(): Promise<StorageSnapshot> {
  const [settings, sites] = await Promise.all([getSettings(), getSites()]);
  return { settings, sites };
}

/** Subscribe to any change in settings or site preferences. */
export function onStorageChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && (KEY_SETTINGS in changes || KEY_SITES in changes)) cb();
  };
  ext.storage.onChanged.addListener(listener);
  return () => ext.storage.onChanged.removeListener(listener);
}
