"use client";

import { CalendarIcon, Clock2Icon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const timeInputClass =
  "appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none";

type Props = {
  value: StayDates;
  onChange: (value: StayDates) => void;
  /** First selectable day ("2026-10-20") */
  minDay: string;
};

/** One calendar for the whole stay, plus the drop-off and landing times. */
export function StayDatesPicker({ value, onChange, minDay }: Props) {
  const range: DateRange = { from: fromDay(value.from), to: value.to ? fromDay(value.to) : undefined };

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
      <Field>
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
          <InputGroup>
            <InputGroupInput
              id="dropoffTime"
              type="time"
              step={300}
              required
              value={value.dropoffTime}
              onChange={(e) => onChange({ ...value, dropoffTime: e.target.value })}
              className={timeInputClass}
            />
            <InputGroupAddon>
              <Clock2Icon className="text-muted-foreground" />
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <Field>
          <FieldLabel htmlFor="returnTime">Atterrissage retour</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="returnTime"
              type="time"
              step={300}
              required
              value={value.returnTime}
              onChange={(e) => onChange({ ...value, returnTime: e.target.value })}
              className={timeInputClass}
            />
            <InputGroupAddon>
              <Clock2Icon className="text-muted-foreground" />
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </FieldGroup>

      {/* What the server receives: "2026-10-20T08:00" in Paris time */}
      <input type="hidden" name="dropoffAt" value={`${value.from}T${value.dropoffTime}`} />
      <input type="hidden" name="returnAt" value={value.to ? `${value.to}T${value.returnTime}` : ""} />
    </div>
  );
}
