import { ArrowLeftIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrivalSearch } from "@/components/shuttle/arrival-search";
import { CheckInForm } from "@/components/shuttle/check-in-form";
import { Accent, PageTitle } from "@/components/shuttle/shuttle-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeReference } from "@/lib/arrival";
import { formatDateTime, formatTime, parisDay } from "@/lib/time";
import { getBookingByReference } from "@/server/bookings";
import { hasShuttleAccess } from "@/server/shuttle-access";

export default function ArrivalPage(props: PageProps<"/navette/accueil/[reference]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-3xl" />}>
      <Arrival params={props.params} />
    </Suspense>
  );
}

async function Arrival({ params }: Pick<PageProps<"/navette/accueil/[reference]">, "params">) {
  await connection();
  if (!(await hasShuttleAccess())) return null;

  const reference = normalizeReference((await params).reference);
  const found = reference ? await getBookingByReference(reference) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6">
      <Link href="/navette/accueil" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
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
        <Details {...found} />
      )}
    </div>
  );
}

function Details({ booking, parking }: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>) {
  const paid = booking.status === "confirmed";
  const today = parisDay(new Date());
  const otherDay = parisDay(booking.dropoffAt) !== today;

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
        <Item label="Arrivée prévue" value={formatDateTime(booking.dropoffAt)} />
        <Item
          label="Retour"
          value={`${formatDateTime(booking.returnAt)}${booking.returnTerminal ? ` · ${booking.returnTerminal}` : ""}`}
        />
        <Item label="Passagers" value={String(booking.passengers)} />
        <div>
          <dt className="text-muted-foreground">Téléphone</dt>
          <dd>
            <a href={`tel:${booking.phone.replace(/\s/g, "")}`} className="font-medium hover:underline">
              {booking.phone}
            </a>
          </dd>
        </div>
        <Item label="Paiement" value={paid ? "Payée" : "Non payée"} />
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
            <CheckInForm reference={booking.reference} />
          </div>
        )
      )}
    </div>
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
