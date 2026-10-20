import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { DateJump } from "@/components/shuttle/date-jump";
import {
  Accent,
  DayStrip,
  LOW_RATING,
  Empty,
  PageTitle,
  Rows,
  dayFormat,
  nextDays,
  waitMinutes,
} from "@/components/shuttle/shuttle-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, parisDay, parisDayBounds, parisLocalToDate } from "@/lib/time";
import { listPickedUp } from "@/server/bookings";
import { hasShuttleAccess } from "@/server/shuttle-access";

const HISTORY_DAYS = 7;

export default function HistoryPage(props: PageProps<"/navette/historique">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <History searchParams={props.searchParams} />
    </Suspense>
  );
}

async function History({ searchParams }: Pick<PageProps<"/navette/historique">, "searchParams">) {
  await connection();
  if (!(await hasShuttleAccess())) return null;

  const { date } = await searchParams;
  const now = new Date();
  const today = parisDay(now);
  const days = nextDays(parisDay(parisDayBounds(now, -(HISTORY_DAYS - 1)).start), HISTORY_DAYS);

  // Any past day can be opened from the calendar; the future has no history.
  const midnight = typeof date === "string" ? parisLocalToDate(`${date}T00:00`) : null;
  const selected = midnight && parisDay(midnight) <= today ? parisDay(midnight) : today;
  const selectedBounds = parisDayBounds(parisLocalToDate(`${selected}T00:00`)!, 0);

  const [week, dayRows] = await Promise.all([
    listPickedUp(parisDayBounds(now, -(HISTORY_DAYS - 1)).start, parisDayBounds(now, 0).end),
    listPickedUp(selectedBounds.start, selectedBounds.end),
  ]);
  const waits = week.map(waitMinutes).filter((w): w is number => w !== null);
  const average = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
  const dayPassengers = dayRows.reduce((sum, r) => sum + r.passengers, 0);
  const ratings = week.map((r) => r.rating).filter((r): r is number => r != null);
  const averageRating = ratings.length
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toLocaleString("fr-FR", { maximumFractionDigits: 1 })
    : null;
  const toCallBack = dayRows.filter((r) => r.rating != null && r.rating <= LOW_RATING).length;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <AutoRefresh seconds={15} />

      <div className="space-y-2">
        <PageTitle eyebrow="7 derniers jours">
          {week.length} clients <Accent>bien rentrés.</Accent>
        </PageTitle>
        <p className="text-muted-foreground">
          {average !== null && <>Attente moyenne : {average} min après le bouton.</>}
          {averageRating !== null && (
            <>
              {" "}
              Note moyenne : <span className="text-foreground">★ {averageRating}/5</span> ({ratings.length} avis).
            </>
          )}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Choisir un jour</p>
          <DateJump selected={selected} basePath="/navette/historique" maxDay={today} />
        </div>
        <DayStrip
          days={days.map((day) => ({ day, count: week.filter((r) => parisDay(r.pickedUpAt!) === day).length }))}
          selected={selected}
          hrefFor={(day) => `/navette/historique?date=${day}`}
        />
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-semibold tracking-tight first-letter:uppercase">
            {dayFormat.format(selectedBounds.start)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {dayRows.length} client{dayRows.length > 1 ? "s" : ""} · {dayPassengers} passager
            {dayPassengers > 1 ? "s" : ""}
            {toCallBack > 0 && (
              <span className="font-medium text-primary">
                {" "}
                · {toCallBack} avis négatif{toCallBack > 1 ? "s" : ""} à rappeler
              </span>
            )}
          </p>
        </div>
        {dayRows.length === 0 ? (
          <Empty>Personne n&apos;a été ramené ce jour-là.</Empty>
        ) : (
          <Rows
            items={dayRows.map((r) => {
              const wait = waitMinutes(r);
              return {
                id: r.id,
                time: formatTime(r.pickedUpAt!),
                name: `${r.customerName} · ${r.passengers} pers.`,
                detail: `${r.returnTerminal ?? ""}${wait === null ? "" : ` · ${wait} min d'attente`}`,
                status: r.pickupStatus,
                rating: r.rating,
              };
            })}
          />
        )}
      </section>
    </div>
  );
}
