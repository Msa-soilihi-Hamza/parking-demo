import { and, count, desc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, promoCodes, type PromoCode } from "@/db/schema";
import { MAX_VALIDITY_DAYS, normalizePromoCode, promoLabel, promoProblem, type PromoKind } from "@/lib/promo";
import { parisDayBounds } from "@/lib/time";
import { HOLD_COUNTED_MINUTES } from "@/server/bookings";

// The manager's promo codes: created with a validity in days, listed with their use,
// stopped at once if needed.

export { MAX_VALIDITY_DAYS };

/** "Valable 30 jours": from now to the end of the 30th day, today included (Paris time). */
export function validUntilFor(days: number, now = new Date()): Date {
  return parisDayBounds(now, days - 1).end;
}

export type NewPromoCode = {
  code: string;
  kind: PromoKind;
  /** 1–100 for a percentage, in cents for an amount */
  value: number;
  validDays: number;
  maxUses: number | null;
  description: string | null;
};

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function createPromoCode(input: NewPromoCode, now = new Date()): Promise<Result<{ promo: PromoCode }>> {
  const code = normalizePromoCode(input.code);
  if (!code) return { ok: false, error: "Le code doit faire 3 à 20 lettres ou chiffres, sans espace ni tiret." };
  if (!Number.isInteger(input.validDays) || input.validDays < 1 || input.validDays > MAX_VALIDITY_DAYS) {
    return { ok: false, error: `La validité va de 1 à ${MAX_VALIDITY_DAYS} jours.` };
  }
  if (input.kind === "percent" && (input.value < 1 || input.value > 100)) {
    return { ok: false, error: "Une réduction en pourcentage va de 1 à 100 %." };
  }
  if (input.kind === "amount" && input.value < 1) return { ok: false, error: "Indiquez un montant." };

  const [promo] = await db
    .insert(promoCodes)
    .values({
      code,
      kind: input.kind,
      value: input.value,
      validFrom: now,
      validUntil: validUntilFor(input.validDays, now),
      maxUses: input.maxUses,
      description: input.description,
    })
    .onConflictDoNothing({ target: promoCodes.code })
    .returning();
  return promo ? { ok: true, promo } : { ok: false, error: `Le code ${code} existe déjà.` };
}

/**
 * A code announced on the landing page: only while it works for everyone (active,
 * in its dates, without a use limit that could run out under the banner).
 */
export async function getPublicOffer(
  code: string,
  now = new Date(),
): Promise<{ code: string; label: string; validUntil: Date | null } | null> {
  const [promo] = await db.select().from(promoCodes).where(eq(promoCodes.code, code));
  if (!promo || promo.maxUses !== null || promoProblem(promo, now)) return null;
  return { code: promo.code, label: promoLabel(promo), validUntil: promo.validUntil };
}

/** Stops a code at once (leaked on a deals site…), or brings it back. */
export async function setPromoActive(id: string, active: boolean): Promise<boolean> {
  const updated = await db.update(promoCodes).set({ active }).where(eq(promoCodes.id, id)).returning({ id: promoCodes.id });
  return updated.length > 0;
}

export type PromoStatus = "active" | "scheduled" | "expired" | "exhausted" | "inactive";

export type PromoRow = PromoCode & { uses: number; status: PromoStatus };

/** Every code, newest first, with its uses: paid bookings and spots held for payment. */
export async function listPromoCodes(now = new Date()): Promise<PromoRow[]> {
  const uses = db
    .select({ promoCodeId: bookings.promoCodeId, uses: count().as("uses") })
    .from(bookings)
    .where(
      or(
        eq(bookings.status, "confirmed"),
        and(
          eq(bookings.status, "pending_payment"),
          gte(bookings.heldAt, new Date(now.getTime() - HOLD_COUNTED_MINUTES * 60 * 1000)),
        ),
      ),
    )
    .groupBy(bookings.promoCodeId)
    .as("uses");

  const rows = await db
    .select({ promo: promoCodes, uses: sql<number>`coalesce(${uses.uses}, 0)::int` })
    .from(promoCodes)
    .leftJoin(uses, eq(uses.promoCodeId, promoCodes.id))
    .orderBy(desc(promoCodes.createdAt));

  return rows.map(({ promo, uses }) => ({ ...promo, uses, status: statusOf(promo, uses, now) }));
}

function statusOf(promo: PromoCode, uses: number, now: Date): PromoStatus {
  if (!promo.active) return "inactive";
  if (promo.validFrom && now < promo.validFrom) return "scheduled";
  if (promo.validUntil && now > promo.validUntil) return "expired";
  if (promo.maxUses !== null && uses >= promo.maxUses) return "exhausted";
  return "active";
}
