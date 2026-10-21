import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "./app-url";

const SITE = "https://parking-demo-two.vercel.app";

describe("resolveAppUrl", () => {
  it("keeps a correct value", () => {
    expect(resolveAppUrl({ APP_URL: SITE })).toBe(SITE);
  });

  it("repairs the usual copy-paste slips", () => {
    expect(resolveAppUrl({ APP_URL: "parking-demo-two.vercel.app" })).toBe(SITE);
    expect(resolveAppUrl({ APP_URL: `${SITE}/` })).toBe(SITE);
    expect(resolveAppUrl({ APP_URL: ` "${SITE}" ` })).toBe(SITE);
    expect(resolveAppUrl({ APP_URL: `APP_URL=${SITE}` })).toBe(SITE);
  });

  it("falls back to the domain Vercel provides when APP_URL is missing", () => {
    expect(resolveAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "parking-demo-two.vercel.app" })).toBe(SITE);
    expect(resolveAppUrl({ APP_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "parking-demo-two.vercel.app" })).toBe(SITE);
  });

  it("uses http for localhost and defaults to it in development", () => {
    expect(resolveAppUrl({ APP_URL: "localhost:3100" })).toBe("http://localhost:3100");
    expect(resolveAppUrl({})).toBe("http://localhost:3000");
  });
});
