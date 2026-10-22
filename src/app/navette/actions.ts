"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { arrivalPath, normalizeReference, normalizeSpot } from "@/lib/arrival";
import { PICKUP_STATUSES, type PickupStatus } from "@/lib/pickup";
import { advancePickup, checkInVehicle } from "@/server/bookings";
import { sendReviewRequest } from "@/server/mailer";
import {
  deleteSubscription,
  notifyShuttleTeam,
  saveSubscription,
  type SubscriptionInput,
} from "@/server/push";
import { hasShuttleAccess, SHUTTLE_COOKIE, shuttleAccessCode } from "@/server/shuttle-access";

/** Registers this device for push notifications (shuttle team only). */
export async function subscribePushAction(sub: SubscriptionInput) {
  if (!(await hasShuttleAccess())) throw new Error("Accès refusé.");
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Abonnement invalide.");
  }
  await saveSubscription(sub);
}

export async function unsubscribePushAction(endpoint: string) {
  if (!(await hasShuttleAccess())) throw new Error("Accès refusé.");
  await deleteSubscription(endpoint);
}

/** Lets a driver check that notifications reach this device. */
export async function sendTestPushAction() {
  if (!(await hasShuttleAccess())) throw new Error("Accès refusé.");
  return notifyShuttleTeam({
    title: "Notifications activées",
    body: "Vous serez prévenu dès qu'un client a récupéré ses bagages.",
    url: "/navette",
    tag: "test",
  });
}

export async function shuttleLoginAction(_prev: string | null, formData: FormData) {
  if (String(formData.get("code") ?? "").trim() !== shuttleAccessCode()) {
    return "Code incorrect.";
  }
  (await cookies()).set(SHUTTLE_COOKIE, shuttleAccessCode(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  // Back to the page that asked for the login (a scanned QR code), never outside the team space.
  const next = String(formData.get("next") ?? "");
  redirect(/^\/navette(\/[\w%-]+)*$/.test(next) ? next : "/navette");
}

/** Front desk: opens a booking from the reference typed by hand. */
export async function findArrivalAction(_prev: string | null, formData: FormData) {
  if (!(await hasShuttleAccess())) return "Accès refusé.";
  const reference = normalizeReference(String(formData.get("reference") ?? ""));
  if (!reference) return "Référence invalide : elle ressemble à ESC-AB12CD.";
  redirect(arrivalPath(reference));
}

export type CheckInState = { error?: string };

/** Front desk: the customer left the car at this spot. */
export async function checkInVehicleAction(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
  if (!(await hasShuttleAccess())) return { error: "Accès refusé." };
  const reference = normalizeReference(String(formData.get("reference") ?? ""));
  const spot = normalizeSpot(String(formData.get("spot") ?? ""));
  if (!reference) return { error: "Référence invalide." };
  if (!spot) return { error: "Indiquez la place : lettres et chiffres, par exemple B12." };
  const result = await checkInVehicle(reference, spot);
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}

export async function advancePickupAction(formData: FormData) {
  if (!(await hasShuttleAccess())) throw new Error("Accès refusé.");
  const id = String(formData.get("id") ?? "");
  const from = String(formData.get("from")) as PickupStatus;
  const to = String(formData.get("to")) as PickupStatus;
  if (!PICKUP_STATUSES.includes(from) || !PICKUP_STATUSES.includes(to)) {
    throw new Error("Statut invalide.");
  }
  const moved = await advancePickup({ id }, from, to);

  // Once the customer is in the shuttle, ask for a review (after the response).
  if (moved && to === "picked_up") {
    after(async () => {
      try {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
        if (booking) await sendReviewRequest(booking);
      } catch (error) {
        console.error("Review request e-mail failed", error);
      }
    });
  }
  refresh();
}

export async function shuttleLogoutAction() {
  (await cookies()).delete(SHUTTLE_COOKIE);
  redirect("/");
}
