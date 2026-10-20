import { describe, expect, it } from "vitest";
import { billedDays, quote } from "./pricing";

const at = (iso: string) => new Date(iso);

describe("billedDays", () => {
  it("bills every started 24h period as a full day", () => {
    expect(billedDays(at("2026-11-01T08:00Z"), at("2026-11-01T20:00Z"))).toBe(1);
    expect(billedDays(at("2026-11-01T08:00Z"), at("2026-11-02T08:00Z"))).toBe(1);
    expect(billedDays(at("2026-11-01T08:00Z"), at("2026-11-02T08:01Z"))).toBe(2);
  });

  it("does not bill the extra hour of the October time change as a day", () => {
    // 20 Oct 08:00 → 27 Oct 08:00 in Paris spans the night of 25 October.
    expect(billedDays(at("2026-10-20T06:00Z"), at("2026-10-27T07:00Z"))).toBe(7);
  });
});

describe("quote", () => {
  it("charges the full rate for a short stay", () => {
    const q = quote(1400, at("2026-11-01T08:00Z"), at("2026-11-04T08:00Z"));
    expect(q).toMatchObject({ ok: true, days: 3, totalCents: 4200 });
  });

  it("applies the degressive tiers for a one-week stay", () => {
    const q = quote(1400, at("2026-11-01T08:00Z"), at("2026-11-08T08:00Z"));
    // 3 × 14 € + 4 × 11,20 €
    expect(q).toMatchObject({ ok: true, days: 7, totalCents: 4200 + 4 * 1120 });
  });

  it("uses all three tiers for a long stay", () => {
    const q = quote(1000, at("2026-11-01T08:00Z"), at("2026-11-11T08:00Z"));
    if (!q.ok) throw new Error(q.error);
    expect(q.lines.map((l) => [l.days, l.unitCents])).toEqual([
      [3, 1000],
      [4, 800],
      [3, 600],
    ]);
    expect(q.totalCents).toBe(3000 + 3200 + 1800);
  });

  it("refuses a return before the drop-off", () => {
    expect(quote(1400, at("2026-11-02T08:00Z"), at("2026-11-01T08:00Z")).ok).toBe(false);
  });

  it("refuses stays longer than the limit", () => {
    expect(quote(1400, at("2026-01-01T08:00Z"), at("2026-04-01T08:00Z")).ok).toBe(false);
  });
});
