import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DateJump } from "@/components/shuttle/date-jump";
import {
  BUSY_DAY_CLIENTS,
  DaySchedule,
  DayStrip,
  Empty,
  PageTitle,
  StatusLegend,
  dayFormat,
  nextDays,
} from "@/components/shuttle/shuttle-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { parisDay, parisDayBounds, parisLocalToDate } from "@/lib/time";
import { countReturnsByDay, listReturns } from "@/server/bookings";
import { hasShuttleAccess } from "@/server/shuttle-access";

const STRIP_DAYS = 14;

export default function PlanningPage(props: PageProps<"/navette/planning">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <Planning searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Planning({ searchParams }: Pick<PageProps<"/navette/planning">, "searchParams">) {
  await connection();
  if (!(await hasShuttleAccess())) return null;

  const { date } = await searchParams;
  const now = new Date();
  const today = parisDay(now);
  // "?date=2026-10-24" (Paris day); anything else falls back to today.
  const midnight = typeof date === "string" ? parisLocalToDate(`${date}T00:00`) : null;
  const selected = midnight ? parisDay(midnight) : today;
  const { start, end } = parisDayBounds(midnight ?? now, 0);

  const [returns, loads] = await Promise.all([
    listReturns(start, end),
    countReturnsByDay(parisDayBounds(now, 0).start, parisDayBounds(now, STRIP_DAYS - 1).end),
  ]);
  const counts = new Map(loads.map((l) => [l.day, l.clients]));
  const passengers = returns.reduce((sum, r) => sum + r.passengers, 0);
  const left = returns.filter((r) => r.pickupStatus !== "picked_up").length;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <AutoRefresh seconds={15} />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Deux prochaines semaines</p>
          <DateJump selected={selected} basePath="/navette/planning" />
        </div>
        <DayStrip
          days={nextDays(today, STRIP_DAYS).map((day) => ({ day, count: counts.get(day) ?? 0 }))}
          selected={selected}
          hrefFor={(day) => `/navette/planning?date=${day}`}
        />
      </div>

      <div className="space-y-2">
        <PageTitle eyebrow={selected === today ? "Aujourd'hui" : "Planning"}>
          {dayFormat.format(start)}
        </PageTitle>
        <p className="text-muted-foreground">
          {returns.length} client{returns.length > 1 ? "s" : ""} · {passengers} passager{passengers > 1 ? "s" : ""}
          {selected === today && returns.length > 0 && ` · encore ${left} à ramener`}
          {returns.length >= BUSY_DAY_CLIENTS && <span className="text-primary"> · jour chargé</span>}
        </p>
        <div className="pt-2">
          <StatusLegend />
        </div>
      </div>

      {returns.length === 0 ? <Empty>Aucun retour prévu ce jour-là.</Empty> : <DaySchedule rows={returns} />}
    </div>
  );
}
