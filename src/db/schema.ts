import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { PICKUP_STATUSES } from "../lib/pickup";

export const bookingStatus = pgEnum("booking_status", [
  // E-mail not verified yet: does not hold a spot.
  "pending_verification",
  // E-mail verified, spot held while the customer pays.
  "pending_payment",
  "confirmed",
  "cancelled",
]);

export const pickupStatus = pgEnum("pickup_status", PICKUP_STATUSES);

export const parkings = pgTable("parkings", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  airport: text("airport").notNull(),
  address: text("address").notNull(),
  capacity: integer("capacity").notNull(),
  dailyRateCents: integer("daily_rate_cents").notNull(),
  terminals: text("terminals").array().notNull(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").notNull().unique(),
    // Secret part of the customer's link: /reservation/<accessToken>
    accessToken: text("access_token").notNull().unique(),
    parkingId: integer("parking_id")
      .notNull()
      .references(() => parkings.id),
    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    plate: text("plate").notNull(),
    passengers: integer("passengers").notNull(),
    dropoffAt: timestamp("dropoff_at", { withTimezone: true }).notNull(),
    // Planned landing time of the return flight
    returnAt: timestamp("return_at", { withTimezone: true }).notNull(),
    returnTerminal: text("return_terminal"),
    priceCents: integer("price_cents").notNull(),
    status: bookingStatus("status").notNull(),
    // One-time code sent by e-mail (only its hash is stored)
    emailCodeHash: text("email_code_hash"),
    emailCodeExpiresAt: timestamp("email_code_expires_at", { withTimezone: true }),
    emailCodeSentAt: timestamp("email_code_sent_at", { withTimezone: true }),
    emailCodeAttempts: integer("email_code_attempts").notNull().default(0),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // When the spot started being held for payment
    heldAt: timestamp("held_at", { withTimezone: true }),
    // Recorded by the front desk when the customer leaves the car (QR code scanned).
    parkedAt: timestamp("parked_at", { withTimezone: true }),
    parkingSpot: text("parking_spot"),
    pickupStatus: pickupStatus("pickup_status").notNull().default("scheduled"),
    bagsReadyAt: timestamp("bags_ready_at", { withTimezone: true }),
    enRouteAt: timestamp("en_route_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    stripeSessionId: text("stripe_session_id").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_parking_period_idx").on(t.parkingId, t.dropoffAt, t.returnAt),
    index("bookings_return_idx").on(t.returnAt),
    index("bookings_dropoff_idx").on(t.dropoffAt),
  ],
);

/** One review per booking, left once the customer has been picked up. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    // Only shown on the public site when the customer agreed to it.
    publishConsent: boolean("publish_consent").notNull().default(false),
    // "Sarah M.": first name and initial, never the full name.
    authorName: text("author_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    index("reviews_published_idx").on(t.publishConsent, t.createdAt),
  ],
);

/** Shuttle team devices that accepted push notifications (one row per browser). */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The push service URL identifies the device; re-subscribing updates the keys.
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Parking = typeof parkings.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Review = typeof reviews.$inferSelect;
