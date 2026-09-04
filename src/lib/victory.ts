/**
 * Victory conditions (change: victory-conditions, S-07): the campaign ends
 * the moment one side controls every city that initially belonged to the
 * other (FR-013). Pure function following the supply.ts pattern — the
 * winner is always derived from live field ownership plus the map dataset's
 * `initialOwner`, never stored here; the reducer snapshots the result into
 * `GameState.winner` after each ownership change and freezes the game.
 */
import { MAP_FIELDS } from "@/data/map";
import type { CountryId, GameState } from "@/types";

/** Evaluation order (dataset order) — a synthetic double-satisfaction yields one deterministic winner. */
const COUNTRY_ORDER: readonly CountryId[] = ["germany", "soviet"];

/**
 * The campaign's winner, or null while it runs (FR-013): country C wins iff
 * it controls every city whose `initialOwner` is the other country — "enemy
 * cities" anchored to the dataset, so any sequence of captures and
 * recaptures still resolves against the original sides. Unreachable in play
 * (the reducer freezes on the first completion), but if both sides' conditions
 * were somehow met at once, the first country in dataset order wins.
 */
export function winnerOf(state: GameState): CountryId | null {
  for (const country of COUNTRY_ORDER) {
    const tookAllEnemyCities = MAP_FIELDS.every(
      (field) => field.city === null || field.initialOwner === country || state.fieldOwners[field.id] === country,
    );
    if (tookAllEnemyCities) {
      return country;
    }
  }
  return null;
}
