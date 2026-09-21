CREATE TABLE "contact_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"booking_id" text,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"company" text,
	"phone" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stage" text DEFAULT 'lead' NOT NULL,
	"notes" text,
	"next_follow_up_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bookings_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_events_contact_idx" ON "contact_events" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_ws_email_idx" ON "contacts" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "contacts_ws_stage_idx" ON "contacts" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "contacts_ws_activity_idx" ON "contacts" USING btree ("workspace_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "bookings_contact_idx" ON "bookings" USING btree ("contact_id");--> statement-breakpoint
INSERT INTO "contacts" ("id", "workspace_id", "email", "name", "phone", "bookings_count", "last_activity_at", "created_at", "updated_at")
SELECT gen_random_uuid()::text, b."workspace_id", lower(b."attendee_email"), max(b."attendee_name"), max(b."attendee_phone"),
       count(*) FILTER (WHERE b."status" IN ('confirmed','pending','completed','no_show'))::int,
       max(b."created_at"), min(b."created_at"), now()
FROM "bookings" b GROUP BY b."workspace_id", lower(b."attendee_email")
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "bookings" b SET "contact_id" = c."id" FROM "contacts" c
WHERE c."workspace_id" = b."workspace_id" AND c."email" = lower(b."attendee_email") AND b."contact_id" IS NULL;--> statement-breakpoint
INSERT INTO "contact_events" ("id", "workspace_id", "contact_id", "booking_id", "type", "summary", "data", "created_at")
SELECT gen_random_uuid()::text, b."workspace_id", b."contact_id", b."id",
       CASE b."status" WHEN 'cancelled' THEN 'cancelled' WHEN 'completed' THEN 'completed' WHEN 'no_show' THEN 'no_show' ELSE 'booked' END,
       'Booked ' || coalesce(e."title", 'a meeting') || ' for ' || to_char(b."start_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
       '{}'::jsonb, b."created_at"
FROM "bookings" b LEFT JOIN "event_types" e ON e."id" = b."event_type_id" WHERE b."contact_id" IS NOT NULL;
