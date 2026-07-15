/** Shared data model — approved storage schema (Phase 2 review, item 5). */

export type Mode = 'auto' | 'rtl' | 'ltr';
export type Theme = 'light' | 'dark' | 'system';
export type Direction = 'rtl' | 'ltr';

export interface Settings {
  enabled: boolean;
  defaultMode: Mode;
  applyToFields: boolean;
  applyToDisplay: boolean;
  showIndicator: boolean;
  theme: Theme;
}

export interface SitePref {
  mode?: Mode;
  fields?: boolean;
  display?: boolean;
  disabled?: boolean;
  savedAt: number;
}

export type SiteMap = Record<string, SitePref>;

/**
 * The configuration a page actually runs with, after merging global settings,
 * a persisted site preference, and any per-tab temporary override.
 */
export interface EffectiveConfig {
  enabled: boolean;
  mode: Mode;
  fields: boolean;
  display: boolean;
  showIndicator: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  defaultMode: 'auto',
  applyToFields: true,
  applyToDisplay: false,
  showIndicator: true,
  theme: 'system',
};

export const SCHEMA_VERSION = 1;

/** Per-tab, in-memory override (never persisted) — Phase 2 review, item 6. */
export interface TempOverride {
  mode?: Mode;
  fields?: boolean;
  display?: boolean;
  disabled?: boolean;
}

export function resolveEffectiveConfig(
  settings: Settings,
  site: SitePref | undefined,
  temp: TempOverride | null,
): EffectiveConfig {
  // Persistent site disable (popup) and temporary disable (shortcut) are
  // strictly separate: persistent always wins; temporary is additive-only —
  // it can never re-enable a persistently disabled site.
  const disabled = (site?.disabled ?? false) || (temp?.disabled ?? false);
  return {
    enabled: settings.enabled && !disabled,
    mode: temp?.mode ?? site?.mode ?? settings.defaultMode,
    fields: temp?.fields ?? site?.fields ?? settings.applyToFields,
    display: temp?.display ?? site?.display ?? settings.applyToDisplay,
    showIndicator: settings.showIndicator,
  };
}
