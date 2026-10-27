import { LogInIcon, UserRoundIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { auth } from "@/server/auth";

/** Shown while the session is read, and when signed out. */
export function SignInLink() {
  return (
    <Button variant="ghost" size="sm" render={<Link href="/connexion" />} nativeButton={false}>
      <LogInIcon /> <span className="hidden sm:inline">Se connecter</span>
      <span className="sr-only sm:hidden">Se connecter</span>
    </Button>
  );
}

/** The header's account entry: "Se connecter" signed out, "Mon espace" signed in. */
export async function AccountLink() {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <SignInLink />;
  return (
    <Button variant="ghost" size="sm" render={<Link href="/compte" />} nativeButton={false}>
      <UserRoundIcon /> <span className="hidden sm:inline">Mon espace</span>
      <span className="sr-only sm:hidden">Mon espace</span>
    </Button>
  );
}
