// Every date the user types is Paris local time; the database stores UTC instants.
export const TIME_ZONE = "Europe/Paris";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function parisParts(date: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Milliseconds to add to a UTC instant to get Paris wall-clock time. */
function parisOffset(instant: number): number {
  const p = parisParts(new Date(instant));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Paris wall-clock time as a number, so durations ignore the DST hour. */
export function parisWallClockMs(date: Date): number {
  return date.getTime() + parisOffset(date.getTime());
}

/** "2026-10-23T14:30" (Paris time) → UTC Date. Returns null if the string is invalid. */
export function parisLocalToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallClock = Date.UTC(y, mo - 1, d, h, mi);
  let instant = wallClock - parisOffset(wallClock);
  // Around DST changes the offset at the guessed instant can differ: correct once.
  const corrected = wallClock - parisOffset(instant);
  if (corrected !== instant) instant = corrected;
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result;
}

/** UTC Date → "2026-10-23T14:30" in Paris time (value for <input type="datetime-local">). */
export function dateToParisLocal(date: Date): string {
  const p = parisParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "2026-10-23" for the Paris calendar day containing `date`. */
export function parisDay(date: Date): string {
  return dateToParisLocal(date).slice(0, 10);
}

/** UTC bounds [start, end) of a Paris calendar day, shifted by `offsetDays`. */
export function parisDayBounds(date: Date, offsetDays = 0): { start: Date; end: Date } {
  const [y, m, d] = parisDay(date).split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const next = new Date(Date.UTC(y, m - 1, d + offsetDays + 1));
  const toLocal = (x: Date) =>
    `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T00:00`;
  return { start: parisLocalToDate(toLocal(day))!, end: parisLocalToDate(toLocal(next))! };
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function parisHour(date: Date): number {
  return parisParts(date).hour;
}
