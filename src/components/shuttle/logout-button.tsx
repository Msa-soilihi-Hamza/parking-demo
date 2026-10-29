"use client";

import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
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
import { forgetThisDevice } from "@/components/shuttle/push-toggle";
import { authClient } from "@/lib/auth-client";
import type { TeamSpace } from "@/lib/permissions";

const LOST: Record<TeamSpace, string> = {
  navette: "Vous ne verrez plus les demandes des clients sur cet appareil.",
  accueil: "Vous ne pourrez plus enregistrer de véhicules sur cet appareil.",
  gestion: "Vous ne pourrez plus gérer les codes promo sur cet appareil.",
};

/** "Déconnexion" asks for confirmation first: nobody mid-shift should lose their screen by mistake. */
export function LogoutButton({ space }: { space: TeamSpace }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <LogOutIcon /> <span className="hidden lg:inline">Déconnexion</span>
        <span className="sr-only lg:hidden">Déconnexion</span>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-primary/10 text-primary">
            <LogOutIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Se déconnecter ?</AlertDialogTitle>
          <AlertDialogDescription>{LOST[space]} Il faudra vous reconnecter pour revenir.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="w-full"
            onClick={() =>
              startTransition(async () => {
                // As the dialog says: no more customer requests on this device.
                await forgetThisDevice().catch((error) => console.error("Push unsubscribe failed", error));
                await authClient.signOut();
                router.push("/");
                router.refresh();
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Se déconnecter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
