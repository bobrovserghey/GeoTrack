import { and, eq, gt } from 'drizzle-orm';
import { categoryCache } from '@geotrack/db/schema';
import type { DbClient } from '@geotrack/db/client';
import type { CacheStore, CacheLookupKey, CacheEntry } from './category-cache.js';

export function createDrizzleCacheStore(db: DbClient): CacheStore {
  return {
    async findEntries(key: CacheLookupKey, now: Date): Promise<CacheEntry[]> {
      const rows = await db
        .select()
        .from(categoryCache)
        .where(
          and(
            eq(categoryCache.categoryId, key.categoryId),
            eq(categoryCache.locale, key.locale),
            eq(categoryCache.promptSetVersion, key.promptSetVersion),
            eq(categoryCache.promptId, key.promptId),
            eq(categoryCache.engine, key.engineId),
            gt(categoryCache.expiresAt, now),
          ),
        );
      return rows.map((r) => ({
        repeatIndex: r.repeatIndex,
        responseText: r.responseText,
        sources: r.sources as unknown[],
        usageTokensIn: r.usageTokensIn,
        usageTokensOut: r.usageTokensOut,
      }));
    },

    async insertEntry(key: CacheLookupKey, entry: CacheEntry, expiresAt: Date): Promise<void> {
      await db
        .insert(categoryCache)
        .values({
          categoryId: key.categoryId,
          locale: key.locale,
          promptSetVersion: key.promptSetVersion,
          promptId: key.promptId,
          engine: key.engineId,
          repeatIndex: entry.repeatIndex,
          responseText: entry.responseText,
          sources: entry.sources,
          usageTokensIn: entry.usageTokensIn,
          usageTokensOut: entry.usageTokensOut,
          expiresAt,
        })
        .onConflictDoNothing();
    },
  };
}
