"use client";

import { CarIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { checkInVehicleAction, type CheckInState } from "@/app/accueil/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * "Véhicule déposé": the first free spot is already filled in, the agent can change it.
 * The time is the server's.
 */
export function CheckInForm({
  reference,
  suggested,
  planHref,
}: {
  reference: string;
  suggested: string | null;
  planHref: string;
}) {
  const [state, formAction, pending] = useActionState<CheckInState, FormData>(checkInVehicleAction, {});
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <Field>
        <FieldLabel htmlFor="spot">Place de parking</FieldLabel>
        <Input
          // A new suggestion (another desk took the spot) refills the field.
          key={suggested ?? "plein"}
          id="spot"
          name="spot"
          placeholder="B12"
          defaultValue={state.spot ?? suggested ?? ""}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={8}
          className="h-12 max-w-40 font-mono text-lg uppercase"
        />
        <FieldDescription>
          {suggested ? "Première place libre, proposée automatiquement. " : "Aucune place libre dans ce parking. "}
          <Link href={planHref} className="underline underline-offset-4 hover:text-foreground">
            Voir le plan
          </Link>
        </FieldDescription>
        {state.error && <FieldError>{state.error}</FieldError>}
      </Field>
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <CarIcon />}
        Véhicule déposé
      </Button>
    </form>
  );
}
