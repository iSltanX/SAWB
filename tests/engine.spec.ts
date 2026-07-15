import { describe, expect, it } from 'vitest';
import { DirectionEngine } from '../src/core/engine';
import { chatgptAdapter } from '../src/adapters/chatgpt';
import { genericAdapter } from '../src/adapters/generic';
import { MARK_ATTR } from '../src/core/apply';
import type { EffectiveConfig } from '../src/platform/types';
import { flushMutations } from './helpers/setup';

const CONFIG: EffectiveConfig = {
  enabled: true,
  mode: 'auto',
  fields: true,
  display: true,
  showIndicator: false,
};

/** A minimal ChatGPT-shaped page: ProseMirror composer + message thread. */
function chatgptFixture(): void {
  document.body.innerHTML = `
    <main>
      <div data-message-author-role="assistant">
        <div class="markdown">
          <p>مرحبا! إليك الحل المطلوب</p>
          <p>You can also use the CLI.</p>
          <pre><code>npm install sawb</code></pre>
        </div>
      </div>
      <form>
        <div id="prompt-textarea" class="ProseMirror" contenteditable="true">
          <p>مرحبا</p>
        </div>
      </form>
    </main>`;
}

describe('DirectionEngine on a ChatGPT-like page', () => {
  it('applies auto direction to the composer root and message blocks', () => {
    chatgptFixture();
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start(CONFIG);

    // Root-level for live editors; inner blocks are the editor's territory.
    expect(document.querySelector('#prompt-textarea')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('#prompt-textarea p')!.hasAttribute('dir')).toBe(false);
    const markdownPs = document.querySelectorAll('.markdown > p');
    expect(markdownPs[0]!.getAttribute('dir')).toBe('auto');
    expect(markdownPs[1]!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('pre')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('pre code')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('processes streaming content (new blocks after start)', async () => {
    chatgptFixture();
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start(CONFIG);

    const markdown = document.querySelector('.markdown')!;
    const p = document.createElement('p');
    p.textContent = 'فقرة جديدة أثناء البث';
    markdown.appendChild(p);
    await flushMutations();
    expect(p.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('processes a whole message node inserted later (SPA)', async () => {
    chatgptFixture();
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start(CONFIG);

    const message = document.createElement('div');
    message.setAttribute('data-message-author-role', 'user');
    message.innerHTML = '<div class="whitespace-pre-wrap">سؤالي عن v1.2.3 الجديد</div>';
    document.querySelector('main')!.appendChild(message);
    await flushMutations();
    expect(message.querySelector('.whitespace-pre-wrap')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('re-applies when the host resets our dir attribute', async () => {
    chatgptFixture();
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start(CONFIG);

    const p = document.querySelector('.markdown > p')!;
    expect(p.getAttribute('dir')).toBe('auto');
    p.removeAttribute('dir'); // simulated framework re-render
    await flushMutations();
    expect(p.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('manual override then stop() restores the page exactly', () => {
    chatgptFixture();
    const before = document.body.innerHTML;
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start({ ...CONFIG, mode: 'rtl' });
    expect(document.body.innerHTML).not.toBe(before);
    engine.stop();
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelectorAll(`[${MARK_ATTR}]`).length).toBe(0);
  });

  it('turning fields off restores fields but keeps display processing', () => {
    chatgptFixture();
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start(CONFIG);
    engine.update({ ...CONFIG, fields: false });

    expect(document.querySelector('#prompt-textarea')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('.markdown > p')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('mode switch auto → rtl → auto converges', () => {
    chatgptFixture();
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start(CONFIG);
    engine.update({ ...CONFIG, mode: 'rtl' });
    expect(document.querySelector('.markdown > p')!.getAttribute('dir')).toBe('rtl');
    expect(document.querySelector('#prompt-textarea')!.getAttribute('dir')).toBe('rtl');
    engine.update({ ...CONFIG, mode: 'auto' });
    expect(document.querySelector('.markdown > p')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('#prompt-textarea')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('surrenders an element the host keeps fighting over', async () => {
    document.body.innerHTML = '<main><form><textarea></textarea></form></main>';
    const engine = new DirectionEngine(chatgptAdapter);
    engine.start({ ...CONFIG, mode: 'rtl' });
    const field = document.querySelector('textarea')!;
    expect(field.getAttribute('dir')).toBe('rtl');

    for (let i = 0; i < 14; i += 1) {
      field.setAttribute('dir', 'ltr'); // hostile host re-render loop
      await flushMutations(150); // > the 120ms background-safe flush timeout
      if (!field.hasAttribute(MARK_ATTR)) break; // engine gave up
    }
    // Engine surrendered: element restored to its original state (no dir,
    // no mark) and future host writes are left alone.
    expect(field.hasAttribute(MARK_ATTR)).toBe(false);
    field.setAttribute('dir', 'ltr');
    await flushMutations(40);
    expect(field.getAttribute('dir')).toBe('ltr'); // host wins, page unharmed
    expect(field.hasAttribute(MARK_ATTR)).toBe(false);
    engine.stop();
  });
});

describe('DirectionEngine with the generic adapter', () => {
  it('handles plain fields, skips navigation and code editors', () => {
    document.body.innerHTML = `
      <header><input type="text" id="site-search"></header>
      <nav><input type="text" id="nav-box"></nav>
      <main>
        <textarea id="comment"></textarea>
        <div class="cm-editor"><div contenteditable="true" id="cm"></div></div>
      </main>`;
    const engine = new DirectionEngine(genericAdapter);
    engine.start({ ...CONFIG, display: false });

    expect(document.querySelector('#comment')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('#site-search')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('#nav-box')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('#cm')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('never sets dir on html or body', () => {
    document.body.innerHTML = '<main><p>مرحبا</p></main>';
    const engine = new DirectionEngine(genericAdapter);
    engine.start(CONFIG);
    expect(document.documentElement.hasAttribute('dir')).toBe(false);
    expect(document.body.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('respects host-provided direction in auto mode (requirement 7)', () => {
    document.body.innerHTML = '<article dir="rtl"><p>فقرة</p></article>';
    const engine = new DirectionEngine(genericAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('p')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('dynamically inserted fields are picked up', async () => {
    document.body.innerHTML = '<main></main>';
    const engine = new DirectionEngine(genericAdapter);
    engine.start(CONFIG);
    const textarea = document.createElement('textarea');
    document.querySelector('main')!.appendChild(textarea);
    await flushMutations();
    expect(textarea.getAttribute('dir')).toBe('auto');
    engine.stop();
  });
});
