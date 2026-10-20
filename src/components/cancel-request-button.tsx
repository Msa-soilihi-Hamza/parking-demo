"use client";

import { Loader2Icon, Undo2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { cancelPickupRequestAction } from "@/app/(site)/reservation/actions";
import { Button } from "@/components/ui/button";

/** "Annuler ma demande": undo a mistaken press while no driver has left yet. */
export function CancelRequestButton({ token }: { token: string }) {
  return (
    <form action={cancelPickupRequestAction}>
      <input type="hidden" name="token" value={token} />
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} className="w-full">
      {pending ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />}
      Annuler ma demande
    </Button>
  );
}
