"use client";

import { Loader2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { shuttleLoginAction } from "@/app/navette/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ShuttleLogin() {
  const [error, formAction, pending] = useActionState(shuttleLoginAction, null);
  // Stay on the requested page after login: a QR code scanned at the front desk opens a booking.
  const pathname = usePathname();
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>Espace navette</CardTitle>
        <CardDescription>
          Réservé à l&apos;équipe. Code de la démo : <code className="font-mono text-foreground">navette</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={pathname} />
          <Field>
            <FieldLabel htmlFor="code">Code d&apos;accès</FieldLabel>
            <Input id="code" name="code" type="password" required autoFocus />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Entrer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
