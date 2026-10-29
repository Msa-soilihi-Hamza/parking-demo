"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema";
import { bookingDetailsSchema, parseForm, quoteInputSchema, retryPaymentSchema } from "@/lib/validation";
import { auth } from "@/server/auth";
import {
  attachStripeSession,
  confirmPayment,
  getHeldBooking,
  holdBooking,
  listParkings,
  priceStay,
  renewHold,
} from "@/server/bookings";
import { closeCheckoutSession, createCheckoutSession, getStripe } from "@/server/stripe";

export type QuoteInput = { parking: string; dropoffAt: string; returnAt: string; promoCode?: string };

export type QuoteResult =
  | {
      ok: true;
      days: number;
      lines: { label: string; days: number; unitCents: number; totalCents: number }[];
      baseCents: number;
      discountCents: number;
      totalCents: number;
      promo: { code: string; label: string } | null;
      promoError: string | null;
    }
  | { ok: false; error: string };

/** The live price on the booking form, computed by the server (the promo code is checked there). */
export async function quoteStayAction(input: QuoteInput): Promise<QuoteResult> {
  // A Server Action is a public endpoint: the input is checked whatever the page sent.
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { dropoffAt, returnAt, promoCode } = parsed.data;
  const parking = (await listParkings()).find((p) => p.slug === parsed.data.parking);
  if (!parking) return { ok: false, error: "Parking inconnu." };

  // The price does not depend on how full the parking is: no occupancy query for anyone.
  const price = await priceStay({ parking, dropoffAt, returnAt, promoCode }, undefined, { occupancy: false });
  if (!price.ok) return price;
  return {
    ok: true,
    days: price.days,
    lines: price.lines,
    baseCents: price.baseCents,
    discountCents: price.discountCents,
    totalCents: price.totalCents,
    promo: price.promo && { code: price.promo.code, label: price.promo.label },
    promoError: price.promoError,
  };
}

export type DetailsState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  /** The session ended while filling the form: show the sign-in again. */
  signInRequired?: boolean;
  /** Set when Stripe failed after the spot was held: the payment can be retried. */
  retryBookingId?: string;
};

/**
 * The signed-in customer confirms: the spot is held (under lock) and Stripe Checkout
 * opens. Booking requires an account: the session is checked here, on the server.
 */
export async function submitDetailsAction(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  const form = parseForm(bookingDetailsSchema, formData);
  const { values } = form;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Connectez-vous pour réserver.", signInRequired: true, values };
  if (!form.ok) return { error: "Vérifiez les champs indiqués.", fieldErrors: form.fieldErrors, values };
  const data = form.data;
  if (data.dropoffAt.getTime() < Date.now() - 15 * 60 * 1000) {
    return { fieldErrors: { dropoffAt: "Le dépôt doit être dans le futur." }, values };
  }

  // Fail before holding a spot if payments are not set up.
  try {
    getStripe();
  } catch (error) {
    console.error(error);
    return { error: "Le paiement n'est pas encore configuré sur ce site.", values };
  }

  const held = await holdBooking(
    { ...data, parkingSlug: data.parking },
    { userId: session.user.id, email: session.user.email },
  );
  if (!held.ok) return { error: held.error, values };
  // An account created with an e-mail code has no name yet: take the one just typed.
  if (!session.user.name) {
    await db.update(user).set({ name: data.customerName }).where(and(eq(user.id, session.user.id), eq(user.name, "")));
  }
  return { ...(await startCheckout(held.booking.id)), values };
}

/**
 * Opens Stripe Checkout for a booking whose spot is held. If Stripe fails, the spot
 * stays held and the customer gets a retry button instead of a dead end.
 */
async function startCheckout(bookingId: string): Promise<DetailsState> {
  const held = await getHeldBooking(bookingId);
  if (!held) {
    return { error: "Le délai de paiement est dépassé : la place a été libérée. Recommencez la réservation." };
  }

  let checkoutUrl: string;
  try {
    // A retry: the old session is closed (or was paid: the booking is confirmed), and the
    // hold restarts so it lasts as long as the new session.
    if (held.booking.stripeSessionId && (await closeCheckoutSession(held.booking.stripeSessionId)) === "paid") {
      await confirmPayment(held.booking.id);
      checkoutUrl = `/reservation/${held.booking.accessToken}`;
    } else {
      if (held.booking.stripeSessionId) await renewHold(held.booking.id);
      const session = await createCheckoutSession(held.booking, held.parking);
      await attachStripeSession(held.booking.id, session.id);
      checkoutUrl = session.url!;
    }
  } catch (error) {
    console.error("Stripe Checkout failed:", error instanceof Error ? error.message : error);
    return {
      error: "Le paiement n'a pas pu démarrer. Votre place reste réservée 30 minutes, réessayez.",
      retryBookingId: held.booking.id,
    };
  }
  redirect(checkoutUrl);
}

/** Only the customer who holds the spot can retry its payment. */
export async function retryPaymentAction(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Connectez-vous pour réserver.", signInRequired: true };
  const form = parseForm(retryPaymentSchema, formData);
  const held = form.ok ? await getHeldBooking(form.data.bookingId) : null;
  if (!held || held.booking.userId !== session.user.id) {
    return { error: "Le délai de paiement est dépassé : la place a été libérée. Recommencez la réservation." };
  }
  return startCheckout(held.booking.id);
}
