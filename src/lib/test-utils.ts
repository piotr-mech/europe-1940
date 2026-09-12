import { MAP_FIELDS } from "@/data/map";
import { createInitialGameState, gameReducer } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import type { Army, CountryId, GameState, MapField, UnitInstance, UnitTypeId } from "@/types";

const FIELD_BY_ID = new Map(MAP_FIELDS.map((field) => [field.id, field]));

export function field(fieldId: string): MapField {
  return FIELD_BY_ID.get(fieldId) ?? failWith(`unknown field "${fieldId}"`);
}

export function failWith(message: string): never {
  throw new Error(message);
}

export function units(...typeIds: UnitTypeId[]): UnitInstance[] {
  return typeIds.map((typeId, index) => ({ id: `u${index + 1}`, typeId }));
}

export function army(id: string, owner: CountryId, fieldId: string, typeIds: UnitTypeId[]): Army {
  const base: Army = { id, owner, fieldId, units: units(...typeIds) };
  return { ...base, movementPoints: armySpeed(base) };
}

/** Initial game with the armies replaced by the test setup. */
export function stateWithArmies(armies: Army[]): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, armies };
}

/** Initial game (soviet AI) with test armies and ownership overrides. */
export function stateWith(armies: Army[], owners: Record<string, CountryId> = {}): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, armies, fieldOwners: { ...state.fieldOwners, ...owners } };
}

export function findArmy(state: GameState, armyId: string) {
  return state.armies.find((candidate) => candidate.id === armyId) ?? failWith(`unknown army "${armyId}"`);
}

export function hasArmy(state: GameState, armyId: string) {
  return state.armies.some((candidate) => candidate.id === armyId);
}

/** Applies aiStep until the AI turn drains — the player's turn has begun. */
export function drainAiTurn(state: GameState): GameState {
  let current = state;
  while (current.aiPlan.length > 0) {
    const next = gameReducer(current, { type: "aiStep" });
    if (next === null) break;
    current = next;
  }
  return current;
}
