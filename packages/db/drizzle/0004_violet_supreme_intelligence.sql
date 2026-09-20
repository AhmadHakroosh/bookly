ALTER TYPE "public"."booking_status" ADD VALUE 'awaiting_payment' BEFORE 'pending';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_status" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "amount_cents" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_ref" jsonb;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "remind_by_text" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "notifications" jsonb DEFAULT '{}'::jsonb NOT NULL;