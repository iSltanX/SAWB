import { describe, expect, it } from 'vitest';
import {
  isNumericTable,
  isProtectedElement,
  isTechnicalText,
  isTechnicalToken,
} from '../src/core/classify';

describe('isTechnicalToken', () => {
  const technical = [
    'https://example.com/path?q=1',
    'http://x.io',
    'ftp://host/file',
    'www.example.com',
    'user@example.com',
    'v1.3.3',
    '1.0.0',
    '2.0.0-beta.1',
    'Raff_1.3.3_aarch64.dmg',
    'archive.tar.gz',
    'index.html',
    '/usr/local/bin',
    './relative/path',
    '~/home/dir',
    'C:\\Windows\\System32',
    '--force',
    '-v',
    '--out=dist',
    '@username',
    '#channel',
    '$HOME',
    '0xdeadbeef',
    'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    '1,234.56',
    '3.14',
    '100%',
    '`npm install`',
  ];
  for (const token of technical) {
    it(`technical: ${token}`, () => expect(isTechnicalToken(token)).toBe(true));
  }

  const natural = ['hello', 'مرحبا', 'Bonjour', 'كتاب', 'ChatGPT', "don't"];
  for (const token of natural) {
    it(`not technical: ${token}`, () => expect(isTechnicalToken(token)).toBe(false));
  }

  it('handles surrounding punctuation', () => {
    expect(isTechnicalToken('(https://example.com)')).toBe(true);
    expect(isTechnicalToken('"v1.2.3",')).toBe(true);
  });
});

describe('isTechnicalText', () => {
  it('JSON → technical', () => {
    expect(isTechnicalText('{"key": "value"}')).toBe(true);
    expect(isTechnicalText('[1, 2, 3]')).toBe(true);
  });
  it('all-technical tokens → technical', () => {
    expect(isTechnicalText('v1.2.3 https://x.com --flag')).toBe(true);
  });
  it('natural language → not technical', () => {
    expect(isTechnicalText('hello world')).toBe(false);
    expect(isTechnicalText('تحميل الملف v1.2.3')).toBe(false);
  });
});

describe('isProtectedElement', () => {
  function make(html: string): Element {
    document.body.innerHTML = html;
    return document.querySelector('[data-target]')!;
  }

  it('protects code, pre, kbd, samp and math containers', () => {
    expect(isProtectedElement(make('<pre><span data-target>x</span></pre>'))).toBe(true);
    expect(isProtectedElement(make('<code data-target>x</code>'))).toBe(true);
    expect(isProtectedElement(make('<kbd data-target>x</kbd>'))).toBe(true);
    expect(isProtectedElement(make('<div class="katex"><span data-target>x</span></div>'))).toBe(true);
    expect(isProtectedElement(make('<mjx-container><span data-target>x</span></mjx-container>'))).toBe(true);
  });

  it('protects code editors (CodeMirror, Monaco, Ace)', () => {
    expect(isProtectedElement(make('<div class="cm-editor"><div data-target contenteditable="true"></div></div>'))).toBe(true);
    expect(isProtectedElement(make('<div class="monaco-editor"><textarea data-target></textarea></div>'))).toBe(true);
    expect(isProtectedElement(make('<div class="ace_editor"><div data-target></div></div>'))).toBe(true);
  });

  it('protects syntax highlighting containers', () => {
    expect(isProtectedElement(make('<div class="highlight"><span data-target>x</span></div>'))).toBe(true);
    expect(isProtectedElement(make('<div class="language-js"><span data-target>x</span></div>'))).toBe(true);
  });

  it('honors adapter-specific exclusions', () => {
    const el = make('<nav><input data-target type="text"/></nav>');
    expect(isProtectedElement(el)).toBe(false);
    expect(isProtectedElement(el, 'nav, header')).toBe(true);
  });

  it('leaves ordinary content unprotected', () => {
    expect(isProtectedElement(make('<p data-target>مرحبا</p>'))).toBe(false);
  });
});

describe('isNumericTable', () => {
  function table(html: string): Element {
    document.body.innerHTML = `<table>${html}</table>`;
    return document.querySelector('table')!;
  }
  it('numbers-only table is numeric', () => {
    expect(isNumericTable(table('<tr><td>1.5</td><td>2048</td></tr>'))).toBe(true);
  });
  it('English-only table is treated as technical/LTR', () => {
    expect(isNumericTable(table('<tr><td>total</td><td>15</td></tr>'))).toBe(true);
  });
  it('table containing Arabic is not numeric', () => {
    expect(isNumericTable(table('<tr><td>المجموع</td><td>15</td></tr>'))).toBe(false);
  });
});
