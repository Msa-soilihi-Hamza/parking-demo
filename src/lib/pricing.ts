// Degressive daily pricing: the longer the stay, the cheaper each extra day.
// Pure function, shared by the live price on the form and the server-side total.
import { parisWallClockMs } from "./time";

export const PRICE_TIERS = [
  { fromDay: 1, toDay: 3, discount: 0 },
  { fromDay: 4, toDay: 7, discount: 0.2 },
  { fromDay: 8, toDay: Infinity, discount: 0.4 },
] as const;

export const MAX_STAY_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PriceLine = {
  label: string;
  days: number;
  unitCents: number;
  totalCents: number;
};

export type Quote =
  | { ok: true; days: number; lines: PriceLine[]; totalCents: number }
  | { ok: false; error: string };

/**
 * Every started 24h period is billed as a full day, measured on the Paris
 * clock: the extra hour of the October time change is not billed as a day.
 */
export function billedDays(dropoffAt: Date, returnAt: Date): number {
  const duration = parisWallClockMs(returnAt) - parisWallClockMs(dropoffAt);
  return Math.max(1, Math.ceil(duration / DAY_MS));
}

export function quote(dailyRateCents: number, dropoffAt: Date, returnAt: Date): Quote {
  if (returnAt.getTime() <= dropoffAt.getTime()) {
    return { ok: false, error: "Le retour doit être après le dépôt du véhicule." };
  }
  const days = billedDays(dropoffAt, returnAt);
  if (days > MAX_STAY_DAYS) {
    return { ok: false, error: `Séjour limité à ${MAX_STAY_DAYS} jours.` };
  }

  const lines: PriceLine[] = [];
  for (const tier of PRICE_TIERS) {
    const tierDays = Math.min(days, tier.toDay) - tier.fromDay + 1;
    if (tierDays <= 0) break;
    const unitCents = Math.round(dailyRateCents * (1 - tier.discount));
    lines.push({
      label:
        tier.toDay === Infinity
          ? `Jours ${tier.fromDay} et suivants (-${tier.discount * 100} %)`
          : tier.discount === 0
            ? `Jours ${tier.fromDay} à ${tier.toDay}`
            : `Jours ${tier.fromDay} à ${tier.toDay} (-${tier.discount * 100} %)`,
      days: tierDays,
      unitCents,
      totalCents: unitCents * tierDays,
    });
  }

  return {
    ok: true,
    days,
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
  };
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}
