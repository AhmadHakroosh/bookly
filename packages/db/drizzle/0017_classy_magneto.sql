CREATE TABLE "operator_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"workspace_id" text NOT NULL,
	"day" text NOT NULL,
	"metric" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_workspace_id_day_metric_pk" PRIMARY KEY("workspace_id","day","metric")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_managed_by" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_note" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_audit_created_idx" ON "operator_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "operator_audit_target_idx" ON "operator_audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "usage_counters_ws_idx" ON "usage_counters" USING btree ("workspace_id","day");