import { connection } from "next/server";
import { Suspense } from "react";
import { Accent, PageTitle } from "@/components/shuttle/shuttle-ui";
import { WalkInForm } from "@/components/shuttle/walk-in-form";
import { Skeleton } from "@/components/ui/skeleton";
import { dateToParisLocal, parisDay } from "@/lib/time";
import { listParkings, suggestSpot } from "@/server/bookings";
import { hasAccess } from "@/server/team-access";

const DAY = 24 * 60 * 60 * 1000;

export default function WalkInPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <WalkIn />
    </Suspense>
  );
}

async function WalkIn() {
  await connection();
  if (!(await hasAccess("accueil"))) return null;

  const now = new Date();
  const parkings = await listParkings();
  // A sensible starting point: back in 3 days, in the evening.
  const defaultReturn = `${dateToParisLocal(new Date(now.getTime() + 3 * DAY)).slice(0, 10)}T18:00`;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <PageTitle eyebrow="Sans réservation">
          Nouveau <Accent>client.</Accent>
        </PageTitle>
        <p className="max-w-2xl text-muted-foreground">
          Le client arrive sans avoir réservé et paie sur place. Il profite du même service : sa place est
          garantie, et il prévient la navette d&apos;un bouton à son retour.
        </p>
      </div>
      <WalkInForm
        parkings={await Promise.all(
          parkings.map(async (p) => ({
            slug: p.slug,
            name: p.name,
            dailyRateCents: p.dailyRateCents,
            terminals: p.terminals,
            // The first free spot of each parking, offered when it is selected.
            suggestedSpot: await suggestSpot(p),
          })),
        )}
        defaultReturn={defaultReturn}
        today={parisDay(now)}
        now={dateToParisLocal(now)}
      />
    </div>
  );
}
