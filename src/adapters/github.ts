/**
 * GitHub adapter (github.com + subdomains such as gist.github.com).
 *
 * The primary mixed-direction technical-text case. All selectors below were
 * verified against the LIVE GitHub DOM on 2026-07-15 (logged-in inspection of
 * issues, PR conversations, discussions, releases list, the new-issue form,
 * a /releases/new form, and a repository About dialog):
 *
 * Fields
 * - `textarea.js-comment-field` — the shared class of every legacy Rails
 *   markdown editor: PR comment box (#new_comment_field, name="comment[body]"),
 *   release body (#release_body, name="release[body]"), issue/PR edit forms.
 * - `textarea[aria-label="Markdown value"]` — the new React markdown editor
 *   (new-issue form, new issues UI comment composer). aria-label is GitHub's
 *   own accessibility name; UI is English-only at inspection time.
 * - `div[class*="MarkdownEditor"] textarea` — same editor via its CSS-module
 *   prefix, as a locale-independent backup hook.
 * - `#repo_description` — repository About description input (plain text).
 * - `input[aria-label="Add a title"]` — new-issue title input.
 *
 * Display
 * - `.markdown-body` — release notes, issue bodies/comments (the new React
 *   UI also tags them data-testid="markdown-body"), PR/discussion comments
 *   (.comment-body.markdown-body), and markdown previews (.js-preview-body
 *   carries the same class).
 *
 * Host behavior verified: GitHub sets dir="auto" on P, H1–H6, UL, OL, DIV inside
 * markdown, but NOT on LI — mixed Arabic lists resolve from the list's first
 * item. The engine's per-leaf-block pass fills that gap; host dir="auto" is
 * treated as non-meaningful by hasExplicitHostDir, so overridesHostDir stays
 * false and any real rtl/ltr the host (or markdown author) sets is respected.
 *
 * Exclusions: code/diff surfaces beyond the global protected list.
 */

import { matchesHost, type SiteAdapter } from './types';

export const githubAdapter: SiteAdapter = {
  id: 'github',
  supported: true,
  matches: (host) => matchesHost(host, ['github.com']),
  fieldSelectors: [
    'textarea.js-comment-field',
    'textarea[aria-label="Markdown value"]',
    'div[class*="MarkdownEditor"] textarea',
    '#repo_description',
    'input[aria-label="Add a title"]',
  ],
  displaySelectors: ['.markdown-body'],
  excludeSelectors: [
    '.blob-wrapper', // file view
    '.blob-code',
    '.diff-table', // PR diffs
    '.js-file-line-container',
    '.react-blob-view',
    '.zeroclipboard-container',
  ],
  overridesHostDir: false,
  // documentElement is never replaced by SPA hydration (body can be —
  // verified live on chatgpt.com), so observe it for reliable coverage.
  observeTargets: (doc) => [doc.documentElement],
};
