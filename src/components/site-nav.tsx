"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { ThemeRadioItems } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// The landing page's sections, reachable from every public page.
const LINKS = [
  { href: "/#fonctionnement", label: "Fonctionnement" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#avis", label: "Avis" },
];

/** Computers: the links in the bar. */
export function SiteNavLinks() {
  return (
    <nav aria-label="Principale" className="hidden items-center gap-0.5 md:flex">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phones: the same links and the theme, behind one menu button. */
export function SiteMobileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Menu" />}
      >
        <MenuIcon className="group-data-popup-open/button:hidden" />
        <XIcon className="hidden group-data-popup-open/button:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-60">
        {LINKS.map((link) => (
          <DropdownMenuItem key={link.href} render={<Link href={link.href} />} className="py-2.5 text-[15px]">
            {link.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <ThemeRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
