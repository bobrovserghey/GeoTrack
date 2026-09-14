-- T-17: rebuild category_cache key to (category_id, locale, prompt_set_version, prompt_id, engine, repeat_index)
-- Safe to truncate — this is a cache table; stale entries are valueless.

TRUNCATE TABLE "category_cache";
--> statement-breakpoint
ALTER TABLE "category_cache" DROP CONSTRAINT "category_cache_key";
--> statement-breakpoint
ALTER TABLE "category_cache" RENAME COLUMN "category_slug" TO "category_id";
--> statement-breakpoint
ALTER TABLE "category_cache" RENAME COLUMN "prompt_hash" TO "prompt_id";
--> statement-breakpoint
ALTER TABLE "category_cache" DROP COLUMN "prompt_type";
--> statement-breakpoint
ALTER TABLE "category_cache" ALTER COLUMN "prompt_id" TYPE varchar(128);
--> statement-breakpoint
ALTER TABLE "category_cache" ADD COLUMN "locale" varchar(8) NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_cache" ADD COLUMN "prompt_set_version" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "category_cache" ADD COLUMN "repeat_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "category_cache" ADD CONSTRAINT "category_cache_key" UNIQUE NULLS NOT DISTINCT ("category_id","locale","prompt_set_version","prompt_id","engine","repeat_index");
