import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { PushToggle } from "@/components/shuttle/push-toggle";
import { Accent, ActiveCard, PageTitle, Rows, dayFormat } from "@/components/shuttle/shuttle-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime, parisDayBounds } from "@/lib/time";
import { listActivePickups, listPickedUp, listUpcomingReturns } from "@/server/bookings";
import { vapidPublicKey } from "@/server/push";
import { hasShuttleAccess } from "@/server/shuttle-access";

export default function LivePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <Live />
    </Suspense>
  );
}

async function Live() {
  await connection();
  if (!(await hasShuttleAccess())) return null;

  const now = new Date();
  const today = parisDayBounds(now, 0);
  const [active, pickedUp, next] = await Promise.all([
    listActivePickups(),
    listPickedUp(today.start, today.end),
    listUpcomingReturns(now, today.end),
  ]);
  const waiting = active.filter((r) => r.pickupStatus === "bags_ready").length;

  return (
    <div className="mx-auto max-w-5xl space-y-16 px-4 py-12 sm:px-6">
      <AutoRefresh seconds={5} />

      <section className="space-y-8">
        <PageTitle eyebrow={dayFormat.format(now)} live>
          {waiting === 0 ? (
            <>
              Personne n&apos;attend <Accent>pour l&apos;instant.</Accent>
            </>
          ) : (
            <>
              {waiting} client{waiting > 1 ? "s" : ""} <Accent>vous attend{waiting > 1 ? "ent" : ""}.</Accent>
            </>
          )}
        </PageTitle>
        <PushToggle publicKey={vapidPublicKey()} />
        {active.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((row) => (
              <ActiveCard key={row.id} row={row} now={now} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-12 md:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Prochains atterrissages</h2>
            <Link href="/navette/planning" className="text-sm text-muted-foreground hover:text-foreground">
              Planning <ArrowRightIcon className="inline size-3.5" />
            </Link>
          </div>
          {next.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Plus aucun atterrissage prévu aujourd&apos;hui.</p>
          ) : (
            <Rows
              items={next.slice(0, 4).map((r) => ({
                id: r.id,
                time: formatTime(r.returnAt),
                name: r.customerName,
                detail: r.returnTerminal ?? "terminal ?",
                status: r.pickupStatus,
              }))}
            />
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Ramenés aujourd&apos;hui · {pickedUp.length}</h2>
            <Link href="/navette/historique" className="text-sm text-muted-foreground hover:text-foreground">
              Historique <ArrowRightIcon className="inline size-3.5" />
            </Link>
          </div>
          {pickedUp.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Personne pour l&apos;instant.</p>
          ) : (
            <Rows
              items={pickedUp.slice(0, 4).map((r) => ({
                id: r.id,
                time: formatTime(r.pickedUpAt!),
                name: r.customerName,
                detail: r.returnTerminal ?? "",
                status: r.pickupStatus,
                rating: r.rating,
              }))}
            />
          )}
        </div>
      </section>
    </div>
  );
}
