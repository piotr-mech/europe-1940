import { MAP_FIELDS } from "@/data/map";
import { UNIT_TYPES } from "@/data/units";
import { planAiTurn } from "@/lib/ai";
import { resolveBattle } from "@/lib/battle";
import { applyMove, armySpeed } from "@/lib/movement";
import { advanceProduction, applyProductionOrder, collectIncome } from "@/lib/production";
import { movementAllowance } from "@/lib/supply";
import type {
  AiAction,
  AiTurnLogEntry,
  Army,
  CountryId,
  GameState,
  ResourceBag,
  UnitInstance,
  UnitTypeId,
} from "@/types";

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

/**
 * Builds a fresh campaign: owners from the dataset, turn 1, draft armies.
 * `rngSeed` seeds the battle PRNG (S-04); the default 1 keeps direct test
 * calls deterministic — the reducer always passes the UI-supplied seed.
 */
export function createInitialGameState(playerCountryId: CountryId, aiCountryId: CountryId, rngSeed = 1): GameState {
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

  // "Zero + income at start of turn": a fresh game seeds each treasury with
  // its turn-1 city income via the same collectIncome path endTurn uses, so
  // the player can order on turn 1 — no hardcoded numbers.
  const fresh: GameState = {
    turn: 1,
    playerCountryId,
    aiCountryId,
    fieldOwners,
    armies,
    resources: {
      germany: { ...ZERO_RESOURCES },
      soviet: { ...ZERO_RESOURCES },
    },
    productionQueues: {},
    rngSeed,
    lastBattleReportByCountry: { germany: null, soviet: null },
    aiPlan: [],
    aiTurnLog: [],
  };
  return collectIncome(fresh);
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
  | { type: "startGame"; playerCountryId: CountryId; aiCountryId: CountryId; seed: number }
  | { type: "moveArmy"; armyId: string; targetFieldId: string }
  | { type: "attackArmy"; armyId: string; targetFieldId: string }
  | { type: "orderUnit"; fieldId: string; unitTypeId: UnitTypeId }
  | { type: "endTurn" }
  | { type: "aiStep" };

/**
 * Rethrows developer errors (mistyped import, undefined access) — backstops
 * must mask only domain-rule throws (lesson: bare catch masks dev errors).
 * Shared by the reducer cases and the UI derivations wrapping domain modules.
 */
export function isDomainError(error: unknown): boolean {
  return !(error instanceof ReferenceError || error instanceof TypeError || error instanceof SyntaxError);
}

/** Reducer for the GameScreen island; `null` state = setup screen. */
export function gameReducer(state: GameState | null, action: GameAction): GameState | null {
  switch (action.type) {
    case "startGame":
      return createInitialGameState(action.playerCountryId, action.aiCountryId, action.seed);
    case "moveArmy": {
      if (state === null) return state;
      try {
        return applyMove(state, action.armyId, action.targetFieldId);
      } catch (error) {
        // Illegal move (unreachable target, over-cap merge): leave the state
        // untouched — the UI only offers reachable targets, this is a backstop.
        // Developer errors still propagate (lesson: bare-catch masks them).
        if (isDomainError(error)) return state;
        throw error;
      }
    }
    case "attackArmy": {
      if (state === null) return state;
      try {
        // The battle consumes the stored PRNG seed and writes back the advanced
        // one plus the report into the attacking side's slot (S-06: per-side
        // reports — the player's recap is never clobbered by an AI battle).
        const {
          state: afterBattle,
          report,
          nextSeed,
        } = resolveBattle(state, action.armyId, action.targetFieldId, state.rngSeed);
        return {
          ...afterBattle,
          rngSeed: nextSeed,
          lastBattleReportByCountry: { ...state.lastBattleReportByCountry, [report.attackerOwner]: report },
        };
      } catch (error) {
        // Illegal attack (no enemy army on the field, out of reach): leave the
        // state untouched — the UI only offers attack targets, this is a
        // backstop. Developer errors still propagate (lesson: bare-catch masks them).
        if (isDomainError(error)) return state;
        throw error;
      }
    }
    case "orderUnit": {
      if (state === null) return state;
      try {
        return applyProductionOrder(state, state.playerCountryId, action.fieldId, action.unitTypeId);
      } catch (error) {
        // Illegal order (not the player's city, no slot, cannot afford):
        // leave the state untouched — the UI only offers legal options
        // (disabled buttons), this is a backstop. Developer errors propagate.
        if (isDomainError(error)) return state;
        throw error;
      }
    }
    case "endTurn": {
      if (state === null || state.aiPlan.length > 0) return state; // no restarting mid-AI-turn
      // Spec §20 ordering: Faza 1 zasoby → Faza 2 produkcja → the AI acts.
      // Economy runs on the current turn so new-army ids stay deterministic.
      // The AI turn is STAGED (S-06): endTurn plans it into `aiPlan`; each
      // `aiStep` applies one action; the turn rolls over and movement resets
      // only when the queue drains — the player's next turn starts after the
      // AI visibly finishes.
      const withIncome = collectIncome(state);
      const withProduction = advanceProduction(withIncome);
      const aiPlan = planAiTurn(withProduction);
      if (aiPlan.length === 0) {
        // Nothing for the AI to do (no armies, nothing affordable — reachable
        // in play before S-07's victory check): roll the turn over now
        // instead of freezing on an empty queue (review F1).
        return {
          ...withProduction,
          aiPlan: [],
          aiTurnLog: [],
          turn: withProduction.turn + 1,
          armies: withProduction.armies.map((army) => ({
            ...army,
            movementPoints: movementAllowance(withProduction, army),
          })),
        };
      }
      return {
        ...withProduction,
        aiPlan,
        aiTurnLog: [],
      };
    }
    case "aiStep": {
      if (state === null || state.aiPlan.length === 0) return state;
      const [action, ...rest] = state.aiPlan;
      let next = state;
      try {
        switch (action.kind) {
          case "move":
            next = applyMove(state, action.armyId, action.targetFieldId);
            break;
          case "attack": {
            const {
              state: afterBattle,
              report,
              nextSeed,
            } = resolveBattle(state, action.armyId, action.targetFieldId, state.rngSeed);
            next = {
              ...afterBattle,
              rngSeed: nextSeed,
              lastBattleReportByCountry: { ...state.lastBattleReportByCountry, [report.attackerOwner]: report },
            };
            break;
          }
          case "order":
            next = applyProductionOrder(state, state.aiCountryId, action.fieldId, action.unitTypeId);
            break;
        }
      } catch (error) {
        // An illegal planned action (the world changed under the plan): drop
        // it and move on — the AI is not fatal. Developer errors propagate.
        if (isDomainError(error)) return { ...state, aiPlan: rest };
        throw error;
      }
      const aiTurnLog = [...state.aiTurnLog, aiLogEntry(state, action, next)];
      if (rest.length === 0) {
        // The AI turn ends: reset movement (the FR-011 cap applies — S-05)
        // and roll over to the player's turn.
        return {
          ...next,
          aiPlan: [],
          aiTurnLog,
          turn: next.turn + 1,
          armies: next.armies.map((army) => ({ ...army, movementPoints: movementAllowance(next, army) })),
        };
      }
      return { ...next, aiPlan: rest, aiTurnLog };
    }
  }
}

/** The observable outcome of one executed AI action, for the turn summary. */
function aiLogEntry(before: GameState, action: AiAction, after: GameState): AiTurnLogEntry {
  switch (action.kind) {
    case "move": {
      const fromFieldId = before.armies.find((army) => army.id === action.armyId)?.fieldId ?? action.targetFieldId;
      const capturedCity =
        after.fieldOwners[action.targetFieldId] === after.aiCountryId &&
        before.fieldOwners[action.targetFieldId] !== before.aiCountryId;
      return { kind: "move", armyId: action.armyId, fromFieldId, toFieldId: action.targetFieldId, capturedCity };
    }
    case "attack": {
      // A fresh report object in the AI's slot means the battle happened; a
      // backstop-swallowed attack leaves the previous report in place.
      const beforeReport = before.lastBattleReportByCountry[after.aiCountryId];
      const report = after.lastBattleReportByCountry[after.aiCountryId];
      if (report !== null && report !== beforeReport && report.attackerArmyId === action.armyId) {
        return { kind: "battle", report };
      }
      const fromFieldId = before.armies.find((army) => army.id === action.armyId)?.fieldId ?? action.targetFieldId;
      return {
        kind: "move",
        armyId: action.armyId,
        fromFieldId,
        toFieldId: action.targetFieldId,
        capturedCity: false,
      };
    }
    case "order":
      return { kind: "order", fieldId: action.fieldId, unitTypeId: action.unitTypeId };
  }
}
