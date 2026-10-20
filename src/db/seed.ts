// Demo data, relative to "now": re-run `npm run db:seed` before showing the demo.
import { sql } from "drizzle-orm";
import { quote } from "../lib/pricing";
import type { PickupStatus } from "../lib/pickup";
import { parisDayBounds } from "../lib/time";
import { db } from "./index";
import { bookings, parkings } from "./schema";

/** The customer link used in the demo: /reservation/demo-retour */
export const DEMO_TOKEN = "demo-retour";

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

let counter = 0;
function reference() {
  counter += 1;
  return `ESC-DEMO${String(counter).padStart(2, "0")}`;
}

async function main() {
  const now = Date.now();

  await db.execute(sql`TRUNCATE bookings, parkings RESTART IDENTITY CASCADE`);

  const [orly, cdg] = await db
    .insert(parkings)
    .values([
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
    ])
    .returning();

  type Row = typeof bookings.$inferInsert;
  const rows: Row[] = [];

  function makeBooking(returnAt: number, pickup: PickupStatus, overrides: Partial<Row> = {}) {
    const parking = overrides.parkingId === orly.id ? orly : rand() < 0.45 ? orly : cdg;
    const stayDays = 2 + Math.floor(rand() * 12);
    const dropoffAt = new Date(roundTo5(returnAt - stayDays * DAY - rand() * 8 * HOUR));
    const ret = new Date(returnAt);
    const price = quote(parking.dailyRateCents, dropoffAt, ret);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const bagsReadyAt = pickup !== "scheduled" ? new Date(returnAt + (20 + rand() * 25) * MIN) : null;
    const enRouteAt =
      pickup === "en_route" || pickup === "picked_up"
        ? new Date(bagsReadyAt!.getTime() + (1 + rand() * 4) * MIN)
        : null;
    const pickedUpAt =
      pickup === "picked_up" ? new Date(enRouteAt!.getTime() + (8 + rand() * 10) * MIN) : null;

    rows.push({
      reference: reference(),
      accessToken: `seed-${counter}-${Math.floor(rand() * 1e9).toString(36)}`,
      parkingId: parking.id,
      customerName: `${first} ${last}`,
      email: `${first}.${last}@exemple.fr`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
      phone: `06 ${String(Math.floor(rand() * 1e8)).padStart(8, "0").replace(/(\d{2})(?=\d)/g, "$1 ")}`,
      plate: plate(),
      passengers: 1 + Math.floor(rand() * 4),
      dropoffAt,
      returnAt: ret,
      returnTerminal: pickup === "scheduled" && rand() < 0.3 ? null : pick(parking.terminals),
      priceCents: price.ok ? price.totalCents : 0,
      status: "confirmed",
      pickupStatus: pickup,
      bagsReadyAt,
      enRouteAt,
      pickedUpAt,
      paidAt: dropoffAt,
      createdAt: new Date(dropoffAt.getTime() - 10 * DAY),
      ...overrides,
    });
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
    email: "demo@exemple.fr",
    phone: "06 00 00 00 00",
    passengers: 2,
    returnTerminal: null,
  });

  await db.insert(bookings).values(rows);
  console.log(`Seeded 2 parkings and ${rows.length} bookings.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
