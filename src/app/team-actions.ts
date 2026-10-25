"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessCode, isTeamSpace, TEAM_SPACES } from "@/server/team-access";

/** Login to one team space; the code of the other space does not open it. */
export async function teamLoginAction(_prev: string | null, formData: FormData) {
  const space = formData.get("space");
  if (!isTeamSpace(space)) return "Espace inconnu.";
  if (String(formData.get("code") ?? "").trim() !== accessCode(space)) return "Code incorrect.";

  (await cookies()).set(TEAM_SPACES[space].cookie, accessCode(space), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  // Back to the page that asked for the login (a scanned QR code), never outside this space.
  const next = String(formData.get("next") ?? "");
  const home = TEAM_SPACES[space].home;
  redirect(next === home || (next.startsWith(`${home}/`) && /^[\w/%-]+$/.test(next)) ? next : home);
}

export async function teamLogoutAction(formData: FormData) {
  const space = formData.get("space");
  if (isTeamSpace(space)) (await cookies()).delete(TEAM_SPACES[space].cookie);
  redirect("/");
}
