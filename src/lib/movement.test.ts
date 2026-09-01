import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { createInitialGameState } from "@/lib/game-state";
import { applyMove, armySpeed, movementCostOf, planMove, reachableFields } from "@/lib/movement";
import type { Army, CountryId, GameState, UnitInstance, UnitTypeId } from "@/types";

const FIELD_BY_ID = new Map(MAP_FIELDS.map((field) => [field.id, field]));

function field(fieldId: string) {
  return FIELD_BY_ID.get(fieldId) ?? failWith(`unknown field "${fieldId}"`);
}

function findArmy(state: GameState, armyId: string) {
  return state.armies.find((candidate) => candidate.id === armyId) ?? failWith(`unknown army "${armyId}"`);
}

function failWith(message: string): never {
  throw new Error(message);
}

function units(...typeIds: UnitTypeId[]): UnitInstance[] {
  return typeIds.map((typeId, index) => ({ id: `u${index + 1}`, typeId }));
}

function army(id: string, owner: CountryId, fieldId: string, typeIds: UnitTypeId[]): Army {
  const base: Army = { id, owner, fieldId, units: units(...typeIds) };
  return { ...base, movementPoints: armySpeed(base) };
}

/** Initial game with the armies replaced by the test setup. */
function stateWithArmies(armies: Army[]): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, armies };
}

describe("armySpeed", () => {
  it("returns the slowest unit's movement (FR-005)", () => {
    expect(armySpeed(army("A", "germany", "berlin", ["infantry", "tank", "artillery"]))).toBe(1);
    expect(armySpeed(army("B", "germany", "berlin", ["tank", "tank"]))).toBe(2);
  });

  it("throws for an empty army", () => {
    expect(() => armySpeed(army("C", "germany", "berlin", []))).toThrow("no units");
  });
});

describe("movementCostOf", () => {
  it("charges 1 for cities and normal terrain, 2 for mountains", () => {
    expect(movementCostOf(field("berlin"))).toBe(1);
    expect(movementCostOf(field("oder-plains"))).toBe(1);
    expect(movementCostOf(field("bzura-river"))).toBe(1);
    expect(movementCostOf(field("carpathians-mountains"))).toBe(2);
  });
});

describe("reachableFields", () => {
  it("reaches exactly the 1-cost neighbors of a speed-1 army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry", "infantry"])]);
    expect([...reachableFields(state, "G").keys()].sort()).toEqual(["oder-plains", "pomerania-plains"]);
  });

  it("excludes mountains for a speed-1 army but includes them for tanks", () => {
    const infantry = stateWithArmies([army("G", "germany", "krakow", ["infantry"])]);
    expect(reachableFields(infantry, "G").has("carpathians-mountains")).toBe(false);

    const tanks = stateWithArmies([army("G", "germany", "krakow", ["tank", "tank"])]);
    expect(reachableFields(tanks, "G").has("carpathians-mountains")).toBe(true);
  });

  it("treats fields occupied by an enemy army as impassable", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["infantry"]),
      army("R", "soviet", "pomerania-plains", ["infantry"]),
    ]);
    expect(reachableFields(state, "G").has("pomerania-plains")).toBe(false);
  });

  it("passes through own armies' fields (merge targets)", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry"]),
      army("G2", "germany", "oder-plains", ["infantry"]),
    ]);
    expect(reachableFields(state, "G1").has("oder-plains")).toBe(true);
  });

  it("throws for an unknown army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => reachableFields(state, "nope")).toThrow("unknown army");
  });
});

describe("planMove", () => {
  it("returns null when the target is out of reach", () => {
    const state = stateWithArmies([army("G", "germany", "krakow", ["infantry"])]);
    expect(planMove(state, "G", "carpathians-mountains")).toBeNull();
  });
});

describe("applyMove", () => {
  it("moves the army, spends the path cost, and flips enemy terrain but never cities", () => {
    // Soviet tank army standing on German Warsaw: speed 2, path warsaw -> bzura-river -> poznan.
    const state = stateWithArmies([army("R", "soviet", "warsaw", ["tank", "tank"])]);
    const next = applyMove(state, "R", "poznan");

    const moved = findArmy(next, "R");
    expect(moved.fieldId).toBe("poznan");
    expect(moved.movementPoints).toBe(0); // river 1 + city 1
    expect(next.fieldOwners["bzura-river"]).toBe("soviet"); // intermediate terrain flips
    expect(next.fieldOwners.poznan).toBe("germany"); // cities change owner only via battle (S-04)
  });

  it("keeps same-owner fields unchanged and spends mountain cost", () => {
    const state = stateWithArmies([army("G", "germany", "krakow", ["tank"])]);
    const next = applyMove(state, "G", "carpathians-mountains");
    expect(findArmy(next, "G").movementPoints).toBe(0); // mountains cost 2
    expect(next.fieldOwners["carpathians-mountains"]).toBe("germany");
  });

  it("merges into a standing own army, keeping the standing army's id and movement", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      army("G2", "germany", "oder-plains", ["tank", "tank", "tank", "tank"]),
    ]);
    const next = applyMove(state, "G1", "oder-plains");

    expect(next.armies.length).toBe(1);
    expect(next.armies[0]?.id).toBe("G2");
    expect(next.armies[0]?.units.length).toBe(8);
    expect(next.armies[0]?.movementPoints).toBe(2); // standing army's movement wins
  });

  it("refuses a merge that would exceed the 8-unit cap (FR-004)", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      army("G2", "germany", "oder-plains", ["infantry", "infantry", "infantry", "infantry", "infantry"]),
    ]);
    expect(() => applyMove(state, "G1", "oder-plains")).toThrow("8-unit limit");
  });

  it("throws for unreachable or enemy-held targets", () => {
    const blocked = stateWithArmies([
      army("G", "germany", "berlin", ["infantry"]),
      army("R", "soviet", "oder-plains", ["infantry"]),
    ]);
    expect(() => applyMove(blocked, "G", "oder-plains")).toThrow("not reachable");

    const tooFar = stateWithArmies([army("G", "germany", "krakow", ["infantry"])]);
    expect(() => applyMove(tooFar, "G", "carpathians-mountains")).toThrow("not reachable");
  });

  it("throws for an unknown army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => applyMove(state, "nope", "oder-plains")).toThrow("unknown army");
  });
});
