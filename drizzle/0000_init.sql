CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pickup_status" AS ENUM('scheduled', 'bags_ready', 'en_route', 'picked_up');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"access_token" text NOT NULL,
	"parking_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"plate" text NOT NULL,
	"passengers" integer NOT NULL,
	"dropoff_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone NOT NULL,
	"return_terminal" text,
	"price_cents" integer NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"pickup_status" "pickup_status" DEFAULT 'scheduled' NOT NULL,
	"bags_ready_at" timestamp with time zone,
	"en_route_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"stripe_session_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bookings_access_token_unique" UNIQUE("access_token"),
	CONSTRAINT "bookings_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "parkings" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"airport" text NOT NULL,
	"address" text NOT NULL,
	"capacity" integer NOT NULL,
	"daily_rate_cents" integer NOT NULL,
	"terminals" text[] NOT NULL,
	CONSTRAINT "parkings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_parking_id_parkings_id_fk" FOREIGN KEY ("parking_id") REFERENCES "public"."parkings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_parking_period_idx" ON "bookings" USING btree ("parking_id","dropoff_at","return_at");--> statement-breakpoint
CREATE INDEX "bookings_return_idx" ON "bookings" USING btree ("return_at");