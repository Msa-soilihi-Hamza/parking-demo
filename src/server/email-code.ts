import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_DELAY_MS = 60 * 1000;

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Only the hash is stored; salting with the booking id makes each hash unique. */
export function hashCode(bookingId: string, code: string): string {
  return createHash("sha256").update(`${bookingId}:${code}`).digest("hex");
}

export function codeMatches(bookingId: string, code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashCode(bookingId, code.trim()), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
