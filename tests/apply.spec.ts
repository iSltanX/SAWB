import { describe, expect, it } from 'vitest';
import {
  applyToDisplay,
  applyToField,
  hasExplicitHostDir,
  isFormField,
  MARK_ATTR,
  restoreAll,
  setDir,
} from '../src/core/apply';

describe('setDir / restore round-trip', () => {
  it('marks, applies and restores an element with no prior dir', () => {
    document.body.innerHTML = '<input type="text">';
    const input = document.querySelector('input')!;
    expect(setDir(input, 'auto', 'field')).toBe(true);
    expect(input.getAttribute('dir')).toBe('auto');
    expect(input.hasAttribute(MARK_ATTR)).toBe(true);
    restoreAll(document);
    expect(input.hasAttribute('dir')).toBe(false);
    expect(input.hasAttribute(MARK_ATTR)).toBe(false);
  });

  it('restores a host-provided dir exactly', () => {
    document.body.innerHTML = '<textarea dir="ltr"></textarea>';
    const el = document.querySelector('textarea')!;
    setDir(el, 'rtl', 'field');
    expect(el.getAttribute('dir')).toBe('rtl');
    restoreAll(document);
    expect(el.getAttribute('dir')).toBe('ltr');
  });

  it('is idempotent — a second identical write reports no change', () => {
    document.body.innerHTML = '<input type="text">';
    const input = document.querySelector('input')!;
    expect(setDir(input, 'auto', 'field')).toBe(true);
    expect(setDir(input, 'auto', 'field')).toBe(false);
  });

  it('restores selectively by kind', () => {
    document.body.innerHTML = '<input type="text"><p>مرحبا</p>';
    setDir(document.querySelector('input')!, 'auto', 'field');
    setDir(document.querySelector('p')!, 'auto', 'display');
    restoreAll(document, 'field');
    expect(document.querySelector('input')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('p')!.getAttribute('dir')).toBe('auto');
  });
});

describe('isFormField', () => {
  it('accepts text, search, and untyped inputs plus textareas', () => {
    document.body.innerHTML =
      '<input type="text"><input type="search"><input><textarea></textarea>';
    for (const el of Array.from(document.body.children)) {
      expect(isFormField(el)).toBe(true);
    }
  });
  it('rejects inherently-LTR technical inputs', () => {
    document.body.innerHTML =
      '<input type="email"><input type="url"><input type="tel"><input type="number"><input type="password">';
    for (const el of Array.from(document.body.children)) {
      expect(isFormField(el)).toBe(false);
    }
  });
});

describe('applyToField', () => {
  it('sets dir=auto on inputs in auto mode', () => {
    document.body.innerHTML = '<input type="text">';
    const input = document.querySelector('input')!;
    applyToField(input, 'auto');
    expect(input.getAttribute('dir')).toBe('auto');
  });

  it('sets explicit dir in manual modes', () => {
    document.body.innerHTML = '<textarea></textarea>';
    const el = document.querySelector('textarea')!;
    applyToField(el, 'rtl');
    expect(el.getAttribute('dir')).toBe('rtl');
    applyToField(el, 'ltr');
    expect(el.getAttribute('dir')).toBe('ltr');
  });

  it('never touches fields inside protected containers', () => {
    document.body.innerHTML = '<div class="cm-editor"><div contenteditable="true"></div></div>';
    const el = document.querySelector('[contenteditable]')!;
    applyToField(el, 'rtl');
    expect(el.hasAttribute('dir')).toBe(false);
  });

  it('contenteditable manual mode: root-level dir', () => {
    document.body.innerHTML =
      '<div contenteditable="true"><p>Hello</p><p>مرحبا</p></div>';
    const root = document.querySelector('[contenteditable]')!;
    applyToField(root, 'rtl');
    expect(root.getAttribute('dir')).toBe('rtl');
    expect(root.querySelector('p')!.hasAttribute('dir')).toBe(false);
  });

  it('contenteditable auto mode: per-leaf-block dir=auto', () => {
    document.body.innerHTML =
      '<div contenteditable="true"><p>مرحبا بالعالم</p><p>Hello world</p></div>';
    const root = document.querySelector('[contenteditable]')!;
    applyToField(root, 'auto');
    expect(root.hasAttribute('dir')).toBe(false); // root left to the editor
    const [p1, p2] = Array.from(root.querySelectorAll('p'));
    expect(p1!.getAttribute('dir')).toBe('auto');
    expect(p2!.getAttribute('dir')).toBe('auto');
  });

  it('empty paragraph inherits the previous block direction (caret stability)', () => {
    document.body.innerHTML =
      '<div contenteditable="true"><p>مرحبا بالعالم</p><p><br></p></div>';
    const root = document.querySelector('[contenteditable]')!;
    applyToField(root, 'auto');
    const [p1, p2] = Array.from(root.querySelectorAll('p'));
    expect(p1!.getAttribute('dir')).toBe('auto');
    expect(p2!.getAttribute('dir')).toBe('rtl'); // inherited from Arabic paragraph
  });

  it('switching manual → auto releases the root back to the editor', () => {
    document.body.innerHTML = '<div contenteditable="true"><p>Hello</p></div>';
    const root = document.querySelector('[contenteditable]')!;
    applyToField(root, 'rtl');
    expect(root.getAttribute('dir')).toBe('rtl');
    applyToField(root, 'auto');
    expect(root.hasAttribute('dir')).toBe(false);
    expect(root.querySelector('p')!.getAttribute('dir')).toBe('auto');
  });

  it('single-line editor with no blocks: the root is the block', () => {
    document.body.innerHTML = '<div contenteditable="true">مرحبا</div>';
    const root = document.querySelector('[contenteditable]')!;
    applyToField(root, 'auto');
    expect(root.getAttribute('dir')).toBe('auto');
  });
});

describe('applyToDisplay', () => {
  const noRespect = { respectHostDir: false };
  const respect = { respectHostDir: true };

  it('applies dir=auto per leaf block', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>مرحبا</p><p>Hello</p><ul><li>بند</li></ul></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', noRespect);
    expect(root.querySelectorAll('[dir="auto"]').length).toBe(3);
  });

  it('never touches code blocks, pre, or math', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>مرحبا</p><pre><code>const x = 1;</code></pre><div class="katex"><span>x^2</span></div></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'rtl', noRespect);
    expect(document.querySelector('pre')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('pre code')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('.katex span')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('p')!.getAttribute('dir')).toBe('rtl');
  });

  it('isolates inline technical elements as LTR (requirement 8)', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>لتثبيت الإصدار <code>Raff_1.3.3_aarch64.dmg</code> اتبع الخطوات</p></div>';
    const root = document.querySelector('.markdown')!;
    applyToDisplay(root, 'auto', noRespect);
    const p = document.querySelector('p')!;
    const code = document.querySelector('code')!;
    expect(p.getAttribute('dir')).toBe('auto'); // paragraph stays auto→RTL
    expect(code.getAttribute('dir')).toBe('ltr'); // token isolated LTR
    expect((code as HTMLElement).style.getPropertyValue('unicode-bidi')).toBe('isolate');
  });

  it('respects an explicit host dir in auto mode (requirement 7)', () => {
    document.body.innerHTML = '<article><p dir="ltr">نص عربي</p><p>نص آخر</p></article>';
    const root = document.querySelector('article')!;
    applyToDisplay(root, 'auto', respect);
    const [p1, p2] = Array.from(document.querySelectorAll('p'));
    expect(p1!.getAttribute('dir')).toBe('ltr'); // host's choice preserved
    expect(p1!.hasAttribute(MARK_ATTR)).toBe(false);
    expect(p2!.getAttribute('dir')).toBe('auto');
  });

  it('overrides host dir when the adapter declares the surface broken', () => {
    document.body.innerHTML = '<div class="markdown"><p dir="ltr">نص عربي</p></div>';
    applyToDisplay(document.querySelector('.markdown')!, 'auto', noRespect);
    expect(document.querySelector('p')!.getAttribute('dir')).toBe('auto');
  });

  it('manual mode is an explicit user override of host dir', () => {
    document.body.innerHTML = '<article><p dir="ltr">نص عربي</p></article>';
    applyToDisplay(document.querySelector('article')!, 'rtl', respect);
    expect(document.querySelector('p')!.getAttribute('dir')).toBe('rtl');
    restoreAll(document);
    expect(document.querySelector('p')!.getAttribute('dir')).toBe('ltr');
  });

  it('skips numeric/technical tables, processes Arabic tables', () => {
    document.body.innerHTML = `
      <article>
        <table id="nums"><tbody><tr><td>1.5</td><td>2.5</td></tr></tbody></table>
        <table id="ar"><tbody><tr><td>المجموع</td><td>15</td></tr></tbody></table>
      </article>`;
    applyToDisplay(document.querySelector('article')!, 'auto', noRespect);
    expect(document.querySelector('#nums td')!.hasAttribute('dir')).toBe(false);
    expect(document.querySelector('#ar td')!.getAttribute('dir')).toBe('auto');
  });

  it('skips empty blocks', () => {
    document.body.innerHTML = '<article><p></p><p>نص</p></article>';
    applyToDisplay(document.querySelector('article')!, 'auto', noRespect);
    const [p1, p2] = Array.from(document.querySelectorAll('p'));
    expect(p1!.hasAttribute('dir')).toBe(false);
    expect(p2!.getAttribute('dir')).toBe('auto');
  });

  it('full restore returns the DOM to its original state', () => {
    document.body.innerHTML =
      '<div class="markdown"><p>مرحبا <code>x.dmg</code></p><p dir="rtl">ثابت</p></div>';
    const before = document.body.innerHTML;
    applyToDisplay(document.querySelector('.markdown')!, 'auto', noRespect);
    expect(document.body.innerHTML).not.toBe(before);
    restoreAll(document);
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('hasExplicitHostDir', () => {
  it('detects dir on the element or an ancestor, ignoring our marks', () => {
    document.body.innerHTML = '<div dir="rtl"><p id="a">x</p></div><p id="b">y</p>';
    expect(hasExplicitHostDir(document.querySelector('#a')!)).toBe(true);
    expect(hasExplicitHostDir(document.querySelector('#b')!)).toBe(false);
    const b = document.querySelector('#b')!;
    setDir(b, 'auto', 'display');
    expect(hasExplicitHostDir(b)).toBe(false); // our own mark is not host dir
  });
});
