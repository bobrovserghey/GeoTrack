import { describe, it, expect, vi } from 'vitest';
import {
  getCacheEntries,
  setCacheEntry,
  getMissingRepeats,
  type CacheLookupKey,
  type CacheEntry,
  type CacheStore,
} from '../cache/category-cache.js';

const BASE_KEY: CacheLookupKey = {
  categoryId: 'project-management-software',
  locale: 'en',
  promptSetVersion: 1,
  promptId: 'discovery-001',
  engineId: 'perplexity',
};

const ENTRY_VALUE: Omit<CacheEntry, 'repeatIndex'> = {
  responseText: 'Perplexity says this is great software.',
  sources: [{ url: 'https://example.com', title: 'Example' }],
  usageTokensIn: 120,
  usageTokensOut: 80,
};

function makeEntry(repeatIndex: number): CacheEntry {
  return { ...ENTRY_VALUE, repeatIndex };
}

function makeMockStore(entries: CacheEntry[] = []): CacheStore {
  const stored: CacheEntry[] = [...entries];
  return {
    findEntries: vi.fn().mockResolvedValue(stored),
    insertEntry: vi.fn().mockImplementation((_key, entry) => {
      stored.push(entry);
      return Promise.resolve();
    }),
  };
}

const NOW = new Date('2026-09-14T12:00:00Z');

describe('getCacheEntries', () => {
  it('returns empty array on cache miss', async () => {
    const store = makeMockStore([]);
    const result = await getCacheEntries(store, BASE_KEY, NOW);
    expect(result).toEqual([]);
  });

  it('returns entries on cache hit', async () => {
    const store = makeMockStore([makeEntry(0), makeEntry(1)]);
    const result = await getCacheEntries(store, BASE_KEY, NOW);
    expect(result).toHaveLength(2);
    expect(result[0].repeatIndex).toBe(0);
    expect(result[1].repeatIndex).toBe(1);
  });

  it('returns response text and sources from cached entry', async () => {
    const store = makeMockStore([makeEntry(0)]);
    const [entry] = await getCacheEntries(store, BASE_KEY, NOW);
    expect(entry.responseText).toBe(ENTRY_VALUE.responseText);
    expect(entry.sources).toEqual(ENTRY_VALUE.sources);
  });

  it('passes key and now to the store for expiry filtering', async () => {
    const store = makeMockStore([]);
    await getCacheEntries(store, BASE_KEY, NOW);
    expect(store.findEntries).toHaveBeenCalledWith(BASE_KEY, NOW);
  });
});

describe('setCacheEntry', () => {
  it('stores a non-brand prompt entry', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 0, ENTRY_VALUE, false, NOW);
    expect(store.insertEntry).toHaveBeenCalledOnce();
  });

  it('refuses to cache brand prompts (branded=true)', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 0, ENTRY_VALUE, true, NOW);
    expect(store.insertEntry).not.toHaveBeenCalled();
  });

  it('sets expiresAt 14 days from now', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 0, ENTRY_VALUE, false, NOW);
    const [, , expiresAt] = (store.insertEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, unknown, Date];
    const expectedExpiry = new Date(NOW.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(expiresAt.getTime()).toBe(expectedExpiry.getTime());
  });

  it('stores repeatIndex in the entry', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 2, ENTRY_VALUE, false, NOW);
    const [, entry] = (store.insertEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown, CacheEntry];
    expect(entry.repeatIndex).toBe(2);
  });

  it('passes the full key to insertEntry', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 0, ENTRY_VALUE, false, NOW);
    const [key] = (store.insertEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [CacheLookupKey];
    expect(key).toEqual(BASE_KEY);
  });
});

describe('getMissingRepeats', () => {
  it('returns all indices [0..n-1] when cache is empty', async () => {
    const store = makeMockStore([]);
    const missing = await getMissingRepeats(store, BASE_KEY, 3, NOW);
    expect(missing).toEqual([0, 1, 2]);
  });

  it('returns empty array when all repeats are cached', async () => {
    const store = makeMockStore([makeEntry(0), makeEntry(1), makeEntry(2)]);
    const missing = await getMissingRepeats(store, BASE_KEY, 3, NOW);
    expect(missing).toEqual([]);
  });

  it('returns only missing repeat indices', async () => {
    const store = makeMockStore([makeEntry(0), makeEntry(2)]);
    const missing = await getMissingRepeats(store, BASE_KEY, 3, NOW);
    expect(missing).toEqual([1]);
  });

  it('returns [0] when repeat 1 is cached but 0 is not', async () => {
    const store = makeMockStore([makeEntry(1)]);
    const missing = await getMissingRepeats(store, BASE_KEY, 2, NOW);
    expect(missing).toContain(0);
    expect(missing).not.toContain(1);
  });

  it('returns all indices for requiredCount=1 when nothing cached', async () => {
    const store = makeMockStore([]);
    const missing = await getMissingRepeats(store, BASE_KEY, 1, NOW);
    expect(missing).toEqual([0]);
  });

  it('returns empty array for requiredCount=0', async () => {
    const store = makeMockStore([]);
    const missing = await getMissingRepeats(store, BASE_KEY, 0, NOW);
    expect(missing).toEqual([]);
  });
});

describe('locale isolation', () => {
  it('getCacheEntries calls store with exact locale from key', async () => {
    const storeEn = makeMockStore([makeEntry(0)]);
    const roKey: CacheLookupKey = { ...BASE_KEY, locale: 'ro' };
    await getCacheEntries(storeEn, roKey, NOW);
    // store.findEntries must receive the ro key, not en
    expect(storeEn.findEntries).toHaveBeenCalledWith(roKey, NOW);
  });

  it('getMissingRepeats uses locale-specific key', async () => {
    const store = makeMockStore([makeEntry(0)]);
    const roKey: CacheLookupKey = { ...BASE_KEY, locale: 'ro' };
    await getMissingRepeats(store, roKey, 2, NOW);
    expect(store.findEntries).toHaveBeenCalledWith(roKey, NOW);
  });
});

describe('prompt_set_version isolation', () => {
  it('getCacheEntries calls store with exact version from key', async () => {
    const store = makeMockStore([]);
    const v2Key: CacheLookupKey = { ...BASE_KEY, promptSetVersion: 2 };
    await getCacheEntries(store, v2Key, NOW);
    expect(store.findEntries).toHaveBeenCalledWith(v2Key, NOW);
  });
});

describe('brand prompt leak guard', () => {
  it('branded=true: no entry is inserted even with repeated calls', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 0, ENTRY_VALUE, true, NOW);
    await setCacheEntry(store, BASE_KEY, 1, ENTRY_VALUE, true, NOW);
    expect(store.insertEntry).not.toHaveBeenCalled();
  });

  it('branded=false after branded=true: non-brand prompt is cached', async () => {
    const store = makeMockStore([]);
    await setCacheEntry(store, BASE_KEY, 0, ENTRY_VALUE, true, NOW);
    await setCacheEntry(store, { ...BASE_KEY, promptId: 'discovery-002' }, 0, ENTRY_VALUE, false, NOW);
    expect(store.insertEntry).toHaveBeenCalledOnce();
  });
});
