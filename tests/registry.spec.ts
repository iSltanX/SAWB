import { describe, expect, it } from 'vitest';
import { resolveAdapter, registeredAdapters } from '../src/adapters/registry';
import { genericAdapter } from '../src/adapters/generic';
import { matchesHost } from '../src/adapters/types';

describe('adapter resolution', () => {
  it('resolves ChatGPT hosts to the chatgpt adapter', () => {
    expect(resolveAdapter('chatgpt.com').id).toBe('chatgpt');
    expect(resolveAdapter('chat.openai.com').id).toBe('chatgpt');
  });

  it('falls back to the generic adapter for unknown hosts', () => {
    for (const host of ['example.com', 'notion.so', 'openai.com.evil.com']) {
      expect(resolveAdapter(host).id).toBe('generic');
    }
  });

  it('does not match look-alike domains', () => {
    expect(resolveAdapter('mychatgpt.com').id).toBe('generic');
    expect(resolveAdapter('chatgpt.com.phish.io').id).toBe('generic');
  });
});

describe('matchesHost', () => {
  it('matches exact domain and subdomains only', () => {
    expect(matchesHost('github.com', ['github.com'])).toBe(true);
    expect(matchesHost('gist.github.com', ['github.com'])).toBe(true);
    expect(matchesHost('github.com.evil.io', ['github.com'])).toBe(false);
    expect(matchesHost('mygithub.com', ['github.com'])).toBe(false);
  });
});

describe('adapter isolation and safety', () => {
  it('every registered adapter carries its own selectors (no sharing)', () => {
    const all = [...registeredAdapters(), genericAdapter];
    const ids = new Set(all.map((a) => a.id));
    expect(ids.size).toBe(all.length);
    for (const adapter of all) {
      expect(adapter.fieldSelectors.length).toBeGreaterThan(0);
      expect(typeof adapter.overridesHostDir).toBe('boolean');
    }
  });

  it('generic adapter never selects html or body (requirement 9)', () => {
    document.body.innerHTML = '<main><p>نص</p></main><textarea></textarea>';
    const fieldSel = genericAdapter.fieldSelectors.join(', ');
    const displaySel = genericAdapter.displaySelectors.join(', ');
    const selected = [
      ...Array.from(document.querySelectorAll(fieldSel)),
      ...Array.from(document.querySelectorAll(displaySel)),
    ];
    expect(selected).not.toContain(document.documentElement);
    expect(selected).not.toContain(document.body);
  });

  it('generic adapter is marked unsupported → «وضع عام» badge', () => {
    expect(genericAdapter.supported).toBe(false);
  });
});
