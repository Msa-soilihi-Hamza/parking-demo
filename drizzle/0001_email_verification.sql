ALTER TYPE "public"."booking_status" ADD VALUE 'pending_verification' BEFORE 'pending_payment';--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "email_code_hash" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "email_code_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "email_code_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "email_code_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "held_at" timestamp with time zone;