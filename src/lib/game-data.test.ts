import { describe, expect, it } from "vitest";

import { getGameData, validateGameData } from "@/lib/game-data";
import type { GameData, MapField } from "@/types";

const base = getGameData();

/** Deep-clones the real dataset and applies a mutation for testing one invariant. */
function mutated(fn: (data: GameData) => void): GameData {
  const clone = JSON.parse(JSON.stringify(base)) as GameData;
  fn(clone);
  return clone;
}

function findField(data: GameData, id: string): MapField {
  const field = data.fields.find((candidate) => candidate.id === id);
  if (field === undefined) {
    throw new Error(`test fixture error: field "${id}" not found`);
  }
  return field;
}

describe("validateGameData on the real dataset", () => {
  it("reports no violations", () => {
    expect(validateGameData(base)).toEqual([]);
  });

  it("has the prototype shape (29 fields, 12 cities, 4 unit types, 2 countries)", () => {
    expect(base.fields).toHaveLength(29);
    expect(base.fields.filter((field) => field.type === "city")).toHaveLength(12);
    expect(base.unitTypes).toHaveLength(4);
    expect(base.countries).toHaveLength(2);
  });
});

describe("validateGameData invariant failures", () => {
  it("flags an asymmetric connection", () => {
    const data = mutated((draft) => {
      const berlin = findField(draft, "berlin");
      berlin.connections = berlin.connections.filter((id) => id !== "oder-plains");
    });
    expect(validateGameData(data)).toContainEqual(
      expect.stringContaining('asymmetric connection: "oder-plains" -> "berlin"'),
    );
  });

  it("flags a connection to an unknown field", () => {
    const data = mutated((draft) => {
      findField(draft, "berlin").connections.push("atlantis");
    });
    expect(validateGameData(data)).toContainEqual(expect.stringContaining('connects to unknown field "atlantis"'));
  });

  it("flags a disconnected graph", () => {
    const data = mutated((draft) => {
      // Isolate vilnius: drop both of its edges on both sides (no dangling refs).
      const vilnius = findField(draft, "vilnius");
      vilnius.connections = [];
      const niemen = findField(draft, "niemen-river");
      niemen.connections = niemen.connections.filter((id) => id !== "vilnius");
      const minsk = findField(draft, "minsk");
      minsk.connections = minsk.connections.filter((id) => id !== "vilnius");
    });
    expect(validateGameData(data)).toContainEqual(expect.stringContaining("map graph is not connected"));
  });

  it("flags a duplicate field id", () => {
    const data = mutated((draft) => {
      draft.fields = [...draft.fields, findField(draft, "berlin")];
    });
    expect(validateGameData(data)).toContainEqual(expect.stringContaining('duplicate field id "berlin"'));
  });

  it("flags a field count outside 25-30", () => {
    const data = mutated((draft) => {
      draft.fields = draft.fields.slice(0, 10);
    });
    expect(validateGameData(data)).toContainEqual(expect.stringContaining("map must have 25-30 fields"));
  });

  it("flags a negative unit stat", () => {
    const data = mutated((draft) => {
      const tank = draft.unitTypes.find((unitType) => unitType.id === "tank");
      if (tank === undefined) {
        throw new Error("test fixture error: unit type tank not found");
      }
      tank.attack = -1;
    });
    expect(validateGameData(data)).toContainEqual(expect.stringContaining('unit type "tank" has negative attack'));
  });

  it("flags a city with production slots outside 1-3", () => {
    const data = mutated((draft) => {
      const warsaw = findField(draft, "warsaw");
      if (warsaw.city === null) {
        throw new Error("test fixture error: warsaw has no city data");
      }
      warsaw.city.productionSlots = 5;
    });
    expect(validateGameData(data)).toContainEqual(
      expect.stringContaining('city "warsaw" must have 1-3 production slots'),
    );
  });
});
