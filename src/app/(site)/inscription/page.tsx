import { CheckIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignInPanel } from "@/components/sign-in-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { homeFor } from "@/lib/permissions";
import { safeNext } from "@/lib/safe-next";
import { auth, googleEnabled } from "@/server/auth";

export const metadata = { title: "Créer un compte · Escale Parking" };

const PERKS = ["Vos réservations et vos reçus au même endroit", "Réserver plus vite la prochaine fois", "Le bouton « J'ai mes bagages » à portée de main"];

export default function SignUpPage(props: PageProps<"/inscription">) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SignUp searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

/**
 * Customers can also open an account without booking. Same Better Auth flow as
 * /connexion (the account is created on the first sign-in), only the words differ.
 */
async function SignUp({ searchParams }: Pick<PageProps<"/inscription">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const next = safeNext(params.suite);
  // Signed in (or the account was just created: the page refreshes): straight to their space.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(next ?? homeFor(session.user.role));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Créer un compte</CardTitle>
        <CardDescription>Juste votre e-mail ou votre compte Google. Pas de mot de passe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="space-y-1.5 text-sm">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" /> {perk}
            </li>
          ))}
        </ul>
        {params.erreur === "google" && (
          <Alert variant="destructive">
            <AlertDescription>L&apos;inscription avec Google n&apos;a pas abouti. Réessayez, ou utilisez votre e-mail.</AlertDescription>
          </Alert>
        )}
        <SignInPanel mode="sign-up" googleEnabled={googleEnabled} callbackURL={next ?? "/inscription"} />
        <p className="border-t pt-4 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link
            href={next ? `/connexion?suite=${encodeURIComponent(next)}` : "/connexion"}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
