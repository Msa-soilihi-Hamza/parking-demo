import { headers } from "next/headers";
import { spacesFor, type TeamSpace } from "@/lib/permissions";
import { auth } from "@/server/auth";

// The team spaces open to signed-in accounts whose role allows them (chauffeur,
// accueil, responsable). No shared code: every action is tied to a person.

export type { TeamSpace };

export const TEAM_HOMES: Record<TeamSpace, string> = {
  navette: "/navette",
  accueil: "/accueil",
  gestion: "/gestion",
};

export async function teamSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Checked on every team page and action: signed in, with a role that opens this space. */
export async function hasAccess(space: TeamSpace): Promise<boolean> {
  const session = await teamSession();
  return Boolean(session && spacesFor(session.user.role).includes(space));
}
