import { describe, it, expect, vi } from 'vitest';
import { pollEngines } from '../steps/engine-poll.js';
import type { EnginePollInput } from '@geotrack/core';
import type { EngineAdapter, EngineAnswer, EngineRegistryEntry, UsageRecord, Budget } from '@geotrack/core';
import type { BundledPromptEntry } from '@geotrack/core';
import type { CacheStore, CacheEntry } from '../cache/category-cache.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeUsage(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return { provider: 'perplexity', model: 'sonar', tokensIn: 100, tokensOut: 50, costUsd: 0.01, ...overrides };
}

function makeAnswer(text = 'AI says: great product.'): EngineAnswer {
  return {
    text,
    sources: [{ url: 'https://example.com', title: 'Example' }],
    raw: {},
    usage: makeUsage(),
  };
}

function makePrompt(id: string, branded = false): BundledPromptEntry {
  return { id, text: `What is ${id}?`, type: branded ? 'brand' : 'discovery', priority: 1, branded };
}

function makeRegistry(id: 'perplexity' | 'chatgpt' | 'gemini' = 'perplexity', concurrencyLimit = 3): EngineRegistryEntry {
  return { id, provider: id, model: 'test-model', concurrencyLimit, retryOnStatus: [429, 503], maxRetries: 4, timeoutMs: 5000 };
}

function makeAdapter(id: 'perplexity' | 'chatgpt' | 'gemini' = 'perplexity', answers: (EngineAnswer | Error)[] = []): EngineAdapter {
  let i = 0;
  return {
    id,
    ask: vi.fn().mockImplementation(() => {
      const item = answers[i] ?? answers.at(-1) ?? makeAnswer();
      i++;
      return item instanceof Error ? Promise.reject(item) : Promise.resolve(item);
    }),
  };
}

function makeEmptyStore(): CacheStore {
  return {
    findEntries: vi.fn().mockResolvedValue([]),
    insertEntry: vi.fn().mockResolvedValue(undefined),
  };
}

function makeStoreWithEntries(entries: CacheEntry[]): CacheStore {
  return {
    findEntries: vi.fn().mockResolvedValue(entries),
    insertEntry: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_INPUT: EnginePollInput = {
  prompts: [makePrompt('discovery-001')],
  categoryId: 'project-management-software',
  locale: 'en',
  promptSetVersion: 1,
  promptRepeats: 1,
};

const BUDGET: Budget = {
  softCeilingUsd: 10,
  hardCeilingUsd: 20,
  spentUsd: 0,
  remainingSoftUsd: 10,
  remainingHardUsd: 20,
};

const NO_DELAY = { getRetryDelay: () => 0 };

// ── cache hit ─────────────────────────────────────────────────────────────────

describe('cache hit', () => {
  it('does not call adapter when all repeats are cached', async () => {
    const cachedEntry: CacheEntry = {
      repeatIndex: 0, responseText: 'cached response',
      sources: [], usageTokensIn: 80, usageTokensOut: 40,
    };
    const adapter = makeAdapter('perplexity', [makeAnswer()]);
    const store = makeStoreWithEntries([cachedEntry]);

    await pollEngines(BASE_INPUT, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).not.toHaveBeenCalled();
  });

  it('marks response fromCache=true for cached entries', async () => {
    const entry: CacheEntry = { repeatIndex: 0, responseText: 'cached', sources: [], usageTokensIn: 10, usageTokensOut: 5 };
    const store = makeStoreWithEntries([entry]);

    const result = await pollEngines(BASE_INPUT, [makeAdapter()], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses[0]?.fromCache).toBe(true);
  });

  it('uses cached response text', async () => {
    const entry: CacheEntry = { repeatIndex: 0, responseText: 'text from cache', sources: [], usageTokensIn: 0, usageTokensOut: 0 };
    const store = makeStoreWithEntries([entry]);

    const result = await pollEngines(BASE_INPUT, [makeAdapter()], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses[0]?.responseText).toBe('text from cache');
  });

  it('cache hit has zero costUsd (no spend)', async () => {
    const entry: CacheEntry = { repeatIndex: 0, responseText: 'cached', sources: [], usageTokensIn: 80, usageTokensOut: 40 };
    const store = makeStoreWithEntries([entry]);

    const result = await pollEngines(BASE_INPUT, [makeAdapter()], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses[0]?.usage.costUsd).toBe(0);
  });
});

// ── cache miss ────────────────────────────────────────────────────────────────

describe('cache miss', () => {
  it('calls adapter when cache is empty', async () => {
    const adapter = makeAdapter('perplexity', [makeAnswer()]);
    const store = makeEmptyStore();

    await pollEngines(BASE_INPUT, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).toHaveBeenCalledOnce();
  });

  it('marks response fromCache=false on miss', async () => {
    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses[0]?.fromCache).toBe(false);
  });

  it('stores result in cache after miss', async () => {
    const store = makeEmptyStore();
    await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(store.insertEntry).toHaveBeenCalledOnce();
  });

  it('result status is ok on clean miss', async () => {
    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);
    expect(result.status).toBe('ok');
  });
});

// ── missing repeats ───────────────────────────────────────────────────────────

describe('missing repeat request', () => {
  it('fetches only missing repeat when repeat 0 is cached', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, promptRepeats: 2 };
    const cached: CacheEntry = { repeatIndex: 0, responseText: 'r0', sources: [], usageTokensIn: 0, usageTokensOut: 0 };
    const adapter = makeAdapter('perplexity', [makeAnswer('r1')]);
    const store = makeStoreWithEntries([cached]);

    const result = await pollEngines(input, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).toHaveBeenCalledOnce();
    expect(result.data?.responses).toHaveLength(2);
  });

  it('does not call adapter when both repeats are cached', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, promptRepeats: 2 };
    const entries: CacheEntry[] = [
      { repeatIndex: 0, responseText: 'r0', sources: [], usageTokensIn: 0, usageTokensOut: 0 },
      { repeatIndex: 1, responseText: 'r1', sources: [], usageTokensIn: 0, usageTokensOut: 0 },
    ];
    const adapter = makeAdapter('perplexity', [makeAnswer()]);
    const store = makeStoreWithEntries(entries);

    await pollEngines(input, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).not.toHaveBeenCalled();
  });

  it('missing repeat gets repeatIndex=1 when repeat 0 is cached', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, promptRepeats: 2 };
    const cached: CacheEntry = { repeatIndex: 0, responseText: 'r0', sources: [], usageTokensIn: 0, usageTokensOut: 0 };
    const adapter = makeAdapter('perplexity', [makeAnswer('r1')]);
    const store = makeStoreWithEntries([cached]);

    const result = await pollEngines(input, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);
    const fresh = result.data?.responses.find(r => !r.fromCache);

    expect(fresh?.repeatIndex).toBe(1);
  });
});

// ── brand prompt bypass ───────────────────────────────────────────────────────

describe('brand prompt cache bypass', () => {
  it('always calls adapter for brand prompts', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, prompts: [makePrompt('brand-001', true)] };
    const adapter = makeAdapter('perplexity', [makeAnswer()]);
    const store = makeEmptyStore();

    await pollEngines(input, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).toHaveBeenCalledOnce();
  });

  it('does not read cache for brand prompts', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, prompts: [makePrompt('brand-001', true)] };
    const store = makeEmptyStore();

    await pollEngines(input, [makeAdapter('perplexity', [makeAnswer()])], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(store.findEntries).not.toHaveBeenCalled();
  });

  it('does not write cache for brand prompts', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, prompts: [makePrompt('brand-001', true)] };
    const store = makeEmptyStore();

    await pollEngines(input, [makeAdapter('perplexity', [makeAnswer()])], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(store.insertEntry).not.toHaveBeenCalled();
  });

  it('brand prompt fromCache=false always', async () => {
    const input: EnginePollInput = { ...BASE_INPUT, prompts: [makePrompt('brand-001', true)] };

    const result = await pollEngines(input, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses[0]?.fromCache).toBe(false);
  });
});

// ── retry on 429 ──────────────────────────────────────────────────────────────

describe('retry on retriable error', () => {
  it('retries after 429 and returns answer on success', async () => {
    const answers: (EngineAnswer | Error)[] = [
      new Error('Perplexity API error: 429'),
      makeAnswer('after retry'),
    ];
    const adapter = makeAdapter('perplexity', answers);

    const result = await pollEngines(BASE_INPUT, [adapter], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).toHaveBeenCalledTimes(2);
    expect(result.data?.responses[0]?.responseText).toBe('after retry');
  });

  it('marks engine partial after all retries exhausted', async () => {
    const errors = Array.from({ length: 4 }, () => new Error('Perplexity API error: 429'));
    const adapter = makeAdapter('perplexity', errors);

    const result = await pollEngines(BASE_INPUT, [adapter], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.partialEngines).toContain('perplexity');
  });

  it('result status is partial when engine fully fails', async () => {
    const errors = Array.from({ length: 4 }, () => new Error('Perplexity API error: 429'));
    const adapter = makeAdapter('perplexity', errors);

    const result = await pollEngines(BASE_INPUT, [adapter], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.status).toBe('partial');
  });

  it('does not retry on non-retriable errors', async () => {
    const adapter = makeAdapter('perplexity', [new Error('Invalid request: bad prompt')]);

    const result = await pollEngines(BASE_INPUT, [adapter], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);

    expect(adapter.ask).toHaveBeenCalledOnce();
    expect(result.data?.partialEngines).toContain('perplexity');
  });
});

// ── budget ────────────────────────────────────────────────────────────────────

describe('budget hard ceiling', () => {
  it('stops poll when hard ceiling is hit', async () => {
    const tightBudget: Budget = { softCeilingUsd: 0.005, hardCeilingUsd: 0.015, spentUsd: 0, remainingSoftUsd: 0.005, remainingHardUsd: 0.015 };
    // Each answer costs 0.01; third prompt would push past 0.015
    const prompts = [makePrompt('p1'), makePrompt('p2'), makePrompt('p3')];
    const input: EnginePollInput = { ...BASE_INPUT, prompts };
    const adapter = makeAdapter('perplexity', [makeAnswer(), makeAnswer(), makeAnswer()]);
    // concurrencyLimit=1 ensures sequential execution so budget check inside sem.run() sees updated spend
    const result = await pollEngines(input, [adapter], makeEmptyStore(), [makeRegistry('perplexity', 1)], tightBudget, NO_DELAY);

    expect(result.data?.hardCeilingHit).toBe(true);
    expect(result.status).toBe('partial');
    // Third call should NOT happen (budget exhausted after 2nd)
    expect(adapter.ask).toHaveBeenCalledTimes(2);
  });

  it('hardCeilingHit=false when budget is sufficient', async () => {
    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);
    expect(result.data?.hardCeilingHit).toBe(false);
  });

  it('collected responses included even when ceiling hit', async () => {
    const tightBudget: Budget = { softCeilingUsd: 0.005, hardCeilingUsd: 0.015, spentUsd: 0, remainingSoftUsd: 0.005, remainingHardUsd: 0.015 };
    const prompts = [makePrompt('p1'), makePrompt('p2'), makePrompt('p3')];
    const input: EnginePollInput = { ...BASE_INPUT, prompts };
    const adapter = makeAdapter('perplexity', [makeAnswer(), makeAnswer(), makeAnswer()]);

    const result = await pollEngines(input, [adapter], makeEmptyStore(), [makeRegistry('perplexity', 1)], tightBudget, NO_DELAY);

    // At least some responses collected before ceiling hit
    expect(result.data?.responses.length).toBeGreaterThan(0);
  });
});

// ── multiple engines ──────────────────────────────────────────────────────────

describe('multiple engines', () => {
  it('queries all engines for same prompt', async () => {
    const perplexity = makeAdapter('perplexity', [makeAnswer('perp')]);
    const gemini = makeAdapter('gemini', [makeAnswer('gem')]);
    const registry = [makeRegistry('perplexity'), makeRegistry('gemini')];

    const result = await pollEngines(BASE_INPUT, [perplexity, gemini], makeEmptyStore(), registry, BUDGET, NO_DELAY);

    expect(perplexity.ask).toHaveBeenCalledOnce();
    expect(gemini.ask).toHaveBeenCalledOnce();
    expect(result.data?.responses).toHaveLength(2);
  });

  it('one engine fails, other succeeds → partialEngines has only failed one', async () => {
    const perplexity = makeAdapter('perplexity', Array.from({ length: 4 }, () => new Error('API error: 503')));
    const gemini = makeAdapter('gemini', [makeAnswer()]);
    const registry = [makeRegistry('perplexity'), makeRegistry('gemini')];

    const result = await pollEngines(BASE_INPUT, [perplexity, gemini], makeEmptyStore(), registry, BUDGET, NO_DELAY);

    expect(result.data?.partialEngines).toContain('perplexity');
    expect(result.data?.partialEngines).not.toContain('gemini');
    expect(result.data?.responses.some(r => r.engineId === 'gemini')).toBe(true);
  });
});

// ── concurrency ───────────────────────────────────────────────────────────────

describe('per-engine concurrency limit', () => {
  it('respects concurrencyLimit=1 (sequential)', async () => {
    const prompts = [makePrompt('p1'), makePrompt('p2'), makePrompt('p3')];
    const input: EnginePollInput = { ...BASE_INPUT, prompts };

    let active = 0;
    let maxActive = 0;

    const adapter: EngineAdapter = {
      id: 'perplexity',
      ask: vi.fn().mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return makeAnswer();
      }),
    };

    await pollEngines(input, [adapter], makeEmptyStore(), [makeRegistry('perplexity', 1)], BUDGET, NO_DELAY);

    expect(maxActive).toBe(1);
  });

  it('allows up to concurrencyLimit concurrent calls', async () => {
    const prompts = Array.from({ length: 6 }, (_, i) => makePrompt(`p${i}`));
    const input: EnginePollInput = { ...BASE_INPUT, prompts };

    let active = 0;
    let maxActive = 0;

    const adapter: EngineAdapter = {
      id: 'perplexity',
      ask: vi.fn().mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return makeAnswer();
      }),
    };

    await pollEngines(input, [adapter], makeEmptyStore(), [makeRegistry('perplexity', 3)], BUDGET, NO_DELAY);

    expect(maxActive).toBeLessThanOrEqual(3);
  });
});

// ── output format ─────────────────────────────────────────────────────────────

describe('output format', () => {
  it('response contains promptId, engineId, repeatIndex', async () => {
    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);
    const r = result.data?.responses[0];
    expect(r?.promptId).toBe('discovery-001');
    expect(r?.engineId).toBe('perplexity');
    expect(r?.repeatIndex).toBe(0);
  });

  it('partialEngines is empty array when everything succeeds', async () => {
    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);
    expect(result.data?.partialEngines).toEqual([]);
  });

  it('usage records are included in result', async () => {
    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], makeEmptyStore(), [makeRegistry()], BUDGET, NO_DELAY);
    expect(result.usage.length).toBeGreaterThan(0);
  });

  it('cache hit responses not included in usage records', async () => {
    const entry: CacheEntry = { repeatIndex: 0, responseText: 'cached', sources: [], usageTokensIn: 0, usageTokensOut: 0 };
    const store = makeStoreWithEntries([entry]);
    const result = await pollEngines(BASE_INPUT, [makeAdapter()], store, [makeRegistry()], BUDGET, NO_DELAY);
    expect(result.usage.length).toBe(0);
  });
});

// ── review fixes ──────────────────────────────────────────────────────────────

function cachedEntry(repeatIndex: number): CacheEntry {
  return { repeatIndex, responseText: `cached ${repeatIndex}`, sources: [], usageTokensIn: 1, usageTokensOut: 1 };
}

describe('cache hit respects promptRepeats', () => {
  it('serves only repeatIndex < promptRepeats from a cache filled by a larger profile', async () => {
    const store = makeStoreWithEntries([cachedEntry(0), cachedEntry(1)]);
    const adapter = makeAdapter();

    const result = await pollEngines({ ...BASE_INPUT, promptRepeats: 1 }, [adapter], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses.map((r) => r.repeatIndex)).toEqual([0]);
    expect(adapter.ask).not.toHaveBeenCalled();
  });
});

describe('cache read failure', () => {
  it('treats a failing findEntries as a miss, keeps paid answers and notes the degradation', async () => {
    const store: CacheStore = {
      findEntries: vi.fn().mockRejectedValue(new Error('connection refused')),
      insertEntry: vi.fn().mockResolvedValue(undefined),
    };
    const input = { ...BASE_INPUT, prompts: [makePrompt('discovery-001'), makePrompt('discovery-002')] };

    const result = await pollEngines(input, [makeAdapter('perplexity', [makeAnswer()])], store, [makeRegistry()], BUDGET, NO_DELAY);

    expect(result.data?.responses).toHaveLength(2);
    expect(result.data?.responses.every((r) => !r.fromCache)).toBe(true);
    expect(result.notes.filter((n) => n.includes('cache read failed'))).toHaveLength(1);
  });
});

describe('usage of cache hits', () => {
  it('does not share one mutable usage object between responses', async () => {
    const store = makeStoreWithEntries([cachedEntry(0), cachedEntry(1)]);

    const result = await pollEngines({ ...BASE_INPUT, promptRepeats: 2 }, [makeAdapter()], store, [makeRegistry()], BUDGET, NO_DELAY);

    const [a, b] = result.data!.responses;
    expect(a.usage).not.toBe(b.usage);
    a.usage.costUsd = 99;
    expect(b.usage.costUsd).toBe(0);
  });
});

describe('cache write failure', () => {
  it('awaits the write, keeps the answer, notes it and reports via onCacheError without leaking the error message', async () => {
    const store: CacheStore = {
      findEntries: vi.fn().mockResolvedValue([]),
      insertEntry: vi.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('postgres://user:s3cret@host/db')), 5)),
      ),
    };
    const onCacheError = vi.fn();

    const result = await pollEngines(BASE_INPUT, [makeAdapter('perplexity', [makeAnswer()])], store, [makeRegistry()], BUDGET, { ...NO_DELAY, onCacheError });

    expect(result.data?.responses).toHaveLength(1);
    expect(result.notes.some((n) => n.includes('cache write failed'))).toBe(true);
    expect(onCacheError).toHaveBeenCalledOnce();
    expect(JSON.stringify([result.notes, onCacheError.mock.calls])).not.toContain('s3cret');
  });
});

describe('soft ceiling note', () => {
  it('is written once per engine, not per response', async () => {
    const lowSoft: Budget = { ...BUDGET, softCeilingUsd: 0.005 };
    const input = { ...BASE_INPUT, prompts: [makePrompt('d-1'), makePrompt('d-2'), makePrompt('d-3', true)] };
    const adapters = [makeAdapter('perplexity', [makeAnswer()]), makeAdapter('chatgpt', [makeAnswer()])];

    const result = await pollEngines(input, adapters, makeEmptyStore(), [makeRegistry('perplexity'), makeRegistry('chatgpt')], lowSoft, NO_DELAY);

    const soft = result.notes.filter((n) => n.includes('soft cost ceiling'));
    expect(soft).toHaveLength(2);
    expect(new Set(soft).size).toBe(2);
  });
});
