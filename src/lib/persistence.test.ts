import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialGameState, gameReducer } from "@/lib/game-state";
import { clearGame, loadGame, SAVE_STORAGE_KEY, SAVE_VERSION, saveGame } from "@/lib/persistence";
import type { GameState } from "@/types";

/** In-memory Storage stand-in — the vitest environment is node (no localStorage). */
class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

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
  let state = gameReducer(null, {
    type: "startGame",
    playerCountryId: "germany",
    aiCountryId: "soviet",
    seed: 7,
  });
  state = gameReducer(state, { type: "orderUnit", fieldId: "warsaw", unitTypeId: "infantry" });
  state = gameReducer(state, { type: "endTurn" });
  return gameReducer(state, { type: "aiStep" });
}

describe("saveGame", () => {
  it("stores a versioned envelope", () => {
    const state = createInitialGameState("germany", "soviet");
    saveGame(state);

    const stored = storage.getItem(SAVE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored ?? "null")).toEqual({ version: SAVE_VERSION, state });
  });

  it("swallows quota-exceeded instead of crashing the game", () => {
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
  });

  it("is a no-op when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(() => {
      saveGame(createInitialGameState("germany", "soviet"));
    }).not.toThrow();
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
