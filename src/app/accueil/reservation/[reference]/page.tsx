import { ArrowLeftIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrivalSearch } from "@/components/shuttle/arrival-search";
import { CheckInForm } from "@/components/shuttle/check-in-form";
import { Accent, PageTitle, StatusPill } from "@/components/shuttle/shuttle-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeReference } from "@/lib/arrival";
import { formatEuros } from "@/lib/pricing";
import { formatDateTime, formatTime, parisDay } from "@/lib/time";
import { getBookingByReference, suggestSpot } from "@/server/bookings";
import { customerLinkQrSvg } from "@/server/qr";
import { hasAccess } from "@/server/team-access";

export default function ArrivalPage(props: PageProps<"/accueil/reservation/[reference]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-3xl" />}>
      <Arrival params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Arrival({
  params,
  searchParams,
}: Pick<PageProps<"/accueil/reservation/[reference]">, "params" | "searchParams">) {
  await connection();
  if (!(await hasAccess("accueil"))) return null;

  const reference = normalizeReference((await params).reference);
  const found = reference ? await getBookingByReference(reference) : null;
  // Just registered at the desk (walk-in): say so, and show the customer's link first.
  const justCreated = (await searchParams).nouveau === "1";

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6">
      <Link href="/accueil" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Arrivées du jour
      </Link>

      {!found ? (
        <div className="space-y-6">
          <PageTitle eyebrow={reference ?? "Référence invalide"}>
            Réservation <Accent>introuvable.</Accent>
          </PageTitle>
          <p className="text-muted-foreground">Vérifiez la référence avec le client, ou saisissez-la à nouveau.</p>
          <ArrivalSearch autoFocus />
        </div>
      ) : (
        <Details {...found} justCreated={justCreated} />
      )}
    </div>
  );
}

async function Details({
  booking,
  parking,
  justCreated,
}: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>> & { justCreated: boolean }) {
  const paid = booking.status === "confirmed";
  const today = parisDay(new Date());
  const otherDay = parisDay(booking.dropoffAt) !== today;
  const onSite = booking.paymentMethod === "on_site";
  // Until the customer is back, the desk can show them their private link to scan.
  const customerQr =
    paid && booking.pickupStatus !== "picked_up" ? await customerLinkQrSvg(booking.accessToken) : null;

  return (
    <div className="space-y-8">
      <PageTitle eyebrow={booking.reference}>
        {booking.parkedAt ? (
          <>
            Véhicule <Accent>déposé.</Accent>
          </>
        ) : paid ? (
          <>
            {booking.customerName.split(" ")[0]} <Accent>arrive.</Accent>
          </>
        ) : (
          <>
            Réservation <Accent>non payée.</Accent>
          </>
        )}
      </PageTitle>

      {justCreated && onSite && (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CircleCheckIcon className="text-emerald-600" />
          <AlertTitle>Client enregistré, {formatEuros(booking.priceCents)} encaissés sur place</AlertTitle>
          <AlertDescription className="text-emerald-800">
            Faites-lui scanner le QR code ci-dessous : il retrouve sa réservation et prévient la navette à son
            retour.
          </AlertDescription>
        </Alert>
      )}

      {justCreated && customerQr && <CustomerLink svg={customerQr} email={booking.email} />}

      {!paid && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Réservation non payée</AlertTitle>
          <AlertDescription>
            Ne prenez pas le véhicule : le paiement n&apos;a pas été finalisé ou la réservation a été annulée.
          </AlertDescription>
        </Alert>
      )}

      {/* The plate first: the employee checks it against the car in front of them. */}
      <dl className="grid gap-x-8 gap-y-5 rounded-3xl border p-6 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Immatriculation</dt>
          <dd className="font-mono text-3xl font-semibold tracking-wider">{booking.plate}</dd>
        </div>
        <Item label="Client" value={booking.customerName} />
        <Item label="Parking" value={parking.name} />
        <Item label={onSite ? "Arrivée" : "Arrivée prévue"} value={formatDateTime(booking.dropoffAt)} />
        <div>
          <dt className="text-muted-foreground">Retour</dt>
          <dd className="flex flex-wrap items-center gap-2 font-medium">
            {formatDateTime(booking.returnAt)}
            {booking.returnTerminal ? ` · ${booking.returnTerminal}` : ""}
            {paid && <StatusPill status={booking.pickupStatus} />}
          </dd>
        </div>
        <Item label="Passagers" value={String(booking.passengers)} />
        <div>
          <dt className="text-muted-foreground">Téléphone</dt>
          <dd>
            <a href={`tel:${booking.phone.replace(/\s/g, "")}`} className="font-medium hover:underline">
              {booking.phone}
            </a>
          </dd>
        </div>
        <Item
          label="Paiement"
          value={
            paid
              ? `${formatEuros(booking.priceCents)} · ${onSite ? "payé sur place" : "payé en ligne"}${
                  booking.discountCents > 0 ? ` · code promo -${formatEuros(booking.discountCents)}` : ""
                }`
              : "Non payée"
          }
        />
      </dl>

      {booking.parkedAt ? (
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CircleCheckIcon className="text-emerald-600" />
          <AlertTitle>
            Véhicule déposé à {formatTime(booking.parkedAt)}, place{" "}
            <span className="font-mono">{booking.parkingSpot}</span>
          </AlertTitle>
          <AlertDescription className="text-emerald-800">
            Enregistré le {formatDateTime(booking.parkedAt)}. Le client voit la place sur sa réservation.
          </AlertDescription>
        </Alert>
      ) : (
        paid && (
          <div className="space-y-4">
            {otherDay && (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Arrivée prévue le {formatDateTime(booking.dropoffAt)}, pas aujourd&apos;hui : vérifiez avec le client
                avant d&apos;enregistrer.
              </p>
            )}
            <CheckInForm
              reference={booking.reference}
              suggested={await suggestSpot(parking)}
              planHref={`/accueil/plan?parking=${parking.slug}`}
            />
          </div>
        )
      )}

      {!justCreated && customerQr && <CustomerLink svg={customerQr} email={booking.email} />}
    </div>
  );
}

/** The customer's private link as a QR code, for a customer without e-mail or who lost it. */
function CustomerLink({ svg, email }: { svg: string; email: string | null }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl border p-6 sm:flex-row sm:items-center sm:gap-6">
      {/* Generated on the server from our own URL: no user input in the markup. */}
      <div
        className="size-40 shrink-0 rounded-xl border bg-white p-2 [&>svg]:size-full"
        role="img"
        aria-label="QR code du lien client"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="space-y-1 text-center text-sm sm:text-left">
        <p className="font-medium">Lien du client</p>
        <p className="text-muted-foreground">
          Le client le scanne avec son téléphone : il retrouve sa réservation, sa place, et le bouton « J&apos;ai mes
          bagages » pour son retour.
        </p>
        <p className="text-muted-foreground">
          {email ? (
            <>Aussi envoyé à {email}.</>
          ) : (
            <span className="font-medium text-foreground">Pas d&apos;e-mail : c&apos;est son seul accès.</span>
          )}
        </p>
      </div>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
