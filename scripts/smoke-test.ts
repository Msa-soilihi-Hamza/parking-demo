// Production smoke test: runs the real booking flow against the database in DATABASE_URL
// (Neon with `npm run smoke:neon`), checks each step, then deletes everything it created.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import {
  advancePickup,
  cancelPickupRequest,
  confirmPayment,
  createUnverifiedBooking,
  verifyEmailAndHold,
} from "@/server/bookings";
import { hashCode } from "@/server/email-code";
import { submitReview } from "@/server/reviews";

async function main() {
  const host = new URL(process.env.DATABASE_URL!).host;
  console.log("Base :", host);

  const dropoff = new Date(Date.now() + 3 * 86400_000);
  const ret = new Date(Date.now() + 6 * 86400_000);
  const created = await createUnverifiedBooking({
    parkingSlug: "orly",
    dropoffAt: dropoff,
    returnAt: ret,
    returnTerminal: null,
    customerName: "Test Neon",
    email: "test-neon@example.com",
    phone: "0600000000",
    plate: "NE-123-ON",
    passengers: 2,
  });
  if (!created.ok) throw new Error(created.error);
  const id = created.booking.id;
  console.log("1. Demande créée :", created.booking.reference, created.booking.status);

  try {
    await db.update(bookings).set({ emailCodeHash: hashCode(id, "123456") }).where(eq(bookings.id, id));
    const wrong = await verifyEmailAndHold(id, "000000");
    console.log("2. Mauvais code refusé :", !wrong.ok);
    const held = await verifyEmailAndHold(id, "123456");
    console.log("3. Code OK, place bloquée (transaction + FOR UPDATE) :", held.ok && held.booking.status);
    console.log("4. Paiement confirmé :", await confirmPayment(id), "| 2e fois ignoré :", !(await confirmPayment(id)));
    const token = created.booking.accessToken;
    await advancePickup({ accessToken: token }, "scheduled", "bags_ready", { returnTerminal: "Orly 2" });
    console.log("5. Annulation du bouton :", await cancelPickupRequest(token));
    await advancePickup({ accessToken: token }, "scheduled", "bags_ready", { returnTerminal: "Orly 2" });
    await advancePickup({ id }, "bags_ready", "en_route");
    await advancePickup({ id }, "en_route", "picked_up");
    const review = await submitReview({ accessToken: token, rating: 5, comment: "Test", publishConsent: false });
    console.log("6. Avis enregistré :", review.ok);
  } finally {
    await db.delete(bookings).where(eq(bookings.id, id));
    const left = await db.select().from(bookings).where(eq(bookings.id, id));
    console.log("7. Nettoyage (réservation + avis supprimés) :", left.length === 0);
  }
}

main()
  .catch((error) => {
    console.error("ÉCHEC :", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
