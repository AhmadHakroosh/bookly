CREATE TABLE "solution_access" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"solution" text NOT NULL,
	"granted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solution_access_workspace_id_user_id_solution_pk" PRIMARY KEY("workspace_id","user_id","solution")
);
--> statement-breakpoint
CREATE TABLE "workspace_solutions" (
	"workspace_id" text NOT NULL,
	"solution" text NOT NULL,
	"enabled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled_by" text,
	"disabled_at" timestamp with time zone,
	"setup_completed_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_solutions_workspace_id_solution_pk" PRIMARY KEY("workspace_id","solution")
);
--> statement-breakpoint
DROP INDEX "threads_guest_contact_idx";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "client_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "solution" text DEFAULT 'clients' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "solution" text DEFAULT 'clients' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "solution" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "solution" text;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "solution" text DEFAULT 'clients' NOT NULL;--> statement-breakpoint
ALTER TABLE "folders" ADD COLUMN "opportunity_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "solution" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "solution" text DEFAULT 'clients' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "application_id" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "opportunity_id" text;--> statement-breakpoint
ALTER TABLE "solution_access" ADD CONSTRAINT "solution_access_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_access" ADD CONSTRAINT "solution_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solution_access" ADD CONSTRAINT "solution_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_solutions" ADD CONSTRAINT "workspace_solutions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_solutions" ADD CONSTRAINT "workspace_solutions_enabled_by_users_id_fk" FOREIGN KEY ("enabled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solution_access_user_idx" ON "solution_access" USING btree ("workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_ws_client_activity_idx" ON "contacts" USING btree ("workspace_id","last_activity_at") WHERE "contacts"."client_at" is not null;--> statement-breakpoint
CREATE INDEX "threads_ws_solution_activity_idx" ON "threads" USING btree ("workspace_id","solution","last_activity_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_guest_application_idx" ON "threads" USING btree ("application_id") WHERE "threads"."kind" = 'guest' and "threads"."solution" = 'hiring';--> statement-breakpoint
CREATE UNIQUE INDEX "threads_guest_contact_idx" ON "threads" USING btree ("contact_id") WHERE "threads"."kind" = 'guest' and "threads"."solution" = 'clients';--> statement-breakpoint
-- Backfills (ADR 0009), idempotent. Clients: everyone who isn't a candidate only.
UPDATE "contacts" c SET "client_at" = c."created_at"
WHERE c."client_at" IS NULL
  AND (c."stage_id" IS NOT NULL OR NOT EXISTS (SELECT 1 FROM "applications" a WHERE a."contact_id" = c."id"));--> statement-breakpoint
-- Files: hiring when tied to an application (linked, or sent with an application's form); other drive files are clients.
UPDATE "files" f SET "solution" = 'hiring'
WHERE f."solution" IS NULL AND f."kind" = 'attachment'
  AND (EXISTS (SELECT 1 FROM "file_links" l WHERE l."file_id" = f."id" AND l."target_type" = 'application')
    OR EXISTS (SELECT 1 FROM "form_responses" r WHERE f."owner_type" = 'form_response' AND r."id" = f."owner_id" AND r."application_id" IS NOT NULL));--> statement-breakpoint
UPDATE "files" SET "solution" = 'clients' WHERE "solution" IS NULL AND "kind" = 'attachment';--> statement-breakpoint
-- Every workspace runs Clients; Hiring where it already has opportunities.
INSERT INTO "workspace_solutions" ("workspace_id", "solution", "setup_completed_at")
SELECT w."id", 'clients', now() FROM "workspaces" w
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_solutions" ("workspace_id", "solution", "setup_completed_at")
SELECT DISTINCT o."workspace_id", 'hiring', now() FROM "opportunities" o
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Access as today: members keep Clients; members on an opportunity team and collaborators get Hiring.
INSERT INTO "solution_access" ("workspace_id", "user_id", "solution")
SELECT w."id", m."user_id", 'clients' FROM "members" m JOIN "workspaces" w ON w."organization_id" = m."organization_id"
WHERE m."role" = 'member'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "solution_access" ("workspace_id", "user_id", "solution")
SELECT DISTINCT w."id", m."user_id", 'hiring' FROM "members" m JOIN "workspaces" w ON w."organization_id" = m."organization_id"
WHERE m."role" = 'collaborator'
   OR (m."role" = 'member' AND EXISTS (SELECT 1 FROM "opportunity_members" om WHERE om."workspace_id" = w."id" AND om."user_id" = m."user_id"))
ON CONFLICT DO NOTHING;
