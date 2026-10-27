import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

// Team roles (Better Auth admin plugin, custom access control). One permission per
// team space; customers keep the default "user" role and reach none of them.

export const TEAM_SPACES = ["navette", "accueil", "gestion"] as const;
export type TeamSpace = (typeof TEAM_SPACES)[number];

const statement = {
  ...defaultStatements,
  navette: ["access"],
  accueil: ["access"],
  gestion: ["access"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  /** Customers */
  user: ac.newRole({}),
  chauffeur: ac.newRole({ navette: ["access"] }),
  accueil: ac.newRole({ accueil: ["access"] }),
  /** The manager can do everything: every space, and the admin operations. */
  responsable: ac.newRole({
    navette: ["access"],
    accueil: ["access"],
    gestion: ["access"],
    ...adminAc.statements,
  }),
};

export type Role = keyof typeof roles;
export const TEAM_ROLES = ["chauffeur", "accueil", "responsable"] as const satisfies readonly Role[];

/** The spaces a role string ("chauffeur" or "chauffeur,accueil") opens. */
export function spacesFor(role: string | null | undefined): TeamSpace[] {
  const names = (role ?? "").split(",").map((r) => r.trim()) as Role[];
  return TEAM_SPACES.filter((space) =>
    // Own keys only: "toString" or "constructor" are "in" any object.
    names.some((name) => Object.hasOwn(roles, name) && roles[name].authorize({ [space]: ["access"] }).success),
  );
}

/** Where someone lands after signing in: their first team space, or "Mon espace". */
export function homeFor(role: string | null | undefined): string {
  const spaces = spacesFor(role);
  if (spaces.includes("gestion")) return "/gestion";
  return spaces[0] ? `/${spaces[0]}` : "/compte";
}
