"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TeamSpace } from "@/lib/permissions";

type Tab = { href: string; label: string; short?: string; icon?: boolean; matches: (pathname: string) => boolean };

// Each space only shows its own tabs: the drivers never see the parking, and the other way round.
const TABS: Record<TeamSpace, Tab[]> = {
  navette: [
    { href: "/navette", label: "En direct", matches: (p) => p === "/navette" },
    { href: "/navette/journees", label: "Journées", matches: (p) => p === "/navette/journees" },
  ],
  accueil: [
    // A booking opened from a QR code belongs to the arrivals.
    { href: "/accueil", label: "Arrivées", matches: (p) => p === "/accueil" || p.startsWith("/accueil/reservation/") },
    { href: "/accueil/plan", label: "Plan", matches: (p) => p === "/accueil/plan" },
    { href: "/accueil/vehicules", label: "Véhicules", matches: (p) => p === "/accueil/vehicules" },
    // "Client" on phones, so the four tabs fit on one line.
    { href: "/accueil/nouveau", label: "Nouveau client", short: "Client", icon: true, matches: (p) => p === "/accueil/nouveau" },
  ],
  gestion: [{ href: "/gestion", label: "Codes promo", matches: (p) => p === "/gestion" }],
};

/** The space's tabs, as a segmented control. `fill` stretches it across a phone's width. */
export function TeamNav({ space, fill = false }: { space: TeamSpace; fill?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Onglets"
      className={cn(
        "flex items-center gap-0.5 overflow-x-auto rounded-full bg-muted p-1 text-sm [scrollbar-width:none]",
        fill ? "w-full" : "w-fit",
      )}
    >
      {TABS[space].map((tab) => {
        const active = tab.matches(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-full px-3 py-1 whitespace-nowrap transition",
              fill && "flex-1",
              active
                ? "bg-background font-medium text-foreground shadow-sm dark:bg-white/15"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.icon && <PlusIcon className="size-3.5" />}
            {tab.short ? (
              <>
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </>
            ) : (
              tab.label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
