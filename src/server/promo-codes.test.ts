// Integration test against the Docker database (`npm run db:up` first).
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { bookings, parkings, promoCodes, type Parking } from "@/db/schema";
import { parisDay } from "@/lib/time";
import { priceStay } from "./bookings";
import { createPromoCode, listPromoCodes, setPromoActive, validUntilFor } from "./promo-codes";

vi.mock("./mailer", () => ({
  sendVerificationCode: vi.fn(),
  sendBookingConfirmation: vi.fn(),
  sendWalkInConfirmation: vi.fn(),
}));

const tag = String(Date.now()).slice(-8);
const codeName = (name: string) => `${name}${tag}`;
let parking: Parking;

beforeAll(async () => {
  [parking] = await db
    .insert(parkings)
    .values({ slug: `promo-${tag}`, name: "Promo", airport: "Test", address: "Test", capacity: 10, dailyRateCents: 1000, terminals: ["T1"] })
    .returning();
});

afterAll(async () => {
  await db.delete(bookings).where(eq(bookings.parkingId, parking.id));
  await db.delete(parkings).where(eq(parkings.id, parking.id));
  await db.delete(promoCodes).where(inArray(promoCodes.code, ["NOEL", "DOUBLE", "STOP", "UNEFOIS"].map(codeName)));
});

const stay = { dropoffAt: new Date("2029-12-01T08:00Z"), returnAt: new Date("2029-12-03T08:00Z") };

describe("validity in days", () => {
  it("runs to the end of the last day, today included (Paris time)", () => {
    const now = new Date("2026-10-25T14:00:00Z");
    const until = validUntilFor(30, now);
    expect(parisDay(new Date(until.getTime() - 1))).toBe("2026-11-23");
    expect(parisDay(until)).toBe("2026-11-24");
  });

  it("covers just today for 1 day", () => {
    const now = new Date("2026-10-25T14:00:00Z");
    expect(parisDay(new Date(validUntilFor(1, now).getTime() - 1))).toBe("2026-10-25");
  });
});

describe("creating a code", () => {
  it("stores it uppercase, valid from now for the chosen number of days", async () => {
    const now = new Date();
    const result = await createPromoCode(
      { code: codeName("noel").toLowerCase(), kind: "percent", value: 15, validDays: 30, maxUses: null, description: "Noël" },
      now,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.promo).toMatchObject({ code: codeName("NOEL"), kind: "percent", value: 15, active: true });
    expect(result.promo.validUntil?.getTime()).toBe(validUntilFor(30, now).getTime());

    // It works at once on a booking: 2 days at 10 €, minus 15 %.
    const price = await priceStay({ parking, ...stay, promoCode: codeName("NOEL") });
    expect(price).toMatchObject({ ok: true, totalCents: 1700, discountCents: 300, promoError: null });
  });

  it("refuses a code that already exists", async () => {
    await createPromoCode({ code: codeName("DOUBLE"), kind: "amount", value: 500, validDays: 7, maxUses: null, description: null });
    const again = await createPromoCode({ code: codeName("DOUBLE"), kind: "amount", value: 900, validDays: 7, maxUses: null, description: null });
    expect(again).toEqual({ ok: false, error: `Le code ${codeName("DOUBLE")} existe déjà.` });
  });

  it("refuses a badly formed code or an impossible validity", async () => {
    expect((await createPromoCode({ code: "NO-EL", kind: "percent", value: 10, validDays: 30, maxUses: null, description: null })).ok).toBe(false);
    expect((await createPromoCode({ code: codeName("ZERO"), kind: "percent", value: 10, validDays: 0, maxUses: null, description: null })).ok).toBe(false);
  });
});

describe("managing codes", () => {
  it("stops a code at once, and brings it back", async () => {
    const created = await createPromoCode({ code: codeName("STOP"), kind: "percent", value: 10, validDays: 30, maxUses: null, description: null });
    if (!created.ok) throw new Error(created.error);

    await setPromoActive(created.promo.id, false);
    const stopped = await priceStay({ parking, ...stay, promoCode: codeName("STOP") });
    expect(stopped).toMatchObject({ ok: true, promoError: "Ce code promo n'est plus actif.", discountCents: 0 });

    await setPromoActive(created.promo.id, true);
    expect(await priceStay({ parking, ...stay, promoCode: codeName("STOP") })).toMatchObject({ promoError: null, discountCents: 200 });
  });

  it("shows a code as used up once its uses are reached", async () => {
    const created = await createPromoCode({ code: codeName("UNEFOIS"), kind: "amount", value: 300, validDays: 30, maxUses: 1, description: null });
    if (!created.ok) throw new Error(created.error);
    await db.insert(bookings).values({
      reference: `ESC-PR${tag}`,
      accessToken: `promo-used-${tag}`,
      parkingId: parking.id,
      customerName: "Utilisé",
      email: "used@example.com",
      phone: "0600000000",
      plate: "PR-000-MO",
      passengers: 1,
      dropoffAt: stay.dropoffAt,
      returnAt: stay.returnAt,
      priceCents: 1700,
      discountCents: 300,
      promoCodeId: created.promo.id,
      status: "confirmed",
    });

    const row = (await listPromoCodes()).find((c) => c.id === created.promo.id);
    expect(row).toMatchObject({ uses: 1, status: "exhausted" });
    const price = await priceStay({ parking, ...stay, promoCode: codeName("UNEFOIS") });
    expect(price).toMatchObject({ promoError: "Ce code promo a atteint son nombre d'utilisations." });
  });
});
