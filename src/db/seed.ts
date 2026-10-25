// Demo data, relative to "now": re-run `npm run db:seed` before showing the demo.
// Only the demo bookings (reference ESC-DEMO…) are replaced: real bookings made
// through the site, with their e-mailed links, are never touched.
import { like, sql } from "drizzle-orm";
import { quote } from "../lib/pricing";
import { allSpots } from "../lib/spots";
import type { PickupStatus } from "../lib/pickup";
import { parisDayBounds } from "../lib/time";
import { db } from "./index";
import { bookings, parkings, promoCodes, reviews } from "./schema";

/** The customer link used in the demo: /reservation/demo-retour */
export const DEMO_TOKEN = "demo-retour";
/** The customer about to leave their car: /reservation/demo-arrivee shows the QR code. */
export const DEMO_ARRIVAL_TOKEN = "demo-arrivee";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Small deterministic random generator so every seed looks the same.
let state = 42;
function rand() {
  state = (state * 1664525 + 1013904223) % 2 ** 32;
  return state / 2 ** 32;
}
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const roundTo5 = (t: number) => Math.round(t / (5 * MIN)) * 5 * MIN;

const FIRST_NAMES = ["Sarah", "Karim", "Julie", "Mamadou", "Inès", "Thomas", "Léa", "Yanis", "Camille", "Nadia", "Hugo", "Fatou", "Lucas", "Amira", "Paul", "Chloé"];
const LAST_NAMES = ["Martin", "Benali", "Dubois", "Diallo", "Moreau", "Haddad", "Laurent", "Nguyen", "Petit", "Traoré", "Garcia", "Lefèvre"];
const LETTERS = "ABCDEFGHJKLMNPRSTVWXYZ";

function plate() {
  const l = () => LETTERS[Math.floor(rand() * LETTERS.length)];
  const n = String(Math.floor(rand() * 900) + 100);
  return `${l()}${l()}-${n}-${l()}${l()}`;
}

// Spots come from each parking's plan. A car still on site takes a spot of its own
// (the database refuses two cars on one spot); a car already gone keeps any spot.
const freeSpots = new Map<number, string[]>();
/** Spots held by real cars on site (bookings made on the site or at the desk): never reused. */
const realTaken = new Set<string>();
function spotFor(parking: { id: number; capacity: number }, stillOnSite: boolean): string | null {
  const spots = allSpots(parking.capacity);
  if (!stillOnSite) return pick(spots);
  if (!freeSpots.has(parking.id)) {
    const shuffled = spots.filter((spot) => !realTaken.has(`${parking.id}:${spot}`));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    freeSpots.set(parking.id, shuffled);
  }
  return freeSpots.get(parking.id)!.pop() ?? null;
}

let counter = 0;
function reference() {
  counter += 1;
  return `ESC-DEMO${String(counter).padStart(2, "0")}`;
}

async function main() {
  const now = Date.now();

  await db.delete(bookings).where(like(bookings.reference, "ESC-DEMO%"));

  // Parkings are updated in place so real bookings keep pointing at them.
  const parkingValues = [
      {
        slug: "orly",
        name: "Escale Orly",
        airport: "Paris-Orly",
        address: "Zone fictive, 94310 Orly",
        capacity: 120,
        dailyRateCents: 1400,
        terminals: ["Orly 1", "Orly 2", "Orly 3", "Orly 4"],
      },
      {
        slug: "cdg",
        name: "Escale Roissy-CDG",
        airport: "Paris-Charles de Gaulle",
        address: "Zone fictive, 95700 Roissy-en-France",
        capacity: 200,
        dailyRateCents: 1600,
        terminals: ["T1", "T2A", "T2B", "T2C", "T2D", "T2E", "T2F", "T2G", "T3"],
      },
  ];
  const [orly, cdg] = await Promise.all(
    parkingValues.map(async (value) => {
      const [row] = await db
        .insert(parkings)
        .values(value)
        .onConflictDoUpdate({
          target: parkings.slug,
          set: {
            name: value.name,
            airport: value.airport,
            address: value.address,
            capacity: value.capacity,
            dailyRateCents: value.dailyRateCents,
            terminals: value.terminals,
          },
        })
        .returning();
      return row;
    }),
  );

  const real = await db.execute<{ parking_id: number; parking_spot: string }>(sql`
    SELECT parking_id, parking_spot FROM bookings
    WHERE reference NOT LIKE 'ESC-DEMO%' AND status = 'confirmed' AND parked_at IS NOT NULL
      AND pickup_status <> 'picked_up' AND parking_spot IS NOT NULL
  `);
  for (const r of real.rows) realTaken.add(`${r.parking_id}:${r.parking_spot}`);

  type Row = typeof bookings.$inferInsert;
  const rows: Row[] = [];

  function makeBooking(returnAt: number, pickup: PickupStatus, overrides: Partial<Row> = {}) {
    const parking =
      overrides.parkingId === orly.id ? orly : overrides.parkingId === cdg.id ? cdg : rand() < 0.45 ? orly : cdg;
    const stayDays = 2 + Math.floor(rand() * 12);
    const defaultDropoff = new Date(roundTo5(returnAt - stayDays * DAY - rand() * 8 * HOUR));
    const dropoffAt = overrides.dropoffAt instanceof Date ? overrides.dropoffAt : defaultDropoff;
    const ret = new Date(returnAt);
    const price = quote(parking.dailyRateCents, dropoffAt, ret);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    // Bags come out 20–45 min after landing, but never in the future.
    const bagsReadyAt =
      pickup !== "scheduled"
        ? new Date(Math.min(returnAt + (20 + rand() * 25) * MIN, now - (6 + rand() * 10) * MIN))
        : null;
    const enRouteAt =
      pickup === "en_route" || pickup === "picked_up"
        ? new Date(bagsReadyAt!.getTime() + (1 + rand() * 4) * MIN)
        : null;
    const pickedUpAt =
      pickup === "picked_up" ? new Date(enRouteAt!.getTime() + (8 + rand() * 10) * MIN) : null;
    // Cars already dropped off were checked in at the front desk a few minutes after arrival.
    const parked = dropoffAt.getTime() < now;
    // About one customer in ten came to the desk without booking and paid there.
    const walkIn = parked && rand() < 0.1;

    rows.push({
      reference: reference(),
      accessToken: `seed-${counter}-${Math.floor(rand() * 1e9).toString(36)}`,
      parkingId: parking.id,
      customerName: `${first} ${last}`,
      email: `${first}.${last}@example.com`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
      phone: `06 ${String(Math.floor(rand() * 1e8)).padStart(8, "0").replace(/(\d{2})(?=\d)/g, "$1 ")}`,
      plate: plate(),
      passengers: 1 + Math.floor(rand() * 4),
      dropoffAt,
      returnAt: ret,
      returnTerminal: pickup === "scheduled" && rand() < 0.3 ? null : pick(parking.terminals),
      priceCents: price.ok ? price.totalCents : 0,
      status: "confirmed",
      pickupStatus: pickup,
      parkedAt: parked ? new Date(dropoffAt.getTime() + (2 + rand() * 8) * MIN) : null,
      parkingSpot: parked ? spotFor(parking, pickup !== "picked_up") : null,
      bagsReadyAt,
      enRouteAt,
      pickedUpAt,
      paymentMethod: walkIn ? "on_site" : "online",
      paidAt: dropoffAt,
      createdAt: new Date(dropoffAt.getTime() - 10 * DAY),
      ...overrides,
    });
  }

  // The past 6 days, all picked up: the shuttle team's history.
  for (let offset = -6; offset <= -1; offset++) {
    const { start } = parisDayBounds(new Date(now), offset);
    const count = 14 + Math.floor(rand() * 10);
    for (let i = 0; i < count; i++) {
      makeBooking(roundTo5(start.getTime() + 6 * HOUR + rand() * 17.5 * HOUR), "picked_up");
    }
  }

  // Returns spread over today and tomorrow (Paris time), 06:00 → 23:30.
  for (const offset of [0, 1]) {
    const { start } = parisDayBounds(new Date(now), offset);
    const count = offset === 0 ? 26 : 18;
    for (let i = 0; i < count; i++) {
      const returnAt = roundTo5(start.getTime() + 6 * HOUR + rand() * 17.5 * HOUR);
      // Past returns are done; the ones still ahead are scheduled.
      const status: PickupStatus = returnAt + HOUR < now ? "picked_up" : "scheduled";
      if (returnAt < now && returnAt + HOUR >= now) continue; // the live ones are added below
      makeBooking(returnAt, status);
    }
  }

  // The next 30 days, busier on weekends and around the 1 November holiday.
  for (let offset = 2; offset <= 30; offset++) {
    const { start } = parisDayBounds(new Date(now), offset);
    const weekday = new Date(start.getTime() + 12 * HOUR).getUTCDay();
    const busy = weekday === 0 || weekday === 6 || rand() < 0.15;
    const count = busy ? 15 + Math.floor(rand() * 10) : 3 + Math.floor(rand() * 9);
    for (let i = 0; i < count; i++) {
      makeBooking(roundTo5(start.getTime() + 6 * HOUR + rand() * 17.5 * HOUR), "scheduled");
    }
  }

  // Customers waiting right now, so the shuttle board is alive whatever the time.
  makeBooking(roundTo5(now - 45 * MIN), "en_route");
  makeBooking(roundTo5(now - 35 * MIN), "bags_ready");
  makeBooking(roundTo5(now - 25 * MIN), "bags_ready");

  // The booking a recruiter can open to press "J'ai mes bagages".
  makeBooking(roundTo5(now - 15 * MIN), "scheduled", {
    accessToken: DEMO_TOKEN,
    reference: "ESC-DEMO00",
    parkingId: orly.id,
    customerName: "Visiteur Démo",
    email: "demo@example.com",
    phone: "06 00 00 00 00",
    passengers: 2,
    returnTerminal: null,
  });

  // A customer arriving at the parking right now: its QR code opens the front desk page.
  makeBooking(roundTo5(now + 7 * DAY), "scheduled", {
    accessToken: DEMO_ARRIVAL_TOKEN,
    reference: "ESC-DEMOQR",
    parkingId: orly.id,
    customerName: "Visiteur Arrivée",
    email: "arrivee@example.com",
    phone: "06 00 00 00 01",
    passengers: 2,
    dropoffAt: new Date(roundTo5(now + 10 * MIN)),
    returnTerminal: null,
    paidAt: new Date(now - 3 * DAY),
    createdAt: new Date(now - 3 * DAY),
  });

  // Promo codes to try on the booking form. Updated in place: bookings may use them.
  const promoValues = [
    { code: "BIENVENUE10", kind: "percent" as const, value: 10, validFrom: null, validUntil: null, maxUses: null, description: "Première réservation" },
    { code: "TOUSSAINT5", kind: "amount" as const, value: 500, validFrom: null, validUntil: new Date(now + 10 * DAY), maxUses: null, description: "Vacances de la Toussaint" },
    { code: "FLASH50", kind: "percent" as const, value: 50, validFrom: null, validUntil: null, maxUses: 3, description: "Vente flash : 3 réservations seulement" },
    { code: "ETE2026", kind: "percent" as const, value: 15, validFrom: null, validUntil: new Date("2026-09-30T21:59:00Z"), maxUses: null, description: "Été 2026 (expiré)" },
  ];
  for (const promo of promoValues) {
    await db
      .insert(promoCodes)
      .values({ ...promo, active: true })
      .onConflictDoUpdate({ target: promoCodes.code, set: { ...promo, active: true } });
  }

  const inserted = await db
    .insert(bookings)
    .values(rows)
    .returning({ id: bookings.id, pickupStatus: bookings.pickupStatus, customerName: bookings.customerName });

  // Ratings on about two thirds of the finished trips, for the shuttle team's history.
  // Never publishable: the public site must not present seeded reviews as real ones.
  const ratings = [5, 5, 5, 4, 5, 4, 3, 5, 2, 5, 4, 1];
  const demoReviews = inserted
    .filter((b) => b.pickupStatus === "picked_up" && rand() < 0.65)
    .map((b) => ({
      bookingId: b.id,
      rating: pick(ratings),
      publishConsent: false,
      authorName: b.customerName.split(" ")[0],
    }));
  if (demoReviews.length) await db.insert(reviews).values(demoReviews);
  const [{ kept }] = (
    await db.execute<{ kept: number }>(
      sql`SELECT count(*)::int AS kept FROM bookings WHERE reference NOT LIKE 'ESC-DEMO%'`,
    )
  ).rows;
  console.log(`Seeded ${rows.length} demo bookings (${kept} real bookings kept).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
