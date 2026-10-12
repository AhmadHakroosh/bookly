CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"sha256" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by" text,
	"owner_type" text,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_key_idx" ON "files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "files_ws_created_idx" ON "files" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "files_ws_status_idx" ON "files" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_type","owner_id");