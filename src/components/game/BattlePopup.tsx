import { useEffect, useState } from "react";

import { UNIT_ICON } from "@/components/game/unit-icons";
import { getGameData } from "@/lib/game-data";
import type { Country, GameState, UnitTypeId } from "@/types";

/** One staged unit death per tick (user-requested battle pacing, S-04). */
const DEATH_INTERVAL_MS = 1000;
/** The result line lingers a beat after the last death before the popup disappears. */
const RESULT_LINGER_MS = 1200;

interface BattlePopupProps {
  state: GameState;
  report: BattleReportLike;
  /** Called with the played-back report when the popup disappears. */
  onClose: (report: BattleReportLike) => void;
}

/** The subset of BattleReport the popup renders (keeps the props narrow). */
interface BattleReportLike {
  attackerOwner: Country["id"];
  attackerArmyId: string;
  fieldId: string;
  attackerWins: boolean;
  attackStrength: number;
  defenseStrength: number;
  attackerComposition: UnitTypeId[];
  defenderComposition: UnitTypeId[];
  deathLog: { side: "attacker" | "defender"; unitTypeId: UnitTypeId }[];
}

function SideColumn({
  title,
  country,
  composition,
  deathsShown,
}: {
  title: string;
  country: Country;
  composition: UnitTypeId[];
  deathsShown: number;
}) {
  const alive = composition.length - deathsShown;
  return (
    <div className="grid gap-1.5">
      <header className="flex items-center gap-1.5 text-sm">
        <span className="h-3 w-3 rounded-sm border border-slate-300" style={{ backgroundColor: country.color }} />
        <span className="font-semibold text-slate-700">{title}</span>
        <span className="text-xs text-slate-400">{country.name}</span>
      </header>
      <ul className="flex min-h-14 flex-wrap gap-1.5">
        {composition.map((typeId, index) => {
          // Deaths strike from the end of the array (engine removal order).
          const dead = index >= alive;
          return (
            <li
              key={`${typeId}-${index}`}
              className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                dead ? "border-slate-200 bg-slate-100 opacity-30 grayscale" : "border-slate-300 bg-white"
              }`}
            >
              <img src={UNIT_ICON[typeId]} alt="" className="h-7 w-7" />
            </li>
          );
        })}
      </ul>
      <p className="text-xs font-semibold text-slate-500">
        {alive} / {composition.length} jednostek
      </p>
    </div>
  );
}

/**
 * The battle stage (S-04): a modal that plays back the engine-resolved battle
 * one unit death per second, alternating sides, then shows the result for a
 * beat and disappears. The map is blocked while the battle plays; the side
 * panel keeps the full recap (strengths, losses, modifiers).
 */
export function BattlePopup({ state, report, onClose }: BattlePopupProps) {
  const data = getGameData();
  const [deathsShown, setDeathsShown] = useState(0);
  const finished = deathsShown >= report.deathLog.length;

  useEffect(() => {
    if (finished) {
      const timer = setTimeout(() => {
        onClose(report);
      }, RESULT_LINGER_MS);
      return () => {
        clearTimeout(timer);
      };
    }
    const timer = setTimeout(() => {
      setDeathsShown((current) => current + 1);
    }, DEATH_INTERVAL_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [deathsShown, finished, onClose, report]);

  const attackerCountry = data.countries.find((country) => country.id === report.attackerOwner) ?? data.countries[0];
  const defenderCountry = data.countries.find((country) => country.id !== report.attackerOwner) ?? data.countries[1];
  const field = data.fields.find((candidate) => candidate.id === report.fieldId);
  const playerWon = (report.attackerOwner === state.playerCountryId) === report.attackerWins;
  const attackerDeathsShown = report.deathLog.slice(0, deathsShown).filter((death) => death.side === "attacker").length;
  const defenderDeathsShown = deathsShown - attackerDeathsShown;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-label="Bitwa"
      onClick={() => {
        // Clicking the backdrop skips the rest of the playback (review F5).
        onClose(report);
      }}
    >
      <div
        className="grid w-full max-w-md gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(event) => {
          event.stopPropagation(); // the card itself is not a skip target
        }}
      >
        <header>
          <h2 className="text-lg font-bold">Bitwa{field !== undefined ? ` o ${field.name}` : ""}</h2>
          <p className="text-xs text-slate-500">
            Armia {report.attackerArmyId} atakuje · Siły {report.attackStrength} vs {report.defenseStrength}
          </p>
        </header>
        <div className="grid grid-cols-2 gap-4">
          <SideColumn
            title="Atakujący"
            country={attackerCountry}
            composition={report.attackerComposition}
            deathsShown={attackerDeathsShown}
          />
          <SideColumn
            title="Obrońca"
            country={defenderCountry}
            composition={report.defenderComposition}
            deathsShown={defenderDeathsShown}
          />
        </div>
        {finished ? (
          <p
            className={`text-center text-base font-bold ${playerWon ? "text-emerald-700" : "text-red-700"}`}
            aria-live="polite"
          >
            {playerWon ? "Zwycięstwo!" : "Porażka"}
          </p>
        ) : (
          <p className="text-center text-sm text-slate-400">Bitwa trwa…</p>
        )}
      </div>
    </div>
  );
}
