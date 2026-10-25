import { cookies } from "next/headers";

// Demo-grade gate for the team spaces: a shared code per space, stored in an
// httpOnly cookie. The drivers, the front desk and the manager each have their own.
export const TEAM_SPACES = {
  navette: { cookie: "navette_access", env: "SHUTTLE_ACCESS_CODE", fallback: "navette", home: "/navette" },
  accueil: { cookie: "accueil_access", env: "DESK_ACCESS_CODE", fallback: "accueil", home: "/accueil" },
  gestion: { cookie: "gestion_access", env: "MANAGER_ACCESS_CODE", fallback: "gestion", home: "/gestion" },
} as const;

export type TeamSpace = keyof typeof TEAM_SPACES;

export function isTeamSpace(value: unknown): value is TeamSpace {
  // Own keys only: "toString" or "constructor" are "in" any object.
  return typeof value === "string" && Object.hasOwn(TEAM_SPACES, value);
}

export function accessCode(space: TeamSpace) {
  const { env, fallback } = TEAM_SPACES[space];
  return process.env[env]?.trim() || fallback;
}

export async function hasAccess(space: TeamSpace) {
  return (await cookies()).get(TEAM_SPACES[space].cookie)?.value === accessCode(space);
}
