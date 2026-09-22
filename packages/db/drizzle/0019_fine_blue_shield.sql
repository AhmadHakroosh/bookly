CREATE TABLE "installs" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"tenancy" text NOT NULL,
	"node_version" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pings" integer DEFAULT 1 NOT NULL,
	"stats" jsonb
);
