import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { bookings, parkings, reviews, type Review } from "@/db/schema";

export const REVIEW_MAX_LENGTH = 500;

/** "Sarah Martin" → "Sarah M.": the public site never shows full names. */
export function authorNameFrom(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
}

export type ReviewInput = {
  accessToken: string;
  rating: number;
  comment: string | null;
  publishConsent: boolean;
};

export type ReviewResult = { ok: true } | { ok: false; error: string };

/** One review per booking, and only once the customer has actually been picked up. */
export async function submitReview(input: ReviewInput): Promise<ReviewResult> {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "Choisissez une note de 1 à 5 étoiles." };
  }
  const comment = input.comment?.trim().slice(0, REVIEW_MAX_LENGTH) || null;

  const [booking] = await db.select().from(bookings).where(eq(bookings.accessToken, input.accessToken));
  if (!booking || booking.status !== "confirmed") return { ok: false, error: "Réservation introuvable." };
  if (booking.pickupStatus !== "picked_up") {
    return { ok: false, error: "Vous pourrez donner votre avis une fois la navette arrivée." };
  }

  // The unique booking_id makes a second submission (double click, two tabs) a no-op.
  const inserted = await db
    .insert(reviews)
    .values({
      bookingId: booking.id,
      rating: input.rating,
      comment,
      publishConsent: input.publishConsent,
      authorName: authorNameFrom(booking.customerName),
    })
    .onConflictDoNothing({ target: reviews.bookingId })
    .returning({ id: reviews.id });
  if (inserted.length === 0) return { ok: false, error: "Vous avez déjà donné votre avis. Merci !" };
  return { ok: true };
}

export async function getReviewForBooking(bookingId: string): Promise<Review | null> {
  const [review] = await db.select().from(reviews).where(eq(reviews.bookingId, bookingId));
  return review ?? null;
}

export type PublicReview = {
  id: string;
  rating: number;
  comment: string;
  authorName: string;
  parkingName: string;
  createdAt: Date;
};

/** Reviews the customers agreed to publish, with a comment, newest first, whatever their rating. */
export async function listPublishedReviews(limit: number): Promise<PublicReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      comment: reviews.comment,
      authorName: reviews.authorName,
      parkingName: parkings.name,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(bookings, eq(reviews.bookingId, bookings.id))
    .innerJoin(parkings, eq(bookings.parkingId, parkings.id))
    .where(and(eq(reviews.publishConsent, true), isNotNull(reviews.comment), ne(reviews.comment, "")))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, comment: r.comment! }));
}
