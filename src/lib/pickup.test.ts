import { describe, expect, it } from "vitest";
import { bagsButtonOpen, canTransition, nextStatus } from "./pickup";

describe("return trip state machine", () => {
  it("follows scheduled → bags_ready → en_route → picked_up", () => {
    expect(nextStatus("scheduled")).toBe("bags_ready");
    expect(nextStatus("bags_ready")).toBe("en_route");
    expect(nextStatus("en_route")).toBe("picked_up");
    expect(nextStatus("picked_up")).toBeNull();
  });

  it("never lets the shuttle leave before the customer has their bags", () => {
    expect(canTransition("scheduled", "en_route")).toBe(false);
    expect(canTransition("scheduled", "picked_up")).toBe(false);
  });

  it("never goes backwards", () => {
    expect(canTransition("en_route", "bags_ready")).toBe(false);
    expect(canTransition("picked_up", "scheduled")).toBe(false);
  });
});

describe("bagsButtonOpen", () => {
  const landing = new Date("2026-11-03T14:00:00Z");

  it("is closed days before the return", () => {
    expect(bagsButtonOpen(landing, new Date("2026-11-01T14:00:00Z"))).toBe(false);
  });

  it("opens a few hours before the planned landing", () => {
    expect(bagsButtonOpen(landing, new Date("2026-11-03T09:00:00Z"))).toBe(true);
  });
});
