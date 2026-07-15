/**
 * Substack adapter (*.substack.com).
 *
 * Verified against the LIVE public DOM on 2026-07-15 (on.substack.com post):
 * - Display: `article .available-content` wraps the post body, whose inner
 *   container is `.body.markup`. Substack itself sets dir="auto" on some
 *   headings/divs but not on paragraphs or list items — the per-leaf-block
 *   pass fills the gap; real rtl/ltr host values are respected.
 *
 * LIMITATIONS (documented):
 * - The TipTap post editor and the reader comment box require a logged-in
 *   Substack session that was not available; fields therefore use universal
 *   editable detection (TipTap is a ProseMirror contenteditable, comment
 *   boxes are textareas — both are caught by construction).
 * - Publications on custom domains are not identifiable as Substack by
 *   hostname; they are served by the generic adapter.
 */

import { matchesHost, type SiteAdapter } from './types';

export const substackAdapter: SiteAdapter = {
  id: 'substack',
  supported: true,
  matches: (host) => matchesHost(host, ['substack.com']),
  fieldSelectors: [
    '[contenteditable="true"]',
    '[contenteditable=""]',
    'textarea',
    'input[type="text"]',
    'input:not([type])',
  ],
  displaySelectors: ['article .available-content', '.body.markup'],
  excludeSelectors: [],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
