import nodemailer from "nodemailer";
import type { Booking, Parking } from "@/db/schema";
import { SUPPORT_PHONE } from "@/lib/contact";
import { formatEuros } from "@/lib/pricing";
import { formatDateTime } from "@/lib/time";
import { arrivalQrPng } from "@/server/qr";
import { appUrl } from "@/server/stripe";

// Gmail SMTP with an app password: free and delivers to any address.
const user = process.env.GMAIL_USER;
// Google displays app passwords in groups of 4 ("abcd efgh ..."): spaces are not part of it.
const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");

const transporter =
  user && pass
    ? nodemailer.createTransport({ service: "gmail", auth: { user, pass } })
    : null;

export function mailerConfigured() {
  return transporter !== null;
}

// Reserved by RFC 2606: used by the demo data, never deliverable.
const isDemoAddress = (to: string) => /@example\.(com|org|net)$/i.test(to);

type Attachment = { filename: string; content: Buffer; cid: string };

async function send(to: string | null, subject: string, text: string, html: string, attachments: Attachment[] = []) {
  // A customer registered at the front desk may have left no e-mail.
  if (!to) return;
  if (isDemoAddress(to)) {
    console.info(`[e-mail de démo non envoyé] À : ${to} · Objet : ${subject}`);
    return;
  }
  if (!transporter) {
    // Development only: without SMTP settings, print the e-mail in the server console.
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[e-mail non envoyé : Gmail non configuré]\nÀ : ${to}\nObjet : ${subject}\n${text}\n`);
      return;
    }
    throw new Error("L'envoi d'e-mails n'est pas configuré (GMAIL_USER, GMAIL_APP_PASSWORD).");
  }
  await transporter.sendMail({ from: `"Escale Parking" <${user}>`, to, subject, text, html, attachments });
}

/** Text from a form or the database, inside the e-mail's HTML: never read as markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(content: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#171717">
  <p style="font-weight:bold;margin:0 0 24px">● Escale</p>
  ${content}
  <p style="color:#737373;font-size:12px;margin-top:32px">Projet de démonstration · marque fictive</p>
</div>`;
}

export async function sendVerificationCode(to: string, code: string) {
  await send(
    to,
    `${code} est votre code Escale`,
    `Votre code de vérification : ${code}\nIl expire dans 10 minutes.`,
    layout(`<p>Votre code de vérification :</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
  <p style="color:#737373">Il expire dans 10 minutes. Si vous n'avez rien demandé, ignorez cet e-mail.</p>`),
  );
}

/** Sent right after "J'ai mes bagages": the customer knows the shuttle team has the request. */
export async function sendPickupRequestReceived(booking: Booking, terminal: string) {
  const link = `${appUrl()}/reservation/${booking.accessToken}`;
  await send(
    booking.email,
    `La navette a bien reçu votre demande · ${terminal}`,
    `L'équipe navette a bien reçu votre demande. Rendez-vous au point navette du terminal ${terminal}.\n` +
      `Suivez l'arrivée de la navette ici : ${link}\nUn imprévu ? Appelez le ${SUPPORT_PHONE}, 24h/24.`,
    layout(`<p><strong>L'équipe navette a bien reçu votre demande.</strong></p>
  <p>Rendez-vous au point navette du <strong>terminal ${escapeHtml(terminal)}</strong> : un chauffeur part vous chercher.</p>
  <p><a href="${link}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Suivre la navette</a></p>
  <p style="color:#737373">Appuyé par erreur ? Vous pouvez annuler depuis ce lien tant que la navette n'est pas partie. Un imprévu ? ${SUPPORT_PHONE}, 24h/24.</p>`),
  );
}

/** The customer asked to delete their account: the link confirms it (Better Auth, 24 h). */
export async function sendAccountDeletionLink(to: string, url: string) {
  await send(
    to,
    "Confirmez la suppression de votre compte Escale",
    `Pour supprimer définitivement votre compte, ouvrez ce lien dans le navigateur où vous êtes connecté : ${url}\n` +
      "Il est valable 24 heures. Si vous n'avez rien demandé, ignorez cet e-mail : votre compte reste intact.",
    layout(`<p><strong>Supprimer votre compte Escale ?</strong></p>
  <p>Vos réservations ne seront plus rattachées à vous : votre nom, votre téléphone et votre immatriculation en seront effacés. Seuls les montants et les dates restent, pour la comptabilité.</p>
  <p><a href="${url}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Supprimer définitivement mon compte</a></p>
  <p style="color:#737373">Ouvrez ce lien dans le navigateur où vous êtes connecté. Il est valable 24 heures. Si vous n'avez rien demandé, ignorez cet e-mail : votre compte reste intact.</p>`),
  );
}

/** Sent once the driver has picked the customer up: the link opens the review form. */
export async function sendReviewRequest(booking: Booking) {
  const link = `${appUrl()}/reservation/${booking.accessToken}#avis`;
  await send(
    booking.email,
    "Comment s'est passé votre retour ?",
    `Bon retour ! Donnez-nous votre avis en 10 secondes : ${link}`,
    layout(`<p><strong>Bon retour !</strong></p>
  <p>Comment s'est passé votre retour avec la navette ? Une note et, si vous le souhaitez, un mot : ça prend 10 secondes.</p>
  <p><a href="${link}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Donner mon avis</a></p>`),
  );
}

/** A customer registered at the desk: the car is already parked, only the return is left. */
export async function sendWalkInConfirmation(booking: Booking, parking: Parking) {
  const link = `${appUrl()}/reservation/${booking.accessToken}`;
  await send(
    booking.email,
    `Votre véhicule est garé · ${booking.reference}`,
    `Votre véhicule ${booking.plate} est garé au ${parking.name}, place ${booking.parkingSpot}.\n` +
      `Payé sur place : ${formatEuros(booking.priceCents)}. Retour prévu ${formatDateTime(booking.returnAt)}.\n` +
      `À votre retour, ouvrez ce lien et appuyez sur « J'ai mes bagages » : ${link}`,
    layout(`<p>Votre véhicule <strong>${escapeHtml(booking.plate)}</strong> est garé, place <strong style="font-family:monospace">${escapeHtml(booking.parkingSpot ?? "")}</strong>.</p>
  <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
    <tr><td style="color:#737373;padding:4px 0">Référence</td><td style="font-family:monospace">${escapeHtml(booking.reference)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Parking</td><td>${escapeHtml(parking.name)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Atterrissage retour</td><td>${formatDateTime(booking.returnAt)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Payé sur place</td><td>${formatEuros(booking.priceCents)}</td></tr>
  </table>
  <p>À votre retour, ouvrez votre réservation et appuyez sur « J'ai mes bagages » : la navette vient vous chercher. Un imprévu ? Appelez le ${SUPPORT_PHONE}, 24h/24.</p>
  <p><a href="${link}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ouvrir ma réservation</a></p>`),
  );
}

export async function sendBookingConfirmation(booking: Booking, parking: Parking) {
  const link = `${appUrl()}/reservation/${booking.accessToken}`;
  // Shown with cid: (an attached image): Gmail does not display data: images.
  const qr = await arrivalQrPng(booking.reference);
  await send(
    booking.email,
    `Réservation confirmée · ${booking.reference}`,
    `Votre réservation ${booking.reference} est confirmée.\n` +
      `${parking.name}, dépôt ${formatDateTime(booking.dropoffAt)}, retour ${formatDateTime(booking.returnAt)}.\n` +
      `À l'arrivée au parking, présentez le QR code de cet e-mail ou la référence ${booking.reference} à l'accueil.\n` +
      `À votre retour, ouvrez ce lien et appuyez sur « J'ai mes bagages » : ${link}`,
    layout(`<p>Votre réservation <strong>${escapeHtml(booking.reference)}</strong> est confirmée.</p>
  <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
    <tr><td style="color:#737373;padding:4px 0">Parking</td><td>${escapeHtml(parking.name)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Dépôt</td><td>${formatDateTime(booking.dropoffAt)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Atterrissage retour</td><td>${formatDateTime(booking.returnAt)}</td></tr>
    ${booking.discountCents > 0 ? `<tr><td style="color:#737373;padding:4px 0">Code promo</td><td>-${formatEuros(booking.discountCents)} (déduit)</td></tr>` : ""}
    <tr><td style="color:#737373;padding:4px 0">Montant payé</td><td>${formatEuros(booking.priceCents)}</td></tr>
  </table>
  <div style="text-align:center;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin:16px 0">
    <p style="margin:0 0 8px;font-weight:bold">À l'arrivée au parking</p>
    <img src="cid:arrival-qr" width="160" height="160" alt="QR code de la réservation ${escapeHtml(booking.reference)}" />
    <p style="margin:8px 0 0;color:#737373;font-size:13px">Présentez ce QR code à l'accueil, ou donnez la référence <strong style="color:#171717;font-family:monospace">${escapeHtml(booking.reference)}</strong>.</p>
  </div>
  <p>À votre retour, ouvrez votre réservation et appuyez sur « J'ai mes bagages » : la navette vient vous chercher. Un imprévu ? Appelez le ${SUPPORT_PHONE}, 24h/24.</p>
  <p><a href="${link}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ouvrir ma réservation</a></p>`),
    [{ filename: `${booking.reference}.png`, content: qr, cid: "arrival-qr" }],
  );
}
