// The page asked for before signing in (/connexion?suite=...). Only a page of this
// site: browsers read "/\evil.com" or "/<tab>/evil.com" as "//evil.com", another site.

const ORIGIN = "https://escale.invalid";

/** A path of this site (path, query and hash), or null for anything else. */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  // Backslashes and control characters (tab, new line...) are where browsers and this
  // check would disagree: refused outright.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  return url.pathname + url.search + url.hash;
}
