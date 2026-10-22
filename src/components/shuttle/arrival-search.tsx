"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useActionState } from "react";
import { findArrivalAction } from "@/app/navette/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** When the customer has no QR code at hand: the reference typed by the employee. */
export function ArrivalSearch({ autoFocus }: { autoFocus?: boolean }) {
  const [error, formAction, pending] = useActionState(findArrivalAction, null);
  return (
    <form action={formAction} className="max-w-md">
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
