/**
 * Direction engine — orchestrates adapter discovery, DOM application, and
 * batched observation. Contains no site-specific selectors.
 */

import type { SiteAdapter } from '../adapters/types';
import type { EffectiveConfig, Mode } from '../platform/types';
import { applyToField, applyToDisplay, restoreAll, restoreElement, isFormField, MARK_ATTR } from './apply';
import { BatchedObserver } from './observe';

/** A host fighting us this often over one element wins that element. */
const REASSERT_LIMIT = 10;
const REASSERT_WINDOW_MS = 3000;

export class DirectionEngine {
  private observer: BatchedObserver | null = null;
  private config: EffectiveConfig | null = null;
  private surrendered = new WeakSet<Element>();
  private reasserts = new Map<Element, { count: number; since: number }>();
  private readonly fieldSelector: string;
  private readonly displaySelector: string;
  private readonly excludeSelector: string | undefined;

  constructor(
    private readonly adapter: SiteAdapter,
    private readonly doc: Document = document,
  ) {
    this.fieldSelector = adapter.fieldSelectors.join(', ');
    this.displaySelector = adapter.displaySelectors.join(', ');
    this.excludeSelector = adapter.excludeSelectors.length
      ? adapter.excludeSelectors.join(', ')
      : undefined;
  }

  start(config: EffectiveConfig): void {
    this.config = config;
    this.applyAll();
    this.observer = new BatchedObserver((batch) => this.onBatch(batch));
    for (const target of this.adapter.observeTargets(this.doc)) {
      this.observer.observe(target);
    }
  }

  update(config: EffectiveConfig): void {
    const prev = this.config;
    this.config = config;
    if (prev && prev.fields && !config.fields) restoreAll(this.doc, 'field');
    if (prev && prev.display && !config.display) restoreAll(this.doc, 'display');
    this.applyAll();
  }

  /** Full teardown: disconnect observers and restore every touched element. */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.config = null;
    this.reasserts.clear();
    restoreAll(this.doc);
  }

  // ── Application passes ─────────────────────────────────────────────────────

  private applyAll(): void {
    const config = this.config;
    if (!config) return;
    if (config.fields && this.fieldSelector) {
      for (const el of Array.from(this.doc.querySelectorAll(this.fieldSelector))) {
        this.applyField(el, config.mode);
      }
    }
    if (config.display && this.displaySelector) {
      for (const root of Array.from(this.doc.querySelectorAll(this.displaySelector))) {
        this.applyDisplay(root, config.mode);
      }
    }
  }

  private applyField(el: Element, mode: Mode): void {
    if (!el.isConnected || this.surrendered.has(el)) return;
    applyToField(el, mode, this.excludeSelector);
  }

  private applyDisplay(root: Element, mode: Mode): void {
    if (!root.isConnected || this.surrendered.has(root)) return;
    // Nested display roots (e.g. `.markdown` inside `[role=main]`) are applied
    // individually; leaf-block logic keeps double application idempotent.
    const opts = this.excludeSelector !== undefined
      ? { respectHostDir: !this.adapter.overridesHostDir, excludeSelector: this.excludeSelector }
      : { respectHostDir: !this.adapter.overridesHostDir };
    applyToDisplay(root, mode, opts);
  }

  // ── Mutation handling ──────────────────────────────────────────────────────

  private onBatch(batch: Set<Element>): void {
    const config = this.config;
    if (!config) return;

    const fieldRoots = new Set<Element>();
    const displayRoots = new Set<Element>();

    for (const el of batch) {
      if (!el.isConnected) {
        this.reasserts.delete(el);
        continue;
      }
      if (config.fields && this.fieldSelector) {
        if (el.matches(this.fieldSelector)) fieldRoots.add(el);
        const enclosing = el.closest(this.fieldSelector);
        if (enclosing) fieldRoots.add(enclosing);
        for (const f of Array.from(el.querySelectorAll(this.fieldSelector))) fieldRoots.add(f);
      }
      if (config.display && this.displaySelector) {
        if (el.matches(this.displaySelector)) displayRoots.add(el);
        const enclosing = el.closest(this.displaySelector);
        if (enclosing) displayRoots.add(enclosing);
        for (const d of Array.from(el.querySelectorAll(this.displaySelector))) displayRoots.add(d);
      }
    }

    for (const el of fieldRoots) {
      if (this.hostWonFight(el, config.mode)) continue;
      this.applyField(el, config.mode);
    }
    for (const el of displayRoots) this.applyDisplay(el, config.mode);

    if (this.reasserts.size > 200) this.pruneReasserts();
  }

  /**
   * Detect a host that keeps resetting the direction of the same element
   * (e.g. a framework re-render loop). After REASSERT_LIMIT resets within the
   * window, restore the element and leave it alone.
   */
  private hostWonFight(el: Element, mode: Mode): boolean {
    if (this.surrendered.has(el)) return true;
    // Only meaningful for elements we set a root-level dir on.
    const desired = mode === 'auto' ? (isFormField(el) ? 'auto' : null) : mode;
    if (desired === null) return false;
    if (!el.hasAttribute(MARK_ATTR) || el.getAttribute('dir') === desired) return false;

    const now = Date.now();
    const entry = this.reasserts.get(el);
    if (!entry || now - entry.since > REASSERT_WINDOW_MS) {
      this.reasserts.set(el, { count: 1, since: now });
      return false;
    }
    entry.count += 1;
    if (entry.count >= REASSERT_LIMIT) {
      this.surrendered.add(el);
      this.reasserts.delete(el);
      restoreElement(el);
      return true;
    }
    return false;
  }

  private pruneReasserts(): void {
    const now = Date.now();
    for (const [el, entry] of this.reasserts) {
      if (!el.isConnected || now - entry.since > REASSERT_WINDOW_MS) this.reasserts.delete(el);
    }
  }
}
