import { MAP_FIELDS } from "@/data/map";
import { UNIT_TYPES } from "@/data/units";
import type { Army, CountryId, GameState, UnitInstance, UnitTypeId } from "@/types";

/**
 * Draft starting armies (S-01 placeholders, re-tunable in S-02/S-03):
 * each side gets one army in its capital and one near the front line,
 * satisfying US-01's Given (>= 1 city and >= 1 army per side).
 */
interface ArmyDraft {
  armyId: string;
  fieldId: string;
  owner: CountryId;
  units: readonly UnitTypeId[];
}

const INITIAL_ARMIES: readonly ArmyDraft[] = [
  {
    armyId: "G1",
    fieldId: "berlin",
    owner: "germany",
    units: ["infantry", "infantry", "tank", "artillery"],
  },
  {
    armyId: "G2",
    fieldId: "warsaw",
    owner: "germany",
    units: ["infantry", "infantry", "infantry", "antiTank"],
  },
  {
    armyId: "R1",
    fieldId: "moscow",
    owner: "soviet",
    units: ["infantry", "infantry", "tank", "artillery"],
  },
  {
    armyId: "R2",
    fieldId: "minsk",
    owner: "soviet",
    units: ["infantry", "infantry", "infantry", "antiTank"],
  },
];

/** Builds a fresh campaign: owners from the dataset, turn 1, draft armies. */
export function createInitialGameState(playerCountryId: CountryId, aiCountryId: CountryId): GameState {
  if (playerCountryId === aiCountryId) {
    throw new Error(`player and AI country must differ, got "${playerCountryId}" for both`);
  }

  const fieldOwners: Record<string, CountryId> = {};
  for (const field of MAP_FIELDS) {
    fieldOwners[field.id] = field.initialOwner;
  }

  const armies: Army[] = INITIAL_ARMIES.map((draft) => {
    const units: UnitInstance[] = draft.units.map((typeId, index) => ({
      id: `${draft.armyId}-u${index + 1}`,
      typeId,
    }));
    return { id: draft.armyId, owner: draft.owner, fieldId: draft.fieldId, units };
  });

  return { turn: 1, playerCountryId, aiCountryId, fieldOwners, armies };
}

/** The army's most common unit type; ties resolved by UNIT_TYPES order. */
export function dominantUnitType(army: Army): UnitTypeId {
  const counts = new Map<UnitTypeId, number>();
  for (const unit of army.units) {
    counts.set(unit.typeId, (counts.get(unit.typeId) ?? 0) + 1);
  }

  let best: UnitTypeId | null = null;
  let bestCount = 0;
  for (const unitType of UNIT_TYPES) {
    const count = counts.get(unitType.id) ?? 0;
    if (count > bestCount) {
      best = unitType.id;
      bestCount = count;
    }
  }
  if (best === null) {
    throw new Error(`army "${army.id}" has no units`);
  }
  return best;
}

export interface GameAction {
  type: "startGame";
  playerCountryId: CountryId;
  aiCountryId: CountryId;
}

/** Reducer for the GameScreen island; `null` state = setup screen. */
export function gameReducer(state: GameState | null, action: GameAction): GameState | null {
  // Single-action union until S-02 adds interaction actions; the discriminant
  // check stops being "unnecessary" for the linter once a second variant lands.
  switch (action.type) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case "startGame":
      return createInitialGameState(action.playerCountryId, action.aiCountryId);
  }
  return state;
}
