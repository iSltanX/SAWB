# Claude.ai display-adapter — DOM data needed

**Blocker:** the browser tool that gave live, authenticated access to
claude.ai disconnected mid-project (see the session's tool list) and could
not be reconnected. `src/adapters/claude.ts` therefore ships with
`displaySelectors: []` rather than guessed class names — per the project's
explicit rule, adapters must never invent selectors from memory.

Composer/field behavior on claude.ai is already confirmed working; this is
only about the **displayed conversation** (assistant responses, user message
bubbles).

## How to unblock this

Open a real claude.ai conversation that includes: an Arabic-only assistant
reply, an Arabic user message, a mixed Arabic/English paragraph, a bulleted
or numbered list, a heading, and a code block. Open DevTools (F12) →
Console, paste the script below, and send me the JSON it prints (or paste it
back into this conversation).

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

  // Adjust these guesses freely — the goal is just to find ONE real node of
  // each kind so its ancestor chain (above) reveals the real container names.
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

  out.customTags = [...new Set(
    Array.from(document.querySelectorAll('main *'))
      .map((e) => e.tagName.toLowerCase())
      .filter((t) => t.includes('-')),
  )].slice(0, 40);

  out.dirAttrs = [...new Set(
    Array.from(document.querySelectorAll('main [dir]')).map((e) => e.tagName + '[dir=' + e.getAttribute('dir') + ']'),
  )].slice(0, 15);

  console.log(JSON.stringify(out, null, 2));
})();
```

## What I'll do with it

Once I have real container names for assistant messages, user messages, and
protected surfaces (code blocks, inline code, KaTeX if present), I will:

1. Fill in `displaySelectors` and any needed `excludeSelectors` in
   `src/adapters/claude.ts` with the confirmed selectors (documented with the
   inspection date, matching every other adapter in this project).
2. Add a fixture in `tests/adapters/others.spec.ts` (or a dedicated
   `tests/adapters/claude.spec.ts`) built from the real structure, covering:
   Arabic assistant response, Arabic user message, mixed Arabic/English with
   inline code and a code block staying LTR-isolated, streamed paragraph
   insertion, and restore-after-disable.
3. Flip `claude.ts`'s status back to full support once both fields and
   display are verified — `supportLevel()` will then show «موقع مدعوم ✓»
   automatically, no other code changes needed.

Alternative: if the in-browser inspection tool reconnects in a future
session, I can do all of the above myself without needing this data pasted
manually — just say so and I'll retry it directly.
