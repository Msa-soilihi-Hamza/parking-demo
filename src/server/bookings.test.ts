// Integration test against the Docker database (`npm run db:up` first).
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { bookings, parkings, promoCodes, reviews, user, type Parking } from "@/db/schema";
import {
  advancePickup,
  attachStripeSession,
  cancelPickupRequest,
  checkInVehicle,
  confirmPayment,
  createWalkInBooking,
  holdBooking,
  listCustomerBookings,
  listVehiclesOnSite,
  MAX_PENDING_HOLDS,
  MAX_PICKUP_REQUESTS,
  releaseHold,
  renewHold,
  suggestSpot,
  type Customer,
  type NewBookingInput,
} from "./bookings";
import { submitReview } from "./reviews";

// No real e-mails during tests.
vi.mock("./mailer", () => ({
  sendBookingConfirmation: vi.fn(),
  sendWalkInConfirmation: vi.fn(),
}));

const slug = `test-${Date.now()}`;
// A second parking with real rows of spots (A1–B20), for the front desk.
const deskSlug = `${slug}-desk`;
let parkingId: number;
let deskParking: Parking;

const stay = (dropoff: string, ret: string, name: string, parkingSlug = slug): NewBookingInput => ({
  parkingSlug,
  dropoffAt: new Date(dropoff),
  returnAt: new Date(ret),
  returnTerminal: null,
  customerName: name,
  phone: "0600000000",
  plate: "TE-123-ST",
  passengers: 1,
});

// Booking requires an account: a test customer, as if signed in (code or Google).
const accountTag = String(Date.now()).slice(-8);
const customer: Customer = { userId: `test-user-${accountTag}`, email: `client.${accountTag}@example.com` };
// The same account, as "Mon espace" sees it (its e-mail is verified).
const owner = { id: customer.userId, email: customer.email, emailVerified: true };

let others = 0;
/** Another signed-in customer: one account may only hold a few unpaid spots at once. */
async function another(): Promise<Customer> {
  others += 1;
  const id = `test-other-${accountTag}-${others}`;
  const email = `other.${accountTag}.${others}@example.com`;
  await db.insert(user).values({ id, name: "Client Test", email, emailVerified: true });
  return { userId: id, email };
}

/** The signed-in customer books: the spot is held for payment. Returns the booking id. */
async function hold(input: NewBookingInput) {
  const held = await holdBooking(input, await another());
  if (!held.ok) throw new Error(held.error);
  return held.booking.id;
}

beforeAll(async () => {
  await db.insert(user).values({ id: customer.userId, name: "Client Test", email: customer.email, emailVerified: true });
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
  await db.delete(user).where(eq(user.id, customer.userId));
  await db.delete(user).where(sql`${user.id} like ${`test-other-${accountTag}-%`}`);
});

describe("booking with an account", () => {
  it("holds the spot for the signed-in customer, with the e-mail of the account", async () => {
    const held = await holdBooking(stay("2027-05-01T08:00Z", "2027-05-03T08:00Z", "Compte"), customer);
    if (!held.ok) throw new Error(held.error);
    expect(held.booking).toMatchObject({ userId: customer.userId, email: customer.email, status: "pending_payment" });
    expect(held.booking.heldAt).toBeInstanceOf(Date);
  });

  it("lists the customer's bookings in their space, including older ones found by e-mail", async () => {
    // A booking from before accounts existed: no user, same e-mail written differently.
    const [older] = await db
      .insert(bookings)
      .values({
        reference: `ESC-OLD${accountTag}`,
        accessToken: `older-${accountTag}`,
        parkingId,
        customerName: "Client Test",
        email: customer.email.toUpperCase(),
        phone: "0600000000",
        plate: "OL-000-DD",
        passengers: 1,
        dropoffAt: new Date("2027-05-10T08:00Z"),
        returnAt: new Date("2027-05-11T08:00Z"),
        priceCents: 1000,
        status: "confirmed",
      })
      .returning();
    const ids = (await listCustomerBookings(owner)).map((r) => r.booking.id);
    expect(ids).toContain(older.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    // An account whose e-mail is not verified only gets its own bookings.
    const unverified = (await listCustomerBookings({ ...owner, emailVerified: false })).map((r) => r.booking.id);
    expect(unverified).not.toContain(older.id);
  });

  it("does not hand a front-desk booking to the account whose e-mail the desk typed", async () => {
    const created = await createWalkInBooking({
      parkingSlug: deskSlug,
      returnAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      returnTerminal: null,
      customerName: "Quelqu'un d'autre",
      email: customer.email,
      phone: "0600000000",
      plate: "AU-777-TR",
      passengers: 1,
      spot: "B19",
    });
    if (!created.ok) throw new Error(created.error);
    const ids = (await listCustomerBookings(owner)).map((r) => r.booking.id);
    expect(ids).not.toContain(created.booking.id);
  });

  it("limits the unpaid holds one account can have at once", async () => {
    const [{ id: holderId }] = await db
      .insert(user)
      .values({ id: `holder-${accountTag}`, name: "Bloqueur", email: `holder.${accountTag}@example.com`, emailVerified: true })
      .returning({ id: user.id });
    const holder: Customer = { userId: holderId, email: `holder.${accountTag}@example.com` };
    for (let i = 0; i < MAX_PENDING_HOLDS; i++) {
      const held = await holdBooking(stay(`2029-0${i + 1}-01T08:00Z`, `2029-0${i + 1}-02T08:00Z`, "Bloqueur", deskSlug), holder);
      expect(held.ok).toBe(true);
    }
    const refused = await holdBooking(stay("2029-08-01T08:00Z", "2029-08-02T08:00Z", "Bloqueur", deskSlug), holder);
    expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/en attente de paiement/) });
    await db.delete(bookings).where(eq(bookings.userId, holderId));
    await db.delete(user).where(eq(user.id, holderId));
  });
});

describe("holding the last spot", () => {
  it("lets only one of ten simultaneous customers take the last spot", async () => {
    const racers = await Promise.all(Array.from({ length: 10 }, () => another()));
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        holdBooking(stay("2027-03-01T08:00Z", "2027-03-05T08:00Z", `Client ${i}`), racers[i]),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(9);
  });

  it("accepts a stay that starts after the previous car has left", async () => {
    expect((await holdBooking(stay("2027-03-05T09:00Z", "2027-03-07T09:00Z", "Suivant"), await another())).ok).toBe(true);
  });
});

describe("payment", () => {
  it("confirms a payment only once, even if Stripe sends the event twice", async () => {
    const id = await hold(stay("2027-04-01T08:00Z", "2027-04-02T08:00Z", "Stripe"));
    expect(await confirmPayment(id)).toBe(true);
    expect(await confirmPayment(id)).toBe(false);
  });

  it("frees the spot only when the booking's current Stripe session expires, not an older one", async () => {
    const id = await hold(stay("2027-04-10T08:00Z", "2027-04-11T08:00Z", "Relance"));
    await attachStripeSession(id, `cs_test_new_${id}`);
    // The session replaced by a retry expires: the spot stays held.
    await releaseHold(id, `cs_test_old_${id}`);
    expect((await db.select().from(bookings).where(eq(bookings.id, id)))[0].status).toBe("pending_payment");
    await releaseHold(id, `cs_test_new_${id}`);
    expect((await db.select().from(bookings).where(eq(bookings.id, id)))[0].status).toBe("cancelled");
  });

  it("restarts the hold on a retry, so it outlasts the new Stripe session", async () => {
    const id = await hold(stay("2027-04-20T08:00Z", "2027-04-21T08:00Z", "Relance"));
    const old = new Date(Date.now() - 25 * 60 * 1000);
    await db.update(bookings).set({ heldAt: old }).where(eq(bookings.id, id));
    await renewHold(id);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
    expect(row.heldAt!.getTime()).toBeGreaterThan(old.getTime() + 20 * 60 * 1000);
  });
});

describe("cancelling the bags button", () => {
  async function confirmedBooking(from: string, to: string) {
    const id = await hold(stay(from, to, "Retour"));
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

  it("stops alerting the drivers after a few presses and cancels of the same booking", async () => {
    const booking = await confirmedBooking("2027-07-20T08:00Z", "2027-07-21T08:00Z");
    for (let i = 0; i < MAX_PICKUP_REQUESTS; i++) {
      expect(await advancePickup({ accessToken: booking.accessToken }, "scheduled", "bags_ready")).toBe(true);
      expect(await cancelPickupRequest(booking.accessToken)).toBe(true);
    }
    expect(await advancePickup({ accessToken: booking.accessToken }, "scheduled", "bags_ready")).toBe(false);
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
    const id = await hold(stay(from, to, name, deskSlug));
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
    // Held but not paid.
    const id = await hold(stay("2027-09-10T08:00Z", "2027-09-11T08:00Z", "Impayé", deskSlug));
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
    const created = await holdBooking(desk("2028-01-01T08:00Z", "2028-01-04T08:00Z", "Promo", promoCode("DIX")), await another());
    if (!created.ok) throw new Error(created.error);
    expect(created.booking).toMatchObject({ priceCents: 2700, discountCents: 300 });
  });

  it("refuses an expired code instead of charging the full price silently", async () => {
    const created = await holdBooking(desk("2028-01-10T08:00Z", "2028-01-11T08:00Z", "Expiré", promoCode("VIEUX")), await another());
    expect(created).toEqual({ ok: false, error: "Ce code promo a expiré." });
  });

  it("gives the last use of a limited code to only one of two customers", async () => {
    const [a, b] = [await another(), await another()];
    const results = await Promise.all([
      holdBooking(desk("2028-02-01T08:00Z", "2028-02-02T08:00Z", "Unique A", promoCode("UNIQUE")), a),
      holdBooking(desk("2028-02-01T08:00Z", "2028-02-02T08:00Z", "Unique B", promoCode("UNIQUE")), b),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok);
    expect(refused && !refused.ok && refused.error).toMatch(/nombre d'utilisations/);
  });

});

describe("reviews", () => {
  async function pickedUpBooking(from: string, to: string, name: string) {
    const id = await hold(stay(from, to, name));
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
