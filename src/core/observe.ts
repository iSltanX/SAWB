/**
 * Batched MutationObserver.
 *
 * Mutation records are coalesced into a set of affected elements and flushed
 * once per animation frame (setTimeout fallback outside a rendering context).
 * Loop safety comes from idempotence: the engine's apply pass never writes
 * when the DOM already matches the desired state, so re-entrant mutation
 * records converge instead of ping-ponging.
 */

export class BatchedObserver {
  private observer: MutationObserver;
  private pending = new Set<Element>();
  private scheduled = false;
  private disconnected = false;

  constructor(private readonly onBatch: (elements: Set<Element>) => void) {
    this.observer = new MutationObserver((records) => this.collect(records));
  }

  observe(target: Node): void {
    this.observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['dir', 'contenteditable'],
      characterData: true,
    });
  }

  disconnect(): void {
    this.disconnected = true;
    this.observer.disconnect();
    this.pending.clear();
  }

  private collect(records: MutationRecord[]): void {
    for (const record of records) {
      const target = record.target;
      const el = target instanceof Element ? target : target.parentElement;
      if (el) this.pending.add(el);
      if (record.type === 'childList') {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof Element) this.pending.add(node);
        }
      }
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || this.pending.size === 0) return;
    this.scheduled = true;
    const flush = () => {
      this.scheduled = false;
      if (this.disconnected) return;
      const batch = this.pending;
      this.pending = new Set();
      if (batch.size > 0) this.onBatch(batch);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else setTimeout(flush, 32);
  }
}
