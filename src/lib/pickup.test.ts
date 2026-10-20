import { describe, expect, it } from "vitest";
import { canCancelRequest, canTransition, nextStatus } from "./pickup";

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

  it("never goes backwards on its own", () => {
    expect(canTransition("en_route", "bags_ready")).toBe(false);
    expect(canTransition("picked_up", "scheduled")).toBe(false);
  });
});

describe("canCancelRequest", () => {
  it("lets the customer undo the bags button until a driver leaves", () => {
    expect(canCancelRequest("bags_ready")).toBe(true);
  });

  it("refuses once the shuttle is on its way or done", () => {
    expect(canCancelRequest("scheduled")).toBe(false);
    expect(canCancelRequest("en_route")).toBe(false);
    expect(canCancelRequest("picked_up")).toBe(false);
  });
});
