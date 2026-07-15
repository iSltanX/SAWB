/**
 * Adapter registry — resolves the adapter for a hostname, falling back to the
 * generic safe adapter.
 */

import type { SiteAdapter } from './types';
import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import { aistudioAdapter } from './aistudio';
import { githubAdapter } from './github';
import { substackAdapter } from './substack';
import { genericAdapter } from './generic';

const ADAPTERS: SiteAdapter[] = [
  chatgptAdapter,
  claudeAdapter,
  geminiAdapter,
  aistudioAdapter,
  githubAdapter,
  substackAdapter,
];

export function resolveAdapter(host: string): SiteAdapter {
  return ADAPTERS.find((a) => a.matches(host)) ?? genericAdapter;
}

export function registeredAdapters(): readonly SiteAdapter[] {
  return ADAPTERS;
}
