/**
 * Test environment setup: an in-memory `chrome` stub covering the API surface
 * SAWB uses (storage.local, storage.onChanged, runtime, tabs, commands).
 *
 * The stub object identity is stable for the whole test file — src modules
 * capture `chrome` once at import (platform/ext.ts) — and its state is reset
 * in beforeEach instead of being replaced.
 */

type Listener = (...args: unknown[]) => void;

export class EventStub {
  listeners = new Set<Listener>();
  addListener = (fn: Listener) => this.listeners.add(fn);
  removeListener = (fn: Listener) => this.listeners.delete(fn);
  emit = (...args: unknown[]) => this.listeners.forEach((fn) => fn(...args));
}

export class MemoryStorage {
  data: Record<string, unknown> = {};
  onChanged = new EventStub();

  get = async (key?: string | string[] | Record<string, unknown>) => {
    if (key === undefined || key === null) return structuredClone(this.data);
    const keys = typeof key === 'string' ? [key] : Array.isArray(key) ? key : Object.keys(key);
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (k in this.data) out[k] = structuredClone(this.data[k]);
    }
    return out;
  };

  set = async (items: Record<string, unknown>) => {
    const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: structuredClone(this.data[k]), newValue: structuredClone(v) };
      this.data[k] = structuredClone(v);
    }
    this.onChanged.emit(changes, 'local');
  };

  clear = async () => {
    this.data = {};
  };
}

function defaultTabsQuery() {
  return async () => [{ id: 1 }];
}

function defaultTabsSendMessage() {
  return async () => {
    throw new Error('no content script (stub default)');
  };
}

const local = new MemoryStorage();

export const chromeStub = {
  storage: {
    local,
    onChanged: local.onChanged,
  },
  runtime: {
    id: 'sawb-test',
    onMessage: new EventStub(),
    onInstalled: new EventStub(),
    sendMessage: async () => undefined,
    openOptionsPage: async () => undefined,
  },
  tabs: {
    query: defaultTabsQuery(),
    sendMessage: defaultTabsSendMessage() as (tabId: number, message: unknown) => Promise<unknown>,
  },
  commands: { onCommand: new EventStub() },
};

(globalThis as Record<string, unknown>).chrome = chromeStub;

beforeEach(() => {
  local.data = {};
  local.onChanged.listeners.clear();
  chromeStub.runtime.onMessage.listeners.clear();
  chromeStub.commands.onCommand.listeners.clear();
  chromeStub.tabs.query = defaultTabsQuery();
  chromeStub.tabs.sendMessage = defaultTabsSendMessage();
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('data-theme');
  document.body.className = '';
  document.body.innerHTML = '';
});

/** Flush batched MutationObserver work (rAF or setTimeout fallback). */
export async function flushMutations(ms = 60): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Flush microtasks + short timers (popup async handlers). */
export async function tick(ms = 15): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
