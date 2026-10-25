"use client";

import { useEffect, useState } from "react";
import { quoteStayAction, type QuoteInput, type QuoteResult } from "@/app/(site)/reserver/actions";

/**
 * The server's price for these dates (demand and promo code included), asked again
 * a moment after the customer stops changing them. `null` input: nothing to price.
 */
export function useStayQuote(input: QuoteInput | null): { quote: QuoteResult | null; loading: boolean } {
  const key = input ? JSON.stringify(input) : "";
  const [result, setResult] = useState<{ key: string; quote: QuoteResult } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let quote: QuoteResult;
      try {
        quote = await quoteStayAction(JSON.parse(key) as QuoteInput);
      } catch {
        quote = { ok: false, error: "Prix indisponible pour le moment, réessayez." };
      }
      if (!cancelled) setResult({ key, quote });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  // A price computed for older inputs is never shown as the current one.
  const quote = result?.key === key ? result.quote : null;
  return { quote, loading: Boolean(key) && !quote };
}
