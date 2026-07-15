import { describe, expect, it } from 'vitest';
import { charDirection, detectDirection, firstStrongDirection } from '../src/core/detect';

describe('charDirection', () => {
  it('classifies Arabic letters as rtl', () => {
    expect(charDirection('م')).toBe('rtl');
    expect(charDirection('ص')).toBe('rtl');
  });
  it('classifies Persian and Urdu letters as rtl', () => {
    expect(charDirection('پ')).toBe('rtl'); // Persian peh
    expect(charDirection('ٹ')).toBe('rtl'); // Urdu tteh
    expect(charDirection('ھ')).toBe('rtl'); // Urdu heh doachashmee
  });
  it('classifies Hebrew as rtl', () => {
    expect(charDirection('ש')).toBe('rtl');
  });
  it('classifies Latin as ltr', () => {
    expect(charDirection('a')).toBe('ltr');
    expect(charDirection('Z')).toBe('ltr');
  });
  it('treats digits, punctuation, emoji, symbols as neutral', () => {
    for (const ch of ['1', '٣', '.', '؟', '!', '😀', '→', ' ', '_', '%']) {
      expect(charDirection(ch)).toBeNull();
    }
  });
});

describe('detectDirection — plain text', () => {
  it('Arabic-only → rtl', () => {
    expect(detectDirection('مرحبا بالعالم')).toBe('rtl');
  });
  it('English-only → ltr', () => {
    expect(detectDirection('Hello world')).toBe('ltr');
  });
  it('mixed, Arabic first → rtl', () => {
    expect(detectDirection('مرحبا Hello world')).toBe('rtl');
  });
  it('mixed, English first → ltr', () => {
    expect(detectDirection('Hello مرحبا')).toBe('ltr');
  });
  it('numbers only → null (preserve current)', () => {
    expect(detectDirection('12345')).toBeNull();
    expect(detectDirection('١٢٣٤٥')).toBeNull(); // Arabic-Indic digits are still digits
    expect(detectDirection('3.14 + 2 = 5.14')).toBeNull();
  });
  it('punctuation only → null', () => {
    expect(detectDirection('... !!! ؟؟')).toBeNull();
  });
  it('emoji only → null', () => {
    expect(detectDirection('😀🎉👍')).toBeNull();
  });
  it('empty and whitespace → null', () => {
    expect(detectDirection('')).toBeNull();
    expect(detectDirection('   \n\t ')).toBeNull();
  });
  it('markdown prefixes are neutral', () => {
    expect(detectDirection('## مرحبا بالعنوان')).toBe('rtl');
    expect(detectDirection('- بند أول')).toBe('rtl');
    expect(detectDirection('> اقتباس')).toBe('rtl');
  });
});

describe('detectDirection — technical-token skipping', () => {
  it('skips a leading URL', () => {
    expect(detectDirection('https://example.com/x مرحبا')).toBe('rtl');
    expect(detectDirection('www.example.com حياك')).toBe('rtl');
  });
  it('skips a leading email address', () => {
    expect(detectDirection('user@example.com مرحبا')).toBe('rtl');
  });
  it('skips a leading filename', () => {
    expect(detectDirection('Raff_1.3.3_aarch64.dmg هذا الملف تالف')).toBe('rtl');
    expect(detectDirection('setup.tar.gz تنزيل')).toBe('rtl');
  });
  it('skips a leading version', () => {
    expect(detectDirection('v1.3.3 إصدار جديد')).toBe('rtl');
    expect(detectDirection('2.0.0-beta.1 نسخة تجريبية')).toBe('rtl');
  });
  it('skips leading inline code and flags', () => {
    expect(detectDirection('`npm i` ثبّت الحزمة')).toBe('rtl');
    expect(detectDirection('--force استخدم بحذر')).toBe('rtl');
  });
  it('still detects ltr when the meaningful text is English', () => {
    expect(detectDirection('v1.3.3 released today')).toBe('ltr');
  });
  it('technical-only text → null', () => {
    expect(detectDirection('https://example.com')).toBeNull();
    expect(detectDirection('v1.2.3 0xdeadbeef --flag')).toBeNull();
    expect(detectDirection('{"key": 1}')).toBeNull();
  });
  it('firstStrongDirection ignores skipping', () => {
    expect(firstStrongDirection('v1.3.3 مرحبا')).toBe('ltr'); // the v
    expect(detectDirection('v1.3.3 مرحبا')).toBe('rtl'); // token skipped
  });
});
