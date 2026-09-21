CREATE TABLE "meeting_transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"provider_ref" text,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"language" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "capture_consent" boolean;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "transcript_status" text;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "auto_capture" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_transcripts" ADD CONSTRAINT "meeting_transcripts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_transcripts_booking_idx" ON "meeting_transcripts" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "meeting_transcripts_expires_idx" ON "meeting_transcripts" USING btree ("expires_at");