import { CheckIcon } from "lucide-react";
import { PICKUP_LABELS, PICKUP_STATUSES, type PickupStatus } from "@/lib/pickup";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = {
  status: PickupStatus;
  times: Partial<Record<PickupStatus, Date | null>>;
};

export function PickupTimeline({ status, times }: Props) {
  const current = PICKUP_STATUSES.indexOf(status);
  return (
    <ol className="grid gap-3">
      {PICKUP_STATUSES.map((step, i) => {
        const done = i <= current;
        const time = times[step];
        return (
          <li key={step} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border",
                done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                i === current + 1 && "border-primary/40",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <span className={cn("flex-1", done ? "font-medium" : "text-muted-foreground")}>
              {PICKUP_LABELS[step]}
            </span>
            {time && done && <span className="tabular-nums text-muted-foreground">{formatTime(time)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
