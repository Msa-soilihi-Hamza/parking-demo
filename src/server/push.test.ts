import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
const { bagsReadyNotification, pickupCancelledNotification } = await import("./push");

describe("pickupCancelledNotification", () => {
  const payload = pickupCancelledNotification({ bookingId: "abc", customerName: "Sarah Martin", terminal: "T2E" });

  it("tells the driver not to leave", () => {
    expect(payload.title).toBe("Demande annulée · T2E");
    expect(payload.body).toContain("Sarah M.");
    expect(payload.body).toContain("ne partez pas");
  });

  it("replaces the bags-ready notification for the same customer", () => {
    const request = bagsReadyNotification({ bookingId: "abc", customerName: "Sarah Martin", terminal: "T2E", passengers: 2 });
    expect(payload.tag).toBe(request.tag);
  });
});

describe("bagsReadyNotification", () => {
  const payload = bagsReadyNotification({
    bookingId: "abc",
    customerName: "Sarah Martin",
    terminal: "T2E",
    passengers: 2,
  });

  it("puts the terminal first, where the driver needs it", () => {
    expect(payload.title).toBe("Bagages récupérés · T2E");
  });

  it("shows only the first name and initial", () => {
    expect(payload.body).toContain("Sarah M.");
    expect(payload.body).not.toContain("Martin");
    expect(payload.body).toContain("2 passagers");
  });

  it("opens the shuttle page on this customer and replaces older pushes for them", () => {
    expect(payload.url).toBe("/navette#client-abc");
    expect(payload.tag).toBe("client-abc");
  });

  it("uses the singular for one passenger", () => {
    const one = bagsReadyNotification({ bookingId: "x", customerName: "Inès", terminal: "Orly 3", passengers: 1 });
    expect(one.body).toContain("Inès attend avec 1 passager.");
  });
});
