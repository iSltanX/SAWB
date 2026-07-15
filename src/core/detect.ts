/**
 * Direction detection — pure text analysis, no DOM.
 *
 * Rules (from the product spec):
 * - Direction comes from the first *meaningful* strong-language segment.
 * - Digits, punctuation, whitespace, emoji, and isolated symbols are neutral.
 * - Leading technical tokens (URLs, emails, paths, versions, code-ish tokens)
 *   are skipped when locating the first meaningful segment.
 * - Arabic, Persian, and Urdu (all Script=Arabic), plus the other RTL scripts,
 *   count as RTL; any other letter counts as LTR.
 * - No strong character at all → null (caller preserves current direction).
 */

import { isTechnicalToken } from './classify';
import type { Direction } from '../platform/types';

// Strong-RTL scripts. Arabic covers Persian and Urdu. Presentation forms
// (FB50–FDFF, FE70–FEFF) are part of Script=Arabic.
const RTL_SCRIPT = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const LETTER = /\p{L}/u;

/** Direction of a single code point; null when the character is neutral. */
export function charDirection(ch: string): Direction | null {
  if (!LETTER.test(ch)) return null; // digits, punctuation, emoji, symbols, marks
  return RTL_SCRIPT.test(ch) ? 'rtl' : 'ltr';
}

/** First strong direction in a string, with no token skipping. */
export function firstStrongDirection(text: string): Direction | null {
  for (const ch of text) {
    const d = charDirection(ch);
    if (d) return d;
  }
  return null;
}

export interface DetectOptions {
  /** Skip leading technical tokens (URLs, versions, filenames…). Default true. */
  skipTechnicalTokens?: boolean;
  /** Stop scanning after this many tokens (defensive bound). Default 64. */
  maxTokens?: number;
}

/**
 * Detect the direction of a piece of text from its first meaningful strong
 * segment. Returns null when the text has no strong directional character,
 * in which case the caller must preserve the current direction.
 */
export function detectDirection(text: string, opts: DetectOptions = {}): Direction | null {
  const { skipTechnicalTokens = true, maxTokens = 64 } = opts;
  if (!text) return null;

  if (!skipTechnicalTokens) return firstStrongDirection(text);

  const trimmed = text.trim();
  // JSON / array literals are technical wholesale.
  if (/^[[{]/.test(trimmed)) return null;
  // Inline code spans (`…`) are skipped as units, not as whitespace tokens.
  const withoutCodeSpans = trimmed.replace(/`[^`]*`/g, ' ');

  let count = 0;
  for (const token of withoutCodeSpans.split(/\s+/)) {
    if (!token) continue;
    if (++count > maxTokens) break;
    if (isTechnicalToken(token)) continue;
    const d = firstStrongDirection(token);
    if (d) return d;
  }
  // Every token was technical or neutral. A text made purely of technical
  // tokens has no meaningful segment; fall back to any strong char at all so
  // that e.g. a lone URL containing Latin letters stays stable for callers
  // that need *some* answer — but per spec, neutral-only text yields null.
  return null;
}
