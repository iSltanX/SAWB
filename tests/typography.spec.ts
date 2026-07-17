import { describe, expect, it } from 'vitest';
import {
  applyToDisplay,
  classifyRtl,
  clearTypography,
  MARK_ATTR,
  restoreAll,
  setTypography,
} from '../src/core/apply';

const noRc = { respectHostDir: false };
const rc = (fontScale: number, lineHeight: number) => ({
  respectHostDir: false,
  typography: { fontScale, lineHeight },
});

describe('classifyRtl', () => {
  it('manual rtl mode classifies every block RTL regardless of text', () => {
    document.body.innerHTML = '<p>Hello world</p>';
    const p = document.querySelector('p')!;
    expect(classifyRtl(p, 'rtl', false)).toBe(true);
  });

  it('manual ltr mode classifies every block non-RTL regardless of text', () => {
    document.body.innerHTML = '<p>مرحبا بالعالم</p>';
    const p = document.querySelector('p')!;
    expect(classifyRtl(p, 'ltr', false)).toBe(false);
  });

  it('auto mode classifies from the block\'s own text when host dir is not respected', () => {
    document.body.innerHTML = '<p>مرحبا</p><p>Hello</p>';
    const [ar, en] = Array.from(document.querySelectorAll('p'));
    expect(classifyRtl(ar!, 'auto', false)).toBe(true);
    expect(classifyRtl(en!, 'auto', false)).toBe(false);
  });

  it('auto mode with respectHostDir defers to an explicit host dir', () => {
    document.body.innerHTML = '<p dir="ltr">مرحبا</p>';
    const p = document.querySelector('p')!;
    expect(classifyRtl(p, 'auto', true)).toBe(false); // host said ltr, even though text is Arabic
  });
});

describe('setTypography / clearTypography', () => {
  it('sets font-size as a relative percentage and line-height unitless', () => {
    document.body.innerHTML = '<p>مرحبا</p>';
    const p = document.querySelector('p')!;
    expect(setTypography(p, 1.08, 1.8)).toBe(true);
    expect((p as HTMLElement).style.fontSize).toBe('108%');
    expect((p as HTMLElement).style.lineHeight).toBe('1.8');
  });

  it('is idempotent — a second identical write reports no change', () => {
    document.body.innerHTML = '<p>مرحبا</p>';
    const p = document.querySelector('p')!;
    expect(setTypography(p, 1.08, 1.8)).toBe(true);
    expect(setTypography(p, 1.08, 1.8)).toBe(false);
  });

  it('a different value writes again', () => {
    document.body.innerHTML = '<p>مرحبا</p>';
    const p = document.querySelector('p')!;
    setTypography(p, 1.08, 1.8);
    expect(setTypography(p, 1.2, 2.0)).toBe(true);
    expect((p as HTMLElement).style.fontSize).toBe('120%');
    expect((p as HTMLElement).style.lineHeight).toBe('2');
  });

  it('clearTypography on a never-touched element is a no-op', () => {
    document.body.innerHTML = '<p style="font-size:20px">Hello</p>';
    const p = document.querySelector('p')!;
    clearTypography(p);
    expect((p as HTMLElement).style.fontSize).toBe('20px'); // untouched — no snapshot exists
  });

  it('clearTypography restores the pre-SAWB value without touching dir', () => {
    document.body.innerHTML = '<p dir="auto">مرحبا</p>';
    const p = document.querySelector('p')!;
    setTypography(p, 1.08, 1.8);
    clearTypography(p);
    expect((p as HTMLElement).style.fontSize).toBe('');
    expect((p as HTMLElement).style.lineHeight).toBe('');
    expect(p.getAttribute('dir')).toBe('auto'); // dir untouched by clearTypography
  });
});

describe('applyToDisplay — reading-comfort typography (RTL blocks only)', () => {
  it('applies typography to an RTL block when the option is active', () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا بالعالم</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')!;
    expect(p.getAttribute('dir')).toBe('auto');
    expect((p as HTMLElement).style.fontSize).toBe('108%');
    expect((p as HTMLElement).style.lineHeight).toBe('1.8');
  });

  it('leaves an English block untouched even when typography is active', () => {
    document.body.innerHTML = '<div class="markdown"><p>Hello world</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')!;
    expect(p.getAttribute('dir')).toBe('auto'); // direction still applies
    expect((p as HTMLElement).style.fontSize).toBe(''); // typography does not
    expect((p as HTMLElement).style.lineHeight).toBe('');
  });

  it('mixed content: only the Arabic paragraph gets typography', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>مرحبا بالعالم</p><p>Hello world</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const [ar, en] = Array.from(document.querySelectorAll('p'));
    expect((ar as HTMLElement).style.fontSize).toBe('108%');
    expect((en as HTMLElement).style.fontSize).toBe('');
  });

  it('no typography at all when the option is null (mirrors display=false upstream)', () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا بالعالم</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', noRc);
    const p = document.querySelector('p')!;
    expect(p.getAttribute('dir')).toBe('auto');
    expect((p as HTMLElement).style.fontSize).toBe('');
  });

  it('never touches code, pre, or protected content', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>مرحبا</p><pre><code>مرحبا بالعربية في الكود</code></pre></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    expect(document.querySelector('pre')!.hasAttribute('dir')).toBe(false);
    expect((document.querySelector('pre code') as HTMLElement).style.fontSize).toBe('');
  });

  it('never touches a numeric table even when respectHostDir is off', () => {
    document.body.innerHTML =
      '<article><table><tbody><tr><td>1.5</td><td>2.5</td></tr></tbody></table></article>';
    applyToDisplay(document.querySelector('article')!, 'auto', rc(1.08, 1.8));
    expect((document.querySelector('td') as HTMLElement).style.fontSize).toBe('');
  });

  it('manual rtl mode types every non-protected block uniformly, including English text', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>Hello world</p><p>مرحبا</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'rtl', rc(1.08, 1.8));
    for (const p of Array.from(document.querySelectorAll('p'))) {
      expect((p as HTMLElement).style.fontSize).toBe('108%');
    }
  });

  it('manual ltr mode clears typography from every block, including Arabic text', () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    expect((document.querySelector('p') as HTMLElement).style.fontSize).toBe('108%');
    applyToDisplay(root, 'ltr', rc(1.08, 1.8));
    expect((document.querySelector('p') as HTMLElement).style.fontSize).toBe('');
  });

  it('a block handed back to the host (explicit host dir, auto mode) never receives typography', () => {
    document.body.innerHTML = '<article><p dir="ltr">نص عربي</p></article>';
    applyToDisplay(document.querySelector('article')!, 'auto', {
      respectHostDir: true,
      typography: { fontScale: 1.08, lineHeight: 1.8 },
    });
    const p = document.querySelector('p')!;
    expect(p.hasAttribute(MARK_ATTR)).toBe(false); // untouched entirely
    expect((p as HTMLElement).style.fontSize).toBe('');
  });

  it('RTL → LTR reclassification during streaming clears typography but keeps direction', async () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا بالعالم</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')!;
    expect((p as HTMLElement).style.fontSize).toBe('108%');
    expect(p.getAttribute('dir')).toBe('auto');

    // Simulate a streamed reply that replaces the paragraph's language.
    p.textContent = 'Hello world, now in English';
    applyToDisplay(root, 'auto', rc(1.08, 1.8));

    expect((p as HTMLElement).style.fontSize).toBe(''); // typography removed
    expect((p as HTMLElement).style.lineHeight).toBe('');
    expect(p.getAttribute('dir')).toBe('auto'); // direction handling untouched
  });

  it('changing the configured size/line-height updates existing typography without extra markers', () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا بالعالم</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    applyToDisplay(root, 'auto', rc(1.2, 2.0));
    const p = document.querySelector('p')!;
    expect((p as HTMLElement).style.fontSize).toBe('120%');
    expect((p as HTMLElement).style.lineHeight).toBe('2');
  });

  it('original inline font-size/line-height are restored exactly on full restore', () => {
    document.body.innerHTML =
      '<div class="markdown"><p style="font-size:20px;line-height:1.4">مرحبا</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')!;
    expect((p as HTMLElement).style.fontSize).toBe('108%');
    restoreAll(document);
    expect((p as HTMLElement).style.fontSize).toBe('20px');
    expect((p as HTMLElement).style.lineHeight).toBe('1.4');
    expect(p.hasAttribute(MARK_ATTR)).toBe(false);
  });

  it('full restore with no prior inline style leaves no empty style attribute', () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    restoreAll(document);
    const p = document.querySelector('p')!;
    expect(p.hasAttribute('style')).toBe(false);
    expect(p.hasAttribute(MARK_ATTR)).toBe(false);
  });

  it('does not add any new DOM attribute for typography (no data-sawb-rc)', () => {
    document.body.innerHTML = '<div class="markdown"><p>مرحبا بالعالم</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')!;
    expect(p.getAttribute(MARK_ATTR)).toBe('display'); // the existing marker only
    expect(p.getAttributeNames()).not.toContain('data-sawb-rc');
  });
});

/**
 * Ownership: SAWB may only ever revert a property it still owns. The host
 * commonly owns font-size/line-height itself and can take a property back at
 * any moment; a value written after us is newer than our snapshot and is
 * authoritative.
 */
describe('typography ownership — SAWB never reverts what the host owns', () => {
  function markdown(html: string): Element {
    document.body.innerHTML = `<div class="markdown">${html}</div>`;
    return document.querySelector('.markdown')!;
  }

  it('host inline font-size survives a display pass when RC is off', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', noRc); // direction-only pass snapshots the block
    const p = document.querySelector('p')! as HTMLElement;

    p.style.fontSize = '22px'; // host styles a block SAWB never typeset
    applyToDisplay(root, 'auto', noRc);

    expect(p.style.fontSize).toBe('22px');
  });

  it('host inline styles on an English block survive when RC is on', () => {
    const root = markdown('<p style="font-size:22px;line-height:1.3">Hello world</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;

    // Not RTL → clearTypography runs, but SAWB owns neither property.
    expect(p.style.fontSize).toBe('22px');
    expect(p.style.lineHeight).toBe('1.3');
  });

  it('host overriding SAWB font-size is never reverted by clearTypography', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;
    expect(p.style.fontSize).toBe('108%');

    p.style.fontSize = '30px'; // host takes the property over
    clearTypography(p);

    expect(p.style.fontSize).toBe('30px');
  });

  it('host overriding SAWB font-size is never reverted later by stop', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;

    p.style.fontSize = '30px';
    restoreAll(document); // teardown must not resurrect the stale snapshot

    expect(p.style.fontSize).toBe('30px');
  });

  it('host overrides font-size while SAWB still owns line-height', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;

    p.style.fontSize = '30px';
    restoreAll(document);

    expect(p.style.fontSize).toBe('30px'); // host's — kept
    expect(p.style.lineHeight).toBe(''); // SAWB's — released
  });

  it('host overrides line-height while SAWB still owns font-size', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;

    p.style.lineHeight = '3';
    restoreAll(document);

    expect(p.style.lineHeight).toBe('3'); // host's — kept
    expect(p.style.fontSize).toBe(''); // SAWB's — released
  });

  it('settings update does not reclaim a property the host has taken over', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;

    p.style.fontSize = '30px'; // host takes font-size
    applyToDisplay(root, 'auto', rc(1.2, 2.0)); // user drags the sliders

    expect(p.style.fontSize).toBe('30px'); // not reclaimed
    expect(p.style.lineHeight).toBe('2'); // still ours → updated
  });

  it('untouched SAWB-owned properties restore exactly', () => {
    const root = markdown('<p style="font-size:20px;line-height:1.4;color:red">مرحبا</p>');
    const p = document.querySelector('p')! as HTMLElement;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    expect(p.style.fontSize).toBe('108%');

    restoreAll(document);

    expect(p.style.fontSize).toBe('20px');
    expect(p.style.lineHeight).toBe('1.4');
    expect(p.style.color).toBe('red'); // unrelated host style untouched
  });

  it('re-claims a property only on a later pass, never in the same one', () => {
    const root = markdown('<p>مرحبا بالعالم</p>');
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('p')! as HTMLElement;

    p.style.fontSize = '30px';
    applyToDisplay(root, 'auto', rc(1.08, 1.8)); // detects the takeover, yields
    expect(p.style.fontSize).toBe('30px');

    // Ownership was released, so the next pass treats 30px as the baseline and
    // may claim the property again.
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    expect(p.style.fontSize).toBe('108%');
    restoreAll(document);
    expect(p.style.fontSize).toBe('30px'); // released back to the host's value
  });
});

describe('nested display roots — relative scale must not compound', () => {
  it('nested display roots never compound font scale', () => {
    // Neither <main> nor <article> has block children, so leafBlocks() falls
    // back to [root] for both and <article> is a descendant of <main>.
    document.body.innerHTML = '<main><article>نص عربي بلا فقرات</article></main>';
    const main = document.querySelector('main')! as HTMLElement;
    const article = document.querySelector('article')! as HTMLElement;

    applyToDisplay(main, 'auto', rc(1.08, 1.8));
    applyToDisplay(article, 'auto', rc(1.08, 1.8));

    expect(main.style.fontSize).toBe('108%');
    expect(article.style.fontSize).toBe(''); // would render 1.08×1.08 otherwise
  });

  it('a direction-only ancestor does not suppress descendant typography', () => {
    document.body.innerHTML = '<main><article><p>مرحبا بالعالم</p></article></main>';
    const main = document.querySelector('main')!;
    const p = document.querySelector('p')! as HTMLElement;

    // <main>'s only leaf is the <p>; main itself gets dir but never typography.
    applyToDisplay(main, 'auto', rc(1.08, 1.8));

    expect(p.style.fontSize).toBe('108%');
  });

  it('an ancestor whose typography was taken over by the host does not suppress the descendant', () => {
    document.body.innerHTML = '<main><article>نص عربي بلا فقرات</article></main>';
    const main = document.querySelector('main')! as HTMLElement;
    const article = document.querySelector('article')! as HTMLElement;

    applyToDisplay(main, 'auto', rc(1.08, 1.8));
    expect(main.style.fontSize).toBe('108%');

    main.style.fontSize = '20px'; // host takes the ancestor's font-size over
    applyToDisplay(main, 'auto', rc(1.08, 1.8)); // main releases ownership
    applyToDisplay(article, 'auto', rc(1.08, 1.8));

    expect(main.style.fontSize).toBe('20px'); // host's value stands
    expect(article.style.fontSize).toBe('108%'); // no SAWB scale above it now
  });
});

describe('setTypography — last-resort clamping (no corrupt value reaches the DOM)', () => {
  function block(): HTMLElement {
    document.body.innerHTML = '<p>مرحبا بالعالم</p>';
    return document.querySelector('p')! as HTMLElement;
  }

  it('clamps a scale above the maximum', () => {
    const p = block();
    setTypography(p, 99, 50);
    expect(p.style.fontSize).toBe('130%');
    expect(p.style.lineHeight).toBe('2.2');
  });

  it('clamps a scale below the minimum', () => {
    const p = block();
    setTypography(p, 0.2, 0.5);
    expect(p.style.fontSize).toBe('100%');
    expect(p.style.lineHeight).toBe('1.4');
  });

  it('clamps negative values', () => {
    const p = block();
    setTypography(p, -5, -1);
    expect(p.style.fontSize).toBe('100%');
    expect(p.style.lineHeight).toBe('1.4');
  });

  it('falls back to defaults for null (never font-size: 0%)', () => {
    const p = block();
    setTypography(p, null as unknown as number, null as unknown as number);
    expect(p.style.fontSize).toBe('108%');
    expect(p.style.lineHeight).toBe('1.8');
  });

  it('falls back to defaults for NaN and Infinity', () => {
    const p = block();
    setTypography(p, NaN, Infinity);
    expect(p.style.fontSize).toBe('108%');
    expect(p.style.lineHeight).toBe('1.8');
  });

  it('falls back to defaults for a non-numeric value', () => {
    const p = block();
    setTypography(p, '1.2' as unknown as number, '2' as unknown as number);
    expect(p.style.fontSize).toBe('108%');
    expect(p.style.lineHeight).toBe('1.8');
  });

  it('passes valid in-range values through untouched', () => {
    const p = block();
    setTypography(p, 1.2, 2.0);
    expect(p.style.fontSize).toBe('120%');
    expect(p.style.lineHeight).toBe('2');
  });
});

describe('a block that becomes protected has SAWB edits withdrawn', () => {
  function typeset(html: string): HTMLElement {
    document.body.innerHTML = `<div class="markdown">${html}</div>`;
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    return document.querySelector('#t')! as HTMLElement;
  }
  const reapply = () =>
    applyToDisplay(document.querySelector('.markdown')!, 'auto', rc(1.08, 1.8));

  it('withdraws dir, typography and the marker when a syntax-highlight class appears', () => {
    const p = typeset('<p id="t">مرحبا بالعالم</p>');
    expect(p.style.fontSize).toBe('108%');

    p.classList.add('hljs');
    reapply();

    expect(p.style.fontSize).toBe('');
    expect(p.hasAttribute('dir')).toBe(false);
    expect(p.hasAttribute(MARK_ATTR)).toBe(false);
    expect(p.hasAttribute('style')).toBe(false);
  });

  it('withdraws when the block becomes a code element', () => {
    const p = typeset('<p id="t">مرحبا بالعالم</p>');
    const code = document.createElement('code');
    p.replaceWith(code);
    code.id = 't';
    code.textContent = 'مرحبا بالعالم';
    // The original block is gone; a fresh code block must never be typeset.
    reapply();
    expect((document.querySelector('#t') as HTMLElement).style.fontSize).toBe('');
  });

  it('withdraws when the block is moved under a pre', () => {
    document.body.innerHTML =
      '<div class="markdown"><div id="wrap"><p id="t">مرحبا بالعالم</p></div></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('#t')! as HTMLElement;
    expect(p.style.fontSize).toBe('108%');

    const pre = document.createElement('pre');
    document.querySelector('#wrap')!.append(pre);
    pre.append(p); // now inside a protected subtree
    applyToDisplay(root, 'auto', rc(1.08, 1.8));

    expect(p.style.fontSize).toBe('');
    expect(p.hasAttribute(MARK_ATTR)).toBe(false);
  });

  it('withdraws when the block becomes a protected editor surface', () => {
    document.body.innerHTML =
      '<div class="markdown"><div id="wrap"><p id="t">مرحبا بالعالم</p></div></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', rc(1.08, 1.8));
    const p = document.querySelector('#t')! as HTMLElement;
    expect(p.style.fontSize).toBe('108%');

    document.querySelector('#wrap')!.classList.add('cm-editor'); // CodeMirror
    applyToDisplay(root, 'auto', rc(1.08, 1.8));

    expect(p.style.fontSize).toBe('');
    expect(p.hasAttribute(MARK_ATTR)).toBe(false);
  });

  it('withdrawal keeps a property the host had taken over', () => {
    const p = typeset('<p id="t">مرحبا بالعالم</p>');
    p.style.fontSize = '40px'; // host takes over
    p.classList.add('hljs');
    reapply();

    expect(p.style.fontSize).toBe('40px'); // host's value survives withdrawal
    expect(p.hasAttribute(MARK_ATTR)).toBe(false);
  });
});
