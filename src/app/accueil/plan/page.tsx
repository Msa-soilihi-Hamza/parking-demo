import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Accent, PageTitle } from "@/components/shuttle/shuttle-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { arrivalPath } from "@/lib/arrival";
import { firstFreeSpot, spotLayout } from "@/lib/spots";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listOccupiedSpots, listParkings, type SpotCar } from "@/server/bookings";
import { hasAccess } from "@/server/team-access";

/** A car whose owner is on the way back within this many hours: to bring out soon. */
const SOON_HOURS = 3;

export default function PlanPage(props: PageProps<"/accueil/plan">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <Plan searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Plan({ searchParams }: Pick<PageProps<"/accueil/plan">, "searchParams">) {
  await connection();
  if (!(await hasAccess("accueil"))) return null;

  const { parking: slug } = await searchParams;
  const parkings = await listParkings();
  const parking = parkings.find((p) => p.slug === slug) ?? parkings[0];
  if (!parking) return null;

  const now = new Date();
  const occupied = await listOccupiedSpots(parking.id);
  const rows = spotLayout(parking.capacity);
  const soonLimit = now.getTime() + SOON_HOURS * 60 * 60 * 1000;
  const isSoon = (car: SpotCar) => car.pickupStatus !== "scheduled" || car.returnAt.getTime() < soonLimit;
  const free = parking.capacity - occupied.size;
  const soon = [...occupied.values()].filter(isSoon).length;
  const suggested = firstFreeSpot(parking.capacity, occupied.keys());

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <AutoRefresh seconds={15} />

      {parkings.length > 1 && (
        <div className="inline-flex rounded-full border p-0.5 text-sm">
          {parkings.map((p) => (
            <Link
              key={p.slug}
              href={`/accueil/plan?parking=${p.slug}`}
              scroll={false}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition",
                p.id === parking.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <PageTitle eyebrow={parking.name}>
          {free} place{free > 1 ? "s" : ""} <Accent>libre{free > 1 ? "s" : ""}.</Accent>
        </PageTitle>
        <p className="text-muted-foreground">
          Sur {parking.capacity} · {occupied.size} occupée{occupied.size > 1 ? "s" : ""}
          {soon > 0 && (
            <>
              {" "}
              · <span className="text-primary">{soon} à sortir dans les {SOON_HOURS}&nbsp;h</span>
            </>
          )}
        </p>
        <p className="pt-1">
          {suggested ? (
            <>
              Prochaine place à donner : <span className="font-mono text-lg font-semibold">{suggested}</span>
            </>
          ) : (
            <span className="font-medium text-primary">Parking plein : aucune place libre.</span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <Legend className="border border-dashed border-muted-foreground/40">Libre</Legend>
        <Legend className="bg-foreground/80">Occupée</Legend>
        <Legend className="bg-primary">À sortir bientôt</Legend>
        <Legend className="ring-2 ring-emerald-500 ring-offset-1">Place proposée</Legend>
      </div>

      <div className="space-y-6">
        {rows.map(({ row, spots }) => {
          const rowFree = spots.filter((s) => !occupied.has(s)).length;
          return (
            <section key={row} className="space-y-2">
              <h2 className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-base font-semibold">Rangée {row}</span>
                <span className="text-muted-foreground">
                  {rowFree} libre{rowFree > 1 ? "s" : ""}
                </span>
              </h2>
              <ul className="grid grid-cols-10 gap-1.5 sm:grid-cols-20">
                {spots.map((spot) => {
                  const car = occupied.get(spot);
                  const label = spot.slice(1);
                  if (!car) {
                    return (
                      <li
                        key={spot}
                        title={`${spot} · libre`}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md border border-dashed border-muted-foreground/40 font-mono text-[11px] text-muted-foreground",
                          spot === suggested && "border-solid border-emerald-500 font-semibold text-emerald-700 ring-2 ring-emerald-500 ring-offset-1",
                        )}
                      >
                        {label}
                      </li>
                    );
                  }
                  return (
                    <li key={spot}>
                      <Link
                        href={arrivalPath(car.reference)}
                        title={`${spot} · ${car.customerName} · ${car.plate} · retour ${formatDateTime(car.returnAt)}`}
                        className={cn(
                          "flex aspect-square items-center justify-center rounded-md font-mono text-[11px] text-background transition hover:opacity-80",
                          isSoon(car) ? "bg-primary" : "bg-foreground/80",
                        )}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-3.5 rounded", className)} aria-hidden />
      {children}
    </span>
  );
}
