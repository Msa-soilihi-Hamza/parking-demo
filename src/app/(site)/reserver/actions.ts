"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { parisLocalToDate } from "@/lib/time";
import { auth } from "@/server/auth";
import { attachStripeSession, getHeldBooking, holdBooking, listParkings, priceStay } from "@/server/bookings";
import { createCheckoutSession, getStripe } from "@/server/stripe";

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
  const dropoffAt = parisLocalToDate(String(input.dropoffAt ?? ""));
  const returnAt = parisLocalToDate(String(input.returnAt ?? ""));
  if (!dropoffAt || !returnAt) return { ok: false, error: "Choisissez vos dates." };
  const parking = (await listParkings()).find((p) => p.slug === input.parking);
  if (!parking) return { ok: false, error: "Parking inconnu." };

  const price = await priceStay({ parking, dropoffAt, returnAt, promoCode: input.promoCode?.slice(0, 40) });
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

const localDateTime = z.string().transform((value, ctx) => {
  const date = parisLocalToDate(value);
  if (!date) {
    ctx.addIssue({ code: "custom", message: "Date invalide." });
    return z.NEVER;
  }
  return date;
});

// No e-mail field: it comes from the signed-in account, already verified.
const detailsSchema = z.object({
  parking: z.string().min(1, "Choisissez un parking."),
  dropoffAt: localDateTime,
  returnAt: localDateTime,
  returnTerminal: z
    .string()
    .optional()
    .transform((v) => (v && v !== "inconnu" ? v : null)),
  customerName: z.string().trim().min(2, "Indiquez votre nom."),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s.-]{7,}$/, "Numéro de téléphone invalide."),
  plate: z
    .string()
    .trim()
    .min(4, "Plaque invalide.")
    .transform((v) => v.toUpperCase()),
  passengers: z.coerce.number().int().min(1).max(8),
  promoCode: z
    .string()
    .optional()
    .transform((v) => v?.trim() || null),
});

function formValues(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([key, value]) => !key.startsWith("$") && typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );
}

/**
 * The signed-in customer confirms: the spot is held (under lock) and Stripe Checkout
 * opens. Booking requires an account: the session is checked here, on the server.
 */
export async function submitDetailsAction(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  const values = formValues(formData);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Connectez-vous pour réserver.", signInRequired: true, values };

  const parsed = detailsSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Vérifiez les champs indiqués.", fieldErrors, values };
  }
  const data = parsed.data;
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
    const session = await createCheckoutSession(held.booking, held.parking);
    await attachStripeSession(held.booking.id, session.id);
    checkoutUrl = session.url!;
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
  const bookingId = String(formData.get("bookingId") ?? "");
  const held = await getHeldBooking(bookingId);
  if (!held || held.booking.userId !== session.user.id) {
    return { error: "Le délai de paiement est dépassé : la place a été libérée. Recommencez la réservation." };
  }
  return startCheckout(bookingId);
}
