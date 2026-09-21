CREATE TABLE "meeting_recaps" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"contact_id" text,
	"recap" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accepted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_recaps" ADD CONSTRAINT "meeting_recaps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_recaps_booking_idx" ON "meeting_recaps" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "meeting_recaps_ws_review_idx" ON "meeting_recaps" USING btree ("workspace_id","reviewed_at");