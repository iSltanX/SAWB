/** Typed runtime messages between popup ⇄ content script ⇄ service worker. */

import type { EffectiveConfig, Mode, TempOverride } from './types';
import type { SupportLevel } from '../adapters/types';

/** Popup/worker → content script: apply a temporary, tab-only override. */
export interface ApplyTempMessage {
  type: 'sawb/apply-temp';
  override: TempOverride;
}

/** Popup → content script: report current page state. */
export interface GetStateMessage {
  type: 'sawb/get-state';
}

export interface PageState {
  host: string;
  adapterId: string;
  supported: boolean;
  /**
   * "full" (fields + display verified), "partial" (dedicated adapter, but
   * display selectors not yet live-verified — fields still work), or
   * "generic" (no dedicated adapter). Drives the popup's site badge; a site
   * must never show «موقع مدعوم ✓» on "partial".
   */
  supportLevel: SupportLevel;
  config: EffectiveConfig;
  hasTempOverride: boolean;
  /**
   * The raw «راحة القراءة» request (temp ← site ← global), BEFORE the
   * display-gate applied in `config.readingComfort`. The popup's quick
   * toggle flips this value, never the display-gated one — otherwise a
   * display=false page would make the toggle only ever able to turn the
   * stored request back ON, never off (see resolveReadingComfortRequest).
   */
  rcRequested: boolean;
}

/** Worker → content script: keyboard command. */
export interface CommandMessage {
  type: 'sawb/command';
  command: 'set-rtl' | 'set-ltr' | 'set-auto' | 'toggle-temp-disable';
}

export type SawbMessage = ApplyTempMessage | GetStateMessage | CommandMessage;

export function modeForCommand(command: CommandMessage['command']): Mode | null {
  switch (command) {
    case 'set-rtl': return 'rtl';
    case 'set-ltr': return 'ltr';
    case 'set-auto': return 'auto';
    case 'toggle-temp-disable': return null;
  }
}
