# صَوْب (SAWB)

إضافة متصفح تضبط اتجاه الكتابة تلقائيًا بين RTL وLTR داخل حقول النص والمحتوى
المعروض، خصوصًا في منصات الذكاء الاصطناعي والمنصات التحريرية. تعمل محليًا
بالكامل — بلا حساب، بلا خادم، بلا تتبّع.

A browser extension that automatically controls text direction (RTL/LTR) in
writing fields and displayed content — built Arabic-first for AI platforms and
editorial sites. Fully local: no account, no server, no tracking.

**Version 1.0.0 · MIT License**

---

## Privacy summary

SAWB never sends, records, or stores your text. It has **no network access at
runtime**: no analytics, no telemetry, no backend, no remote code, no external
fonts (Cairo and Almarai are bundled inside the extension). The only stored
data is your own settings and per-site preferences, kept in
`chrome.storage.local` on your machine. Uninstalling removes everything.

## Supported websites

| Site | Writing fields | Displayed text |
|---|---|---|
| ChatGPT (chatgpt.com, chat.openai.com) | ✅ | ✅ |
| GitHub (github.com — issues, PRs, discussions, releases, markdown editors/previews, repo description) | ✅ | ✅ |
| Gemini (gemini.google.com) | ✅ | ✅ |
| Google AI Studio (aistudio.google.com) | ✅ | ✅ |
| Claude (claude.ai) | ✅ | ⏳ pending live DOM verification |
| Substack (\*.substack.com) | ✅ | ✅ (post bodies) |
| Any other website | ✅ generic safe mode | opt-in per site |

Generic mode («وضع عام») processes writing fields only and never scans page
content unless you explicitly enable displayed-text processing for that site.

## Supported browsers

Chrome, Edge, Brave, Arc, and other Chromium browsers (Manifest V3). Firefox
and Safari ports are prepared but not shipped — see
[docs/BROWSER-READINESS.md](docs/BROWSER-READINESS.md).

## Install for testing (unpacked, Chromium)

1. `npm install && npm run build`
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`;
   in Arc: `arc://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `dist/` folder.

Store packaging: `npm run package` → `dist-packages/sawb-chromium-v1.0.0.zip`
(runtime files only; contents listed in `dist-packages/PACKAGE-CONTENTS.md`).

## Permissions

- **`storage`** — saves your settings and per-site preferences locally.
- **Content script on all sites** — required so direction control works on
  any website (the generic safe mode). SAWB reads nothing and phones nothing
  home; it only sets the `dir` attribute (and `unicode-bidi` isolation on
  inline technical elements) and can restore every change.

That is the complete list. No `tabs`, no `activeTab`, no `scripting`.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| تبديل الاتجاه إلى RTL | Alt+Shift+R |
| تبديل الاتجاه إلى LTR | Alt+Shift+L |
| تفعيل الوضع التلقائي | Alt+Shift+A |
| تعطيل الإضافة مؤقتًا (Tab only, resets on reload) | Alt+Shift+D |

Shortcuts apply a temporary, tab-only override. Persistent per-site control
lives in the popup.

## Architecture

```
src/
├── core/        direction engine (no site-specific code)
│   ├── detect.ts     first-meaningful-strong-segment detection
│   ├── classify.ts   technical tokens + protected elements
│   ├── apply.ts      dir-attribute application + exact restore
│   ├── observe.ts    batched MutationObserver (background-tab safe)
│   └── engine.ts     lifecycle, host-fight surrender guard
├── adapters/    one file per site + generic fallback (selectors live ONLY here)
├── platform/    storage schema, browser shim, typed messages
├── content/     bootstrap + per-tab temp overrides + direction indicator
├── background/  service worker (defaults, keyboard commands)
└── ui/          popup + settings (design tokens from the visual identity)
```

Key invariants: SAWB never mutates text content, never inserts directional
control characters, and can always restore the exact original state (snapshot
per element). Protected content — code blocks, inline code, JSON, math
(KaTeX/MathJax), syntax/code editors, numeric tables — is never touched;
inline technical elements are LTR-isolated at the element level.

## Adapter maintenance notes

Each adapter declares: `matches(host)`, `fieldSelectors`, `displaySelectors`,
`excludeSelectors`, `overridesHostDir`, `observeTargets`. Rules learned from
live verification (2026-07-15):

- Prefer semantic hooks (`aria-label`, `name=`, element tags like
  `rich-textarea`, `ms-chat-turn`) over generated class names.
- Observe `documentElement`, not `body` — SPA hydration can replace body.
- Never write `dir` on blocks INSIDE a live rich editor (ProseMirror recreates
  them); the engine applies root-level `dir` to editable roots for exactly
  this reason. Adapters only need to point at the editor root.
- Host `dir="auto"` is treated as refinable; host `rtl`/`ltr` is respected
  unless `overridesHostDir` is set for a surface known to render Arabic wrong.
- A change to one adapter cannot affect another site; each has its own fixture
  test under `tests/adapters/`.

## Known limitations

- **claude.ai displayed text**: the authenticated message DOM could not be
  inspected (login + captcha); display processing ships disabled there until
  verified. Writing fields work via universal editable detection.
- **Substack custom domains** are not identifiable as Substack and fall back
  to generic mode; the Substack post editor and comment box were not
  live-inspected (login required) and rely on universal editable detection.
- The in-page direction indicator uses the system Arabic font on host pages
  (bundling Cairo into every page would require web-accessible resources).
- CodeMirror-based editors are intentionally left untouched (protected).
- GitHub's new React editors are matched partly via `aria-label="Markdown
  value"`, which assumes GitHub's English UI (GitHub does not localize it at
  the time of verification).

## License & attribution

MIT (see [LICENSE](LICENSE)). Bundled third-party assets — Cairo and Almarai
fonts (SIL OFL 1.1), lucide icon shapes (ISC) — are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), which also ships inside the
extension package as required by the OFL.

The visual identity (logo, wordmark, colors, typography, components) comes
from the project's design package and is reproduced exactly; see
`design-reference/` (not part of the built extension).
