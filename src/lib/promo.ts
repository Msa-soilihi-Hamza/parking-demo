// Promo codes: a percentage or an amount off, valid between two dates, for a
// limited number of bookings or not. Pure rules; the use count is checked on the
// server, under lock, when the spot is held.

/** A code is valid for at most a year from the day it is created. */
export const MAX_VALIDITY_DAYS = 365;

export type PromoKind = "percent" | "amount";

export type PromoRule = {
  code: string;
  kind: PromoKind;
  /** 1–100 for a percentage, in cents for an amount */
  value: number;
  validFrom: Date | null;
  validUntil: Date | null;
  active: boolean;
};

/** " bienvenue10 " → "BIENVENUE10". Letters and digits, 3 to 20 characters. */
export function normalizePromoCode(input: string): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9]{3,20}$/.test(value) ? value : null;
}

/** Why the code cannot be used now, or null if it can (use count aside). */
export function promoProblem(promo: PromoRule, now: Date): string | null {
  if (!promo.active) return "Ce code promo n'est plus actif.";
  if (promo.validFrom && now < promo.validFrom) return "Ce code promo n'est pas encore valable.";
  if (promo.validUntil && now > promo.validUntil) return "Ce code promo a expiré.";
  return null;
}

/** The discount on `amountCents`; an amount code never goes beyond the price. */
export function promoDiscountCents(promo: Pick<PromoRule, "kind" | "value">, amountCents: number): number {
  if (promo.kind === "percent") return Math.round((amountCents * Math.min(100, Math.max(0, promo.value))) / 100);
  return Math.min(Math.max(0, promo.value), amountCents);
}

/** "-10 %" or "-5,00 €", for the price breakdown. */
export function promoLabel(promo: Pick<PromoRule, "kind" | "value">): string {
  if (promo.kind === "percent") return `-${promo.value} %`;
  return `-${new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(promo.value / 100)}`;
}
