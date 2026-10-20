import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BagsForm } from "@/components/bags-form";
import { PickupTimeline } from "@/components/pickup-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BAGS_BUTTON_OPENS_BEFORE_MS, bagsButtonOpen } from "@/lib/pickup";
import { formatEuros } from "@/lib/pricing";
import { formatDateTime, formatTime } from "@/lib/time";
import { confirmPayment, getBookingByToken } from "@/server/bookings";
import { getStripe } from "@/server/stripe";

export const metadata = { title: "Ma réservation · Escale Parking" };

export default function ReservationPage(props: PageProps<"/reservation/[token]">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <Suspense fallback={<Skeleton className="h-[520px] w-full" />}>
        <Reservation params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

/** Back from Stripe Checkout: confirm right away instead of waiting for the webhook. */
async function confirmFromCheckout(bookingId: string, sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.payment_status === "paid" && session.metadata?.bookingId === bookingId) {
    await confirmPayment(bookingId);
  }
}

async function Reservation({
  params,
  searchParams,
}: Pick<PageProps<"/reservation/[token]">, "params" | "searchParams">) {
  await connection();
  const { token } = await params;
  const { session_id: sessionId } = await searchParams;

  let found = await getBookingByToken(token);
  if (!found || found.booking.status === "pending_verification") notFound();
  if (found.booking.status === "pending_payment" && typeof sessionId === "string") {
    await confirmFromCheckout(found.booking.id, sessionId);
    found = (await getBookingByToken(token))!;
  }

  const { booking, parking } = found;
  const now = new Date();
  const waiting = booking.pickupStatus === "bags_ready" || booking.pickupStatus === "en_route";

  return (
    <div className="space-y-6">
      {waiting && <AutoRefresh seconds={4} />}

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{booking.reference}</span>
          {booking.status === "confirmed" && <Badge variant="secondary">Payée</Badge>}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Bonjour {booking.customerName.split(" ")[0]}
        </h1>
      </div>

      {typeof sessionId === "string" && booking.status === "confirmed" && booking.pickupStatus === "scheduled" && (
        <Alert>
          <AlertTitle>Paiement reçu, réservation confirmée</AlertTitle>
          <AlertDescription>Un e-mail de confirmation avec ce lien vient de vous être envoyé.</AlertDescription>
        </Alert>
      )}

      {booking.status === "pending_payment" && (
        <Alert>
          <AlertDescription>
            Paiement en attente de confirmation par Stripe. Votre place reste réservée 30 minutes.
          </AlertDescription>
        </Alert>
      )}

      {booking.status === "cancelled" && (
        <Alert variant="destructive">
          <AlertDescription>Cette réservation a été annulée (paiement non finalisé).</AlertDescription>
        </Alert>
      )}

      {booking.status === "confirmed" && (
        <Card>
          <CardHeader>
            <CardTitle>Votre retour</CardTitle>
            <CardDescription>
              Pas besoin d&apos;appeler : prévenez la navette d&apos;un seul geste.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <PickupTimeline
              status={booking.pickupStatus}
              times={{
                scheduled: booking.returnAt,
                bags_ready: booking.bagsReadyAt,
                en_route: booking.enRouteAt,
                picked_up: booking.pickedUpAt,
              }}
            />

            {booking.pickupStatus === "scheduled" &&
              (bagsButtonOpen(booking.returnAt, now) ? (
                <BagsForm
                  token={token}
                  terminals={parking.terminals}
                  defaultTerminal={booking.returnTerminal}
                  passengers={booking.passengers}
                />
              ) : (
                <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
                  Le bouton « J&apos;ai mes bagages » apparaîtra ici à partir du{" "}
                  {formatDateTime(new Date(booking.returnAt.getTime() - BAGS_BUTTON_OPENS_BEFORE_MS))}.
                </p>
              ))}

            {booking.pickupStatus === "bags_ready" && (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm">
                Demande reçue à {formatTime(booking.bagsReadyAt!)}. Un chauffeur part vous chercher au terminal{" "}
                <strong>{booking.returnTerminal}</strong>. Cette page se met à jour toute seule.
              </p>
            )}
            {booking.pickupStatus === "en_route" && (
              <p className="rounded-lg bg-primary/5 px-4 py-3 text-sm">
                <strong>La navette est en route.</strong> Rendez-vous au point navette du terminal{" "}
                {booking.returnTerminal}.
              </p>
            )}
            {booking.pickupStatus === "picked_up" && (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm">Bon retour ! Votre véhicule vous attend.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Votre séjour</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Item label="Parking" value={`${parking.name}`} />
            <Item label="Véhicule" value={booking.plate} mono />
            <Item label="Dépôt" value={formatDateTime(booking.dropoffAt)} />
            <Item label="Atterrissage retour" value={formatDateTime(booking.returnAt)} />
            <Item label="Passagers" value={String(booking.passengers)} />
            <Item label="Montant" value={formatEuros(booking.priceCents)} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono" : "font-medium"}>{value}</dd>
    </div>
  );
}
