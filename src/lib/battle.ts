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
import { isSupplied } from "@/lib/supply";
import type {
  Army,
  BattleDeath,
  BattleModifier,
  BattleReport,
  GameState,
  MapField,
  UnitInstance,
  UnitType,
  UnitTypeId,
} from "@/types";

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
 * field − the integer −25% supply penalty for an unsupplied attacker (FR-011,
 * S-05). Clamped at 0 (a penalty can never make strength negative).
 */
export function attackerStrength(
  army: Army,
  targetField: MapField,
  unsupplied = false,
): { total: number; modifiers: BattleModifier[] } {
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
  if (unsupplied) {
    // FR-011: integer −25% for an unsupplied attacker; the modifier line
    // keeps the report's arithmetic explainable (S-05).
    const penalty = supplyPenaltyOf(total);
    if (penalty > 0) {
      total -= penalty;
      modifiers.push({ label: "Brak zaopatrzenia", amount: -penalty });
    }
  }
  if (total < 0) {
    // Strength never drops below 0; surface the absorbed over-penalty so the
    // report's modifier arithmetic still adds up (review F4).
    modifiers.push({ label: "Siła nie spada poniżej 0", amount: -total });
    total = 0;
  }
  return { total, modifiers };
}

/** The integer −25% supply penalty for a side's strength (FR-011, S-05). */
function supplyPenaltyOf(strength: number): number {
  return Math.round(strength * 0.25);
}

/**
 * The defending side's strength: Σ unit defense over every enemy army on the
 * field (they defend together), each army minus its own integer −25% supply
 * penalty when cut off (FR-011, S-05 — `unsuppliedIds` carries army ids), +
 * the terrain or city defense bonus (FR-007).
 */
export function defenderStrength(
  defenders: Army[],
  field: MapField,
  unsuppliedIds: ReadonlySet<string> = new Set(),
): { total: number; modifiers: BattleModifier[] } {
  const modifiers: BattleModifier[] = [];
  let total = 0;
  let supplyPenalty = 0;
  for (const army of defenders) {
    let armyTotal = 0;
    for (const unit of army.units) {
      armyTotal += getUnitType(unit.typeId).defense;
    }
    if (unsuppliedIds.has(army.id)) {
      const penalty = supplyPenaltyOf(armyTotal);
      armyTotal -= penalty;
      supplyPenalty += penalty;
    }
    total += armyTotal;
  }
  if (supplyPenalty > 0) {
    modifiers.push({ label: "Brak zaopatrzenia", amount: -supplyPenalty });
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
  if (total < 0) {
    // Mirror of the attacker-side balancing entry (review S-04 F4, added
    // here for symmetry in review S-05 F4): unreachable with current data.
    modifiers.push({ label: "Siła nie spada poniżej 0", amount: -total });
    total = 0;
  }
  return { total, modifiers };
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
  const attackPlan = attackFields(state, armyId).get(targetFieldId);
  if (attackPlan === undefined) {
    throw new Error(`field "${targetFieldId}" is not an attack target for army "${armyId}"`);
  }

  // Supply penalties (FR-011, S-05): evaluated per army — the attacker and
  // each defender can be cut off independently.
  const attack = attackerStrength(army, field, !isSupplied(state, army));
  const unsuppliedDefenderIds = new Set(
    defenders.filter((defender) => !isSupplied(state, defender)).map((defender) => defender.id),
  );
  const defense = defenderStrength(defenders, field, unsuppliedDefenderIds);

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
  const defenderUnits = defenders.flatMap((defender) => defender.units);

  if (attackerWins) {
    // Defenders are destroyed; the attacker enters the field and stops (S-04
    // decision: an attack ends the army's movement). One ownership rule for
    // moves and attacks (review F1): the marched path flips exactly as
    // `applyMove` would — non-city fields always, undefended enemy cities as
    // free captures with their queues cancelled — and the fought-over target
    // always flips (city = capture, queue cancelled, FR-009).
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
    const fieldOwners = { ...state.fieldOwners };
    const capturedCities: string[] = [];
    for (const fieldId of attackPlan.path.slice(1, -1)) {
      const intermediate = getField(fieldId);
      if (intermediate.type === "city" && fieldOwners[fieldId] === army.owner) continue;
      fieldOwners[fieldId] = army.owner;
      if (intermediate.type === "city") capturedCities.push(fieldId);
    }
    fieldOwners[targetFieldId] = army.owner;
    if (field.type === "city") capturedCities.push(targetFieldId);
    const productionQueues = Object.fromEntries(
      Object.entries(state.productionQueues).filter(([fieldId]) => !capturedCities.includes(fieldId)),
    );
    const defenderLosses = defenders.reduce((sum, defender) => sum + defender.units.length, 0);
    const report: BattleReport = {
      attackerArmyId: army.id,
      attackerOwner: army.owner,
      defenderArmyIds: defenders.map((defender) => defender.id),
      fieldId: targetFieldId,
      attackerWins: true,
      attackerLosses: winnerLosses,
      defenderLosses,
      attackStrength: attack.total,
      defenseStrength: defense.total,
      attackModifiers: attack.modifiers,
      defenseModifiers: defense.modifiers,
      attackerComposition: army.units.map((unit) => unit.typeId),
      defenderComposition: defenders.flatMap((defender) => defender.units.map((unit) => unit.typeId)),
      deathLog: buildDeathLog(army.units, defenderUnits, winnerLosses, defenderLosses),
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
    attackerOwner: army.owner,
    defenderArmyIds: defenders.map((defender) => defender.id),
    fieldId: targetFieldId,
    attackerWins: false,
    attackerLosses: army.units.length,
    defenderLosses: appliedLosses,
    attackStrength: attack.total,
    defenseStrength: defense.total,
    attackModifiers: attack.modifiers,
    defenseModifiers: defense.modifiers,
    attackerComposition: army.units.map((unit) => unit.typeId),
    defenderComposition: defenders.flatMap((defender) => defender.units.map((unit) => unit.typeId)),
    deathLog: buildDeathLog(army.units, defenderUnits, army.units.length, appliedLosses),
  };
  return { state: { ...state, armies }, report, nextSeed: rollL.nextSeed };
}

/**
 * Ordered deaths for the popup's staged reveal (S-04): sides alternate —
 * starting with the heavier-losing side, skipping exhausted sides — and
 * within a side units die in engine removal order (end of the array first).
 */
function buildDeathLog(
  attackerUnits: UnitInstance[],
  defenderUnits: UnitInstance[],
  attackerLosses: number,
  defenderLosses: number,
): BattleDeath[] {
  const attackerDeaths = attackerUnits
    .slice(attackerUnits.length - attackerLosses)
    .reverse()
    .map((unit) => ({ side: "attacker" as const, unitTypeId: unit.typeId }));
  const defenderDeaths = defenderUnits
    .slice(defenderUnits.length - defenderLosses)
    .reverse()
    .map((unit) => ({ side: "defender" as const, unitTypeId: unit.typeId }));

  const log: BattleDeath[] = [];
  let attackerIndex = 0;
  let defenderIndex = 0;
  let attackerTurn = attackerDeaths.length >= defenderDeaths.length;
  while (attackerIndex < attackerDeaths.length || defenderIndex < defenderDeaths.length) {
    if (attackerTurn && attackerIndex < attackerDeaths.length) {
      log.push(attackerDeaths[attackerIndex]);
      attackerIndex += 1;
    } else if (!attackerTurn && defenderIndex < defenderDeaths.length) {
      log.push(defenderDeaths[defenderIndex]);
      defenderIndex += 1;
    } else if (attackerIndex < attackerDeaths.length) {
      log.push(attackerDeaths[attackerIndex]);
      attackerIndex += 1;
    } else {
      log.push(defenderDeaths[defenderIndex]);
      defenderIndex += 1;
    }
    attackerTurn = !attackerTurn;
  }
  return log;
}
