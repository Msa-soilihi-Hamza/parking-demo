"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Space = { href: string; label: string };

const PILL = "inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground";

/**
 * The space's name next to the logo. The manager, who works in every space,
 * opens it to move to another one.
 */
export function SpaceSwitcher({ current, others }: { current: string; others: Space[] }) {
  if (others.length === 0) return <span className={PILL}>{current}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(PILL, "transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-popup-open:text-foreground")}
        aria-label={`Espace ${current}, changer d'espace`}
      >
        {current}
        <ChevronsUpDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Changer d&apos;espace</DropdownMenuLabel>
          <DropdownMenuItem disabled className="data-disabled:opacity-100">
            {current} <CheckIcon className="ml-auto" />
          </DropdownMenuItem>
          {others.map((space) => (
            <DropdownMenuItem key={space.href} render={<Link href={space.href} />}>
              {space.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
