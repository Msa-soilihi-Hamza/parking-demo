// Integration test against the Docker database (`npm run db:up` first): the real
// Better Auth instance, sign-in with a code sent by e-mail.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { bookings, parkings, session, user } from "@/db/schema";

// The code is "sent" to this mock: the test reads it like the customer reads the e-mail.
const sent = vi.hoisted(() => ({
  codes: [] as { to: string; code: string }[],
  deletionLinks: [] as { to: string; url: string }[],
}));
vi.mock("./mailer", () => ({
  sendVerificationCode: vi.fn(async (to: string, code: string) => {
    sent.codes.push({ to, code });
  }),
  sendAccountDeletionLink: vi.fn(async (to: string, url: string) => {
    sent.deletionLinks.push({ to, url });
  }),
  sendBookingConfirmation: vi.fn(),
  sendWalkInConfirmation: vi.fn(),
}));

const { auth } = await import("./auth");
const { activeBookingOf } = await import("./account-deletion");

const email = `auth.${String(Date.now()).slice(-8)}@example.com`;
const lastCode = () => sent.codes.filter((c) => c.to === email).at(-1)!.code;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("sign-in with a code sent by e-mail", () => {
  it("sends a 6-digit code, then signs in and creates the account on first use", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    expect(lastCode()).toMatch(/^\d{6}$/);

    const result = await auth.api.signInEmailOTP({ body: { email, otp: lastCode() } });
    expect(result.user).toMatchObject({ email, emailVerified: true });

    const [account] = await db.select().from(user).where(eq(user.email, email));
    const sessions = await db.select().from(session).where(eq(session.userId, account.id));
    expect(sessions).toHaveLength(1);
  });

  it("refuses a wrong code", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const wrong = lastCode() === "000000" ? "111111" : "000000";
    await expect(auth.api.signInEmailOTP({ body: { email, otp: wrong } })).rejects.toThrow();
  });

  it("invalidates the code after 5 wrong attempts, even with the right one", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await auth.api.signInEmailOTP({ body: { email, otp: wrong } }).catch(() => {});
    }
    await expect(auth.api.signInEmailOTP({ body: { email, otp: right } })).rejects.toThrow();
  });

  it("stores only a hash of the code, never the code itself", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    // The verification table holds the pending code for this e-mail.
    const rows = await db.execute<{ value: string }>(
      sql`select value from verification where identifier like ${`%${email}%`}`,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) expect(row.value).not.toContain(lastCode());
  });
});

describe("deleting an account from Mon espace", () => {
  const tag = String(Date.now()).slice(-8);
  let parkingId: number;

  /** Signs in with the code, like the customer: returns the session cookie. */
  async function signIn(address: string): Promise<{ cookie: string; userId: string }> {
    await auth.api.sendVerificationOTP({ body: { email: address, type: "sign-in" } });
    const code = sent.codes.filter((c) => c.to === address).at(-1)!.code;
    const { headers, response } = await auth.api.signInEmailOTP({ body: { email: address, otp: code }, returnHeaders: true });
    const cookie = headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { cookie, userId: response.user.id };
  }

  /** Asks for deletion, then opens the e-mailed link in the signed-in browser. */
  async function deleteWithLink(address: string, cookie: string) {
    const asked = await auth.api.deleteUser({ body: { callbackURL: "/compte/supprime" }, headers: new Headers({ cookie }) });
    expect(asked).toEqual({ success: true, message: "Verification email sent" });
    const link = sent.deletionLinks.filter((l) => l.to === address).at(-1)!.url;
    return auth.handler(new Request(link, { headers: { cookie } }));
  }

  const booking = (userId: string, email: string, returnAt: Date, pickupStatus: "scheduled" | "picked_up") => ({
    reference: `ESC-DEL${tag}${pickupStatus === "scheduled" ? "A" : "B"}`,
    accessToken: `deletion-${tag}-${pickupStatus}-${userId.slice(0, 6)}`,
    parkingId,
    userId,
    customerName: "Camille Supprime",
    email,
    phone: "0712345678",
    plate: "DE-123-LE",
    passengers: 1,
    dropoffAt: new Date(returnAt.getTime() - 3 * 24 * 3600 * 1000),
    returnAt,
    priceCents: 4200,
    status: "confirmed" as const,
    pickupStatus,
  });

  afterAll(async () => {
    await db.delete(bookings).where(eq(bookings.parkingId, parkingId));
    await db.delete(parkings).where(eq(parkings.id, parkingId));
    await db.delete(user).where(eq(user.email, `encours.${tag}@example.com`));
  });

  it("deletes the account once the e-mailed link is opened, and anonymizes its bookings", async () => {
    [{ id: parkingId }] = await db
      .insert(parkings)
      .values({ slug: `deletion-${tag}`, name: "Suppression", airport: "Test", address: "Test", capacity: 10, dailyRateCents: 1000, terminals: ["T1"] })
      .returning({ id: parkings.id });
    const address = `supprime.${tag}@example.com`;
    const { cookie, userId } = await signIn(address);
    const [past] = await db
      .insert(bookings)
      .values(booking(userId, address, new Date("2026-01-10T08:00Z"), "picked_up"))
      .returning();

    const response = await deleteWithLink(address, cookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/compte/supprime");

    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, userId))).toHaveLength(0);
    const [kept] = await db.select().from(bookings).where(eq(bookings.id, past.id));
    // The accounting stays, the person is gone.
    expect(kept).toMatchObject({ priceCents: 4200, customerName: "Client supprimé", email: null, phone: "supprimé", plate: "supprimée", userId: null });
  });

  it("does not count a payment abandoned long ago as a stay under way", async () => {
    const owner = { id: `abandon-${tag}`, email: `abandon.${tag}@example.com` };
    await db.insert(bookings).values({
      ...booking("x", owner.email, new Date(Date.now() + 5 * 24 * 3600 * 1000), "scheduled"),
      reference: `ESC-ABN${tag}`,
      accessToken: `abandoned-${tag}`,
      userId: null,
      status: "pending_payment",
      heldAt: new Date(Date.now() - 2 * 3600 * 1000),
    });
    expect(await activeBookingOf(owner)).toBeNull();
  });

  it("refuses while a stay is under way, and keeps the account", async () => {
    const address = `encours.${tag}@example.com`;
    const { cookie, userId } = await signIn(address);
    await db.insert(bookings).values(booking(userId, address, new Date(Date.now() + 5 * 24 * 3600 * 1000), "scheduled"));

    const response = await deleteWithLink(address, cookie);
    expect(response.status).toBe(400);
    expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(1);
  });
});

describe("team roles, as Better Auth checks them", () => {
  const can = async (role: string, space: "navette" | "accueil" | "gestion") =>
    (await auth.api.userHasPermission({ body: { role: role as "user", permissions: { [space]: ["access"] } } })).success;

  it("gives the driver the shuttle only, and the front desk the desk only", async () => {
    expect(await can("chauffeur", "navette")).toBe(true);
    expect(await can("chauffeur", "accueil")).toBe(false);
    expect(await can("chauffeur", "gestion")).toBe(false);
    expect(await can("accueil", "accueil")).toBe(true);
    expect(await can("accueil", "navette")).toBe(false);
  });

  it("gives the manager every space", async () => {
    for (const space of ["navette", "accueil", "gestion"] as const) expect(await can("responsable", space)).toBe(true);
  });

  it("gives a customer none", async () => {
    for (const space of ["navette", "accueil", "gestion"] as const) expect(await can("user", space)).toBe(false);
  });

  it("creates every new account as a customer: a role is never chosen at sign-up", async () => {
    const address = `nouveau.${String(Date.now()).slice(-8)}@example.com`;
    await auth.api.sendVerificationOTP({ body: { email: address, type: "sign-in" } });
    const code = sent.codes.filter((c) => c.to === address).at(-1)!.code;
    const { user: created } = await auth.api.signInEmailOTP({ body: { email: address, otp: code } });
    const [row] = await db.select().from(user).where(eq(user.id, created.id));
    expect(row.role).toBe("user");
    await db.delete(user).where(eq(user.id, created.id));
  });
});
