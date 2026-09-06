/**
 * Production and income rules (change: resources-production, S-03): cities pay
 * their owner income each turn (FR-002), and owned cities build queued units
 * for a paid-upfront cost over 1–2 turns within per-city slots (FR-003).
 * Pure functions over `GameState` following the movement.ts pattern —
 * throw on illegal operations, never mutate.
 */
import { MAP_FIELDS } from "@/data/map";
import { UNIT_TYPES } from "@/data/units";
import type {
  Army,
  CountryId,
  GameState,
  MapField,
  ProductionOrder,
  ResourceBag,
  ResourceId,
  UnitInstance,
  UnitType,
  UnitTypeId,
} from "@/types";

const FIELD_BY_ID: ReadonlyMap<string, MapField> = new Map(MAP_FIELDS.map((field) => [field.id, field]));

const UNIT_TYPE_BY_ID: ReadonlyMap<UnitTypeId, UnitType> = new Map(
  UNIT_TYPES.map((unitType) => [unitType.id, unitType]),
);

/** The game's resource ids in canonical order; shared single source (S-03, S-08 validator). */
export const RESOURCE_IDS: readonly ResourceId[] = ["money", "steel", "recruits"];

function getField(fieldId: string): MapField {
  const field = FIELD_BY_ID.get(fieldId);
  if (field === undefined) {
    throw new Error(`unknown field "${fieldId}"`);
  }
  return field;
}

function getUnitType(typeId: UnitTypeId): UnitType {
  const unitType = UNIT_TYPE_BY_ID.get(typeId);
  if (unitType === undefined) {
    throw new Error(`unknown unit type "${typeId}"`);
  }
  return unitType;
}

/**
 * The unit's cost for a country, applying national bonuses. USSR "Rezerwy":
 * infantry costs 2 fewer recruits (floor 0). Single source of truth — the UI
 * renders costs from this, never from `UnitType.cost` directly.
 */
export function unitCostFor(countryId: CountryId, typeId: UnitTypeId): ResourceBag {
  const unitType = getUnitType(typeId);
  if (countryId === "soviet" && typeId === "infantry") {
    return { ...unitType.cost, recruits: Math.max(0, unitType.cost.recruits - 2) };
  }
  return { ...unitType.cost };
}

/** Adds each country's owned-city income to its treasury (FR-002). */
export function collectIncome(state: GameState): GameState {
  const resources: Record<CountryId, ResourceBag> = {
    germany: { ...state.resources.germany },
    soviet: { ...state.resources.soviet },
  };
  for (const field of MAP_FIELDS) {
    if (field.city === null) continue;
    const treasury = resources[state.fieldOwners[field.id]];
    for (const resourceId of RESOURCE_IDS) {
      treasury[resourceId] += field.city.income[resourceId];
    }
  }
  return { ...state, resources };
}

/** Free slots in the city's queue; 0 for non-city fields and full queues. */
export function freeProductionSlots(state: GameState, fieldId: string): number {
  const field = getField(fieldId);
  if (field.city === null) return 0;
  // The record type claims every key exists; runtime queues are absent when
  // empty, so read through a cast that keeps `undefined` in play.
  const queue = state.productionQueues[fieldId] as ProductionOrder[] | undefined;
  return field.city.productionSlots - (queue?.length ?? 0);
}

/**
 * Pure application of a production order (FR-003): deducts the cost upfront
 * and appends `{ typeId, remainingTurns: buildTime }` to the city's queue.
 * Throws unless the field is a city owned by `countryId` with a free slot
 * and a treasury covering `unitCostFor`.
 */
export function applyProductionOrder(
  state: GameState,
  countryId: CountryId,
  fieldId: string,
  typeId: UnitTypeId,
): GameState {
  const field = getField(fieldId);
  if (field.city === null) {
    throw new Error(`field "${fieldId}" is not a city`);
  }
  if (state.fieldOwners[fieldId] !== countryId) {
    throw new Error(`city "${fieldId}" is not owned by "${countryId}"`);
  }
  if (freeProductionSlots(state, fieldId) <= 0) {
    throw new Error(`city "${fieldId}" has no free production slot`);
  }

  const cost = unitCostFor(countryId, typeId);
  const treasury = state.resources[countryId];
  for (const resourceId of RESOURCE_IDS) {
    if (treasury[resourceId] < cost[resourceId]) {
      throw new Error(`"${countryId}" cannot afford ${resourceId} for "${typeId}"`);
    }
  }

  const resources: Record<CountryId, ResourceBag> = {
    ...state.resources,
    [countryId]: {
      money: treasury.money - cost.money,
      steel: treasury.steel - cost.steel,
      recruits: treasury.recruits - cost.recruits,
    },
  };
  const queue: ProductionOrder[] = [
    ...(state.productionQueues[fieldId] ?? []),
    { typeId, remainingTurns: getUnitType(typeId).buildTime },
  ];

  return { ...state, resources, productionQueues: { ...state.productionQueues, [fieldId]: queue } };
}

/**
 * One production tick for every queue (both countries): decrements each entry;
 * completed orders (remainingTurns hits 0) spawn their unit into an army of
 * the city's owner standing on the field (first in state order with room,
 * 8-unit cap per FR-004), else a new army is formed there. Completed entries
 * leave the queue; cities whose queue empties drop out of the record.
 */
export function advanceProduction(state: GameState): GameState {
  const armies: Army[] = state.armies.map((army) => ({ ...army, units: [...army.units] }));
  const productionQueues: Record<string, ProductionOrder[]> = {};

  for (const [fieldId, queue] of Object.entries(state.productionQueues)) {
    const remaining: ProductionOrder[] = [];
    for (const order of queue) {
      const left = order.remainingTurns - 1;
      if (left > 0) {
        remaining.push({ ...order, remainingTurns: left });
      } else {
        placeCompletedUnit(armies, state, fieldId, order.typeId);
      }
    }
    if (remaining.length > 0) {
      productionQueues[fieldId] = remaining;
    }
  }

  return { ...state, armies, productionQueues };
}

/** Places one completed unit into `armies` per the placement rule (see above). */
function placeCompletedUnit(armies: Army[], state: GameState, fieldId: string, typeId: UnitTypeId): void {
  const owner = state.fieldOwners[fieldId];
  const unitType = getUnitType(typeId);
  const host = armies.find((army) => army.owner === owner && army.fieldId === fieldId && army.units.length < 8);

  if (host !== undefined) {
    host.units.push(nextUnit(host, typeId));
    return;
  }

  // No standing army with room: form a new one. Ids are deterministic
  // (city + turn + sequence) and collision-checked against the working set.
  let sequence = 1;
  let armyId = `${fieldId}-${state.turn}-${sequence}`;
  const taken = new Set(armies.map((army) => army.id));
  while (taken.has(armyId)) {
    sequence += 1;
    armyId = `${fieldId}-${state.turn}-${sequence}`;
  }
  const army: Army = {
    id: armyId,
    owner,
    fieldId,
    units: [{ id: `${armyId}-u1`, typeId }],
    movementPoints: unitType.movement, // single unit: armySpeed is its movement
  };
  armies.push(army);
}

/** A unit id under `armyId` that no unit in `armies` already carries. */
function nextUnit(host: Army, typeId: UnitTypeId): UnitInstance {
  let sequence = host.units.length + 1;
  let id = `${host.id}-u${sequence}`;
  const taken = new Set(host.units.map((unit) => unit.id));
  while (taken.has(id)) {
    sequence += 1;
    id = `${host.id}-u${sequence}`;
  }
  return { id, typeId };
}
