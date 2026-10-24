CREATE TABLE "pipeline_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'open' NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"color" text DEFAULT '#71717a' NOT NULL,
	"is_entry" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"template" text,
	"is_template" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"from_stage_id" text,
	"to_stage_id" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"depth" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "stage_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "stage_entered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_from_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_to_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_stages_pipeline_idx" ON "pipeline_stages" USING btree ("pipeline_id","position");--> statement-breakpoint
CREATE INDEX "pipeline_stages_ws_idx" ON "pipeline_stages" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_key_idx" ON "pipeline_stages" USING btree ("pipeline_id","key") WHERE "pipeline_stages"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_entry_idx" ON "pipeline_stages" USING btree ("pipeline_id") WHERE "pipeline_stages"."is_entry" and "pipeline_stages"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "pipelines_ws_kind_idx" ON "pipelines" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_ws_default_client_idx" ON "pipelines" USING btree ("workspace_id") WHERE "pipelines"."is_default" and "pipelines"."kind" = 'client';--> statement-breakpoint
CREATE INDEX "stage_transitions_subject_idx" ON "stage_transitions" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "stage_transitions_ws_to_idx" ON "stage_transitions" USING btree ("workspace_id","to_stage_id","created_at");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_ws_stage_id_idx" ON "contacts" USING btree ("workspace_id","stage_id","last_activity_at");--> statement-breakpoint
-- Backfill (ADR 0001): every workspace gets its default client pipeline with today's four
-- stages, and every contact points at the stage its legacy column names. Each statement is
-- guarded, so running it again changes nothing. Keep the stage list in step with
-- CLIENT_PIPELINE in apps/web/src/server/pipelines-text.ts.
INSERT INTO "pipelines" ("id", "workspace_id", "kind", "name", "template", "is_default")
SELECT gen_random_uuid()::text, w."id", 'client', 'Clients', 'clients', true
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "pipelines" p
  WHERE p."workspace_id" = w."id" AND p."kind" = 'client' AND p."is_default"
);--> statement-breakpoint
INSERT INTO "pipeline_stages" ("id", "workspace_id", "pipeline_id", "key", "name", "category", "position", "color", "is_entry", "settings")
SELECT gen_random_uuid()::text, p."workspace_id", p."id", s.key, s.name, s.category, s.position, s.color, s.is_entry, s.settings::jsonb
FROM "pipelines" p
CROSS JOIN (VALUES
  ('lead', 'Lead', 'open', 1, '#71717a', true, '{}'),
  ('active', 'Active', 'open', 2, '#2563eb', false, '{"priorityScheduling":true}'),
  ('won', 'Won', 'won', 3, '#16a34a', false, '{"priorityScheduling":true}'),
  ('lost', 'Lost', 'lost', 4, '#dc2626', false, '{}')
) AS s(key, name, category, position, color, is_entry, settings)
WHERE p."kind" = 'client' AND p."is_default"
  AND NOT EXISTS (SELECT 1 FROM "pipeline_stages" x WHERE x."pipeline_id" = p."id");--> statement-breakpoint
UPDATE "contacts" c
SET "stage_id" = s."id", "stage_entered_at" = c."updated_at"
FROM "pipeline_stages" s
JOIN "pipelines" p ON p."id" = s."pipeline_id"
WHERE c."stage_id" IS NULL
  AND p."workspace_id" = c."workspace_id" AND p."kind" = 'client' AND p."is_default"
  AND s."key" = c."stage" AND s."archived_at" IS NULL;
