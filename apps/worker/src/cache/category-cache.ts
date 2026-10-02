const TTL_DAYS = 14;

export type CacheLookupKey = {
  categoryId: string;
  locale: string;
  promptSetVersion: number;
  promptId: string;
  engineId: string;
};

export type CacheEntry = {
  repeatIndex: number;
  responseText: string;
  sources: unknown[];
  usageTokensIn: number;
  usageTokensOut: number;
};

export interface CacheStore {
  findEntries(key: CacheLookupKey, now: Date): Promise<CacheEntry[]>;
  insertEntry(key: CacheLookupKey, entry: CacheEntry, expiresAt: Date): Promise<void>;
}

export class BrandedPromptCacheError extends Error {
  constructor(promptId: string) {
    super(`refusing to cache branded/client prompt "${promptId}" (ADR-021)`);
    this.name = 'BrandedPromptCacheError';
  }
}

export function getCacheEntries(
  store: CacheStore,
  key: CacheLookupKey,
  now: Date,
): Promise<CacheEntry[]> {
  return store.findEntries(key, now);
}

export async function getMissingRepeats(
  store: CacheStore,
  key: CacheLookupKey,
  requiredCount: number,
  now: Date,
): Promise<number[]> {
  if (requiredCount === 0) return [];
  const entries = await store.findEntries(key, now);
  const found = new Set(entries.map((e) => e.repeatIndex));
  return Array.from({ length: requiredCount }, (_, i) => i).filter((i) => !found.has(i));
}

export async function setCacheEntry(
  store: CacheStore,
  key: CacheLookupKey,
  repeatIndex: number,
  value: Omit<CacheEntry, 'repeatIndex'>,
  branded: boolean,
  now: Date,
): Promise<void> {
  // ADR-021: брендовые и клиентские промпты персональны — попытка закэшировать их это баг вызывающего кода.
  if (branded) throw new BrandedPromptCacheError(key.promptId);
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000);
  await store.insertEntry(key, { repeatIndex, ...value }, expiresAt);
}
