"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { advancePickup, cancelPickupRequest, getBookingByToken } from "@/server/bookings";
import { sendPickupRequestReceived } from "@/server/mailer";
import { bagsReadyNotification, notifyShuttleTeam, pickupCancelledNotification } from "@/server/push";
import { submitReview } from "@/server/reviews";

export async function markBagsReadyAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const terminal = String(formData.get("terminal") ?? "");

  // The secret token in the link is the customer's only credential.
  const found = await getBookingByToken(token);
  if (!found) throw new Error("Réservation introuvable.");
  const { booking, parking } = found;
  if (!parking.terminals.includes(terminal)) throw new Error("Terminal inconnu.");

  // No-op if already pressed: the status guard in advancePickup handles double taps.
  const sent = await advancePickup({ accessToken: token }, "scheduled", "bags_ready", {
    returnTerminal: terminal,
  });

  // The push to the drivers and the customer's e-mail go out after the response,
  // so the page updates at once; one failing does not stop the other.
  if (sent) {
    after(async () => {
      const results = await Promise.allSettled([
        notifyShuttleTeam(
          bagsReadyNotification({
            bookingId: booking.id,
            customerName: booking.customerName,
            terminal,
            passengers: booking.passengers,
          }),
        ),
        sendPickupRequestReceived(booking, terminal),
      ]);
      for (const result of results) {
        if (result.status === "rejected") console.error("Bags-ready follow-up failed", result.reason);
      }
    });
  }
  refresh();
}

export type ReviewFormState = { error?: string };

export async function submitReviewAction(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const result = await submitReview({
    accessToken: String(formData.get("token") ?? ""),
    rating: Number(formData.get("rating")),
    comment: String(formData.get("comment") ?? "") || null,
    publishConsent: formData.get("publishConsent") === "on",
  });
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}

export async function cancelPickupRequestAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const found = await getBookingByToken(token);
  const cancelled = await cancelPickupRequest(token);

  // Tell the drivers right away, so nobody leaves for a customer who no longer waits.
  if (cancelled && found) {
    const { booking } = found;
    after(async () => {
      try {
        await notifyShuttleTeam(
          pickupCancelledNotification({
            bookingId: booking.id,
            customerName: booking.customerName,
            terminal: booking.returnTerminal,
          }),
        );
      } catch (error) {
        console.error("Cancel push failed", error);
      }
    });
  }
  refresh();
}
