import nodemailer from "nodemailer";
import type { Booking, Parking } from "@/db/schema";
import { formatEuros } from "@/lib/pricing";
import { formatDateTime } from "@/lib/time";
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

async function send(to: string, subject: string, text: string, html: string) {
  if (!transporter) {
    // Development only: without SMTP settings, print the e-mail in the server console.
    if (process.env.NODE_ENV !== "production") {
      console.info(`\n[e-mail non envoyé : Gmail non configuré]\nÀ : ${to}\nObjet : ${subject}\n${text}\n`);
      return;
    }
    throw new Error("L'envoi d'e-mails n'est pas configuré (GMAIL_USER, GMAIL_APP_PASSWORD).");
  }
  await transporter.sendMail({ from: `"Escale Parking" <${user}>`, to, subject, text, html });
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

export async function sendBookingConfirmation(booking: Booking, parking: Parking) {
  const link = `${appUrl()}/reservation/${booking.accessToken}`;
  await send(
    booking.email,
    `Réservation confirmée · ${booking.reference}`,
    `Votre réservation ${booking.reference} est confirmée.\n` +
      `${parking.name}, dépôt ${formatDateTime(booking.dropoffAt)}, retour ${formatDateTime(booking.returnAt)}.\n` +
      `À votre retour, ouvrez ce lien et appuyez sur « J'ai mes bagages » : ${link}`,
    layout(`<p>Votre réservation <strong>${booking.reference}</strong> est confirmée.</p>
  <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
    <tr><td style="color:#737373;padding:4px 0">Parking</td><td>${parking.name}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Dépôt</td><td>${formatDateTime(booking.dropoffAt)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Atterrissage retour</td><td>${formatDateTime(booking.returnAt)}</td></tr>
    <tr><td style="color:#737373;padding:4px 0">Montant payé</td><td>${formatEuros(booking.priceCents)}</td></tr>
  </table>
  <p>À votre retour, pas besoin d'appeler : ouvrez votre réservation et appuyez sur « J'ai mes bagages ».</p>
  <p><a href="${link}" style="display:inline-block;background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Ouvrir ma réservation</a></p>`),
  );
}
