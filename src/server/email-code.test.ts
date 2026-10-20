import { describe, expect, it } from "vitest";
import { codeMatches, generateCode, hashCode } from "./email-code";

describe("email code", () => {
  it("always has 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("matches only the right code for the right booking", () => {
    const hash = hashCode("booking-a", "123456");
    expect(codeMatches("booking-a", "123456", hash)).toBe(true);
    expect(codeMatches("booking-a", " 123456 ", hash)).toBe(true);
    expect(codeMatches("booking-a", "654321", hash)).toBe(false);
    expect(codeMatches("booking-b", "123456", hash)).toBe(false);
  });
});
