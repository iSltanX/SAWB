/**
 * Claude adapter (claude.ai).
 *
 * LIMITATION (documented, 2026-07-15): claude.ai requires login and gates it
 * behind hCaptcha; the authenticated DOM could not be inspected live in this
 * environment. Per the approved rule — implement only what can be confirmed:
 *
 * - Fields use universal editable detection (a chat composer is by
 *   construction a contenteditable root or a textarea; Claude's composer is
 *   contenteditable). The global protected list keeps CodeMirror-based
 *   artifact editors (.cm-content) untouched.
 * - Display selectors are intentionally EMPTY until the message-container
 *   DOM can be verified live. Enabling «النصوص المعروضة» on claude.ai is a
 *   no-op until then; the limitation is listed in the README.
 */

import { matchesHost, type SiteAdapter } from './types';

export const claudeAdapter: SiteAdapter = {
  id: 'claude',
  supported: true,
  matches: (host) => matchesHost(host, ['claude.ai']),
  fieldSelectors: [
    '[contenteditable="true"]',
    '[contenteditable=""]',
    'textarea',
    'input[type="text"]',
    'input:not([type])',
  ],
  displaySelectors: [],
  excludeSelectors: [],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
