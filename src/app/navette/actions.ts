"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PICKUP_STATUSES, type PickupStatus } from "@/lib/pickup";
import { advancePickup } from "@/server/bookings";
import { hasShuttleAccess, SHUTTLE_COOKIE, shuttleAccessCode } from "@/server/shuttle-access";

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
  await advancePickup({ id }, from, to);
  refresh();
}
