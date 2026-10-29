import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

// Sign-in codes per e-mail address, whatever the IP. Better Auth limits per IP and
// gives each new code 5 tries: this caps the codes, so the tries, per account.

export const CODES_PER_HOUR = 6;
const WINDOW_MS = 60 * 60 * 1000;

/** Counts one more code for this address; false once the hour's budget is used up. */
export async function codeSendAllowed(email: string, now = Date.now()): Promise<boolean> {
  const key = `otp-email:${email.trim().toLowerCase()}`;
  // One atomic upsert in Better Auth's own rate-limit table: no race between two sends.
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO ${rateLimit} (id, key, count, last_request)
    VALUES (gen_random_uuid()::text, ${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN ${rateLimit.lastRequest} <= ${now - WINDOW_MS} THEN 1 ELSE ${rateLimit.count} + 1 END,
      last_request = CASE WHEN ${rateLimit.lastRequest} <= ${now - WINDOW_MS} THEN ${now} ELSE ${rateLimit.lastRequest} END
    RETURNING count
  `);
  return (result.rows[0]?.count ?? 0) <= CODES_PER_HOUR;
}
