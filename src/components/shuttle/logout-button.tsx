"use client";

import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { teamLogoutAction } from "@/app/team-actions";
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
import type { TeamSpace } from "@/server/team-access";

const LOST: Record<TeamSpace, string> = {
  navette: "Vous ne verrez plus les demandes des clients sur cet appareil.",
  accueil: "Vous ne pourrez plus enregistrer de véhicules sur cet appareil.",
  gestion: "Vous ne pourrez plus gérer les codes promo sur cet appareil.",
};

/** "Déconnexion" asks for confirmation first: nobody mid-shift should lose their screen by mistake. */
export function LogoutButton({ space }: { space: TeamSpace }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Déconnexion</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-primary/10 text-primary">
            <LogOutIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Se déconnecter ?</AlertDialogTitle>
          <AlertDialogDescription>
            {LOST[space]} Il faudra saisir le code d&apos;accès pour revenir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <form action={teamLogoutAction}>
            <input type="hidden" name="space" value={space} />
            <ConfirmButton />
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction type="submit" disabled={pending} className="w-full">
      {pending && <Loader2Icon className="animate-spin" />}
      Se déconnecter
    </AlertDialogAction>
  );
}
