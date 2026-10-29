import { describe, expect, it } from "vitest";
import { dateToParisLocal, parisDayBounds, parisLocalToDate } from "./time";

describe("parisLocalToDate", () => {
  it("refuses dates that do not exist", () => {
    expect(parisLocalToDate("2026-13-01T08:00")).toBeNull();
    expect(parisLocalToDate("2026-02-30T08:00")).toBeNull();
    expect(parisLocalToDate("2026-11-02T24:00")).toBeNull();
    expect(parisLocalToDate("2026-11-02T08:60")).toBeNull();
    expect(parisLocalToDate("2028-02-29T08:00")).not.toBeNull();
  });

  it("handles winter time (UTC+1)", () => {
    expect(parisLocalToDate("2026-12-10T14:30")?.toISOString()).toBe("2026-12-10T13:30:00.000Z");
  });

  it("handles summer time (UTC+2)", () => {
    expect(parisLocalToDate("2026-07-10T14:30")?.toISOString()).toBe("2026-07-10T12:30:00.000Z");
  });

  it("handles the night of the October time change", () => {
    expect(parisLocalToDate("2026-10-25T12:00")?.toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(parisLocalToDate("23/10/2026 14:30")).toBeNull();
  });

  it("round-trips with dateToParisLocal", () => {
    const value = "2026-11-03T06:45";
    expect(dateToParisLocal(parisLocalToDate(value)!)).toBe(value);
  });
});

describe("parisDayBounds", () => {
  it("returns the UTC bounds of a Paris day", () => {
    const { start, end } = parisDayBounds(new Date("2026-12-10T10:00:00Z"));
    expect(start.toISOString()).toBe("2026-12-09T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-10T23:00:00.000Z");
  });

  it("can shift to the next day", () => {
    const { start } = parisDayBounds(new Date("2026-12-10T10:00:00Z"), 1);
    expect(start.toISOString()).toBe("2026-12-10T23:00:00.000Z");
  });
});
