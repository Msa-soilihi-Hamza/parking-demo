import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { BANNER_PROMO_CODE } from "@/lib/promo";
import { getPublicOffer } from "@/server/promo-codes";

const monthName = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "Europe/Paris" });

/**
 * The current offer, above the header. Shown only while the code works (active, in
 * its dates): deactivating it in "Gestion" removes the banner at once.
 */
export async function PromoBanner() {
  await connection();
  const offer = await getPublicOffer(BANNER_PROMO_CODE);
  if (!offer) return null;
  // validUntil is the end of the last day (midnight): its month is the one before.
  const month = offer.validUntil ? monthName.format(new Date(offer.validUntil.getTime() - 1)) : null;

  return (
    <Link
      href={`/reserver?promo=${offer.code}`}
      className="group block bg-neutral-950 text-white transition-colors hover:bg-neutral-900 dark:bg-primary/15 dark:hover:bg-primary/20"
    >
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs sm:text-sm">
        <span>
          {month ? `Tout le mois de ${month}, ` : ""}
          <span className="font-semibold text-primary dark:text-white">{offer.label}</span> sur votre réservation
          avec le code{" "}
          <span className="rounded-sm bg-white/10 px-1.5 py-0.5 font-mono font-medium tracking-wide">{offer.code}</span>
        </span>
        <ArrowRightIcon className="hidden size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block" />
      </p>
    </Link>
  );
}
