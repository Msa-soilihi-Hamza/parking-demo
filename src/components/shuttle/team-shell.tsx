import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogoutButton } from "@/components/shuttle/logout-button";
import { TeamLogin } from "@/components/shuttle/team-login";
import { TeamNav } from "@/components/shuttle/team-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { hasAccess, TEAM_SPACES, type TeamSpace } from "@/server/team-access";

const NAMES: Record<TeamSpace, string> = { navette: "Navette", accueil: "Accueil", gestion: "Gestion" };

/**
 * One team space (drivers, front desk or manager): its own login, its own minimal top
 * bar, no public header or footer.
 */
export function TeamShell({ space, children }: { space: TeamSpace; children: React.ReactNode }) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-[600px]" />}>
      <Shell space={space}>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ space, children }: { space: TeamSpace; children: React.ReactNode }) {
  await connection();
  if (!(await hasAccess(space))) {
    return (
      <main className="grid flex-1 place-items-center px-4 py-16">
        <TeamLogin space={space} />
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        {/* Phones: logo + logout on the first row, the tabs on a second row. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
          <Link href={TEAM_SPACES[space].home} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            Escale <span className="font-normal text-muted-foreground">· {NAMES[space]}</span>
          </Link>
          <div className="order-last w-full min-w-0 sm:order-none sm:mr-auto sm:w-auto">
            <TeamNav space={space} />
          </div>
          <LogoutButton space={space} />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
