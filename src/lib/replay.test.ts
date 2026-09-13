import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gameReducer } from "@/lib/game-state";
import { loadGame, saveGame } from "@/lib/persistence";
import { drainAiTurn, failWith, MemoryStorage } from "@/lib/test-utils";
import type { GameState } from "@/types";

/**
 * Replay equality (test-plan Phase 3, risk #5): a restored state reproduces all
 * future behavior exactly — a campaign cut mid-AI-replay, persisted and reloaded,
 * must drain to the same action log and the same final state (seed included) as
 * an uninterrupted run. Expectations are run-vs-run comparisons only: no value
 * is ever precomputed from the implementation.
 */

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A campaign with the AI turn planned (endTurn dispatched), replay not started. */
function plannedTurn(seed: number): GameState {
  const started =
    gameReducer(null, {
      type: "startGame",
      playerCountryId: "germany",
      aiCountryId: "soviet",
      seed,
    }) ?? failWith("plannedTurn: startGame returned null");
  const ordered =
    gameReducer(started, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" }) ??
    failWith("plannedTurn: orderUnit returned null");
  return gameReducer(ordered, { type: "endTurn" }) ?? failWith("plannedTurn: endTurn returned null");
}

/** Applies exactly `steps` staged aiSteps to a planned state. */
function replaySteps(state: GameState, steps: number): GameState {
  let current = state;
  for (let i = 0; i < steps && current.aiPlan.length > 0; i += 1) {
    const next = gameReducer(current, { type: "aiStep" });
    if (next === null) break;
    current = next;
  }
  return current;
}

/** Saves, reloads, and resumes a cut state — the refresh-mid-replay path. */
function resumedDrain(cutState: GameState, label: string): GameState {
  saveGame(cutState);
  const restored = loadGame();
  expect(restored, `${label}: the cut snapshot must reload`).not.toBeNull();
  return drainAiTurn(restored ?? cutState, label);
}

describe("replay equality (risk #5)", () => {
  it.each([
    { seed: 7, cut: 0, label: "before the first aiStep" },
    { seed: 7, cut: 1, label: "after 1 aiStep" },
    { seed: 42, cut: 0, label: "before the first aiStep" },
    { seed: 42, cut: 1, label: "after 1 aiStep" },
  ])("resumed replay equals the uninterrupted run (seed $seed, cut $label)", ({ seed, cut, label }) => {
    const planned = plannedTurn(seed);
    expect(planned.aiPlan.length).toBeGreaterThan(1);
    const uninterrupted = drainAiTurn(planned, `seed ${seed} uninterrupted`);

    const resumed = resumedDrain(replaySteps(planned, cut), `seed ${seed} ${label}`);

    expect(resumed.aiTurnLog).toEqual(uninterrupted.aiTurnLog);
    expect(resumed).toEqual(uninterrupted);
  });

  it("resumed replay equals the uninterrupted run (seed 7, cut at the queue's midpoint)", () => {
    const planned = plannedTurn(7);
    const uninterrupted = drainAiTurn(planned, "seed 7 midpoint uninterrupted");
    // The planned state's log is empty (endTurn clears it), so the drained log
    // length IS the queue length — no separate counting pass needed.
    const mid = Math.floor(uninterrupted.aiTurnLog.length / 2);
    expect(mid).toBeGreaterThan(0);

    const resumed = resumedDrain(replaySteps(planned, mid), "seed 7 midpoint");

    expect(resumed.aiTurnLog).toEqual(uninterrupted.aiTurnLog);
    expect(resumed).toEqual(uninterrupted);
  });
});
