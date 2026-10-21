// Public address of the site, used in e-mails and in Stripe's return links.
// Stripe rejects anything that is not a full URL, and APP_URL is typed by hand in the
// hosting dashboard, so the value is cleaned up instead of trusted as is.

type Env = { APP_URL?: string; VERCEL_PROJECT_PRODUCTION_URL?: string };

function toOrigin(value: string | undefined): string | null {
  const cleaned = (value ?? "")
    .trim()
    .replace(/^APP_URL=/, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!cleaned) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(cleaned);
  const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `${local ? "http" : "https"}://${cleaned}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/**
 * APP_URL when it is usable, otherwise the production domain Vercel exposes on its own
 * (VERCEL_PROJECT_PRODUCTION_URL, without scheme), otherwise localhost for development.
 */
export function resolveAppUrl(env: Env): string {
  return toOrigin(env.APP_URL) ?? toOrigin(env.VERCEL_PROJECT_PRODUCTION_URL) ?? "http://localhost:3000";
}
