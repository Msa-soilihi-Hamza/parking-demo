import { cn } from "@/lib/utils";

/** The red tile with the E and its stop, as on the favicon, then the name. */
export function BrandLogo({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <svg
        viewBox="0 0 256 256"
        fill="currentColor"
        className="size-7 shrink-0 rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/30"
        aria-hidden
      >
        <rect x="64" y="48" width="32" height="160" rx="10" />
        <rect x="64" y="48" width="128" height="32" rx="10" />
        <rect x="64" y="176" width="128" height="32" rx="10" />
        <circle cx="146" cy="128" r="27" />
      </svg>
      <span className="text-[15px]">Escale</span>
      {children}
    </span>
  );
}
