"use client";

import { ArrowLeftIcon, Loader2Icon, MailCheckIcon, TicketPercentIcon, XIcon } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  resendCodeAction,
  retryPaymentAction,
  submitDetailsAction,
  verifyCodeAction,
  type CodeState,
  type DetailsState,
} from "@/app/(site)/reserver/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { PriceDetails } from "@/components/price-details";
import { SelectField } from "@/components/select-field";
import { StayDatesPicker, type StayDates } from "@/components/stay-dates-picker";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useStayQuote } from "@/components/use-stay-quote";
import { formatEuros, quote } from "@/lib/pricing";
import { parisLocalToDate } from "@/lib/time";

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
};

const UNKNOWN_TERMINAL = "inconnu";
const PASSENGER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  value: String(n),
  label: `${n} passager${n > 1 ? "s" : ""}`,
}));

export function BookingFlow({ parkings, defaultParking, defaultDropoff, defaultReturn, minDay }: Props) {
  const [details, submitDetails, submitting] = useActionState<DetailsState, FormData>(
    submitDetailsAction,
    {},
  );
  const [slug, setSlug] = useState(defaultParking);
  const [dates, setDates] = useState<StayDates>({
    from: defaultDropoff.slice(0, 10),
    to: defaultReturn.slice(0, 10),
    dropoffTime: defaultDropoff.slice(11, 16),
    returnTime: defaultReturn.slice(11, 16),
  });
  const [terminal, setTerminal] = useState(UNKNOWN_TERMINAL);
  const [passengers, setPassengers] = useState("2");
  const [editing, setEditing] = useState(false);
  const [promoInput, setPromoInput] = useState(details.values?.promoCode ?? "");
  const [appliedPromo, setAppliedPromo] = useState(details.values?.promoCode ?? "");

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
    price?.ok ? { parking: slug, dropoffAt: dropoff, returnAt: ret, promoCode: appliedPromo || undefined } : null,
  );
  const charged = server.quote?.ok ? server.quote : null;
  const promoError = charged?.promoError ?? null;

  const verifying = details.pending && !editing;
  // React resets the form after each submit: refill what the customer typed.
  const typed = (name: string) => details.values?.[name] ?? "";
  const fieldError = (name: string) =>
    details.fieldErrors?.[name] ? <FieldError>{details.fieldErrors[name]}</FieldError> : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
      {verifying ? (
        <CodeStep
          key={details.pending!.bookingId}
          bookingId={details.pending!.bookingId}
          email={details.pending!.email}
          onBack={() => setEditing(true)}
        />
      ) : (
        <form
          action={(formData) => {
            setEditing(false);
            submitDetails(formData);
          }}
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
                      ...(parking?.terminals ?? []).map((t) => ({ value: t, label: t })),
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

          <FieldSet>
            <FieldLegend>Vos coordonnées</FieldLegend>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="customerName">Nom complet</FieldLabel>
                <Input id="customerName" name="customerName" required autoComplete="name" defaultValue={typed("customerName")} />
                {fieldError("customerName")}
              </Field>
              <Field>
                <FieldLabel htmlFor="plate">Immatriculation</FieldLabel>
                <Input id="plate" name="plate" required placeholder="AB-123-CD" className="uppercase placeholder:normal-case" defaultValue={typed("plate")} />
                {fieldError("plate")}
              </Field>
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={typed("email")} />
                {fieldError("email")}
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Téléphone</FieldLabel>
                <Input id="phone" name="phone" type="tel" required autoComplete="tel" defaultValue={typed("phone")} />
                {fieldError("phone")}
              </Field>
            </FieldGroup>
          </FieldSet>

          {details.error && (
            <Alert variant="destructive">
              <AlertDescription>{details.error}</AlertDescription>
            </Alert>
          )}
        </form>
      )}

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

          {!verifying && (
            <div className="space-y-1.5">
              {appliedPromo && !promoError ? (
                <p className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
                  <span className="inline-flex items-center gap-1.5">
                    <TicketPercentIcon className="size-4" /> Code {appliedPromo} appliqué
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedPromo("");
                      setPromoInput("");
                    }}
                    className="text-emerald-800/70 hover:text-emerald-900"
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

          {!verifying && (
            <Button
              type="submit"
              form="booking-form"
              size="lg"
              className="w-full"
              disabled={submitting || !charged || server.loading}
            >
              {(submitting || server.loading) && <Loader2Icon className="animate-spin" />}
              Continuer
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Vérification de l&apos;e-mail, puis paiement sécurisé par Stripe (mode test).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CodeStep({ bookingId, email, onBack }: { bookingId: string; email: string; onBack: () => void }) {
  const [state, verify, verifyingCode] = useActionState<CodeState, FormData>(verifyCodeAction, {});
  const [resent, setResent] = useState<CodeState>({});
  const [resending, startResend] = useTransition();
  const [code, setCode] = useState("");
  const message = resent.error ?? resent.info;

  return (
    <Card>
      <CardHeader>
        <MailCheckIcon className="mb-2 size-6 text-primary" />
        <CardTitle>Vérifiez votre e-mail</CardTitle>
        <CardDescription>
          Nous avons envoyé un code à 6 chiffres à <span className="font-medium text-foreground">{email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.retryBookingId ? (
          <RetryPayment bookingId={state.retryBookingId} firstError={state.error} />
        ) : (
        <form action={verify} className="space-y-5">
          <input type="hidden" name="bookingId" value={bookingId} />
          <InputOTP
            name="code"
            maxLength={6}
            value={code}
            onChange={setCode}
            inputMode="numeric"
            pattern="^[0-9]+$"
            autoFocus
            containerClassName="justify-start"
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" size="lg" disabled={verifyingCode || code.length < 6}>
            {verifyingCode && <Loader2Icon className="animate-spin" />}
            Vérifier et payer
          </Button>
        </form>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftIcon /> Modifier mes informations
          </Button>
          <Button
            variant="link"
            size="sm"
            disabled={resending}
            onClick={() => startResend(async () => setResent(await resendCodeAction(bookingId)))}
          >
            Renvoyer le code
          </Button>
          {message && (
            <span className={resent.error ? "text-destructive" : "text-muted-foreground"}>{message}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Shown when Stripe could not start: the e-mail is verified and the spot held, so only payment is retried. */
function RetryPayment({ bookingId, firstError }: { bookingId: string; firstError?: string }) {
  const [state, retry, retrying] = useActionState<CodeState, FormData>(retryPaymentAction, {});
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
