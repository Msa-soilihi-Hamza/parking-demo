"use client";

import { ArrowRightIcon, PlaneIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { StayDatesPicker, type StayDates } from "@/components/stay-dates-picker";
import { Button } from "@/components/ui/button";
import { formatEuros, quote } from "@/lib/pricing";
import { parisLocalToDate } from "@/lib/time";
import { cn } from "@/lib/utils";

type ParkingRate = { slug: string; code: string; label: string; dailyRateCents: number };

type Props = {
  parkings: ParkingRate[];
  defaultDates: StayDates;
  minDay: string;
};

/**
 * The landing page's booking card, styled as a boarding pass.
 * A plain GET form: /reserver opens with the parking and dates already chosen.
 */
export function QuickQuote({ parkings, defaultDates, minDay }: Props) {
  const [slug, setSlug] = useState(parkings[0]?.slug ?? "");
  const [dates, setDates] = useState(defaultDates);
  const parking = parkings.find((p) => p.slug === slug);

  const price = useMemo(() => {
    const from = parisLocalToDate(`${dates.from}T${dates.dropoffTime}`);
    const to = dates.to ? parisLocalToDate(`${dates.to}T${dates.returnTime}`) : null;
    if (!parking || !from || !to) return null;
    return quote(parking.dailyRateCents, from, to);
  }, [parking, dates]);

  return (
    <form action="/reserver" method="get" className="relative w-full max-w-md rounded-3xl border bg-card shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)]">
      <input type="hidden" name="parking" value={slug} />

      {/* Header: airport code → parking, like a boarding pass */}
      <div className="px-6 pt-6">
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">
          <span>Escale</span>
          <span>Carte de stationnement</span>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <span className="font-mono text-4xl font-semibold tracking-tight">{parking?.code}</span>
          <span className="relative h-px flex-1 border-t border-dashed border-foreground/30">
            <PlaneIcon className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-card text-primary" />
          </span>
          <span className="font-mono text-4xl font-semibold tracking-tight">P</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {parkings.map((p) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => setSlug(p.slug)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition",
                p.slug === slug ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-4 pb-6">
          <StayDatesPicker value={dates} onChange={setDates} minDay={minDay} layout="stacked" />
        </div>
      </div>

      {/* Perforation */}
      <div className="relative">
        <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full border bg-background [clip-path:inset(0_0_0_50%)]" />
        <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full border bg-background [clip-path:inset(0_50%_0_0)]" />
        <div className="mx-6 border-t-2 border-dashed" />
      </div>

      <div className="flex items-end justify-between gap-4 px-6 py-6">
        <div>
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Total navette incluse</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            {price?.ok ? formatEuros(price.totalCents) : "—"}
          </p>
          {price?.ok && (
            <p className="text-xs text-muted-foreground">
              {price.days} jour{price.days > 1 ? "s" : ""} · soit {formatEuros(Math.round(price.totalCents / price.days))}/jour
            </p>
          )}
        </div>
        <Button type="submit" size="lg" disabled={!price?.ok} className="h-11 px-5">
          Réserver <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </form>
  );
}
