CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"target_label" text,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beta_cohorts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_workspaces" (
	"cohort_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohort_workspaces_cohort_id_workspace_id_pk" PRIMARY KEY("cohort_id","workspace_id")
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'off' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flag_cohorts" (
	"flag_key" text NOT NULL,
	"cohort_id" text NOT NULL,
	CONSTRAINT "flag_cohorts_flag_key_cohort_id_pk" PRIMARY KEY("flag_key","cohort_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_flags" (
	"workspace_id" text NOT NULL,
	"flag_key" text NOT NULL,
	"mode" text NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_flags_workspace_id_flag_key_pk" PRIMARY KEY("workspace_id","flag_key")
);
--> statement-breakpoint
ALTER TABLE "cohort_workspaces" ADD CONSTRAINT "cohort_workspaces_cohort_id_beta_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."beta_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_workspaces" ADD CONSTRAINT "cohort_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_cohorts" ADD CONSTRAINT "flag_cohorts_flag_key_feature_flags_key_fk" FOREIGN KEY ("flag_key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_cohorts" ADD CONSTRAINT "flag_cohorts_cohort_id_beta_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."beta_cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_flags" ADD CONSTRAINT "workspace_flags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_flags" ADD CONSTRAINT "workspace_flags_flag_key_feature_flags_key_fk" FOREIGN KEY ("flag_key") REFERENCES "public"."feature_flags"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_ws_created_idx" ON "audit_log" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "audit_log_ws_target_idx" ON "audit_log" USING btree ("workspace_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_ws_actor_idx" ON "audit_log" USING btree ("workspace_id","actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "cohort_workspaces_ws_idx" ON "cohort_workspaces" USING btree ("workspace_id");