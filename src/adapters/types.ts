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
  /** Roots of displayed content (message bodies, article bodies…). */
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
