import { useCallback, useEffect, useReducer, useState } from "react";

import { BattlePopup, type BattleReportLike } from "@/components/game/BattlePopup";
import { BoardMap } from "@/components/game/BoardMap";
import { DetailPanel, RESOURCE_LABELS, type SelectedSubject } from "@/components/game/DetailPanel";
import { VictoryOverlay } from "@/components/game/VictoryOverlay";
import { getGameData } from "@/lib/game-data";
import { gameReducer, inputBlocked, isDomainError } from "@/lib/game-state";
import { attackFields, reachableFields } from "@/lib/movement";
import { clearGame, loadGame, persistDecision, saveGame } from "@/lib/persistence";
import { cn } from "@/lib/utils";
import type { Country, CountryId, GameState, ResourceId } from "@/types";

/** One AI action per tick (S-06): the deliberate presentation pause (NFR: no long waits). */
const AI_STEP_INTERVAL_MS = 500;

interface CountryOptionProps {
  country: Country;
  selected: boolean;
  onSelect: (id: CountryId) => void;
}

function CountryOption({ country, selected, onSelect }: CountryOptionProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(country.id);
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors",
        selected ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:border-slate-400",
      )}
    >
      <span
        className="h-5 w-5 shrink-0 rounded-sm border border-slate-300"
        style={{ backgroundColor: country.color }}
      />
      <span>
        <span className="block font-semibold">{country.name}</span>
        <span className="block text-xs text-slate-500">
          {country.nationalBonus.name}: {country.nationalBonus.description}
        </span>
      </span>
    </button>
  );
}

/**
 * The /game island (FR-001): setup screen (player's and AI's country — always
 * different) transitioning to the board view. A saved campaign auto-resumes
 * on mount (S-08): the lazy initializer reads localStorage once at boot.
 */
export function GameScreen() {
  const data = getGameData();
  const [state, dispatch] = useReducer(gameReducer, null, loadGame);
  const [playerCountryId, setPlayerCountryId] = useState<CountryId>("germany");
  const [aiCountryId, setAiCountryId] = useState<CountryId>("soviet");
  const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SelectedSubject | null>(null);
  // The battle popup (S-04): derived, not stored — the newest report shows
  // until its staged reveal is dismissed (a new battle = a new reference).
  const [dismissedReport, setDismissedReport] = useState<BattleReportLike | null>(null);
  const closeBattlePopup = useCallback((report: BattleReportLike) => {
    setDismissedReport(report);
  }, []);
  // The AI's battle popup (S-06), dismissed separately from the player's.
  const [dismissedAiReport, setDismissedAiReport] = useState<BattleReportLike | null>(null);
  const closeAiBattlePopup = useCallback((report: BattleReportLike) => {
    setDismissedAiReport(report);
  }, []);
  // The victory overlay (S-07) is derived like the popups; dismissal ("Zobacz
  // mapę") leaves the read-only final map until a new game starts.
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  // A failed autosave is surfaced, never swallowed (FR-014): the banner clears
  // itself once a save succeeds again, and returns on the next failure after
  // being dismissed.
  const [autosaveFailed, setAutosaveFailed] = useState(false);

  // Derived before the setup-screen split so the replay driver hook sits at
  // the top level (hooks cannot follow a conditional return).
  const playerReport = state === null ? null : state.lastBattleReportByCountry[state.playerCountryId];
  const aiReport = state === null ? null : state.lastBattleReportByCountry[state.aiCountryId];
  const battlePopup = playerReport !== null && playerReport !== dismissedReport ? playerReport : null;
  const aiBattlePopup = aiReport !== null && aiReport !== dismissedAiReport ? aiReport : null;
  const aiTurnActive = state !== null && state.aiPlan.length > 0;
  // The campaign's end (S-07): the overlay waits for any deciding battle
  // popup to play out first (popup-before-overlay ordering).
  const gameOver = state !== null && state.winner !== null;
  const showVictory = gameOver && !victoryDismissed && battlePopup === null && aiBattlePopup === null;

  // The replay driver (S-06): one staged AI action per interval while the
  // queue is non-empty; pauses while either battle popup is open.
  useEffect(() => {
    if (!aiTurnActive || battlePopup !== null || aiBattlePopup !== null) return;
    const timer = setTimeout(() => {
      dispatch({ type: "aiStep" });
    }, AI_STEP_INTERVAL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state, battlePopup, aiBattlePopup, aiTurnActive, dispatch]);

  // Autosave (S-08, FR-014): every state transition persists — including each
  // staged `aiStep`, so even a refresh mid-AI-replay resumes correctly. The
  // save/clear/skip decision is persistDecision's contract (tested there):
  // a finished campaign clears the save — never persists a winner — and the
  // setup screen (`null`) saves nothing. A failed save no longer disappears
  // silently: it raises the warning banner below.
  useEffect(() => {
    if (state === null) return; // "skip": the setup screen saves nothing
    if (persistDecision(state) === "clear") {
      clearGame();
      return;
    }
    // The new value comes from the storage write's outcome (an external side
    // effect), not from props/state — there is no render-derived source to
    // derive it from, and it only changes when that outcome changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutosaveFailed(saveGame(state) === "failed");
  }, [state]);

  // Picking a side in one group swaps the other, so the two can never be equal.
  const pickPlayerCountry = (id: CountryId): void => {
    setPlayerCountryId(id);
    setAiCountryId(id === "germany" ? "soviet" : "germany");
  };
  const pickAiCountry = (id: CountryId): void => {
    setAiCountryId(id);
    setPlayerCountryId(id === "germany" ? "soviet" : "germany");
  };

  if (state === null) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="mb-1 text-3xl font-bold">EUROPE 1940</h1>
        <p className="mb-8 text-slate-600">Rozpocznij nową kampanię — wybierz strony konfliktu.</p>

        <fieldset className="mb-6">
          <legend className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Twój kraj</legend>
          <div className="grid gap-2">
            {data.countries.map((country) => (
              <CountryOption
                key={country.id}
                country={country}
                selected={country.id === playerCountryId}
                onSelect={pickPlayerCountry}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-8">
          <legend className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Kraj AI</legend>
          <div className="grid gap-2">
            {data.countries.map((country) => (
              <CountryOption
                key={country.id}
                country={country}
                selected={country.id === aiCountryId}
                onSelect={pickAiCountry}
              />
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={() => {
            // The battle PRNG seed comes from the UI (Date.now) so each
            // campaign rolls differently while the reducer stays pure (S-04).
            dispatch({ type: "startGame", playerCountryId, aiCountryId, seed: Date.now() });
            setVictoryDismissed(false); // a fresh campaign starts overlay-free (S-07)
          }}
          className="w-full rounded-lg bg-slate-800 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Rozpocznij grę
        </button>

        {/* Exit to the landing page: the autosave (if any) is untouched —
            returning to /game later resumes the saved campaign (FR-014). */}
        <a
          href="/"
          className="mt-2 block w-full rounded-lg border border-slate-300 px-4 py-3 text-center font-semibold text-slate-700 transition-colors hover:bg-slate-100"
        >
          Strona główna
        </a>
      </main>
    );
  }

  const playerCountry = data.countries.find((country) => country.id === state.playerCountryId);
  const aiCountry = data.countries.find((country) => country.id === state.aiCountryId);

  // The selected army's reach this turn (selection is UI state, not game state).
  const reachable = computeReach(state, selectedArmyId);
  // Enemy-occupied fields the selected army can attack (S-04, FR-007).
  const attackTargets = computeAttackTargets(state, selectedArmyId);
  const attack = (targetFieldId: string): void => {
    if (selectedArmyId === null || inputBlocked(state, "attackArmy")) return;
    dispatch({ type: "attackArmy", armyId: selectedArmyId, targetFieldId });
    setSelectedArmyId(null);
    setSelectedSubject(null); // the battle report takes the panel (S-04)
  };
  const onArmyClick = (armyId: string): void => {
    if (inputBlocked(state, "moveArmy")) return; // no acting inside the AI's turn or after the campaign ended (S-07) — inputBlocked owns this contract
    const army = state.armies.find((candidate) => candidate.id === armyId);
    // Only the player's own armies create a movement selection.
    if (army?.owner !== state.playerCountryId) {
      // Clicking an enemy army while one of ours is selected and the enemy's
      // field is in attack range means attack (S-04) — else inspection only.
      if (selectedArmyId !== null && army !== undefined && attackTargets.has(army.fieldId)) {
        attack(army.fieldId);
        return;
      }
      setSelectedArmyId(null);
      setSelectedSubject({ kind: "army", armyId });
      return;
    }
    setSelectedArmyId((current) => (current === armyId ? null : armyId));
    setSelectedSubject((current) =>
      current?.kind === "army" && current.armyId === armyId ? null : { kind: "army", armyId },
    );
  };
  const onFieldClick = (fieldId: string | null): void => {
    if (inputBlocked(state, "moveArmy")) return; // no acting inside the AI's turn or after the campaign ended (S-07) — inputBlocked owns this contract
    if (fieldId === null) {
      setSelectedArmyId(null);
      setSelectedSubject(null);
      return;
    }
    if (selectedArmyId !== null && attackTargets.has(fieldId)) {
      attack(fieldId); // enemy-occupied field within reach: battle, not move
      return;
    }
    if (selectedArmyId !== null && reachable.has(fieldId)) {
      dispatch({ type: "moveArmy", armyId: selectedArmyId, targetFieldId: fieldId });
      setSelectedArmyId(null);
      setSelectedSubject(null);
      return;
    }
    const field = data.fields.find((candidate) => candidate.id === fieldId);
    if (field === undefined) {
      setSelectedArmyId(null);
      setSelectedSubject(null);
      return;
    }
    setSelectedArmyId(null);
    setSelectedSubject({ kind: field.type === "city" ? "city" : "field", fieldId });
  };

  // The map is the app: a full-viewport board (FR-008 immersive map) with the
  // HUD, the detail panel and the autosave warning floating over it.
  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <BoardMap
        state={state}
        selectedArmyId={selectedArmyId}
        reachable={reachable}
        attackTargets={attackTargets}
        onArmyClick={onArmyClick}
        onFieldClick={onFieldClick}
      />
      <header className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200/70 bg-slate-50/85 px-4 py-2.5 backdrop-blur-sm">
        <h1 className="text-2xl font-bold">EUROPE 1940</h1>
        <p className="text-sm text-slate-600">
          Tura {state.turn} · Grasz: {playerCountry?.name ?? state.playerCountryId} · AI:{" "}
          {aiCountry?.name ?? state.aiCountryId}
          {aiTurnActive ? " · Ruch AI…" : ""}
        </p>
        {/* Treasury HUD (FR-002): the player's resources at all times. */}
        <p className="text-sm font-semibold text-slate-700" aria-label="Skarbiec">
          {(Object.keys(RESOURCE_LABELS) as ResourceId[]).map((resourceId, index) => (
            <span key={resourceId}>
              {index > 0 ? " · " : ""}
              {RESOURCE_LABELS[resourceId]} {state.resources[state.playerCountryId][resourceId]}
            </span>
          ))}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {/* Exit to the main menu at any time: the autosave is kept, so a
              refresh from the menu resumes the exited campaign — nothing is
              lost by leaving, and starting a new game simply overwrites it. */}
          <button
            type="button"
            onClick={() => {
              dispatch({ type: "resetGame" });
              setSelectedArmyId(null);
              setSelectedSubject(null);
              setVictoryDismissed(false);
            }}
            className="rounded-lg border border-slate-300 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
          >
            Menu główne
          </button>
          {gameOver ? (
            // The campaign ended (S-07): the header's only action is a fresh game.
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "resetGame" });
                setSelectedArmyId(null);
                setSelectedSubject(null);
                setVictoryDismissed(false);
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
            >
              Nowa gra
            </button>
          ) : (
            <button
              type="button"
              disabled={aiTurnActive}
              onClick={() => {
                dispatch({ type: "endTurn" });
                setSelectedArmyId(null);
                setSelectedSubject(null);
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {aiTurnActive ? "Tura AI…" : "Koniec tury"}
            </button>
          )}
        </div>
      </header>
      {autosaveFailed && (
        // The autosave warning (FR-014): environmental storage failures must
        // not cost the player their campaign in silence — warn, stay playable.
        <div
          role="alert"
          className="absolute top-16 left-1/2 z-20 flex w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
        >
          <span>
            <strong className="font-semibold">Automatyczny zapis nie działa.</strong> Po odświeżeniu strony kampania
            wróci do ostatniego zapisanego stanu — obecna rozgrywka nie jest zapisywana.
          </span>
          <button
            type="button"
            onClick={() => {
              setAutosaveFailed(false);
            }}
            className="ml-auto rounded-lg border border-amber-400 px-3 py-1.5 font-semibold transition-colors hover:bg-amber-100"
          >
            Rozumiem
          </button>
        </div>
      )}
      <div className="absolute top-[4.75rem] right-3 z-10 max-h-[calc(100dvh-6.5rem)] w-72 overflow-y-auto">
        <DetailPanel
          state={state}
          selected={selectedSubject}
          dispatch={dispatch}
          ordersDisabled={aiTurnActive || gameOver}
        />
      </div>
      {/* Keyed by the battle seed (advances every battle) so a report that changes mid-playback remounts the popup with a fresh counter (review F2). */}
      {battlePopup !== null && (
        <BattlePopup key={`player-${state.rngSeed}`} state={state} report={battlePopup} onClose={closeBattlePopup} />
      )}
      {/* AI battles (S-06): the same staged popup, driven by the replay — the
          driver pauses until it closes. */}
      {aiBattlePopup !== null && aiBattlePopup !== battlePopup && (
        <BattlePopup key={`ai-${state.rngSeed}`} state={state} report={aiBattlePopup} onClose={closeAiBattlePopup} />
      )}
      {/* The campaign's end (S-07): shown once the deciding battle popup has
          closed — the overlay is the last word on the campaign. */}
      {showVictory && (
        <VictoryOverlay
          state={state}
          onDismiss={() => {
            setVictoryDismissed(true);
          }}
          onNewGame={() => {
            dispatch({ type: "resetGame" });
            setSelectedArmyId(null);
            setSelectedSubject(null);
            setVictoryDismissed(false);
          }}
        />
      )}
    </main>
  );
}

function computeReach(state: GameState, selectedArmyId: string | null): ReadonlySet<string> {
  if (selectedArmyId === null) return new Set();
  try {
    return new Set(reachableFields(state, selectedArmyId).keys());
  } catch (error) {
    // Selection outlived its army (e.g. merged away) — treat as no selection.
    // Developer errors still propagate (lesson: bare catch masks them).
    if (isDomainError(error)) return new Set();
    throw error;
  }
}

function computeAttackTargets(state: GameState, selectedArmyId: string | null): ReadonlySet<string> {
  if (selectedArmyId === null) return new Set();
  try {
    return new Set(attackFields(state, selectedArmyId).keys());
  } catch (error) {
    // Selection outlived its army (e.g. destroyed in battle) — no targets.
    // Developer errors still propagate (lesson: bare catch masks them).
    if (isDomainError(error)) return new Set();
    throw error;
  }
}
