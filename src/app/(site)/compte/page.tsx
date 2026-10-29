import { ChevronRightIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DeleteAccount } from "@/components/delete-account";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { spacesFor, type TeamSpace } from "@/lib/permissions";
import { PICKUP_LABELS } from "@/lib/pickup";
import { formatEuros } from "@/lib/pricing";
import { formatDateTime } from "@/lib/time";
import { activeBookingOf } from "@/server/account-deletion";
import { auth } from "@/server/auth";
import { listCustomerBookings } from "@/server/bookings";

export const metadata = { title: "Mon espace · Escale Parking" };

const SPACE_NAMES: Record<TeamSpace, string> = { navette: "Navette", accueil: "Accueil", gestion: "Gestion" };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  await connection();
  // Checked on the page itself, as the Better Auth docs recommend.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/connexion?suite=/compte");

  const [rows, activeReference] = await Promise.all([
    listCustomerBookings(session.user),
    activeBookingOf(session.user),
  ]);
  const teamSpaces = spacesFor(session.user.role);
  const now = new Date();
  // Upcoming: not back yet. Past: the return is done.
  const upcoming = rows.filter(
    (r) => r.booking.pickupStatus !== "picked_up" && r.booking.returnAt.getTime() > now.getTime() - 24 * 3600_000,
  );
  const past = rows.filter((r) => !upcoming.includes(r));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Mon espace</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {session.user.name ? `Bonjour ${session.user.name.split(" ")[0]}` : "Bonjour"}
          </h1>
          <p className="text-muted-foreground">{session.user.email}</p>
        </div>
        <SignOutButton />
      </div>

      {teamSpaces.length > 0 && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-medium">Espace équipe</h2>
          <div className="flex flex-wrap gap-2">
            {teamSpaces.map((space) => (
              <Button key={space} variant="outline" size="sm" render={<Link href={`/${space}`} />} nativeButton={false}>
                {SPACE_NAMES[space]}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium">À venir</h2>
          <Button size="sm" render={<Link href="/reserver" />} nativeButton={false}>
            Nouvelle réservation
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Aucune réservation à venir.
          </p>
        ) : (
          <BookingList rows={upcoming} />
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Passées</h2>
          <BookingList rows={past} />
        </section>
      )}

      <section className="space-y-3 border-t pt-8">
        <h2 className="text-lg font-medium">Mes données</h2>
        <p className="text-sm text-muted-foreground">
          Ce que nous gardons et pourquoi : <Link href="/confidentialite" className="underline underline-offset-4">règles de confidentialité</Link>.
        </p>
        <DeleteAccount email={session.user.email} activeReference={activeReference} />
      </section>
    </div>
  );
}

function BookingList({ rows }: { rows: Awaited<ReturnType<typeof listCustomerBookings>> }) {
  return (
    <ul className="divide-y rounded-xl border">
      {rows.map(({ booking, parkingName }) => (
        <li key={booking.id}>
          <Link
            href={`/reservation/${booking.accessToken}`}
            className="flex items-center gap-4 px-4 py-4 transition hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{parkingName}</span>
                <span className="font-mono text-xs text-muted-foreground">{booking.reference}</span>
                {booking.status === "pending_payment" ? (
                  <Badge variant="outline">Paiement en attente</Badge>
                ) : (
                  <Badge variant="secondary">{PICKUP_LABELS[booking.pickupStatus]}</Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(booking.dropoffAt)} → {formatDateTime(booking.returnAt)} · {booking.plate} ·{" "}
                {formatEuros(booking.priceCents)}
              </p>
            </div>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
