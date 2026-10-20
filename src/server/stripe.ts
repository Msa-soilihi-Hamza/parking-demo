import Stripe from "stripe";
import type { Booking, Parking } from "@/db/schema";

let client: Stripe | null = null;

/** Real Stripe, test mode only: test cards work, no money ever moves. */
export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
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
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function createCheckoutSession(booking: Booking, parking: Parking) {
  return getStripe().checkout.sessions.create({
    mode: "payment",
    locale: "fr",
    customer_email: booking.email,
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
            description: `Réservation ${booking.reference} · ${booking.plate}`,
          },
        },
      },
    ],
    success_url: `${appUrl()}/reservation/${booking.accessToken}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/reserver?paiement=annule`,
  });
}
