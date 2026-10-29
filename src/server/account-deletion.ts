import { and, eq, gt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { HOLD_COUNTED_MINUTES, ownedBy, type Owner } from "@/server/bookings";

// A customer deletes their account ("Mon espace"). Better Auth deletes the account,
// its sessions and sign-in methods; these rules decide when it is allowed and what
// happens to the bookings. Same bookings as "Mon espace" (ownedBy).

const ofOwner = ownedBy;

/**
 * A stay still under way (spot held for payment, car not back yet): the account is
 * needed until the customer is home. Returns its reference, or null.
 */
export async function activeBookingOf(owner: Owner, now = new Date()): Promise<string | null> {
  const [active] = await db
    .select({ reference: bookings.reference })
    .from(bookings)
    .where(
      and(
        ofOwner(owner),
        // Paid, or a spot still held for payment (an abandoned payment holds nothing).
        or(
          eq(bookings.status, "confirmed"),
          and(
            eq(bookings.status, "pending_payment"),
            gt(bookings.heldAt, new Date(now.getTime() - HOLD_COUNTED_MINUTES * 60 * 1000)),
          ),
        ),
        ne(bookings.pickupStatus, "picked_up"),
        // A return planned more than a day ago without pickup is an old leftover, not a stay.
        gt(bookings.returnAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      ),
    )
    .limit(1);
  return active?.reference ?? null;
}

/**
 * After deletion: the bookings stay (amounts and dates are accounting records) but no
 * longer say who the customer was. Published reviews keep only "Sarah M.".
 */
export async function anonymizeBookingsOf(owner: Owner): Promise<number> {
  const updated = await db
    .update(bookings)
    .set({ customerName: "Client supprimé", email: null, phone: "supprimé", plate: "supprimée", userId: null })
    .where(ofOwner(owner))
    .returning({ id: bookings.id });
  return updated.length;
}
