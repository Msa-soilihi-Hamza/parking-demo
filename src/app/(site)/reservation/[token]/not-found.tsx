import { PhoneIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/contact";

// Shown when a reservation link does not match any booking (mistyped or truncated link).
export default function ReservationNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <p className="text-sm text-muted-foreground">Lien de réservation</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">
        Réservation <span className="font-serif font-normal text-primary italic">introuvable.</span>
      </h1>
      <p className="mt-4 text-muted-foreground">
        Ce lien ne correspond à aucune réservation. Il est peut-être incomplet : ouvrez-le directement depuis
        l&apos;e-mail de confirmation.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button render={<a href={SUPPORT_PHONE_HREF} />} nativeButton={false}>
          <PhoneIcon /> Appeler le {SUPPORT_PHONE}
        </Button>
        <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
          Retour à l&apos;accueil
        </Button>
      </div>
    </div>
  );
}
