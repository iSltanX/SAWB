/**
 * Service worker (MV3).
 *
 * Responsibilities: initialize storage defaults on install and forward the
 * four keyboard commands (Alt+Shift+R/L/A/D) to the active tab's content
 * script. No network access, no analytics, no state of its own.
 */

import { ext } from '../platform/ext';
import { initStorage } from '../platform/storage';
import type { CommandMessage } from '../platform/messages';

ext.runtime.onInstalled.addListener(() => {
  void initStorage();
});

const COMMANDS: ReadonlySet<CommandMessage['command']> = new Set([
  'set-rtl',
  'set-ltr',
  'set-auto',
  'toggle-temp-disable',
]);

ext.commands?.onCommand.addListener((command) => {
  if (!COMMANDS.has(command as CommandMessage['command'])) return;
  void (async () => {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    const message: CommandMessage = {
      type: 'sawb/command',
      command: command as CommandMessage['command'],
    };
    try {
      await ext.tabs.sendMessage(tab.id, message);
    } catch {
      // No content script on this page (chrome://, web store…) — nothing to do.
    }
  })();
});
