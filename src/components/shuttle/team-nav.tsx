"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TeamSpace } from "@/server/team-access";

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

export function TeamNav({ space }: { space: TeamSpace }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto text-sm [scrollbar-width:none] sm:mx-0 sm:gap-1">
      {TABS[space].map((tab) => {
        const active = tab.matches(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 whitespace-nowrap transition",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
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
