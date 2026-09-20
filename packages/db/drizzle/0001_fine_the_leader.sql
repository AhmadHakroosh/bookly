CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', 'no_show');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_type_id" text,
	"host_user_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"attendee_name" text NOT NULL,
	"attendee_email" text NOT NULL,
	"attendee_phone" text,
	"notes" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"manage_token" text NOT NULL,
	"cancel_reason" text,
	"cancelled_by" text,
	"rescheduled_from_id" text,
	"location" jsonb DEFAULT '{"type":"custom"}'::jsonb NOT NULL,
	"meeting_url" text,
	"meeting_provider" text,
	"meeting_ref" jsonb,
	"external_event_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reminders_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"schedule_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"slot_interval_min" integer,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"min_notice_min" integer DEFAULT 120 NOT NULL,
	"max_days_ahead" integer DEFAULT 60 NOT NULL,
	"max_per_day" integer,
	"location" jsonb DEFAULT '{"type":"daily"}'::jsonb NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requires_confirmation" boolean DEFAULT false NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"price_cents" integer,
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"avatar_url" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"date" text NOT NULL,
	"start_min" integer,
	"end_min" integer
);
--> statement-breakpoint
CREATE TABLE "schedule_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Working hours' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_type_id_event_types_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "public"."event_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_overrides" ADD CONSTRAINT "schedule_overrides_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_host_start_idx" ON "bookings" USING btree ("host_user_id","start_at");--> statement-breakpoint
CREATE INDEX "bookings_ws_start_idx" ON "bookings" USING btree ("workspace_id","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_manage_token_idx" ON "bookings" USING btree ("manage_token");--> statement-breakpoint
CREATE INDEX "bookings_reminders_idx" ON "bookings" USING btree ("status","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_types_user_slug_idx" ON "event_types" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "event_types_ws_idx" ON "event_types" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_ws_username_idx" ON "profiles" USING btree ("workspace_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_ws_user_idx" ON "profiles" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "schedule_overrides_schedule_date_idx" ON "schedule_overrides" USING btree ("schedule_id","date");--> statement-breakpoint
CREATE INDEX "schedule_rules_schedule_idx" ON "schedule_rules" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "schedules_ws_user_idx" ON "schedules" USING btree ("workspace_id","user_id");