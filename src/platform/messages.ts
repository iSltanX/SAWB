/** Typed runtime messages between popup ⇄ content script ⇄ service worker. */

import type { EffectiveConfig, Mode, TempOverride } from './types';

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
  config: EffectiveConfig;
  hasTempOverride: boolean;
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
