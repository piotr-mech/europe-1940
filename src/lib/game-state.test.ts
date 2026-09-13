import { describe, expect, it } from "vitest";

import { getGameData } from "@/lib/game-data";
import { createInitialGameState, dominantUnitType, gameReducer, inputBlocked } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import { applyProductionOrder } from "@/lib/production";
import { drainAiTurn } from "@/lib/test-utils";
import type { Army, CountryId, GameState, ResourceBag } from "@/types";

const gameData = getGameData();
const COUNTRY_IDS: readonly CountryId[] = ["germany", "soviet"];

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

  it("an empty AI plan rolls the turn over immediately — no freeze, no income farm (review F1)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // The AI has no armies and no cities (all flipped to the player) and
    // nothing to order: the plan is empty. Reachable in play before S-07.
    const stripped: GameState = {
      ...base,
      armies: base.armies.filter((army) => army.owner === "germany"),
      fieldOwners: Object.fromEntries(
        Object.entries(base.fieldOwners).map(([fieldId, owner]) => [fieldId, owner === "soviet" ? "germany" : owner]),
      ),
      resources: { germany: base.resources.germany, soviet: { money: 0, steel: 0, recruits: 0 } },
    };
    const seeded = startingIncome("germany");
    const allCitiesIncome = startingIncome("germany"); // + every former Soviet city, now German:
    const flipped = startingIncome("soviet");

    const next = gameReducer(stripped, { type: "endTurn" });
    if (next === null) throw new Error("next state is null");

    expect(next.aiPlan).toEqual([]); // nothing staged
    expect(next.turn).toBe(2); // the turn rolled over immediately
    expect(next.resources.germany).toEqual({
      // seeded + every city's income, applied exactly once
      money: seeded.money + allCitiesIncome.money + flipped.money,
      steel: seeded.steel + allCitiesIncome.steel + flipped.steel,
      recruits: seeded.recruits + allCitiesIncome.recruits + flipped.recruits,
    });
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
    // The drop is observable: the skipped action carries a trace entry (testing-regression-floor).
    expect(skipped?.aiTurnLog).toEqual([
      { kind: "skipped", action: { kind: "move", armyId: "nope", targetFieldId: "berlin" } },
    ]);

    const drained = gameReducer(skipped, { type: "aiStep" });
    expect(drained?.aiPlan).toEqual([]);
    expect(drained?.turn).toBe(2); // last action done: rollover + movement reset
    expect(drained?.productionQueues.moscow).toEqual([{ typeId: "infantry", remainingTurns: 1 }]);
  });

  it("aiStep traces a stale planned attack whose target an earlier action destroyed (G3, seed 1)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Two Soviet tank armies within reach of Brest; one German defender there.
    // The first attack destroys the defender and captures the city, so the
    // second attack targets a field held by the AI's own army — not a battle.
    const armies = [
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "bug-river",
        units: Array.from({ length: 8 }, (_, i) => ({ id: `R1-u${i + 1}`, typeId: "tank" as const })),
        movementPoints: 2,
      },
      {
        id: "R2",
        owner: "soviet" as const,
        fieldId: "lublin-plains",
        units: Array.from({ length: 8 }, (_, i) => ({ id: `R2-u${i + 1}`, typeId: "tank" as const })),
        movementPoints: 2,
      },
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "brest",
        units: [{ id: "G1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state: GameState = {
      ...base,
      armies,
      aiPlan: [
        { kind: "attack", armyId: "R1", targetFieldId: "brest" },
        { kind: "attack", armyId: "R2", targetFieldId: "brest" },
      ],
    };

    const next = drainAiTurn(state);

    expect(next.fieldOwners.brest).toBe("soviet"); // the first attack took the city
    expect(next.aiTurnLog).toEqual([
      expect.objectContaining({ kind: "battle" }), // the executed attack
      { kind: "skipped", action: { kind: "attack", armyId: "R2", targetFieldId: "brest" } },
    ]);
    expect(next.turn).toBe(2); // drained: rollover even though the last action was skipped
  });

  it("aiStep traces an illegal order — the plan's own earlier order took the last slot (G3)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Brest has a single production slot: the second order was legal against
    // the planned-from state but not against the world one action later.
    const state: GameState = {
      ...base,
      aiPlan: [
        { kind: "order", fieldId: "brest", unitTypeId: "infantry" },
        { kind: "order", fieldId: "brest", unitTypeId: "infantry" },
      ],
    };

    const next = drainAiTurn(state);

    expect(next.productionQueues.brest).toEqual([{ typeId: "infantry", remainingTurns: 1 }]);
    expect(next.aiTurnLog).toEqual([
      { kind: "order", fieldId: "brest", unitTypeId: "infantry" },
      { kind: "skipped", action: { kind: "order", fieldId: "brest", unitTypeId: "infantry" } },
    ]);
  });

  it("aiStep traces two consecutive skips and still executes the legal action after them (G3)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const state: GameState = {
      ...base,
      aiPlan: [
        { kind: "move", armyId: "nope", targetFieldId: "berlin" }, // unknown army: domain error
        { kind: "attack", armyId: "nope", targetFieldId: "brest" }, // unknown army: domain error
        { kind: "order", fieldId: "moscow", unitTypeId: "infantry" },
      ],
    };

    const next = drainAiTurn(state);

    expect(next.aiTurnLog).toEqual([
      { kind: "skipped", action: { kind: "move", armyId: "nope", targetFieldId: "berlin" } },
      { kind: "skipped", action: { kind: "attack", armyId: "nope", targetFieldId: "brest" } },
      { kind: "order", fieldId: "moscow", unitTypeId: "infantry" },
    ]);
    expect(next.turn).toBe(2);
    expect(next.productionQueues.moscow).toEqual([{ typeId: "infantry", remainingTurns: 1 }]);
  });

  it("an illegal action as the last plan entry still rolls the turn over (G3)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const state: GameState = {
      ...base,
      aiPlan: [
        { kind: "order", fieldId: "moscow", unitTypeId: "infantry" },
        { kind: "move", armyId: "nope", targetFieldId: "berlin" }, // skipped last entry
      ],
    };

    const next = drainAiTurn(state);

    expect(next.aiPlan).toEqual([]);
    expect(next.turn).toBe(2); // a dropped last action must not stall the campaign
    for (const army of next.armies) {
      expect(army.movementPoints).toBe(armySpeed(army)); // movement reset with the rollover
    }
  });

  it("aiStep propagates developer errors (lesson: bare catch masks them)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Corrupted army (units: null) — the strength computation throws TypeError,
    // which the skip path must NOT swallow.
    const armies = [
      { id: "R1", owner: "soviet" as const, fieldId: "bug-river", units: null, movementPoints: 2 },
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "brest",
        units: [{ id: "G1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state = { ...base, armies, aiPlan: [{ kind: "attack", armyId: "R1", targetFieldId: "brest" }] };
    expect(() => gameReducer(state, { type: "aiStep" })).toThrow();
  });

  // --- S-07: victory conditions ---

  it("a fresh game has no winner", () => {
    expect(createInitialGameState("germany", "soviet").winner).toBeNull();
    expect(createInitialGameState("soviet", "germany").winner).toBeNull();
  });

  it("moveArmy free-capturing the last enemy city sets the winner (S-07)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Every Soviet-initial city except Brest is already German; undefended
    // Brest is one free capture away — Lublin -> Bug river -> Brest costs 2.
    const sovietCitiesHeld = ["vilnius", "minsk", "smolensk", "moscow", "kiev"];
    const state: GameState = {
      ...base,
      armies: [
        {
          id: "G1",
          owner: "germany" as const,
          fieldId: "lublin-plains",
          units: [{ id: "G1-u1", typeId: "tank" as const }],
          movementPoints: 2,
        },
      ],
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(sovietCitiesHeld.map((fieldId) => [fieldId, "germany" as const])),
      },
    };

    const next = gameReducer(state, { type: "moveArmy", armyId: "G1", targetFieldId: "brest" });
    expect(next?.fieldOwners.brest).toBe("germany"); // the free capture (FR-009)
    expect(next?.winner).toBe("germany");
  });

  it("attackArmy winning the last enemy city sets the winner (S-07)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Same one-city-short setup, but Brest is defended — the deciding capture
    // goes through a battle (8 tanks beat 1 infantry on the fixed seed).
    const sovietCitiesHeld = ["vilnius", "minsk", "smolensk", "moscow", "kiev"];
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
    const state: GameState = {
      ...base,
      armies,
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(sovietCitiesHeld.map((fieldId) => [fieldId, "germany" as const])),
      },
    };

    const next = gameReducer(state, { type: "attackArmy", armyId: "G1", targetFieldId: "brest" });
    expect(next?.fieldOwners.brest).toBe("germany");
    expect(next?.lastBattleReportByCountry.germany?.attackerWins).toBe(true);
    expect(next?.winner).toBe("germany");
  });

  it("aiStep setting the winner mid-replay stops the replay without a turn rollover (S-07)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // The USSR holds every German-initial city except Warsaw and attacks it
    // with overwhelming force; one extra planned action must never execute.
    const germanCitiesHeld = ["berlin", "poznan", "gdansk", "koenigsberg", "krakow"];
    const armies = [
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "bug-river",
        units: Array.from({ length: 8 }, (_, i) => ({ id: `R1-u${i + 1}`, typeId: "tank" as const })),
        movementPoints: 2,
      },
      {
        id: "R2",
        owner: "soviet" as const,
        fieldId: "minsk",
        units: [{ id: "R2-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "warsaw",
        units: [{ id: "G1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state: GameState = {
      ...base,
      turn: 7,
      armies,
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(germanCitiesHeld.map((fieldId) => [fieldId, "soviet" as const])),
      },
      aiPlan: [
        { kind: "attack", armyId: "R1", targetFieldId: "warsaw" },
        { kind: "move", armyId: "R2", targetFieldId: "orsha-plains" },
      ],
    };

    const next = gameReducer(state, { type: "aiStep" });
    if (next === null) throw new Error("next state is null");

    expect(next.fieldOwners.warsaw).toBe("soviet");
    expect(next.winner).toBe("soviet");
    expect(next.aiPlan).toEqual([]); // the remaining planned action is dropped
    expect(next.turn).toBe(7); // no rollover: the campaign ended mid-replay
    expect(next.aiTurnLog.some((entry) => entry.kind === "battle")).toBe(true); // kept for the summary
    // No movement reset: R2 keeps its spent points instead of a fresh allowance.
    expect(next.armies.find((army) => army.id === "R2")?.movementPoints).toBe(1);
  });

  it("aiStep free-capturing the last enemy city via a move sets the winner (S-07 trigger path)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // The USSR holds every German-initial city except an undefended Warsaw;
    // the planned move from Bug river decides the campaign — one extra planned
    // action must never execute (the mid-replay trap, move-kind twin).
    const germanCitiesHeld = ["berlin", "poznan", "gdansk", "koenigsberg", "krakow"];
    const armies = [
      {
        id: "R2",
        owner: "soviet" as const,
        fieldId: "bug-river",
        units: [{ id: "R2-u1", typeId: "tank" as const }],
        movementPoints: 2,
      },
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "minsk",
        units: [{ id: "R1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state: GameState = {
      ...base,
      turn: 9,
      armies,
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(germanCitiesHeld.map((fieldId) => [fieldId, "soviet" as const])),
      },
      aiPlan: [
        { kind: "move", armyId: "R2", targetFieldId: "warsaw" },
        { kind: "move", armyId: "R1", targetFieldId: "orsha-plains" },
      ],
    };

    const next = gameReducer(state, { type: "aiStep" });
    if (next === null) throw new Error("next state is null");

    expect(next.fieldOwners.warsaw).toBe("soviet"); // the free capture (FR-009)
    expect(next.winner).toBe("soviet");
    expect(next.aiPlan).toEqual([]); // the remaining planned action is dropped
    expect(next.turn).toBe(9); // no rollover: the campaign ended mid-replay
    const moveEntry = next.aiTurnLog.find((entry) => entry.kind === "move");
    expect(moveEntry).toMatchObject({ kind: "move", armyId: "R2", toFieldId: "warsaw", capturedCity: true });
    // No movement reset (no rollover): R1 keeps its spent point.
    expect(next.armies.find((army) => army.id === "R1")?.movementPoints).toBe(1);
  });

  it("attackArmy winning through an intermediate enemy city sets the winner (S-07 trigger path)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // The target is a terrain field (vistula-river) with a German defender; the
    // shortest attack path lublin-plains -> warsaw -> vistula-river passes through
    // undefended Warsaw — the LAST German-initial city. The deciding capture is
    // the intermediate field, not the target (battle.ts attacker-win flips the path).
    const germanCitiesHeld = ["berlin", "poznan", "gdansk", "koenigsberg", "krakow"];
    const armies = [
      {
        id: "R1",
        owner: "soviet" as const,
        fieldId: "lublin-plains",
        units: Array.from({ length: 8 }, (_, index) => ({ id: `R1-u${index + 1}`, typeId: "tank" as const })),
        movementPoints: 2,
      },
      {
        id: "G1",
        owner: "germany" as const,
        fieldId: "vistula-river",
        units: [{ id: "G1-u1", typeId: "infantry" as const }],
        movementPoints: 1,
      },
    ];
    const state: GameState = {
      ...base,
      armies,
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(germanCitiesHeld.map((fieldId) => [fieldId, "soviet" as const])),
        "lublin-plains": "soviet",
      },
    };

    const next = gameReducer(state, { type: "attackArmy", armyId: "R1", targetFieldId: "vistula-river" });

    expect(next?.fieldOwners["vistula-river"]).toBe("soviet"); // the target flipped
    expect(next?.fieldOwners.warsaw).toBe("soviet"); // the intermediate city flipped too
    expect(next?.lastBattleReportByCountry.soviet?.attackerWins).toBe(true);
    expect(next?.winner).toBe("soviet"); // decided by the intermediate capture
  });

  it("moveArmy passing through the last enemy city sets the winner (S-07 trigger path)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    // Germany holds every Soviet-initial city except Minsk; the two-field move
    // orsha-plains -> minsk -> bialowieza-forest passes THROUGH undefended Minsk
    // (the deciding flip) and ends on a terrain field.
    const sovietCitiesHeld = ["brest", "vilnius", "smolensk", "moscow", "kiev"];
    const state: GameState = {
      ...base,
      armies: [
        {
          id: "G1",
          owner: "germany" as const,
          fieldId: "orsha-plains",
          units: [{ id: "G1-u1", typeId: "tank" as const }],
          movementPoints: 2,
        },
      ],
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(sovietCitiesHeld.map((fieldId) => [fieldId, "germany" as const])),
        "orsha-plains": "germany",
      },
    };

    const next = gameReducer(state, { type: "moveArmy", armyId: "G1", targetFieldId: "bialowieza-forest" });

    expect(next?.fieldOwners.minsk).toBe("germany"); // the pass-through capture (FR-009)
    expect(next?.armies.find((army) => army.id === "G1")?.fieldId).toBe("bialowieza-forest"); // the march completed
    expect(next?.winner).toBe("germany"); // decided by the intermediate city
  });

  it("the skipped aiStep path still runs the victory check — and cannot invent one (S-07)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });

    // Direction 1: an already-satisfied condition (synthetic double-satisfaction
    // guard, S-07 plan :20) is not swallowed by a dropped action — the skip path's
    // tail check sets the winner and skips the rollover.
    const sovietCityIds = ["brest", "vilnius", "minsk", "smolensk", "moscow", "kiev"];
    const satisfied: GameState = {
      ...base,
      turn: 11,
      aiPlan: [{ kind: "move", armyId: "no-such-army", targetFieldId: "minsk" }], // illegal: dropped, traced
      fieldOwners: {
        ...base.fieldOwners,
        ...Object.fromEntries(sovietCityIds.map((fieldId) => [fieldId, "germany" as const])),
      },
    };

    const decided = gameReducer(satisfied, { type: "aiStep" });
    expect(decided?.winner).toBe("germany"); // the skip path's check fires
    expect(decided?.aiPlan).toEqual([]);
    expect(decided?.turn).toBe(11); // no rollover on a decided campaign
    expect(decided?.aiTurnLog.some((entry) => entry.kind === "skipped")).toBe(true); // the drop stays observable

    // Direction 2: with no condition satisfied, the same all-illegal drain ends
    // winner-less and still rolls the turn over (the stuck-campaign regression).
    const undecided: GameState = {
      ...base,
      turn: 4,
      aiPlan: [
        { kind: "move", armyId: "no-such-army", targetFieldId: "minsk" },
        { kind: "move", armyId: "also-gone", targetFieldId: "kiev" },
      ],
    };
    const drained = drainAiTurn(undecided, "all-illegal drain");
    expect(drained.winner).toBeNull();
    expect(drained.turn).toBe(5); // rollover happened despite every action being dropped
    expect(drained.aiTurnLog.filter((entry) => entry.kind === "skipped")).toHaveLength(2);
  });

  it("every gameplay action on a finished state is a no-op (S-07 freeze)", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const finished: GameState = {
      ...base,
      winner: "germany",
      aiPlan: [{ kind: "move", armyId: "R1", targetFieldId: "bug-river" }],
    };

    expect(gameReducer(finished, { type: "moveArmy", armyId: "G2", targetFieldId: "radom-plains" })).toBe(finished);
    expect(gameReducer(finished, { type: "attackArmy", armyId: "G2", targetFieldId: "bug-river" })).toBe(finished);
    expect(gameReducer(finished, { type: "orderUnit", fieldId: "berlin", unitTypeId: "infantry" })).toBe(finished);
    expect(gameReducer(finished, { type: "endTurn" })).toBe(finished);
    expect(gameReducer(finished, { type: "aiStep" })).toBe(finished);
  });

  it("resetGame returns null — the setup screen, even from a finished game", () => {
    const base = gameReducer(null, { type: "startGame", playerCountryId: "germany", aiCountryId: "soviet", seed: 1 });
    const finished: GameState = { ...base, winner: "germany" };
    expect(gameReducer(finished, { type: "resetGame" })).toBeNull();
    expect(gameReducer(base, { type: "resetGame" })).toBeNull();
  });
});

describe("inputBlocked (the UI input contract, risk #6)", () => {
  const PLAYER_ACTIONS = ["moveArmy", "attackArmy", "orderUnit", "endTurn"] as const;
  const GAMEPLAY_ACTIONS = [...PLAYER_ACTIONS, "aiStep"] as const;

  const fresh = createInitialGameState("germany", "soviet");
  const midReplay: GameState = {
    ...fresh,
    aiPlan: [{ kind: "move", armyId: "R2", targetFieldId: "smolensk" }],
  };
  const finished: GameState = { ...fresh, winner: "germany" };

  it("never blocks startGame or resetGame, on any state", () => {
    for (const action of ["startGame", "resetGame"] as const) {
      expect(inputBlocked(null, action)).toBe(false);
      expect(inputBlocked(fresh, action)).toBe(false);
      expect(inputBlocked(midReplay, action)).toBe(false);
      expect(inputBlocked(finished, action)).toBe(false);
    }
  });

  it("blocks every gameplay action on the setup screen (null state)", () => {
    for (const action of GAMEPLAY_ACTIONS) {
      expect(inputBlocked(null, action)).toBe(true);
    }
  });

  it("offers player actions on a fresh campaign; aiStep has nothing staged", () => {
    for (const action of PLAYER_ACTIONS) {
      expect(inputBlocked(fresh, action)).toBe(false);
    }
    expect(inputBlocked(fresh, "aiStep")).toBe(true);
  });

  it("blocks player actions while the AI queue is non-empty (the documented UI contract)", () => {
    for (const action of PLAYER_ACTIONS) {
      expect(inputBlocked(midReplay, action)).toBe(true);
    }
    expect(inputBlocked(midReplay, "aiStep")).toBe(false);
  });

  it("blocks everything except reset/start once a winner is set (frozen campaign)", () => {
    for (const action of GAMEPLAY_ACTIONS) {
      expect(inputBlocked(finished, action)).toBe(true);
    }
  });
});
