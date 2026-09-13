import { describe, expect, it } from "vitest";

import { gameReducer } from "@/lib/game-state";
import { assertStructuralInvariants, drainAiTurn } from "@/lib/test-utils";
import type { CountryId } from "@/types";

const COUNTRY_IDS: readonly CountryId[] = ["germany", "soviet"];
const SOAK_SEEDS = [1, 7, 42, 99, 123] as const;
const MAX_TURNS = 60;

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

        const next = drainAiTurn(planned, label);
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
