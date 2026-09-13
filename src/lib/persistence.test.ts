import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialGameState, gameReducer } from "@/lib/game-state";
import {
  clearGame,
  hasSavedGame,
  loadGame,
  persistDecision,
  SAVE_STORAGE_KEY,
  SAVE_VERSION,
  saveGame,
} from "@/lib/persistence";
import { drainAiTurn, failWith, MemoryStorage } from "@/lib/test-utils";
import type { GameState } from "@/types";

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Plants a raw entry so failure paths can be tested against arbitrary payloads. */
function plantEntry(envelope: unknown): void {
  storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(envelope));
}

/** A real campaign a few reducer steps in (order staged, AI turn planned, one AI action applied). */
function playedState(): GameState {
  const started =
    gameReducer(null, {
      type: "startGame",
      playerCountryId: "germany",
      aiCountryId: "soviet",
      seed: 7,
    }) ?? failWith("playedState: startGame returned null");
  const ordered =
    gameReducer(started, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" }) ??
    failWith("playedState: orderUnit returned null");
  const planned = gameReducer(ordered, { type: "endTurn" }) ?? failWith("playedState: endTurn returned null");
  return gameReducer(planned, { type: "aiStep" }) ?? failWith("playedState: aiStep returned null");
}

/** A save as the pre-"skipped"-epoch writer produced it: aiTurnLog entries limited to the move|battle|order kinds that existed before the guard was widened in place. */
function oldEpochState(): GameState {
  const base = playedState();
  return {
    ...base,
    aiTurnLog: [{ kind: "move", armyId: "R2", fromFieldId: "minsk", toFieldId: "smolensk", capturedCity: false }],
  };
}

/**
 * A reducer-reached late-game state (seed 7): three build turns, then the player
 * attacks — many armies, full production queues, a populated battle report.
 */
function lateGameState(): GameState {
  let state: GameState | null = gameReducer(null, {
    type: "startGame",
    playerCountryId: "germany",
    aiCountryId: "soviet",
    seed: 7,
  });
  for (let turn = 1; turn <= 3; turn += 1) {
    const ordered = gameReducer(state, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" });
    state = drainAiTurn(
      gameReducer(ordered, { type: "endTurn" }) ?? failWith(`late-game turn ${turn}: endTurn returned null`),
      `late-game turn ${turn}`,
    );
  }
  if (state === null) throw new Error("late-game recipe broke: state went null");
  return (
    gameReducer(state, { type: "attackArmy", armyId: "G2", targetFieldId: "lublin-plains" }) ??
    failWith("lateGameState: attackArmy returned null")
  );
}

describe("persistDecision", () => {
  it("skips on the setup screen (null state) — nothing is saved or cleared", () => {
    expect(persistDecision(null)).toBe("skip");
  });

  it("saves an in-progress campaign", () => {
    expect(persistDecision(playedState())).toBe("save");
  });

  it("clears a finished campaign instead of saving it — a winner is never persisted", () => {
    expect(persistDecision({ ...playedState(), winner: "germany" })).toBe("clear");
  });

  it("stays at skip after a post-victory reset, so storage stays empty", () => {
    const afterReset = gameReducer({ ...playedState(), winner: "germany" }, { type: "resetGame" });
    expect(afterReset).toBeNull();
    expect(persistDecision(afterReset)).toBe("skip");
  });
});

describe("saveGame", () => {
  it("stores a versioned envelope and reports saved", () => {
    const state = createInitialGameState("germany", "soviet");
    const result = saveGame(state);
    expect(result).toBe("saved");

    const stored = storage.getItem(SAVE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "null")).toEqual({ version: SAVE_VERSION, state });
  });

  it("reports quota-exceeded as failed instead of crashing the game — the failure is not swallowed", () => {
    vi.stubGlobal(
      "localStorage",
      new (class extends MemoryStorage {
        public override setItem(): never {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        }
      })(),
    );

    expect(() => {
      saveGame(createInitialGameState("germany", "soviet"));
    }).not.toThrow();
    expect(saveGame(createInitialGameState("germany", "soviet"))).toBe("failed");
  });

  it("reports failed when storage is unavailable — nothing is persisted, the caller must know", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(() => {
      saveGame(createInitialGameState("germany", "soviet"));
    }).not.toThrow();
    expect(saveGame(createInitialGameState("germany", "soviet"))).toBe("failed");
  });
});

describe("loadGame", () => {
  it("returns null when no save exists", () => {
    expect(loadGame()).toBeNull();
  });

  it("round-trips a played campaign losslessly", () => {
    const state = playedState();
    saveGame(state);

    expect(loadGame()).toEqual(state);
  });

  it("round-trips a mid-AI-replay snapshot (non-empty aiPlan)", () => {
    const base = playedState();
    const midReplay: GameState = {
      ...base,
      aiPlan: [{ kind: "move", armyId: "R2", targetFieldId: "smolensk" }],
    };
    saveGame(midReplay);

    expect(loadGame()).toEqual(midReplay);
    expect(loadGame()?.aiPlan).toHaveLength(1);
  });

  it("round-trips a save whose aiTurnLog contains a skipped-action trace", () => {
    const base = playedState();
    const withSkip: GameState = {
      ...base,
      aiTurnLog: [
        ...base.aiTurnLog,
        { kind: "skipped", action: { kind: "move", armyId: "nope", targetFieldId: "berlin" } },
      ],
    };
    saveGame(withSkip);

    expect(loadGame()).toEqual(withSkip);
  });

  it("rejects a skipped entry carrying a malformed action and removes the entry", () => {
    const base = playedState();
    const broken = {
      ...base,
      aiTurnLog: [...base.aiTurnLog, { kind: "skipped", action: { kind: "move", armyId: 7 } }],
    };
    plantEntry({ version: SAVE_VERSION, state: broken });

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("rejects a future save version and removes the entry", () => {
    plantEntry({ version: SAVE_VERSION + 1, state: createInitialGameState("germany", "soviet") });

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("rejects a past save version and removes the entry", () => {
    plantEntry({ version: SAVE_VERSION - 1, state: createInitialGameState("germany", "soviet") });

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("round-trips a save from the previous schema epoch (guard widened in place, old shape unchanged)", () => {
    const oldShape = oldEpochState();
    saveGame(oldShape);

    expect(loadGame()).toEqual(oldShape);
  });

  it("round-trips a late-game campaign losslessly, and save→load→save re-writes a byte-identical envelope", () => {
    const state = lateGameState();
    // The recipe must land on a genuinely late state — else the test degrades
    // to a duplicate of the early-game round-trip above.
    expect(state.armies.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(state.productionQueues).length).toBeGreaterThan(0);
    expect(state.lastBattleReportByCountry.germany).not.toBeNull();

    saveGame(state);
    const firstEnvelope = storage.getItem(SAVE_STORAGE_KEY);
    const restored = loadGame();

    expect(restored).toEqual(state);
    saveGame(restored ?? state);
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBe(firstEnvelope);
  });

  it("rejects corrupt JSON and removes the entry", () => {
    storage.setItem(SAVE_STORAGE_KEY, "{not json at all");

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("rejects a non-object payload and removes the entry", () => {
    storage.setItem(SAVE_STORAGE_KEY, "42");

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("rejects a payload missing a required top-level field and removes the entry", () => {
    const { rngSeed: _rngSeed, ...withoutSeed } = createInitialGameState("germany", "soviet");
    plantEntry({ version: SAVE_VERSION, state: withoutSeed });

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("rejects an army entry with a malformed unit and removes the entry", () => {
    const state = createInitialGameState("germany", "soviet");
    const broken = {
      ...state,
      armies: [{ ...state.armies[0], units: [{ id: "G1-u1", typeId: "laser" }] }],
    };
    plantEntry({ version: SAVE_VERSION, state: broken });

    expect(loadGame()).toBeNull();
    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
  });

  it("swallows a blocked discard (removeItem throws) instead of crashing", () => {
    const blocked = new (class extends MemoryStorage {
      public override removeItem(): never {
        throw new DOMException("blocked", "SecurityError");
      }
    })();
    blocked.setItem(SAVE_STORAGE_KEY, "{not json at all");
    vi.stubGlobal("localStorage", blocked);

    expect(loadGame()).toBeNull();
  });

  it("swallows a security-blocked read instead of crashing", () => {
    vi.stubGlobal(
      "localStorage",
      new (class extends MemoryStorage {
        public override getItem(): never {
          throw new DOMException("blocked", "SecurityError");
        }
      })(),
    );

    expect(loadGame()).toBeNull();
  });

  it("is a no-op when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(loadGame()).toBeNull();
  });
});

describe("hasSavedGame", () => {
  it("reports false when no save exists", () => {
    expect(hasSavedGame()).toBe(false);
  });

  it("reports true after saveGame", () => {
    saveGame(createInitialGameState("germany", "soviet"));
    expect(hasSavedGame()).toBe(true);
  });

  it("reports false after clearGame", () => {
    saveGame(createInitialGameState("germany", "soviet"));
    clearGame();
    expect(hasSavedGame()).toBe(false);
  });

  it("is presence-only — a corrupt entry still reports true; deleting is how the player drops it", () => {
    storage.setItem(SAVE_STORAGE_KEY, "{not json at all");
    expect(hasSavedGame()).toBe(true);
    expect(loadGame()).toBeNull(); // loadGame discarded it, but the peek made no such promise
  });

  it("swallows a security-blocked read instead of crashing", () => {
    vi.stubGlobal(
      "localStorage",
      new (class extends MemoryStorage {
        public override getItem(): never {
          throw new DOMException("blocked", "SecurityError");
        }
      })(),
    );

    expect(hasSavedGame()).toBe(false);
  });

  it("is a no-op false when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(hasSavedGame()).toBe(false);
  });
});

describe("clearGame", () => {
  it("removes the stored entry", () => {
    saveGame(createInitialGameState("germany", "soviet"));
    clearGame();

    expect(storage.getItem(SAVE_STORAGE_KEY)).toBeNull();
    expect(loadGame()).toBeNull();
  });

  it("is idempotent when no entry exists", () => {
    expect(() => {
      clearGame();
      clearGame();
    }).not.toThrow();
  });

  it("is a no-op when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(() => {
      clearGame();
    }).not.toThrow();
  });
});
