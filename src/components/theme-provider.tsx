"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Light, dark or the system's choice, saved in localStorage. next-themes puts a small
 * script in the page that sets the `dark` class on <html> before the first paint.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // The script only has to run once, from the server HTML. On the client React would
      // warn about a <script> tag, so it gets a type that is never executed there.
      scriptProps={{ type: typeof window === "undefined" ? "text/javascript" : "text/plain" }}
    >
      {children}
    </NextThemesProvider>
  );
}
