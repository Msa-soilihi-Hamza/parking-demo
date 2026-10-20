// Integration test against the Docker database (`npm run db:up` first).
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { bookings, parkings, reviews } from "@/db/schema";
import {
  advancePickup,
  cancelPickupRequest,
  confirmPayment,
  createUnverifiedBooking,
  verifyEmailAndHold,
  type NewBookingInput,
} from "./bookings";
import { hashCode } from "./email-code";
import { submitReview } from "./reviews";

// No real e-mails during tests.
vi.mock("./mailer", () => ({
  sendVerificationCode: vi.fn(),
  sendBookingConfirmation: vi.fn(),
}));

const slug = `test-${Date.now()}`;
const CODE = "123456";
let parkingId: number;

const stay = (dropoff: string, ret: string, name: string): NewBookingInput => ({
  parkingSlug: slug,
  dropoffAt: new Date(dropoff),
  returnAt: new Date(ret),
  returnTerminal: null,
  customerName: name,
  email: "test@example.com",
  phone: "0600000000",
  plate: "TE-123-ST",
  passengers: 1,
});

/** Creates a request and forces a known code, as if read from the e-mail. */
async function requestWithKnownCode(input: NewBookingInput) {
  const created = await createUnverifiedBooking(input);
  if (!created.ok) throw new Error(created.error);
  await db
    .update(bookings)
    .set({ emailCodeHash: hashCode(created.booking.id, CODE) })
    .where(eq(bookings.id, created.booking.id));
  return created.booking.id;
}

beforeAll(async () => {
  const [parking] = await db
    .insert(parkings)
    .values({
      slug,
      name: "Parking de test",
      airport: "Test",
      address: "Test",
      capacity: 1,
      dailyRateCents: 1000,
      terminals: ["T1"],
    })
    .returning();
  parkingId = parking.id;
  // Open the pool's connections up front so the race below really runs in parallel.
  await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`SELECT pg_sleep(0.05)`)));
});

afterAll(async () => {
  const rows = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.parkingId, parkingId));
  if (rows.length) await db.delete(bookings).where(inArray(bookings.id, rows.map((r) => r.id)));
  await db.delete(parkings).where(eq(parkings.id, parkingId));
});

describe("e-mail verification", () => {
  it("does not hold a spot before the e-mail is verified", async () => {
    const first = await createUnverifiedBooking(stay("2027-05-01T08:00Z", "2027-05-03T08:00Z", "A"));
    const second = await createUnverifiedBooking(stay("2027-05-01T08:00Z", "2027-05-03T08:00Z", "B"));
    expect(first.ok && second.ok).toBe(true);
  });

  it("rejects a wrong code and counts the attempt", async () => {
    const id = await requestWithKnownCode(stay("2027-06-01T08:00Z", "2027-06-02T08:00Z", "C"));
    const result = await verifyEmailAndHold(id, "000000");
    expect(result.ok).toBe(false);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row.emailCodeAttempts).toBe(1);
    expect(row.status).toBe("pending_verification");
  });

  it("locks the request after 5 wrong codes, even with the right one", async () => {
    const id = await requestWithKnownCode(stay("2027-06-10T08:00Z", "2027-06-11T08:00Z", "D"));
    for (let i = 0; i < 5; i++) await verifyEmailAndHold(id, "000000");
    expect((await verifyEmailAndHold(id, CODE)).ok).toBe(false);
  });
});

describe("holding the last spot", () => {
  it("lets only one of ten simultaneous customers take the last spot", async () => {
    const ids = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        requestWithKnownCode(stay("2027-03-01T08:00Z", "2027-03-05T08:00Z", `Client ${i}`)),
      ),
    );
    const results = await Promise.all(ids.map((id) => verifyEmailAndHold(id, CODE)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(9);
  });

  it("accepts a stay that starts after the previous car has left", async () => {
    const id = await requestWithKnownCode(stay("2027-03-05T09:00Z", "2027-03-07T09:00Z", "Suivant"));
    expect((await verifyEmailAndHold(id, CODE)).ok).toBe(true);
  });
});

describe("payment", () => {
  it("confirms a payment only once, even if Stripe sends the event twice", async () => {
    const id = await requestWithKnownCode(stay("2027-04-01T08:00Z", "2027-04-02T08:00Z", "Stripe"));
    expect((await verifyEmailAndHold(id, CODE)).ok).toBe(true);
    expect(await confirmPayment(id)).toBe(true);
    expect(await confirmPayment(id)).toBe(false);
  });
});

describe("cancelling the bags button", () => {
  async function confirmedBooking(from: string, to: string) {
    const id = await requestWithKnownCode(stay(from, to, "Retour"));
    await verifyEmailAndHold(id, CODE);
    await confirmPayment(id);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    return row;
  }

  it("can be undone while no driver has left", async () => {
    const booking = await confirmedBooking("2027-07-01T08:00Z", "2027-07-02T08:00Z");
    await advancePickup({ accessToken: booking.accessToken }, "scheduled", "bags_ready");
    expect(await cancelPickupRequest(booking.accessToken)).toBe(true);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(row.pickupStatus).toBe("scheduled");
    expect(row.bagsReadyAt).toBeNull();
  });

  it("cannot be undone once the shuttle is on its way", async () => {
    const booking = await confirmedBooking("2027-07-10T08:00Z", "2027-07-11T08:00Z");
    await advancePickup({ accessToken: booking.accessToken }, "scheduled", "bags_ready");
    await advancePickup({ id: booking.id }, "bags_ready", "en_route");
    expect(await cancelPickupRequest(booking.accessToken)).toBe(false);
  });
});

describe("reviews", () => {
  async function pickedUpBooking(from: string, to: string, name: string) {
    const id = await requestWithKnownCode(stay(from, to, name));
    await verifyEmailAndHold(id, CODE);
    await confirmPayment(id);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    return row;
  }

  it("refuses a review before the customer is picked up", async () => {
    const booking = await pickedUpBooking("2027-08-01T08:00Z", "2027-08-02T08:00Z", "Avant Retour");
    const result = await submitReview({ accessToken: booking.accessToken, rating: 5, comment: null, publishConsent: true });
    expect(result.ok).toBe(false);
  });

  it("accepts one review after the pickup, and only one", async () => {
    const booking = await pickedUpBooking("2027-08-10T08:00Z", "2027-08-11T08:00Z", "sarah martin");
    await advancePickup({ accessToken: booking.accessToken }, "scheduled", "bags_ready");
    await advancePickup({ id: booking.id }, "bags_ready", "en_route");
    await advancePickup({ id: booking.id }, "en_route", "picked_up");

    const first = await submitReview({ accessToken: booking.accessToken, rating: 4, comment: "  Top  ", publishConsent: true });
    const second = await submitReview({ accessToken: booking.accessToken, rating: 1, comment: null, publishConsent: true });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);

    const [review] = await db.select().from(reviews).where(eq(reviews.bookingId, booking.id));
    expect(review).toMatchObject({ rating: 4, comment: "Top", authorName: "Sarah M." });
  });

  it("rejects a rating outside 1 to 5", async () => {
    const result = await submitReview({ accessToken: "whatever", rating: 6, comment: null, publishConsent: false });
    expect(result.ok).toBe(false);
  });
});
