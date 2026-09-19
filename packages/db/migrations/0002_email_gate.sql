-- T-25: email gate — add email fields to users and audits
CREATE TYPE "auth_provider" AS ENUM ('magic_link', 'google', 'microsoft');
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN "email_normalized" varchar(254),
  ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL,
  ADD COLUMN "verified_at" timestamp with time zone,
  ADD COLUMN "auth_provider" "auth_provider";
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_idx" ON "users" ("email_normalized")
  WHERE "email_normalized" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "audits"
  ADD COLUMN "email_normalized" varchar(254);
