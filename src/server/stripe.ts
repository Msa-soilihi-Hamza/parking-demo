import Stripe from "stripe";
import type { Booking, Parking } from "@/db/schema";
import { resolveAppUrl } from "@/lib/app-url";

let client: Stripe | null = null;

/** Keys are pasted by hand in the hosting dashboard: drop stray spaces and quotes. */
export function cleanSecret(value: string | undefined): string | undefined {
  const cleaned = value?.trim().replace(/^["']+|["']+$/g, "").trim();
  return cleaned || undefined;
}

/** Real Stripe, test mode only: test cards work, no money ever moves. */
export function getStripe(): Stripe {
  const secretKey = cleanSecret(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    throw new Error("Stripe n'est pas configuré : ajoutez STRIPE_SECRET_KEY dans .env.local.");
  }
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("Cette démo n'accepte que des clés Stripe de test (sk_test_...).");
  }
  client ??= new Stripe(secretKey);
  return client;
}

export function appUrl() {
  return resolveAppUrl({
    APP_URL: process.env.APP_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
}

export async function createCheckoutSession(booking: Booking, parking: Parking) {
  return getStripe().checkout.sessions.create({
    mode: "payment",
    locale: "fr",
    customer_email: booking.email ?? undefined,
    client_reference_id: booking.id,
    metadata: { bookingId: booking.id, reference: booking.reference },
    // Same length as the spot hold: an abandoned payment frees the spot.
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: booking.priceCents,
          product_data: {
            name: `Stationnement ${parking.name}`,
            // The detail the customer saw on the form, so the Stripe page matches it.
            description: [
              `Réservation ${booking.reference} · ${booking.plate}`,
              booking.discountCents > 0 && `code promo : -${(booking.discountCents / 100).toFixed(2).replace(".", ",")} €`,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        },
      },
    ],
    success_url: `${appUrl()}/reservation/${booking.accessToken}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/reserver?paiement=annule`,
  });
}
