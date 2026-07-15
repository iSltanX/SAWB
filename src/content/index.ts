/**
 * Content script entry point.
 *
 * Resolves the site adapter, merges global settings + persisted site
 * preference + per-tab temporary override into an effective config, runs the
 * direction engine, and reacts to storage changes and popup/worker messages.
 *
 * Temporary overrides (requirement 6) live only in this script's memory:
 * a reload or a new tab returns to the persisted state.
 */

import { resolveAdapter } from '../adapters/registry';
import { supportLevel } from '../adapters/types';
import { DirectionEngine } from '../core/engine';
import { hasExtensionApis, ext } from '../platform/ext';
import { getSnapshot, onStorageChanged, type StorageSnapshot } from '../platform/storage';
import {
  resolveEffectiveConfig,
  type EffectiveConfig,
  type TempOverride,
} from '../platform/types';
import { modeForCommand, type PageState, type SawbMessage } from '../platform/messages';
import { DirectionIndicator } from './indicator';
import { detectDirection } from '../core/detect';
import { isFormField, isEditableRoot } from '../core/apply';

async function main(): Promise<void> {
  if (!hasExtensionApis()) return;
  const host = location.hostname;
  if (!host) return;

  const adapter = resolveAdapter(host);
  const fieldSelector = adapter.fieldSelectors.join(', ');

  let snapshot: StorageSnapshot = await getSnapshot();
  let temp: TempOverride | null = null;
  let engine: DirectionEngine | null = null;
  let indicator: DirectionIndicator | null = null;

  const compute = (): EffectiveConfig =>
    resolveEffectiveConfig(snapshot.settings, snapshot.sites[host], temp, {
      genericSite: !adapter.supported,
    });

  const sync = (): void => {
    const config = compute();
    if (!config.enabled) {
      engine?.stop();
      engine = null;
      indicator?.destroy();
      indicator = null;
      return;
    }
    if (engine) {
      engine.update(config);
    } else {
      engine = new DirectionEngine(adapter);
      engine.start(config);
    }
    if (!config.showIndicator && indicator) {
      indicator.destroy();
      indicator = null;
    }
  };

  // ── Indicator on focus (design: علامة صغيرة بجانب حقل الكتابة النشط) ──────
  document.addEventListener(
    'focusin',
    (event) => {
      const config = compute();
      if (!config.enabled || !config.showIndicator || !config.fields) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const field = target.closest(fieldSelector);
      if (!field || (!isFormField(field) && !isEditableRoot(field))) return;
      indicator ??= new DirectionIndicator();
      const mode =
        config.mode === 'auto'
          ? (detectDirection(textOfField(field)) ?? 'auto')
          : config.mode;
      indicator.show(field, mode);
    },
    { passive: true },
  );

  // ── Storage + messages ─────────────────────────────────────────────────────
  onStorageChanged(async () => {
    snapshot = await getSnapshot();
    sync();
  });

  ext.runtime.onMessage.addListener(
    (message: SawbMessage, _sender, sendResponse: (r: PageState) => void) => {
      switch (message.type) {
        case 'sawb/apply-temp':
          temp = { ...temp, ...message.override };
          sync();
          break;
        case 'sawb/command': {
          const mode = modeForCommand(message.command);
          if (mode) temp = { ...temp, mode, disabled: false };
          else temp = { ...temp, disabled: !(temp?.disabled ?? false) };
          sync();
          break;
        }
        case 'sawb/get-state':
          break;
      }
      sendResponse(pageState());
      return false;
    },
  );

  const pageState = (): PageState => ({
    host,
    adapterId: adapter.id,
    supported: adapter.supported,
    supportLevel: supportLevel(adapter),
    config: compute(),
    hasTempOverride: temp !== null,
  });

  sync();
}

function textOfField(field: Element): string {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return field.value;
  }
  return field.textContent ?? '';
}

void main();
