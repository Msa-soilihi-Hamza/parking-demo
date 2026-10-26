// Integration test against the Docker database (`npm run db:up` first): the real
// Better Auth instance, sign-in with a code sent by e-mail.
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { session, user } from "@/db/schema";

// The code is "sent" to this mock: the test reads it like the customer reads the e-mail.
const sent = vi.hoisted(() => ({ codes: [] as { to: string; code: string }[] }));
vi.mock("./mailer", () => ({
  sendVerificationCode: vi.fn(async (to: string, code: string) => {
    sent.codes.push({ to, code });
  }),
  sendBookingConfirmation: vi.fn(),
  sendWalkInConfirmation: vi.fn(),
}));

const { auth } = await import("./auth");

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
