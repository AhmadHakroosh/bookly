ALTER TABLE "event_types" ADD COLUMN "reminders" jsonb DEFAULT '[1440,60]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "follow_up" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "assignment" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "host_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;