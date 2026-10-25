"use client";

import { CalendarIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { fr } from "react-day-picker/locale";
import { createWalkInAction, type WalkInState } from "@/app/accueil/actions";
import { SelectField } from "@/components/select-field";
import { TimeSelect } from "@/components/stay-dates-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { PriceDetails } from "@/components/price-details";
import { useStayQuote } from "@/components/use-stay-quote";
import { formatEuros } from "@/lib/pricing";

export type DeskParking = {
  slug: string;
  name: string;
  dailyRateCents: number;
  terminals: string[];
  suggestedSpot: string | null;
};

const UNKNOWN_TERMINAL = "inconnu";
const PASSENGER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
  value: String(n),
  label: `${n} passager${n > 1 ? "s" : ""}`,
}));

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const longDay = (s: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(fromDay(s));

/**
 * A customer at the desk without booking: the car is dropped now, so only the return
 * is asked. The price uses the same pure function as the server.
 */
export function WalkInForm({
  parkings,
  defaultReturn,
  today,
  now,
}: {
  parkings: DeskParking[];
  /** "2026-10-25T14:20": the drop-off, which is now (Paris time) */
  now: string;
  /** "2026-10-28T18:00" in Paris time */
  defaultReturn: string;
  /** "2026-10-25": the first day the return can be */
  today: string;
}) {
  const [state, formAction, pending] = useActionState<WalkInState, FormData>(createWalkInAction, {});
  const typed = (name: string) => state.values?.[name] ?? "";
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? <FieldError>{state.fieldErrors[name]}</FieldError> : null;

  const [slug, setSlug] = useState(state.values?.parking ?? parkings[0]?.slug ?? "");
  const suggestionFor = (parkingSlug: string) => parkings.find((p) => p.slug === parkingSlug)?.suggestedSpot ?? "";
  const [spot, setSpot] = useState(state.values?.spot ?? suggestionFor(slug));
  const [day, setDay] = useState((state.values?.returnAt ?? defaultReturn).slice(0, 10));
  const [time, setTime] = useState((state.values?.returnAt ?? defaultReturn).slice(11, 16));
  const [terminal, setTerminal] = useState(UNKNOWN_TERMINAL);
  const [passengers, setPassengers] = useState("2");
  const [paid, setPaid] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const parking = parkings.find((p) => p.slug === slug);
  const returnAt = `${day}T${time}`;
  // The server's price from now to the return: demand included, as online.
  const server = useStayQuote(parking ? { parking: slug, dropoffAt: now, returnAt } : null);
  const price = server.quote;

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
      <div className="space-y-8">
        <FieldSet>
          <FieldLegend>Séjour</FieldLegend>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="parking">Parking</FieldLabel>
                <SelectField
                  id="parking"
                  name="parking"
                  value={slug}
                  onValueChange={(value) => {
                    setSlug(value);
                    setTerminal(UNKNOWN_TERMINAL);
                    setSpot(suggestionFor(value));
                  }}
                  options={parkings.map((p) => ({ value: p.slug, label: p.name }))}
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Jour du retour</FieldLabel>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger
                    render={
                      <Button variant="outline" className="w-full justify-start font-normal first-letter:uppercase">
                        <CalendarIcon className="text-muted-foreground" />
                        {longDay(day)}
                      </Button>
                    }
                  />
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={fr}
                      selected={fromDay(day)}
                      defaultMonth={fromDay(day)}
                      disabled={{ before: fromDay(today) }}
                      onSelect={(date) => {
                        if (!date) return;
                        setDay(toDay(date));
                        setCalendarOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </Field>
              <Field>
                <FieldLabel htmlFor="returnTime">Atterrissage retour</FieldLabel>
                <TimeSelect id="returnTime" label="Atterrissage retour" value={time} onChange={setTime} />
              </Field>
            </div>
            <input type="hidden" name="returnAt" value={returnAt} />
            {fieldError("returnAt")}

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
          </FieldGroup>
        </FieldSet>

        <Separator />

        <FieldSet>
          <FieldLegend>Client et véhicule</FieldLegend>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="customerName">Nom complet</FieldLabel>
              <Input id="customerName" name="customerName" required defaultValue={typed("customerName")} />
              {fieldError("customerName")}
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Téléphone</FieldLabel>
              <Input id="phone" name="phone" type="tel" required defaultValue={typed("phone")} />
              {fieldError("phone")}
            </Field>
            <Field>
              <FieldLabel htmlFor="email">E-mail (facultatif)</FieldLabel>
              <Input id="email" name="email" type="email" defaultValue={typed("email")} />
              <FieldDescription>Pour lui envoyer le lien de sa réservation.</FieldDescription>
              {fieldError("email")}
            </Field>
            <Field>
              <FieldLabel htmlFor="plate">Immatriculation</FieldLabel>
              <Input
                id="plate"
                name="plate"
                required
                placeholder="AB-123-CD"
                className="font-mono uppercase placeholder:normal-case"
                defaultValue={typed("plate")}
              />
              {fieldError("plate")}
            </Field>
            <Field>
              <FieldLabel htmlFor="spot">Place de parking</FieldLabel>
              <Input
                id="spot"
                name="spot"
                required
                maxLength={8}
                placeholder="B12"
                autoCapitalize="characters"
                autoComplete="off"
                className="font-mono uppercase"
                value={spot}
                onChange={(e) => setSpot(e.target.value)}
              />
              <FieldDescription>
                {parking?.suggestedSpot
                  ? "Première place libre, proposée automatiquement. "
                  : "Aucune place libre dans ce parking. "}
                <Link href={`/accueil/plan?parking=${slug}`} className="underline underline-offset-4 hover:text-foreground">
                  Voir le plan
                </Link>
              </FieldDescription>
              {fieldError("spot")}
            </Field>
          </FieldGroup>
        </FieldSet>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardDescription>À encaisser</CardDescription>
          <CardTitle
            className={`text-3xl font-semibold tracking-tight tabular-nums transition-opacity ${server.loading ? "opacity-40" : ""}`}
          >
            {price?.ok ? formatEuros(price.totalCents) : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {price?.ok ? (
            <>
              <p className="text-muted-foreground">
                {price.days} jour{price.days > 1 ? "s" : ""} à partir de maintenant · navette aller-retour incluse
              </p>
              {parking && <PriceDetails quote={price} dailyRateCents={parking.dailyRateCents} />}
            </>
          ) : (
            <p className="text-destructive">{price && !price.ok ? price.error : "Calcul du prix…"}</p>
          )}

          {paid && <input type="hidden" name="paid" value="on" />}
          <label className="flex items-start gap-3">
            <Checkbox checked={paid} onCheckedChange={(checked) => setPaid(checked === true)} className="mt-0.5" />
            <span>Paiement encaissé (carte ou espèces)</span>
          </label>
          {fieldError("paid")}

          {state.error && !state.fieldErrors && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={pending || server.loading || !price?.ok || !paid}>
            {pending && <Loader2Icon className="animate-spin" />}
            Enregistrer le client
          </Button>
          <p className="text-xs text-muted-foreground">
            Le véhicule est enregistré comme déposé maintenant, à la place indiquée.
          </p>
        </CardContent>
      </Card>
    </form>
  );
}
