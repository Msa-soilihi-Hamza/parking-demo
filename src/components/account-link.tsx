import { UserRoundIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { auth } from "@/server/auth";

/**
 * One "Mon espace" button for everyone: signed out it opens the sign-in form (which links
 * to the sign-up form), signed in it opens the customer's space.
 */
function SpaceButton({ href }: { href: string }) {
  return (
    <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
      <UserRoundIcon /> <span className="hidden sm:inline">Mon espace</span>
      <span className="sr-only sm:hidden">Mon espace</span>
    </Button>
  );
}

/** Shown while the session is read, and when signed out. */
export function SignInLink() {
  return <SpaceButton href="/connexion" />;
}

/** The header's account entry. */
export async function AccountLink() {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  return <SpaceButton href={session ? "/compte" : "/connexion"} />;
}
