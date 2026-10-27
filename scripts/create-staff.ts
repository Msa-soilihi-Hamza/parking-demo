// Gives a team role to an account, directly in the database (the team is never created
// from the website). Creates the account if it does not exist yet; the person then signs
// in with this e-mail (code or Google) and lands on their space.
//
//   npm run staff -- <e-mail> <chauffeur|accueil|responsable|user> ["Nom affiché"]
//   npm run staff:neon -- ...   (production)
//
// "user" removes the team role (back to a customer account).
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { session, user } from "@/db/schema";
import { TEAM_ROLES } from "@/lib/permissions";

const ROLES = [...TEAM_ROLES, "user"] as const;

async function main() {
  const [rawEmail, role, ...nameParts] = process.argv.slice(2);
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !ROLES.includes(role as (typeof ROLES)[number])) {
    console.error(`Usage : npm run staff -- <e-mail> <${ROLES.join("|")}> ["Nom"]`);
    process.exitCode = 1;
    return;
  }
  const name = nameParts.join(" ").trim();

  const [existing] = await db.select().from(user).where(sql`lower(${user.email}) = ${email}`);
  if (existing) {
    await db.update(user).set({ role, ...(name ? { name } : {}) }).where(eq(user.id, existing.id));
    // A changed role applies at once: the person signs in again with the new rights.
    await db.delete(session).where(eq(session.userId, existing.id));
    console.log(`Compte existant : rôle « ${role} » attribué, sessions fermées.`);
  } else {
    await db.insert(user).values({ id: randomUUID(), email, name: name || email.split("@")[0], emailVerified: true, role });
    console.log(`Compte créé avec le rôle « ${role} ». Connexion avec cet e-mail (code ou Google).`);
  }
}

main()
  .catch((error) => {
    console.error("ÉCHEC :", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
