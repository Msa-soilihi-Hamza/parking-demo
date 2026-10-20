"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { advancePickup, cancelPickupRequest, getBookingByToken } from "@/server/bookings";
import { sendPickupRequestReceived } from "@/server/mailer";

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

  // The confirmation e-mail goes out after the response, so the page updates at once.
  if (sent) {
    after(async () => {
      try {
        await sendPickupRequestReceived(booking, terminal);
      } catch (error) {
        console.error("Pickup confirmation e-mail failed", error);
      }
    });
  }
  refresh();
}

export async function cancelPickupRequestAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  await cancelPickupRequest(token);
  refresh();
}
