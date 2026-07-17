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

  /**
   * «راحة القراءة» — global default: whether reading-comfort typography
   * (font size + line height on RTL-classified display blocks) is on for
   * sites with no explicit per-site override. Independent of applyToDisplay,
   * but only ever effective when display is also active (see
   * resolveEffectiveConfig).
   */
  readingComfort: boolean;
  /** Global font-size multiplier for RTL display blocks (e.g. 1.08 → 108%). */
  rcFontScale: number;
  /** Global unitless line-height for RTL display blocks (e.g. 1.8). */
  rcLineHeight: number;
}

export interface SitePref {
  mode?: Mode;
  fields?: boolean;
  display?: boolean;
  disabled?: boolean;

  /**
   * Per-site override of the reading-comfort ON/OFF state only. There is no
   * per-site font size / line height — those values are always global
   * (approved requirement 3).
   */
  readingComfort?: boolean;

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

  /**
   * Whether reading-comfort typography is requested AND permitted by the
   * display gate (`display && rcRequested`). It does NOT account for
   * `enabled`: a disabled site reports `enabled: false` and the engine stops
   * on that alone, so this field keeps reporting the configured intent (the
   * same way `fields`/`display` do) rather than being falsified.
   */
  readingComfort: boolean;
  /** Global font-size multiplier, from Settings.rcFontScale, clamped to range. */
  fontScale: number;
  /** Global line-height, from Settings.rcLineHeight, clamped to range. */
  lineHeight: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  defaultMode: 'auto',
  applyToFields: true,
  applyToDisplay: false,
  showIndicator: true,
  theme: 'system',

  readingComfort: false,
  rcFontScale: 1.08,
  rcLineHeight: 1.8,
};

export const SCHEMA_VERSION = 1;

/**
 * Approved reading-comfort ranges (spec §7). Deliberately narrow: a wide range
 * breaks fixed-height cards, table alignment and scroll position far more
 * readily than it helps.
 */
export const RC_FONT_SCALE_MIN = 1.0;
export const RC_FONT_SCALE_MAX = 1.3;
export const RC_LINE_HEIGHT_MIN = 1.4;
export const RC_LINE_HEIGHT_MAX = 2.2;

/**
 * Coerce one reading-comfort value into its approved range.
 *
 * Anything not a finite number — null, NaN, Infinity, a string that slipped
 * through, a key corrupted in storage — falls back to the default rather than
 * reaching the DOM (a null scale would otherwise render `font-size: 0%` and
 * make the text invisible). Finite numbers outside the range are clamped.
 */
function clampRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function clampFontScale(value: unknown): number {
  return clampRange(value, RC_FONT_SCALE_MIN, RC_FONT_SCALE_MAX, DEFAULT_SETTINGS.rcFontScale);
}

export function clampLineHeight(value: unknown): number {
  return clampRange(value, RC_LINE_HEIGHT_MIN, RC_LINE_HEIGHT_MAX, DEFAULT_SETTINGS.rcLineHeight);
}

/** Per-tab, in-memory override (never persisted) — Phase 2 review, item 6. */
export interface TempOverride {
  mode?: Mode;
  fields?: boolean;
  display?: boolean;
  disabled?: boolean;
  readingComfort?: boolean;
}

export interface ResolveOptions {
  /**
   * Generic-mode safety: on unsupported (generic-adapter) sites, displayed-
   * text processing stays off unless the user enabled it for that site
   * explicitly (site pref or tab override) — the global display default does
   * not apply there.
   */
  genericSite?: boolean;
}

/**
 * The raw «راحة القراءة» request before the display-gate (approved decision:
 * reading comfort requires display=true — see resolveEffectiveConfig). Same
 * precedence as every other per-tab/per-site/global field: temp ← site ←
 * global, with the generic-site display-style safety default.
 *
 * Exported separately (not just inlined in resolveEffectiveConfig) so a
 * caller that needs the *stored intent* — independent of whether display
 * currently masks it — can read it without re-deriving the priority chain
 * itself. The popup's quick toggle needs exactly this: flipping the raw
 * request, never the display-gated EffectiveConfig.readingComfort.
 */
export function resolveReadingComfortRequest(
  settings: Settings,
  site: SitePref | undefined,
  temp: TempOverride | null,
  opts: ResolveOptions = {},
): boolean {
  const rcDefault = opts.genericSite ? false : settings.readingComfort;
  return temp?.readingComfort ?? site?.readingComfort ?? rcDefault;
}

export function resolveEffectiveConfig(
  settings: Settings,
  site: SitePref | undefined,
  temp: TempOverride | null,
  opts: ResolveOptions = {},
): EffectiveConfig {
  // Persistent site disable (popup) and temporary disable (shortcut) are
  // strictly separate: persistent always wins; temporary is additive-only —
  // it can never re-enable a persistently disabled site.
  const disabled = (site?.disabled ?? false) || (temp?.disabled ?? false);
  const displayDefault = opts.genericSite ? false : settings.applyToDisplay;
  const display = temp?.display ?? site?.display ?? displayDefault;
  const rcRequested = resolveReadingComfortRequest(settings, site, temp, opts);
  return {
    enabled: settings.enabled && !disabled,
    mode: temp?.mode ?? site?.mode ?? settings.defaultMode,
    fields: temp?.fields ?? site?.fields ?? settings.applyToFields,
    display,
    showIndicator: settings.showIndicator,

    // Reading comfort builds on displayed-text processing: with display off
    // there is no mode-resolved block to typeset, so the request is masked
    // rather than acted on. One execution path, one observer, one direction
    // classification — no independent typography pass to keep in sync.
    readingComfort: display && rcRequested,
    // Values are always global — never per-site, never per-tab — and are
    // normalized here, the single point every consumer reads them through, so
    // a corrupt stored value can never reach the DOM.
    fontScale: clampFontScale(settings.rcFontScale),
    lineHeight: clampLineHeight(settings.rcLineHeight),
  };
}
