import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
const { authorNameFrom } = await import("./reviews");

describe("authorNameFrom", () => {
  it("keeps the first name and the last name's initial", () => {
    expect(authorNameFrom("Sarah Martin")).toBe("Sarah M.");
    expect(authorNameFrom("jean-paul de la fontaine")).toBe("Jean-paul F.");
  });

  it("copes with a single name or extra spaces", () => {
    expect(authorNameFrom("  Inès  ")).toBe("Inès");
    expect(authorNameFrom("")).toBe("Client");
  });
});
