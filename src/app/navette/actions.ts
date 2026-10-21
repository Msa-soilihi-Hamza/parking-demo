"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { PICKUP_STATUSES, type PickupStatus } from "@/lib/pickup";
import { advancePickup } from "@/server/bookings";
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
  redirect("/navette");
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
