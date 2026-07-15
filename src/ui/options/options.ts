/**
 * Settings page logic.
 *
 * Storage-backed: default mode, theme (approved addition), direction
 * indicator, and the saved-sites list (delete = reset to default). Shortcuts,
 * privacy, and about are informational, straight from the design.
 */

import './options.css';
import { ext, hasExtensionApis } from '../../platform/ext';
import {
  deleteSitePref,
  getSnapshot,
  onStorageChanged,
  setSettings,
  type StorageSnapshot,
} from '../../platform/storage';
import type { Mode, Theme } from '../../platform/types';
import { resolveAdapter } from '../../adapters/registry';
import { logoWordmarkHtml, logoMarkSvg } from '../logo';
import { iconSvg, type IconName } from '../icons';

/** Real repository URL, when one exists. Empty → the GitHub row stays hidden. */
const GITHUB_URL = '';

type Section = 'general' | 'sites' | 'shortcuts' | 'privacy' | 'about';

/** Exact strings from the design mockup. */
const MODE_LABEL: Record<Mode, string> = {
  auto: 'تلقائي',
  rtl: 'RTL ←',
  ltr: 'LTR →',
};

const SHORTCUTS: { action: string; keys: string[] }[] = [
  { action: 'تبديل الاتجاه إلى RTL', keys: ['Alt', 'Shift', 'R'] },
  { action: 'تبديل الاتجاه إلى LTR', keys: ['Alt', 'Shift', 'L'] },
  { action: 'تفعيل الوضع التلقائي', keys: ['Alt', 'Shift', 'A'] },
  { action: 'تعطيل الإضافة مؤقتًا', keys: ['Alt', 'Shift', 'D'] },
];

const PRIVACY_CHECKS = [
  'لا يُجمع أي بيانات تصفح أو نصوص',
  'لا حاجة لتسجيل حساب',
  'التفضيلات في chrome.storage.local فقط',
  'لا اتصال بخوادم خارجية إطلاقًا',
];

export async function initOptions(doc: Document): Promise<void> {
  const $ = (id: string): HTMLElement => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`options: missing #${id}`);
    return el;
  };

  // ── Static content ────────────────────────────────────────────────────────
  $('wordmark').innerHTML = logoWordmarkHtml(26);
  $('about-logo').innerHTML = logoMarkSvg(40);
  for (const span of Array.from(doc.querySelectorAll<HTMLElement>('.nav-icon'))) {
    span.innerHTML = iconSvg(span.dataset.icon as IconName, 14);
  }

  const version = hasExtensionApis() ? ext.runtime.getManifest().version : '1.0.0';
  for (const span of Array.from(doc.querySelectorAll<HTMLElement>('[data-version]'))) {
    span.textContent = version;
  }

  $('shortcut-rows').innerHTML = SHORTCUTS.map(
    ({ action, keys }) => `
    <div class="shortcut-row">
      <span class="shortcut-action">${action}</span>
      <div class="shortcut-keys">${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</div>
    </div>`,
  ).join('');

  $('privacy-checks').innerHTML = PRIVACY_CHECKS.map(
    (item) => `
    <div class="privacy-check">
      <span class="check-icon">${iconSvg('check', 14)}</span>${item}
    </div>`,
  ).join('');

  if (GITHUB_URL) {
    const row = $('github-row');
    row.hidden = false;
    const link = doc.createElement('a');
    link.href = GITHUB_URL;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'GitHub';
    row.append(link);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const navButtons = Array.from(doc.querySelectorAll<HTMLElement>('.sidebar nav button'));
  function showSection(section: Section): void {
    for (const button of navButtons) {
      button.setAttribute('aria-current', String(button.dataset.section === section));
    }
    for (const sec of ['general', 'sites', 'shortcuts', 'privacy', 'about'] as Section[]) {
      $(`sec-${sec}`).hidden = sec !== section;
    }
  }
  for (const button of navButtons) {
    button.addEventListener('click', () => showSection(button.dataset.section as Section));
  }

  // ── Storage-backed state ──────────────────────────────────────────────────
  let snapshot: StorageSnapshot = await getSnapshot();

  function render(): void {
    const { settings, sites } = snapshot;
    doc.documentElement.setAttribute('data-theme', settings.theme);

    for (const button of Array.from(
      doc.querySelectorAll<HTMLElement>('#sec-general .mode-selector button[data-mode]'),
    )) {
      button.setAttribute('aria-checked', String(button.dataset.mode === settings.defaultMode));
    }
    for (const button of Array.from(
      doc.querySelectorAll<HTMLElement>('#theme-selector button[data-value]'),
    )) {
      button.setAttribute('aria-checked', String(button.dataset.value === settings.theme));
    }
    $('indicator-toggle').setAttribute('aria-checked', String(settings.showIndicator));

    // Saved sites.
    const entries = Object.entries(sites).sort(([a], [b]) => a.localeCompare(b));
    $('sites-count').textContent = `${entries.length} مواقع`;
    const list = $('sites-list');
    list.textContent = '';
    for (const [host, pref] of entries) {
      const row = doc.createElement('div');
      row.className = 'site-row';

      const info = doc.createElement('div');
      info.className = 'site-row-info';
      const icon = doc.createElement('span');
      icon.className = 'site-row-icon';
      icon.innerHTML = iconSvg('globe', 14);
      const textWrap = doc.createElement('div');
      const domain = doc.createElement('p');
      domain.className = 'site-row-domain';
      domain.textContent = host;
      textWrap.append(domain);
      if (resolveAdapter(host).supported) {
        const supported = doc.createElement('span');
        supported.className = 'site-row-supported';
        supported.textContent = 'مدعوم رسميًا';
        textWrap.append(supported);
      }
      info.append(icon, textWrap);

      const actions = doc.createElement('div');
      actions.className = 'site-row-actions';
      const badge = doc.createElement('span');
      if (pref.disabled) {
        badge.className = 'site-mode-badge mode-disabled';
        badge.textContent = 'معطّلة';
      } else {
        const mode = pref.mode ?? 'auto';
        badge.className = `site-mode-badge mode-${mode}`;
        badge.textContent = MODE_LABEL[mode];
      }
      const del = doc.createElement('button');
      del.type = 'button';
      del.className = 'site-delete';
      del.setAttribute('aria-label', `حذف تفضيل ${host}`);
      del.innerHTML = iconSvg('trash-2', 13);
      del.addEventListener('click', () => {
        void deleteSitePref(host);
      });
      actions.append(badge, del);

      row.append(info, actions);
      list.append(row);
    }
  }

  async function refresh(): Promise<void> {
    snapshot = await getSnapshot();
    render();
  }

  onStorageChanged(() => {
    void refresh();
  });

  // ── Events ────────────────────────────────────────────────────────────────
  for (const button of Array.from(
    doc.querySelectorAll<HTMLElement>('#sec-general .mode-selector button[data-mode]'),
  )) {
    button.addEventListener('click', () => {
      void setSettings({ defaultMode: button.dataset.mode as Mode });
    });
  }
  for (const button of Array.from(
    doc.querySelectorAll<HTMLElement>('#theme-selector button[data-value]'),
  )) {
    button.addEventListener('click', () => {
      void setSettings({ theme: button.dataset.value as Theme });
    });
  }
  $('indicator-toggle').addEventListener('click', () => {
    void setSettings({ showIndicator: !snapshot.settings.showIndicator });
  });

  render();
}

if (hasExtensionApis() && typeof document !== 'undefined' && document.getElementById('wordmark')) {
  void initOptions(document);
}
