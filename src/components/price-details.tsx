import type { QuoteResult } from "@/app/(site)/reserver/actions";
import { formatEuros } from "@/lib/pricing";

/** Days, then the promo code, each on its own line. */
export function PriceDetails({
  quote,
  dailyRateCents,
}: {
  quote: Extract<QuoteResult, { ok: true }>;
  dailyRateCents: number;
}) {
  return (
    <ul className="space-y-1.5">
      {quote.lines.map((line) => (
        <li key={line.label} className="flex justify-between gap-3">
          <span className="text-muted-foreground">
            {line.days} × {formatEuros(line.unitCents)}
            {line.unitCents < dailyRateCents && (
              <span> (-{Math.round((1 - line.unitCents / dailyRateCents) * 100)} %)</span>
            )}
          </span>
          <span>{formatEuros(line.totalCents)}</span>
        </li>
      ))}
      {quote.promo && quote.discountCents > 0 && (
        <li className="flex justify-between gap-3 text-emerald-700">
          <span>
            Code {quote.promo.code} ({quote.promo.label})
          </span>
          <span>-{formatEuros(quote.discountCents)}</span>
        </li>
      )}
    </ul>
  );
}
