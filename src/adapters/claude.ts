/**
 * Claude adapter (claude.ai).
 *
 * STATUS (2026-07-15, updated after user correction): fields are CONFIRMED
 * working live (composer receives root-level dir correctly). Displayed
 * response content is CONFIRMED BROKEN live — Arabic assistant/user messages
 * stay LTR even with manual RTL + «النصوص المعروضة» on — because
 * displaySelectors is still empty below, so the engine has no display root to
 * apply to on claude.ai. This is the root cause the user reported.
 *
 * BLOCKER: the tool that gave live, authenticated DOM access to claude.ai
 * (an in-browser inspection channel tied to the user's real Chrome session)
 * disconnected mid-project and could not be reconnected in this environment.
 * The approved rule is explicit — never invent selectors from memory, and
 * document rather than pretend a surface is verified — so displaySelectors
 * stays EMPTY here rather than guessing at container class names.
 *
 * Until real selectors are supplied (see the diagnostic script requested in
 * the project report), this adapter reports `supportLevel: "partial"` to the
 * popup (src/adapters/types.ts → supportLevel()), which shows a
 * "دعم جزئي — الحقول فقط" badge instead of «موقع مدعوم ✓» — so the UI stops
 * overclaiming display support it cannot yet deliver.
 *
 * - Fields use universal editable detection (a chat composer is by
 *   construction a contenteditable root or a textarea; Claude's composer is
 *   contenteditable, confirmed live). The global protected list keeps
 *   CodeMirror-based artifact editors (.cm-content) untouched.
 * - Display selectors are intentionally EMPTY — filling them with guessed
 *   class names would risk applying `dir` to buttons, action rows, or code
 *   blocks inside an unverified DOM, which the product spec explicitly
 *   forbids. Enabling «النصوص المعروضة» on claude.ai remains a safe no-op
 *   until real selectors are verified.
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
