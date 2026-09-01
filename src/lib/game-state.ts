import { MAP_FIELDS } from "@/data/map";
import { UNIT_TYPES } from "@/data/units";
import { applyMove, armySpeed } from "@/lib/movement";
import type { Army, CountryId, GameState, ResourceBag, UnitInstance, UnitTypeId } from "@/types";

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

const ZERO_RESOURCES: ResourceBag = { money: 0, steel: 0, recruits: 0 };

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
    const army: Army = { id: draft.armyId, owner: draft.owner, fieldId: draft.fieldId, units };
    return { ...army, movementPoints: armySpeed(army) };
  });

  // Empty treasuries for now — Phase 2 (S-03) seeds turn-1 income here.
  const resources: Record<CountryId, ResourceBag> = {
    germany: { ...ZERO_RESOURCES },
    soviet: { ...ZERO_RESOURCES },
  };

  return {
    turn: 1,
    playerCountryId,
    aiCountryId,
    fieldOwners,
    armies,
    resources,
    productionQueues: {},
  };
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

export type GameAction =
  | { type: "startGame"; playerCountryId: CountryId; aiCountryId: CountryId }
  | { type: "moveArmy"; armyId: string; targetFieldId: string }
  | { type: "endTurn" };

/** Reducer for the GameScreen island; `null` state = setup screen. */
export function gameReducer(state: GameState | null, action: GameAction): GameState | null {
  switch (action.type) {
    case "startGame":
      return createInitialGameState(action.playerCountryId, action.aiCountryId);
    case "moveArmy": {
      if (state === null) return state;
      try {
        return applyMove(state, action.armyId, action.targetFieldId);
      } catch {
        // Illegal move (unreachable target, over-cap merge): leave the state
        // untouched — the UI only offers reachable targets, this is a backstop.
        return state;
      }
    }
    case "endTurn":
      return state === null
        ? state
        : {
            ...state,
            turn: state.turn + 1,
            armies: state.armies.map((army) => ({ ...army, movementPoints: armySpeed(army) })),
          };
  }
}
