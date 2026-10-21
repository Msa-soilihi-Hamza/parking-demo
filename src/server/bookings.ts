import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, parkings, reviews, type Booking, type Parking } from "@/db/schema";
import { canTransition, type PickupStatus } from "@/lib/pickup";
import { quote } from "@/lib/pricing";
import {
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_DELAY_MS,
  CODE_TTL_MS,
  codeMatches,
  generateCode,
  hashCode,
} from "@/server/email-code";
import { sendBookingConfirmation, sendVerificationCode } from "@/server/mailer";

/** A verified but unpaid booking holds its spot for this long (Stripe Checkout's minimum). */
export const PAYMENT_HOLD_MINUTES = 30;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listParkings(): Promise<Parking[]> {
  return db.select().from(parkings).orderBy(asc(parkings.id));
}

/**
 * Highest number of cars parked at the same time within [start, end).
 * Occupancy only goes up when a car arrives, so the peak is at `start`
 * or at one of the arrivals inside the period.
 */
async function peakOccupancy(tx: Tx, parkingId: number, start: Date, end: Date) {
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

export type NewBookingInput = {
  parkingSlug: string;
  dropoffAt: Date;
  returnAt: Date;
  returnTerminal: string | null;
  customerName: string;
  email: string;
  phone: string;
  plate: string;
  passengers: number;
};

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
 * Step 1: saves the request and e-mails a 6-digit code.
 * Nothing is held yet, so unverified requests cannot block real customers.
 */
export async function createUnverifiedBooking(
  input: NewBookingInput,
): Promise<Result<{ booking: Booking }>> {
  const [parking] = await db.select().from(parkings).where(eq(parkings.slug, input.parkingSlug));
  if (!parking) return { ok: false, error: "Parking inconnu." };

  const price = quote(parking.dailyRateCents, input.dropoffAt, input.returnAt);
  if (!price.ok) return { ok: false, error: price.error };

  if (input.returnTerminal && !parking.terminals.includes(input.returnTerminal)) {
    return { ok: false, error: "Terminal inconnu pour cet aéroport." };
  }

  // Early feedback only; the real check happens under lock once the e-mail is verified.
  const peak = await db.transaction((tx) =>
    peakOccupancy(tx, parking.id, input.dropoffAt, input.returnAt),
  );
  if (peak >= parking.capacity) return { ok: false, error: FULL };

  const [booking] = await db
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
      dropoffAt: input.dropoffAt,
      returnAt: input.returnAt,
      returnTerminal: input.returnTerminal,
      priceCents: price.totalCents,
      status: "pending_verification",
    })
    .returning();

  await issueCode(booking);
  return { ok: true, booking };
}

async function issueCode(booking: Booking) {
  const code = generateCode();
  const now = new Date();
  await db
    .update(bookings)
    .set({
      emailCodeHash: hashCode(booking.id, code),
      emailCodeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      emailCodeSentAt: now,
      emailCodeAttempts: 0,
    })
    .where(eq(bookings.id, booking.id));
  await sendVerificationCode(booking.email, code);
}

export async function resendCode(bookingId: string): Promise<Result<object>> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking || booking.status !== "pending_verification") {
    return { ok: false, error: "Cette demande n'est plus en attente de vérification." };
  }
  if (booking.emailCodeSentAt && Date.now() - booking.emailCodeSentAt.getTime() < CODE_RESEND_DELAY_MS) {
    return { ok: false, error: "Patientez une minute avant de redemander un code." };
  }
  await issueCode(booking);
  return { ok: true };
}

/**
 * Step 2: checks the code, then holds a spot for payment.
 * The parking row is locked (FOR UPDATE) so two customers racing for the
 * last spot are handled one after the other: the second one sees it taken.
 */
export async function verifyEmailAndHold(
  bookingId: string,
  code: string,
): Promise<Result<{ booking: Booking; parking: Parking }>> {
  return db.transaction(async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .for("update");
    if (!booking || booking.status !== "pending_verification" || !booking.emailCodeHash) {
      return { ok: false, error: "Cette demande n'est plus en attente de vérification." };
    }
    if (booking.emailCodeAttempts >= CODE_MAX_ATTEMPTS) {
      return { ok: false, error: "Trop d'essais. Demandez un nouveau code." };
    }
    if (!booking.emailCodeExpiresAt || booking.emailCodeExpiresAt < new Date()) {
      return { ok: false, error: "Ce code a expiré. Demandez-en un nouveau." };
    }
    if (!codeMatches(booking.id, code, booking.emailCodeHash)) {
      await tx
        .update(bookings)
        .set({ emailCodeAttempts: booking.emailCodeAttempts + 1 })
        .where(eq(bookings.id, booking.id));
      const left = CODE_MAX_ATTEMPTS - booking.emailCodeAttempts - 1;
      return { ok: false, error: `Code incorrect. ${left} essai${left > 1 ? "s" : ""} restant${left > 1 ? "s" : ""}.` };
    }

    const [parking] = await tx
      .select()
      .from(parkings)
      .where(eq(parkings.id, booking.parkingId))
      .for("update");
    const peak = await peakOccupancy(tx, parking.id, booking.dropoffAt, booking.returnAt);
    if (peak >= parking.capacity) {
      await tx.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, booking.id));
      return { ok: false, error: FULL };
    }

    const now = new Date();
    const [held] = await tx
      .update(bookings)
      .set({
        status: "pending_payment",
        emailVerifiedAt: now,
        heldAt: now,
        emailCodeHash: null,
      })
      .where(eq(bookings.id, booking.id))
      .returning();
    return { ok: true, booking: held, parking };
  });
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

/** Confirmed returns whose planned landing falls in [start, end). */
export async function listReturns(start: Date, end: Date): Promise<ShuttleRow[]> {
  const rows = await db
    .select({ booking: bookings, parkingName: parkings.name, airport: parkings.airport })
    .from(bookings)
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.returnAt, start),
        lt(bookings.returnAt, end),
      ),
    )
    .orderBy(asc(bookings.returnAt));
  return rows.map((r) => ({ ...r.booking, parkingName: r.parkingName, airport: r.airport }));
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
