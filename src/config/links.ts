/**
 * Repository links — the single source of truth for every GitHub URL in the
 * project. Nothing else may hard-code these; import from here.
 */

export const GITHUB_LINKS = {
  /** Sultan's GitHub profile. */
  creator: 'https://github.com/iSltanX',
  /** The SAWB repository. */
  repository: 'https://github.com/iSltanX/SAWB',
  /** Official releases page. */
  releases: 'https://github.com/iSltanX/SAWB-Releases/releases',
} as const;

/**
 * True once the first real GitHub Release exists (since v1.1.0). While
 * false, the «آخر التحديثات» button does not exist anywhere in the UI — no
 * disabled state, no placeholder.
 */
export const RELEASES_PUBLISHED = true;
