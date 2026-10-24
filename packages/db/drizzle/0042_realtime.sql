CREATE TABLE "realtime_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"transport" text NOT NULL,
	"node" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "fallback_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "fallback" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "delivery" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "realtime_connections" ADD CONSTRAINT "realtime_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "realtime_connections" ADD CONSTRAINT "realtime_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "realtime_connections_user_idx" ON "realtime_connections" USING btree ("workspace_id","user_id","seen_at");--> statement-breakpoint
CREATE INDEX "realtime_connections_seen_idx" ON "realtime_connections" USING btree ("seen_at");--> statement-breakpoint
CREATE INDEX "notifications_fallback_idx" ON "notifications" USING btree ("fallback_at") WHERE "notifications"."fallback_at" is not null;