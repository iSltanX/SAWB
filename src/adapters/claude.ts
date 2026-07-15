/**
 * Claude adapter (claude.ai).
 *
 * STATUS (2026-07-15): fields AND displayed content both live-verified.
 *
 * Fields: the composer is a contenteditable root, caught by universal
 * editable detection below and confirmed live earlier in this project.
 *
 * Display: real DOM inspection of an authenticated conversation (supplied by
 * the project owner, then independently confirmed live) found:
 *
 * - Feed root: `[role="feed"][aria-label="Chat messages"]` — every message
 *   lives inside this landmark; nothing outside it (sidebar `<nav
 *   aria-label="Sidebar">`, header, composer) is ever a descendant, so
 *   scoping the display selector through this ancestor is sufficient on its
 *   own to keep SAWB out of navigation and controls (requirement 7).
 * - Message containers: `[role="article"][aria-label^="Message "]` — both
 *   user and assistant turns use this pattern (`aria-label="Message 1 of 2"`,
 *   `"Message 2 of 2"`, …). No separate selector is needed to cover "user
 *   messages" — same role, same attribute shape.
 * - Assistant turns additionally carry an invisible `h2.sr-only` whose text
 *   starts with "Claude responded:" — this is an accessibility label, not
 *   visible content; it is caught by the generic `.sr-only` exclusion below
 *   (Claude also uses `.sr-only` for a hidden "Use the up and down arrow
 *   keys…" hint paragraph inside the feed, same treatment).
 * - No element in the conversation carries a real `dir` attribute
 *   (`dirElements: []` in the inspection dump), so there is no host
 *   direction to respect or override — `overridesHostDir` stays false and
 *   every visible block resolves purely from its own text.
 * - Action-bar controls (edit/copy/read-aloud/retry/share) and the model
 *   selector expose stable `data-testid` hooks (`action-bar-*`,
 *   `model-selector-dropdown`) and are excluded by prefix so any future
 *   control sharing the same naming convention is covered without a
 *   selector update. `role="status"` elements inside the feed were checked
 *   live and are all `.sr-only` ARIA-live announcer duplicates (e.g. "تم
 *   البحث في الويب" spoken to screen readers) — already caught by `.sr-only`,
 *   kept here too as defense in depth.
 *
 * Two exclude entries were tried and REJECTED after live verification
 * because they silently blocked real message content, not just controls:
 * - `button`: Claude wraps the ENTIRE user-message bubble in a `<button>`
 *   (click-to-edit UX) — a blanket exclude made every user message invisible
 *   to the engine while assistant messages worked fine. The action bar is
 *   already fully covered by `[role="toolbar"]` (its container) and the
 *   `action-bar-*` testid prefix (each control), so no `button` exclude is
 *   needed at all.
 * - `[data-testid="file-thumbnail"]`: on a message with a large pasted-text
 *   attachment, this testid wraps the ENTIRE attachment card (300+ chars of
 *   real Arabic text, not an image) — excluding it hid that content. A
 *   genuine image-only thumbnail has no text leaf blocks to begin with, so
 *   the engine's own "skip empty text" rule already leaves real thumbnails
 *   alone without needing an exclude entry.
 * If a future control turns out to share a name with real content, verify
 * against a live conversation before trusting the assumption — do not
 * exclude by inferred purpose alone.
 *
 * IMPORTANT: `excludeSelectors` is shared by the engine between field AND
 * display application (see core/engine.ts) — it is NOT display-only. An
 * earlier draft of this adapter excluded `[contenteditable="true"]` etc. to
 * keep an in-place message-edit textbox out of the display pass, which
 * silently broke the composer itself (same selector matches it) and was
 * caught by this adapter's own test suite before shipping. Do not add
 * contenteditable/textarea/input to excludeSelectors here for that reason —
 * the composer is structurally outside the feed root, so it was never at
 * risk from the display pass in the first place.
 *
 * The engine applies direction per leaf text block (p, li, h1–h6,
 * blockquote, td/th for tables — see core/apply.ts leafBlocks) inside each
 * matched article, so assistant and user messages, streamed paragraphs, and
 * newly inserted blocks are all covered without extra adapter code; code
 * blocks/inline code/KaTeX are already protected globally (core/classify.ts).
 */

import { matchesHost, type SiteAdapter } from './types';

const FEED = '[role="feed"][aria-label="Chat messages"]';
const MESSAGE = `${FEED} [role="article"][aria-label^="Message "]`;

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
  displaySelectors: [MESSAGE],
  excludeSelectors: [
    '.sr-only', // accessibility-only text: h2.sr-only "Claude responded:", the arrow-key hint paragraph, sr-only aria-live status announcements, etc.
    '[role="toolbar"]', // per-message action bar (copy/edit/retry/read-aloud/share)
    '[role="note"]',
    '[role="status"]', // confirmed live: always .sr-only ARIA-live duplicates, never primary content
    'nav', // sidebar — outside the feed anyway, kept as defense in depth
    '[data-testid="model-selector-dropdown"]',
    '[data-testid="voice-audio-visualizer"]',
    '[data-testid^="action-bar-"]',
    '[data-testid^="wiggle-controls"]',
  ],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
