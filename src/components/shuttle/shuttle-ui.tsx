import Link from "next/link";
import { advancePickupAction } from "@/app/navette/actions";
import { StripScroller } from "@/components/shuttle/strip-scroller";
import { Button } from "@/components/ui/button";
import { PICKUP_LABELS, PICKUP_STATUSES, type PickupStatus } from "@/lib/pickup";
import { formatTime, parisDay, parisHour } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ShuttleRow } from "@/server/bookings";

/** A day with at least this many returns is marked as busy. */
export const BUSY_DAY_CLIENTS = 15;

export const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
});

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Page heading in the landing page's style: small eyebrow, big title, serif accent. */
export function PageTitle({
  eyebrow,
  live,
  children,
}: {
  eyebrow: string;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground first-letter:uppercase">
        {live && (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
        {eyebrow}
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight first-letter:uppercase sm:text-5xl">{children}</h1>
    </div>
  );
}

export function Accent({ children }: { children: React.ReactNode }) {
  return <span className="font-serif font-normal text-primary italic">{children}</span>;
}

/** One colour per return status, used everywhere in the shuttle space. */
export const STATUS_STYLE: Record<PickupStatus, { dot: string; pill: string; card: string; text: string }> = {
  scheduled: {
    dot: "bg-muted-foreground/50",
    pill: "bg-muted text-muted-foreground",
    card: "",
    text: "text-muted-foreground",
  },
  bags_ready: {
    dot: "bg-primary",
    pill: "bg-primary/10 text-primary",
    card: "border-primary ring-1 ring-primary",
    text: "text-primary",
  },
  en_route: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700",
    card: "border-amber-400 ring-1 ring-amber-400",
    text: "text-amber-700",
  },
  picked_up: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700",
    card: "",
    text: "text-emerald-700",
  },
};

export function StatusPill({ status }: { status: PickupStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLE[status].pill,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_STYLE[status].dot)} />
      {PICKUP_LABELS[status]}
    </span>
  );
}

export function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {PICKUP_STATUSES.map((status) => (
        <StatusPill key={status} status={status} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-muted-foreground">{children}</p>;
}

/** A customer waiting for the shuttle: the terminal first, one button. */
export function ActiveCard({ row, now }: { row: ShuttleRow; now: Date }) {
  const waitingMin = Math.max(0, Math.round((now.getTime() - row.bagsReadyAt!.getTime()) / 60000));
  const ready = row.pickupStatus === "bags_ready";
  return (
    // The id lets a notification link straight to this customer (/navette#client-<id>).
    <div
      id={`client-${row.id}`}
      className={cn(
        "flex scroll-mt-24 flex-col rounded-3xl border p-6 target:bg-primary/5",
        STATUS_STYLE[row.pickupStatus].card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-3xl font-semibold tracking-tight">{row.returnTerminal}</p>
        <StatusPill status={row.pickupStatus} />
      </div>
      <p className={cn("mt-1 text-sm tabular-nums", STATUS_STYLE[row.pickupStatus].text)}>
        {ready ? `Attend depuis ${waitingMin} min` : `Navette partie à ${formatTime(row.enRouteAt ?? now)}`}
      </p>
      <p className="mt-4 font-medium">
        {row.customerName} · {plural(row.passengers, "passager")}
      </p>
      <a href={`tel:${row.phone.replace(/\s/g, "")}`} className="text-sm text-muted-foreground hover:text-foreground">
        {row.phone}
      </a>
      {row.parkingSpot && (
        <p className="text-sm text-muted-foreground">
          Véhicule place <span className="font-mono text-foreground">{row.parkingSpot}</span>
        </p>
      )}
      <form action={advancePickupAction} className="mt-6">
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="from" value={row.pickupStatus} />
        <input type="hidden" name="to" value={ready ? "en_route" : "picked_up"} />
        <Button type="submit" size="lg" variant={ready ? "default" : "outline"} className="h-11 w-full">
          {ready ? "Je pars le chercher" : "Client pris en charge"}
        </Button>
      </form>
    </div>
  );
}

/** Minutes between the bags button and the pickup: what the customer actually waited. */
export function waitMinutes(row: ShuttleRow): number | null {
  if (!row.bagsReadyAt || !row.pickedUpAt) return null;
  return Math.max(0, Math.round((row.pickedUpAt.getTime() - row.bagsReadyAt.getTime()) / 60000));
}

type RowItem = {
  id: string;
  time: string;
  name: string;
  detail: string;
  status?: PickupStatus;
  /** Customer review, 1–5; 1 or 2 shows in red so the team calls them back. */
  rating?: number | null;
};

/** A day with a review at or below this is flagged for a call back. */
export const LOW_RATING = 2;

/** Quiet one-line rows: time · name · detail · status colour. */
export function Rows({ items }: { items: RowItem[] }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-3 sm:gap-4">
          <span className="w-12 shrink-0 font-mono text-sm tabular-nums">{item.time}</span>
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">{item.detail}</span>
          {item.rating != null && (
            <span
              title={item.rating <= LOW_RATING ? "Avis négatif : à rappeler" : "Avis du client"}
              className={cn(
                "shrink-0 text-sm tabular-nums",
                item.rating <= LOW_RATING ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              ★ {item.rating}
            </span>
          )}
          {item.status && <StatusPill status={item.status} />}
        </li>
      ))}
    </ul>
  );
}

/** A day's returns, one block per hour. */
export function DaySchedule({ rows }: { rows: ShuttleRow[] }) {
  const hours = new Map<number, ShuttleRow[]>();
  for (const row of rows) {
    const hour = parisHour(row.returnAt);
    hours.set(hour, [...(hours.get(hour) ?? []), row]);
  }
  return (
    <div className="space-y-8">
      {[...hours.entries()]
        .sort(([a], [b]) => a - b)
        .map(([hour, hourRows]) => (
          <section key={hour} className="grid gap-2 sm:grid-cols-[6rem_1fr]">
            <h3 className="pt-3 font-mono text-sm text-muted-foreground">
              {String(hour).padStart(2, "0")}h · {hourRows.length}
            </h3>
            <Rows
              items={hourRows.map((r) => {
                // Once the customer is back: what they waited, and their rating.
                const wait = waitMinutes(r);
                return {
                  id: r.id,
                  time: formatTime(r.returnAt),
                  name: r.customerName,
                  detail: `${r.returnTerminal ?? "terminal ?"} · ${r.passengers} pers.${wait === null ? "" : ` · ${wait} min d'attente`}`,
                  status: r.pickupStatus,
                  rating: r.rating,
                };
              })}
            />
          </section>
        ))}
    </div>
  );
}

/** A horizontal strip of days to pick from, with a dot on busy days. */
export function DayStrip({
  days,
  selected,
  hrefFor,
}: {
  days: { day: string; count: number }[];
  selected: string;
  hrefFor: (day: string) => string;
}) {
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
  return (
    <StripScroller selected={selected} className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {days.map(({ day, count }) => {
        const date = new Date(`${day}T12:00:00Z`);
        const active = day === selected;
        return (
          <Link
            key={day}
            href={hrefFor(day)}
            scroll={false}
            aria-current={active ? "date" : undefined}
            className={cn(
              "flex w-14 shrink-0 snap-start flex-col items-center rounded-2xl border py-2.5 transition",
              active ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40",
            )}
          >
            <span className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground")}>
              {weekday.format(date).replace(".", "")}
            </span>
            <span className="text-lg font-semibold tabular-nums">{date.getUTCDate()}</span>
            <span
              className={cn(
                "mt-1 size-1.5 rounded-full",
                count === 0 ? "bg-transparent" : count >= BUSY_DAY_CLIENTS ? "bg-primary" : active ? "bg-background/60" : "bg-muted-foreground/40",
              )}
            />
          </Link>
        );
      })}
    </StripScroller>
  );
}

/** The list of the next `count` Paris days starting at `from` ("2026-10-20"). */
export function nextDays(from: string, count: number, step = 1): string[] {
  const [y, m, d] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i * step, 12));
    return parisDay(date);
  });
}
