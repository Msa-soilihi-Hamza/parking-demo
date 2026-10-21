import type Stripe from "stripe";
import { confirmPayment, releaseHold } from "@/server/bookings";
import { cleanSecret, getStripe } from "@/server/stripe";

// Stripe calls this after checkout. Signature checked, handlers idempotent:
// a duplicated event (Stripe retries) changes nothing the second time.
export async function POST(request: Request) {
  const secret = cleanSecret(process.env.STRIPE_WEBHOOK_SECRET);
  if (!secret) return Response.json({ error: "Webhook non configuré" }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Signature manquante" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Signature invalide" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;
    if (bookingId && session.payment_status === "paid") await confirmPayment(bookingId);
  }

  if (event.type === "checkout.session.expired") {
    const bookingId = event.data.object.metadata?.bookingId;
    if (bookingId) await releaseHold(bookingId);
  }

  return Response.json({ received: true });
}
