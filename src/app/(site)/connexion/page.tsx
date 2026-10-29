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

export const metadata = { title: "Connexion · Escale Parking" };

export default function SignInPage(props: PageProps<"/connexion">) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SignIn searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<"/connexion">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const next = safeNext(params.suite);
  // Already signed in (or just signed in with the code: the page refreshes): back to the
  // page asked for, otherwise to their space (the team to theirs, customers to "Mon espace").
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect(next ?? homeFor(session.user.role));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Connexion</CardTitle>
        <CardDescription>
          Clients et équipe, une seule connexion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {params.erreur === "google" && (
          <Alert variant="destructive">
            <AlertDescription>La connexion avec Google n&apos;a pas abouti. Réessayez, ou recevez un code par e-mail.</AlertDescription>
          </Alert>
        )}
        {/* Google comes back here, so the same choice of space applies. */}
        <SignInPanel googleEnabled={googleEnabled} callbackURL={next ?? "/connexion"} />
        <p className="border-t pt-4 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link
            href={next ? `/inscription?suite=${encodeURIComponent(next)}` : "/inscription"}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
