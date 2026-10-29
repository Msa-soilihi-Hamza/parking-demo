"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { advancePickupSchema, parseForm, pushEndpointSchema, pushSubscriptionSchema } from "@/lib/validation";
import { advancePickup } from "@/server/bookings";
import { sendReviewRequest } from "@/server/mailer";
import {
  deleteSubscription,
  notifyShuttleTeam,
  saveSubscription,
  type SubscriptionInput,
} from "@/server/push";
import { hasAccess, teamMember } from "@/server/team-access";

/** Registers this device for push notifications, as the signed-in driver's (shuttle team only). */
export async function subscribePushAction(sub: SubscriptionInput) {
  const member = await teamMember("navette");
  if (!member) throw new Error("Accès refusé.");
  const parsed = pushSubscriptionSchema.safeParse(sub);
  if (!parsed.success) throw new Error("Abonnement invalide.");
  await saveSubscription(parsed.data, member.id);
}

/** Turns off this device: only one of the driver's own. Also called on sign-out. */
export async function unsubscribePushAction(endpoint: string) {
  const member = await teamMember("navette");
  if (!member) return;
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return;
  await deleteSubscription(parsed.data, member.id);
}

/** Lets a driver check that notifications reach their device (sent to them only). */
export async function sendTestPushAction() {
  const member = await teamMember("navette");
  if (!member) throw new Error("Accès refusé.");
  return notifyShuttleTeam(
    {
      title: "Notifications activées",
      body: "Vous serez prévenu dès qu'un client a récupéré ses bagages.",
      url: "/navette",
      tag: "test",
    },
    { onlyUserId: member.id },
  );
}

export async function advancePickupAction(formData: FormData) {
  if (!(await hasAccess("navette"))) throw new Error("Accès refusé.");
  const form = parseForm(advancePickupSchema, formData);
  if (!form.ok) throw new Error("Statut invalide.");
  const { id, from, to } = form.data;
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
