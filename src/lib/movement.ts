/**
 * Movement rules (change: army-movement, S-02): armies move as single tokens,
 * the slowest unit sets the pace, and terrain changes the entry cost (FR-005).
 * Enemy-occupied fields stay impassable for movement — attacking them is the
 * battle slice's job (S-04: `attackFields` + `src/lib/battle.ts`).
 */
import { MAP_FIELDS } from "@/data/map";
import { TERRAIN } from "@/data/terrain";
import { UNIT_TYPES } from "@/data/units";
import type { Army, GameState, MapField, UnitTypeId } from "@/types";

const FIELD_BY_ID: ReadonlyMap<string, MapField> = new Map(MAP_FIELDS.map((field) => [field.id, field]));

function getField(fieldId: string): MapField {
  const field = FIELD_BY_ID.get(fieldId);
  if (field === undefined) {
    throw new Error(`unknown field "${fieldId}"`);
  }
  return field;
}

const UNIT_MOVEMENT: ReadonlyMap<UnitTypeId, number> = new Map(
  UNIT_TYPES.map((unitType) => [unitType.id, unitType.movement]),
);

/** The army's pace: the slowest unit's movement (FR-005). */
export function armySpeed(army: Army): number {
  if (army.units.length === 0) {
    throw new Error(`army "${army.id}" has no units`);
  }
  const movements = army.units.map((unit) => UNIT_MOVEMENT.get(unit.typeId));
  if (movements.some((movement) => movement === undefined)) {
    throw new Error(`army "${army.id}" contains an unknown unit type`);
  }
  return Math.min(...(movements as number[]));
}

/** Entry cost of a field; cities are flat cost 1 — `TERRAIN` has no "city" key. */
export function movementCostOf(field: MapField): number {
  return field.type === "city" ? 1 : TERRAIN[field.type].movementCost;
}

/**
 * Cheapest-path reachability within the army's remaining movement points.
 * Fields occupied by an enemy army are impassable; own armies' fields are
 * passable (merge targets). The army's own field is not part of the result.
 */
export function reachableFields(state: GameState, armyId: string): Map<string, { cost: number; path: string[] }> {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (army === undefined) {
    throw new Error(`unknown army "${armyId}"`);
  }

  const blocked = new Set(
    state.armies.filter((candidate) => candidate.owner !== army.owner).map((candidate) => candidate.fieldId),
  );

  const best = new Map<string, { cost: number; path: string[] }>();
  const queue: { id: string; cost: number; path: string[] }[] = [{ id: army.fieldId, cost: 0, path: [army.fieldId] }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current === undefined || best.has(current.id)) {
      continue;
    }
    if (current.id !== army.fieldId) {
      best.set(current.id, { cost: current.cost, path: current.path });
    }
    for (const nextId of getField(current.id).connections) {
      if (blocked.has(nextId) || best.has(nextId)) {
        continue;
      }
      const cost = current.cost + movementCostOf(getField(nextId));
      if (cost <= army.movementPoints) {
        queue.push({ id: nextId, cost, path: [...current.path, nextId] });
      }
    }
  }
  // A merge target that would exceed the 8-unit cap (FR-004) is not a legal
  // move — keep it out of the reach set so the UI never promises it.
  for (const candidate of state.armies) {
    if (candidate.owner === army.owner && candidate.units.length + army.units.length > 8) {
      best.delete(candidate.fieldId);
    }
  }
  return best;
}

/** The cheapest path to `targetFieldId`, or null when out of reach. */
export function planMove(
  state: GameState,
  armyId: string,
  targetFieldId: string,
): { path: string[]; cost: number } | null {
  return reachableFields(state, armyId).get(targetFieldId) ?? null;
}

/**
 * Enemy-army-occupied fields the army can attack this turn (S-04, FR-007):
 * reachable within its movement points as terminal destinations only — the
 * Dijkstra never expands an enemy-occupied field, so no path leads *through*
 * an enemy army. The army's own field is never an attack target.
 */
export function attackFields(state: GameState, armyId: string): Map<string, { cost: number }> {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (army === undefined) {
    throw new Error(`unknown army "${armyId}"`);
  }

  const enemyOccupied = new Set(
    state.armies.filter((candidate) => candidate.owner !== army.owner).map((candidate) => candidate.fieldId),
  );

  const targets = new Map<string, { cost: number }>();
  const done = new Set<string>();
  const queue: { id: string; cost: number }[] = [{ id: army.fieldId, cost: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current === undefined || done.has(current.id)) {
      continue;
    }
    done.add(current.id);
    if (current.id !== army.fieldId && enemyOccupied.has(current.id)) {
      // Attack targets are terminal: the battle decides who ends up on the
      // field, so an enemy field is never expanded into a longer path.
      targets.set(current.id, { cost: current.cost });
      continue;
    }
    for (const nextId of getField(current.id).connections) {
      if (done.has(nextId)) {
        continue;
      }
      const cost = current.cost + movementCostOf(getField(nextId));
      if (cost <= army.movementPoints) {
        queue.push({ id: nextId, cost });
      }
    }
  }
  return targets;
}

/**
 * Pure application of a move: spend the path cost, walk the army along it,
 * flip every non-city field entered to the mover's owner, and merge into a
 * standing own army on the target (FR-004 cap of 8). An enemy city entered
 * without a defending army is captured on the way (S-04, FR-009): it flips
 * owner and its production queue is cancelled. Enemy-occupied fields are
 * never on a legal path — battles go through `resolveBattle`. Throws on
 * illegal moves.
 */
export function applyMove(state: GameState, armyId: string, targetFieldId: string): GameState {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (army === undefined) {
    throw new Error(`unknown army "${armyId}"`);
  }
  const plan = planMove(state, armyId, targetFieldId);
  if (plan === null) {
    throw new Error(`field "${targetFieldId}" is not reachable for army "${armyId}"`);
  }

  const standing = state.armies.find(
    (candidate) => candidate.id !== army.id && candidate.fieldId === targetFieldId && candidate.owner === army.owner,
  );
  if (standing !== undefined && standing.units.length + army.units.length > 8) {
    throw new Error(`merging armies "${army.id}" and "${standing.id}" would exceed the 8-unit limit`);
  }

  const armies =
    standing !== undefined
      ? state.armies
          .filter((candidate) => candidate.id !== army.id)
          .map((candidate) =>
            candidate.id === standing.id ? { ...candidate, units: [...candidate.units, ...army.units] } : candidate,
          )
      : state.armies.map((candidate) =>
          candidate.id === army.id
            ? { ...candidate, fieldId: targetFieldId, movementPoints: candidate.movementPoints - plan.cost }
            : candidate,
        );

  const fieldOwners = { ...state.fieldOwners };
  const capturedCities: string[] = [];
  for (const fieldId of plan.path.slice(1)) {
    const field = getField(fieldId);
    if (field.type === "city" && fieldOwners[fieldId] === army.owner) {
      continue; // own cities never flip by movement
    }
    fieldOwners[fieldId] = army.owner;
    if (field.type === "city") {
      capturedCities.push(fieldId); // undefended enemy city: free capture (FR-009)
    }
  }
  // Captured cities lose their queues (S-04): rebuild the record without them —
  // empty queues drop out, as in production.ts.
  const productionQueues = Object.fromEntries(
    Object.entries(state.productionQueues).filter(([fieldId]) => !capturedCities.includes(fieldId)),
  );

  return { ...state, armies, fieldOwners, productionQueues };
}
