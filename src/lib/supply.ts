/**
 * Supply rules (change: supply-lines, S-05): an army is supplied when an
 * unbroken chain of its side's fields connects it to one of its side's
 * cities (FR-010). An unsupplied army suffers the flat penalty from the
 * first unsupplied turn (FR-011): movement max 1 (`movementAllowance`) and
 * −25% attack/defense (applied in battle.ts as an integer modifier).
 * Pure functions following the movement/battle/production pattern — the
 * status is always derived from live field ownership, never stored: after
 * S-04 a side's own moves can only improve its supply, so no mid-turn
 * invalidation is needed.
 */
import { MAP_FIELDS } from "@/data/map";
import { armySpeed } from "@/lib/movement";
import type { Army, GameState, MapField } from "@/types";

const FIELD_BY_ID: ReadonlyMap<string, MapField> = new Map(MAP_FIELDS.map((field) => [field.id, field]));

function getField(fieldId: string): MapField {
  const field = FIELD_BY_ID.get(fieldId);
  if (field === undefined) {
    throw new Error(`unknown field "${fieldId}"`);
  }
  return field;
}

/**
 * True iff a chain of the army owner's fields leads from the army's field to
 * one of its cities (FR-010). BFS over map connections; a field is
 * traversable iff its owner matches the army's — so every city reached is an
 * own city. The army's own field starts the chain (armies always stand on
 * their owner's field after S-04's ownership rules).
 */
export function isSupplied(state: GameState, army: Army): boolean {
  const start = getField(army.fieldId); // throws on unknown ids (defensive style)
  if (state.fieldOwners[start.id] !== army.owner) {
    // Defensive guard (review F3): the engine keeps armies on their owner's
    // fields, but a future writer (AI, save migration) breaking that
    // invariant must not read an army on an enemy city as supplied.
    return false;
  }
  if (start.city !== null) {
    return true; // standing on an own city: trivially supplied
  }
  const visited = new Set<string>([army.fieldId]);
  const queue: string[] = [army.fieldId];
  while (queue.length > 0) {
    const fieldId = queue.shift();
    const field = getField(fieldId);
    if (field.city !== null) {
      return true;
    }
    for (const nextId of field.connections) {
      if (visited.has(nextId) || state.fieldOwners[nextId] !== army.owner) {
        continue;
      }
      visited.add(nextId);
      queue.push(nextId);
    }
  }
  return false;
}

/**
 * The army's movement allowance for a turn: full speed when supplied, max 1
 * when cut off (FR-011). The endTurn reset reads this — already-spent points
 * in the current turn are untouched.
 */
export function movementAllowance(state: GameState, army: Army): number {
  return isSupplied(state, army) ? armySpeed(army) : Math.min(armySpeed(army), 1);
}
