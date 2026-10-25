import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DateJump } from "@/components/shuttle/date-jump";
import {
  BUSY_DAY_CLIENTS,
  DaySchedule,
  DayStrip,
  Empty,
  LOW_RATING,
  PageTitle,
  StatusLegend,
  dayFormat,
  nextDays,
  waitMinutes,
} from "@/components/shuttle/shuttle-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { parisDay, parisDayBounds, parisLocalToDate } from "@/lib/time";
import { countReturnsByDay, listPickedUp, listReturns } from "@/server/bookings";
import { hasAccess } from "@/server/team-access";

// Planning and history are the same view on different dates: one strip, past to future.
const DAYS_BEFORE = 7;
const DAYS_AFTER = 13;

export default function DaysPage(props: PageProps<"/navette/journees">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <Days searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Days({ searchParams }: Pick<PageProps<"/navette/journees">, "searchParams">) {
  await connection();
  if (!(await hasAccess("navette"))) return null;

  const { date } = await searchParams;
  const now = new Date();
  const today = parisDay(now);
  // "?date=2026-10-24" (Paris day); anything else falls back to today.
  const midnight = typeof date === "string" ? parisLocalToDate(`${date}T00:00`) : null;
  const selected = midnight ? parisDay(midnight) : today;
  const { start, end } = parisDayBounds(midnight ?? now, 0);
  const first = parisDayBounds(now, -DAYS_BEFORE).start;

  const [returns, loads, week] = await Promise.all([
    listReturns(start, end),
    countReturnsByDay(first, parisDayBounds(now, DAYS_AFTER).end),
    listPickedUp(parisDayBounds(now, -(DAYS_BEFORE - 1)).start, parisDayBounds(now, 0).end),
  ]);
  const counts = new Map(loads.map((l) => [l.day, l.clients]));

  // The last 7 days, always in view: how the team is doing.
  const waits = week.map(waitMinutes).filter((w): w is number => w !== null);
  const averageWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const ratings = week.map((r) => r.rating).filter((r): r is number => r != null);
  const averageRating = ratings.length
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toLocaleString("fr-FR", { maximumFractionDigits: 1 })
    : null;

  // The selected day.
  const passengers = returns.reduce((sum, r) => sum + r.passengers, 0);
  const left = returns.filter((r) => r.pickupStatus !== "picked_up").length;
  const toCallBack = returns.filter((r) => r.rating != null && r.rating <= LOW_RATING).length;
  const when = selected === today ? "Aujourd'hui" : selected < today ? "Journée passée" : "À venir";

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <AutoRefresh seconds={15} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-muted-foreground">
            7 derniers jours : <span className="text-foreground">{week.length} clients ramenés</span>
            {averageWait !== null && <> · attente moyenne {averageWait} min</>}
            {averageRating !== null && (
              <>
                {" "}
                · <span className="text-foreground">★ {averageRating}</span> ({ratings.length} avis)
              </>
            )}
          </p>
          <DateJump selected={selected} basePath="/navette/journees" />
        </div>
        <DayStrip
          days={nextDays(parisDay(first), DAYS_BEFORE + 1 + DAYS_AFTER).map((day) => ({
            day,
            count: counts.get(day) ?? 0,
          }))}
          selected={selected}
          hrefFor={(day) => `/navette/journees?date=${day}`}
        />
      </div>

      <div className="space-y-2">
        <PageTitle eyebrow={when}>{dayFormat.format(start)}</PageTitle>
        <p className="text-muted-foreground">
          {returns.length} client{returns.length > 1 ? "s" : ""} · {passengers} passager{passengers > 1 ? "s" : ""}
          {selected === today && returns.length > 0 && ` · encore ${left} à ramener`}
          {returns.length >= BUSY_DAY_CLIENTS && <span className="text-primary"> · jour chargé</span>}
          {toCallBack > 0 && (
            <span className="font-medium text-primary">
              {" "}
              · {toCallBack} avis négatif{toCallBack > 1 ? "s" : ""} à rappeler
            </span>
          )}
        </p>
        <div className="pt-2">
          <StatusLegend />
        </div>
      </div>

      {returns.length === 0 ? <Empty>Aucun retour ce jour-là.</Empty> : <DaySchedule rows={returns} />}
    </div>
  );
}
