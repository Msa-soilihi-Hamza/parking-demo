import { describe, expect, it } from "vitest";
import { finalPrice, MIN_TOTAL_CENTS } from "./pricing";
import { normalizePromoCode, promoDiscountCents, promoLabel, promoProblem, type PromoRule } from "./promo";

const promo = (overrides: Partial<PromoRule> = {}): PromoRule => ({
  code: "BIENVENUE10",
  kind: "percent",
  value: 10,
  validFrom: null,
  validUntil: null,
  active: true,
  ...overrides,
});

describe("finalPrice", () => {
  it("takes the promo discount off the base price", () => {
    const price = finalPrice(10000, (amount) => promoDiscountCents(promo(), amount));
    expect(price).toEqual({ baseCents: 10000, discountCents: 1000, totalCents: 9000 });
  });

  it("never goes below the minimum, whatever the code", () => {
    const price = finalPrice(1500, (amount) => promoDiscountCents(promo({ kind: "amount", value: 5000 }), amount));
    expect(price.totalCents).toBe(MIN_TOTAL_CENTS);
  });

  it("changes nothing without a code", () => {
    expect(finalPrice(4200).totalCents).toBe(4200);
  });
});

describe("promo codes", () => {
  it("accepts what a customer types, in any case", () => {
    expect(normalizePromoCode(" bienvenue10 ")).toBe("BIENVENUE10");
    expect(normalizePromoCode("ab")).toBeNull();
    expect(normalizePromoCode("NO-DASH")).toBeNull();
  });

  it("checks the dates and the active flag", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(promoProblem(promo(), now)).toBeNull();
    expect(promoProblem(promo({ active: false }), now)).toMatch(/plus actif/);
    expect(promoProblem(promo({ validFrom: new Date("2026-11-01") }), now)).toMatch(/pas encore/);
    expect(promoProblem(promo({ validUntil: new Date("2026-10-01") }), now)).toMatch(/expiré/);
  });

  it("computes a percentage or a fixed amount, never more than the price", () => {
    expect(promoDiscountCents({ kind: "percent", value: 15 }, 2000)).toBe(300);
    expect(promoDiscountCents({ kind: "amount", value: 500 }, 2000)).toBe(500);
    expect(promoDiscountCents({ kind: "amount", value: 5000 }, 2000)).toBe(2000);
  });

  it("labels the discount for the price breakdown", () => {
    expect(promoLabel({ kind: "percent", value: 10 })).toBe("-10 %");
    expect(promoLabel({ kind: "amount", value: 500 })).toMatch(/^-5,00\s€$/);
  });
});
