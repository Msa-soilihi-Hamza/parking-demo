"use client";

import { Loader2Icon, LogOutIcon, TicketPercentIcon, UserRoundIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { retryPaymentAction, submitDetailsAction, type DetailsState } from "@/app/(site)/reserver/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { PriceDetails } from "@/components/price-details";
import { SignInPanel } from "@/components/sign-in-panel";
import { SelectField } from "@/components/select-field";
import { StayDatesPicker, type StayDates } from "@/components/stay-dates-picker";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useFormValidation } from "@/components/use-form-validation";
import { useStayQuote } from "@/components/use-stay-quote";
import { authClient } from "@/lib/auth-client";
import { formatEuros, quote } from "@/lib/pricing";
import { parisLocalToDate } from "@/lib/time";
import { bookingDetailsSchema } from "@/lib/validation";

export type ParkingOption = {
  slug: string;
  name: string;
  airport: string;
  dailyRateCents: number;
  terminals: string[];
};

type Props = {
  parkings: ParkingOption[];
  defaultParking: string;
  /** "2026-10-20T08:00" in Paris time */
  defaultDropoff: string;
  defaultReturn: string;
  /** First bookable day, "2026-10-20" */
  minDay: string;
  /** Promo code carried in the URL (back from Google sign-in) */
  defaultPromo: string;
  /** The signed-in customer, or null: booking requires an account. */
  customer: { name: string; email: string } | null;
  googleEnabled: boolean;
};

const UNKNOWN_TERMINAL = "inconnu";
const PASSENGER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  value: String(n),
  label: `${n} passager${n > 1 ? "s" : ""}`,
}));

export function BookingFlow({
  parkings,
  defaultParking,
  defaultDropoff,
  defaultReturn,
  minDay,
  defaultPromo,
  customer,
  googleEnabled,
}: Props) {
  const router = useRouter();
  const signInRef = useRef<HTMLDivElement>(null);
  const [details, submitDetails, submitting] = useActionState<DetailsState, FormData>(submitDetailsAction, {});
  const check = useFormValidation(bookingDetailsSchema, details.fieldErrors);
  const [slug, setSlug] = useState(defaultParking);
  const [dates, setDates] = useState<StayDates>({
    from: defaultDropoff.slice(0, 10),
    to: defaultReturn.slice(0, 10),
    dropoffTime: defaultDropoff.slice(11, 16),
    returnTime: defaultReturn.slice(11, 16),
  });
  const [terminal, setTerminal] = useState(UNKNOWN_TERMINAL);
  const [passengers, setPassengers] = useState("2");
  const [promoInput, setPromoInput] = useState(details.values?.promoCode ?? defaultPromo);
  const [appliedPromo, setAppliedPromo] = useState(details.values?.promoCode ?? defaultPromo);

  // The session ended while the form was open: show the sign-in again.
  useEffect(() => {
    if (details.signInRequired) router.refresh();
  }, [details, router]);

  const parking = parkings.find((p) => p.slug === slug);
  const dropoff = `${dates.from}T${dates.dropoffTime}`;
  const ret = dates.to ? `${dates.to}T${dates.returnTime}` : "";

  // Same pure function as the server: the price shown is the price charged.
  const price = useMemo(() => {
    const from = parisLocalToDate(dropoff);
    const to = parisLocalToDate(ret);
    if (!parking || !from || !to) return null;
    return quote(parking.dailyRateCents, from, to);
  }, [parking, dropoff, ret]);

  // The price as charged comes from the server: it depends on how full the parking is.
  const server = useStayQuote(
    price?.ok
      ? {
          parking: slug,
          dropoffAt: dropoff,
          returnAt: ret,
          promoCode: appliedPromo || undefined,
        }
      : null,
  );
  const charged = server.quote?.ok ? server.quote : null;
  const promoError = charged?.promoError ?? null;

  // Google brings the customer back here with their choices, so nothing is retyped.
  const callbackURL = `/reserver?${new URLSearchParams({
    parking: slug,
    dropoffAt: dropoff,
    returnAt: ret,
    ...(appliedPromo ? { promo: appliedPromo } : {}),
  })}`;
  // React resets the form after each submit: refill what the customer typed.
  const typed = (name: string) => details.values?.[name] ?? "";
  const fieldError = (name: string) => {
    const message = check.errorFor(name);
    return message ? <FieldError>{message}</FieldError> : null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
      <div className="space-y-8">
        <form
          action={submitDetails}
          onSubmit={check.onSubmit}
          onInput={check.onInput}
          noValidate
          id="booking-form"
          className="space-y-8"
        >
          <FieldSet>
            <FieldLegend>Votre séjour</FieldLegend>
            <FieldGroup>
              <RadioGroup
                name="parking"
                value={slug}
                onValueChange={(value) => {
                  setSlug(String(value));
                  setTerminal(UNKNOWN_TERMINAL);
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                {parkings.map((p) => (
                  <FieldLabel
                    key={p.slug}
                    htmlFor={`parking-${p.slug}`}
                    className="flex w-full cursor-pointer items-start gap-3 rounded-lg border p-4 has-data-checked:border-primary has-data-checked:bg-primary/5"
                  >
                    <RadioGroupItem id={`parking-${p.slug}`} value={p.slug} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {p.airport} · dès {formatEuros(p.dailyRateCents)}/jour
                      </span>
                    </span>
                  </FieldLabel>
                ))}
              </RadioGroup>

              <StayDatesPicker value={dates} onChange={setDates} minDay={minDay} />
              {fieldError("dropoffAt")}
              {fieldError("returnAt")}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="returnTerminal">Terminal d&apos;arrivée</FieldLabel>
                  <SelectField
                    id="returnTerminal"
                    name="returnTerminal"
                    value={terminal}
                    onValueChange={setTerminal}
                    options={[
                      { value: UNKNOWN_TERMINAL, label: "Pas encore connu" },
                      ...(parking?.terminals ?? []).map((t) => ({
                        value: t,
                        label: t,
                      })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="passengers">Passagers au retour</FieldLabel>
                  <SelectField
                    id="passengers"
                    name="passengers"
                    value={passengers}
                    onValueChange={setPassengers}
                    options={PASSENGER_OPTIONS}
                  />
                </Field>
              </div>
            </FieldGroup>
          </FieldSet>

          <Separator />

          {customer ? (
            <FieldSet>
              <FieldLegend>Vos coordonnées</FieldLegend>
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2">
                  <UserRoundIcon className="size-4 text-muted-foreground" />
                  Connecté : <span className="font-medium">{customer.email}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await authClient.signOut();
                    router.refresh();
                  }}
                >
                  <LogOutIcon /> Changer de compte
                </Button>
              </p>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="customerName">Nom complet</FieldLabel>
                  <Input
                    id="customerName"
                    name="customerName"
                    required
                    maxLength={80}
                    autoComplete="name"
                    aria-invalid={Boolean(check.errorFor("customerName"))}
                    defaultValue={typed("customerName") || customer.name}
                  />
                  {fieldError("customerName")}
                </Field>
                <Field>
                  <FieldLabel htmlFor="phone">Téléphone</FieldLabel>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    maxLength={20}
                    autoComplete="tel"
                    aria-invalid={Boolean(check.errorFor("phone"))}
                    defaultValue={typed("phone")}
                  />
                  {fieldError("phone")}
                </Field>
                <Field>
                  <FieldLabel htmlFor="plate">Immatriculation</FieldLabel>
                  <Input
                    id="plate"
                    name="plate"
                    required
                    maxLength={12}
                    placeholder="AB-123-CD"
                    autoComplete="off"
                    aria-invalid={Boolean(check.errorFor("plate"))}
                    className="uppercase placeholder:normal-case"
                    defaultValue={typed("plate")}
                  />
                  {fieldError("plate")}
                </Field>
              </FieldGroup>
            </FieldSet>
          ) : null}

          {details.error && !details.retryBookingId && (
            <Alert variant="destructive">
              <AlertDescription>{details.error}</AlertDescription>
            </Alert>
          )}
        </form>

        {/* Outside the booking form: forms cannot be nested (Enter would submit the booking). */}
        {!customer && (
          <div ref={signInRef} id="connexion" className="scroll-mt-24 space-y-4 rounded-xl border p-5">
            <div>
              <p className="font-medium">Connectez-vous pour réserver</p>
              <p className="text-sm text-muted-foreground">
                Votre compte regroupe vos réservations dans « Mon espace ». Pas de compte ? Il est créé en même temps.
              </p>
            </div>
            <SignInPanel googleEnabled={googleEnabled} callbackURL={callbackURL} />
          </div>
        )}
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardDescription>Total</CardDescription>
          <CardTitle
            className={`text-3xl font-semibold tracking-tight tabular-nums transition-opacity ${server.loading ? "opacity-40" : ""}`}
          >
            {charged ? formatEuros(charged.totalCents) : price?.ok ? formatEuros(price.totalCents) : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {price?.ok ? (
            <>
              <p className="text-muted-foreground">
                {price.days} jour{price.days > 1 ? "s" : ""} · navette aller-retour incluse
              </p>
              {charged && parking && <PriceDetails quote={charged} dailyRateCents={parking.dailyRateCents} />}
              {server.quote && !server.quote.ok && <p className="text-destructive">{server.quote.error}</p>}
            </>
          ) : (
            <p className="text-destructive">{price && !price.ok ? price.error : "Choisissez la date de retour."}</p>
          )}

          {!details.retryBookingId && (
            <div className="space-y-1.5">
              {appliedPromo && !promoError ? (
                <p className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-emerald-800 dark:text-emerald-200">
                  <span className="inline-flex items-center gap-1.5">
                    <TicketPercentIcon className="size-4" /> Code {appliedPromo} appliqué
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedPromo("");
                      setPromoInput("");
                    }}
                    className="text-emerald-800/70 dark:text-emerald-200/70 hover:text-emerald-900 dark:hover:text-emerald-100"
                    aria-label="Retirer le code promo"
                  >
                    <XIcon className="size-4" />
                  </button>
                </p>
              ) : (
                <div className="flex gap-2">
                  <Input
                    aria-label="Code promo"
                    placeholder="Code promo"
                    maxLength={20}
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter applies the code instead of submitting the booking.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setAppliedPromo(promoInput.trim().toUpperCase());
                      }
                    }}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    className="uppercase placeholder:normal-case"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!promoInput.trim()}
                    onClick={() => setAppliedPromo(promoInput.trim().toUpperCase())}
                  >
                    Appliquer
                  </Button>
                </div>
              )}
              {promoError && <p className="text-destructive">{promoError}</p>}
            </div>
          )}
          {/* Only a code the server accepted goes with the booking. */}
          <input type="hidden" name="promoCode" form="booking-form" value={charged?.promo ? appliedPromo : ""} />

          {details.retryBookingId ? (
            <RetryPayment bookingId={details.retryBookingId} firstError={details.error} />
          ) : customer ? (
            <Button
              type="submit"
              form="booking-form"
              size="lg"
              className="w-full"
              disabled={submitting || !charged || server.loading}
            >
              {(submitting || server.loading) && <Loader2Icon className="animate-spin" />}
              Payer {charged ? formatEuros(charged.totalCents) : ""}
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                signInRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
                signInRef.current?.querySelector<HTMLElement>("input, button")?.focus();
              }}
            >
              Continuer
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Compte obligatoire (Google ou code par e-mail), puis paiement sécurisé par Stripe (mode test).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Shown when Stripe could not start: the spot is held, so only payment is retried. */
function RetryPayment({ bookingId, firstError }: { bookingId: string; firstError?: string }) {
  const [state, retry, retrying] = useActionState<DetailsState, FormData>(retryPaymentAction, {});
  return (
    <form action={retry} className="space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-sm text-destructive">{state.error ?? firstError}</p>
      {(state.retryBookingId ?? !state.error) && (
        <Button type="submit" size="lg" disabled={retrying}>
          {retrying && <Loader2Icon className="animate-spin" />}
          Réessayer le paiement
        </Button>
      )}
    </form>
  );
}
