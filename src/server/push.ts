import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions, user } from "@/db/schema";
import { spacesFor } from "@/lib/permissions";

// Web Push to the shuttle team's devices. Free and standard (VAPID keys); works on
// Android, desktop browsers, and iPhone once the site is added to the home screen.

export type PushPayload = { title: string; body: string; url: string; tag?: string };

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:contact@example.com", publicKey, privateKey);
  configured = true;
  return true;
}

export type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

/** This device now belongs to this team member (re-subscribing moves it to them). */
export async function saveSubscription(sub: SubscriptionInput, userId: string) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
}

/** Only the team member's own device: nobody turns off a colleague's notifications. */
export async function deleteSubscription(endpoint: string, userId: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
}

/**
 * Sends to the devices of the people who open the shuttle space right now (role checked
 * at each send: a removed or banned driver gets nothing), or only to one person's devices.
 * Forgets the devices the push service says are gone.
 */
export async function notifyShuttleTeam(
  payload: PushPayload,
  { onlyUserId }: { onlyUserId?: string } = {},
): Promise<{ sent: number; removed: number }> {
  if (!configure()) {
    console.info("[push] VAPID keys missing: notification skipped");
    return { sent: 0, removed: 0 };
  }
  const rows = await db
    .select({ subscription: pushSubscriptions, role: user.role, banned: user.banned })
    .from(pushSubscriptions)
    .innerJoin(user, eq(pushSubscriptions.userId, user.id))
    .where(onlyUserId ? eq(pushSubscriptions.userId, onlyUserId) : undefined);
  const subscriptions = rows
    .filter((r) => !r.banned && spacesFor(r.role).includes("navette"))
    .map((r) => r.subscription);
  const gone: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 15 * 60, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the subscription expired.
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else console.error("[push] send failed", status, (error as Error).message);
      }
    }),
  );

  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone));
  return { sent, removed: gone.length };
}

/** "Sarah Martin" → "Sarah M.": enough for the driver, no full name on a lock screen. */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** The notification a driver gets when a customer presses "J'ai mes bagages". */
export function bagsReadyNotification(input: {
  bookingId: string;
  customerName: string;
  terminal: string;
  passengers: number;
}): PushPayload {
  const name = shortName(input.customerName);
  return {
    title: `Bagages récupérés · ${input.terminal}`,
    body: `${name} attend avec ${input.passengers} passager${input.passengers > 1 ? "s" : ""}. Touchez pour partir le chercher.`,
    url: `/navette#client-${input.bookingId}`,
    tag: `client-${input.bookingId}`,
  };
}

/**
 * Sent when the customer cancels "J'ai mes bagages" before a driver left. Same tag as the
 * request: it replaces that notification on the driver's screen instead of piling up.
 */
export function pickupCancelledNotification(input: {
  bookingId: string;
  customerName: string;
  terminal: string | null;
}): PushPayload {
  return {
    title: `Demande annulée${input.terminal ? ` · ${input.terminal}` : ""}`,
    body: `${shortName(input.customerName)} n'a pas encore ses bagages : ne partez pas pour l'instant.`,
    url: "/navette",
    tag: `client-${input.bookingId}`,
  };
}
