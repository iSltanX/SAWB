/**
 * Adapter registry — resolves the adapter for a hostname, falling back to the
 * generic safe adapter. Remaining site adapters (Claude, Gemini, AI Studio,
 * Substack, GitHub) plug in here in the next stage.
 */

import type { SiteAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { genericAdapter } from './generic';

const ADAPTERS: SiteAdapter[] = [
  chatgptAdapter,
];

export function resolveAdapter(host: string): SiteAdapter {
  return ADAPTERS.find((a) => a.matches(host)) ?? genericAdapter;
}

export function registeredAdapters(): readonly SiteAdapter[] {
  return ADAPTERS;
}
