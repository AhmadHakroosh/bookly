DROP INDEX "contact_events_contact_idx";--> statement-breakpoint
ALTER TABLE "contact_events" ADD COLUMN "parent_id" text;--> statement-breakpoint
CREATE INDEX "contact_events_parent_idx" ON "contact_events" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "contact_events_contact_idx" ON "contact_events" USING btree ("contact_id","created_at","id");