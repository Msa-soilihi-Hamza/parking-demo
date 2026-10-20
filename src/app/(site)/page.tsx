import {
  ArrowRightIcon,
  BadgePercentIcon,
  BusFrontIcon,
  PhoneIcon,
  ShieldCheckIcon,
  StarIcon,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { QuickQuote } from "@/components/quick-quote";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/contact";
import { formatEuros, quote } from "@/lib/pricing";
import { dateToParisLocal, parisDay, parisDayBounds } from "@/lib/time";
import { listParkings } from "@/server/bookings";
import { listPublishedReviews } from "@/server/reviews";

const AIRPORT_CODES: Record<string, { code: string; label: string }> = {
  orly: { code: "ORY", label: "Orly" },
  cdg: { code: "CDG", label: "Roissy-CDG" },
};

const STEPS = [
  { title: "Réservez", text: "Dates, prix, paiement. Deux minutes depuis votre téléphone." },
  { title: "Déposez", text: "On vous accueille au parking et la navette vous dépose au terminal." },
  { title: "Voyagez", text: "Votre voiture reste sous surveillance, jour et nuit." },
  { title: "Rentrez", text: "Bagages en main, un bouton : la navette vient vous chercher." },
];

const SECURITY = [
  "Vidéosurveillance continue",
  "Site clôturé et éclairé toute la nuit",
  "Personnel présent 24h/24",
  "Entrée et sortie contrôlées",
];

// Fictional reviews, shown only until enough real ones are published (said under the section).
const FICTIONAL_REVIEWS = [
  {
    stars: 5,
    text: "Réservé en deux minutes sur mon téléphone, le prix était affiché tout de suite. Au retour, un appui sur le bouton et la navette était là.",
    name: "Sarah M.",
    trip: "Orly · septembre 2026",
  },
  {
    stars: 5,
    text: "Deux semaines à Roissy pour 166 €, navette comprise. On ne trouve pas mieux pour un long séjour.",
    name: "Thomas L.",
    trip: "Roissy-CDG · août 2026",
  },
  {
    stars: 4,
    text: "Notre vol avait deux heures de retard. Aucun stress : on a appuyé sur le bouton à la sortie des bagages, la navette est arrivée.",
    name: "Karim B.",
    trip: "Roissy-CDG · juillet 2026",
  },
  {
    stars: 5,
    text: "Petit souci pour trouver le point de rendez-vous, j'ai appelé : quelqu'un a décroché tout de suite et m'a guidé.",
    name: "Nadia H.",
    trip: "Orly · septembre 2026",
  },
  {
    stars: 5,
    text: "Voiture retrouvée exactement comme je l'avais laissée. Parking éclairé, gardé, rassurant.",
    name: "Paul D.",
    trip: "Orly · juin 2026",
  },
  {
    stars: 5,
    text: "Le lien de retour arrive par e-mail avec la réservation. Simple, clair, ça marche.",
    name: "Inès T.",
    trip: "Roissy-CDG · octobre 2026",
  },
];

/** Real reviews replace the fictional ones from this many published reviews. */
const MIN_REAL_REVIEWS = 3;

type LandingReview = { id: string; stars: number; text: string; name: string; trip: string };

const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });

// One query per request, shared by the key number and the reviews section.
const getLandingReviews = cache(async () => {
  await connection();
  const published = await listPublishedReviews(6);
  const real = published.length >= MIN_REAL_REVIEWS;
  const items: LandingReview[] = real
    ? published.map((r) => ({
        id: r.id,
        stars: r.rating,
        text: r.comment,
        name: r.authorName,
        trip: `${r.parkingName.replace("Escale ", "")} · ${monthYear.format(r.createdAt)}`,
      }))
    : FICTIONAL_REVIEWS.map((r) => ({ ...r, id: r.name }));
  const average = items.reduce((sum, r) => sum + r.stars, 0) / items.length;
  return { real, items, average: average.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) };
});

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              Parking Orly &amp; Roissy-CDG
            </p>
            <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
              Votre place réservée{" "}
              <span className="font-serif font-normal whitespace-nowrap text-primary italic">en 2 minutes.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Choisissez vos dates, le prix s&apos;affiche, vous payez. À votre retour, un seul bouton et la
              navette vient vous chercher.
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <li className="flex items-center gap-2">
                <BadgePercentIcon className="size-4 text-primary" /> Jusqu&apos;à -40 % sur les longs séjours
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheckIcon className="size-4 text-primary" /> Surveillé 24h/24
              </li>
              <li className="flex items-center gap-2">
                <BusFrontIcon className="size-4 text-primary" /> Navette incluse
              </li>
            </ul>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Suspense fallback={<Skeleton className="h-[520px] w-full max-w-md rounded-3xl" />}>
              <HeroQuote />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Key numbers */}
      <section className="border-y">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
          {[
            { value: "2 min", label: "pour réserver" },
            { value: "24h/24", label: "sous surveillance" },
            { value: "-40 %", label: "dès le 8e jour" },
            {
              value: (
                <Suspense fallback="—">
                  <AverageRating />
                </Suspense>
              ),
              label: "note de nos clients",
            },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`px-4 py-8 sm:px-6 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t sm:border-t-0" : ""} ${i === 2 ? "sm:border-l" : ""}`}
            >
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Process */}
      <section id="fonctionnement" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Du parking au terminal, <span className="font-serif font-normal italic">et retour.</span>
        </h2>
        <ol className="relative mt-14 grid gap-10 sm:grid-cols-4 sm:gap-6">
          {/* The route line between the steps */}
          <span className="absolute top-[7px] right-0 left-0 hidden border-t border-dashed border-foreground/25 sm:block" />
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="relative block size-3.5 rounded-full border-2 border-primary bg-background" />
              <p className="mt-6 font-mono text-xs text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-1 text-lg font-medium">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* One button */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid items-center gap-12 overflow-hidden rounded-[2rem] bg-muted/60 px-6 py-14 sm:px-12 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Un bouton. <span className="font-serif font-normal text-primary italic">La navette arrive.</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
              L&apos;attente des bagages varie d&apos;un vol à l&apos;autre. Alors la navette ne part pas à
              l&apos;heure de l&apos;avion, mais quand vous êtes prêt : vous appuyez sur « J&apos;ai mes
              bagages », l&apos;équipe reçoit votre demande avec votre terminal, et vous suivez son arrivée en
              direct.
            </p>
            <p className="mt-6 flex items-start gap-3 rounded-2xl bg-background px-4 py-3 text-sm">
              <PhoneIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Un imprévu ? Notre équipe reste joignable 24h/24 au{" "}
                <a href={SUPPORT_PHONE_HREF} className="font-medium whitespace-nowrap hover:underline">
                  {SUPPORT_PHONE}
                </a>
                .
              </span>
            </p>
          </div>
          <div className="flex justify-center" aria-hidden>
            <div className="relative grid size-64 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/10 [animation-duration:2.5s]" />
              <span className="absolute inset-6 rounded-full bg-primary/10" />
              <span className="relative grid size-40 place-items-center rounded-full bg-primary text-center text-lg leading-tight font-medium text-primary-foreground shadow-xl shadow-primary/30">
                J&apos;ai mes
                <br />
                bagages
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Prices, as a departure board */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Des prix <span className="font-serif font-normal italic">qui ne décollent pas.</span>
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Navette aller-retour incluse, aucun frais caché. Plus vous restez, moins chaque jour coûte.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="mt-10 h-56 w-full rounded-3xl" />}>
          <DepartureBoard />
        </Suspense>
      </section>

      {/* Security */}
      <section className="border-y">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
          <p className="font-serif text-[8rem] leading-none text-primary italic sm:text-[12rem]" aria-hidden>
            24/7
          </p>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Votre voiture, surveillée jour et nuit.</h2>
            <ul className="mt-6 divide-y">
              {SECURITY.map((item) => (
                <li key={item} className="flex items-center gap-3 py-3">
                  <ShieldCheckIcon className="size-4 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <Suspense fallback={<Skeleton className="mx-auto my-24 h-96 max-w-6xl" />}>
        <ReviewsSection />
      </Suspense>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 rounded-[2rem] bg-foreground px-8 py-14 text-background sm:px-12 md:flex-row md:items-center">
          <h2 className="font-serif text-5xl italic sm:text-6xl">Bon voyage.</h2>
          <Button size="lg" className="h-12 px-6 text-base" render={<Link href="/reserver" />} nativeButton={false}>
            Réserver en 2 minutes <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted-foreground sm:px-6">
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

async function AverageRating() {
  const { average } = await getLandingReviews();
  return <>{average}/5</>;
}

async function ReviewsSection() {
  const { real, items, average } = await getLandingReviews();
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ils sont <span className="font-serif font-normal italic">bien rentrés.</span>
        </h2>
        <p className="flex items-center gap-2 text-sm">
          <Stars count={5} /> <span className="font-medium">{average}/5</span>
        </p>
      </div>
      <div className="mt-12 columns-1 gap-6 sm:columns-2 lg:columns-3">
        {items.map((review) => (
          <figure key={review.id} className="mb-6 break-inside-avoid rounded-3xl border p-6">
            <Stars count={review.stars} />
            <blockquote className="mt-4 text-[15px] leading-relaxed">« {review.text} »</blockquote>
            <figcaption className="mt-5 text-sm">
              <span className="font-medium">{review.name}</span>
              <span className="text-muted-foreground"> · {review.trip}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {real
          ? "Avis laissés par nos clients après leur retour, publiés avec leur accord."
          : "Avis fictifs : projet de démonstration."}
      </p>
    </section>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${count} sur 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon
          key={i}
          className={`size-4 ${i < count ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
        />
      ))}
    </span>
  );
}

async function HeroQuote() {
  await connection();
  const parkings = await listParkings();
  const now = new Date();
  const tomorrow = dateToParisLocal(new Date(parisDayBounds(now, 1).start.getTime() + 8 * 3600_000));
  const nextWeek = dateToParisLocal(new Date(parisDayBounds(now, 8).start.getTime() + 8 * 3600_000));

  return (
    <QuickQuote
      parkings={parkings.map((p) => ({
        slug: p.slug,
        code: AIRPORT_CODES[p.slug]?.code ?? p.slug.toUpperCase(),
        label: AIRPORT_CODES[p.slug]?.label ?? p.name,
        dailyRateCents: p.dailyRateCents,
      }))}
      defaultDates={{
        from: tomorrow.slice(0, 10),
        to: nextWeek.slice(0, 10),
        dropoffTime: tomorrow.slice(11, 16),
        returnTime: nextWeek.slice(11, 16),
      }}
      minDay={parisDay(now)}
    />
  );
}

async function DepartureBoard() {
  await connection();
  const parkings = await listParkings();
  // A fixed reference week, only to show what 7 and 14 days cost.
  const start = new Date("2026-01-05T08:00:00Z");
  const days = (n: number) => new Date(start.getTime() + n * 24 * 3600_000);

  return (
    <div className="mt-10 overflow-hidden rounded-3xl bg-foreground font-mono text-background">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-background/15 px-6 py-3 text-[11px] tracking-[0.2em] text-background/50 uppercase sm:grid-cols-[1fr_auto_auto_auto_auto] sm:px-8">
        <span>Parking</span>
        <span className="text-right">Par jour</span>
        <span className="hidden text-right sm:block">7 jours</span>
        <span className="text-right">14 jours</span>
        <span className="hidden text-right sm:block">Statut</span>
      </div>
      {parkings.map((p) => {
        const week = quote(p.dailyRateCents, start, days(7));
        const twoWeeks = quote(p.dailyRateCents, start, days(14));
        return (
          <div
            key={p.slug}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-background/10 px-6 py-5 last:border-0 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:px-8"
          >
            <span className="text-lg tracking-wide uppercase">
              <span className="text-primary">{AIRPORT_CODES[p.slug]?.code}</span>{" "}
              <span className="text-background/70">{AIRPORT_CODES[p.slug]?.label ?? p.name}</span>
            </span>
            <span className="text-right text-lg tabular-nums">{formatEuros(p.dailyRateCents)}</span>
            <span className="hidden text-right tabular-nums sm:block">{week.ok && formatEuros(week.totalCents)}</span>
            <span className="text-right tabular-nums">{twoWeeks.ok && formatEuros(twoWeeks.totalCents)}</span>
            <span className="hidden items-center justify-end gap-2 text-xs text-background/70 sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" /> OUVERT 24H/24
            </span>
          </div>
        );
      })}
      <p className="px-6 py-4 text-xs text-background/50 sm:px-8">
        -20 % du 4e au 7e jour · -40 % à partir du 8e jour
      </p>
    </div>
  );
}
