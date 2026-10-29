import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/shuttle/logout-button";
import { SpaceSwitcher } from "@/components/shuttle/space-switcher";
import { TeamNav } from "@/components/shuttle/team-nav";
import { TeamSignInRedirect } from "@/components/shuttle/team-sign-in-redirect";
import { ThemeToggle } from "@/components/theme-toggle";
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
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6 md:h-16 md:gap-5">
          <div className="flex items-center gap-2.5">
            <Link href={TEAM_HOMES[space]} aria-label={`Escale, espace ${NAMES[space]}`} className="rounded-lg">
              <BrandLogo />
            </Link>
            {/* The manager moves between every space from here. */}
            <SpaceSwitcher
              current={NAMES[space]}
              others={spaces.filter((s) => s !== space).map((s) => ({ href: TEAM_HOMES[s], label: NAMES[s] }))}
            />
          </div>
          <div className="hidden min-w-0 md:block">
            <TeamNav space={space} />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <LogoutButton space={space} />
          </div>
        </div>
        {/* Phones: the tabs on their own row, across the whole width. */}
        <div className="px-4 pb-2.5 sm:px-6 md:hidden">
          <TeamNav space={space} fill />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
