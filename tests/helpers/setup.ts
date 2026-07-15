/**
 * Test environment setup: an in-memory `chrome` stub covering the API surface
 * SAWB uses (storage.local, storage.onChanged, runtime, tabs, commands).
 */

type Listener = (...args: unknown[]) => void;

class EventStub {
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

export function installChromeStub() {
  const local = new MemoryStorage();
  const onMessage = new EventStub();
  const onCommand = new EventStub();
  const onInstalled = new EventStub();

  const chromeStub = {
    storage: {
      local,
      onChanged: local.onChanged,
    },
    runtime: {
      id: 'sawb-test',
      onMessage,
      onInstalled,
      sendMessage: async () => undefined,
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://example.com/' }],
      sendMessage: async () => undefined,
    },
    commands: { onCommand },
  };

  (globalThis as Record<string, unknown>).chrome = chromeStub;
  return chromeStub;
}

installChromeStub();

beforeEach(() => {
  installChromeStub();
  document.documentElement.removeAttribute('dir');
  document.body.innerHTML = '';
});

/** Flush batched MutationObserver work (rAF or setTimeout fallback). */
export async function flushMutations(ms = 60): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
