/**
 * Google AI Studio adapter (aistudio.google.com).
 *
 * Verified against the LIVE logged-in DOM on 2026-07-15:
 * - Composer: a plain <textarea aria-label="Enter a prompt"> inside the
 *   <ms-prompt-box> Angular component (cdk-textarea-autosize).
 * - Chat turns (`ms-chat-turn`, `.turn-content`) exist only inside a
 *   conversation; verified during the live engine run (see final report).
 * - AI Studio embeds code editors for structured output — covered by the
 *   global protected list (.cm-editor / .monaco-editor).
 */

import { matchesHost, type SiteAdapter } from './types';

export const aistudioAdapter: SiteAdapter = {
  id: 'aistudio',
  supported: true,
  matches: (host) => matchesHost(host, ['aistudio.google.com']),
  fieldSelectors: ['ms-prompt-box textarea', 'textarea[aria-label="Enter a prompt"]'],
  displaySelectors: ['ms-chat-turn'],
  excludeSelectors: [],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
