import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const now = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const categoryCache = pgTable('category_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  categorySlug: varchar('category_slug', { length: 128 }).notNull(),
  promptType: varchar('prompt_type', { length: 32 }).notNull(),
  engine: varchar('engine', { length: 32 }).notNull(),
  promptHash: varchar('prompt_hash', { length: 64 }).notNull(),
  responseText: text('response_text').notNull(),
  sources: jsonb('sources').notNull().default([]),
  usageTokensIn: integer('usage_tokens_in').notNull().default(0),
  usageTokensOut: integer('usage_tokens_out').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: now(),
}, (t) => [
  unique('category_cache_key').on(t.categorySlug, t.promptHash, t.engine),
]);
