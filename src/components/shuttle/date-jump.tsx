"use client";

import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fr } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "Autre date": a calendar in a popover, for any day beyond the strip. */
export function DateJump({
  selected,
  basePath,
  maxDay,
}: {
  selected: string;
  basePath: string;
  /** Last selectable day ("2026-10-20"), e.g. today for the history. */
  maxDay?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <CalendarIcon /> Autre date
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          locale={fr}
          selected={fromDay(selected)}
          defaultMonth={fromDay(selected)}
          disabled={maxDay ? { after: fromDay(maxDay) } : undefined}
          onSelect={(date) => {
            if (!date) return;
            setOpen(false);
            router.push(`${basePath}?date=${toDay(date)}`);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
