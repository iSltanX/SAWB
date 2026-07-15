import { describe, expect, it } from 'vitest';
import { DirectionEngine } from '../../src/core/engine';
import { claudeAdapter } from '../../src/adapters/claude';
import { geminiAdapter } from '../../src/adapters/gemini';
import { aistudioAdapter } from '../../src/adapters/aistudio';
import { substackAdapter } from '../../src/adapters/substack';
import { resolveAdapter } from '../../src/adapters/registry';
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

describe('Claude adapter (fields-only until live display verification)', () => {
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
