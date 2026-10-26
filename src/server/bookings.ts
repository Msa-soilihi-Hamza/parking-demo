import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, parkings, promoCodes, reviews, type Booking, type Parking, type PromoCode } from "@/db/schema";
import { canTransition, type PickupStatus } from "@/lib/pickup";
import { finalPrice, quote, type PriceBreakdown, type PriceLine } from "@/lib/pricing";
import { normalizePromoCode, promoDiscountCents, promoLabel, promoProblem } from "@/lib/promo";
import { firstFreeSpot, isValidSpot, spotRange } from "@/lib/spots";
import { sendBookingConfirmation, sendWalkInConfirmation } from "@/server/mailer";

/** A verified but unpaid booking holds its spot for this long (Stripe Checkout's minimum). */
export const PAYMENT_HOLD_MINUTES = 30;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export async function listParkings(): Promise<Parking[]> {
  return db.select().from(parkings).orderBy(asc(parkings.id));
}

/**
 * Highest number of cars parked at the same time within [start, end).
 * Occupancy only goes up when a car arrives, so the peak is at `start`
 * or at one of the arrivals inside the period.
 */
async function peakOccupancy(tx: Executor, parkingId: number, start: Date, end: Date) {
  const result = await tx.execute<{ peak: number }>(sql`
    WITH active AS (
      SELECT dropoff_at, return_at FROM bookings
      WHERE parking_id = ${parkingId}
        AND dropoff_at < ${end} AND return_at > ${start}
        AND (status = 'confirmed'
          OR (status = 'pending_payment'
              AND held_at > now() - make_interval(mins => ${PAYMENT_HOLD_MINUTES})))
    ),
    instants AS (
      SELECT ${start}::timestamptz AS t
      UNION SELECT dropoff_at FROM active WHERE dropoff_at > ${start}
    )
    SELECT COALESCE(MAX(
      (SELECT count(*) FROM active a WHERE a.dropoff_at <= i.t AND a.return_at > i.t)
    ), 0)::int AS peak
    FROM instants i
  `);
  return result.rows[0]?.peak ?? 0;
}

export type StayQuote =
  | ({
      ok: true;
      days: number;
      lines: PriceLine[];
      /** Most cars parked at once over the stay, before this one */
      occupied: number;
      capacity: number;
      promo: { id: string; code: string; label: string } | null;
      /** The code was refused: the price is shown without it */
      promoError: string | null;
    } & PriceBreakdown)
  | { ok: false; error: string };

async function findPromo(executor: Executor, code: string, lock = false): Promise<PromoCode | undefined> {
  const query = executor.select().from(promoCodes).where(eq(promoCodes.code, code));
  const [promo] = lock ? await query.for("update") : await query;
  return promo;
}

/** Uses of a code: paid bookings, plus spots still held for payment. */
async function promoUses(executor: Executor, promoId: string, excludeBookingId?: string): Promise<number> {
  const [{ uses }] = await executor
    .select({ uses: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.promoCodeId, promoId),
        or(
          eq(bookings.status, "confirmed"),
          and(
            eq(bookings.status, "pending_payment"),
            gte(bookings.heldAt, new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60 * 1000)),
          ),
        ),
        excludeBookingId ? ne(bookings.id, excludeBookingId) : undefined,
      ),
    );
  return uses;
}

/** Why this code cannot be used now, or null. */
async function promoRefusal(executor: Executor, promo: PromoCode | undefined, excludeBookingId?: string) {
  if (!promo) return "Code promo inconnu.";
  const problem = promoProblem(promo, new Date());
  if (problem) return problem;
  if (promo.maxUses !== null && (await promoUses(executor, promo.id, excludeBookingId)) >= promo.maxUses) {
    return "Ce code promo a atteint son nombre d'utilisations.";
  }
  return null;
}

/**
 * The price of a stay, as charged: degressive days, − promo code. Stable: it does not
 * depend on how full the parking is. Used by the live price on the form, by the
 * booking itself and by the front desk. It also says how full the parking is, for the
 * capacity check.
 */
export async function priceStay(
  input: { parking: Parking; dropoffAt: Date; returnAt: Date; promoCode?: string | null },
  executor: Executor = db,
): Promise<StayQuote> {
  const base = quote(input.parking.dailyRateCents, input.dropoffAt, input.returnAt);
  if (!base.ok) return base;

  const occupied = await peakOccupancy(executor, input.parking.id, input.dropoffAt, input.returnAt);

  let promo: PromoCode | undefined;
  let promoError: string | null = null;
  if (input.promoCode?.trim()) {
    const code = normalizePromoCode(input.promoCode);
    promo = code ? await findPromo(executor, code) : undefined;
    promoError = await promoRefusal(executor, promo);
    if (promoError) promo = undefined;
  }

  const price = finalPrice(base.totalCents, promo ? (amount) => promoDiscountCents(promo, amount) : undefined);
  return {
    ok: true,
    days: base.days,
    lines: base.lines,
    occupied,
    capacity: input.parking.capacity,
    promo: promo ? { id: promo.id, code: promo.code, label: promoLabel(promo) } : null,
    promoError,
    ...price,
  };
}

export type NewBookingInput = {
  parkingSlug: string;
  dropoffAt: Date;
  returnAt: Date;
  returnTerminal: string | null;
  customerName: string;
  phone: string;
  plate: string;
  passengers: number;
  promoCode?: string | null;
};

/** The signed-in customer: their e-mail is verified by their account (code or Google). */
export type Customer = { userId: string; email: string };

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function newReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return "ESC-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function newAccessToken() {
  return randomBytes(18).toString("base64url");
}

const FULL = "Désolé, ce parking est complet sur une partie de vos dates.";

/**
 * A signed-in customer books: the spot is held for payment right away.
 * The parking row is locked (FOR UPDATE) so two customers racing for the last spot
 * are handled one after the other: the second one sees it taken. A limited promo code
 * is locked the same way, so two customers cannot take its last use.
 */
export async function holdBooking(
  input: NewBookingInput,
  customer: Customer,
): Promise<Result<{ booking: Booking; parking: Parking }>> {
  const [parking] = await db.select().from(parkings).where(eq(parkings.slug, input.parkingSlug));
  if (!parking) return { ok: false, error: "Parking inconnu." };
  if (input.returnTerminal && !parking.terminals.includes(input.returnTerminal)) {
    return { ok: false, error: "Terminal inconnu pour cet aéroport." };
  }

  return db.transaction(async (tx) => {
    await tx.select({ id: parkings.id }).from(parkings).where(eq(parkings.id, parking.id)).for("update");

    const price = await priceStay(
      { parking, dropoffAt: input.dropoffAt, returnAt: input.returnAt, promoCode: input.promoCode },
      tx,
    );
    if (!price.ok) return price;
    // A refused code is never dropped silently: the customer would pay more than expected.
    if (price.promoError) return { ok: false, error: price.promoError };
    if (price.occupied >= parking.capacity) return { ok: false, error: FULL };

    if (price.promo) {
      const promo = await findPromo(tx, price.promo.code, true);
      const refusal = await promoRefusal(tx, promo);
      if (refusal) return { ok: false, error: refusal };
    }

    const now = new Date();
    const [booking] = await tx
      .insert(bookings)
      .values({
        reference: newReference(),
        accessToken: newAccessToken(),
        parkingId: parking.id,
        userId: customer.userId,
        customerName: input.customerName,
        email: customer.email,
        phone: input.phone,
        plate: input.plate,
        passengers: input.passengers,
        dropoffAt: input.dropoffAt,
        returnAt: input.returnAt,
        returnTerminal: input.returnTerminal,
        priceCents: price.totalCents,
        discountCents: price.discountCents,
        promoCodeId: price.promo?.id ?? null,
        status: "pending_payment",
        heldAt: now,
      })
      .returning();
    return { ok: true, booking, parking };
  });
}

/**
 * "Mon espace": the customer's bookings, latest stay first. Bookings made before
 * accounts existed are found by their e-mail, which the account has verified.
 */
export async function listCustomerBookings(customer: Customer) {
  return db
    .select({ booking: bookings, parkingName: parkings.name })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(
      and(
        inArray(bookings.status, ["confirmed", "pending_payment"]),
        or(
          eq(bookings.userId, customer.userId),
          sql`lower(${bookings.email}) = ${customer.email.toLowerCase()}`,
        ),
      ),
    )
    .orderBy(desc(bookings.dropoffAt));
}

export async function attachStripeSession(bookingId: string, sessionId: string) {
  await db
    .update(bookings)
    .set({ stripeSessionId: sessionId })
    .where(eq(bookings.id, bookingId));
}

/**
 * Idempotent: Stripe can deliver the same event several times, and the
 * success page also confirms. Only the first call changes anything and
 * sends the confirmation e-mail.
 */
export async function confirmPayment(bookingId: string): Promise<boolean> {
  const [confirmed] = await db
    .update(bookings)
    .set({ status: "confirmed", paidAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending_payment")))
    .returning();
  if (!confirmed) return false;

  const [parking] = await db.select().from(parkings).where(eq(parkings.id, confirmed.parkingId));
  try {
    await sendBookingConfirmation(confirmed, parking);
  } catch (error) {
    // The payment is recorded either way; the link is also shown on the success page.
    console.error("Confirmation e-mail failed", error);
  }
  return true;
}

/** A verified booking whose spot is still held: payment can (re)start for it. */
export async function getHeldBooking(bookingId: string) {
  const [row] = await db
    .select({ booking: bookings, parking: parkings })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.status, "pending_payment"),
        gte(bookings.heldAt, new Date(Date.now() - PAYMENT_HOLD_MINUTES * 60 * 1000)),
      ),
    );
  return row ?? null;
}

/** Checkout expired or abandoned: free the held spot. */
export async function releaseHold(bookingId: string) {
  await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending_payment")));
}

export async function getBookingByToken(token: string) {
  const [row] = await db
    .select({ booking: bookings, parking: parkings })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(eq(bookings.accessToken, token));
  return row ?? null;
}

export type WalkInInput = {
  parkingSlug: string;
  returnAt: Date;
  returnTerminal: string | null;
  customerName: string;
  email: string | null;
  phone: string;
  plate: string;
  passengers: number;
  spot: string;
};

/**
 * A customer who comes to the desk without booking: they pay there, and the car is
 * parked right away. Same capacity check, under the same lock, as an online booking.
 */
export async function createWalkInBooking(input: WalkInInput): Promise<Result<{ booking: Booking }>> {
  const [parking] = await db.select().from(parkings).where(eq(parkings.slug, input.parkingSlug));
  if (!parking) return { ok: false, error: "Parking inconnu." };
  if (input.returnTerminal && !parking.terminals.includes(input.returnTerminal)) {
    return { ok: false, error: "Terminal inconnu pour cet aéroport." };
  }

  const now = new Date();
  // Same price as online for these dates.
  const price = await priceStay({ parking, dropoffAt: now, returnAt: input.returnAt });
  if (!price.ok) return { ok: false, error: price.error };

  let result: Result<{ booking: Booking }>;
  try {
    result = await db.transaction(async (tx): Promise<Result<{ booking: Booking }>> => {
      await tx.select({ id: parkings.id }).from(parkings).where(eq(parkings.id, parking.id)).for("update");
      if ((await peakOccupancy(tx, parking.id, now, input.returnAt)) >= parking.capacity) {
        return { ok: false, error: "Ce parking est complet sur une partie de la période." };
      }
      const problem = await spotProblem(tx, parking, input.spot);
      if (problem) return { ok: false, error: problem };
      const [booking] = await tx
        .insert(bookings)
        .values({
          reference: newReference(),
          accessToken: newAccessToken(),
          parkingId: parking.id,
          customerName: input.customerName,
          email: input.email,
          phone: input.phone,
          plate: input.plate,
          passengers: input.passengers,
          dropoffAt: now,
          returnAt: input.returnAt,
          returnTerminal: input.returnTerminal,
          priceCents: price.totalCents,
          status: "confirmed",
          paymentMethod: "on_site",
          paidAt: now,
          parkedAt: now,
          parkingSpot: input.spot,
        })
        .returning();
      return { ok: true, booking };
    });
  } catch (error) {
    if (isSpotTaken(error)) return { ok: false, error: takenMessage(input.spot) };
    throw error;
  }

  if (result.ok) {
    try {
      await sendWalkInConfirmation(result.booking, parking);
    } catch (error) {
      // The booking stands either way: the desk also shows the customer's link as a QR code.
      console.error("Walk-in e-mail failed", error);
    }
  }
  return result;
}

/** Front desk lookup, from the QR code or the reference typed by hand. */
export async function getBookingByReference(reference: string) {
  const [row] = await db
    .select({ booking: bookings, parking: parkings })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(eq(bookings.reference, reference));
  return row ?? null;
}

/**
 * The customer left the car: records the time and the spot. Only for a paid
 * booking, and only once (the WHERE makes a second scan or double tap a no-op).
 */
export async function checkInVehicle(reference: string, spot: string): Promise<Result<{ booking: Booking }>> {
  const found = await getBookingByReference(reference);
  if (!found) return { ok: false, error: "Réservation introuvable." };
  if (found.booking.status !== "confirmed") return { ok: false, error: "Cette réservation n'est pas payée." };
  if (found.booking.parkedAt) return { ok: false, error: "Ce véhicule est déjà enregistré." };

  const problem = await spotProblem(db, found.parking, spot);
  if (problem) return { ok: false, error: problem };

  try {
    const [parked] = await db
      .update(bookings)
      .set({ parkedAt: new Date(), parkingSpot: spot })
      .where(and(eq(bookings.id, found.booking.id), eq(bookings.status, "confirmed"), isNull(bookings.parkedAt)))
      .returning();
    return parked ? { ok: true, booking: parked } : { ok: false, error: "Ce véhicule est déjà enregistré." };
  } catch (error) {
    // Two desks giving the same spot at the same instant: the unique index decides.
    if (isSpotTaken(error)) return { ok: false, error: takenMessage(spot) };
    throw error;
  }
}

const takenMessage = (spot: string, reference?: string) =>
  `La place ${spot} est déjà occupée${reference ? ` (${reference})` : ""}. Choisissez une place libre sur le plan.`;

/** Why this spot cannot take a car right now, or null if it can. */
async function spotProblem(executor: typeof db | Tx, parking: Parking, spot: string): Promise<string | null> {
  if (!isValidSpot(spot, parking.capacity)) {
    return `La place ${spot} n'existe pas dans ce parking (places ${spotRange(parking.capacity)}).`;
  }
  const [taken] = await executor
    .select({ reference: bookings.reference })
    .from(bookings)
    .where(and(onSite, eq(bookings.parkingId, parking.id), eq(bookings.parkingSpot, spot)))
    .limit(1);
  return taken ? takenMessage(spot, taken.reference) : null;
}

/** Postgres unique violation on the "one car per spot" index. */
function isSpotTaken(error: unknown): boolean {
  for (let e = error as { code?: string; constraint?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.code === "23505" && e.constraint === "bookings_spot_on_site_idx") return true;
  }
  return false;
}

export type SpotCar = Pick<
  Booking,
  "id" | "reference" | "customerName" | "plate" | "parkingSpot" | "returnAt" | "pickupStatus"
>;

/** The cars on site in one parking, keyed by spot: what the desk's plan shows. */
export async function listOccupiedSpots(parkingId: number): Promise<Map<string, SpotCar>> {
  const rows = await db
    .select({
      id: bookings.id,
      reference: bookings.reference,
      customerName: bookings.customerName,
      plate: bookings.plate,
      parkingSpot: bookings.parkingSpot,
      returnAt: bookings.returnAt,
      pickupStatus: bookings.pickupStatus,
    })
    .from(bookings)
    .where(and(onSite, eq(bookings.parkingId, parkingId)));
  return new Map(rows.map((r) => [r.parkingSpot!, r]));
}

/** The spot to offer the desk: the first free one in plan order. */
export async function suggestSpot(parking: Parking): Promise<string | null> {
  return firstFreeSpot(parking.capacity, (await listOccupiedSpots(parking.id)).keys());
}

/** Confirmed bookings whose drop-off is planned in [start, end), earliest first. */
export async function listArrivals(start: Date, end: Date): Promise<ShuttleRow[]> {
  const rows = await db
    .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(and(eq(bookings.status, "confirmed"), gte(bookings.dropoffAt, start), lt(bookings.dropoffAt, end)))
    .orderBy(asc(bookings.dropoffAt));
  return rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport }));
}

// A car is on site from its check-in until its owner is back with the shuttle.
const onSite = and(
  eq(bookings.status, "confirmed"),
  isNotNull(bookings.parkedAt),
  ne(bookings.pickupStatus, "picked_up"),
);

/**
 * Cars on site, soonest return first. `search` matches the plate (dashes and
 * spaces ignored), the name, the reference or the spot.
 */
export async function listVehiclesOnSite(search = "", limit = 60): Promise<{ rows: ShuttleRow[]; total: number }> {
  const text = search.trim();
  const plate = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const filter = text
    ? or(
        ilike(bookings.customerName, like),
        ilike(bookings.reference, like),
        ilike(bookings.parkingSpot, like),
        plate ? sql`regexp_replace(upper(${bookings.plate}), '[^A-Z0-9]', '', 'g') LIKE ${`%${plate}%`}` : undefined,
      )
    : undefined;
  const where = and(onSite, filter);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport })
      .from(bookings)
      .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
      .where(where)
      .orderBy(asc(bookings.returnAt))
      .limit(limit),
    db.select({ total: count() }).from(bookings).where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport })), total };
}

/**
 * Cars to bring out before their owner is back: the customer is already waiting or
 * on the shuttle, or lands within `hours`. Waiting customers first.
 */
export async function listVehiclesToPrepare(now: Date, hours = 3): Promise<ShuttleRow[]> {
  const rows = await db
    .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(
      and(
        onSite,
        or(
          inArray(bookings.pickupStatus, ["bags_ready", "en_route"]),
          lt(bookings.returnAt, new Date(now.getTime() + hours * 60 * 60 * 1000)),
        ),
      ),
    )
    .orderBy(
      sql`CASE ${bookings.pickupStatus} WHEN 'en_route' THEN 0 WHEN 'bags_ready' THEN 1 ELSE 2 END`,
      asc(bookings.returnAt),
    );
  return rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport }));
}

/**
 * Moves the return trip one step forward. The WHERE on the current status
 * makes a double click (or two drivers at once) a no-op instead of a jump.
 */
export async function advancePickup(
  where: { id: string } | { accessToken: string },
  from: PickupStatus,
  to: PickupStatus,
  extra: { returnTerminal?: string } = {},
): Promise<boolean> {
  if (!canTransition(from, to)) return false;
  const now = new Date();
  const timestamps =
    to === "bags_ready"
      ? { bagsReadyAt: now }
      : to === "en_route"
        ? { enRouteAt: now }
        : { pickedUpAt: now };
  const target =
    "id" in where ? eq(bookings.id, where.id) : eq(bookings.accessToken, where.accessToken);
  const updated = await db
    .update(bookings)
    .set({ pickupStatus: to, ...timestamps, ...extra })
    .where(and(target, eq(bookings.status, "confirmed"), eq(bookings.pickupStatus, from)))
    .returning({ id: bookings.id });
  return updated.length > 0;
}

/**
 * Undoes a mistaken "J'ai mes bagages". Only while no driver has left:
 * the status guard makes it a no-op once the shuttle is on its way.
 */
export async function cancelPickupRequest(accessToken: string): Promise<boolean> {
  const updated = await db
    .update(bookings)
    .set({ pickupStatus: "scheduled", bagsReadyAt: null })
    .where(
      and(
        eq(bookings.accessToken, accessToken),
        eq(bookings.status, "confirmed"),
        eq(bookings.pickupStatus, "bags_ready"),
      ),
    )
    .returning({ id: bookings.id });
  return updated.length > 0;
}

export type ShuttleRow = Booking & {
  parkingName: string;
  airport: string;
  /** The customer's review (1–5), when they left one. */
  rating?: number | null;
};

/** Confirmed returns whose planned landing falls in [start, end), with the review if any. */
export async function listReturns(start: Date, end: Date): Promise<ShuttleRow[]> {
  const rows = await db
    .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport, rating: reviews.rating })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .leftJoin(reviews, eq(reviews.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.returnAt, start),
        lt(bookings.returnAt, end),
      ),
    )
    .orderBy(asc(bookings.returnAt));
  return rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport, rating: r.rating }));
}

/** Customers still to pick up whose landing is in [start, end), soonest first. */
export async function listUpcomingReturns(start: Date, end: Date): Promise<ShuttleRow[]> {
  const rows = await db
    .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        eq(bookings.pickupStatus, "scheduled"),
        gte(bookings.returnAt, start),
        lt(bookings.returnAt, end),
      ),
    )
    .orderBy(asc(bookings.returnAt));
  return rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport }));
}

export type DayLoad = { day: string; clients: number; passengers: number };

/** Confirmed returns per Paris calendar day ("2026-10-20"), to show busy days. */
export async function countReturnsByDay(start: Date, end: Date): Promise<DayLoad[]> {
  const result = await db.execute<DayLoad>(sql`
    SELECT to_char(return_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
           count(*)::int AS clients,
           sum(passengers)::int AS passengers
    FROM bookings
    WHERE status = 'confirmed' AND return_at >= ${start} AND return_at < ${end}
    GROUP BY 1
    ORDER BY 1
  `);
  return result.rows;
}

/** Customers picked up within [start, end), most recent first. */
export async function listPickedUp(start: Date, end: Date): Promise<ShuttleRow[]> {
  const rows = await db
    .select({
      booking: bookings,
      parkingName: parkings.name,
      airport: parkings.airport,
      rating: reviews.rating,
    })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .leftJoin(reviews, eq(reviews.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.pickupStatus, "picked_up"),
        gte(bookings.pickedUpAt, start),
        lt(bookings.pickedUpAt, end),
      ),
    )
    .orderBy(desc(bookings.pickedUpAt));
  return rows.map((r) => ({
    ...r.booking,
    parkingName: r.parkingName,
    airport: r.airport,
    rating: r.rating,
  }));
}

/** Customers waiting right now, whatever their planned day (flights run late). */
export async function listActivePickups(): Promise<ShuttleRow[]> {
  const rows = await db
    .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        inArray(bookings.pickupStatus, ["bags_ready", "en_route"]),
      ),
    )
    .orderBy(asc(bookings.bagsReadyAt));
  return rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport }));
}
