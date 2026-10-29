import { CircleCheckIcon, StarIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BagsForm } from "@/components/bags-form";
import { CancelRequestButton } from "@/components/cancel-request-button";
import { PickupTimeline } from "@/components/pickup-timeline";
import { ReviewForm } from "@/components/review-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/contact";
import { formatEuros } from "@/lib/pricing";
import { formatDateTime, formatTime } from "@/lib/time";
import { confirmPayment, getBookingByToken } from "@/server/bookings";
import { arrivalQrSvg } from "@/server/qr";
import { getReviewForBooking } from "@/server/reviews";
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
  const review = booking.pickupStatus === "picked_up" ? await getReviewForBooking(booking.id) : null;
  const waiting = booking.pickupStatus === "bags_ready" || booking.pickupStatus === "en_route";
  // The QR code is only useful until the car has been left at the parking.
  const arrivalQr =
    booking.status === "confirmed" && !booking.parkedAt && booking.pickupStatus === "scheduled"
      ? await arrivalQrSvg(booking.reference)
      : null;

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

      {arrivalQr && (
        <Card>
          <CardHeader>
            <CardTitle>Votre arrivée au parking</CardTitle>
            <CardDescription>
              Présentez ce QR code à l&apos;accueil le {formatDateTime(booking.dropoffAt)}. Pas de réseau ? Donnez
              simplement la référence.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            {/* Generated on the server from our own URL: no user input in the markup. */}
            <div
              className="size-44 shrink-0 rounded-xl border bg-white p-2 [&>svg]:size-full"
              role="img"
              aria-label={`QR code de la réservation ${booking.reference}`}
              dangerouslySetInnerHTML={{ __html: arrivalQr }}
            />
            <div className="text-center sm:text-left">
              <p className="text-sm text-muted-foreground">Référence</p>
              <p className="font-mono text-2xl font-semibold tracking-wider">{booking.reference}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {parking.name} · véhicule <span className="font-mono">{booking.plate}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {booking.status === "confirmed" && (
        <Card>
          <CardHeader>
            <CardTitle>Votre retour</CardTitle>
            <CardDescription>
              Bagages en main, un seul bouton prévient la navette. Un imprévu ? Appelez le{" "}
              <a href={SUPPORT_PHONE_HREF} className="font-medium text-foreground hover:underline">
                {SUPPORT_PHONE}
              </a>
              .
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

            {/* The button works at any time: a customer back early must not have to call. */}
            {booking.pickupStatus === "scheduled" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Retour prévu le {formatDateTime(booking.returnAt)}. Rentré plus tôt ? Le bouton marche aussi.
                </p>
                <BagsForm
                  token={token}
                  terminals={parking.terminals}
                  defaultTerminal={booking.returnTerminal}
                  passengers={booking.passengers}
                />
              </div>
            )}

            {booking.pickupStatus === "bags_ready" && (
              <div className="space-y-3">
                <Alert className="border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-100">
                  <CircleCheckIcon className="text-emerald-600 dark:text-emerald-400" />
                  <AlertTitle>L&apos;équipe navette a bien reçu votre demande</AlertTitle>
                  <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                    Reçue à {formatTime(booking.bagsReadyAt!)}. Rendez-vous au point navette du terminal{" "}
                    <strong>{booking.returnTerminal}</strong>. Une confirmation vient de vous être envoyée par
                    e-mail, et cette page se met à jour toute seule.
                  </AlertDescription>
                </Alert>
                <CancelRequestButton token={token} />
                <p className="text-center text-xs text-muted-foreground">
                  Appuyé par erreur ? Annulez tant que la navette n&apos;est pas partie.
                </p>
              </div>
            )}
            {booking.pickupStatus === "en_route" && (
              <p className="rounded-lg bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                <strong>La navette est en route.</strong> Rendez-vous au point navette du terminal{" "}
                {booking.returnTerminal}. Un changement de dernière minute ? Appelez le{" "}
                <a href={SUPPORT_PHONE_HREF} className="font-medium underline">
                  {SUPPORT_PHONE}
                </a>
                .
              </p>
            )}
            {booking.pickupStatus === "picked_up" && (
              <p className="rounded-lg bg-muted px-4 py-3 text-sm">Bon retour ! Votre véhicule vous attend.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* The last step: once picked up, the customer can rate their return. */}
      {booking.status === "confirmed" && booking.pickupStatus === "picked_up" && (
        <Card id="avis" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{review ? "Merci pour votre avis" : "Comment s'est passé votre retour ?"}</CardTitle>
            <CardDescription>
              {review
                ? "Il aide l'équipe navette à s'améliorer."
                : "Une note et, si vous voulez, un mot : ça prend 10 secondes."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {review ? (
              <div className="space-y-2">
                <p className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <StarIcon
                      key={n}
                      className={n <= review.rating ? "size-5 fill-primary text-primary" : "size-5 text-muted-foreground/30"}
                    />
                  ))}
                </p>
                {review.comment && <p className="text-sm text-muted-foreground">« {review.comment} »</p>}
              </div>
            ) : (
              <ReviewForm token={token} />
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
            <Item
              label={booking.parkedAt ? "Déposé" : "Dépôt"}
              value={formatDateTime(booking.parkedAt ?? booking.dropoffAt)}
            />
            {booking.parkingSpot && <Item label="Place" value={booking.parkingSpot} mono />}
            <Item label="Atterrissage retour" value={formatDateTime(booking.returnAt)} />
            <Item label="Passagers" value={String(booking.passengers)} />
            <Item
              label="Montant"
              value={`${formatEuros(booking.priceCents)}${booking.discountCents > 0 ? ` · code promo -${formatEuros(booking.discountCents)}` : ""}`}
            />
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
