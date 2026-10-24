CREATE TABLE "workspace_entitlements" (
	"workspace_id" text NOT NULL,
	"feature" text NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_entitlements_workspace_id_feature_pk" PRIMARY KEY("workspace_id","feature")
);
--> statement-breakpoint
ALTER TABLE "workspace_entitlements" ADD CONSTRAINT "workspace_entitlements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_entitlements_ws_idx" ON "workspace_entitlements" USING btree ("workspace_id");