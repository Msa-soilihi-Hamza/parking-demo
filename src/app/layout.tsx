import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Escale Parking — Parking aéroport avec navette",
  description:
    "Parking à Orly et Roissy-CDG avec navette. Prix immédiat, paiement en ligne, et au retour un seul bouton pour qu'on vienne vous chercher.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={cn("h-full", "antialiased", geistMono.variable, "font-sans", inter.variable)}>
      {/* Browser extensions add attributes to <body> before React hydrates. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="size-2.5 rounded-full bg-primary" aria-hidden />
              Escale
            </Link>
            <nav className="flex items-center gap-1">
              <Button variant="ghost" size="sm" render={<Link href="/navette" />} nativeButton={false}>
                Équipe navette
              </Button>
              <Button size="sm" render={<Link href="/reserver" />} nativeButton={false}>
                Réserver
              </Button>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t">
          <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
            <span>Escale · Orly &amp; Roissy-CDG</span>
            <span>Projet de démonstration · marque fictive · Stripe en mode test</span>
          </div>
        </footer>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
