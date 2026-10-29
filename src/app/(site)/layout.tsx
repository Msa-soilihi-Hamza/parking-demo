import Link from "next/link";
import { Suspense } from "react";
import { AccountLink, SignInLink } from "@/components/account-link";
import { BrandLogo } from "@/components/brand-logo";
import { SiteMobileMenu, SiteNavLinks } from "@/components/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/contact";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Escale, accueil" className="rounded-lg">
            <BrandLogo />
          </Link>
          <SiteNavLinks />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle className="hidden md:inline-flex" />
            {/* One sign-in for customers and the team; the team reaches its spaces from there. */}
            <Suspense fallback={<SignInLink />}>
              <AccountLink />
            </Suspense>
            <Button size="sm" className="ml-1 px-4" render={<Link href="/reserver" />} nativeButton={false}>
              Réserver
            </Button>
            <SiteMobileMenu />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>
            Escale · Orly &amp; Roissy-CDG · Assistance 24h/24 :{" "}
            <a href={SUPPORT_PHONE_HREF} className="text-foreground hover:underline">
              {SUPPORT_PHONE}
            </a>
          </span>
          <span>
            Projet de démonstration · marque fictive · Stripe en mode test ·{" "}
            <Link href="/confidentialite" className="hover:text-foreground hover:underline">
              Confidentialité
            </Link>{" "}
            ·{" "}
            <Link href="/conditions" className="hover:text-foreground hover:underline">
              Conditions
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
