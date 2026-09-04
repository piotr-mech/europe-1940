import { describe, expect, it } from "vitest";

import { getGameData } from "@/lib/game-data";
import { createInitialGameState, dominantUnitType, gameReducer } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import { applyProductionOrder } from "@/lib/production";
import type { Army, CountryId, GameState, ResourceBag } from "@/types";

const gameData = getGameData();
const COUNTRY_IDS: readonly CountryId[] = ["germany", "soviet"];

/** Applies aiStep until the AI turn drains — the player's turn has begun. */
function drainAiTurn(state: GameState): GameState {
  let current = state;
  while (current.aiPlan.length > 0) {
    const next = gameReducer(current, { type: "aiStep" });
    if (next === null) break;
    current = next;
  }
  return current;
}

/** Summed city income of the fields a country initially owns. */
function startingIncome(countryId: CountryId): ResourceBag {
  return gameData.fields
    .filter((field) => field.initialOwner === countryId && field.city !== null)
    .reduce<ResourceBag>(
      (sum, field) => ({
        money: sum.money + field.city.income.money,
        steel: sum.steel + field.city.income.steel,
        recruits: sum.recruits + field.city.income.recruits,
      }),
      { money: 0, steel: 0, recruits: 0 },
    );
}

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

  it("starts every army with full movement points", () => {
    const state = createInitialGameState("germany", "soviet");
    for (const army of state.armies) {
      expect(army.movementPoints).toBe(armySpeed(army));
    }
  });

  it("throws when both sides get the same country", () => {
    expect(() => createInitialGameState("germany", "germany")).toThrow("must differ");
  });

  it("seeds each treasury with its turn-1 city income (both player/AI assignments)", () => {
    for (const [player, ai] of [
      ["germany", "soviet"],
      ["soviet", "germany"],
    ] as const) {
      const state = createInitialGameState(player, ai);
      for (const countryId of COUNTRY_IDS) {
        expect(state.resources[countryId]).toEqual(startingIncome(countryId));
      }
    }
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
      movementPoints: 1,
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
      movementPoints: 1,
    };
    expect(dominantUnitType(army)).toBe("artillery");
  });

  it("throws for an empty army", () => {
    const army: Army = { id: "T3", owner: "germany", fieldId: "berlin", units: [], movementPoints: 1 };
    expect(() => dominantUnitType(army)).toThrow("no units");
  });
});

describe("gameReducer", () => {
  it("startGame replaces null state with a fresh game for the chosen pairing", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "soviet", aiCountryId: "germany", seed: 1 });
    expect(state?.playerCountryId).toBe("soviet");
    expect(state?.aiCountryId).toBe("germany");
    expect(state?.turn).toBe(1);
  });

  it("startGame on an existing state restarts the campaign", () => {
    const first = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const second = gameReducer(first, {
      type: "startGame",
      playerCountryId: "soviet",
      aiCountryId: "germany",
      seed: 1,
    });
    expect(second?.playerCountryId).toBe("soviet");
  });

  it("moveArmy moves the army and spends its movement points", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // G2 stands in Warsaw (speed 1); Radom Plains is a 1-cost neighbor.
    const next = gameReducer(state, { type: "moveArmy", armyId: "G2", targetFieldId: "radom-plains" });
    const moved = next?.armies.find((army) => army.id === "G2");
    expect(moved?.fieldId).toBe("radom-plains");
    expect(moved?.movementPoints).toBe(0);
  });

  it("endTurn plans the AI turn; the turn rolls over only when it drains (S-06)", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const moved = gameReducer(state, { type: "moveArmy", armyId: "G2", targetFieldId: "radom-plains" });
    const planned = gameReducer(moved, { type: "endTurn" });
    if (planned === null) throw new Error("planned state is null");

    expect(planned.turn).toBe(1); // still the AI's turn
    expect(planned.aiPlan.length).toBeGreaterThan(0);

    const next = drainAiTurn(planned);
    expect(next.turn).toBe(2);
    for (const army of next.armies) {
      expect(army.movementPoints).toBe(armySpeed(army)); // all supplied: full speed
    }
  });

  it("the staged AI turn is deterministic end to end", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const planned = gameReducer(state, { type: "endTurn" });
    if (planned === null) throw new Error("planned state is null");
    expect(drainAiTurn(planned)).toEqual(drainAiTurn(planned));
  });

  it("endTurn during an AI turn is ignored (no restarting mid-turn)", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const planned = gameReducer(state, { type: "endTurn" });
    if (planned === null) throw new Error("planned state is null");
    expect(gameReducer(planned, { type: "endTurn" })).toBe(planned);
  });

  it("endTurn caps an unsupplied army's movement at 1 (FR-011, S-05)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // A German tank army holds Volhynia, but every neighbouring field is
    // Soviet: walled off from any German city. Soviet tanks sit on own Kiev.
    const cut = {
      ...base,
      armies: [
        {
          id: "G1",
          owner: "germany" as const,
          fieldId: "volhynia-plains",
          units: [{ id: "G1-u1", typeId: "tank" as const }],
          movementPoints: 2,
        },
        {
          id: "R1",
          owner: "soviet" as const,
          fieldId: "kiev",
          units: [{ id: "R1-u1", typeId: "tank" as const }],
          movementPoints: 2,
        },
      ],
      fieldOwners: {
        ...base.fieldOwners,
        "volhynia-plains": "germany" as const,
        "carpathians-mountains": "soviet" as const,
        "lublin-plains": "soviet" as const,
      },
    };

    const planned = gameReducer(cut, { type: "endTurn" });
    const next = planned === null ? null : drainAiTurn(planned);
    expect(next?.armies.find((army) => army.id === "G1")?.movementPoints).toBe(1); // capped from 2
    expect(next?.armies.find((army) => army.id === "R1")?.movementPoints).toBe(2); // supplied: full speed
  });

  it("endTurn collects both countries' income on top of the seeded treasury", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const next = gameReducer(state, { type: "endTurn" });
    for (const countryId of COUNTRY_IDS) {
      const seeded = startingIncome(countryId);
      expect(next?.resources[countryId]).toEqual({
        money: seeded.money * 2,
        steel: seeded.steel * 2,
        recruits: seeded.recruits * 2,
      });
    }
  });

  it("an infantry order (buildTime 1) completes on one endTurn — unit on the map on turn N+1", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const ordered = applyProductionOrder(state, "germany", "berlin", "infantry");
    const planned = gameReducer(ordered, { type: "endTurn" });
    const next = planned === null ? null : drainAiTurn(planned);

    expect(next?.turn).toBe(2);
    // Queue emptied out and dropped from the record.
    expect(next?.productionQueues.berlin).toBeUndefined();
    // Berlin's standing german army G1 (4 units) received the 5th.
    const g1 = next?.armies.find((army) => army.id === "G1");
    expect(g1?.units.length).toBe(5);
    expect(g1?.units.at(-1)?.typeId).toBe("infantry");
  });

  it("a tank order (buildTime 2) stays queued after one endTurn and completes on the second", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const ordered = applyProductionOrder(state, "germany", "berlin", "tank");
    const planned2 = gameReducer(ordered, { type: "endTurn" });
    const turn2 = planned2 === null ? null : drainAiTurn(planned2);

    expect(turn2?.productionQueues.berlin).toEqual([{ typeId: "tank", remainingTurns: 1 }]);
    expect(turn2?.armies.find((army) => army.id === "G1")?.units.length).toBe(4);

    const planned3 = turn2 === null ? null : gameReducer(turn2, { type: "endTurn" });
    const turn3 = planned3 === null ? null : drainAiTurn(planned3);
    expect(turn3?.productionQueues.berlin).toBeUndefined();
    expect(turn3?.armies.find((army) => army.id === "G1")?.units.at(-1)?.typeId).toBe("tank");
  });

  it("AI-country queues tick identically (soviet order under a german player)", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const ordered = applyProductionOrder(state, "soviet", "moscow", "infantry");
    const next = gameReducer(ordered, { type: "endTurn" });

    expect(next?.productionQueues.moscow).toBeUndefined();
    const r1 = next?.armies.find((army) => army.id === "R1");
    expect(r1?.units.length).toBe(5);
    expect(r1?.units.at(-1)?.typeId).toBe("infantry");
  });

  it("orderUnit places the player's order: upfront deduction + queue append", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const next = gameReducer(state, { type: "orderUnit", fieldId: "berlin", unitTypeId: "infantry" });

    const seeded = startingIncome("germany");
    expect(next?.resources.germany).toEqual({
      money: seeded.money - 20,
      steel: seeded.steel,
      recruits: seeded.recruits - 5,
    });
    expect(next?.productionQueues.berlin).toEqual([{ typeId: "infantry", remainingTurns: 1 }]);
  });

  it("orderUnit is a backstop: an illegal order returns the state unchanged", () => {
    const state = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });

    // Not the player's city (Moscow belongs to the AI).
    const foreign = gameReducer(state, { type: "orderUnit", fieldId: "moscow", unitTypeId: "infantry" });
    expect(foreign).toBe(state);

    // No free slot: Poznań has 1 slot, ordering twice must not throw.
    const first = gameReducer(state, { type: "orderUnit", fieldId: "poznan", unitTypeId: "infantry" });
    const second = gameReducer(first, { type: "orderUnit", fieldId: "poznan", unitTypeId: "infantry" });
    expect(second).toBe(first);
  });

  it("attackArmy resolves the battle: state advances, seed advances, report stored, city captured", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // German tank army on the Bug river attacks one Soviet infantry in Brest.
    const armies = [
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "warsaw",
        units: Array.from({ length: 8 }, (_, index) => ({ id: `G1-u${index + 1}`, typeId: "tank" as const })),
        movementPoints: 2,
      },
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "brest",
        units: [{ id: "R1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state = { ...base, armies, rngSeed: 1 };

    const next = gameReducer(state, { type: "attackArmy", armyId: "G1", targetFieldId: "brest" });

    expect(next?.fieldOwners.brest).toBe("germany"); // captured (FR-009)
    expect(next?.armies.some((army) => army.id === "R1")).toBe(false); // defender destroyed
    expect(next?.lastBattleReportByCountry.germany?.attackerWins).toBe(true); // the player's slot
    expect(next?.lastBattleReportByCountry.germany?.fieldId).toBe("brest");
    expect(next?.lastBattleReportByCountry.soviet).toBeNull(); // the AI's slot untouched
    expect(next?.rngSeed).not.toBe(1); // the PRNG advanced
  });

  it("attackArmy is a backstop: illegal attacks return the state unchanged", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const armies = [
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "warsaw",
        units: [{ id: "G1-u1", typeId: "tank" as const }],
        movementPoints: 2,
      },
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "brest",
        units: [{ id: "R1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state = { ...base, armies, rngSeed: 1 };

    // No enemy army on the field (Radom Plains is empty): that path is a move.
    expect(gameReducer(state, { type: "attackArmy", armyId: "G1", targetFieldId: "radom-plains" })).toBe(state);
    // Out of reach: Moscow is far beyond the Bug river.
    expect(gameReducer(state, { type: "attackArmy", armyId: "G1", targetFieldId: "moscow" })).toBe(state);
    // Unknown army.
    expect(gameReducer(state, { type: "attackArmy", armyId: "nope", targetFieldId: "brest" })).toBe(state);
  });

  it("attackArmy propagates developer errors (lesson: bare catch masks them)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Corrupted army (units: null) — attackerStrength's for..of throws TypeError,
    // which the backstop must NOT swallow.
    const armies = [
      { id: "G1", owner: "germany" as const, fieldId: "warsaw", units: null, movementPoints: 2 },
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "brest",
        units: [{ id: "R1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state = { ...base, armies, rngSeed: 1 };
    expect(() => gameReducer(state, { type: "attackArmy", armyId: "G1", targetFieldId: "brest" })).toThrow();
  });

  it("the AI turn executes step by step; an AI battle writes the AI's slot only (S-06)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Soviet tanks on the Bug, one German defender in Warsaw: the planner's
    // priority 3 attacks Warsaw (P = 1).
    const armies = [
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "bug-river",
        units: Array.from({ length: 8 }, (_, i) => ({ id: `R1-u${i + 1}`, typeId: "tank" as const })),
        movementPoints: 2,
      },
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "warsaw",
        units: [{ id: "G1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state = { ...base, armies };
    const planned = gameReducer(state, { type: "endTurn" });
    if (planned === null) throw new Error("planned state is null");

    expect(planned.aiPlan[0]).toEqual({ kind: "attack", armyId: "R1", targetFieldId: "warsaw" });
    const next = drainAiTurn(planned);

    expect(next.fieldOwners.warsaw).toBe("soviet"); // captured by the AI
    expect(next.lastBattleReportByCountry.soviet?.attackerWins).toBe(true); // the AI's slot
    expect(next.lastBattleReportByCountry.soviet?.fieldId).toBe("warsaw");
    expect(next.lastBattleReportByCountry.germany).toBeNull(); // the player's slot untouched
    expect(next.aiTurnLog.some((entry) => entry.kind === "battle")).toBe(true);
    expect(next.turn).toBe(2); // rolled over after the drain
  });

  it("aiStep skips an illegal planned action without failing the turn", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const state: typeof base = {
      ...base,
      aiPlan: [
        { kind: "move", armyId: "nope", targetFieldId: "berlin" }, // unknown army: domain error
        { kind: "order", fieldId: "moscow", unitTypeId: "infantry" },
      ],
    };

    const skipped = gameReducer(state, { type: "aiStep" });
    expect(skipped?.aiPlan).toEqual([{ kind: "order", fieldId: "moscow", unitTypeId: "infantry" }]);
    expect(skipped?.turn).toBe(1); // not the last action: no rollover yet
    expect(skipped?.aiTurnLog).toEqual([]); // nothing observable happened

    const drained = gameReducer(skipped, { type: "aiStep" });
    expect(drained?.aiPlan).toEqual([]);
    expect(drained?.turn).toBe(2); // last action done: rollover + movement reset
    expect(drained?.productionQueues.moscow).toEqual([{ typeId: "infantry", remainingTurns: 1 }]);
  });
});
