"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Signed out on a team page (a QR code scanned at the desk, a bookmark): go to the
 * sign-in and come back to this exact page afterwards.
 */
export function TeamSignInRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/connexion?suite=${encodeURIComponent(pathname)}`);
  }, [pathname, router]);
  return <p className="py-16 text-center text-sm text-muted-foreground">Redirection vers la connexion…</p>;
}
