import { MAP_FIELDS } from "@/data/map";
import { getGameData } from "@/lib/game-data";
import type { CountryId, GameState } from "@/types";

interface VictoryOverlayProps {
  state: GameState;
  /** "Zobacz mapę": dismiss the overlay, leave the read-only final map. */
  onDismiss: () => void;
  /** "Nowa gra": back to the setup screen. */
  onNewGame: () => void;
}

/** Cities per country on the final map (the tally line under the title). */
function cityTally(state: GameState, countryId: CountryId): number {
  return MAP_FIELDS.filter((field) => field.city !== null && state.fieldOwners[field.id] === countryId).length;
}

/**
 * The campaign's end (S-07, FR-013): a modal announcing who took all the
 * enemy's cities, in BattlePopup's visual language (hand-rolled, no shadcn
 * Dialog). Shown only after any deciding battle popup has played out; the
 * dismissed state leaves the final map browsable — the header's "Nowa gra"
 * is the way back to setup.
 */
export function VictoryOverlay({ state, onDismiss, onNewGame }: VictoryOverlayProps) {
  const data = getGameData();
  const playerWon = state.winner === state.playerCountryId;
  const playerCountry = data.countries.find((country) => country.id === state.playerCountryId) ?? data.countries[0];
  const aiCountry = data.countries.find((country) => country.id === state.aiCountryId) ?? data.countries[1];
  const totalCities = MAP_FIELDS.filter((field) => field.city !== null).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-label="Koniec gry"
    >
      <div className="grid w-full max-w-md gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <header>
          <h2 className={`text-center text-2xl font-bold ${playerWon ? "text-emerald-700" : "text-red-700"}`}>
            {playerWon ? "Zwycięstwo!" : "Porażka"}
          </h2>
          <p className="mt-1 text-center text-sm text-slate-600">
            Kampania zakończona w turze {state.turn} · {playerCountry.name} {cityTally(state, playerCountry.id)}/
            {totalCities} — {aiCountry.name} {cityTally(state, aiCountry.id)}/{totalCities} miast
          </p>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border-2 border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-500"
          >
            Zobacz mapę
          </button>
          <button
            type="button"
            onClick={onNewGame}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Nowa gra
          </button>
        </div>
      </div>
    </div>
  );
}
