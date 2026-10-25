// Integration test against the Docker database (`npm run db:up` first).
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { bookings, parkings, promoCodes, reviews, type Parking } from "@/db/schema";
import {
  advancePickup,
  cancelPickupRequest,
  checkInVehicle,
  confirmPayment,
  createUnverifiedBooking,
  createWalkInBooking,
  listVehiclesOnSite,
  suggestSpot,
  verifyEmailAndHold,
  type NewBookingInput,
} from "./bookings";
import { hashCode } from "./email-code";
import { submitReview } from "./reviews";

// No real e-mails during tests.
vi.mock("./mailer", () => ({
  sendVerificationCode: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendWalkInConfirmation: vi.fn(),
}));

const slug = `test-${Date.now()}`;
// A second parking with real rows of spots (A1–B20), for the front desk.
const deskSlug = `${slug}-desk`;
const CODE = "123456";
let parkingId: number;
let deskParking: Parking;

const stay = (dropoff: string, ret: string, name: string, parkingSlug = slug): NewBookingInput => ({
  parkingSlug,
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
  [deskParking] = await db
    .insert(parkings)
    .values({ slug: deskSlug, name: "Accueil de test", airport: "Test", address: "Test", capacity: 40, dailyRateCents: 1000, terminals: ["T1"] })
    .returning();
  // Open the pool's connections up front so the race below really runs in parallel.
  await Promise.all(Array.from({ length: 10 }, () => db.execute(sql`SELECT pg_sleep(0.05)`)));
});

// Test promo codes: letters and digits only, unique per run.
const runTag = String(Date.now()).slice(-8);
const promoCode = (name: string) => `${name}${runTag}`;

afterAll(async () => {
  const ids = [parkingId, deskParking.id];
  const rows = await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.parkingId, ids));
  if (rows.length) await db.delete(bookings).where(inArray(bookings.id, rows.map((r) => r.id)));
  await db.delete(parkings).where(inArray(parkings.id, ids));
  await db.delete(promoCodes).where(inArray(promoCodes.code, ["DIX", "VIEUX", "UNIQUE"].map(promoCode)));
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

describe("front desk check-in", () => {
  async function bookingRow(id: string) {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    return row;
  }

  /** A paid booking at the desk parking, not checked in yet. */
  async function paidAtDesk(from: string, to: string, name: string) {
    const id = await requestWithKnownCode(stay(from, to, name, deskSlug));
    await verifyEmailAndHold(id, CODE);
    await confirmPayment(id);
    return bookingRow(id);
  }

  it("records the time and the spot once, then refuses a second scan", async () => {
    const { id, reference } = await paidAtDesk("2027-09-01T08:00Z", "2027-09-02T08:00Z", "Arrivée");

    const first = await checkInVehicle(reference, "B12");
    expect(first.ok).toBe(true);
    const parked = await bookingRow(id);
    expect(parked.parkingSpot).toBe("B12");
    expect(parked.parkedAt).toBeInstanceOf(Date);

    const second = await checkInVehicle(reference, "C3");
    expect(second).toEqual({ ok: false, error: "Ce véhicule est déjà enregistré." });
    expect((await bookingRow(id)).parkingSpot).toBe("B12");
  });

  it("refuses a car whose booking is not paid", async () => {
    const id = await requestWithKnownCode(stay("2027-09-10T08:00Z", "2027-09-11T08:00Z", "Impayé", deskSlug));
    await verifyEmailAndHold(id, CODE);
    const { reference } = await bookingRow(id);

    expect(await checkInVehicle(reference, "A1")).toEqual({ ok: false, error: "Cette réservation n'est pas payée." });
    expect((await bookingRow(id)).parkedAt).toBeNull();
  });

  it("says when the reference does not exist", async () => {
    expect(await checkInVehicle("ESC-NOPE00", "A1")).toEqual({ ok: false, error: "Réservation introuvable." });
  });

  it("finds a parked car by plate, name or spot, until its owner is back", async () => {
    const name = `Véhicule ${slug}`;
    const { id, reference, accessToken } = await paidAtDesk("2027-09-20T08:00Z", "2027-09-21T08:00Z", name);
    await checkInVehicle(reference, "A7");

    const ids = async (search: string) => (await listVehiclesOnSite(search, 500)).rows.map((r) => r.id);
    expect(await ids("te 123 st")).toContain(id); // plate typed without dashes
    expect(await ids(name.toLowerCase())).toContain(id);
    expect(await ids("A7")).toContain(id);
    expect(await ids("100%")).not.toContain(id); // % is searched literally, not as a wildcard

    await advancePickup({ accessToken }, "scheduled", "bags_ready");
    await advancePickup({ id }, "bags_ready", "en_route");
    await advancePickup({ id }, "en_route", "picked_up");
    expect(await ids(name)).not.toContain(id);
  });

  it("refuses a spot that another car still occupies", async () => {
    // B12 is still taken by the car of the first test.
    const { reference } = await paidAtDesk("2027-10-01T08:00Z", "2027-10-02T08:00Z", "Même Place");
    const result = await checkInVehicle(reference, "B12");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/^La place B12 est déjà occupée \(ESC-/);
  });

  it("refuses a spot that does not exist in this parking", async () => {
    const { reference } = await paidAtDesk("2027-10-05T08:00Z", "2027-10-06T08:00Z", "Place Inconnue");
    expect(await checkInVehicle(reference, "C5")).toEqual({
      ok: false,
      error: "La place C5 n'existe pas dans ce parking (places A1 à B20).",
    });
  });

  it("gives a spot to only one of two cars checked in at the same instant", async () => {
    const [a, b] = await Promise.all([
      paidAtDesk("2027-10-10T08:00Z", "2027-10-11T08:00Z", "Course A"),
      paidAtDesk("2027-10-10T08:00Z", "2027-10-11T08:00Z", "Course B"),
    ]);
    const results = await Promise.all([checkInVehicle(a.reference, "B20"), checkInVehicle(b.reference, "B20")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("suggests the first free spot of the plan", async () => {
    const { reference } = await paidAtDesk("2027-10-15T08:00Z", "2027-10-16T08:00Z", "Première Place");
    expect(await suggestSpot(deskParking)).toBe("A1");
    await checkInVehicle(reference, "A1");
    expect(await suggestSpot(deskParking)).toBe("A2");
  });
});

describe("customer registered at the desk", () => {
  const walkIn = (name: string) => ({
    parkingSlug: slug,
    returnAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    returnTerminal: null,
    customerName: name,
    email: null,
    phone: "0600000000",
    plate: "WA-123-LK",
    passengers: 2,
    spot: "A1",
  });

  it("creates a paid booking with the car already parked, and no e-mail needed", async () => {
    const result = await createWalkInBooking(walkIn("Sur Place"));
    if (!result.ok) throw new Error(result.error);
    const { booking } = result;
    expect(booking).toMatchObject({
      status: "confirmed",
      paymentMethod: "on_site",
      parkingSpot: "A1",
      email: null,
    });
    expect(booking.parkedAt).toBeInstanceOf(Date);
    expect(booking.priceCents).toBe(3000); // 3 days at 10 €, no discount below day 4
  });

  it("refuses a second car when the parking is full, like online", async () => {
    // The test parking has one spot, taken by the previous walk-in.
    const result = await createWalkInBooking(walkIn("Trop Tard"));
    expect(result).toEqual({ ok: false, error: "Ce parking est complet sur une partie de la période." });
  });

  it("rejects a terminal that does not belong to the parking", async () => {
    const result = await createWalkInBooking({ ...walkIn("Mauvais Terminal"), returnTerminal: "T9" });
    expect(result).toEqual({ ok: false, error: "Terminal inconnu pour cet aéroport." });
  });
});

describe("promo codes", () => {
  beforeAll(async () => {
    await db.insert(promoCodes).values([
      { code: promoCode("DIX"), kind: "percent", value: 10 },
      { code: promoCode("VIEUX"), kind: "amount", value: 500, validUntil: new Date("2020-01-01") },
      { code: promoCode("UNIQUE"), kind: "percent", value: 50, maxUses: 1 },
    ]);
  });

  const desk = (from: string, to: string, name: string, code?: string) => ({
    ...stay(from, to, name, deskSlug),
    promoCode: code,
  });

  it("stores the discount of a valid code with the booking", async () => {
    // 3 days at 10 €: 30 €, minus 10 %.
    const created = await createUnverifiedBooking(desk("2028-01-01T08:00Z", "2028-01-04T08:00Z", "Promo", promoCode("DIX")));
    if (!created.ok) throw new Error(created.error);
    expect(created.booking).toMatchObject({ priceCents: 2700, discountCents: 300 });
  });

  it("refuses an expired code instead of charging the full price silently", async () => {
    const created = await createUnverifiedBooking(desk("2028-01-10T08:00Z", "2028-01-11T08:00Z", "Expiré", promoCode("VIEUX")));
    expect(created).toEqual({ ok: false, error: "Ce code promo a expiré." });
  });

  it("gives the last use of a limited code to only one of two customers", async () => {
    const [a, b] = await Promise.all([
      requestWithKnownCode(desk("2028-02-01T08:00Z", "2028-02-02T08:00Z", "Unique A", promoCode("UNIQUE"))),
      requestWithKnownCode(desk("2028-02-01T08:00Z", "2028-02-02T08:00Z", "Unique B", promoCode("UNIQUE"))),
    ]);
    const results = await Promise.all([verifyEmailAndHold(a, CODE), verifyEmailAndHold(b, CODE)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.error).toMatch(/nombre d'utilisations/);
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
