ALTER TABLE "applications" ADD COLUMN "status_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "privacy_version" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "privacy_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "future_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "data_requests" ADD COLUMN "status_token_hash" text;