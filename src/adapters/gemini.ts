/**
 * Gemini adapter (gemini.google.com).
 *
 * Verified against the LIVE logged-in DOM on 2026-07-15:
 * - Composer: `rich-textarea .ql-editor[contenteditable="true"]` — a Quill
 *   editor inside Gemini's <rich-textarea> Angular component.
 * - `.ql-clipboard` is Quill's hidden contenteditable clipboard buffer and
 *   must never be touched (excluded).
 * - Response containers exist only inside a conversation: `message-content`
 *   verified live in a real conversation (2026-07-15). Gemini sets dir="rtl"
 *   itself on `.query-text` for Arabic queries — respectHostDir leaves those
 *   untouched.
 */

import { matchesHost, type SiteAdapter } from './types';

export const geminiAdapter: SiteAdapter = {
  id: 'gemini',
  supported: true,
  matches: (host) => matchesHost(host, ['gemini.google.com']),
  fieldSelectors: ['rich-textarea .ql-editor[contenteditable="true"]'],
  displaySelectors: ['message-content'],
  excludeSelectors: ['.ql-clipboard'],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
