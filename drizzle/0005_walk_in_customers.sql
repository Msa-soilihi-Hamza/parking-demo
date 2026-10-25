CREATE TYPE "public"."payment_method" AS ENUM('online', 'on_site');--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_method" "payment_method" DEFAULT 'online' NOT NULL;