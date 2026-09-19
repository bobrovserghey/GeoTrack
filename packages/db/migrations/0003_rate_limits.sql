ALTER TABLE "audits"
  ADD COLUMN "domain_normalized" varchar(253),
  ADD COLUMN "scheduled_for" date;
--> statement-breakpoint
CREATE INDEX "audits_domain_normalized_status_idx"
  ON "audits" ("domain_normalized", "status", "created_at");
--> statement-breakpoint
CREATE INDEX "audits_email_normalized_status_idx"
  ON "audits" ("email_normalized", "status", "created_at");
