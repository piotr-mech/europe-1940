import { describe, expect, it } from "vitest";

import { getGameData } from "@/lib/game-data";
import { createInitialGameState, dominantUnitType, gameReducer } from "@/lib/game-state";
import type { Army, CountryId } from "@/types";

const gameData = getGameData();
const COUNTRY_IDS: readonly CountryId[] = ["germany", "soviet"];

describe("createInitialGameState", () => {
  it("mirrors the dataset field owners", () => {
    const state = createInitialGameState("germany", "soviet");
    for (const field of gameData.fields) {
      expect(state.fieldOwners[field.id]).toBe(field.initialOwner);
    }
  });

  it("starts at turn 1 with the chosen countries", () => {
    const state = createInitialGameState("soviet", "germany");
    expect(state.turn).toBe(1);
    expect(state.playerCountryId).toBe("soviet");
    expect(state.aiCountryId).toBe("germany");
  });

  it("satisfies US-01's Given: each country has >= 1 army on a field it owns", () => {
    const state = createInitialGameState("germany", "soviet");
    for (const countryId of COUNTRY_IDS) {
      const armies = state.armies.filter((army) => army.owner === countryId);
      expect(armies.length).toBeGreaterThan(0);
      for (const army of armies) {
        expect(state.fieldOwners[army.fieldId]).toBe(countryId);
      }
    }
  });

  it("keeps armies within the 8-unit limit (FR-004) with unique ids", () => {
    const state = createInitialGameState("germany", "soviet");
    const armyIds = new Set<string>();
    const unitIds = new Set<string>();
    for (const army of state.armies) {
      expect(army.units.length).toBeLessThanOrEqual(8);
      expect(armyIds.has(army.id)).toBe(false);
      armyIds.add(army.id);
      for (const unit of army.units) {
        expect(unitIds.has(unit.id)).toBe(false);
        unitIds.add(unit.id);
      }
    }
  });

  it("uses only known unit types", () => {
    const state = createInitialGameState("germany", "soviet");
    const knownIds = new Set(gameData.unitTypes.map((unitType) => unitType.id));
    for (const army of state.armies) {
      for (const unit of army.units) {
        expect(knownIds.has(unit.typeId)).toBe(true);
      }
    }
  });

  it("throws when both sides get the same country", () => {
    expect(() => createInitialGameState("germany", "germany")).toThrow("must differ");
  });
});

describe("dominantUnitType", () => {
  it("picks the most common unit type", () => {
    const army: Army = {
      id: "T1",
      owner: "germany",
      fieldId: "berlin",
      units: [
        { id: "a", typeId: "infantry" },
        { id: "b", typeId: "tank" },
        { id: "c", typeId: "tank" },
      ],
    };
    expect(dominantUnitType(army)).toBe("tank");
  });

  it("breaks ties by UNIT_TYPES order", () => {
    const army: Army = {
      id: "T2",
      owner: "soviet",
      fieldId: "moscow",
      units: [
        { id: "a", typeId: "artillery" },
        { id: "b", typeId: "antiTank" },
      ],
    };
    expect(dominantUnitType(army)).toBe("artillery");
  });

  it("throws for an empty army", () => {
    const army: Army = { id: "T3", owner: "germany", fieldId: "berlin", units: [] };
    expect(() => dominantUnitType(army)).toThrow("no units");
  });
});

describe("gameReducer", () => {
  it("startGame replaces null state with a fresh game for the chosen pairing", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "soviet", aiCountryId: "germany" });
    expect(state?.playerCountryId).toBe("soviet");
    expect(state?.aiCountryId).toBe("germany");
    expect(state?.turn).toBe(1);
  });

  it("startGame on an existing state restarts the campaign", () => {
    const first = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet" });
    const second = gameReducer(first, { type: "startGame", playerCountryId: "soviet", aiCountryId: "germany" });
    expect(second?.playerCountryId).toBe("soviet");
  });
});
