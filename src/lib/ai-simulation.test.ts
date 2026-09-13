import { describe, expect, it } from "vitest";

import { gameReducer } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import type { CountryId, GameState } from "@/types";

const COUNTRY_IDS: readonly CountryId[] = ["germany", "soviet"];
const SOAK_SEEDS = [1, 7, 42, 99, 123] as const;
const MAX_TURNS = 60;
/** A turn's plan is bounded by armies + city slots; anything near this is a stuck loop. */
const MAX_AI_STEPS_PER_TURN = 50;

/** drainAiTurn with a hard cap — an AI turn that never drains fails loudly instead of hanging. */
function drainAiTurnCapped(state: GameState, label: string): GameState {
  let current = state;
  let steps = 0;
  while (current.aiPlan.length > 0) {
    const next = gameReducer(current, { type: "aiStep" });
    if (next === null) break;
    current = next;
    steps += 1;
    expect(steps, `${label}: the AI turn must drain within ${MAX_AI_STEPS_PER_TURN} steps`).toBeLessThan(
      MAX_AI_STEPS_PER_TURN,
    );
  }
  return current;
}

/** The structural invariants that must hold after every single turn of a campaign. */
function assertStructuralInvariants(state: GameState, label: string): void {
  for (const army of state.armies) {
    expect(army.units.length, `${label}: army "${army.id}" keeps >= 1 unit`).toBeGreaterThanOrEqual(1);
    expect(army.movementPoints, `${label}: army "${army.id}" movement never negative`).toBeGreaterThanOrEqual(0);
    expect(army.movementPoints, `${label}: army "${army.id}" movement never above full speed`).toBeLessThanOrEqual(
      armySpeed(army),
    );
  }
  for (const owner of Object.values(state.fieldOwners)) {
    expect<CountryId>(COUNTRY_IDS, `${label}: every field has a valid owner`).toContain(owner);
  }
  for (const countryId of COUNTRY_IDS) {
    const treasury = state.resources[countryId];
    expect(treasury.money, `${label}: ${countryId} money never negative`).toBeGreaterThanOrEqual(0);
    expect(treasury.steel, `${label}: ${countryId} steel never negative`).toBeGreaterThanOrEqual(0);
    expect(treasury.recruits, `${label}: ${countryId} recruits never negative`).toBeGreaterThanOrEqual(0);
  }
}

describe("AI soak simulation (G4: the turn machinery never stalls or corrupts state)", () => {
  for (const seed of SOAK_SEEDS) {
    it(`survives up to ${MAX_TURNS} end-to-end turns with the player idle (seed ${seed})`, () => {
      let state = gameReducer(null, {
        type: "startGame",
        playerCountryId: "germany",
        aiCountryId: "soviet",
        seed,
      });
      if (state === null) throw new Error("startGame returned null");

      let turn = state.turn;
      while (state.winner === null && turn < MAX_TURNS) {
        const planned = gameReducer(state, { type: "endTurn" });
        if (planned === null) throw new Error(`seed ${seed}: endTurn returned null on turn ${turn}`);
        const planLength = planned.aiPlan.length;
        const label = `seed ${seed}, turn ${turn}`;

        const next = drainAiTurnCapped(planned, label);
        assertStructuralInvariants(next, label);

        if (next.winner !== null) {
          // The campaign ended mid-replay: the remaining planned actions were
          // dropped by the victory freeze — legal, and the loop exits below.
          state = next;
          break;
        }

        // Every planned action is either executed or traced as skipped
        // (Phase 2's trace makes the plan/execution mismatch countable).
        const executed = next.aiTurnLog.filter((entry) => entry.kind !== "skipped").length;
        const skipped = next.aiTurnLog.length - executed;
        expect(executed + skipped, `${label}: every planned action executed or traced, none vanished`).toBe(planLength);

        expect(next.aiPlan, `${label}: the plan drained`).toEqual([]);
        expect(next.turn, `${label}: the turn rolled over`).toBe(turn + 1);
        state = next;
        turn += 1;
      }

      // Reaching here — victory before the cap or a full 60-turn idle run —
      // with every per-turn invariant intact is the pass condition.
      expect(state.winner === null || COUNTRY_IDS.includes(state.winner), `seed ${seed}: winner is a country`).toBe(
        true,
      );
    });
  }
});
