"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { markBagsReadyAction } from "@/app/reservation/actions";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

type Props = {
  token: string;
  terminals: string[];
  defaultTerminal: string | null;
  passengers: number;
};

export function BagsForm({ token, terminals, defaultTerminal, passengers }: Props) {
  const [terminal, setTerminal] = useState(defaultTerminal ?? "");
  return (
    <form action={markBagsReadyAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field>
        <FieldLabel htmlFor="terminal">Votre terminal d&apos;arrivée</FieldLabel>
        <SelectField
          id="terminal"
          name="terminal"
          value={terminal}
          onValueChange={setTerminal}
          placeholder="Choisissez votre terminal"
          options={terminals.map((t) => ({ value: t, label: t }))}
        />
        <FieldDescription>
          La navette vient chercher {passengers} passager{passengers > 1 ? "s" : ""} au point navette du terminal.
        </FieldDescription>
      </Field>
      <SubmitButton disabled={!terminal} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled} className="h-12 w-full text-base">
      {pending && <Loader2Icon className="animate-spin" />}
      J&apos;ai mes bagages
    </Button>
  );
}
