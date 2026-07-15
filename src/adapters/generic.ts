/**
 * Generic fallback adapter — the safe mode for unsupported websites.
 *
 * Safety rules (approved requirement 9):
 * - Only clearly editable fields are processed.
 * - Navigation, menus, toolbars, headers/footers and code editors are excluded.
 * - Displayed-text selectors are conservative (article/main) and the feature
 *   is off by default globally; the user must enable it explicitly.
 * - Never touches <html> or <body>.
 */

import type { SiteAdapter } from './types';

export const genericAdapter: SiteAdapter = {
  id: 'generic',
  supported: false,
  matches: () => true,
  fieldSelectors: [
    'input[type="text"]',
    'input[type="search"]',
    'input:not([type])',
    'textarea',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[contenteditable="plaintext-only"]',
  ],
  displaySelectors: ['article', 'main', '[role="main"]'],
  excludeSelectors: [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="menu"]',
    '[role="menubar"]',
    '[role="toolbar"]',
    '[role="tablist"]',
    '[role="grid"]',
    '[role="tree"]',
  ],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
