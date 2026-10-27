import Link from "next/link";
import { Suspense } from "react";
import { AccountLink, SignInLink } from "@/components/account-link";
import { Button } from "@/components/ui/button";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/contact";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="size-2.5 rounded-full bg-primary" aria-hidden />
            Escale
          </Link>
          <nav className="flex items-center gap-1">
            {/* One sign-in for customers and the team; the team reaches its spaces from there. */}
            <Suspense fallback={<SignInLink />}>
              <AccountLink />
            </Suspense>
            <Button size="sm" render={<Link href="/reserver" />} nativeButton={false}>
              Réserver
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
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
