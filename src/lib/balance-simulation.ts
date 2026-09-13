import { MAP_FIELDS } from "@/data/map";
import { gameReducer } from "@/lib/game-state";
import { drainAiTurn } from "@/lib/test-utils";
import type { CountryId, GameState } from "@/types";

/**
 * Balance simulation harness (change: testing-balance-simulation, test-plan
 * Phase 2, risk #1): drives full AI-vs-AI campaigns through the real reducer
 * with alternating role assignment, and collects the metrics a balance
 * baseline needs. Pure and seeded — the same input always yields the same
 * record, so measured distributions are exactly reproducible.
 *
 * One "turn" here is one endTurn cycle (one side's action phase); a full
 * round of both sides is 2 turns. The role swap happens between turns, after
 * the plan drains — never mid-plan (research audited every role read:
 * economy, victory anchoring, production and report slots are role-agnostic).
 */

/** A single campaign's inputs; `playerCountryId` is the side acting first. */
export interface CampaignInput {
  seed: number;
  playerCountryId: CountryId;
  /** Turn-cycle cap: the stalemate guard (no draw rule exists in the engine). */
  maxTurns: number;
}

/** A single campaign's measured outcome. */
export interface CampaignRecord {
  /** The side that acted first (the other role assignment is the mirror). */
  playerCountryId: CountryId;
  /** The campaign's winner, or null when the turn cap hit first. */
  winner: CountryId | null;
  /** Number of turn cycles executed (= length of each income array). */
  endTurn: number;
  /** Battles fought by either side across the whole campaign. */
  battles: number;
  /** Battles where the strictly weaker pre-roll side won (US-01 upsets). */
  upsets: number;
  /** Per-turn total city income (money+steel+recruits) per country, from live ownership. */
  incomeByTurn: Record<CountryId, number[]>;
}

/** Total per-turn city income of `country` under current ownership. */
function incomeAt(state: GameState, country: CountryId): number {
  let total = 0;
  for (const field of MAP_FIELDS) {
    if (field.city !== null && state.fieldOwners[field.id] === country) {
      total += field.city.income.money + field.city.income.steel + field.city.income.recruits;
    }
  }
  return total;
}

/** Counts the turn's battles and strength upsets from the drained AI turn log. */
function battlesInTurn(state: GameState): { battles: number; upsets: number } {
  let battles = 0;
  let upsets = 0;
  for (const entry of state.aiTurnLog) {
    if (entry.kind !== "battle") continue;
    battles += 1;
    const { attackStrength, defenseStrength, attackerWins } = entry.report;
    const weakerWon =
      (attackerWins && attackStrength < defenseStrength) || (!attackerWins && defenseStrength < attackStrength);
    if (weakerWon) upsets += 1;
  }
  return { battles, upsets };
}

/**
 * Runs one AI-vs-AI campaign: endTurn → drain → swap roles → repeat, until a
 * winner emerges or the turn cap is reached. Both sides play through the
 * identical AI code (`planAiTurn`/`aiStep`/`planAiProduction`); the idle
 * "player" role exists only to satisfy the reducer's turn structure.
 */
export function runCampaign(input: CampaignInput): CampaignRecord {
  const aiCountryId: CountryId = input.playerCountryId === "germany" ? "soviet" : "germany";
  let state = gameReducer(null, {
    type: "startGame",
    playerCountryId: input.playerCountryId,
    aiCountryId,
    seed: input.seed,
  });
  if (state === null) throw new Error("startGame returned null");

  let endTurn = 0;
  let battles = 0;
  let upsets = 0;
  const incomeByTurn: Record<CountryId, number[]> = { germany: [], soviet: [] };

  while (state.winner === null && endTurn < input.maxTurns) {
    // Income from live ownership, before this turn's captures move it.
    incomeByTurn.germany.push(incomeAt(state, "germany"));
    incomeByTurn.soviet.push(incomeAt(state, "soviet"));

    const planned = gameReducer(state, { type: "endTurn" });
    if (planned === null) throw new Error(`endTurn returned null on turn ${endTurn + 1}`);
    const drained = drainAiTurn(planned, `campaign seed ${input.seed}, turn ${endTurn + 1}`);

    const turnBattles = battlesInTurn(drained);
    battles += turnBattles.battles;
    upsets += turnBattles.upsets;
    endTurn += 1;

    if (drained.winner !== null) {
      state = drained; // mid-replay victory: frozen, no rollover — clean exit
      break;
    }

    // Role swap between turns: the other side becomes the AI for its phase.
    state = { ...drained, playerCountryId: drained.aiCountryId, aiCountryId: drained.playerCountryId };
  }

  return { playerCountryId: input.playerCountryId, winner: state.winner, endTurn, battles, upsets, incomeByTurn };
}
