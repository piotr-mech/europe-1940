import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { UNIT_TYPES } from "@/data/units";
import { gameReducer, inputBlocked } from "@/lib/game-state";
import { movementAllowance } from "@/lib/supply";
import { assertStructuralInvariants, drainAiTurn } from "@/lib/test-utils";
import type { CountryId, GameState, ResourceBag } from "@/types";

/**
 * Scripted full campaign cycles (test-plan Phase 4, risk #6): the whole
 * turn/campaign flow as one tested sequence — economy → staged AI replay →
 * rollover or terminal freeze — plus an acting-player structural soak.
 * Expected values derive from the datasets (city incomes, unit costs) and the
 * run's own before/after states, never from re-running engine internals.
 */

const INFANTRY = UNIT_TYPES.find((unitType) => unitType.id === "infantry");
if (INFANTRY === undefined) throw new Error("infantry missing from UNIT_TYPES");

/** City income summed over the fields a country CURRENTLY controls (dataset oracle). */
function cityIncomeOf(state: GameState, countryId: CountryId): ResourceBag {
  return MAP_FIELDS.filter(
    (field) => field.city !== null && state.fieldOwners[field.id] === countryId,
  ).reduce<ResourceBag>(
    (sum, field) => ({
      money: sum.money + field.city.income.money,
      steel: sum.steel + field.city.income.steel,
      recruits: sum.recruits + field.city.income.recruits,
    }),
    { money: 0, steel: 0, recruits: 0 },
  );
}

function addResources(a: ResourceBag, b: ResourceBag): ResourceBag {
  return { money: a.money + b.money, steel: a.steel + b.steel, recruits: a.recruits + b.recruits };
}

describe("scripted full cycle (risk #6)", () => {
  it("(seed 7) terminal path: player capture decides — economy stops, freeze, reset to setup", () => {
    let state = gameReducer(null, {
      type: "startGame",
      playerCountryId: "germany",
      aiCountryId: "soviet",
      seed: 7,
    });
    if (state === null) throw new Error("startGame returned null");

    // Near-victory (S-07 plan :203 recipe): Germany holds every Soviet-initial
    // city except undefended Brest; one free capture decides.
    const sovietCitiesHeld = ["vilnius", "minsk", "smolensk", "moscow", "kiev"];
    state = {
      ...state,
      armies: [
        {
          id: "G1",
          owner: "germany" as const,
          fieldId: "lublin-plains",
          units: [{ id: "G1-u1", typeId: "tank" as const }],
          movementPoints: 2,
        },
        {
          id: "R2",
          owner: "soviet" as const,
          fieldId: "minsk",
          units: [{ id: "R2-u1", typeId: "infantry" as const }],
          movementPoints: 1,
        },
      ],
      fieldOwners: {
        ...state.fieldOwners,
        ...Object.fromEntries(sovietCitiesHeld.map((fieldId) => [fieldId, "germany" as const])),
      },
    };

    // Player orders production first (its cost is the economy observable the
    // freeze must preserve exactly).
    const preOrder = state.resources.germany;
    const ordered = gameReducer(state, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" });
    expect(ordered?.productionQueues.warsaw).toHaveLength(1);
    expect(ordered?.resources.germany).toEqual({
      money: preOrder.money - INFANTRY.cost.money,
      steel: preOrder.steel - INFANTRY.cost.steel,
      recruits: preOrder.recruits - INFANTRY.cost.recruits,
    });

    // The deciding capture (FR-009 free capture of an undefended city).
    const decided = gameReducer(ordered, { type: "moveArmy", armyId: "G1", targetFieldId: "brest" });
    expect(decided?.fieldOwners.brest).toBe("germany");
    expect(decided?.winner).toBe("germany");

    // Terminal freeze: the economy never runs again, no action mutates the
    // final state, and inputBlocked agrees on every action.
    expect(gameReducer(decided, { type: "endTurn" })).toBe(decided);
    expect(gameReducer(decided, { type: "moveArmy", armyId: "G1", targetFieldId: "bug-river" })).toBe(decided);
    expect(gameReducer(decided, { type: "attackArmy", armyId: "G1", targetFieldId: "minsk" })).toBe(decided);
    expect(gameReducer(decided, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" })).toBe(decided);
    expect(gameReducer(decided, { type: "aiStep" })).toBe(decided);
    expect(inputBlocked(decided, "moveArmy")).toBe(true);
    expect(inputBlocked(decided, "endTurn")).toBe(true);

    // The ordered production is frozen mid-queue exactly as it was.
    expect(decided?.productionQueues.warsaw).toHaveLength(1);

    // Reset: the only exit — back to the setup screen (null).
    expect(gameReducer(decided, { type: "resetGame" })).toBeNull();
  });

  it("(seed 7) rollover path: economy → staged replay → drain → the player's next turn", () => {
    let state = gameReducer(null, {
      type: "startGame",
      playerCountryId: "germany",
      aiCountryId: "soviet",
      seed: 7,
    });
    if (state === null) throw new Error("startGame returned null");

    // Two cities short of victory (Brest AND Minsk stay Soviet) so no side can
    // decide the campaign during this cycle — the rollover path is exercised.
    const sovietCitiesHeld = ["vilnius", "smolensk", "moscow", "kiev"];
    state = {
      ...state,
      armies: [
        {
          id: "G1",
          owner: "germany" as const,
          fieldId: "lublin-plains",
          units: [{ id: "G1-u1", typeId: "tank" as const }],
          movementPoints: 2,
        },
        {
          id: "R2",
          owner: "soviet" as const,
          fieldId: "minsk",
          units: [{ id: "R2-u1", typeId: "infantry" as const }],
          movementPoints: 1,
        },
      ],
      fieldOwners: {
        ...state.fieldOwners,
        ...Object.fromEntries(sovietCitiesHeld.map((fieldId) => [fieldId, "germany" as const])),
      },
    };

    // Player action + order (build time 1 → the unit must be on the map after
    // this turn's production tick — resources-production plan :32).
    const ordered = gameReducer(state, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" });
    if (ordered === null) throw new Error("orderUnit returned null");
    const unitsBefore = ordered.armies.reduce((sum, army) => sum + army.units.length, 0);

    // endTurn: economy runs, the AI turn is STAGED — turn not yet incremented.
    const planned = gameReducer(ordered, { type: "endTurn" });
    if (planned === null) throw new Error("endTurn returned null");
    assertStructuralInvariants(planned, "post-economy");
    expect(planned.turn).toBe(1); // staged, not rolled over (ai-opponent plan :138)

    // Economy observable: both treasuries grew by exactly their CURRENT
    // controlled-city incomes (dataset-derived, FR-002).
    expect(planned.resources.germany).toEqual(
      addResources(ordered.resources.germany, cityIncomeOf(ordered, "germany")),
    );
    expect(planned.resources.soviet).toEqual(addResources(ordered.resources.soviet, cityIncomeOf(ordered, "soviet")));

    // Production observable: the build-time-1 infantry left the queue and
    // joined the map (unit on the map at the start of the next turn).
    expect(planned.productionQueues).toEqual({});
    const unitsAfterEconomy = planned.armies.reduce((sum, army) => sum + army.units.length, 0);
    expect(unitsAfterEconomy).toBe(unitsBefore + 1);

    // Input blocking mid-replay: the reducer refuses endTurn; the contract
    // helper reports every player action blocked while the queue is non-empty.
    if (planned.aiPlan.length > 0) {
      expect(gameReducer(planned, { type: "endTurn" })).toBe(planned);
      expect(inputBlocked(planned, "moveArmy")).toBe(true);
      expect(inputBlocked(planned, "orderUnit")).toBe(true);
    }
    const planLength = planned.aiPlan.length;

    // Drain: the AI visibly finishes; the turn rolls over; movement re-derives
    // from live supply (the FR-011 evaluation point).
    const next = drainAiTurn(planned, "rollover cycle");
    assertStructuralInvariants(next, "post-drain");
    expect(next.winner).toBeNull(); // two-cities-short fixture: no decision this cycle
    expect(next.turn).toBe(2); // the player's turn starts after the AI finishes
    expect(next.aiPlan).toEqual([]);
    const executed = next.aiTurnLog.filter((entry) => entry.kind !== "skipped").length;
    expect(executed + (next.aiTurnLog.length - executed)).toBe(planLength); // nothing vanished
    for (const army of next.armies) {
      expect(army.movementPoints).toBe(movementAllowance(next, army)); // supply applied at rollover
    }
  });
});

describe("acting-player structural soak (risk #6)", () => {
  const SOAK_SEEDS = [2, 3, 5, 8, 13] as const;
  const MAX_TURNS = 8;

  for (const seed of SOAK_SEEDS) {
    it(`survives ${MAX_TURNS} turns with the player acting each turn (seed ${seed})`, () => {
      let state = gameReducer(null, {
        type: "startGame",
        playerCountryId: "germany",
        aiCountryId: "soviet",
        seed,
      });
      if (state === null) throw new Error("startGame returned null");

      while (state.winner === null && state.turn < MAX_TURNS) {
        const turn = state.turn;
        const label = `seed ${seed}, turn ${turn}`;

        // Player phase: order infantry in Warsaw when affordable (the reducer
        // backstops an illegal order — either way the state stays structural).
        const ordered = gameReducer(state, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" });
        if (ordered === null) throw new Error(`${label}: orderUnit returned null`);
        assertStructuralInvariants(ordered, `${label} post-order`);

        const planned = gameReducer(ordered, { type: "endTurn" });
        if (planned === null) throw new Error(`${label}: endTurn returned null`);
        assertStructuralInvariants(planned, `${label} post-economy`);

        // Mid-replay: endTurn is refused; the input contract blocks the player.
        if (planned.aiPlan.length > 0) {
          expect(gameReducer(planned, { type: "endTurn" }), `${label}: endTurn refused mid-replay`).toBe(planned);
          expect(inputBlocked(planned, "endTurn"), `${label}: input contract agrees`).toBe(true);
        }

        const next = drainAiTurn(planned, label);
        assertStructuralInvariants(next, `${label} post-drain`);

        if (next.winner !== null) {
          // Decided mid-replay: frozen — queue cleared, no rollover (S-07).
          expect(next.aiPlan).toEqual([]);
          expect(next.turn).toBe(turn);
          state = next;
          break;
        }

        // Undecided: the queue drained, the turn rolled over — no stuck campaign.
        expect(next.aiPlan, `${label}: the plan drained`).toEqual([]);
        expect(next.turn, `${label}: the turn rolled over`).toBe(turn + 1);
        state = next;
      }

      // winner === null at the cap is legal (no draw rule — test-plan §6.6 Phase 2).
      expect([null, "germany", "soviet"]).toContain(state.winner);
    });
  }
});
