import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata = { title: "Conditions d'utilisation · Escale Parking" };

const CONTACT = "msahamza738@gmail.com";

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d'utilisation" updated="26 octobre 2026">
      <LegalSection title="Un projet de démonstration">
        <p>
          Escale Parking est un <strong>projet de démonstration</strong> réalisé par Msa Soilihi Hamza, développeur
          web. La marque Escale, les parkings, les adresses et le numéro d&apos;assistance sont fictifs. Aucune place
          de stationnement réelle n&apos;est réservée et aucun service de navette n&apos;est assuré.
        </p>
      </LegalSection>

      <LegalSection title="Paiements fictifs">
        <p>
          Les paiements passent par Stripe en <strong>mode test</strong> : aucune somme n&apos;est jamais débitée.
          Utilisez uniquement les cartes de test de Stripe (par exemple 4242 4242 4242 4242, date future, code
          quelconque). Une vraie carte est refusée par le mode test : ne saisissez pas vos coordonnées bancaires.
        </p>
      </LegalSection>

      <LegalSection title="Compte">
        <p>
          Réserver demande un compte, créé avec une adresse e-mail (connexion par un code reçu par e-mail) ou avec
          Google. Vous êtes responsable de l&apos;accès à votre boîte e-mail et à votre compte Google. Un compte est
          personnel : n&apos;utilisez que votre propre adresse.
        </p>
      </LegalSection>

      <LegalSection title="Réservations">
        <ul>
          <li>Le prix affiché avant le paiement est le prix payé (en mode test).</li>
          <li>
            Une place est retenue 30 minutes pendant le paiement ; sans paiement dans ce délai, elle est libérée.
          </li>
          <li>Un code promo refusé arrête la réservation : il n&apos;est jamais retiré sans vous prévenir.</li>
          <li>
            Le lien personnel envoyé par e-mail donne accès à votre réservation : ne le partagez qu&apos;avec les
            personnes qui voyagent avec vous.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Bon usage">
        <p>
          N&apos;utilisez pas le site pour envoyer des codes de connexion à des adresses qui ne sont pas les vôtres,
          bloquer des places sans intention de réserver, ou tenter de contourner ses protections. Les comptes ou
          réservations qui ne respectent pas ces règles peuvent être supprimés.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilité">
        <p>
          Le site est fourni tel quel, à titre de démonstration, sans garantie de disponibilité. Les données de
          démonstration et de test peuvent être réinitialisées ou supprimées à tout moment.
        </p>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <p>
          Ce qui est gardé et pourquoi est expliqué dans les{" "}
          <Link href="/confidentialite">règles de confidentialité</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Pour toute question : <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Ces conditions sont soumises au droit
          français.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
