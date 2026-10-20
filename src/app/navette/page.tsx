import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ShuttleLogin } from "@/components/shuttle-login";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PICKUP_LABELS, type PickupStatus } from "@/lib/pickup";
import { formatTime, parisDayBounds, parisHour } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listActivePickups, listReturns, type ShuttleRow } from "@/server/bookings";
import { hasShuttleAccess } from "@/server/shuttle-access";
import { advancePickupAction } from "./actions";

export const metadata = { title: "Espace navette · Escale Parking" };

export default function ShuttlePage(props: PageProps<"/navette">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[600px] w-full" />}>
        <Shuttle searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function Shuttle({ searchParams }: Pick<PageProps<"/navette">, "searchParams">) {
  await connection();
  if (!(await hasShuttleAccess())) return <ShuttleLogin />;

  const { jour } = await searchParams;
  const tomorrow = jour === "demain";
  const now = new Date();
  const { start, end } = parisDayBounds(now, tomorrow ? 1 : 0);
  const [active, returns] = await Promise.all([listActivePickups(), listReturns(start, end)]);

  const dayLabel = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);
  const passengers = returns.reduce((sum, r) => sum + r.passengers, 0);
  const done = returns.filter((r) => r.pickupStatus === "picked_up").length;

  return (
    <div className="space-y-10">
      <AutoRefresh seconds={5} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            En direct
          </p>
          <h1 className="text-3xl font-semibold tracking-tight first-letter:uppercase">{dayLabel}</h1>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button variant={tomorrow ? "ghost" : "outline"} size="sm" render={<Link href="/navette" />} nativeButton={false}>
            Aujourd&apos;hui
          </Button>
          <Button variant={tomorrow ? "outline" : "ghost"} size="sm" render={<Link href="/navette?jour=demain" />} nativeButton={false}>
            Demain
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          À récupérer maintenant <Badge>{active.length}</Badge>
        </h2>
        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Personne n&apos;attend. Les demandes arrivent ici dès qu&apos;un client appuie sur « J&apos;ai mes bagages ».
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((row) => (
              <ActiveCard key={row.id} row={row} now={now} />
            ))}
          </div>
        )}
      </section>

      <dl className="grid grid-cols-3 divide-x rounded-lg border">
        {[
          { label: "Retours prévus", value: returns.length },
          { label: "Passagers", value: passengers },
          { label: "Pris en charge", value: done },
        ].map((s) => (
          <div key={s.label} className="p-4">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Retours prévus</h2>
          <p className="text-sm text-muted-foreground">Par créneau, selon l&apos;heure d&apos;atterrissage donnée à la réservation.</p>
        </div>
        {returns.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Aucun retour prévu.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {groupByHour(returns).map(([hour, rows]) => (
              <HourSlot key={hour} hour={hour} rows={rows} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveCard({ row, now }: { row: ShuttleRow; now: Date }) {
  const waitingMin = Math.max(0, Math.round((now.getTime() - row.bagsReadyAt!.getTime()) / 60000));
  const ready = row.pickupStatus === "bags_ready";
  return (
    <Card className={cn(ready && "ring-2 ring-primary")}>
      <CardHeader>
        <CardDescription>{row.airport}</CardDescription>
        <CardTitle className="text-2xl">{row.returnTerminal}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p className="font-medium">
          {row.customerName} · {row.passengers} pers.
        </p>
        <p className="text-muted-foreground">
          Attend depuis {waitingMin} min · {row.phone}
        </p>
        <p className="font-mono text-muted-foreground">{row.plate}</p>
      </CardContent>
      <CardFooter>
        <form action={advancePickupAction} className="w-full">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="from" value={row.pickupStatus} />
          <input type="hidden" name="to" value={ready ? "en_route" : "picked_up"} />
          <Button type="submit" variant={ready ? "default" : "outline"} className="w-full">
            {ready ? "Je pars le chercher" : "Client pris en charge"}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

function groupByHour(rows: ShuttleRow[]): [number, ShuttleRow[]][] {
  const groups = new Map<number, ShuttleRow[]>();
  for (const row of rows) {
    const hour = parisHour(row.returnAt);
    groups.set(hour, [...(groups.get(hour) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
}

function HourSlot({ hour, rows }: { hour: number; rows: ShuttleRow[] }) {
  const passengers = rows.reduce((sum, r) => sum + r.passengers, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const open = rows.some((r) => r.pickupStatus !== "picked_up");

  return (
    <details className="group" open={open}>
      <summary className="flex cursor-pointer items-center gap-4 px-4 py-3 text-sm marker:content-none hover:bg-muted/50">
        <span className="w-24 font-medium tabular-nums">
          {pad(hour)}:00 – {pad(hour + 1)}:00
        </span>
        <span className="text-muted-foreground">
          {rows.length} client{rows.length > 1 ? "s" : ""} · {passengers} passager{passengers > 1 ? "s" : ""}
        </span>
      </summary>
      <ul className="pb-2">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-2 text-sm sm:grid-cols-[3.5rem_1fr_5rem_4rem_auto]">
            <span className="tabular-nums text-muted-foreground">{formatTime(r.returnAt)}</span>
            <span className="truncate">{r.customerName}</span>
            <span className="hidden text-muted-foreground sm:block">{r.returnTerminal ?? "—"}</span>
            <span className="hidden text-muted-foreground sm:block">{r.passengers} pers.</span>
            <StatusBadge status={r.pickupStatus} />
          </li>
        ))}
      </ul>
    </details>
  );
}

const BADGE_VARIANT: Record<PickupStatus, "default" | "secondary" | "outline"> = {
  scheduled: "outline",
  bags_ready: "default",
  en_route: "secondary",
  picked_up: "secondary",
};

function StatusBadge({ status }: { status: PickupStatus }) {
  return (
    <Badge variant={BADGE_VARIANT[status]} className={cn(status === "picked_up" && "text-muted-foreground")}>
      {PICKUP_LABELS[status]}
    </Badge>
  );
}
