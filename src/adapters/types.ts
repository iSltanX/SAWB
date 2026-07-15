/**
 * Site adapter contract.
 *
 * Adapters are the ONLY place site-specific selectors may live. The shared
 * engine consumes this interface generically; changing one adapter cannot
 * affect another site.
 */

export interface SiteAdapter {
  id: string;
  /** Official support → «موقع مدعوم ✓» badge; otherwise «وضع عام». */
  supported: boolean;
  matches(host: string): boolean;
  /** Roots of writing fields (inputs, textareas, rich-editor roots). */
  fieldSelectors: string[];
  /**
   * Roots of displayed content (message bodies, article bodies…). Leave
   * empty when this site's display DOM has not been live-verified yet — an
   * adapter must never guess display selectors from memory. An empty array
   * downgrades the popup's badge to "partial support" instead of the full
   * «موقع مدعوم ✓» claim (see `supportLevel`).
   */
  displaySelectors: string[];
  /** Site-specific exclusions, merged with the global protected list. */
  excludeSelectors: string[];
  /**
   * Requirement 7: true when this site's display surfaces are known to render
   * RTL text incorrectly, letting auto mode override host-set directions.
   */
  overridesHostDir: boolean;
  observeTargets(doc: Document): Node[];
}

/** Exact host or any subdomain of it. */
export function matchesHost(host: string, domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => h === d || h.endsWith('.' + d));
}

export type SupportLevel = 'full' | 'partial' | 'generic';

/**
 * "full": a dedicated adapter with verified fields AND verified display.
 * "partial": a dedicated adapter whose display selectors are not yet
 * live-verified (displaySelectors is empty) — fields still work, but
 * «النصوص المعروضة» is a no-op there until an adapter update fills it in.
 * "generic": no dedicated adapter (the safe fallback handles the site).
 */
export function supportLevel(adapter: SiteAdapter): SupportLevel {
  if (!adapter.supported) return 'generic';
  return adapter.displaySelectors.length > 0 ? 'full' : 'partial';
}
