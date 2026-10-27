import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LogoutButton } from "@/components/shuttle/logout-button";
import { TeamNav } from "@/components/shuttle/team-nav";
import { TeamSignInRedirect } from "@/components/shuttle/team-sign-in-redirect";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { spacesFor } from "@/lib/permissions";
import { TEAM_HOMES, teamSession, type TeamSpace } from "@/server/team-access";

const NAMES: Record<TeamSpace, string> = { navette: "Navette", accueil: "Accueil", gestion: "Gestion" };

/**
 * One team space (drivers, front desk or manager): signed-in accounts with the right
 * role only. Its own minimal top bar, no public header or footer.
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
  const session = await teamSession();
  if (!session) return <TeamSignInRedirect />;

  const spaces = spacesFor(session.user.role);
  if (!spaces.includes(space)) {
    return (
      <main className="mx-auto grid max-w-md flex-1 place-items-center gap-4 px-4 py-20 text-center">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Espace réservé à l&apos;équipe</h1>
          <p className="text-muted-foreground">
            Votre compte ({session.user.email}) n&apos;a pas accès à cet espace.
          </p>
          <Button render={<Link href="/compte" />} nativeButton={false}>
            Aller à Mon espace
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        {/* Phones: logo + logout on the first row, the tabs on a second row. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0">
          <Link href={TEAM_HOMES[space]} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            Escale <span className="font-normal text-muted-foreground">· {NAMES[space]}</span>
          </Link>
          <div className="order-last w-full min-w-0 sm:order-none sm:mr-auto sm:w-auto">
            <TeamNav space={space} />
          </div>
          <div className="flex items-center gap-2">
            {/* The manager moves between every space. */}
            {spaces.length > 1 && (
              <nav className="hidden items-center gap-1 text-sm lg:flex" aria-label="Espaces">
                {spaces
                  .filter((s) => s !== space)
                  .map((s) => (
                    <Link key={s} href={TEAM_HOMES[s]} className="rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground">
                      {NAMES[s]}
                    </Link>
                  ))}
              </nav>
            )}
            <LogoutButton space={space} />
          </div>
        </div>
        {spaces.length > 1 && (
          <nav className="flex justify-center gap-1 border-t px-4 py-1.5 text-xs lg:hidden" aria-label="Espaces">
            {spaces
              .filter((s) => s !== space)
              .map((s) => (
                <Link key={s} href={TEAM_HOMES[s]} className="rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground">
                  Espace {NAMES[s]}
                </Link>
              ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
