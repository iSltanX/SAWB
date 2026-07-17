/**
 * Popup logic.
 *
 * State sources:
 * - `storage.local` (global settings + persisted site preferences)
 * - the active tab's content script (host, adapter, effective config,
 *   including any per-tab temporary override)
 *
 * Behavior (approved requirements 1 & 6):
 * - Changes apply to the current page immediately.
 * - They persist only while «حفظ التفضيل لهذا الموقع» is on; otherwise they
 *   are sent as tab-only temporary overrides that vanish on reload.
 * - «تعطيل الإضافة في هذا الموقع» is ALWAYS persistent, independent of the
 *   save toggle, until the user reverses it.
 */

import './popup.css';
import { ext, hasExtensionApis } from '../../platform/ext';
import {
  deleteSitePref,
  getSnapshot,
  onStorageChanged,
  saveSitePref,
  setSettings,
  type StorageSnapshot,
} from '../../platform/storage';
import type { Mode, SitePref, TempOverride, Theme } from '../../platform/types';
import type { PageState } from '../../platform/messages';
import { logoWordmarkHtml } from '../logo';
import { iconSvg } from '../icons';

/** modeColor from the design (App.tsx): auto→navy, rtl→teal, ltr→copper. */
const MODE_COLOR: Record<Mode, string> = {
  auto: '#1A2540',
  rtl: '#1E9080',
  ltr: '#B8763F',
};

/** modeDesc from the design — exact wording. */
const MODE_DESC: Record<Mode, string> = {
  auto: 'يُكشف الاتجاه تلقائيًا من أول حرف تكتبه',
  rtl: 'جميع حقول الكتابة تُجبر على RTL',
  ltr: 'All input fields forced to LTR direction',
};

/** Reading-comfort row subtitle: what it does, or why it cannot act yet. */
const RC_SUB = 'تحسين حجم الخط وتباعد الأسطر للنص العربي المعروض';
const RC_SUB_NEEDS_DISPLAY = 'يتطلب تفعيل النصوص المعروضة';

function applyTheme(doc: Document, theme: Theme): void {
  doc.documentElement.setAttribute('data-theme', theme);
}

/** Build a SitePref payload without explicit-undefined keys. */
function compactPref(pref: {
  mode?: Mode | undefined;
  fields?: boolean | undefined;
  display?: boolean | undefined;
  readingComfort?: boolean | undefined;
  disabled?: boolean | undefined;
}): Omit<SitePref, 'savedAt'> {
  const out: Omit<SitePref, 'savedAt'> = {};
  if (pref.mode !== undefined) out.mode = pref.mode;
  if (pref.fields !== undefined) out.fields = pref.fields;
  if (pref.display !== undefined) out.display = pref.display;
  if (pref.readingComfort !== undefined) out.readingComfort = pref.readingComfort;
  if (pref.disabled) out.disabled = true;
  return out;
}

export async function initPopup(doc: Document): Promise<void> {
  const $ = (id: string): HTMLElement => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`popup: missing #${id}`);
    return el;
  };

  // Static content.
  $('wordmark').innerHTML = logoWordmarkHtml(26);
  $('site-icon').innerHTML = iconSvg('globe', 12);
  $('save-icon').innerHTML = iconSvg('save', 13);
  $('disable-icon').innerHTML = iconSvg('ban', 13);
  $('settings-icon').innerHTML = iconSvg('settings', 13);

  let snapshot: StorageSnapshot = await getSnapshot();
  let tabId: number | null = null;
  let page: PageState | null = null;

  async function queryPage(retry = true): Promise<void> {
    if (tabId === null) {
      const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id ?? null;
    }
    if (tabId === null) {
      page = null;
      return;
    }
    try {
      page = (await ext.tabs.sendMessage(tabId, { type: 'sawb/get-state' })) as PageState;
    } catch {
      if (retry) {
        await new Promise((r) => setTimeout(r, 200));
        return queryPage(false);
      }
      page = null; // no content script here (chrome://, store, …)
    }
  }

  async function sendTemp(override: TempOverride): Promise<void> {
    if (tabId === null) return;
    try {
      page = (await ext.tabs.sendMessage(tabId, {
        type: 'sawb/apply-temp',
        override,
      })) as PageState;
    } catch {
      /* page gone — next render shows unavailable state */
    }
  }

  const sitePref = (): SitePref | undefined => (page ? snapshot.sites[page.host] : undefined);
  const isSaved = (): boolean => {
    const p = sitePref();
    return (
      !!p &&
      (p.mode !== undefined ||
        p.fields !== undefined ||
        p.display !== undefined ||
        p.readingComfort !== undefined)
    );
  };
  const isSiteDisabled = (): boolean => sitePref()?.disabled === true;

  function render(): void {
    const settings = snapshot.settings;
    applyTheme(doc, settings.theme);
    doc.body.classList.toggle('page-unavailable', page === null);

    const cfg = page?.config ?? {
      enabled: settings.enabled,
      mode: settings.defaultMode,
      fields: settings.applyToFields,
      display: settings.applyToDisplay,
      showIndicator: settings.showIndicator,
      readingComfort: false,
      fontScale: settings.rcFontScale,
      lineHeight: settings.rcLineHeight,
    };

    // Header: master toggle is the global enabled state; the «مفعّلة» badge
    // reflects whether SAWB is actually active here (mockup hides it when off).
    $('master-toggle').setAttribute('aria-checked', String(settings.enabled));
    $('enabled-badge').hidden = !(page ? cfg.enabled : settings.enabled);

    // Site bar. «موقع مدعوم ✓» is reserved for sites where BOTH fields and
    // displayed content are live-verified (supportLevel "full"). A dedicated
    // adapter whose display selectors are not yet verified ("partial") gets
    // its own badge instead of the full-support claim — same badge style
    // (badge-auto) already used for «وضع عام», new text only.
    $('site-domain').textContent = page?.host ?? '—';
    const siteBadge = $('site-badge');
    if (page) {
      siteBadge.hidden = false;
      if (page.supportLevel === 'full') {
        siteBadge.textContent = 'موقع مدعوم ✓';
        siteBadge.className = 'badge badge-teal';
      } else if (page.supportLevel === 'partial') {
        siteBadge.textContent = 'دعم جزئي — الحقول فقط';
        siteBadge.className = 'badge badge-auto';
      } else {
        siteBadge.textContent = 'وضع عام';
        siteBadge.className = 'badge badge-auto';
      }
    } else {
      siteBadge.hidden = true;
    }

    // Mode selector + description.
    for (const button of Array.from(doc.querySelectorAll<HTMLElement>('.mode-selector button'))) {
      button.setAttribute('aria-checked', String(button.dataset.mode === cfg.mode));
    }
    $('mode-desc').textContent = MODE_DESC[cfg.mode];

    // Toggles — field/display/save tint with the active mode color (mockup:
    // Toggle color defaults to modeColor(mode)); disable stays copper.
    const modeColor = MODE_COLOR[cfg.mode];
    for (const id of ['fields-toggle', 'display-toggle', 'save-toggle', 'reading-comfort-toggle']) {
      $(id).style.setProperty('--toggle-color', modeColor);
    }
    $('fields-toggle').setAttribute('aria-checked', String(cfg.fields));
    $('display-toggle').setAttribute('aria-checked', String(cfg.display));

    // Reading comfort builds on displayed-text processing, so with display off
    // the toggle cannot act: it is marked disabled and says why, rather than
    // silently swallowing clicks. `cfg.readingComfort` (display-gated) drives
    // the shown state; the stored request behind it is untouched and returns
    // on its own the moment display is switched back on.
    $('reading-comfort-toggle').setAttribute('aria-checked', String(cfg.readingComfort));
    $('reading-comfort-toggle').setAttribute('aria-disabled', String(!cfg.display));
    $('reading-comfort-row').classList.toggle('row-disabled', !cfg.display);
    $('reading-comfort-sub').textContent = cfg.display ? RC_SUB : RC_SUB_NEEDS_DISPLAY;

    $('save-toggle').setAttribute('aria-checked', String(isSaved()));
    $('disable-toggle').setAttribute('aria-checked', String(isSiteDisabled()));
  }

  async function refresh(): Promise<void> {
    snapshot = await getSnapshot();
    await queryPage(false);
    render();
  }

  onStorageChanged(() => {
    void refresh();
  });

  /** A setting change: persist when saving is on, else tab-only temp. */
  async function changeSetting(patch: {
    mode?: Mode;
    fields?: boolean;
    display?: boolean;
    readingComfort?: boolean;
  }): Promise<void> {
    if (!page) return;
    if (isSaved()) {
      const p = sitePref();
      await saveSitePref(
        page.host,
        compactPref({
          mode: patch.mode ?? p?.mode,
          fields: patch.fields ?? p?.fields,
          display: patch.display ?? p?.display,
          readingComfort: patch.readingComfort ?? p?.readingComfort,
          disabled: p?.disabled,
        }),
      );
    } else {
      await sendTemp(patch);
      render();
    }
  }

  // ── Events ──────────────────────────────────────────────────────────────
  $('master-toggle').addEventListener('click', () => {
    void setSettings({ enabled: !snapshot.settings.enabled });
  });

  for (const button of Array.from(doc.querySelectorAll<HTMLElement>('.mode-selector button'))) {
    button.addEventListener('click', () => {
      void changeSetting({ mode: button.dataset.mode as Mode });
    });
  }

  $('fields-toggle').addEventListener('click', () => {
    const cfg = page?.config;
    if (cfg) void changeSetting({ fields: !cfg.fields });
  });
  $('display-toggle').addEventListener('click', () => {
    const cfg = page?.config;
    if (cfg) void changeSetting({ display: !cfg.display });
  });
  $('reading-comfort-toggle').addEventListener('click', () => {
    if (!page) return;
    // Inert while display is off: the control is marked aria-disabled, so it
    // must not mutate storage behind a UI that cannot show the result.
    if (!page.config.display) return;
    // Flip the RAW request (temp ← site ← global), never the display-gated
    // EffectiveConfig.readingComfort: the two diverge whenever display is off,
    // and flipping the gated value could never turn a stored request back off.
    void changeSetting({ readingComfort: !page.rcRequested });
  });

  $('save-toggle').addEventListener('click', () => {
    void (async () => {
      if (!page) return;
      const cfg = page.config;
      if (isSaved()) {
        // Turn saving off: drop persisted values (keep a persistent disable
        // if present) and keep the current state as a tab-only override so
        // the page doesn't jump; defaults return on reload (requirement 6).
        // readingComfort mirrors the RAW request (page.rcRequested), not the
        // display-gated cfg.readingComfort — otherwise a display=false page
        // would silently downgrade a true request to false in the process.
        if (isSiteDisabled()) await saveSitePref(page.host, { disabled: true });
        else await deleteSitePref(page.host);
        await sendTemp({
          mode: cfg.mode,
          fields: cfg.fields,
          display: cfg.display,
          readingComfort: page.rcRequested,
        });
      } else {
        await saveSitePref(
          page.host,
          compactPref({
            mode: cfg.mode,
            fields: cfg.fields,
            display: cfg.display,
            readingComfort: page.rcRequested,
            disabled: isSiteDisabled(),
          }),
        );
      }
    })();
  });

  $('disable-toggle').addEventListener('click', () => {
    void (async () => {
      if (!page) return;
      const p = sitePref();
      if (isSiteDisabled()) {
        // Re-enable: keep saved values if any, else remove the entry.
        if (isSaved()) {
          await saveSitePref(
            page.host,
            compactPref({
              mode: p?.mode,
              fields: p?.fields,
              display: p?.display,
              readingComfort: p?.readingComfort,
            }),
          );
        } else {
          await deleteSitePref(page.host);
        }
      } else {
        // Always persistent, independent of the save toggle (requirement 1).
        await saveSitePref(
          page.host,
          compactPref({
            mode: p?.mode,
            fields: p?.fields,
            display: p?.display,
            readingComfort: p?.readingComfort,
            disabled: true,
          }),
        );
      }
    })();
  });

  $('open-settings').addEventListener('click', () => {
    try {
      void ext.runtime.openOptionsPage?.();
    } catch {
      /* options page ships in the next stage */
    }
  });

  // ── Initial paint ───────────────────────────────────────────────────────
  render(); // fast paint from storage
  await queryPage();
  render();
}

if (hasExtensionApis() && typeof document !== 'undefined' && document.getElementById('wordmark')) {
  void initPopup(document);
}
