import {
  ArrowRightIcon,
  BusFrontIcon,
  CameraIcon,
  LockKeyholeIcon,
  PhoneIcon,
  ShieldCheckIcon,
  StarIcon,
  UserRoundCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { QuickQuote } from "@/components/quick-quote";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AIRPORT_RATES_NOTE, CDG_ECO_PUBLIC_RATES } from "@/lib/airport-rates";
import { SUPPORT_PHONE, SUPPORT_PHONE_HREF } from "@/lib/contact";
import { formatEuros, quote } from "@/lib/pricing";
import { BANNER_PROMO_CODE } from "@/lib/promo";
import { dateToParisLocal, parisDay, parisDayBounds } from "@/lib/time";
import { listParkings } from "@/server/bookings";
import { getPublicOffer } from "@/server/promo-codes";
import { getReviewStats, listPublishedReviews } from "@/server/reviews";

const AIRPORT_CODES: Record<string, { code: string; label: string }> = {
  orly: { code: "ORY", label: "Orly" },
  cdg: { code: "CDG", label: "Roissy-CDG" },
};

const STEPS = [
  { title: "Réservez", text: "Choisissez vos dates. Le prix total s'affiche avant le paiement." },
  { title: "Déposez", text: "On vous accueille au parking et la navette vous dépose au terminal." },
  { title: "Voyagez", text: "Votre voiture reste sous surveillance, jour et nuit." },
  { title: "Rentrez", text: "Bagages en main, un bouton : la navette vient vous chercher." },
];

const SECURITY = [
  { icon: LockKeyholeIcon, text: "Site clôturé, éclairé toute la nuit" },
  { icon: CameraIcon, text: "Vidéosurveillance continue" },
  { icon: UserRoundCheckIcon, text: "Personnel présent 24h/24" },
  { icon: ShieldCheckIcon, text: "Entrée et sortie contrôlées" },
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
/** "127 €" in a headline, cents only when there are some. */
const headlineEuros = (cents: number) =>
  cents % 100 === 0
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
    : formatEuros(cents);
const oneDecimal = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// A fixed reference week, only to price whole days (no time change inside).
const REFERENCE_START = new Date("2026-01-05T08:00:00Z");
const afterDays = (n: number) => new Date(REFERENCE_START.getTime() + n * 24 * 3600_000);
const stayCents = (dailyRateCents: number, days: number) => {
  const q = quote(dailyRateCents, REFERENCE_START, afterDays(days));
  return q.ok ? q.totalCents : null;
};

// One set of queries per request, shared by every section of the page.
const getLandingData = cache(async () => {
  await connection();
  const [parkings, published, stats, offer] = await Promise.all([
    listParkings(),
    listPublishedReviews(6),
    getReviewStats(),
    // The banner's code, applied by the quote card while it works.
    getPublicOffer(BANNER_PROMO_CODE),
  ]);

  // Our price against the airport's own Éco car parks at Roissy, same durations.
  const cdg = parkings.find((p) => p.slug === "cdg");
  const comparison = cdg
    ? CDG_ECO_PUBLIC_RATES.flatMap(({ days, cents }) => {
        const ours = stayCents(cdg.dailyRateCents, days);
        return ours === null ? [] : [{ days, ours, airport: cents }];
      })
    : [];
  // The headline only says "twice" while it is true for every duration shown.
  const twice = comparison.length > 0 && comparison.every((row) => row.airport >= 2 * row.ours);

  const real = published.length >= MIN_REAL_REVIEWS;
  const reviews: LandingReview[] = real
    ? published.map((r) => ({
        id: r.id,
        stars: r.rating,
        text: r.comment,
        name: r.authorName,
        trip: `${r.parkingName.replace("Escale ", "")} · ${monthYear.format(r.createdAt)}`,
      }))
    : FICTIONAL_REVIEWS.map((r) => ({ ...r, id: r.name }));

  const cheapest = parkings.reduce<(typeof parkings)[number] | null>(
    (min, p) => (!min || p.dailyRateCents < min.dailyRateCents ? p : min),
    null,
  );
  return { parkings, comparison, twice, offer, stats, real, reviews, cheapest };
});

export default function LandingPage() {
  return (
    <>
      {/* Hero: the price first */}
      <section className="relative overflow-hidden">
        <Suspense fallback={<HeroSkeleton />}>
          <Hero />
        </Suspense>
      </section>

      {/* Key numbers */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <KeyNumbers />
        </Suspense>
      </section>

      {/* Prices against the airport's car parks */}
      <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
          <Prices />
        </Suspense>
      </section>

      {/* Security */}
      <section id="securite" className="scroll-mt-20 border-y">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
          <p className="font-serif text-[8rem] leading-none text-primary italic sm:text-[12rem]" aria-hidden>
            24/7
          </p>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Votre voiture, <span className="font-serif font-normal italic">surveillée jusqu&apos;à votre retour.</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
              À l&apos;arrivée, l&apos;accueil scanne votre QR code et note la place où votre voiture est garée. La
              place et l&apos;heure du dépôt s&apos;affichent ensuite dans votre réservation.
            </p>
            <ul className="mt-6 divide-y">
              {SECURITY.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 py-3">
                  <Icon className="size-4 text-primary" />
                  {text}
                </li>
              ))}
            </ul>
            <p className="mt-6 flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
              <PhoneIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Une question pendant votre voyage ? L&apos;équipe répond 24h/24 au{" "}
                <a href={SUPPORT_PHONE_HREF} className="font-medium whitespace-nowrap hover:underline">
                  {SUPPORT_PHONE}
                </a>
                .
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Customer satisfaction */}
      <Suspense fallback={<Skeleton className="mx-auto my-24 h-96 max-w-6xl" />}>
        <ReviewsSection />
      </Suspense>

      {/* Process */}
      <section id="fonctionnement" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
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
              L&apos;attente des bagages varie d&apos;un vol à l&apos;autre, alors la navette part quand vous êtes
              prêt. Vous appuyez sur « J&apos;ai mes bagages », l&apos;équipe reçoit votre demande avec votre
              terminal, et vous suivez son arrivée en direct.
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

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 rounded-[2rem] bg-neutral-950 px-8 py-14 text-white sm:px-12 md:flex-row md:items-center dark:bg-card dark:ring-1 dark:ring-border dark:ring-inset">
          <div>
            <h2 className="font-serif text-5xl italic sm:text-6xl">Bon voyage.</h2>
            <p className="mt-3 text-white/70">Navette aller-retour comprise, voiture surveillée jour et nuit.</p>
          </div>
          <Button size="lg" className="h-12 px-6 text-base" render={<Link href="/reserver" />} nativeButton={false}>
            Voir mon prix <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 text-sm text-muted-foreground sm:px-6">
        Démo :{" "}
        <Link href="/reservation/demo-retour" className="underline underline-offset-4 hover:text-foreground">
          tester le retour comme un client
        </Link>{" "}
      </section>
    </>
  );
}

async function Hero() {
  const { parkings, comparison, twice, offer, stats } = await getLandingData();
  const now = new Date();
  const tomorrow = dateToParisLocal(new Date(parisDayBounds(now, 1).start.getTime() + 8 * 3600_000));
  const nextWeek = dateToParisLocal(new Date(parisDayBounds(now, 8).start.getTime() + 8 * 3600_000));
  const longest = comparison.at(-1);

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Parking Orly &amp; Roissy-CDG
        </p>
        <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          {twice ? "Deux fois moins cher" : "Moins cher"}{" "}
          <span className="font-serif font-normal text-primary italic">qu&apos;au parking de l&apos;aéroport.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg text-muted-foreground">
          {longest ? (
            <>
              {longest.days} jours à Roissy-CDG vous coûtent{" "}
              <span className="font-medium text-foreground">{formatEuros(longest.ours)}</span> chez nous, contre{" "}
              {formatEuros(longest.airport)} au parking Éco de l&apos;aéroport. La navette aller-retour est comprise
              dans notre prix.
            </>
          ) : (
            "Parking à Orly et Roissy-CDG. La navette aller-retour est comprise dans le prix."
          )}
        </p>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <li className="flex items-center gap-2">
            <BusFrontIcon className="size-4 text-primary" /> Navette aller-retour comprise
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-primary" /> Surveillé 24h/24
          </li>
          {stats.average !== null && (
            <li className="flex items-center gap-2">
              <StarIcon className="size-4 fill-primary text-primary" /> {oneDecimal(stats.average)}/5 sur {stats.count}{" "}
              avis
            </li>
          )}
        </ul>
      </div>
      <div className="flex justify-center lg:justify-end">
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
          promo={offer?.code}
        />
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
      <div className="space-y-6">
        <Skeleton className="h-6 w-72 rounded-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-16 w-full max-w-lg" />
      </div>
      <Skeleton className="mx-auto h-[520px] w-full max-w-md rounded-3xl lg:mr-0" />
    </div>
  );
}

async function KeyNumbers() {
  const { cheapest, stats } = await getLandingData();
  const items: { value: string; unit?: string; label: string; accent?: boolean }[] = [
    cheapest
      ? {
          value: (cheapest.dailyRateCents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }),
          unit: "€",
          label: `les 24 h à ${AIRPORT_CODES[cheapest.slug]?.label ?? cheapest.name}, navette comprise`,
          accent: true,
        }
      : { value: "—", label: "les 24 h, navette comprise" },
    { value: "-40", unit: "%", label: "sur chaque jour, dès le 8e" },
    { value: "24/7", label: "parking surveillé, équipe sur place" },
    stats.average !== null
      ? { value: oneDecimal(stats.average), unit: "/5", label: `note moyenne sur ${stats.count} avis` }
      : { value: "—", label: "note moyenne" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-y-10 border-y py-10 sm:grid-cols-4 sm:py-12">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex flex-col-reverse justify-end gap-2 pr-4 ${i % 2 === 1 ? "border-l pl-6" : ""} ${i === 2 ? "sm:border-l sm:pl-6" : ""}`}
        >
          <dt className="max-w-[14rem] text-sm text-pretty text-muted-foreground">{item.label}</dt>
          <dd className="flex items-baseline gap-1">
            <span
              className={`text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl ${item.accent ? "text-primary" : ""}`}
            >
              {item.value}
            </span>
            {item.unit && <span className="font-serif text-2xl text-muted-foreground italic">{item.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

async function Prices() {
  const { parkings, comparison } = await getLandingData();
  const longest = comparison.at(-1);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {longest ? (
            <>
              {headlineEuros(longest.airport - longest.ours)} de moins{" "}
              <span className="font-serif font-normal italic">sur {longest.days} jours à Roissy.</span>
            </>
          ) : (
            <>
              Des prix <span className="font-serif font-normal italic">qui ne décollent pas.</span>
            </>
          )}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Le même séjour, au parking Éco de l&apos;aéroport et chez nous. Notre prix comprend la navette aller-retour.
        </p>
      </div>

      {comparison.length > 0 && (
        <div className="mt-10 overflow-hidden rounded-3xl border">
          <table className="w-full text-left text-sm sm:text-base">
            <thead className="bg-muted/60 text-xs text-muted-foreground sm:text-sm">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal sm:px-6">
                  Séjour à Roissy-CDG
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium text-foreground sm:px-6">
                  Escale Parking
                </th>
                <th scope="col" className="px-4 py-3 text-right font-normal sm:px-6">
                  Parking de l&apos;aéroport
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {comparison.map((row) => (
                <tr key={row.days}>
                  <th scope="row" className="px-4 py-4 font-normal sm:px-6">
                    {row.days === 1 ? "24 heures" : `${row.days} jours`}
                  </th>
                  <td className="px-4 py-4 text-right text-lg font-semibold tabular-nums sm:px-6">
                    {formatEuros(row.ours)}
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground tabular-nums sm:px-6">
                    <span className="line-through decoration-primary/60">{formatEuros(row.airport)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{AIRPORT_RATES_NOTE}</p>

      <h3 className="mt-16 text-xl font-semibold tracking-tight">Nos tarifs, aux deux aéroports</h3>
      <DepartureBoard parkings={parkings} />
    </>
  );
}

async function ReviewsSection() {
  const { real, reviews, stats } = await getLandingData();
  const satisfied = Math.round(stats.satisfiedShare * 100);
  return (
    <section id="avis" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {stats.count > 0 ? (
            <>
              {satisfied} % de nos clients{" "}
              <span className="font-serif font-normal italic">nous donnent 4 ou 5 étoiles.</span>
            </>
          ) : (
            <>
              Ils sont <span className="font-serif font-normal italic">bien rentrés.</span>
            </>
          )}
        </h2>
        {stats.average !== null && (
          <p className="flex items-center gap-2 text-sm">
            <Stars count={Math.round(stats.average)} />
            <span>
              <span className="font-medium">{oneDecimal(stats.average)}/5</span> de moyenne sur {stats.count} avis
            </span>
          </p>
        )}
      </div>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Seuls les clients que la navette a ramenés peuvent noter leur séjour. Nous publions les commentaires de ceux
        qui l&apos;acceptent, quelle que soit leur note.
      </p>
      <div className="mt-12 columns-1 gap-6 sm:columns-2 lg:columns-3">
        {reviews.map((review) => (
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
          : "Commentaires fictifs : projet de démonstration. La note et le nombre d'avis viennent des clients."}
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

function DepartureBoard({ parkings }: { parkings: { slug: string; name: string; dailyRateCents: number }[] }) {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl bg-neutral-950 font-mono text-white dark:bg-card dark:ring-1 dark:ring-border dark:ring-inset">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 border-b border-white/15 px-6 py-3 text-[11px] tracking-[0.2em] text-white/50 uppercase sm:grid-cols-[1fr_auto_auto_auto_auto] sm:px-8">
        <span>Parking</span>
        <span className="text-right">Par jour</span>
        <span className="hidden text-right sm:block">7 jours</span>
        <span className="text-right">14 jours</span>
        <span className="hidden text-right sm:block">Statut</span>
      </div>
      {parkings.map((p) => {
        const week = stayCents(p.dailyRateCents, 7);
        const twoWeeks = stayCents(p.dailyRateCents, 14);
        return (
          <div
            key={p.slug}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 border-b border-white/10 px-6 py-5 last:border-0 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:px-8"
          >
            <span className="text-lg tracking-wide uppercase">
              <span className="text-primary">{AIRPORT_CODES[p.slug]?.code}</span>{" "}
              <span className="text-white/70">{AIRPORT_CODES[p.slug]?.label ?? p.name}</span>
            </span>
            <span className="text-right text-lg tabular-nums">{formatEuros(p.dailyRateCents)}</span>
            <span className="hidden text-right tabular-nums sm:block">{week !== null && formatEuros(week)}</span>
            <span className="text-right tabular-nums">{twoWeeks !== null && formatEuros(twoWeeks)}</span>
            <span className="hidden items-center justify-end gap-2 text-xs text-white/70 sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" /> OUVERT 24H/24
            </span>
          </div>
        );
      })}
      <p className="px-6 py-4 text-xs text-white/50 sm:px-8">
        Navette aller-retour comprise · -20 % du 4e au 7e jour · -40 % à partir du 8e jour
      </p>
    </div>
  );
}
