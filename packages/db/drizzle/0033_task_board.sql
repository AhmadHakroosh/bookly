CREATE TABLE "task_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"mentions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#71717a' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"wip_limit" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_views" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"layout" text DEFAULT 'board' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "position" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_statuses" ADD CONSTRAINT "task_statuses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_views" ADD CONSTRAINT "task_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_views" ADD CONSTRAINT "task_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_views" ADD CONSTRAINT "task_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_comments_task_idx" ON "task_comments" USING btree ("task_id","created_at","id");--> statement-breakpoint
CREATE INDEX "task_statuses_ws_idx" ON "task_statuses" USING btree ("workspace_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "task_statuses_ws_name_idx" ON "task_statuses" USING btree ("workspace_id","name") WHERE "task_statuses"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "task_views_ws_idx" ON "task_views" USING btree ("workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_id_task_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."task_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_ws_status_idx" ON "tasks" USING btree ("workspace_id","status_id","position","id");--> statement-breakpoint
-- Every existing workspace starts with the default flow; new workspaces get it on first use.
INSERT INTO "task_statuses" ("id", "workspace_id", "name", "color", "position", "is_default", "is_done")
SELECT gen_random_uuid()::text, w."id", s."name", s."color", s."position", s."is_default", s."is_done"
FROM "workspaces" w
CROSS JOIN (VALUES
  ('To do', '#71717a', 0, true, false),
  ('In progress', '#2563eb', 1, false, false),
  ('Done', '#16a34a', 2, false, true)
) AS s("name", "color", "position", "is_default", "is_done");--> statement-breakpoint
-- Open tasks go to To do, done ones to Done, in their old order (due date, then creation).
UPDATE "tasks" t SET "status_id" = s."id", "position" = o."rn" * 1024
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "workspace_id", ("done_at" IS NULL)
    ORDER BY "due_at" ASC NULLS LAST, "created_at" ASC
  ) AS "rn"
  FROM "tasks"
) o, "task_statuses" s
WHERE o."id" = t."id"
  AND s."workspace_id" = t."workspace_id"
  AND s."name" = CASE WHEN t."done_at" IS NULL THEN 'To do' ELSE 'Done' END;
