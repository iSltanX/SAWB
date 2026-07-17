/**
 * DOM application layer.
 *
 * SAWB never mutates text content. It only sets the `dir` attribute (and, for
 * inline technical elements, `unicode-bidi: isolate`) and can restore every
 * element to its original state. Original values are snapshotted in a WeakMap
 * and touched elements carry a `data-sawb` marker for discovery at restore
 * time.
 *
 * «راحة القراءة» (reading-comfort typography — font-size/line-height on
 * RTL-classified display blocks) shares this exact discipline: same
 * snapshot/restore WeakMap, no new DOM marker. It never touches fields, only
 * displayed content, and only blocks classified RTL.
 *
 * Typography additionally tracks PER-PROPERTY OWNERSHIP (see TypographyProp),
 * because — unlike `dir` — the host commonly owns `font-size`/`line-height`
 * itself and may take a property back at any moment. SAWB only ever reverts a
 * property it still owns; a value the host wrote after us is authoritative and
 * is never overwritten, never reverted, and becomes the new baseline.
 */

import { isProtectedElement, isNumericTable, TECHNICAL_INLINE_SELECTOR } from './classify';
import { detectDirection } from './detect';
import { clampFontScale, clampLineHeight, type Mode } from '../platform/types';

export const MARK_ATTR = 'data-sawb';
export type MarkKind = 'field' | 'display';

/** The two style properties reading-comfort typography may own. */
type TypographyProp = 'fontSize' | 'lineHeight';

const TYPOGRAPHY_PROPS: readonly TypographyProp[] = ['fontSize', 'lineHeight'];

/** CSS property name for a tracked typography property (for removeProperty). */
const CSS_NAME: Record<TypographyProp, string> = {
  fontSize: 'font-size',
  lineHeight: 'line-height',
};

/**
 * Ownership record for one typography property.
 *
 * - `baseline` — the value to put back when SAWB releases the property. It is
 *   the host's value as of the last time SAWB did NOT own the property, and is
 *   re-based whenever the host takes the property over.
 * - `sawbValue` — the exact string SAWB last wrote. Ownership is only credible
 *   while the live value still equals it; any drift means the host took over.
 * - `owned` — whether SAWB currently considers the property its own.
 */
interface PropOwnership {
  baseline: string;
  sawbValue: string;
  owned: boolean;
}

interface OriginalState {
  dir: string | null;
  styleDirection: string;
  styleUnicodeBidi: string;
  typography: Record<TypographyProp, PropOwnership>;
  hadStyleAttr: boolean;
}

const originals = new WeakMap<Element, OriginalState>();

function snapshot(el: Element, kind: MarkKind): void {
  if (!originals.has(el)) {
    const style = (el as HTMLElement).style;
    originals.set(el, {
      dir: el.getAttribute('dir'),
      styleDirection: style ? style.direction : '',
      styleUnicodeBidi: style ? style.getPropertyValue('unicode-bidi') : '',
      // First touch never claims typography: SAWB owns a property only once
      // it has actually written it (see setTypography).
      typography: {
        fontSize: { baseline: style ? style.fontSize : '', sawbValue: '', owned: false },
        lineHeight: { baseline: style ? style.lineHeight : '', sawbValue: '', owned: false },
      },
      hadStyleAttr: el.hasAttribute('style'),
    });
  }
  const current = el.getAttribute(MARK_ATTR);
  if (current !== kind) {
    // 'field' wins over 'display' if an element is somehow both.
    el.setAttribute(MARK_ATTR, current === 'field' ? 'field' : kind);
  }
}

/** True when SAWB currently owns `prop` on `el`. */
function ownsProp(el: Element, prop: TypographyProp): boolean {
  return originals.get(el)?.typography[prop].owned ?? false;
}

/** Drop the `style` attribute if SAWB emptied it and the host never had one. */
function tidyStyleAttr(el: Element, original: OriginalState): void {
  const style = (el as HTMLElement).style;
  if (style && !original.hadStyleAttr && style.length === 0) el.removeAttribute('style');
}

/** Idempotent `dir` write; returns true when the DOM actually changed. */
export function setDir(el: Element, dir: 'auto' | 'rtl' | 'ltr', kind: MarkKind): boolean {
  if (el.getAttribute('dir') === dir && el.hasAttribute(MARK_ATTR)) return false;
  snapshot(el, kind);
  el.setAttribute('dir', dir);
  return true;
}

/** LTR bidi isolation for an inline technical element (code, kbd, URL link…). */
export function isolateLtr(el: Element, kind: MarkKind): boolean {
  const style = (el as HTMLElement).style;
  if (el.getAttribute('dir') === 'ltr' && style?.getPropertyValue('unicode-bidi') === 'isolate') {
    return false;
  }
  snapshot(el, kind);
  el.setAttribute('dir', 'ltr');
  style?.setProperty('unicode-bidi', 'isolate');
  return true;
}

/**
 * Release one typography property: put the baseline back if SAWB still owns
 * the property, otherwise leave the host's newer value alone and adopt it as
 * the baseline. Either way SAWB stops owning the property.
 */
function releaseTypographyProp(el: Element, original: OriginalState, prop: TypographyProp): void {
  const style = (el as HTMLElement).style;
  const state = original.typography[prop];
  if (!style) {
    state.owned = false;
    state.sawbValue = '';
    return;
  }
  if (state.owned && style[prop] === state.sawbValue) {
    // Still ours and untouched since we wrote it → hand the baseline back.
    if (state.baseline) style[prop] = state.baseline;
    else style.removeProperty(CSS_NAME[prop]);
  } else if (state.owned) {
    // The host overwrote our value: its value wins and becomes the baseline.
    state.baseline = style[prop];
  }
  state.owned = false;
  state.sawbValue = '';
}

/**
 * Restore one element to its original state.
 *
 * `dir`/`direction`/`unicode-bidi` are restored unconditionally (SAWB is their
 * sole writer). Typography is restored only where SAWB still owns the
 * property — a font-size the host took over after us is newer than our
 * snapshot and must survive teardown untouched.
 */
export function restoreElement(el: Element): void {
  const original = originals.get(el);
  const style = (el as HTMLElement).style;
  if (original) {
    if (original.dir === null) el.removeAttribute('dir');
    else el.setAttribute('dir', original.dir);
    if (style) {
      style.direction = original.styleDirection;
      if (original.styleUnicodeBidi) style.setProperty('unicode-bidi', original.styleUnicodeBidi);
      else style.removeProperty('unicode-bidi');
      for (const prop of TYPOGRAPHY_PROPS) releaseTypographyProp(el, original, prop);
      tidyStyleAttr(el, original);
    }
    originals.delete(el);
  } else {
    // Marked but unknown (e.g. host cloned our node): strip our dir footprint.
    // Typography is NOT stripped here: with no ownership record we cannot tell
    // our value from the host's, and guessing would delete the host's styling.
    el.removeAttribute('dir');
    if (style) {
      style.direction = '';
      style.removeProperty('unicode-bidi');
      if (style.length === 0) el.removeAttribute('style');
    }
  }
  el.removeAttribute(MARK_ATTR);
}

/** Restore every touched element under (and including) `root`. */
export function restoreAll(root: ParentNode & { querySelectorAll: Element['querySelectorAll'] }, kind?: MarkKind): void {
  const selector = kind ? `[${MARK_ATTR}="${kind}"]` : `[${MARK_ATTR}]`;
  if (root instanceof Element && root.matches(selector)) restoreElement(root);
  for (const el of Array.from(root.querySelectorAll(selector))) restoreElement(el);
}

// ── Fields ───────────────────────────────────────────────────────────────────

const BLOCK_SELECTOR = 'p, div, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, figcaption, summary';

export function isFormField(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    // email/url/tel/number and friends are inherently LTR technical inputs.
    return type === 'text' || type === 'search';
  }
  return false;
}

export function isEditableRoot(el: Element): boolean {
  const value = el.getAttribute('contenteditable');
  return value === '' || value === 'true' || value === 'plaintext-only';
}

/**
 * Apply a direction mode to a writing field — always at the ROOT element.
 *
 * Rich editors (ProseMirror on chatgpt.com, verified live 2026-07-15)
 * recreate their block nodes whenever an outside attribute lands on them, so
 * per-block writes inside a live editor fight the editor's reconciliation
 * forever. The root element's attributes are outside the editor's managed
 * schema: `dir` set there persists across transactions, and `dir=auto`
 * resolves from the editor's first strong character natively.
 */
export function applyToField(el: Element, mode: Mode, excludeSelector?: string): void {
  if (isProtectedElement(el, excludeSelector)) return;

  if (isFormField(el)) {
    setDir(el, mode === 'auto' ? 'auto' : mode, 'field');
    return;
  }

  if (!isEditableRoot(el)) return;

  setDir(el, mode === 'auto' ? 'auto' : mode, 'field');
  // Clear any per-block markers left inside by earlier versions/passes.
  for (const block of Array.from(el.querySelectorAll(`[${MARK_ATTR}="field"]`))) {
    restoreElement(block);
  }
}

/** Leaf blocks (blocks with no block children) get `dir=auto`. */
function leafBlocks(root: Element): Element[] {
  const all = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  const leaves = all.filter((b) => !b.querySelector(BLOCK_SELECTOR));
  // Roots with no block children at all: the root itself is the one block.
  return leaves.length > 0 ? leaves : [root];
}

// ── Displayed content ────────────────────────────────────────────────────────

export interface DisplayOptions {
  /**
   * Requirement 7: in auto mode, skip blocks whose direction the host set
   * explicitly — unless the adapter declares the surface as known-broken.
   */
  respectHostDir: boolean;
  excludeSelector?: string;
  /**
   * Reading-comfort typography, or null/undefined when the feature is off
   * for this page (requires display=true — see resolveEffectiveConfig).
   * Applied only to blocks classified RTL by `classifyRtl`.
   */
  typography?: { fontScale: number; lineHeight: number } | null;
}

/**
 * The MEANINGFUL direction the host page explicitly set (not us), or null.
 * `dir="auto"` does not count: it is an auto-detection instruction, not a
 * fixed direction — refining it per leaf block (e.g. GitHub sets dir=auto on
 * UL but not LI, so mixed lists resolve wrong) does not contradict host
 * intent. Only rtl/ltr values and inline direction styles count.
 */
function explicitHostDirValue(el: Element): 'rtl' | 'ltr' | null {
  let node: Element | null = el;
  while (node) {
    if (!node.hasAttribute(MARK_ATTR)) {
      const value = node.getAttribute('dir')?.toLowerCase();
      if (value === 'rtl' || value === 'ltr') return value;
    }
    const style = (node as HTMLElement).style;
    if (style && style.direction) {
      const value = style.direction.toLowerCase();
      if (value === 'rtl' || value === 'ltr') return value;
    }
    node = node.parentElement;
  }
  return null;
}

/** True when the host page explicitly set a meaningful direction (not us). */
export function hasExplicitHostDir(el: Element): boolean {
  return explicitHostDirValue(el) !== null;
}

/**
 * Classify a block as RTL from an ALREADY-RESOLVED host direction, so callers
 * that had to compute it anyway do not walk the ancestor chain twice.
 *
 * - Manual mode forces the classification uniformly (`rtl`→true, `ltr`→false),
 *   matching how manual mode forces `dir` on every block regardless of text.
 * - Auto mode: an explicit host direction wins; otherwise the block's own
 *   first strong character decides, exactly like `dir=auto`.
 */
function classifyRtlWithHostDir(
  block: Element,
  mode: Mode,
  hostDir: 'rtl' | 'ltr' | null,
): boolean {
  if (mode === 'rtl') return true;
  if (mode === 'ltr') return false;
  if (hostDir) return hostDir === 'rtl';
  return detectDirection(block.textContent ?? '') === 'rtl';
}

/**
 * Classify a display block as RTL or not — the SAME classification
 * `applyToDisplay` uses to decide `dir`, so direction and typography can never
 * disagree about a block.
 */
export function classifyRtl(block: Element, mode: Mode, respectHostDir: boolean): boolean {
  const hostDir = mode === 'auto' && respectHostDir ? explicitHostDirValue(block) : null;
  return classifyRtlWithHostDir(block, mode, hostDir);
}

/**
 * Write one typography property, honouring ownership.
 *
 * Not owned yet → the live value is the host's current baseline; claim the
 * property and write. Owned and unchanged since we wrote it → update freely.
 * Owned but the live value drifted → the host took the property over after
 * us: leave its value alone, re-base to it, and release ownership. We do not
 * re-assert in the same pass; a later pass may claim it again only once the
 * host stops fighting (which `hostWonFight` also guards at element level).
 */
function writeTypographyProp(
  el: Element,
  original: OriginalState,
  prop: TypographyProp,
  value: string,
): boolean {
  const style = (el as HTMLElement).style;
  const state = original.typography[prop];

  if (state.owned && style[prop] !== state.sawbValue) {
    state.baseline = style[prop];
    state.owned = false;
    state.sawbValue = '';
    return false;
  }
  if (!state.owned) state.baseline = style[prop];
  if (style[prop] === value && state.owned) return false;

  style[prop] = value;
  state.sawbValue = value;
  state.owned = true;
  return true;
}

/**
 * Reading-comfort typography for one block. `fontScale` is a multiplier
 * relative to the block's own size (e.g. 1.08 → "108%"), never an absolute px
 * value, so it follows whatever size the host page already uses; `lineHeight`
 * is unitless. Both are clamped here as a last resort so no value — however
 * corrupt its source — can reach the DOM out of range.
 *
 * Returns true when the DOM actually changed.
 */
export function setTypography(el: Element, fontScale: number, lineHeight: number): boolean {
  const style = (el as HTMLElement).style;
  if (!style) return false;
  const fontSize = `${Math.round(clampFontScale(fontScale) * 100)}%`;
  const lineHeightValue = String(clampLineHeight(lineHeight));

  snapshot(el, 'display');
  const original = originals.get(el)!;
  const wroteFont = writeTypographyProp(el, original, 'fontSize', fontSize);
  const wroteLine = writeTypographyProp(el, original, 'lineHeight', lineHeightValue);
  const changed = wroteFont || wroteLine;
  if (changed) tidyStyleAttr(el, original);
  return changed;
}

/**
 * Release SAWB's typography on a block without touching `dir`/MARK_ATTR —
 * used when a block stops being RTL (e.g. a streamed reply switches language)
 * or when the feature is turned off, while direction handling continues
 * independently. Properties the host has taken over are left exactly as the
 * host set them. A block SAWB never snapshotted is untouched entirely.
 */
export function clearTypography(el: Element): void {
  const original = originals.get(el);
  if (!original) return;
  if (!(el as HTMLElement).style) return;
  for (const prop of TYPOGRAPHY_PROPS) releaseTypographyProp(el, original, prop);
  tidyStyleAttr(el, original);
}

/**
 * True when an ancestor of `block` currently owns SAWB's relative font-size.
 * A percentage font-size on both an ancestor and its descendant multiplies
 * (1.08 × 1.08 = 1.166), so the descendant must be skipped — it already
 * inherits the scale.
 *
 * Only `font-size` is tested, because only it compounds: `line-height` is a
 * unitless multiplier that resolves against each element's own size, so an
 * ancestor owning it imposes nothing on the descendant.
 *
 * OWNERSHIP is the test, not mere presence in `originals`: an ancestor SAWB
 * only set `dir` on, and an ancestor whose font-size the host has taken over,
 * both impose no scale of ours and must not suppress the descendant.
 *
 * Only marked elements can own typography, so the walk hops between marked
 * ancestors via `closest` instead of visiting every element in the chain.
 */
function ancestorOwnsFontScale(block: Element): boolean {
  let node = block.parentElement?.closest(`[${MARK_ATTR}]`) ?? null;
  while (node) {
    if (ownsProp(node, 'fontSize')) return true;
    node = node.parentElement?.closest(`[${MARK_ATTR}]`) ?? null;
  }
  return false;
}

/**
 * Apply a direction mode to a displayed-content root: per-leaf-block dir, with
 * protected content skipped and inline technical elements LTR-isolated.
 */
export function applyToDisplay(root: Element, mode: Mode, opts: DisplayOptions): void {
  if (isProtectedElement(root, opts.excludeSelector)) return;

  for (const block of leafBlocks(root)) {
    if (isProtectedElement(block, opts.excludeSelector)) {
      // A block SAWB manages can BECOME protected (the host turns it into a
      // code sample, or an adapter exclusion starts matching). Withdraw our
      // dir and the typography we still own instead of walking away and
      // leaving them stranded; anything the host has taken over is left as-is.
      if (block.hasAttribute(MARK_ATTR)) restoreElement(block);
      continue;
    }
    const table = block.closest('table');
    if (table && isNumericTable(table)) continue;
    if ((block.textContent ?? '').trim() === '') continue;

    // Resolved once per block and reused for the hand-back check AND the
    // classification — one ancestor walk, one detectDirection at most.
    const hostDir =
      mode === 'auto' && opts.respectHostDir ? explicitHostDirValue(block) : null;
    if (hostDir) {
      // Host owns this block's direction: hand it back — direction AND
      // typography both stay out of a block SAWB doesn't own.
      if (block.hasAttribute(MARK_ATTR)) restoreElement(block);
      continue;
    }

    const isRtl = classifyRtlWithHostDir(block, mode, hostDir);
    setDir(block, mode === 'auto' ? 'auto' : mode, 'display');

    // A relative scale on an ancestor already reaches this block through
    // inheritance; applying it again here would multiply the two.
    if (opts.typography && isRtl && !ancestorOwnsFontScale(block)) {
      setTypography(block, opts.typography.fontScale, opts.typography.lineHeight);
    } else {
      clearTypography(block);
    }
  }

  // Inline technical content inside the root stays visually LTR regardless of
  // the surrounding paragraph direction (requirement 8) — element-level
  // isolation only, never text mutation. `pre` subtrees are already protected.
  for (const inline of Array.from(root.querySelectorAll(TECHNICAL_INLINE_SELECTOR))) {
    if (inline.closest('pre')) continue;
    if (inline.hasAttribute('dir') && !inline.hasAttribute(MARK_ATTR)) continue; // host's call
    isolateLtr(inline, 'display');
  }
}
