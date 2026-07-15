import { describe, expect, it } from 'vitest';
import { DirectionEngine } from '../../src/core/engine';
import { githubAdapter } from '../../src/adapters/github';
import { MARK_ATTR } from '../../src/core/apply';
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
 * Fixture mirroring the verified live GitHub DOM (2026-07-15): a release
 * body with GitHub's own dir="auto" on P/UL (but not LI), a PR comment box,
 * the new React markdown editor, the repo About description input, and a
 * protected diff/code area.
 */
function githubFixture(): void {
  document.body.innerHTML = `
    <main>
      <div class="Box-body">
        <div class="markdown-body">
          <p dir="auto">لتثبيت الإصدار الجديد v1.3.3 حمّل الملف <code>Raff_1.3.3_aarch64.dmg</code> من الرابط (https://github.com/iSltanX/Raff-releases) ثم شغّل الأمر التالي:</p>
          <pre><code>xattr -dr com.apple.quarantine /Applications/Raff.app</code></pre>
          <p dir="auto">إذا ظهرت رسالة "Raff is damaged" فراجع <a href="https://example.com/faq">الأسئلة الشائعة</a>.</p>
          <ul dir="auto">
            <li>إصلاح مشكلة التحديث التلقائي</li>
            <li>Fixed the auto-update flow</li>
          </ul>
          <table><tbody><tr><td>1.3.3</td><td>2026</td></tr></tbody></table>
        </div>
      </div>
      <form>
        <textarea name="comment[body]" id="new_comment_field" class="js-comment-field js-paste-markdown"></textarea>
      </form>
      <div class="MarkdownEditor-module__container__abc12">
        <textarea aria-label="Markdown value" placeholder="Type your description here…"></textarea>
      </div>
      <input id="repo_description" name="repo_description" type="text">
      <div class="diff-table"><textarea class="js-comment-field" id="inline-diff-note"></textarea></div>
    </main>`;
}

describe('GitHub adapter — mixed-direction technical text', () => {
  it('keeps the Arabic release paragraph RTL-capable while isolating technical fragments', () => {
    githubFixture();
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);

    const [p1, p2] = Array.from(document.querySelectorAll('.markdown-body > p'));
    // Paragraph direction is auto (host already had it; ours is idempotent).
    expect(p1!.getAttribute('dir')).toBe('auto');
    expect(p2!.getAttribute('dir')).toBe('auto');
    // The embedded file name stays visually LTR via element-level isolation.
    const inlineCode = p1!.querySelector('code')!;
    expect(inlineCode.getAttribute('dir')).toBe('ltr');
    expect((inlineCode as HTMLElement).style.getPropertyValue('unicode-bidi')).toBe('isolate');
    // The paragraph itself was NOT classified as protected.
    expect(p1!.hasAttribute(MARK_ATTR)).toBe(true);
    engine.stop();
  });

  it('never touches the command-line block or the numeric table', () => {
    githubFixture();
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    const pre = document.querySelector('pre')!;
    expect(pre.hasAttribute('dir')).toBe(false);
    expect(pre.querySelector('code')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('table td')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('fills GitHub\'s LI gap: list items get their own dir=auto', () => {
    githubFixture();
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    const [li1, li2] = Array.from(document.querySelectorAll('.markdown-body li'));
    expect(li1!.getAttribute('dir')).toBe('auto'); // Arabic item
    expect(li2!.getAttribute('dir')).toBe('auto'); // English item — each resolves independently
    engine.stop();
  });

  it('applies auto direction to all verified editors', () => {
    githubFixture();
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('#new_comment_field')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('[aria-label="Markdown value"]')!.getAttribute('dir')).toBe('auto');
    expect(document.querySelector('#repo_description')!.getAttribute('dir')).toBe('auto');
    engine.stop();
  });

  it('excludes editors inside diff/code surfaces', () => {
    githubFixture();
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    expect(document.querySelector('#inline-diff-note')!.hasAttribute('dir')).toBe(false);
    engine.stop();
  });

  it('respects a real host direction (author-set rtl in markdown)', () => {
    document.body.innerHTML =
      '<div class="markdown-body"><p dir="rtl">فقرة وجّهها الكاتب بنفسه</p></div>';
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    const p = document.querySelector('p')!;
    expect(p.getAttribute('dir')).toBe('rtl');
    expect(p.hasAttribute(MARK_ATTR)).toBe(false); // untouched
    engine.stop();
  });

  it('handles dynamically inserted comments (SPA timeline)', async () => {
    githubFixture();
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    const comment = document.createElement('div');
    comment.className = 'comment-body markdown-body';
    comment.innerHTML = '<p>تعليق جديد يحوي <code>npm install</code> داخله</p>';
    document.querySelector('main')!.appendChild(comment);
    await flushMutations();
    expect(comment.querySelector('p')!.getAttribute('dir')).toBe('auto');
    expect(comment.querySelector('code')!.getAttribute('dir')).toBe('ltr');
    engine.stop();
  });

  it('stop() restores the page byte-exactly', () => {
    githubFixture();
    const before = document.body.innerHTML;
    const engine = new DirectionEngine(githubAdapter);
    engine.start(CONFIG);
    expect(document.body.innerHTML).not.toBe(before);
    engine.stop();
    expect(document.body.innerHTML).toBe(before);
  });
});
