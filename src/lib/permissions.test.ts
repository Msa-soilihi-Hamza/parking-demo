import { describe, expect, it } from "vitest";
import { homeFor, spacesFor } from "./permissions";

describe("team spaces by role", () => {
  it("opens nothing to a customer", () => {
    expect(spacesFor("user")).toEqual([]);
    expect(spacesFor(null)).toEqual([]);
    expect(spacesFor(undefined)).toEqual([]);
  });

  it("opens one space to a driver or the front desk", () => {
    expect(spacesFor("chauffeur")).toEqual(["navette"]);
    expect(spacesFor("accueil")).toEqual(["accueil"]);
  });

  it("opens every space to the manager", () => {
    expect(spacesFor("responsable")).toEqual(["navette", "accueil", "gestion"]);
  });

  it("adds up several roles, and ignores unknown ones", () => {
    expect(spacesFor("chauffeur,accueil")).toEqual(["navette", "accueil"]);
    expect(spacesFor("admin")).toEqual([]);
    expect(spacesFor("toString")).toEqual([]);
  });
});

describe("where everyone lands after signing in", () => {
  it("sends the team to its space and customers to Mon espace", () => {
    expect(homeFor("responsable")).toBe("/gestion");
    expect(homeFor("chauffeur")).toBe("/navette");
    expect(homeFor("accueil")).toBe("/accueil");
    expect(homeFor("user")).toBe("/compte");
  });
});
