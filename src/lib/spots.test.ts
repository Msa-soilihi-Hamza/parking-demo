import { describe, expect, it } from "vitest";
import { allSpots, firstFreeSpot, isValidSpot, spotLayout, spotRange } from "./spots";

describe("spotLayout", () => {
  it("splits the capacity into rows of 20, lettered from A", () => {
    const rows = spotLayout(120);
    expect(rows.map((r) => r.row)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(rows[0].spots[0]).toBe("A1");
    expect(rows[5].spots.at(-1)).toBe("F20");
  });

  it("ends with a shorter row when the capacity is not a multiple of 20", () => {
    const rows = spotLayout(45);
    expect(rows.map((r) => r.spots.length)).toEqual([20, 20, 5]);
  });

  it("skips I and O, too easy to read as 1 and 0", () => {
    expect(spotLayout(200).map((r) => r.row).join("")).toBe("ABCDEFGHJK");
  });

  it("has as many spots as the capacity", () => {
    expect(allSpots(200)).toHaveLength(200);
  });
});

describe("isValidSpot", () => {
  it("accepts only spots that exist in this parking", () => {
    expect(isValidSpot("F20", 120)).toBe(true);
    expect(isValidSpot("G1", 120)).toBe(false);
    expect(isValidSpot("A21", 120)).toBe(false);
  });

  it("gives the range to quote in the error", () => {
    expect(spotRange(120)).toBe("A1 à F20");
  });
});

describe("firstFreeSpot", () => {
  it("suggests the first free spot in plan order", () => {
    expect(firstFreeSpot(40, ["A1", "A2", "A4"])).toBe("A3");
  });

  it("returns null when the parking is full", () => {
    expect(firstFreeSpot(2, ["A1", "A2"])).toBeNull();
  });
});
