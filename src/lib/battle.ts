/**
 * Battle and capture rules (change: battle-city-capture, S-04): attacking an
 * enemy-occupied field resolves an automatic battle (FR-007), units end the
 * battle operational or destroyed (FR-008), and a defeated city changes owner,
 * producing for the winner from the next turn (FR-009). Pure functions over
 * `GameState` following the movement.ts/production.ts pattern — throw on
 * illegal operations, never mutate. Randomness comes from a seeded PRNG the
 * caller passes in, keeping the reducer pure and tests deterministic.
 */
import { MAP_FIELDS } from "@/data/map";
import { TERRAIN } from "@/data/terrain";
import { UNIT_TYPES } from "@/data/units";
import { attackFields } from "@/lib/movement";
import type { Army, BattleModifier, BattleReport, GameState, MapField, UnitType, UnitTypeId } from "@/types";

/** Each side's strength is scaled by a uniform roll within ±this band around 1 (US-01: small random element). Draft balance value. */
const ROLL_SPREAD = 0.2;

const FIELD_BY_ID: ReadonlyMap<string, MapField> = new Map(MAP_FIELDS.map((field) => [field.id, field]));

const UNIT_TYPE_BY_ID: ReadonlyMap<UnitTypeId, UnitType> = new Map(
  UNIT_TYPES.map((unitType) => [unitType.id, unitType]),
);

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

/** One pure mulberry32 draw: a uniform [0,1) value plus the advanced seed. */
export function rngStep(seed: number): { value: number; nextSeed: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  return { value, nextSeed: t | 0 };
}

export interface BattleResult {
  state: GameState;
  report: BattleReport;
  /** Advanced PRNG seed; the caller feeds it into the next battle. */
  nextSeed: number;
}

/**
 * The attacking army's strength: Σ unit attack + artillery support (FR-007,
 * spec §12) − the river-crossing penalty when the defender stands on a river
 * field. Clamped at 0 (a penalty can never make strength negative).
 */
export function attackerStrength(army: Army, targetField: MapField): { total: number; modifiers: BattleModifier[] } {
  const modifiers: BattleModifier[] = [];
  let total = 0;
  let support = 0;
  for (const unit of army.units) {
    const unitType = getUnitType(unit.typeId);
    total += unitType.attack;
    support += unitType.supportBonus ?? 0;
  }
  if (support > 0) {
    total += support;
    modifiers.push({ label: "Artyleria (wsparcie)", amount: support });
  }
  if (targetField.type !== "city") {
    const penalty = TERRAIN[targetField.type].attackerPenalty;
    if (penalty !== null) {
      total -= penalty;
      modifiers.push({ label: "Atak przez rzekę", amount: -penalty });
    }
  }
  return { total: Math.max(0, total), modifiers };
}

/**
 * The defending side's strength: Σ unit defense over every enemy army on the
 * field (they defend together) + the terrain or city defense bonus (FR-007).
 */
export function defenderStrength(defenders: Army[], field: MapField): { total: number; modifiers: BattleModifier[] } {
  const modifiers: BattleModifier[] = [];
  let total = 0;
  for (const army of defenders) {
    for (const unit of army.units) {
      total += getUnitType(unit.typeId).defense;
    }
  }
  if (field.type === "city") {
    const bonus = field.city?.defenseBonus ?? 0;
    if (bonus > 0) {
      total += bonus;
      modifiers.push({ label: `${field.name} (miasto)`, amount: bonus });
    }
  } else {
    const bonus = TERRAIN[field.type].defenderBonus;
    if (bonus !== null && bonus > 0) {
      total += bonus;
      modifiers.push({ label: `${field.name} (teren)`, amount: bonus });
    }
  }
  return { total: Math.max(0, total), modifiers };
}

/**
 * Pure resolution of one automatic battle (FR-007/008/009). Both sides'
 * modified strengths are scaled by a uniform random roll (±20%); the higher
 * result wins — a tie holds for the defender. The loser is destroyed entirely;
 * the winner loses a random number of units from 0 up to
 * ⌈(loser/winner strength) × winner units⌉, clamped so the winner always
 * survives with at least one unit (losses come off the end of the unit array;
 * for a defending winner, off the last defending army in state order). On an
 * attacker victory the attacker enters the field, its movement ends, and a
 * captured city's production queue is cancelled. Throws on illegal battles:
 * unknown army, no enemy army on the field (that path is a move), or a field
 * out of attack reach.
 */
export function resolveBattle(state: GameState, armyId: string, targetFieldId: string, rngSeed: number): BattleResult {
  const army = state.armies.find((candidate) => candidate.id === armyId);
  if (army === undefined) {
    throw new Error(`unknown army "${armyId}"`);
  }
  const field = getField(targetFieldId);
  const defenders = state.armies.filter(
    (candidate) => candidate.owner !== army.owner && candidate.fieldId === targetFieldId,
  );
  if (defenders.length === 0) {
    throw new Error(`field "${targetFieldId}" holds no enemy army — entering it is a move, not a battle`);
  }
  if (!attackFields(state, armyId).has(targetFieldId)) {
    throw new Error(`field "${targetFieldId}" is not an attack target for army "${armyId}"`);
  }

  const attack = attackerStrength(army, field);
  const defense = defenderStrength(defenders, field);

  // Three draws: attacker roll, defender roll, then the winner-loss draw.
  const rollA = rngStep(rngSeed);
  const rollB = rngStep(rollA.nextSeed);
  const rollL = rngStep(rollB.nextSeed);
  const attackTotal = attack.total * (1 - ROLL_SPREAD + rollA.value * 2 * ROLL_SPREAD);
  const defenseTotal = defense.total * (1 - ROLL_SPREAD + rollB.value * 2 * ROLL_SPREAD);
  const attackerWins = attackTotal > defenseTotal; // a tie holds for the defender

  const winnerStrength = attackerWins ? attack.total : defense.total;
  const loserStrength = attackerWins ? defense.total : attack.total;
  const winnerUnits = attackerWins
    ? army.units.length
    : defenders.reduce((sum, defender) => sum + defender.units.length, 0);
  const ratio = winnerStrength > 0 ? loserStrength / winnerStrength : 1;
  const cap = Math.min(Math.ceil(ratio * winnerUnits), winnerUnits - 1);
  const winnerLosses = Math.floor(rollL.value * (cap + 1));

  if (attackerWins) {
    // Defenders are destroyed; the attacker enters the field and stops (S-04
    // decision: an attack ends the army's movement). A captured city flips
    // owner and loses its queue (FR-009 + S-04 cancellation decision).
    const armies = state.armies
      .filter((candidate) => candidate.owner === army.owner || candidate.fieldId !== targetFieldId)
      .map((candidate) =>
        candidate.id === army.id
          ? {
              ...candidate,
              fieldId: targetFieldId,
              units: army.units.slice(0, army.units.length - winnerLosses), // losses off the end
              movementPoints: 0,
            }
          : candidate,
      );
    const fieldOwners = { ...state.fieldOwners, [targetFieldId]: army.owner };
    // A captured city's queue is cancelled (S-04 decision): rebuild the record
    // without the field's entry — empty queues drop out, as in production.ts.
    const productionQueues = Object.fromEntries(
      Object.entries(state.productionQueues).filter(([fieldId]) => fieldId !== targetFieldId),
    );
    const report: BattleReport = {
      attackerArmyId: army.id,
      defenderArmyIds: defenders.map((defender) => defender.id),
      fieldId: targetFieldId,
      attackerWins: true,
      attackerLosses: winnerLosses,
      defenderLosses: defenders.reduce((sum, defender) => sum + defender.units.length, 0),
      attackStrength: attack.total,
      defenseStrength: defense.total,
      attackModifiers: attack.modifiers,
      defenseModifiers: defense.modifiers,
    };
    return { state: { ...state, armies, fieldOwners, productionQueues }, report, nextSeed: rollL.nextSeed };
  }

  // The defender holds: the attacker is destroyed; losses come off the last
  // defending army in state order, clamped so that army keeps >= 1 unit (the
  // global cap already guarantees the defending side keeps >= 1 overall).
  const lastDefender = defenders[defenders.length - 1];
  const appliedLosses = Math.min(winnerLosses, lastDefender.units.length - 1);
  const armies = state.armies
    .filter((candidate) => candidate.id !== army.id)
    .map((candidate) =>
      candidate.id === lastDefender.id
        ? {
            ...candidate,
            units: candidate.units.slice(0, candidate.units.length - appliedLosses),
          }
        : candidate,
    );
  const report: BattleReport = {
    attackerArmyId: army.id,
    defenderArmyIds: defenders.map((defender) => defender.id),
    fieldId: targetFieldId,
    attackerWins: false,
    attackerLosses: army.units.length,
    defenderLosses: appliedLosses,
    attackStrength: attack.total,
    defenseStrength: defense.total,
    attackModifiers: attack.modifiers,
    defenseModifiers: defense.modifiers,
  };
  return { state: { ...state, armies }, report, nextSeed: rollL.nextSeed };
}
