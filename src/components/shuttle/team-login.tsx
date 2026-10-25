"use client";

import { Loader2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { teamLoginAction } from "@/app/team-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TeamSpace } from "@/server/team-access";

const TITLES: Record<TeamSpace, { title: string; who: string }> = {
  navette: { title: "Espace navette", who: "Réservé aux chauffeurs" },
  accueil: { title: "Accueil du parking", who: "Réservé à l'accueil" },
  gestion: { title: "Gestion", who: "Réservé au responsable" },
};

export function TeamLogin({ space }: { space: TeamSpace }) {
  const [error, formAction, pending] = useActionState(teamLoginAction, null);
  // Stay on the requested page after login: a QR code scanned at the front desk opens a booking.
  const pathname = usePathname();
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>{TITLES[space].title}</CardTitle>
        <CardDescription>
          {TITLES[space].who}. Code de la démo : <code className="font-mono text-foreground">{space}</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="space" value={space} />
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
