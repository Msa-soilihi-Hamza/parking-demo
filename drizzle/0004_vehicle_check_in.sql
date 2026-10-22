ALTER TABLE "bookings" ADD COLUMN "parked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "parking_spot" text;--> statement-breakpoint
CREATE INDEX "bookings_dropoff_idx" ON "bookings" USING btree ("dropoff_at");