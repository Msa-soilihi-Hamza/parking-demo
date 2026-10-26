import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignInPanel } from "@/components/sign-in-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auth, googleEnabled } from "@/server/auth";

export const metadata = { title: "Connexion · Escale Parking" };

/** Where to go once signed in: a page of this site only, "/compte" by default. */
function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/compte";
}

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
  // Already signed in (or just signed in with the code: the page refreshes): go on.
  if (await auth.api.getSession({ headers: await headers() })) redirect(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Connexion</CardTitle>
        <CardDescription>
          Retrouvez vos réservations. Pas encore de compte ? Il est créé à la première connexion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {params.erreur === "google" && (
          <Alert variant="destructive">
            <AlertDescription>La connexion avec Google n&apos;a pas abouti. Réessayez, ou recevez un code par e-mail.</AlertDescription>
          </Alert>
        )}
        <SignInPanel googleEnabled={googleEnabled} callbackURL={next} />
      </CardContent>
    </Card>
  );
}
