CREATE TABLE "opportunity_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"opportunity_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" text,
	"invitation_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_cohorts" ADD COLUMN "decides_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunity_invites" ADD CONSTRAINT "opportunity_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_invites" ADD CONSTRAINT "opportunity_invites_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_invites" ADD CONSTRAINT "opportunity_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_invites_opp_email_idx" ON "opportunity_invites" USING btree ("opportunity_id","email");--> statement-breakpoint
CREATE INDEX "opportunity_invites_ws_email_idx" ON "opportunity_invites" USING btree ("workspace_id","email");