"use client";

import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { useActionState, useState } from "react";
import { createPromoCodeAction, type PromoFormState } from "@/app/gestion/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormValidation } from "@/components/use-form-validation";
import { MAX_VALIDITY_DAYS } from "@/lib/promo";
import { cn } from "@/lib/utils";
import { promoCodeSchema } from "@/lib/validation";

const DURATION_PRESETS = [7, 30, 90];

const lastDay = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * "Nouveau code": name, discount, validity in days from today, optional use limit.
 * `now` comes from the server, for the "valid until" preview.
 */
export function PromoCodeForm({ now }: { now: number }) {
  const [state, formAction, pending] = useActionState<PromoFormState, FormData>(createPromoCodeAction, {});
  const typed = (name: string, fallback = "") => state.values?.[name] ?? fallback;
  const check = useFormValidation(promoCodeSchema, state.fieldErrors);
  const fieldError = (name: string) => {
    const message = check.errorFor(name);
    return message ? <FieldError>{message}</FieldError> : null;
  };
  const invalid = (name: string) => Boolean(check.errorFor(name));

  const [kind, setKind] = useState<"percent" | "amount">(typed("kind", "percent") === "amount" ? "amount" : "percent");
  const [days, setDays] = useState(typed("validDays", "30"));
  const dayCount = Number(days);
  const validDays = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= MAX_VALIDITY_DAYS;

  return (
    <form action={formAction} onSubmit={check.onSubmit} onInput={check.onInput} noValidate className="space-y-6">
      {state.created && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          <CircleCheckIcon className="size-4" /> Code <span className="font-mono font-semibold">{state.created}</span> créé :
          il marche dès maintenant sur la page de réservation.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="code">Code</FieldLabel>
          <Input
            id="code"
            name="code"
            required
            maxLength={20}
            aria-invalid={invalid("code")}
            placeholder="NOEL15"
            defaultValue={state.created ? "" : typed("code")}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase placeholder:normal-case"
          />
          <FieldDescription>3 à 20 lettres ou chiffres. C&apos;est ce que le client tape.</FieldDescription>
          {fieldError("code")}
        </Field>

        <Field>
          <FieldLabel htmlFor={kind === "percent" ? "percent" : "amount"}>Réduction</FieldLabel>
          <input type="hidden" name="kind" value={kind} />
          <div className="flex gap-2">
            <div className="inline-flex shrink-0 rounded-lg border p-0.5 text-sm">
              {(["percent", "amount"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md px-3 py-1.5 transition",
                    kind === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "percent" ? "%" : "€"}
                </button>
              ))}
            </div>
            {kind === "percent" ? (
              <Input
                key="percent"
                id="percent"
                name="percent"
                inputMode="numeric"
                required
                maxLength={3}
                aria-invalid={invalid("percent")}
                placeholder="15"
                defaultValue={typed("percent")}
              />
            ) : (
              <Input
                key="amount"
                id="amount"
                name="amount"
                inputMode="decimal"
                required
                maxLength={7}
                aria-invalid={invalid("amount")}
                placeholder="5,00"
                defaultValue={typed("amount")}
              />
            )}
          </div>
          <FieldDescription>{kind === "percent" ? "Pourcentage du prix, de 1 à 100." : "Montant en euros déduit du prix."}</FieldDescription>
          {fieldError(kind === "percent" ? "percent" : "amount")}
        </Field>

        <Field>
          <FieldLabel htmlFor="validDays">Valable pendant</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Input
                id="validDays"
                name="validDays"
                inputMode="numeric"
                required
                maxLength={3}
                aria-invalid={invalid("validDays")}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">jours</span>
            </div>
            {DURATION_PRESETS.map((n) => (
              <Button
                key={n}
                type="button"
                variant={days === String(n) ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDays(String(n))}
              >
                {n} j
              </Button>
            ))}
          </div>
          <FieldDescription className="first-letter:uppercase">
            {validDays
              ? `À partir d'aujourd'hui, jusqu'au ${lastDay.format(new Date(now + (dayCount - 1) * 86_400_000))} inclus.`
              : `De 1 à ${MAX_VALIDITY_DAYS} jours.`}
          </FieldDescription>
          {fieldError("validDays")}
        </Field>

        <Field>
          <FieldLabel htmlFor="maxUses">Nombre d&apos;utilisations (facultatif)</FieldLabel>
          <Input
            id="maxUses"
            name="maxUses"
            inputMode="numeric"
            maxLength={6}
            aria-invalid={invalid("maxUses")}
            placeholder="Illimité"
            defaultValue={typed("maxUses")}
            className="w-32"
          />
          <FieldDescription>Par exemple 50 pour une offre limitée. Vide : illimité.</FieldDescription>
          {fieldError("maxUses")}
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="description">Note interne (facultatif)</FieldLabel>
          <Input
            id="description"
            name="description"
            maxLength={80}
            aria-invalid={invalid("description")}
            placeholder="Vacances de Noël"
            defaultValue={typed("description")}
          />
          {fieldError("description")}
        </Field>
      </div>

      {state.error && !state.fieldErrors && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" size="lg" disabled={pending || !validDays}>
        {pending && <Loader2Icon className="animate-spin" />}
        Créer le code
      </Button>
    </form>
  );
}
