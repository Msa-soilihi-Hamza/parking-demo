"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useActionState } from "react";
import { findArrivalAction } from "@/app/accueil/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormValidation } from "@/components/use-form-validation";
import { arrivalSearchSchema } from "@/lib/validation";

/** When the customer has no QR code at hand: the reference typed by the employee. */
export function ArrivalSearch({ autoFocus }: { autoFocus?: boolean }) {
  const [serverError, formAction, pending] = useActionState(findArrivalAction, null);
  const check = useFormValidation(arrivalSearchSchema, serverError ? { reference: serverError } : undefined);
  const error = check.errorFor("reference");
  return (
    <form action={formAction} onSubmit={check.onSubmit} onInput={check.onInput} noValidate className="max-w-md">
      <Field>
        <FieldLabel htmlFor="reference">Référence de la réservation</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="reference"
            name="reference"
            placeholder="ESC-AB12CD"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={20}
            aria-invalid={Boolean(error)}
            autoFocus={autoFocus}
            className="font-mono uppercase"
          />
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
            Ouvrir
          </Button>
        </div>
        {error && <FieldError>{error}</FieldError>}
      </Field>
    </form>
  );
}
