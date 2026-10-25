import { connection } from "next/server";
import { Suspense } from "react";
import { setPromoActiveAction } from "@/app/gestion/actions";
import { Accent, Empty, PageTitle } from "@/components/shuttle/shuttle-ui";
import { PromoCodeForm } from "@/components/shuttle/promo-code-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { promoLabel } from "@/lib/promo";
import { cn } from "@/lib/utils";
import { listPromoCodes, type PromoRow, type PromoStatus } from "@/server/promo-codes";
import { hasAccess } from "@/server/team-access";

const STATUS: Record<PromoStatus, { label: string; style: string }> = {
  active: { label: "Actif", style: "bg-emerald-50 text-emerald-700" },
  scheduled: { label: "Pas encore valable", style: "bg-muted text-muted-foreground" },
  expired: { label: "Expiré", style: "bg-muted text-muted-foreground" },
  exhausted: { label: "Épuisé", style: "bg-amber-50 text-amber-700" },
  inactive: { label: "Désactivé", style: "bg-primary/10 text-primary" },
};

const dayFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", year: "numeric" });

export default function PromoCodesPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto mt-12 h-96 max-w-5xl" />}>
      <PromoCodes />
    </Suspense>
  );
}

async function PromoCodes() {
  await connection();
  if (!(await hasAccess("gestion"))) return null;

  const now = new Date();
  const codes = await listPromoCodes(now);
  const active = codes.filter((c) => c.status === "active").length;

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
      <PageTitle eyebrow="Gestion">
        {active} code{active > 1 ? "s" : ""} promo <Accent>actif{active > 1 ? "s" : ""}.</Accent>
      </PageTitle>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau code</CardTitle>
        </CardHeader>
        <CardContent>
          <PromoCodeForm now={now.getTime()} />
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="font-medium">Tous les codes</h2>
        {codes.length === 0 ? (
          <Empty>Aucun code pour l&apos;instant.</Empty>
        ) : (
          <ul className="divide-y">
            {codes.map((code) => (
              <CodeRow key={code.id} code={code} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CodeRow({ code }: { code: PromoRow }) {
  const status = STATUS[code.status];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-semibold">{code.code}</span>
          <span className="text-sm font-medium">{promoLabel(code)}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", status.style)}>
            {status.label}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {/* validUntil is the instant it stops (midnight): the last valid day is the one before. */}
          {code.validUntil
            ? `Jusqu'au ${dayFormat.format(new Date(code.validUntil.getTime() - 1))} inclus`
            : "Sans date de fin"}{" "}
          ·{" "}
          {code.uses} utilisation{code.uses > 1 ? "s" : ""}
          {code.maxUses !== null && ` sur ${code.maxUses}`}
          {code.description && ` · ${code.description}`}
        </p>
      </div>
      {/* Stop a leaked code at once; bring it back if it was a mistake. */}
      <form action={setPromoActiveAction}>
        <input type="hidden" name="id" value={code.id} />
        <input type="hidden" name="active" value={code.active ? "false" : "true"} />
        <Button type="submit" variant={code.active ? "outline" : "ghost"} size="sm">
          {code.active ? "Désactiver" : "Réactiver"}
        </Button>
      </form>
    </li>
  );
}
