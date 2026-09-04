import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { createInitialGameState } from "@/lib/game-state";
import { winnerOf } from "@/lib/victory";
import type { CountryId, GameState } from "@/types";

/** The dataset's city split (guards the scenarios against data drift). */
const GERMAN_CITIES = MAP_FIELDS.filter((field) => field.city !== null && field.initialOwner === "germany").map(
  (field) => field.id,
);
const SOVIET_CITIES = MAP_FIELDS.filter((field) => field.city !== null && field.initialOwner === "soviet").map(
  (field) => field.id,
);

/** Ownership overrides: every listed field flips to `owner`, the rest stay initial. */
function owners(owner: CountryId, fieldIds: string[]): Record<string, CountryId> {
  return Object.fromEntries(fieldIds.map((fieldId) => [fieldId, owner]));
}

function stateWith(overrides: Record<string, CountryId> = {}): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, fieldOwners: { ...state.fieldOwners, ...overrides } };
}

describe("winnerOf", () => {
  it("returns null on a fresh game", () => {
    expect(winnerOf(createInitialGameState("germany", "soviet"))).toBeNull();
  });

  it("returns the country that controls every enemy-initial city", () => {
    expect(winnerOf(stateWith(owners("germany", SOVIET_CITIES)))).toBe("germany");
    expect(winnerOf(stateWith(owners("soviet", GERMAN_CITIES)))).toBe("soviet");
  });

  it("returns null while any enemy-initial city is still held by the enemy", () => {
    const almostAll = SOVIET_CITIES.slice(0, -1); // e.g. Moscow still Soviet
    expect(winnerOf(stateWith(owners("germany", almostAll)))).toBeNull();
  });

  it("returns null after capture-and-recapture churn (current owner decides, not history)", () => {
    // Germany took Smolensk and Kiev, lost both back; still holds the rest —
    // but not ALL Soviet cities, so the campaign continues.
    const churned = SOVIET_CITIES.filter((id) => id !== "smolensk" && id !== "kiev");
    expect(winnerOf(stateWith(owners("germany", churned)))).toBeNull();
  });

  it("ignores the winner's own lost cities (own-city loss is irrelevant)", () => {
    // Germany holds all Soviet-initial cities while the USSR overruns all
    // German-initial cities except Berlin.
    const overrides = { ...owners("germany", SOVIET_CITIES), ...owners("soviet", GERMAN_CITIES.slice(0, -1)) };
    expect(winnerOf(stateWith(overrides))).toBe("germany");
  });

  it("resolves a synthetic double satisfaction deterministically (dataset order)", () => {
    // Both sides' conditions met at once — unreachable in play (the reducer
    // freezes on the first completion), but the answer must be one country.
    const overrides = { ...owners("germany", SOVIET_CITIES), ...owners("soviet", GERMAN_CITIES) };
    expect(winnerOf(stateWith(overrides))).toBe("germany");
  });

  it("returns the country owning all 12 cities", () => {
    const allCities = [...GERMAN_CITIES, ...SOVIET_CITIES];
    expect(winnerOf(stateWith(owners("germany", allCities)))).toBe("germany");
    expect(winnerOf(stateWith(owners("soviet", allCities)))).toBe("soviet");
  });
});

describe("map sanity for the test scenarios", () => {
  it("splits the 12 cities 6/6 between the initial owners (guards the setups against data drift)", () => {
    expect(GERMAN_CITIES.length).toBe(6);
    expect(SOVIET_CITIES.length).toBe(6);
    expect(GERMAN_CITIES).toContain("berlin");
    expect(SOVIET_CITIES).toContain("moscow");
  });
});
