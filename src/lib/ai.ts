/**
 * Rule-based AI opponent (change: ai-opponent, S-06, FR-012): plans the AI's
 * turn as a deterministic list of actions from the live game state — no
 * randomness, no memory between turns (NFR: predictable, explainable). The
 * ladder follows spec §26 strictly (execute the best action of the highest
 * priority that has one before descending), targets are scored by the §25
 * value mapping, and attacks are gated by an analytic win probability against
 * the §27 thresholds. Actions apply through the existing engine functions;
 * randomness stays only inside battles.
 */
import { MAP_FIELDS } from "@/data/map";
import { ROLL_SPREAD, attackerStrength, defenderStrength } from "@/lib/battle";
import { attackFields, movementCostOf, reachableFields } from "@/lib/movement";
import { freeProductionSlots, unitCostFor } from "@/lib/production";
import { isSupplied } from "@/lib/supply";
import type { AiAction, Army, CountryId, GameState, MapField, UnitTypeId } from "@/types";

/** The plan's exported shape (aliased for Phase 2's state fields). */
export type AiPlan = AiAction[];

// --- Draft balance constants (spec §25/§27/§29; tune after first campaigns) ---

/** §27 attack gates: below FREE_PROB never; below IMPORTANT_PROB only above-median-value targets. */
const ATTACK_PROB_FREE = 0.6;
const ATTACK_PROB_IMPORTANT = 0.4;
/** §25: flat bonus for the two capitals. */
const CAPITAL_BONUS = 10;
/** §25: flat bonus when capturing the target cuts at least one enemy army's supply. */
const SUPPLY_CUT_BONUS = 15;
/** §25: value lost per field of movement distance from the nearest AI army. */
const DISTANCE_WEIGHT = 2;
/** P1: a city counts as defended when its garrison's defense matches the biggest threat's attack. */
const GARRISON_RATIO = 1.0;
/** §29 production shares (infantry/tanks/artillery/anti-tank) and their adjustments. */
const PRODUCTION_SHARES: Record<UnitTypeId, number> = { infantry: 40, tank: 30, artillery: 20, antiTank: 10 };
const PRODUCTION_ADJUSTMENT = 20;

const FIELD_BY_ID: ReadonlyMap<string, MapField> = new Map(MAP_FIELDS.map((field) => [field.id, field]));
const CAPITALS = new Set(["berlin", "moscow"]);

function getField(fieldId: string): MapField {
  const field = FIELD_BY_ID.get(fieldId);
  if (field === undefined) {
    throw new Error(`unknown field "${fieldId}"`);
  }
  return field;
}

/**
 * The exact win probability of a battle between the given modified strengths:
 * P(A·ra > D·rd) where both rolls are uniform within ±ROLL_SPREAD of 1 (a tie
 * holds for the defender, matching `resolveBattle`). Closed form via exact
 * trapezoid integration — the integrand is piecewise linear in the defense
 * roll, so the breakpoint partition makes this exact, not approximate.
 */
export function aiWinProbability(attackStrength: number, defenseStrength: number): number {
  if (attackStrength <= 0) return 0; // 0 cannot beat anything, a tie holds for the defense
  if (defenseStrength <= 0) return 1;
  const min = 1 - ROLL_SPREAD;
  const max = 1 + ROLL_SPREAD;
  const k = defenseStrength / attackStrength;

  /** Length of the attack-roll interval that wins against the defense roll v. */
  const winningLength = (v: number): number => Math.min(Math.max(max - Math.max(min, k * v), 0), max - min);

  // Breakpoints where the piecewise-linear integrand changes slope, clamped
  // into the roll range; sorted and de-duplicated.
  const inner = [min / k, max / k]
    .map((point) => Math.min(Math.max(point, min), max))
    .filter((point) => point > min && point < max);
  const points = [min, ...inner, max];

  let area = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    area += ((winningLength(a) + winningLength(b)) / 2) * (b - a);
  }
  return area / (max - min) ** 2;
}

/**
 * Movement-cost distance between two fields, unbounded by any army's points
 * (unbounded Dijkstra) — the §25 distance term and one-step approach moves.
 */
function movementDistance(fromFieldId: string, toFieldId: string): number {
  const best = new Map<string, number>([[fromFieldId, 0]]);
  const queue: string[] = [fromFieldId];
  while (queue.length > 0) {
    queue.sort((a, b) => (best.get(a) ?? Infinity) - (best.get(b) ?? Infinity));
    const currentId = queue.shift();
    if (currentId === undefined) continue;
    const currentCost = best.get(currentId) ?? Infinity;
    if (currentId === toFieldId) return currentCost;
    for (const nextId of getField(currentId).connections) {
      const cost = currentCost + movementCostOf(getField(nextId));
      if (cost < (best.get(nextId) ?? Infinity)) {
        best.set(nextId, cost);
        queue.push(nextId);
      }
    }
  }
  throw new Error(`no movement path from "${fromFieldId}" to "${toFieldId}"`);
}

/** True iff flipping `fieldId` to `owner` cuts at least one enemy army's supply. */
function cutsEnemySupply(state: GameState, fieldId: string, owner: CountryId): boolean {
  const flipped: GameState = { ...state, fieldOwners: { ...state.fieldOwners, [fieldId]: owner } };
  for (const army of state.armies) {
    if (army.owner === owner || army.fieldId === fieldId) continue; // the captured garrison dies — not a "cut"
    if (isSupplied(state, army) && !isSupplied(flipped, army)) {
      return true;
    }
  }
  return false;
}

/**
 * The §25 target-value mapping on MVP data: Σ city income + capital bonus +
 * supply-cut bonus − distance-weighted movement distance − modified defender
 * strength. Draft constants above; every term is explainable from the map.
 */
export function cityTargetValue(state: GameState, aiCountry: CountryId, fieldId: string): number {
  const field = getField(fieldId);
  if (field.city === null) {
    throw new Error(`field "${fieldId}" is not a city`);
  }
  const income = field.city.income.money + field.city.income.steel + field.city.income.recruits;
  const capitalBonus = CAPITALS.has(fieldId) ? CAPITAL_BONUS : 0;
  const cutBonus = cutsEnemySupply(state, fieldId, aiCountry) ? SUPPLY_CUT_BONUS : 0;
  const aiArmies = state.armies.filter((army) => army.owner === aiCountry);
  const distance =
    aiArmies.length === 0 ? 0 : Math.min(...aiArmies.map((army) => movementDistance(army.fieldId, fieldId)));
  const defenders = state.armies.filter((candidate) => candidate.owner !== aiCountry && candidate.fieldId === fieldId);
  const unsuppliedDefenders = new Set(
    defenders.filter((defender) => !isSupplied(state, defender)).map((defender) => defender.id),
  );
  const defense = defenderStrength(defenders, field, unsuppliedDefenders).total;
  return income + capitalBonus + cutBonus - DISTANCE_WEIGHT * distance - defense;
}

/** The army's modified attack strength against `targetField`, supply included. */
function attackPower(state: GameState, army: Army, targetField: MapField): number {
  return attackerStrength(army, targetField, !isSupplied(state, army)).total;
}

/** The garrison's modified defense strength on its own field (city bonus included). */
function garrisonPower(state: GameState, aiCountry: CountryId, fieldId: string): number {
  const field = getField(fieldId);
  const garrison = state.armies.filter((candidate) => candidate.owner === aiCountry && candidate.fieldId === fieldId);
  return defenderStrength(garrison, field).total;
}

/**
 * Plans the AI's whole turn (spec §26 ladder, one action per army, armies in
 * state order, lexicographic ties). Production orders come last — they are
 * instant and don't interact with movement.
 */
export function planAiTurn(state: GameState): AiPlan {
  const ai = state.aiCountryId;
  const actions: AiAction[] = [];
  const acted = new Set<string>();
  const enemy = (owner: CountryId): boolean => owner !== ai;

  // --- P1: defend an own city an enemy army can reach this turn ---
  // Threat = an enemy army that can attack the city (defended) or walk onto
  // it (undefended — free capture); a defended city hides from reachableFields,
  // so both sets must be checked.
  const ownCities = MAP_FIELDS.filter((field) => field.city !== null && state.fieldOwners[field.id] === ai);
  for (const city of ownCities) {
    const threats = state.armies.filter(
      (army) =>
        enemy(army.owner) &&
        (attackFields(state, army.id).has(city.id) || reachableFields(state, army.id).has(city.id)),
    );
    if (threats.length === 0) continue;
    if (
      garrisonPower(state, ai, city.id) >=
      GARRISON_RATIO * Math.max(...threats.map((t) => attackPower(state, t, city)))
    ) {
      continue; // adequately defended
    }
    const defender = state.armies
      .filter((army) => army.owner === ai && !acted.has(army.id) && reachableFields(state, army.id).has(city.id))
      .sort((a, b) => b.units.length - a.units.length || a.id.localeCompare(b.id))[0];
    if (defender !== undefined) {
      actions.push({ kind: "move", armyId: defender.id, targetFieldId: city.id });
      acted.add(defender.id);
    }
  }

  // --- P2: step each unsupplied army toward its nearest own city ---
  for (const army of state.armies) {
    if (army.owner !== ai || acted.has(army.id) || isSupplied(state, army)) continue;
    const step = stepTowardOwnCity(state, army);
    if (step !== null) {
      actions.push({ kind: "move", armyId: army.id, targetFieldId: step });
      acted.add(army.id);
    }
  }

  // --- P3/P4: attacks on enemy cities, gated by the §27 thresholds ---
  const enemyCities = MAP_FIELDS.filter((field) => field.city !== null && enemy(state.fieldOwners[field.id]));
  const values = new Map(enemyCities.map((city) => [city.id, cityTargetValue(state, ai, city.id)]));
  const medianValue = median([...values.values()]);
  const candidates = attackCandidates(state, ai, acted);
  const bestAttack = (minProb: number, importantOnly: boolean): AttackCandidate | null =>
    candidates
      .filter((c) => c.probability >= minProb && (!importantOnly || (values.get(c.targetFieldId) ?? 0) > medianValue))
      .sort(
        (a, b) =>
          (values.get(b.targetFieldId) ?? 0) - (values.get(a.targetFieldId) ?? 0) ||
          a.targetFieldId.localeCompare(b.targetFieldId),
      )[0] ?? null;

  for (const [minProb, importantOnly] of [
    [ATTACK_PROB_FREE, false], // P3: weakly defended — best value at >= 60%
    [ATTACK_PROB_IMPORTANT, true], // P4: important target — above-median value at >= 40%
  ] as const) {
    const pick = bestAttack(minProb, importantOnly);
    if (pick !== null) {
      actions.push({ kind: pick.kind, armyId: pick.armyId, targetFieldId: pick.targetFieldId });
      acted.add(pick.armyId);
      candidates.splice(candidates.indexOf(pick), 1);
    }
  }

  // --- P5: cut the enemy's supply by taking a field the line runs through ---
  const cut = state.armies
    .filter((army) => army.owner === ai && !acted.has(army.id))
    .flatMap((army) =>
      [...reachableFields(state, army.id).keys()]
        .filter((fieldId) => enemy(state.fieldOwners[fieldId]) && cutsEnemySupply(state, fieldId, ai))
        .map((fieldId) => ({ armyId: army.id, targetFieldId: fieldId })),
    )
    .sort((a, b) => a.targetFieldId.localeCompare(b.targetFieldId) || a.armyId.localeCompare(b.armyId))[0];
  if (cut !== undefined) {
    actions.push({ kind: "move", armyId: cut.armyId, targetFieldId: cut.targetFieldId });
    acted.add(cut.armyId);
  }

  // --- P6: group — step remaining armies toward the best-value enemy city ---
  const objective = [...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (objective !== undefined) {
    for (const army of state.armies) {
      if (army.owner !== ai || acted.has(army.id)) continue;
      const step = stepToward(state, army, objective);
      if (step !== null) {
        actions.push({ kind: "move", armyId: army.id, targetFieldId: step });
        acted.add(army.id);
      }
    }
  }

  actions.push(...planAiProduction(state));
  return actions;
}

interface AttackCandidate {
  kind: "move" | "attack"; // move = undefended city: free capture, probability 1
  armyId: string;
  targetFieldId: string;
  probability: number;
}

/** Every enemy-city capture the AI can attempt this turn: defended attacks + undefended free captures. */
function attackCandidates(state: GameState, ai: CountryId, acted: ReadonlySet<string>): AttackCandidate[] {
  const candidates: AttackCandidate[] = [];
  for (const army of state.armies) {
    if (army.owner !== ai || acted.has(army.id)) continue;
    for (const targetFieldId of attackFields(state, army.id).keys()) {
      const field = getField(targetFieldId);
      if (field.city === null || state.fieldOwners[targetFieldId] === ai) continue;
      const defenders = state.armies.filter(
        (candidate) => candidate.owner !== ai && candidate.fieldId === targetFieldId,
      );
      const unsuppliedDefenders = new Set(
        defenders.filter((defender) => !isSupplied(state, defender)).map((defender) => defender.id),
      );
      const defense = defenderStrength(defenders, field, unsuppliedDefenders).total;
      candidates.push({
        kind: "attack",
        armyId: army.id,
        targetFieldId,
        probability: aiWinProbability(attackPower(state, army, field), defense),
      });
    }
    for (const targetFieldId of reachableFields(state, army.id).keys()) {
      const field = getField(targetFieldId);
      if (field.city === null || state.fieldOwners[targetFieldId] === ai) continue;
      const defended = state.armies.some((candidate) => candidate.owner !== ai && candidate.fieldId === targetFieldId);
      if (!defended) {
        candidates.push({ kind: "move", armyId: army.id, targetFieldId, probability: 1 });
      }
    }
  }
  return candidates;
}

/** One step (within movement points) that shortens the unbounded distance to the nearest own city. */
function stepTowardOwnCity(state: GameState, army: Army): string | null {
  const ownCities = MAP_FIELDS.filter((field) => field.city !== null && state.fieldOwners[field.id] === army.owner);
  const target = ownCities
    .map((city) => ({ id: city.id, distance: movementDistance(army.fieldId, city.id) }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
  if (target === undefined) return null;
  return stepToward(state, army, target.id);
}

/** The reachable field closest to `targetFieldId`, if it improves on staying put. */
function stepToward(state: GameState, army: Army, targetFieldId: string): string | null {
  const current = movementDistance(army.fieldId, targetFieldId);
  const options = [...reachableFields(state, army.id).keys()]
    .map((fieldId) => ({ fieldId, distance: movementDistance(fieldId, targetFieldId) }))
    .filter((option) => option.distance < current)
    .sort((a, b) => a.distance - b.distance || a.fieldId.localeCompare(b.fieldId));
  return options[0]?.fieldId ?? null;
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Production plan (spec §29): the 40/30/20/10 shares become a deterministic
 * 10-slot rotation (cumulative bands); +20pp shift toward infantry when the AI
 * has lost cities since game start, +20pp toward tanks on a resource
 * advantage. One order per free slot, affordability-filtered.
 */
export function planAiProduction(state: GameState): Extract<AiAction, { kind: "order" }>[] {
  const ai = state.aiCountryId;
  const shares: Record<UnitTypeId, number> = { ...PRODUCTION_SHARES };

  const initialCities = MAP_FIELDS.filter((field) => field.city !== null && field.initialOwner === ai).length;
  const currentCities = MAP_FIELDS.filter((field) => field.city !== null && state.fieldOwners[field.id] === ai).length;
  const income = MAP_FIELDS.filter((field) => field.city !== null && state.fieldOwners[field.id] === ai).reduce(
    (sum, field) => sum + field.city.income.money + field.city.income.steel + field.city.income.recruits,
    0,
  );
  const treasury = state.resources[ai];
  const treasuryTotal = treasury.money + treasury.steel + treasury.recruits;
  if (currentCities < initialCities) {
    shares.infantry += PRODUCTION_ADJUSTMENT;
    shares.tank -= PRODUCTION_ADJUSTMENT / 2;
    shares.artillery -= PRODUCTION_ADJUSTMENT / 2;
  } else if (treasuryTotal > 2 * income) {
    shares.tank += PRODUCTION_ADJUSTMENT;
    shares.infantry -= PRODUCTION_ADJUSTMENT;
  }

  // Cumulative bands over a 10-slot rotation: slot n picks the type whose band covers n·10.
  const rotation: UnitTypeId[] = [];
  const order: UnitTypeId[] = ["infantry", "tank", "artillery", "antiTank"];
  let cumulative = 0;
  const bands = order.map((typeId) => {
    const start = cumulative;
    cumulative += shares[typeId];
    return { typeId, start, end: cumulative };
  });
  for (let slot = 0; slot < 10; slot += 1) {
    const position = slot * 10;
    const band = bands.find((candidate) => position >= candidate.start && position < candidate.end);
    rotation.push(band?.typeId ?? "infantry"); // rounding fallback
  }

  const orders: Extract<AiAction, { kind: "order" }>[] = [];
  let slotIndex = Object.values(state.productionQueues).flat().length; // deterministic phase
  for (const city of MAP_FIELDS.filter((field) => field.city !== null && state.fieldOwners[field.id] === ai).sort(
    (a, b) => a.id.localeCompare(b.id),
  )) {
    for (let slot = 0; slot < freeProductionSlots(state, city.id); slot += 1) {
      const typeId = rotation[(slotIndex + slot) % rotation.length];
      const cost = unitCostFor(ai, typeId);
      const treasuryNow = state.resources[ai];
      if (treasuryNow.money < cost.money || treasuryNow.steel < cost.steel || treasuryNow.recruits < cost.recruits) {
        continue; // unaffordable this turn — skip the slot
      }
      orders.push({ kind: "order", fieldId: city.id, unitTypeId: typeId });
      state = {
        ...state,
        resources: {
          ...state.resources,
          [ai]: {
            money: treasuryNow.money - cost.money,
            steel: treasuryNow.steel - cost.steel,
            recruits: treasuryNow.recruits - cost.recruits,
          },
        },
      };
    }
    slotIndex += freeProductionSlots(state, city.id);
  }
  return orders;
}
