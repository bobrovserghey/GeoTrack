import type {
  EngineAdapter,
  EngineAnswer,
  EngineRegistryEntry,
  Budget,
  UsageRecord,
  StepResult,
  EnginePollInput,
  EnginePollOutput,
  EnginePollResponse,
} from '@geotrack/core';
import type { CacheStore, CacheLookupKey } from '../cache/category-cache.js';
import { getCacheEntries, setCacheEntry } from '../cache/category-cache.js';

// ── options ───────────────────────────────────────────────────────────────────

export type PollOptions = {
  getRetryDelay?: (attempt: number) => number;
};

const DEFAULT_RETRY_DELAY = (attempt: number): number => Math.pow(2, attempt) * 1000;

// ── concurrency semaphore ─────────────────────────────────────────────────────

type Semaphore = { run<T>(fn: () => Promise<T>): Promise<T> };

function createSemaphore(limit: number): Semaphore {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await new Promise<void>((resolve) => {
        if (active < limit) { active++; resolve(); }
        else waiting.push(() => { active++; resolve(); });
      });
      try {
        return await fn();
      } finally {
        active--;
        waiting.shift()?.();
      }
    },
  };
}

// ── retry helper ──────────────────────────────────────────────────────────────

function isRetriable(error: unknown, statuses: number[]): boolean {
  if (!(error instanceof Error)) return false;
  return statuses.some((s) => error.message.includes(String(s)));
}

async function askWithRetry(
  adapter: EngineAdapter,
  prompt: string,
  registry: EngineRegistryEntry,
  getDelay: (attempt: number) => number,
): Promise<EngineAnswer | null> {
  for (let attempt = 0; attempt < registry.maxRetries; attempt++) {
    try {
      return await adapter.ask(prompt, { timeoutMs: registry.timeoutMs });
    } catch (err) {
      const retriable = isRetriable(err, registry.retryOnStatus);
      if (!retriable || attempt === registry.maxRetries - 1) return null;
      const ms = getDelay(attempt);
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    }
  }
  return null;
}

// ── spend tracker ─────────────────────────────────────────────────────────────

type SpendTracker = {
  record(usd: number): 'ok' | 'soft_exceeded' | 'hard_exceeded';
  isHardExceeded(): boolean;
};

function makeSpendTracker(budget: Budget): SpendTracker {
  let spent = budget.spentUsd;
  return {
    record(usd) {
      spent += usd;
      if (spent >= budget.hardCeilingUsd) return 'hard_exceeded';
      if (spent >= budget.softCeilingUsd) return 'soft_exceeded';
      return 'ok';
    },
    isHardExceeded() {
      return spent >= budget.hardCeilingUsd;
    },
  };
}

// ── zero usage (for cache hits) ───────────────────────────────────────────────

const ZERO_USAGE: UsageRecord = { provider: '', model: '', tokensIn: 0, tokensOut: 0, costUsd: 0 };

const SKIPPED = Symbol('budget_skipped');

// ── main step ─────────────────────────────────────────────────────────────────

export async function pollEngines(
  input: EnginePollInput,
  adapters: EngineAdapter[],
  cacheStore: CacheStore,
  engineRegistry: EngineRegistryEntry[],
  budget: Budget,
  opts: PollOptions = {},
): Promise<StepResult<EnginePollOutput>> {
  const getDelay = opts.getRetryDelay ?? DEFAULT_RETRY_DELAY;

  const spend = makeSpendTracker(budget);
  const responses: EnginePollResponse[] = [];
  const partialEngines = new Set<string>();
  const usageRecords: UsageRecord[] = [];
  const notes: string[] = [];

  const semaphores = new Map<string, Semaphore>(
    adapters.map((a) => {
      const reg = engineRegistry.find((r) => r.id === a.id);
      return [a.id, createSemaphore(reg?.concurrencyLimit ?? 1)];
    }),
  );

  const tasks = adapters.flatMap((adapter) => {
    const reg = engineRegistry.find((r) => r.id === adapter.id);
    if (!reg) return [];
    const sem = semaphores.get(adapter.id)!;

    return input.prompts.map((prompt) => async () => {
      if (prompt.branded) {
        // Brand prompts: always query, never cache
        for (let ri = 0; ri < input.promptRepeats; ri++) {
          type BrandResult = { answer: EngineAnswer; budgetStatus: 'ok' | 'soft_exceeded' | 'hard_exceeded' };
          const result = await sem.run(async (): Promise<BrandResult | null | typeof SKIPPED> => {
            if (spend.isHardExceeded()) return SKIPPED;
            const a = await askWithRetry(adapter, prompt.text, reg, getDelay);
            if (a === null) return null;
            const budgetStatus = spend.record(a.usage.costUsd);
            return { answer: a, budgetStatus };
          });
          if (result === SKIPPED) {
            // budget stop — don't mark partial
          } else if (result === null) {
            partialEngines.add(adapter.id);
          } else {
            if (result.budgetStatus === 'soft_exceeded') {
              notes.push(`soft cost ceiling exceeded during engine ${adapter.id}`);
            }
            responses.push({
              promptId: prompt.id,
              engineId: adapter.id,
              repeatIndex: ri,
              responseText: result.answer.text,
              sources: result.answer.sources,
              fromCache: false,
              usage: result.answer.usage,
            });
            usageRecords.push(result.answer.usage);
          }
        }
      } else {
        // Category prompts: check cache, fetch only missing repeats
        const now = new Date();
        const cacheKey: CacheLookupKey = {
          categoryId: input.categoryId,
          locale: input.locale,
          promptSetVersion: input.promptSetVersion,
          promptId: prompt.id,
          engineId: adapter.id,
        };

        const cached = await getCacheEntries(cacheStore, cacheKey, now);
        const cachedIndices = new Set(cached.map((e) => e.repeatIndex));
        const missing = Array.from({ length: input.promptRepeats }, (_, i) => i).filter(
          (i) => !cachedIndices.has(i),
        );

        // Add cached responses
        for (const entry of cached) {
          responses.push({
            promptId: prompt.id,
            engineId: adapter.id,
            repeatIndex: entry.repeatIndex,
            responseText: entry.responseText,
            sources: entry.sources as { url: string; title?: string }[],
            fromCache: true,
            usage: ZERO_USAGE,
          });
        }

        // Fetch missing repeats
        for (const ri of missing) {
          type CatResult = { answer: EngineAnswer; budgetStatus: 'ok' | 'soft_exceeded' | 'hard_exceeded' };
          const result = await sem.run(async (): Promise<CatResult | null | typeof SKIPPED> => {
            if (spend.isHardExceeded()) return SKIPPED;
            const a = await askWithRetry(adapter, prompt.text, reg, getDelay);
            if (a === null) return null;
            const budgetStatus = spend.record(a.usage.costUsd);
            return { answer: a, budgetStatus };
          });
          if (result === SKIPPED) {
            // budget stop — don't mark partial
          } else if (result === null) {
            partialEngines.add(adapter.id);
          } else {
            if (result.budgetStatus === 'soft_exceeded') {
              notes.push(`soft cost ceiling exceeded during engine ${adapter.id}`);
            }
            responses.push({
              promptId: prompt.id,
              engineId: adapter.id,
              repeatIndex: ri,
              responseText: result.answer.text,
              sources: result.answer.sources,
              fromCache: false,
              usage: result.answer.usage,
            });
            usageRecords.push(result.answer.usage);
            // Store in cache (non-blocking; errors silently dropped)
            setCacheEntry(
              cacheStore, cacheKey, ri,
              {
                responseText: result.answer.text,
                sources: result.answer.sources,
                usageTokensIn: result.answer.usage.tokensIn,
                usageTokensOut: result.answer.usage.tokensOut,
              },
              false,
              now,
            ).catch(() => undefined);
          }
        }
      }
    });
  });

  await Promise.all(tasks.map((t) => t()));

  const hardCeilingHit = spend.isHardExceeded();
  if (hardCeilingHit) notes.push('hard cost ceiling reached, poll stopped');

  const partialEngineList = [...partialEngines] as EnginePollOutput['partialEngines'];
  const isPartial = partialEngineList.length > 0 || hardCeilingHit;

  return {
    status: isPartial ? 'partial' : 'ok',
    data: { responses, partialEngines: partialEngineList, hardCeilingHit },
    artifacts: [],
    usage: usageRecords,
    notes,
  };
}
