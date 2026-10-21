"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parisLocalToDate } from "@/lib/time";
import {
  attachStripeSession,
  createUnverifiedBooking,
  getHeldBooking,
  resendCode,
  verifyEmailAndHold,
} from "@/server/bookings";
import { createCheckoutSession, getStripe } from "@/server/stripe";

export type DetailsState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
  // Set once the code has been sent: the form switches to the code step.
  pending?: { bookingId: string; email: string };
};

const localDateTime = z.string().transform((value, ctx) => {
  const date = parisLocalToDate(value);
  if (!date) {
    ctx.addIssue({ code: "custom", message: "Date invalide." });
    return z.NEVER;
  }
  return date;
});

const detailsSchema = z.object({
  parking: z.string().min(1, "Choisissez un parking."),
  dropoffAt: localDateTime,
  returnAt: localDateTime,
  returnTerminal: z
    .string()
    .optional()
    .transform((v) => (v && v !== "inconnu" ? v : null)),
  customerName: z.string().trim().min(2, "Indiquez votre nom."),
  email: z.email("E-mail invalide."),
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
});

function formValues(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(([key, value]) => !key.startsWith("$") && typeof value === "string")
      .map(([key, value]) => [key, value as string]),
  );
}

export async function submitDetailsAction(
  _prev: DetailsState,
  formData: FormData,
): Promise<DetailsState> {
  const values = formValues(formData);
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

  try {
    const result = await createUnverifiedBooking({ ...data, parkingSlug: data.parking });
    if (!result.ok) return { error: result.error, values };
    return { values, pending: { bookingId: result.booking.id, email: result.booking.email } };
  } catch (error) {
    console.error(error);
    return { error: "Impossible d'envoyer le code de vérification. Réessayez.", values };
  }
}

export type CodeState = {
  error?: string;
  info?: string;
  /** Set when Stripe failed after the spot was held: the payment can be retried. */
  retryBookingId?: string;
};

export async function verifyCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const bookingId = String(formData.get("bookingId") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!/^\d{6}$/.test(code)) return { error: "Entrez les 6 chiffres reçus par e-mail." };

  // Fail before using up the code if payments are not set up.
  try {
    getStripe();
  } catch (error) {
    console.error(error);
    return { error: "Le paiement n'est pas encore configuré sur ce site." };
  }

  const result = await verifyEmailAndHold(bookingId, code);
  if (!result.ok) return { error: result.error };

  return startCheckout(result.booking.id);
}

/**
 * Opens Stripe Checkout for a verified booking whose spot is held. If Stripe fails,
 * the spot stays held and the customer gets a retry button instead of a dead end.
 */
async function startCheckout(bookingId: string): Promise<CodeState> {
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

export async function retryPaymentAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  return startCheckout(String(formData.get("bookingId") ?? ""));
}

export async function resendCodeAction(bookingId: string): Promise<CodeState> {
  try {
    const result = await resendCode(bookingId);
    return result.ok ? { info: "Un nouveau code vient de partir." } : { error: result.error };
  } catch (error) {
    console.error(error);
    return { error: "Impossible d'envoyer le code. Réessayez." };
  }
}
