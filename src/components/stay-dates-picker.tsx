"use client";

import { CalendarIcon, Clock2Icon } from "lucide-react";
import { useState } from "react";
import { fr } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
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
export function TimeSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
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
};

/** One day, picked from a calendar that closes once the day is chosen. */
function DayField({
  id,
  label,
  value,
  minDay,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  minDay: string;
  placeholder: string;
  onChange: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button id={id} variant="outline" className="w-full justify-start font-normal">
              <CalendarIcon className="text-muted-foreground" />
              {value ? shortDay(value) : <span className="text-muted-foreground">{placeholder}</span>}
            </Button>
          }
        />
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={fr}
            showOutsideDays={false}
            defaultMonth={fromDay(value || minDay)}
            selected={value ? fromDay(value) : undefined}
            disabled={{ before: fromDay(minDay) }}
            onSelect={(day) => {
              // Clicking the chosen day again would clear it: keep it instead.
              if (day) onChange(toDay(day));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}

/**
 * The stay as two separate days, each with its own calendar, and their times:
 * departure (drop-off) on the first row, return (landing) on the second.
 */
export function StayDatesPicker({ value, onChange, minDay }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <DayField
        id="dropoffDay"
        label="Date de départ"
        value={value.from}
        minDay={minDay}
        placeholder="Choisir"
        // A return before the new departure no longer makes sense: it is asked again.
        onChange={(from) => onChange({ ...value, from, to: value.to && value.to < from ? "" : value.to })}
      />
      <Field>
        <FieldLabel htmlFor="dropoffTime">Heure de dépôt</FieldLabel>
        <TimeSelect
          id="dropoffTime"
          label="Heure de dépôt"
          value={value.dropoffTime}
          onChange={(dropoffTime) => onChange({ ...value, dropoffTime })}
        />
      </Field>
      <DayField
        id="returnDay"
        label="Date de retour"
        value={value.to}
        minDay={value.from || minDay}
        placeholder="Choisir"
        onChange={(to) => onChange({ ...value, to })}
      />
      <Field>
        <FieldLabel htmlFor="returnTime">Atterrissage retour</FieldLabel>
        <TimeSelect
          id="returnTime"
          label="Atterrissage retour"
          value={value.returnTime}
          onChange={(returnTime) => onChange({ ...value, returnTime })}
        />
      </Field>

      {/* What the server receives: "2026-10-20T08:00" in Paris time */}
      <input type="hidden" name="dropoffAt" value={`${value.from}T${value.dropoffTime}`} />
      <input type="hidden" name="returnAt" value={value.to ? `${value.to}T${value.returnTime}` : ""} />
    </div>
  );
}
