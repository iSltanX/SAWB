import { describe, expect, it } from 'vitest';
import { DirectionEngine } from '../../src/core/engine';
import { claudeAdapter } from '../../src/adapters/claude';
import { supportLevel } from '../../src/adapters/types';
import type { EffectiveConfig } from '../../src/platform/types';
import { flushMutations } from '../helpers/setup';

const CONFIG: EffectiveConfig = {
  enabled: true,
  mode: 'auto',
  fields: true,
  display: true,
  showIndicator: false,
};

/**
 * Fixture built from the real, live-inspected claude.ai DOM (feed role,
 * article role + aria-label pattern, sr-only accessibility heading, action
 * bar with data-testid hooks, sidebar nav). Structure confirmed 2026-07-15.
 */
function conversationFixture(): void {
  document.body.innerHTML = `
    <nav aria-label="Sidebar">
      <ul><li class="flex flex-col">Code</li></ul>
    </nav>
    <div data-testid="chat-input" contenteditable="true"><p>سؤال قادم</p></div>
    <div role="feed" aria-label="Chat messages">
      <p class="sr-only select-none">Use the up and down arrow keys to move between messages.</p>

      <div role="article" aria-label="Message 1 of 2">
        <button class="group user-message-bubble" type="button">
          <p>أريدك أن تبحث بحثًا عمليًا واسعًا عن إضافات ناجحة ومفيدة.</p>
        </button>
        <div data-testid="file-thumbnail">
          <p>محتوى ملصق طويل باللغة العربية يحتاج إلى اتجاه صحيح أيضًا.</p>
        </div>
      </div>

      <div role="article" aria-label="Message 2 of 2">
        <h2 class="sr-only select-none">Claude responded: فهمت المطلوب.</h2>
        <div class="group relative pb-3">
          <p>فهمت المطلوب. سأشرح الخطوات باللغة العربية بالتفصيل.</p>
          <p>Mixed paragraph مع مصطلح API إنجليزي و <code>const x = 1</code> inline، ثم رابط https://example.com.</p>
          <ul><li>بند عربي أول</li><li>English item</li></ul>
          <h3>عنوان فرعي داخل الرد</h3>
          <blockquote>اقتباس عربي داخل الرد</blockquote>
          <table><tbody><tr><td>القيمة الأولى</td><td>42</td></tr></tbody></table>
          <pre><code>def hello():\n    print("hi")</code></pre>
          <div role="toolbar" aria-label="Message actions">
            <button data-testid="action-bar-edit">Edit</button>
            <button data-testid="action-bar-copy">Copy</button>
            <button data-testid="action-bar-read-aloud">Read aloud</button>
            <button data-testid="action-bar-retry">Retry</button>
          </div>
        </div>
      </div>
    </div>
    <div data-testid="model-selector-dropdown">Claude Opus</div>
  `;
}

function article(n: 1 | 2): Element {
  return document.querySelector(`[role="article"][aria-label="Message ${n} of 2"]`)!;
}

describe('Claude adapter — full support (fields + display, live-verified)', () => {
  it('reports "full" support now that displaySelectors are populated', () => {
    expect(supportLevel(claudeAdapter)).toBe('full');
    expect(claudeAdapter.displaySelectors.length).toBeGreaterThan(0);
  });

  it('applies auto direction to the Arabic user message (article 1)', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const p = article(1).querySelector('p')!;
    expect(p.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  /**
   * Regression test for a bug caught during live verification: Claude wraps
   * the ENTIRE user-message bubble in a `<button>` (click-to-edit UX), which
   * an earlier draft's blanket `button` exclude silently defeated — user
   * messages never got direction while assistant messages worked fine. Fixed
   * by dropping the blanket exclude; the action bar stays protected via
   * `[role="toolbar"]` and the `action-bar-*` testid prefix instead.
   */
  it('applies direction to Arabic text even when the message is wrapped in a <button>', () => {
    conversationFixture();
    const userButton = article(1).querySelector('button.user-message-bubble')!;
    expect(userButton).not.toBeNull();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(userButton.querySelector('p')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  /**
   * Regression test for a second live-verification catch: on a message with
   * a large pasted-text attachment, data-testid="file-thumbnail" wraps the
   * ENTIRE attachment card (real text), not just a decorative image
   * thumbnail. An earlier draft excluded it by inferred name alone and hid
   * that content. A genuine image-only thumbnail has no text leaf blocks, so
   * it never gets marked regardless — no exclude entry was needed.
   */
  it('applies direction to Arabic text inside a pasted-attachment card (file-thumbnail testid)', () => {
    conversationFixture();
    const attachment = article(1).querySelector('[data-testid="file-thumbnail"]')!;
    expect(attachment).not.toBeNull();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(attachment.querySelector('p')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('applies auto direction to Arabic assistant paragraphs (article 2)', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const paragraphs = article(2).querySelectorAll(':scope > div > p');
    expect(paragraphs.length).toBeGreaterThan(0);
    for (const p of Array.from(paragraphs)) expect(p.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('keeps a mixed paragraph auto while isolating inline code as LTR', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const mixed = Array.from(article(2).querySelectorAll('p')).find((p) =>
      p.textContent?.includes('Mixed paragraph'),
    )!;
    expect(mixed.getAttribute('dir')).toBe('auto');
    const code = mixed.querySelector('code')!;
    expect(code.getAttribute('dir')).toBe('ltr');
    expect((code as HTMLElement).style.getPropertyValue('unicode-bidi')).toBe('isolate');
    engine.stop();
  });

  it('applies direction to list items, headings, blockquotes, and table cells', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const a2 = article(2);
    for (const li of Array.from(a2.querySelectorAll('li'))) expect(li.getAttribute('dir')).toBe('auto');
    expect(a2.querySelector('h3')!.getAttribute('dir')).toBe('auto');
    expect(a2.querySelector('blockquote')!.getAttribute('dir')).toBe('auto');
    expect(a2.querySelector('td')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('never touches a code block or its contents', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const pre = article(2).querySelector('pre')!;
    expect(pre.hasAttribute('dir')).toBe(false);
    expect(pre.querySelector('code')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('never touches the sr-only accessibility heading or hint paragraph', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('h2.sr-only')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('p.sr-only')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('never touches the action bar, its buttons, or the model selector', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('[role="toolbar"]')!.hasAttribute('dir')).toBe(false);
    for (const btn of Array.from(document.querySelectorAll('[data-testid^="action-bar-"]'))) {
      expect(btn.hasAttribute('dir')).toBe(false);
    }
    expect(document.querySelector('[data-testid="model-selector-dropdown"]')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('never touches the sidebar or the composer as display content', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('nav li')!.hasAttribute('dir')).toBe(false);
    // The composer IS touched, but as a FIELD (root-level), never marked "display".
    const composer = document.querySelector('[data-testid="chat-input"]')!;
    expect(composer.getAttribute('data-sawb')).toBe('field');
    expect(composer.querySelector('p')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('handles a streamed paragraph appended to an in-progress response', async () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const streamed = document.createElement('p');
    streamed.textContent = 'فقرة جديدة أثناء البث المباشر';
    article(2).querySelector('.group')!.appendChild(streamed);
    await flushMutations();
    expect(streamed.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('handles a newly inserted message article (SPA navigation to a new turn)', async () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const feed = document.querySelector('[role="feed"]')!;
    const article3 = document.createElement('div');
    article3.setAttribute('role', 'article');
    article3.setAttribute('aria-label', 'Message 3 of 3');
    article3.innerHTML = '<div class="group"><p>سؤال متابعة من المستخدم</p></div>';
    feed.appendChild(article3);
    await flushMutations();
    expect(article3.querySelector('p')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('manual RTL updates existing assistant and user messages immediately', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start({ ...CONFIG, mode: 'rtl' });
    expect(article(1).querySelector('p')!.getAttribute('dir')).toBe('rtl');
    expect(article(2).querySelector('p')!.getAttribute('dir')).toBe('rtl');
    engine.stop();
  });

  it('manual LTR updates existing messages, then switching back to auto re-resolves them', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start({ ...CONFIG, mode: 'ltr' });
    expect(article(1).querySelector('p')!.getAttribute('dir')).toBe('ltr');
    engine.update({ ...CONFIG, mode: 'auto' });
    expect(article(1).querySelector('p')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('disabling restores the entire page exactly, including the composer field', () => {
    conversationFixture();
    const before = document.body.innerHTML;
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.body.innerHTML).not.toBe(before);
    engine.stop();
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelectorAll('[data-sawb]').length).toBe(0);
  });
});
