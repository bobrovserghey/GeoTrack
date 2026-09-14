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
  categoryId: varchar('category_id', { length: 128 }).notNull(),
  locale: varchar('locale', { length: 8 }).notNull(),
  promptSetVersion: integer('prompt_set_version').notNull(),
  promptId: varchar('prompt_id', { length: 128 }).notNull(),
  engine: varchar('engine', { length: 32 }).notNull(),
  repeatIndex: integer('repeat_index').notNull().default(0),
  responseText: text('response_text').notNull(),
  sources: jsonb('sources').notNull().default([]),
  usageTokensIn: integer('usage_tokens_in').notNull().default(0),
  usageTokensOut: integer('usage_tokens_out').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: now(),
}, (t) => [
  unique('category_cache_key').on(
    t.categoryId, t.locale, t.promptSetVersion, t.promptId, t.engine, t.repeatIndex,
  ),
]);
