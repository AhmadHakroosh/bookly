ALTER TABLE "bookings" ADD COLUMN "capture_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_opt_out_at" timestamp with time zone;