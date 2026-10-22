import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ArrivalSearch } from "@/components/shuttle/arrival-search";
import { Accent, Empty, PageTitle, dayFormat } from "@/components/shuttle/shuttle-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { arrivalPath } from "@/lib/arrival";
import { cn } from "@/lib/utils";
import { formatTime, parisDayBounds } from "@/lib/time";
import { listArrivals } from "@/server/bookings";
import { hasShuttleAccess } from "@/server/shuttle-access";

export default function FrontDeskPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <FrontDesk />
    </Suspense>
  );
}

async function FrontDesk() {
  await connection();
  if (!(await hasShuttleAccess())) return null;

  const now = new Date();
  const today = parisDayBounds(now, 0);
  const arrivals = await listArrivals(today.start, today.end);
  const parked = arrivals.filter((r) => r.parkedAt).length;

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-12 sm:px-6">
      <AutoRefresh seconds={15} />

      <div className="space-y-2">
        <PageTitle eyebrow={dayFormat.format(now)}>
          {arrivals.length} arrivée{arrivals.length > 1 ? "s" : ""} <Accent>aujourd&apos;hui.</Accent>
        </PageTitle>
        <p className="text-muted-foreground">
          {parked} véhicule{parked > 1 ? "s" : ""} déjà déposé{parked > 1 ? "s" : ""}. Scannez le QR code du client
          avec l&apos;appareil photo du téléphone : sa réservation s&apos;ouvre ici.
        </p>
      </div>

      <ArrivalSearch />

      <section className="space-y-2">
        <h2 className="font-medium">Arrivées prévues</h2>
        {arrivals.length === 0 ? (
          <Empty>Aucune arrivée prévue aujourd&apos;hui.</Empty>
        ) : (
          <ul className="divide-y">
            {arrivals.map((r) => (
              <li key={r.id}>
                <Link
                  href={arrivalPath(r.reference)}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-muted/60 sm:gap-4"
                >
                  <span className="w-12 shrink-0 font-mono text-sm tabular-nums">{formatTime(r.dropoffAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.customerName}</span>
                  <span className="hidden shrink-0 font-mono text-sm text-muted-foreground sm:inline">{r.plate}</span>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                      r.parkedAt ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", r.parkedAt ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                    {r.parkedAt ? `Déposé · ${r.parkingSpot}` : "Attendu"}
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
