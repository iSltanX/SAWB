# Claude.ai adapter — maintenance notes

`src/adapters/claude.ts` has full support (writing fields + displayed
content), verified live on a real, logged-in conversation. The reasoning
behind every selector is in the adapter's header comment, and
`tests/adapters/claude.spec.ts` pins the behavior with a fixture built from
the inspected DOM. This page is for when Claude.ai changes its UI.

## What the adapter depends on

- Feed root `[role="feed"][aria-label="Chat messages"]` — every message lives
  inside it; the sidebar, header and composer never do.
- Message containers `[role="article"][aria-label^="Message "]` — the same
  pattern for user and assistant turns.
- Both selectors match English `aria-label` text. If Claude.ai renames or
  localizes these labels, displayed content silently stops being processed.
- Controls are excluded through `excludeSelectors` (`.sr-only`,
  `[role="toolbar"]`, `[role="status"]`, and the `action-bar-*` /
  `model-selector-dropdown` / `voice-audio-visualizer` / `wiggle-controls*`
  `data-testid` hooks). `excludeSelectors` is shared by the field and display
  passes, so never add `contenteditable`, `textarea` or `input` there — it
  would disable the composer.

## Two excludes that were tried and rejected

- `button`: Claude wraps the whole user-message bubble in a `<button>`
  (click-to-edit), so this exclude hid every user message. The action bar is
  already covered by `[role="toolbar"]` and `action-bar-*`.
- `[data-testid="file-thumbnail"]`: on a pasted-text attachment it wraps the
  whole attachment card, including real Arabic text. Image-only thumbnails have
  no text blocks, so the engine skips them without an exclude.

## Re-verifying after a redesign

1. Open a real conversation that has Arabic user and assistant messages, and
   run the script below in the DevTools Console.
2. Update `displaySelectors` / `excludeSelectors` from what the page actually
   contains, update the fixture in `tests/adapters/claude.spec.ts`, then run
   `npm run check`.
3. If the display DOM cannot be verified live, leave `displaySelectors`
   empty: the popup then reports partial support instead of overclaiming
   (see `supportLevel` in `src/adapters/types.ts`).
4. Check on the live page: Arabic messages resolve RTL in auto mode; the
   action bar, sidebar, sr-only labels and model selector are untouched;
   switching RTL/LTR/auto updates existing messages; a newly streamed reply
   gets direction; disabling restores the page exactly.

## Diagnostic script

```js
(() => {
  const pick = (el, depth = 6) => {
    const chain = [];
    let n = el;
    for (let i = 0; i < depth && n; i++) {
      chain.push({
        tag: n.tagName?.toLowerCase(),
        cls: typeof n.className === 'string' ? n.className.slice(0, 80) : null,
        testid: n.getAttribute?.('data-testid') ?? null,
        role: n.getAttribute?.('role') ?? null,
      });
      n = n.parentElement;
    }
    return chain;
  };
  const candidates = {
    anyParagraph: document.querySelector('main p'),
    anyListItem: document.querySelector('main li'),
    anyHeading: document.querySelector('main h1, main h2, main h3'),
    anyCodeBlock: document.querySelector('main pre'),
    anyInlineCode: document.querySelector('main code:not(pre code)'),
    anyTestIdEl: document.querySelector('main [data-testid]'),
  };
  const out = {};
  for (const [key, el] of Object.entries(candidates)) {
    out[key] = el ? { text: (el.textContent || '').slice(0, 40), chain: pick(el) } : null;
  }
  out.allTestIds = [...new Set(
    Array.from(document.querySelectorAll('main [data-testid]')).map((e) => e.getAttribute('data-testid')),
  )].slice(0, 40);
  out.dirAttrs = [...new Set(
    Array.from(document.querySelectorAll('main [dir]')).map((e) => e.tagName + '[dir=' + e.getAttribute('dir') + ']'),
  )].slice(0, 15);
  console.log(JSON.stringify(out, null, 2));
})();
```

The script is not Claude-specific: it works on any site whose content sits
inside `main`, so it is also a starting point for other adapters.

## Rule for every adapter

Do not exclude an element by its name or assumed purpose alone
(`file-thumbnail` sounds decorative; `button` sounds like a control). Check
what it wraps on a live page first. The engine already skips elements with no
text, so exclude entries are only for UI controls that carry text and are
confirmed not to wrap message content.
