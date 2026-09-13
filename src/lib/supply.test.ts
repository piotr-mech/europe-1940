import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { createInitialGameState } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import { isSupplied, movementAllowance } from "@/lib/supply";
import type { Army, CountryId, GameState, UnitInstance, UnitTypeId } from "@/types";

const FIELD_BY_ID = new Map(MAP_FIELDS.map((field) => [field.id, field]));

function failWith(message: string): never {
  throw new Error(message);
}

function units(...typeIds: UnitTypeId[]): UnitInstance[] {
  return typeIds.map((typeId, index) => ({ id: `u${index + 1}`, typeId }));
}

function army(id: string, owner: CountryId, fieldId: string, typeIds: UnitTypeId[]): Army {
  const base: Army = { id, owner, fieldId, units: units(...typeIds), movementPoints: 0 };
  return { ...base, movementPoints: armySpeed(base) };
}

/** Initial game with test armies and field-ownership overrides (the cut). */
function stateWith(armies: Army[], owners: Record<string, CountryId> = {}): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, armies, fieldOwners: { ...state.fieldOwners, ...owners } };
}

describe("isSupplied", () => {
  it("is supplied when standing on an own city (trivial chain)", () => {
    const state = stateWith([army("R1", "soviet", "moscow", ["infantry"])]);
    expect(isSupplied(state, state.armies[0])).toBe(true);
  });

  it("is supplied through a chain of own fields to a distant own city", () => {
    // Lublin Plains -> Warsaw (German city) under default ownership.
    const state = stateWith([army("G", "germany", "lublin-plains", ["infantry"])]);
    expect(isSupplied(state, state.armies[0])).toBe(true);
  });

  it("is unsupplied when enemy fields wall the army off from every own city", () => {
    // The army holds Volhynia (German-owned), but its connections
    // (Carpathians, Lublin, Kiev) are all Soviet-owned.
    const state = stateWith([army("G", "germany", "volhynia-plains", ["infantry"])], {
      "volhynia-plains": "germany",
      "carpathians-mountains": "soviet",
      "lublin-plains": "soviet",
      kiev: "soviet",
    });
    expect(isSupplied(state, state.armies[0])).toBe(false);
  });

  it("one open link in the wall restores supply", () => {
    // Same cut, but Lublin stays German: Lublin -> Warsaw (city) supplies.
    const state = stateWith([army("G", "germany", "volhynia-plains", ["infantry"])], {
      "volhynia-plains": "germany",
      "carpathians-mountains": "soviet",
      kiev: "soviet",
    });
    expect(isSupplied(state, state.armies[0])).toBe(true);
  });

  it("is unsupplied when the own component holds no own city", () => {
    // Radom Plains connects only to Warsaw and Kraków — both enemy-held.
    const state = stateWith([army("G", "germany", "radom-plains", ["infantry"])], {
      warsaw: "soviet",
      krakow: "soviet",
    });
    expect(isSupplied(state, state.armies[0])).toBe(false);
  });

  it("evaluates each side independently", () => {
    const cut: Record<string, CountryId> = {
      "volhynia-plains": "germany",
      "carpathians-mountains": "soviet",
      "lublin-plains": "soviet",
      kiev: "soviet",
    };
    const state = stateWith(
      [army("G", "germany", "volhynia-plains", ["infantry"]), army("R", "soviet", "kiev", ["infantry"])],
      cut,
    );
    expect(isSupplied(state, state.armies[0])).toBe(false); // German army: walled off
    expect(isSupplied(state, state.armies[1])).toBe(true); // Soviet army: on own city Kiev
  });

  it("throws for an army on an unknown field", () => {
    const state = stateWith([]);
    const lost: Army = { id: "X", owner: "germany", fieldId: "nope", units: units("infantry"), movementPoints: 1 };
    expect(() => isSupplied(state, lost)).toThrow("unknown field");
  });
});

describe("movementAllowance (FR-011 movement cap)", () => {
  it("keeps full speed when supplied", () => {
    const state = stateWith([army("G", "germany", "warsaw", ["tank", "tank"])]);
    expect(movementAllowance(state, state.armies[0])).toBe(2);
  });

  it("caps tanks at 1 when unsupplied", () => {
    const state = stateWith([army("G", "germany", "volhynia-plains", ["tank", "tank"])], {
      "volhynia-plains": "germany",
      "carpathians-mountains": "soviet",
      "lublin-plains": "soviet",
      kiev: "soviet",
    });
    expect(movementAllowance(state, state.armies[0])).toBe(1);
  });

  it("leaves infantry at 1 either way", () => {
    const cut: Record<string, CountryId> = {
      "volhynia-plains": "germany",
      "carpathians-mountains": "soviet",
      "lublin-plains": "soviet",
      kiev: "soviet",
    };
    const supplied = stateWith([army("G", "germany", "warsaw", ["infantry"])]);
    const unsupplied = stateWith([army("G", "germany", "volhynia-plains", ["infantry"])], cut);
    expect(movementAllowance(supplied, supplied.armies[0])).toBe(1);
    expect(movementAllowance(unsupplied, unsupplied.armies[0])).toBe(1);
  });
});

describe("map sanity for the test scenarios", () => {
  it("uses real adjacency (guards the walled-off setups against data drift)", () => {
    const volhynia = FIELD_BY_ID.get("volhynia-plains") ?? failWith("unknown field");
    expect([...volhynia.connections].sort()).toEqual(["carpathians-mountains", "kiev", "lublin-plains"]);
    const radom = FIELD_BY_ID.get("radom-plains") ?? failWith("unknown field");
    expect([...radom.connections].sort()).toEqual(["krakow", "warsaw"]);
  });
});
