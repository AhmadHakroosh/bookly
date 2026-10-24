CREATE TABLE "stage_rule_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"cause_id" text NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"conditions" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stage_rule_runs" ADD CONSTRAINT "stage_rule_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_rule_runs" ADD CONSTRAINT "stage_rule_runs_rule_id_stage_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."stage_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_rules" ADD CONSTRAINT "stage_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_rules" ADD CONSTRAINT "stage_rules_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_rules" ADD CONSTRAINT "stage_rules_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_rules" ADD CONSTRAINT "stage_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stage_rule_runs_cause_idx" ON "stage_rule_runs" USING btree ("rule_id","cause_id");--> statement-breakpoint
CREATE INDEX "stage_rule_runs_due_idx" ON "stage_rule_runs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "stage_rule_runs_subject_idx" ON "stage_rule_runs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "stage_rules_stage_idx" ON "stage_rules" USING btree ("stage_id","position");--> statement-breakpoint
CREATE INDEX "stage_rules_ws_idx" ON "stage_rules" USING btree ("workspace_id");