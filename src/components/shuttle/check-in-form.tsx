"use client";

import { CarIcon, Loader2Icon } from "lucide-react";
import { useActionState } from "react";
import { checkInVehicleAction, type CheckInState } from "@/app/navette/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** "Véhicule déposé": the spot is required, the time is the server's. */
export function CheckInForm({ reference }: { reference: string }) {
  const [state, formAction, pending] = useActionState<CheckInState, FormData>(checkInVehicleAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <Field>
        <FieldLabel htmlFor="spot">Place de parking</FieldLabel>
        <Input
          id="spot"
          name="spot"
          placeholder="B12"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={8}
          className="h-12 max-w-40 font-mono text-lg uppercase"
        />
        <FieldDescription>Telle qu&apos;elle est peinte au sol. L&apos;heure est notée automatiquement.</FieldDescription>
        {state.error && <FieldError>{state.error}</FieldError>}
      </Field>
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CarIcon />}
        Véhicule déposé
      </Button>
    </form>
  );
}
