"use client";

import { CalendarIcon, Clock2Icon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type StayDates = {
  /** Calendar days as "2026-10-20" (Paris time) */
  from: string;
  to: string;
  /** Times as "08:00" */
  dropoffTime: string;
  returnTime: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shortDay = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(fromDay(s));

// Hours on the left, minutes on the right: every value, picked from lists, never typed.
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

function NumberSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id?: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(String(next))}>
      <SelectTrigger id={id} aria-label={label} className="w-full font-mono tabular-nums">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72 min-w-20">
        {options.map((option) => (
          <SelectItem key={option} value={option} className="font-mono tabular-nums">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A time as two lists: hour (00–23) then minutes (00–59). Value is "08:05". */
function TimeSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [hour, minute] = value.split(":");
  return (
    <div className="flex items-center gap-1.5">
      <Clock2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <NumberSelect id={id} label={`${label} : heure`} value={hour} options={HOURS} onChange={(h) => onChange(`${h}:${minute}`)} />
      <span className="text-muted-foreground">:</span>
      <NumberSelect label={`${label} : minutes`} value={minute} options={MINUTES} onChange={(m) => onChange(`${hour}:${m}`)} />
    </div>
  );
}

type Props = {
  value: StayDates;
  onChange: (value: StayDates) => void;
  /** First selectable day ("2026-10-20") */
  minDay: string;
  /** "stacked" puts the dates above the two times, for narrow cards. */
  layout?: "inline" | "stacked";
};

/** One calendar for the whole stay, plus the drop-off and landing times. */
export function StayDatesPicker({ value, onChange, minDay, layout = "inline" }: Props) {
  const range: DateRange = { from: fromDay(value.from), to: value.to ? fromDay(value.to) : undefined };

  return (
    <div
      className={
        layout === "inline" ? "grid gap-4 sm:grid-cols-[1fr_auto_auto]" : "grid gap-3 sm:grid-cols-2"
      }
    >
      <Field className={layout === "stacked" ? "sm:col-span-2" : undefined}>
        <FieldLabel>Dates du séjour</FieldLabel>
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" className="w-full justify-start font-normal">
                <CalendarIcon className="text-muted-foreground" />
                {shortDay(value.from)} → {value.to ? shortDay(value.to) : "retour ?"}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              locale={fr}
              numberOfMonths={2}
              showOutsideDays={false}
              defaultMonth={range.from}
              selected={range}
              disabled={{ before: fromDay(minDay) }}
              onSelect={(next) => {
                if (!next?.from) return;
                onChange({ ...value, from: toDay(next.from), to: next.to ? toDay(next.to) : "" });
              }}
            />
          </PopoverContent>
        </Popover>
      </Field>

      <FieldGroup className="contents">
        <Field>
          <FieldLabel htmlFor="dropoffTime">Heure de dépôt</FieldLabel>
          <TimeSelect
            id="dropoffTime"
            label="Heure de dépôt"
            value={value.dropoffTime}
            onChange={(dropoffTime) => onChange({ ...value, dropoffTime })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="returnTime">Atterrissage retour</FieldLabel>
          <TimeSelect
            id="returnTime"
            label="Atterrissage retour"
            value={value.returnTime}
            onChange={(returnTime) => onChange({ ...value, returnTime })}
          />
        </Field>
      </FieldGroup>

      {/* What the server receives: "2026-10-20T08:00" in Paris time */}
      <input type="hidden" name="dropoffAt" value={`${value.from}T${value.dropoffTime}`} />
      <input type="hidden" name="returnAt" value={value.to ? `${value.to}T${value.returnTime}` : ""} />
    </div>
  );
}
