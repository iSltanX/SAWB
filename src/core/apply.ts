/**
 * DOM application layer.
 *
 * SAWB never mutates text content. It only sets the `dir` attribute (and, for
 * inline technical elements, `unicode-bidi: isolate`) and can restore every
 * element to its original state. Original values are snapshotted in a WeakMap
 * and touched elements carry a `data-sawb` marker for discovery at restore
 * time.
 */

import { isProtectedElement, isNumericTable, TECHNICAL_INLINE_SELECTOR } from './classify';
import type { Mode } from '../platform/types';

export const MARK_ATTR = 'data-sawb';
export type MarkKind = 'field' | 'display';

interface OriginalState {
  dir: string | null;
  styleDirection: string;
  styleUnicodeBidi: string;
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
      hadStyleAttr: el.hasAttribute('style'),
    });
  }
  const current = el.getAttribute(MARK_ATTR);
  if (current !== kind) {
    // 'field' wins over 'display' if an element is somehow both.
    el.setAttribute(MARK_ATTR, current === 'field' ? 'field' : kind);
  }
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

/** Restore one element to its exact original state. */
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
      if (!original.hadStyleAttr && style.length === 0) el.removeAttribute('style');
    }
    originals.delete(el);
  } else {
    // Marked but unknown (e.g. host cloned our node): strip our footprint.
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
}

/**
 * True when the host page explicitly set a MEANINGFUL direction (not us).
 * `dir="auto"` does not count: it is an auto-detection instruction, not a
 * fixed direction — refining it per leaf block (e.g. GitHub sets dir=auto on
 * UL but not LI, so mixed lists resolve wrong) does not contradict host
 * intent. Only rtl/ltr values and inline direction styles count.
 */
export function hasExplicitHostDir(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (!node.hasAttribute(MARK_ATTR)) {
      const value = node.getAttribute('dir')?.toLowerCase();
      if (value === 'rtl' || value === 'ltr') return true;
    }
    const style = (node as HTMLElement).style;
    if (style && style.direction) return true;
    node = node.parentElement;
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
    if (isProtectedElement(block, opts.excludeSelector)) continue;
    const table = block.closest('table');
    if (table && isNumericTable(table)) continue;
    if ((block.textContent ?? '').trim() === '') continue;

    if (mode === 'auto') {
      if (opts.respectHostDir && hasExplicitHostDir(block)) {
        // Leaving manual mode: hand the block back to the host.
        if (block.hasAttribute(MARK_ATTR)) restoreElement(block);
        continue;
      }
      setDir(block, 'auto', 'display');
    } else {
      setDir(block, mode, 'display');
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
