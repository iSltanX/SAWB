# Claude.ai display adapter — inspection history (resolved)

**Status: complete.** `src/adapters/claude.ts` has verified `displaySelectors`
and full support (fields + displayed content). This document is kept as a
record of how the selectors were confirmed and two mistakes caught along the
way, in case the adapter needs revisiting after a Claude.ai UI change.

## Timeline

1. The in-browser inspection tool that gives live, authenticated access to
   claude.ai disconnected mid-project. `displaySelectors` shipped empty
   rather than guessed (see git history on `src/adapters/claude.ts`), and the
   popup showed a "دعم جزئي — الحقول فقط" (partial support) badge instead of
   overclaiming.
2. The project owner ran a DevTools inspection on a real, logged-in
   conversation and supplied the raw DOM dump: feed root
   `[role="feed"][aria-label="Chat messages"]`, message containers
   `[role="article"][aria-label^="Message "]`, an assistant-only `h2.sr-only`
   accessibility heading, and a list of interactive `data-testid` hooks
   (`action-bar-*`, `model-selector-dropdown`, `file-thumbnail`,
   `voice-audio-visualizer`, `chat-input`, `wiggle-controls-*`).
3. The in-browser inspection tool reconnected, allowing direct live
   verification of the implementation on a real conversation instead of
   relying on the static dump alone.
4. Live verification caught two selector mistakes that the static dump alone
   didn't reveal, both from excluding by *inferred* purpose instead of
   *confirmed* DOM content:
   - A blanket `button` exclude (meant to protect the action bar) silently
     hid every user message, because Claude wraps the entire user-message
     bubble in a `<button>` for click-to-edit — assistant messages worked,
     user messages didn't.
   - `[data-testid="file-thumbnail"]` (assumed to be a small image icon) on
     a message with a large pasted-text attachment turned out to wrap the
     entire attachment card — 300+ characters of real Arabic text, not an
     image. Excluding it hid that content.
   Both were fixed by narrowing to what was actually confirmed:
   `[role="toolbar"]` + `action-bar-*` fully cover the action bar without a
   `button` exclude, and a genuine image-only thumbnail has no text leaf
   blocks to apply direction to in the first place, so no exclude was needed
   there either.
5. After the fixes, live verification confirmed: Arabic user and assistant
   messages resolve RTL in auto mode; a pasted-attachment card gets
   direction; the action bar, sidebar, sr-only labels, and model selector are
   never touched; manual RTL/LTR/auto switching updates existing messages
   immediately; a newly sent message and its streamed assistant reply both
   receive direction; disabling restores the page exactly.

## Reusable diagnostic script

Kept for future re-verification after a Claude.ai redesign. Run in DevTools
Console on a live conversation:

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

## Lesson for future adapters

Do not exclude an element by its *name* or assumed purpose alone
(`file-thumbnail` sounds decorative; `button` sounds like a control). Verify
what it actually wraps on a live page first — the engine's own "skip empty
text" rule already leaves genuinely decorative elements alone, so exclude
entries should only exist for confirmed, content-bearing UI controls.
