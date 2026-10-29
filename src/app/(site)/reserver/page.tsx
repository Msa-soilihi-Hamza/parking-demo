import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingFlow } from "@/components/booking-flow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizePromoCode } from "@/lib/promo";
import { dateToParisLocal, parisDay, parisDayBounds, parisLocalToDate } from "@/lib/time";
import { auth, googleEnabled } from "@/server/auth";
import { listParkings } from "@/server/bookings";

export const metadata = { title: "Réserver · Escale Parking" };

export default function BookPage(props: PageProps<"/reserver">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Réserver une place</h1>
      <p className="mt-2 text-muted-foreground">
        Le prix s&apos;affiche dès que vous choisissez vos dates. Pour réserver, un compte suffit : Google ou un code
        reçu par e-mail.
      </p>
      <div className="mt-10">
        <Suspense fallback={<Skeleton className="h-[640px] w-full" />}>
          <Booking searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Booking({ searchParams }: Pick<PageProps<"/reserver">, "searchParams">) {
  await connection();
  const [params, parkings, session] = await Promise.all([
    searchParams,
    listParkings(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const { paiement } = params;

  // Default stay: tomorrow 08:00 → one week later 08:00 (Paris time),
  // unless the landing page's quick quote already chose it.
  const tomorrow = parisDayBounds(new Date(), 1).start;
  const nextWeek = parisDayBounds(new Date(), 8).start;
  const at8 = (d: Date) => dateToParisLocal(new Date(d.getTime() + 8 * 3600_000));
  const fromQuery = (value: unknown) =>
    typeof value === "string" && parisLocalToDate(value) ? value : null;
  const parking = parkings.find((p) => p.slug === params.parking)?.slug ?? parkings[0]?.slug ?? "";

  return (
    <div className="space-y-6">
      {paiement === "annule" && (
        <Alert>
          <AlertDescription>
            Paiement annulé : rien n&apos;a été débité. Vous pouvez recommencer quand vous voulez.
          </AlertDescription>
        </Alert>
      )}
      <BookingFlow
        parkings={parkings.map((p) => ({
          slug: p.slug,
          name: p.name,
          airport: p.airport,
          dailyRateCents: p.dailyRateCents,
          terminals: p.terminals,
        }))}
        defaultParking={parking}
        defaultDropoff={fromQuery(params.dropoffAt) ?? at8(tomorrow)}
        defaultReturn={fromQuery(params.returnAt) ?? at8(nextWeek)}
        minDay={parisDay(new Date())}
        defaultPromo={typeof params.promo === "string" ? (normalizePromoCode(params.promo) ?? "") : ""}
        customer={session ? { name: session.user.name, email: session.user.email } : null}
        googleEnabled={googleEnabled}
      />
    </div>
  );
}
