import { useReducer, useState } from "react";

import { BoardMap } from "@/components/game/BoardMap";
import { getGameData } from "@/lib/game-data";
import { gameReducer } from "@/lib/game-state";
import { cn } from "@/lib/utils";
import type { Country, CountryId } from "@/types";

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
 * different) transitioning to the board view; refresh returns to setup
 * (persistence is S-08).
 */
export function GameScreen() {
  const data = getGameData();
  const [state, dispatch] = useReducer(gameReducer, null);
  const [playerCountryId, setPlayerCountryId] = useState<CountryId>("germany");
  const [aiCountryId, setAiCountryId] = useState<CountryId>("soviet");

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
            dispatch({ type: "startGame", playerCountryId, aiCountryId });
          }}
          className="w-full rounded-lg bg-slate-800 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Rozpocznij grę
        </button>
      </main>
    );
  }

  const playerCountry = data.countries.find((country) => country.id === state.playerCountryId);
  const aiCountry = data.countries.find((country) => country.id === state.aiCountryId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-bold">EUROPE 1940</h1>
        <p className="text-sm text-slate-600">
          Tura {state.turn} · Grasz: {playerCountry?.name ?? state.playerCountryId} · AI:{" "}
          {aiCountry?.name ?? state.aiCountryId}
        </p>
      </header>
      <BoardMap state={state} />
    </main>
  );
}
