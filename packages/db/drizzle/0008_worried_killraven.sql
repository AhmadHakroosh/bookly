CREATE TABLE "waitlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_type_id" text NOT NULL,
	"start_at" timestamp with time zone,
	"date" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"attendee_name" text NOT NULL,
	"attendee_email" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"token" text NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waitlist_event_idx" ON "waitlist_entries" USING btree ("event_type_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_token_idx" ON "waitlist_entries" USING btree ("token");