import { ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Accent, Empty, PageTitle, StatusPill } from "@/components/shuttle/shuttle-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { arrivalPath } from "@/lib/arrival";
import { formatDateTime, formatTime, parisDay } from "@/lib/time";
import { listVehiclesOnSite, listVehiclesToPrepare, type ShuttleRow } from "@/server/bookings";
import { hasAccess } from "@/server/team-access";

const PREPARE_HOURS = 3;

export default function VehiclesPage(props: PageProps<"/accueil/vehicules">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <Vehicles searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Vehicles({ searchParams }: Pick<PageProps<"/accueil/vehicules">, "searchParams">) {
  await connection();
  if (!(await hasAccess("accueil"))) return null;

  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 40) : "";
  const now = new Date();

  const [all, found, toPrepare] = await Promise.all([
    listVehiclesOnSite("", 0),
    search ? listVehiclesOnSite(search) : null,
    search ? [] : listVehiclesToPrepare(now, PREPARE_HOURS),
  ]);
  const list = found ?? (await listVehiclesOnSite());

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-12 sm:px-6">
      {!search && <AutoRefresh seconds={15} />}

      <div className="space-y-2">
        <PageTitle eyebrow="Parking">
          {all.total} véhicule{all.total > 1 ? "s" : ""} <Accent>sur place.</Accent>
        </PageTitle>
        <p className="text-muted-foreground">
          Une plaque, un nom, une référence ou une place : retrouvez une voiture en un instant.
        </p>
      </div>

      {/* A plain GET form: works without JavaScript, and the search stays in the URL. */}
      <form action="/accueil/vehicules" className="flex max-w-md gap-2" role="search">
        <Input
          name="q"
          defaultValue={search}
          placeholder="AB-123-CD, Martin, B12…"
          aria-label="Rechercher un véhicule"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit">
          <SearchIcon /> Chercher
        </Button>
      </form>

      {!search && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">À préparer · {toPrepare.length}</h2>
            <p className="text-sm text-muted-foreground">Client en route ou de retour dans les {PREPARE_HOURS} h</p>
          </div>
          {toPrepare.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Aucune voiture à avancer pour l&apos;instant.</p>
          ) : (
            <VehicleList rows={toPrepare} now={now} withStatus />
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">
            {search ? (
              <>
                {list.total} résultat{list.total > 1 ? "s" : ""} pour « {search} »
              </>
            ) : (
              "Sur place, par date de retour"
            )}
          </h2>
          {search ? (
            <Link href="/accueil/vehicules" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <XIcon className="size-3.5" /> Effacer
            </Link>
          ) : (
            list.total > list.rows.length && (
              <p className="text-sm text-muted-foreground">
                {list.rows.length} premiers sur {list.total} : cherchez pour affiner
              </p>
            )
          )}
        </div>
        {list.rows.length === 0 ? (
          <Empty>{search ? "Aucune voiture sur place ne correspond." : "Aucune voiture sur place."}</Empty>
        ) : (
          <VehicleList rows={list.rows} now={now} withStatus={Boolean(search)} />
        )}
      </section>
    </div>
  );
}

/** Spot first, then plate: what the agent looks for between the rows of cars. */
function VehicleList({ rows, now, withStatus }: { rows: ShuttleRow[]; now: Date; withStatus?: boolean }) {
  const today = parisDay(now);
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={arrivalPath(r.reference)}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-muted/60 sm:gap-4"
          >
            <span className="w-12 shrink-0 font-mono text-lg font-semibold sm:w-14">{r.parkingSpot}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.customerName}</span>
              <span className="block truncate text-sm text-muted-foreground tabular-nums">
                <span className="font-mono whitespace-nowrap">{r.plate}</span> · retour{" "}
                {parisDay(r.returnAt) === today ? formatTime(r.returnAt) : formatDateTime(r.returnAt)}
              </span>
              {/* Phones: the status goes under the name instead of squeezing the row. */}
              {withStatus && r.pickupStatus !== "scheduled" && (
                <span className="mt-1 block sm:hidden">
                  <StatusPill status={r.pickupStatus} />
                </span>
              )}
            </span>
            {withStatus && r.pickupStatus !== "scheduled" && (
              <span className="hidden sm:inline-flex">
                <StatusPill status={r.pickupStatus} />
              </span>
            )}
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
