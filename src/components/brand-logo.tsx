import { cn } from "@/lib/utils";

/** The red "E" tile, as on the app icon, then the name. */
export function BrandLogo({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm shadow-primary/30"
        aria-hidden
      >
        E
      </span>
      <span className="text-[15px]">Escale</span>
      {children}
    </span>
  );
}
