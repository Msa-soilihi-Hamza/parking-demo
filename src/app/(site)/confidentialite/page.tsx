import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata = { title: "Règles de confidentialité · Escale Parking" };

const CONTACT = "msahamza738@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Règles de confidentialité" updated="27 octobre 2026">
      <p>
        Escale Parking est un <strong>projet de démonstration</strong> réalisé par Msa Soilihi Hamza, développeur
        web, pour présenter son travail. La marque Escale est fictive : aucun parking réel n&apos;est exploité et
        aucun paiement réel n&apos;est encaissé. Les données que vous saisissez sont pourtant de vraies données :
        cette page explique lesquelles sont gardées, pourquoi, et comment les faire supprimer.
      </p>

      <LegalSection title="Qui est responsable de vos données">
        <p>
          Msa Soilihi Hamza, développeur du projet. Pour toute question ou demande :{" "}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </LegalSection>

      <LegalSection title="Les données gardées">
        <ul>
          <li>
            <strong>Votre compte</strong> : adresse e-mail et nom. Avec la connexion Google, Google nous transmet
            aussi l&apos;adresse de votre photo de profil. Aucun mot de passe : la connexion se fait par un code
            envoyé par e-mail (seule une empreinte chiffrée du code est conservée, 10 minutes au plus) ou par Google.
          </li>
          <li>
            <strong>Vos sessions de connexion</strong> : un identifiant de session, sa date d&apos;expiration,
            l&apos;adresse IP et le type de navigateur utilisés pour vous connecter.
          </li>
          <li>
            <strong>Vos réservations</strong> : nom, téléphone, immatriculation, parking, dates de dépôt et de
            retour, terminal, nombre de passagers, montant, code promo utilisé, place de stationnement, et les
            étapes de votre retour en navette (heures du bouton « J&apos;ai mes bagages » et de la prise en charge).
          </li>
          <li>
            <strong>Votre avis</strong>, si vous en laissez un : note, commentaire, et votre accord (ou non) pour
            qu&apos;il soit publié sur le site avec votre prénom et l&apos;initiale de votre nom.
          </li>
          <li>
            <strong>Le paiement</strong> est traité entièrement par Stripe, en mode test. Nous ne voyons ni ne
            gardons jamais de numéro de carte.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Pourquoi">
        <ul>
          <li>Vous permettre de vous connecter et de retrouver vos réservations dans « Mon espace ».</li>
          <li>Gérer votre réservation : place, accueil au parking, navette à votre retour.</li>
          <li>
            Vous envoyer les e-mails liés à votre réservation : code de connexion, confirmation, suivi de la
            navette, demande d&apos;avis. Aucun e-mail publicitaire.
          </li>
          <li>Protéger le site contre les abus (limitation du nombre de tentatives de connexion).</li>
        </ul>
        <p>
          Ces traitements reposent sur l&apos;exécution du service que vous demandez (votre compte et votre
          réservation) et, pour la publication de votre avis, sur votre consentement.
        </p>
      </LegalSection>

      <LegalSection title="Qui y a accès">
        <p>Vos données ne sont ni vendues ni partagées à des fins publicitaires. Elles passent par ces services :</p>
        <ul>
          <li>
            <strong>Vercel</strong> : hébergement du site.
          </li>
          <li>
            <strong>Neon</strong> : base de données, hébergée aux États-Unis (région us-east-2).
          </li>
          <li>
            <strong>Stripe</strong> : paiement, en mode test.
          </li>
          <li>
            <strong>Google</strong> : envoi des e-mails (Gmail) et, si vous la choisissez, connexion avec Google.
          </li>
        </ul>
        <p>
          Certains de ces services étant situés aux États-Unis, vos données peuvent y être transférées. L&apos;équipe
          (navette, accueil) voit les informations utiles à votre réservation : nom, téléphone, immatriculation,
          terminal.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Le site n&apos;utilise que des cookies nécessaires à son fonctionnement : le cookie de session qui vous
          garde connecté, et ceux qui permettent à l&apos;équipe d&apos;accéder à ses espaces. Aucun cookie de
          mesure d&apos;audience ni de publicité.
        </p>
      </LegalSection>

      <LegalSection title="Combien de temps">
        <p>
          Votre compte et vos réservations sont gardés tant que vous ne supprimez pas votre compte. Les sessions de
          connexion expirent d&apos;elles-mêmes. Quand vous supprimez votre compte, vos réservations restent pour la
          comptabilité (montants et dates) mais ne portent plus votre nom, votre e-mail, votre téléphone ni votre
          immatriculation. S&apos;agissant d&apos;une démonstration, les données de test peuvent être effacées à
          tout moment.
        </p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Vous pouvez <strong>supprimer votre compte vous-même</strong> depuis{" "}
          <Link href="/compte">Mon espace</Link> : un e-mail vous demande de confirmer, puis le compte est supprimé
          (pas pendant un séjour en cours, le compte servant jusqu&apos;à votre retour).
        </p>
        <p>
          Vous pouvez aussi demander à consulter, corriger ou supprimer vos données, ou vous opposer à leur utilisation,
          en écrivant à <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Vous pouvez aussi adresser une réclamation à la
          CNIL (<a href="https://www.cnil.fr">www.cnil.fr</a>).
        </p>
        <p>
          Voir aussi les <Link href="/conditions">conditions d&apos;utilisation</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
