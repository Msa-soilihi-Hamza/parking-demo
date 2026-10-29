import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Display accent for a few words in headlines.
const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Escale Parking — Parking aéroport avec navette",
  description:
    "Parking à Orly et Roissy-CDG avec navette. Prix immédiat, paiement en ligne, et au retour un seul bouton pour qu'on vienne vous chercher.",
};

// The public site (header + footer) lives in (site)/layout.tsx; the shuttle team's
// tool has its own layout in navette/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script and extensions such as Dark Reader change <html> before React hydrates.
    <html
      lang="fr"
      className={cn("h-full antialiased", geistMono.variable, instrumentSerif.variable, inter.variable, "font-sans")}
      suppressHydrationWarning
    >
      {/* Browser extensions add attributes to <body> before React hydrates. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <ThemeProvider>
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
