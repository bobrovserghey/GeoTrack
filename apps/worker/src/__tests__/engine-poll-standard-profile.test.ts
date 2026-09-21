import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pollEngines } from '../steps/engine-poll.js';
import { calcCallCost } from '@geotrack/core';
import type { EnginePollInput } from '@geotrack/core';
import type { EngineAdapter, EngineAnswer, EngineRegistryEntry, UsageRecord, Budget } from '@geotrack/core';
import type { BundledPromptEntry } from '@geotrack/core';
import type { CacheStore } from '../cache/category-cache.js';

// ── token stats from fixtures ─────────────────────────────────────────────────

const TOKEN_STATS = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../fixtures/token-stats-standard-profile.json'),
    'utf-8',
  ),
) as {
  engines: Record<string, { avgTokensIn: number; avgTokensOut: number; concurrencyLimit: number; p95LatencyS: number; theoreticalTimeS: number; estimatedCostColdUsd: number }>;
  timingBudgetS: number;
  theoreticalCriticalPathS: number;
  softCeilingUsd: number;
  totalEstimatedCostColdUsd: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_PROMPT_COUNT = 26; // standard profile quota
const BRAND_PROMPT_COUNT = 4;
const PROMPT_REPEATS = 2;
const ENGINES = ['perplexity', 'chatgpt', 'gemini'] as const;

function makePrompts(): BundledPromptEntry[] {
  const category: BundledPromptEntry[] = Array.from({ length: CATEGORY_PROMPT_COUNT }, (_, i) => ({
    id: `cat-${String(i + 1).padStart(2, '0')}`,
    text: `category prompt ${i + 1}`,
    type: 'discovery' as const,
    priority: i + 1,
    branded: false,
  }));
  const brand: BundledPromptEntry[] = Array.from({ length: BRAND_PROMPT_COUNT }, (_, i) => ({
    id: `brand-${String(i + 1).padStart(2, '0')}`,
    text: `brand prompt ${i + 1}`,
    type: 'brand' as const,
    priority: i + 1,
    branded: true,
  }));
  return [...category, ...brand];
}

function makeUsageFor(engineId: 'perplexity' | 'chatgpt' | 'gemini'): UsageRecord {
  const stats = TOKEN_STATS.engines[engineId];
  const { avgTokensIn: tokensIn, avgTokensOut: tokensOut } = stats;
  let costUsd: number;
  if (engineId === 'perplexity') {
    costUsd = calcCallCost('perplexity', 'sonar', tokensIn, tokensOut, { requestCount: 1 });
  } else if (engineId === 'chatgpt') {
    costUsd = calcCallCost('openai', 'gpt-4o-mini-search-preview', tokensIn, tokensOut, { webSearchCalls: 1 });
  } else {
    costUsd = calcCallCost('gemini', 'gemini-2.0-flash', tokensIn, tokensOut, { groundingCalls: 1 });
  }
  const providerMap = { perplexity: 'perplexity', chatgpt: 'openai', gemini: 'gemini' } as const;
  const modelMap = { perplexity: 'sonar', chatgpt: 'gpt-4o-mini-search-preview', gemini: 'gemini-2.0-flash' } as const;
  return { provider: providerMap[engineId], model: modelMap[engineId], tokensIn, tokensOut, costUsd };
}

function makeAnswer(engineId: 'perplexity' | 'chatgpt' | 'gemini'): EngineAnswer {
  return {
    text: `${engineId} response`,
    sources: [{ url: 'https://example.com' }],
    raw: {},
    usage: makeUsageFor(engineId),
  };
}

function makeAdapter(id: 'perplexity' | 'chatgpt' | 'gemini'): EngineAdapter {
  return {
    id,
    ask: vi.fn().mockResolvedValue(makeAnswer(id)),
  };
}

function makeRegistry(id: 'perplexity' | 'chatgpt' | 'gemini'): EngineRegistryEntry {
  const concurrency = { perplexity: 3, chatgpt: 5, gemini: 5 }[id];
  return { id, provider: id, model: 'test-model', concurrencyLimit: concurrency, retryOnStatus: [429, 503], maxRetries: 1, timeoutMs: 5000 };
}

function makeEmptyStore(): CacheStore {
  return {
    findEntries: vi.fn().mockResolvedValue([]),
    insertEntry: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_INPUT: EnginePollInput = {
  prompts: makePrompts(),
  categoryId: 'project-management-software',
  locale: 'en',
  promptSetVersion: 1,
  promptRepeats: PROMPT_REPEATS,
};

const UNLIMITED_BUDGET: Budget = {
  softCeilingUsd: 10,
  hardCeilingUsd: 20,
  spentUsd: 0,
  remainingSoftUsd: 10,
  remainingHardUsd: 20,
};

// ── standard profile load tests ───────────────────────────────────────────────

describe('engine-poll standard profile harness', () => {
  it('generates exactly 180 responses for 30 prompts × 3 engines × 2 repeats (cold cache)', async () => {
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, UNLIMITED_BUDGET, { getRetryDelay: () => 0 });

    const totalResponses = (CATEGORY_PROMPT_COUNT + BRAND_PROMPT_COUNT) * ENGINES.length * PROMPT_REPEATS;
    expect(result.data!.responses.length).toBe(totalResponses);
  });

  it('returns no partial engines when all adapters succeed', async () => {
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, UNLIMITED_BUDGET, { getRetryDelay: () => 0 });

    expect(result.status).toBe('ok');
    expect(result.data!.partialEngines.length).toBe(0);
    expect(result.data!.hardCeilingHit).toBe(false);
  });

  it('records usage for all 180 non-cached calls', async () => {
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, UNLIMITED_BUDGET, { getRetryDelay: () => 0 });

    // All calls come from live adapters (no cache) → usage record per call
    const totalCalls = (CATEGORY_PROMPT_COUNT + BRAND_PROMPT_COUNT) * ENGINES.length * PROMPT_REPEATS;
    expect(result.usage.length).toBe(totalCalls);
    expect(result.usage.every((u) => u.costUsd > 0)).toBe(true);
  });

  it('splits 180 responses evenly: 60 per engine', async () => {
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, UNLIMITED_BUDGET, { getRetryDelay: () => 0 });

    const callsPerEngine = (CATEGORY_PROMPT_COUNT + BRAND_PROMPT_COUNT) * PROMPT_REPEATS; // 60
    for (const engineId of ENGINES) {
      const count = result.data!.responses.filter((r) => r.engineId === engineId).length;
      expect(count).toBe(callsPerEngine);
    }
  });

  it('brand prompts are all non-cached (fromCache=false)', async () => {
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, UNLIMITED_BUDGET, { getRetryDelay: () => 0 });

    const brandResponses = result.data!.responses.filter((r) => r.promptId.startsWith('brand-'));
    expect(brandResponses.length).toBe(BRAND_PROMPT_COUNT * ENGINES.length * PROMPT_REPEATS); // 4×3×2=24
    expect(brandResponses.every((r) => r.fromCache === false)).toBe(true);
  });

  it('theoretical timing fits within engine-poll budget of 180s', () => {
    // Each engine's theoretical time: ceil(calls/concurrency) × p95_latency
    // All engines run in parallel; critical path = max across engines.
    for (const engineId of ENGINES) {
      const stats = TOKEN_STATS.engines[engineId];
      const callsPerEngine = (CATEGORY_PROMPT_COUNT + BRAND_PROMPT_COUNT) * PROMPT_REPEATS; // 60
      const batches = Math.ceil(callsPerEngine / stats.concurrencyLimit);
      const theoreticalS = batches * stats.p95LatencyS;
      expect(theoreticalS).toBe(stats.theoreticalTimeS);
      expect(theoreticalS).toBeLessThanOrEqual(TOKEN_STATS.timingBudgetS);
    }
    expect(TOKEN_STATS.theoreticalCriticalPathS).toBeLessThanOrEqual(TOKEN_STATS.timingBudgetS);
  });

  it('estimated cold-run cost is within standard profile soft ceiling ($6)', () => {
    // Compute from per-call costs × 60 calls each engine (cost recalculated via calcCallCost,
    // not taken from fixture.estimatedCostColdUsd which is informational only)
    let totalCost = 0;
    for (const engineId of ENGINES) {
      const calls = (CATEGORY_PROMPT_COUNT + BRAND_PROMPT_COUNT) * PROMPT_REPEATS; // 60
      const callCost = makeUsageFor(engineId).costUsd;
      totalCost += callCost * calls;
    }
    expect(totalCost).toBeLessThanOrEqual(TOKEN_STATS.softCeilingUsd);
  });

  it('pollEngines passes UsageRecords through unmodified (token averages match mock fixture values)', async () => {
    // Note: adapters are mocked with fixture token values, so this test verifies that
    // pollEngines does not drop or mutate UsageRecords — not that adapter token counts are accurate.
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, UNLIMITED_BUDGET, { getRetryDelay: () => 0 });

    for (const engineId of ENGINES) {
      const stats = TOKEN_STATS.engines[engineId];
      const engineUsage = result.usage.filter((u) => {
        const providerMap = { perplexity: 'perplexity', chatgpt: 'openai', gemini: 'gemini' };
        return u.provider === providerMap[engineId];
      });
      expect(engineUsage.length).toBe((CATEGORY_PROMPT_COUNT + BRAND_PROMPT_COUNT) * PROMPT_REPEATS);
      const avgIn = engineUsage.reduce((s, u) => s + u.tokensIn, 0) / engineUsage.length;
      const avgOut = engineUsage.reduce((s, u) => s + u.tokensOut, 0) / engineUsage.length;
      expect(avgIn).toBe(stats.avgTokensIn);
      expect(avgOut).toBe(stats.avgTokensOut);
    }
  });

  it('stops when hard cost ceiling is reached', async () => {
    const tightBudget: Budget = { softCeilingUsd: 0, hardCeilingUsd: 0.05, spentUsd: 0, remainingSoftUsd: 0, remainingHardUsd: 0.05 };
    const adapters = ENGINES.map(makeAdapter);
    const registry = ENGINES.map(makeRegistry);
    const result = await pollEngines(BASE_INPUT, adapters, makeEmptyStore(), registry, tightBudget, { getRetryDelay: () => 0 });

    expect(result.data!.hardCeilingHit).toBe(true);
    expect(result.status).toBe('partial');
    // Hard ceiling hit: far fewer than 180 responses
    expect(result.data!.responses.length).toBeLessThan(180);
  });
});
