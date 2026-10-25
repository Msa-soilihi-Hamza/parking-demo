import { describe, expect, it } from "vitest";
import { arrivalPath, normalizeReference, normalizeSpot } from "./arrival";

describe("normalizeReference", () => {
  it("accepts what an employee types, in any case and with spaces", () => {
    expect(normalizeReference("  esc-ab12cd ")).toBe("ESC-AB12CD");
    expect(normalizeReference("ESC- AB12 CD")).toBe("ESC-AB12CD");
  });

  it("adds the prefix when only the code is typed", () => {
    expect(normalizeReference("ab12cd")).toBe("ESC-AB12CD");
  });

  it("rejects anything that cannot be a reference", () => {
    expect(normalizeReference("")).toBeNull();
    expect(normalizeReference("ESC-")).toBeNull();
    expect(normalizeReference("ESC-AB/12")).toBeNull();
    expect(normalizeReference("ESC-" + "A".repeat(13))).toBeNull();
  });
});

describe("normalizeSpot", () => {
  it("cleans the spot as written on the ground", () => {
    expect(normalizeSpot(" b 12 ")).toBe("B12");
    expect(normalizeSpot("P2-104")).toBe("P2-104");
  });

  it("rejects empty or odd spots", () => {
    expect(normalizeSpot("   ")).toBeNull();
    expect(normalizeSpot("B12!")).toBeNull();
    expect(normalizeSpot("ABCDEFGHI")).toBeNull();
  });
});

describe("arrivalPath", () => {
  it("opens the booking in the team space", () => {
    expect(arrivalPath("ESC-AB12CD")).toBe("/accueil/reservation/ESC-AB12CD");
  });
});
