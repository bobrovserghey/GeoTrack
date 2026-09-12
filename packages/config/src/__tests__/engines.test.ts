import { describe, it, expect } from 'vitest';
import { getEngineRegistry } from '../index.js';

describe('getEngineRegistry', () => {
  it('returns an array of engines', () => {
    const registry = getEngineRegistry();
    expect(Array.isArray(registry)).toBe(true);
    expect(registry.length).toBeGreaterThan(0);
  });

  it('contains perplexity, chatgpt and gemini', () => {
    const registry = getEngineRegistry();
    const ids = registry.map((e) => e.id);
    expect(ids).toContain('perplexity');
    expect(ids).toContain('chatgpt');
    expect(ids).toContain('gemini');
  });

  it('every engine has required fields with valid values', () => {
    const registry = getEngineRegistry();
    for (const engine of registry) {
      expect(engine.id).toBeTruthy();
      expect(engine.provider).toBeTruthy();
      expect(engine.model).toBeTruthy();
      expect(engine.concurrencyLimit).toBeGreaterThan(0);
      expect(engine.maxRetries).toBeGreaterThan(0);
      expect(engine.timeoutMs).toBeGreaterThan(0);
      expect(Array.isArray(engine.retryOnStatus)).toBe(true);
      expect(engine.retryOnStatus).toContain(429);
    }
  });

  it('engine ids are unique', () => {
    const registry = getEngineRegistry();
    const ids = registry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
