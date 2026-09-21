ALTER TABLE "bookings" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_index" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_count" integer;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "seats" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "recurrence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "bookings_series_idx" ON "bookings" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "bookings_event_start_idx" ON "bookings" USING btree ("event_type_id","start_at");