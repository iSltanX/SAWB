/**
 * ChatGPT adapter (chatgpt.com, chat.openai.com) — the reference adapter.
 *
 * Fields: the ProseMirror composer (`#prompt-textarea` is the contenteditable
 * root in the current UI) plus any plain textarea fallback in the form.
 * Display: assistant markdown bodies and user message bubbles.
 */

import { matchesHost, type SiteAdapter } from './types';

export const chatgptAdapter: SiteAdapter = {
  id: 'chatgpt',
  supported: true,
  matches: (host) => matchesHost(host, ['chatgpt.com', 'chat.openai.com']),
  fieldSelectors: [
    '#prompt-textarea',
    'div.ProseMirror[contenteditable="true"]',
    'main form textarea',
  ],
  displaySelectors: [
    '[data-message-author-role] .markdown',
    '[data-message-author-role] .whitespace-pre-wrap',
  ],
  excludeSelectors: [
    '[data-testid*="code"]',
    '.katex-html',
  ],
  // ChatGPT is known to render Arabic/mixed content with the page's LTR
  // direction; its message surfaces are approved for host-dir override.
  overridesHostDir: true,
  observeTargets: (doc) => (doc.body ? [doc.body] : []),
};
