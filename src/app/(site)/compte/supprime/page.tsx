import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Compte supprimé · Escale Parking" };

// Where Better Auth sends the customer once the deletion link has been opened.
export default function AccountDeletedPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-20 text-center sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Compte supprimé</h1>
      <p className="text-muted-foreground">
        Votre compte et vos connexions ont été supprimés. Vos réservations ne portent plus votre nom, votre téléphone
        ni votre immatriculation.
      </p>
      <Button render={<Link href="/" />} nativeButton={false}>
        Retour à l&apos;accueil
      </Button>
    </div>
  );
}
