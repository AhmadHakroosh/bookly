ALTER TABLE "schedule_rules" ADD COLUMN "kind" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "weekly_budget" integer;