"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/navette", label: "En direct" },
  { href: "/navette/planning", label: "Planning" },
  { href: "/navette/historique", label: "Historique" },
  { href: "/navette/accueil", label: "Accueil" },
];

export function ShuttleNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center justify-center gap-1 text-sm">
      {LINKS.map((link) => {
        // A booking opened from the front desk keeps "Accueil" highlighted.
        const active = pathname === link.href || (link.href === "/navette/accueil" && pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-full px-3 py-1.5 whitespace-nowrap transition",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
