import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a page of the site, with its query and hash", () => {
    expect(safeNext("/compte")).toBe("/compte");
    expect(safeNext("/reserver?parking=orly&promo=ETE#paiement")).toBe("/reserver?parking=orly&promo=ETE#paiement");
  });

  it("refuses another site, however it is written", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example",
      "evil.example",
      "",
    ]) {
      expect(safeNext(value), JSON.stringify(value)).toBeNull();
    }
  });

  it("refuses anything that is not a string", () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(["/compte"])).toBeNull();
  });
});
