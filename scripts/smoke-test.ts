// Production smoke test: runs the real booking flow against the database in DATABASE_URL
// (Neon with `npm run smoke:neon`), checks each step, then deletes everything it created.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, user } from "@/db/schema";
import { advancePickup, cancelPickupRequest, confirmPayment, holdBooking } from "@/server/bookings";
import { submitReview } from "@/server/reviews";

async function main() {
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log("Base :", host);

  // Booking requires an account: a throwaway customer, deleted at the end.
  const tag = Date.now().toString(36);
  const [customer] = await db
    .insert(user)
    .values({ id: `smoke-${tag}`, name: "Test Neon", email: `smoke.${tag}@example.com`, emailVerified: true })
    .returning();
  console.log("1. Compte client de test créé");

  let id: string | null = null;
  try {
    const dropoff = new Date(Date.now() + 3 * 86400_000);
    const ret = new Date(Date.now() + 6 * 86400_000);
    const held = await holdBooking(
      {
        parkingSlug: "orly",
        dropoffAt: dropoff,
        returnAt: ret,
        returnTerminal: null,
        customerName: "Test Neon",
        phone: "0600000000",
        plate: "NE-123-ON",
        passengers: 2,
      },
      { userId: customer.id, email: customer.email },
    );
    if (!held.ok) throw new Error(held.error);
    id = held.booking.id;
    console.log("2. Place bloquée pour le compte (transaction + FOR UPDATE) :", held.booking.reference, held.booking.status);
    console.log("3. Paiement confirmé :", await confirmPayment(id), "| 2e fois ignoré :", !(await confirmPayment(id)));
    const token = held.booking.accessToken;
    await advancePickup({ accessToken: token }, "scheduled", "bags_ready", { returnTerminal: "Orly 2" });
    console.log("4. Annulation du bouton :", await cancelPickupRequest(token));
    await advancePickup({ accessToken: token }, "scheduled", "bags_ready", { returnTerminal: "Orly 2" });
    await advancePickup({ id }, "bags_ready", "en_route");
    await advancePickup({ id }, "en_route", "picked_up");
    const review = await submitReview({ accessToken: token, rating: 5, comment: "Test", publishConsent: false });
    console.log("5. Avis enregistré :", review.ok);
  } finally {
    if (id) await db.delete(bookings).where(eq(bookings.id, id));
    await db.delete(user).where(eq(user.id, customer.id));
    const left = id ? await db.select().from(bookings).where(eq(bookings.id, id)) : [];
    console.log("6. Nettoyage (réservation, avis et compte supprimés) :", left.length === 0);
  }
}

main()
  .catch((error) => {
    console.error("ÉCHEC :", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
