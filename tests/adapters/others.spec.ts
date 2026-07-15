import { describe, expect, it } from 'vitest';
import { DirectionEngine } from '../../src/core/engine';
import { claudeAdapter } from '../../src/adapters/claude';
import { geminiAdapter } from '../../src/adapters/gemini';
import { aistudioAdapter } from '../../src/adapters/aistudio';
import { substackAdapter } from '../../src/adapters/substack';
import { resolveAdapter } from '../../src/adapters/registry';
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

describe('registry resolution for all supported sites', () => {
  const cases: [string, string][] = [
    ['chatgpt.com', 'chatgpt'],
    ['claude.ai', 'claude'],
    ['gemini.google.com', 'gemini'],
    ['aistudio.google.com', 'aistudio'],
    ['github.com', 'github'],
    ['gist.github.com', 'github'],
    ['on.substack.com', 'substack'],
    ['substack.com', 'substack'],
    ['google.com', 'generic'], // gemini/aistudio must not leak to plain google
    ['claude.ai.evil.io', 'generic'],
    ['mysubstack.com', 'generic'],
  ];
  for (const [host, id] of cases) {
    it(`${host} → ${id}`, () => expect(resolveAdapter(host).id).toBe(id));
  }
});

describe('Claude adapter — fields verified, display pending real DOM data', () => {
  it('processes the composer, skips CodeMirror artifacts, applies no display', () => {
    document.body.innerHTML = `
      <main>
        <div contenteditable="true" class="ProseMirror"><p>مرحبا</p></div>
        <div class="cm-editor"><div class="cm-content" contenteditable="true"></div></div>
        <div class="message"><p>Some assistant text</p></div>
      </main>`;
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('.ProseMirror')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('.ProseMirror p')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('.cm-content')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('.message p')!.hasAttribute('dir')).toBe(false); // display empty
    engine.stop();
    expect(document.querySelectorAll('[data-sawb]').length).toBe(0);
  });

  it('reports "partial" support so the popup never shows «موقع مدعوم ✓» prematurely', () => {
    expect(supportLevel(claudeAdapter)).toBe('partial');
    expect(claudeAdapter.displaySelectors).toEqual([]);
  });

  /**
   * Regression coverage for the reported bug: with displaySelectors still
   * empty (pending real DOM data — see docs/CLAUDE-DOM-INSPECTION.md), the
   * engine must NEVER touch any shape of conversation content, no matter how
   * it's structured. This is deliberately shape-agnostic (no assumption about
   * Claude's real container names) — it proves the current safe-by-default
   * state, not a working display feature. Replace with real fixtures once
   * live selectors are supplied.
   */
  function conversationFixture(): void {
    document.body.innerHTML = `
      <main>
        <div class="composer" contenteditable="true"><p>سؤال المستخدم</p></div>
        <div data-testid="user-message"><p>مرحبا، هل يمكنك المساعدة في npm install؟</p></div>
        <div data-testid="assistant-message">
          <p>نعم بالتأكيد، إليك الشرح الكامل باللغة العربية.</p>
          <p>Mixed paragraph مع مصطلح API إنجليزي و <code>const x = 1</code> inline.</p>
          <ul><li>بند عربي أول</li><li>English item</li></ul>
          <h3>عنوان فرعي</h3>
          <blockquote>اقتباس عربي</blockquote>
          <table><tbody><tr><td>القيمة</td><td>42</td></tr></tbody></table>
          <pre><code>def hello():\n    print("hi")</code></pre>
        </div>
      </main>`;
  }

  it('never applies direction to Arabic assistant paragraphs (display unverified)', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    for (const p of Array.from(document.querySelectorAll('[data-testid="assistant-message"] p'))) {
      expect(p.hasAttribute('dir')).toBe(false);
    }
    engine.stop();
  });

  it('never applies direction to the Arabic user message bubble (display unverified)', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('[data-testid="user-message"] p')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('never touches lists, headings, blockquotes, or tables inside a response', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    for (const sel of ['li', 'h3', 'blockquote', 'td']) {
      for (const el of Array.from(document.querySelectorAll(`[data-testid="assistant-message"] ${sel}`))) {
        expect(el.hasAttribute('dir')).toBe(false);
      }
    }
    engine.stop();
  });

  it('never touches inline code or code blocks inside a response', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('[data-testid="assistant-message"] code')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('[data-testid="assistant-message"] pre')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('does not react to a streamed paragraph appended to a response', async () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    const streamed = document.createElement('p');
    streamed.textContent = 'فقرة جديدة أثناء البث';
    document.querySelector('[data-testid="assistant-message"]')!.appendChild(streamed);
    await flushMutations();
    expect(streamed.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('mode switching (as if via the popup) still applies no display direction', () => {
    conversationFixture();
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    engine.update({ ...CONFIG, mode: 'rtl' });
    expect(document.querySelector('[data-testid="assistant-message"] p')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('disabling restores the page exactly (fields were the only thing touched)', () => {
    conversationFixture();
    const before = document.body.innerHTML;
    const engine = new DirectionEngine(claudeAdapter);
    engine.start(CONFIG);
    expect(document.body.innerHTML).not.toBe(before); // composer was touched
    engine.stop();
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelectorAll('[data-sawb]').length).toBe(0);
  });
});

describe('Gemini adapter', () => {
  function fixture(): void {
    document.body.innerHTML = `
      <main>
        <rich-textarea class="ql-container">
          <div class="ql-editor textarea" contenteditable="true"><p>سؤالي</p></div>
          <div class="ql-clipboard" contenteditable="true"></div>
        </rich-textarea>
        <message-content>
          <div class="markdown">
            <p>الإجابة تحتوي على <code>console.log()</code> كمثال</p>
            <pre><code>const x = 1;</code></pre>
          </div>
        </message-content>
      </main>`;
  }

  it('processes the Quill composer at its root, never the clipboard buffer', () => {
    fixture();
    const engine = new DirectionEngine(geminiAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('.ql-editor')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('.ql-editor p')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('.ql-clipboard')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('applies display direction to responses, protecting code', () => {
    fixture();
    const engine = new DirectionEngine(geminiAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('message-content p')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('message-content p code')!.getAttribute('dir')).toBe('ltr');
    expect(document.querySelector('message-content pre')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('handles streamed paragraphs appended to a response', async () => {
    fixture();
    const engine = new DirectionEngine(geminiAdapter);
    engine.start(CONFIG);
    const markdown = document.querySelector('message-content .markdown')!;
    const p = document.createElement('p');
    p.textContent = 'فقرة إضافية أثناء البث المباشر';
    markdown.appendChild(p);
    await flushMutations();
    expect(p.getAttribute('dir')).toBe('auto');
    engine.stop();
  });
});

describe('AI Studio adapter', () => {
  it('processes the prompt textarea and chat turns', () => {
    document.body.innerHTML = `
      <main>
        <ms-prompt-box><div><div><div>
          <textarea aria-label="Enter a prompt" class="cdk-textarea-autosize"></textarea>
        </div></div></div></ms-prompt-box>
        <ms-chat-turn>
          <div class="turn-content"><p>الناتج المطلوب هو v2.1.0 مع الشرح</p></div>
        </ms-chat-turn>
      </main>`;
    const engine = new DirectionEngine(aistudioAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('ms-prompt-box textarea')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('ms-chat-turn p')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });
});

describe('Substack adapter', () => {
  it('processes the article body and universal fields, keeps host rtl/ltr', () => {
    document.body.innerHTML = `
      <article class="newsletter-post">
        <div class="available-content">
          <div class="body markup">
            <h3 dir="auto">عنوان فرعي</h3>
            <p>الفقرة الأولى بالعربية مع مصطلح API إنجليزي</p>
            <p dir="ltr">Editor pinned this LTR</p>
          </div>
        </div>
      </article>
      <textarea placeholder="تعليق"></textarea>`;
    const engine = new DirectionEngine(substackAdapter);
    engine.start(CONFIG);
    const ps = document.querySelectorAll('.markup p');
    expect(ps[0]!.getAttribute('dir')).toBe('auto');
    expect(ps[1]!.getAttribute('dir')).toBe('ltr'); // host-pinned, untouched
    expect(ps[1]!.hasAttribute('data-sawb')).toBe(false);
    expect(document.querySelector('textarea')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });
});
