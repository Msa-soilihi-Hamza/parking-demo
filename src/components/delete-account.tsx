"use client";

import { Loader2Icon, MailCheckIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * "Supprimer mon compte": Better Auth e-mails a confirmation link; opening it (signed in)
 * deletes the account. Not offered while a stay is under way.
 */
export function DeleteAccount({ email, activeReference }: { email: string; activeReference: string | null }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (activeReference) {
    return (
      <p className="text-sm text-muted-foreground">
        Votre réservation {activeReference} est en cours : vous pourrez supprimer votre compte après votre retour.
      </p>
    );
  }

  if (sent) {
    return (
      <p className="flex items-start gap-2 text-sm">
        <MailCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Un e-mail de confirmation vient de partir à <span className="font-medium">{email}</span>. Ouvrez le lien dans
          ce navigateur, où vous êtes connecté : il est valable 24 heures.
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" className="text-destructive" />}>
          <Trash2Icon /> Supprimer mon compte
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Supprimer votre compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous ne pourrez plus vous connecter avec cet e-mail ni retrouver vos réservations ici. Votre nom, votre
              téléphone et votre immatriculation en seront effacés ; seuls les montants et les dates restent, pour la
              comptabilité. Nous vous envoyons d&apos;abord un e-mail pour confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError("");
                  const { error } = await authClient.deleteUser({ callbackURL: "/compte/supprime" });
                  if (error) setError("La demande n'a pas pu être envoyée. Réessayez.");
                  else setSent(true);
                })
              }
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Recevoir l&apos;e-mail de confirmation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
