/**
 * Classification of technical content — tokens that must stay LTR and
 * elements that must never receive automatic direction changes.
 */

// ── Token classification ─────────────────────────────────────────────────────

const URL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const VERSION_RE = /^v?\d+(?:\.\d+)+(?:[-+][\w.]+)?$/i; // 1.2, v1.3.3, 2.0.0-beta.1
const FILENAME_RE = /^[\w~$@()[\]{}+=,-]+(?:\.[\w-]{1,12})+$/; // Raff_1.3.3_aarch64.dmg
const PATH_RE = /^(?:\.{0,2}\/|~\/|[A-Za-z]:\\)[^\s]*$/; // /usr/bin, ./x, ~/y, C:\z
const CLI_FLAG_RE = /^--?[A-Za-z][\w-]*(?:=\S*)?$/; // -v, --force, --out=x
const HANDLE_RE = /^[@#][\w./-]+$/; // @user, #channel
const HEX_RE = /^(?:0x[0-9a-f]+|[0-9a-f]{7,64})$/i; // pointers, commit hashes
const NUMERIC_RE = /^[\d\s.,:;%°xX*/+±=~<>()-]+$/; // numbers, ranges, dimensions
const INLINE_CODE_RE = /^`[^`]*`$/;
const ENV_VAR_RE = /^\$[A-Z_][A-Z0-9_]*$/;

/** Punctuation commonly wrapped around a token in prose: (x), "x", x, x. */
function stripSurroundingPunctuation(token: string): string {
  return token.replace(/^[([{"'«”“]+/, '').replace(/[)\]}"'»”“!?,;:.]+$/, '');
}

/**
 * True when a whitespace-delimited token is technical content (URL, email,
 * filename, version, path, flag, hash, inline code…) that must not decide
 * paragraph direction and should remain visually LTR.
 */
export function isTechnicalToken(rawToken: string): boolean {
  if (INLINE_CODE_RE.test(rawToken)) return true;
  const token = stripSurroundingPunctuation(rawToken);
  if (!token) return false;
  return (
    URL_RE.test(token) ||
    EMAIL_RE.test(token) ||
    VERSION_RE.test(token) ||
    PATH_RE.test(token) ||
    CLI_FLAG_RE.test(token) ||
    HANDLE_RE.test(token) ||
    ENV_VAR_RE.test(token) ||
    HEX_RE.test(token) ||
    NUMERIC_RE.test(token) ||
    FILENAME_RE.test(token)
  );
}

/** True when an entire string looks like technical content (URL, code, JSON…). */
export function isTechnicalText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[[{]/.test(trimmed)) return true; // JSON / array literal
  const tokens = trimmed.split(/\s+/);
  return tokens.every((t) => isTechnicalToken(t));
}

// ── Element protection ────────────────────────────────────────────────────────

/**
 * Elements that must never receive automatic direction transformations:
 * code, math, syntax-highlighted and code-editor surfaces.
 * Adapters extend this list with site-specific exclusions.
 */
export const PROTECTED_SELECTOR = [
  'pre',
  'code',
  'kbd',
  'samp',
  'var',
  'tt',
  'script',
  'style',
  'math',
  'mjx-container',
  '.katex',
  '.katex-display',
  '.MathJax',
  '.cm-editor', // CodeMirror 6
  '.cm-content',
  '.CodeMirror', // CodeMirror 5
  '.monaco-editor',
  '.ace_editor',
  '.highlight', // GitHub-style syntax highlighting
  '.hljs',
  '[class*="language-"]',
].join(',');

/** Inline elements that carry technical content and get LTR isolation. */
export const TECHNICAL_INLINE_SELECTOR = 'code, kbd, samp, var, tt';

export function isProtectedElement(el: Element, extraExcludeSelector?: string): boolean {
  if (el.closest(PROTECTED_SELECTOR)) return true;
  if (extraExcludeSelector && el.closest(extraExcludeSelector)) return true;
  return false;
}

/**
 * A table whose text has no strong RTL content is treated as a numeric/technical
 * table and left untouched.
 */
export function isNumericTable(table: Element): boolean {
  const text = table.textContent ?? '';
  return !/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u.test(text);
}
