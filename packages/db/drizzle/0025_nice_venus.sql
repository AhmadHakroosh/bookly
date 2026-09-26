ALTER TABLE "bookings" ADD COLUMN "guests" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "max_guests" integer DEFAULT 0 NOT NULL;