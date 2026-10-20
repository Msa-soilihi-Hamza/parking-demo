import { ArrowRightIcon, CarFrontIcon, LuggageIcon, PlaneTakeoffIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEuros, quote } from "@/lib/pricing";
import { listParkings } from "@/server/bookings";

const STEPS = [
  {
    icon: CarFrontIcon,
    title: "Déposez votre voiture",
    text: "Une navette gratuite vous emmène à votre terminal en quelques minutes.",
  },
  {
    icon: PlaneTakeoffIcon,
    title: "Partez tranquille",
    text: "Votre véhicule reste dans un parking surveillé jour et nuit.",
  },
  {
    icon: LuggageIcon,
    title: "Rentrez sans appeler",
    text: "Bagages récupérés ? Un bouton, et la navette vient vous chercher.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-24">
        <div>
          <Badge variant="secondary">Orly · Roissy-CDG</Badge>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Votre voiture au parking. Votre retour sans coup de fil.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Réservez en deux minutes, prix affiché tout de suite. À votre retour, un seul bouton
            suffit pour que la navette vienne vous chercher.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="h-11 px-5" render={<Link href="/reserver" />} nativeButton={false}>
              Réserver une place <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button size="lg" variant="ghost" className="h-11 px-5" render={<Link href="#fonctionnement" />} nativeButton={false}>
              Comment ça marche
            </Button>
          </div>
        </div>
        <ReturnPreview />
      </section>

      <Separator />

      <section id="fonctionnement" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Comment ça marche</h2>
        <ol className="mt-10 grid gap-10 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <div className="flex items-center gap-3">
                <step.icon className="size-5 text-primary" />
                <span className="text-sm text-muted-foreground tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-medium">{step.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Separator />

      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-20">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Plus besoin d&apos;appeler la navette</h2>
          <p className="mt-4 text-muted-foreground">
            Quand vous atterrissez, l&apos;attente des bagages peut durer de quelques minutes à plus
            d&apos;une heure. Nous ne venons donc pas à l&apos;heure de l&apos;avion, mais quand vous êtes
            prêt : vous appuyez sur « J&apos;ai mes bagages », l&apos;équipe voit votre demande en direct.
          </p>
        </div>
        <ul className="grid gap-6 text-sm">
          <Point title="Pour vous" text="Pas de numéro à chercher ni d'attente au téléphone. Vous suivez l'arrivée de la navette sur votre téléphone." />
          <Point title="Pour l'équipe" text="Les retours du jour sont planifiés par créneau, et chaque demande arrive au bon terminal, avec le nombre de passagers." />
        </ul>
      </section>

      <Separator />

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight">Tarifs</h2>
        <p className="mt-2 text-muted-foreground">
          Navette incluse. Plus vous restez, moins chaque jour coûte : -20 % dès le 4e jour, -40 % dès le 8e.
        </p>
        <Suspense fallback={<Skeleton className="mt-8 h-32 w-full" />}>
          <Prices />
        </Suspense>
      </section>

      <section className="border-t bg-muted/40">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Prêt à partir ?</h2>
            <p className="mt-1 text-muted-foreground">Votre place est confirmée dès le paiement.</p>
          </div>
          <Button size="lg" className="h-11 px-5" render={<Link href="/reserver" />} nativeButton={false}>
            Réserver une place <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground sm:px-6">
        Démo :{" "}
        <Link href="/reservation/demo-retour" className="underline underline-offset-4 hover:text-foreground">
          tester le retour comme un client
        </Link>{" "}
        ·{" "}
        <Link href="/navette" className="underline underline-offset-4 hover:text-foreground">
          écran de l&apos;équipe navette
        </Link>{" "}
        (code <code className="font-mono">navette</code>)
      </section>
    </>
  );
}

function Point({ title, text }: { title: string; text: string }) {
  return (
    <li className="border-l-2 border-primary pl-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{text}</p>
    </li>
  );
}

/** A static picture of the customer's return screen. */
function ReturnPreview() {
  const steps = [
    { label: "Atterri", time: "14:05", done: true },
    { label: "Bagages récupérés", time: "14:32", done: true },
    { label: "Navette en route", time: "14:33", done: true },
    { label: "Pris en charge", time: "", done: false },
  ];
  return (
    <div className="mx-auto w-full max-w-xs rounded-[2rem] border bg-card p-3 shadow-sm" aria-hidden>
      <div className="rounded-[1.5rem] border p-5">
        <p className="text-xs text-muted-foreground">Votre retour · Terminal 2E</p>
        <p className="mt-1 font-semibold">La navette arrive</p>
        <ol className="mt-5 grid gap-3">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span className={`size-2.5 rounded-full ${s.done ? "bg-primary" : "border"}`} />
              <span className={`flex-1 ${s.done ? "" : "text-muted-foreground"}`}>{s.label}</span>
              <span className="tabular-nums text-muted-foreground">{s.time}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-lg bg-primary/5 px-3 py-2.5 text-xs">
          Rendez-vous au point navette, sortie 10.
        </div>
      </div>
    </div>
  );
}

async function Prices() {
  await connection();
  const parkings = await listParkings();
  const week = { from: new Date("2026-01-05T08:00:00Z"), to: new Date("2026-01-12T08:00:00Z") };

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      {parkings.map((p) => {
        const sevenDays = quote(p.dailyRateCents, week.from, week.to);
        return (
          <div key={p.slug} className="rounded-lg border p-6">
            <p className="font-medium">{p.name}</p>
            <p className="text-sm text-muted-foreground">{p.airport}</p>
            <p className="mt-6 text-3xl font-semibold tracking-tight">
              {formatEuros(p.dailyRateCents)}
              <span className="text-base font-normal text-muted-foreground"> / jour</span>
            </p>
            {sevenDays.ok && (
              <p className="mt-1 text-sm text-muted-foreground">
                Une semaine : {formatEuros(sevenDays.totalCents)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
