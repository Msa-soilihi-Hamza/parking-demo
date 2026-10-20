"use server";

import { refresh } from "next/cache";
import { bagsButtonOpen } from "@/lib/pickup";
import { advancePickup, getBookingByToken } from "@/server/bookings";

export async function markBagsReadyAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const terminal = String(formData.get("terminal") ?? "");

  // The secret token in the link is the customer's only credential.
  const found = await getBookingByToken(token);
  if (!found) throw new Error("Réservation introuvable.");
  const { booking, parking } = found;

  if (!parking.terminals.includes(terminal)) throw new Error("Terminal inconnu.");
  if (!bagsButtonOpen(booking.returnAt, new Date())) {
    throw new Error("Le bouton s'active le jour de votre retour.");
  }

  // No-op if already pressed: the status guard in advancePickup handles double taps.
  await advancePickup({ accessToken: token }, "scheduled", "bags_ready", {
    returnTerminal: terminal,
  });
  refresh();
}
