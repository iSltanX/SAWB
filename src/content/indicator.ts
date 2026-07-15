/**
 * Direction indicator — «إظهار مؤشر الاتجاه» from the design's general
 * settings: a small badge beside the active writing field.
 *
 * Visual language reuses the design's active-segment style: solid mode color
 * (teal for RTL, copper for LTR, navy for auto) with white text — the exact
 * `modeColor` mapping from the reference App.tsx. Cairo is used when the host
 * page has it; otherwise the system font stack renders the Arabic label.
 */

import type { Mode } from '../platform/types';

const MODE_COLOR: Record<Mode, string> = {
  rtl: '#1E9080', // color/action/rtl — تيلي
  ltr: '#B8763F', // color/action/ltr — نحاسي
  auto: '#1A2540', // color/action/auto base — نيلي
};

const MODE_LABEL: Record<Mode, string> = {
  auto: 'تلقائي',
  rtl: 'RTL ←',
  ltr: 'LTR →',
};

const HIDE_DELAY_MS = 1400;

export class DirectionIndicator {
  private el: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly doc: Document = document) {}

  /** Show the badge near a field's top inline-end corner, then fade out. */
  show(field: Element, mode: Mode): void {
    const rect = field.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const el = this.ensureElement();
    el.textContent = MODE_LABEL[mode];
    el.style.setProperty('background', MODE_COLOR[mode], 'important');

    const rtl = mode === 'rtl' || (mode === 'auto' && this.doc.documentElement.dir === 'rtl');
    const x = rtl ? rect.left + 8 : rect.right - 8;
    el.style.setProperty('top', `${Math.max(4, rect.top - 12)}px`, 'important');
    el.style.setProperty('left', `${Math.round(x)}px`, 'important');
    el.style.setProperty('transform', rtl ? 'none' : 'translateX(-100%)', 'important');
    el.style.setProperty('opacity', '1', 'important');

    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.el?.style.setProperty('opacity', '0', 'important');
  }

  destroy(): void {
    this.hide();
    this.el?.remove();
    this.el = null;
  }

  private ensureElement(): HTMLElement {
    if (this.el && this.el.isConnected) return this.el;
    const el = this.doc.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-sawb-indicator', '');
    const reducedMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Inline !important styles: immune to host CSS, no stylesheet injection.
    const styles: Record<string, string> = {
      position: 'fixed',
      'z-index': '2147483646',
      padding: '2px 8px',
      'border-radius': '20px',
      font: "600 10px 'Cairo', system-ui, sans-serif",
      color: '#ffffff',
      'pointer-events': 'none',
      opacity: '0',
      transition: reducedMotion ? 'none' : 'opacity 0.15s ease',
      'white-space': 'nowrap',
      'box-shadow': '0 1px 3px rgba(0,0,0,0.3)',
    };
    for (const [prop, value] of Object.entries(styles)) el.style.setProperty(prop, value, 'important');
    (this.doc.body ?? this.doc.documentElement).appendChild(el);
    this.el = el;
    return el;
  }
}
