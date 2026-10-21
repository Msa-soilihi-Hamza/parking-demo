// Proves the live chain Stripe → Vercel webhook → Neon with a real Stripe event,
// then deletes the test booking. Usage: npm run webhook:check
import { config } from "dotenv";
import { Client } from "pg";
import Stripe from "stripe";

config({ path: ".env.local", quiet: true });
const stripeKey = process.env.STRIPE_SECRET_KEY;
config({ path: ".env.neon", quiet: true, override: true });

(async () => {
  if (!stripeKey?.startsWith("sk_test_")) throw new Error("Clé Stripe de test requise.");
  const stripe = new Stripe(stripeKey);
  const db = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  await db.connect();
  const { rows } = await db.query(
    `INSERT INTO bookings (reference, access_token, parking_id, customer_name, email, phone, plate, passengers,
       dropoff_at, return_at, price_cents, status, held_at)
     SELECT 'ESC-WEBHOOK', 'webhook-check-' || md5(random()::text), id, 'Test Webhook', 'webhook@example.com',
       '0600000000', 'WE-123-BH', 1, now() + interval '5 days', now() + interval '7 days', 2800,
       'pending_payment', now()
     FROM parkings WHERE slug = 'orly' RETURNING id`,
  );
  const bookingId = rows[0].id;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      metadata: { bookingId },
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: 2800, product_data: { name: "Test webhook" } } }],
      success_url: "https://parking-demo-two.vercel.app/",
    });
    await stripe.checkout.sessions.expire(session.id);
    console.log("1. Session Stripe créée puis expirée :", session.id.slice(0, 20) + "…");

    let status = "pending_payment";
    for (let i = 0; i < 20 && status === "pending_payment"; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      status = (await db.query("SELECT status FROM bookings WHERE id = $1", [bookingId])).rows[0].status;
    }
    console.log("2. Statut dans Neon après l'événement Stripe :", status);
    console.log(status === "cancelled" ? "✓ Stripe → site Vercel → Neon fonctionne" : "✗ L'événement n'a pas été traité");
  } finally {
    await db.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    console.log("3. Réservation de test supprimée");
    await db.end();
  }
})().catch((error: Error) => {
  console.error("Erreur :", error.message);
  process.exitCode = 1;
});
