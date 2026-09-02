import { getGameData } from "@/lib/game-data";
import { dominantUnitType, type GameAction } from "@/lib/game-state";
import { armySpeed, movementCostOf } from "@/lib/movement";
import { freeProductionSlots, unitCostFor } from "@/lib/production";
import { UNIT_ICON } from "@/components/game/unit-icons";
import type { Country, GameState, ResourceId, TerrainType, UnitTypeId } from "@/types";

/** What the inspection panel shows (FR-006): a city, a terrain field, or an army. */
export type SelectedSubject =
  | { kind: "city"; fieldId: string }
  | { kind: "field"; fieldId: string }
  | { kind: "army"; armyId: string };

interface DetailPanelProps {
  state: GameState;
  selected: SelectedSubject | null;
  /** GameScreen owns the reducer; the ordering section dispatches through it. */
  dispatch: React.Dispatch<GameAction>;
}

const TERRAIN_LABELS: Record<TerrainType, string> = {
  plains: "Równiny",
  forest: "Las",
  mountains: "Góry",
  river: "Rzeka",
};

/** Polish labels shared by the treasury HUD and the panel's income rows. */
export const RESOURCE_LABELS: Record<ResourceId, string> = {
  money: "Pieniądze",
  steel: "Stal",
  recruits: "Rekruci",
};

function OwnerBadge({ owner }: { owner: Country }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <span className="h-3.5 w-3.5 rounded-sm border border-slate-300" style={{ backgroundColor: owner.color }} />
      {owner.name}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

/**
 * Side panel with the selected subject's details (FR-006): city stats, terrain
 * effects, or army composition. Raw Tailwind, slate palette — no dependencies.
 */
export function DetailPanel({ state, selected, dispatch }: DetailPanelProps) {
  const data = getGameData();
  const fieldById = new Map(data.fields.map((field) => [field.id, field]));
  const countryById = new Map(data.countries.map((country) => [country.id, country]));
  const unitTypeById = new Map(data.unitTypes.map((unitType) => [unitType.id, unitType]));

  let body: React.ReactNode;

  if (selected === null) {
    body = <p className="text-sm text-slate-500">Kliknij miasto, pole lub armię na mapie, aby zobaczyć szczegóły.</p>;
  } else if (selected.kind === "army") {
    const army = state.armies.find((candidate) => candidate.id === selected.armyId);
    if (army === undefined) {
      body = <p className="text-sm text-slate-500">Armia nie istnieje.</p>;
    } else {
      const owner = countryById.get(army.owner);
      // Group units by type so the composition reads at a glance.
      const counts = new Map<UnitTypeId, number>();
      for (const unit of army.units) {
        counts.set(unit.typeId, (counts.get(unit.typeId) ?? 0) + 1);
      }
      const dominant = dominantUnitType(army);
      body = (
        <div className="grid gap-3">
          <header>
            <h2 className="text-lg font-bold">Armia {army.id}</h2>
            {owner !== undefined && <OwnerBadge owner={owner} />}
          </header>
          <dl className="grid gap-1 text-sm">
            <StatRow label="Jednostki" value={`${army.units.length} / 8`} />
            <StatRow label="Ruch" value={`${army.movementPoints} / ${armySpeed(army)}`} />
            <StatRow label="Typ dominujący" value={unitTypeById.get(dominant)?.name ?? dominant} />
          </dl>
          <ul className="grid gap-1.5 text-sm">
            {[...counts.entries()].map(([typeId, count]) => {
              const unitType = unitTypeById.get(typeId);
              if (unitType === undefined) return null;
              return (
                <li
                  key={typeId}
                  className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
                >
                  <img src={UNIT_ICON[typeId]} alt="" className="h-8 w-8 shrink-0" />
                  <span className="min-w-0">
                    <span className="font-semibold">
                      {count}× {unitType.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      Atak {unitType.attack} · Obrona {unitType.defense} · Ruch {unitType.movement}
                      {unitType.bonusVsTank !== null ? ` · +${unitType.bonusVsTank} vs czołgi` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
  } else {
    const field = fieldById.get(selected.fieldId);
    if (field === undefined) {
      body = <p className="text-sm text-slate-500">Pole nie istnieje.</p>;
    } else {
      const owner = countryById.get(state.fieldOwners[field.id] ?? "");
      const isCity = selected.kind === "city";
      const terrain = !isCity ? data.terrain[field.type as TerrainType] : null;
      body = (
        <div className="grid gap-3">
          <header>
            <h2 className="text-lg font-bold">{field.name}</h2>
            <div className="flex items-center gap-2">
              {owner !== undefined && <OwnerBadge owner={owner} />}
              <span className="text-xs text-slate-400">
                {isCity ? "Miasto" : TERRAIN_LABELS[field.type as TerrainType]}
              </span>
            </div>
          </header>
          {isCity && field.city !== null ? (
            <>
              <dl className="grid gap-1 text-sm">
                <StatRow label="Sloty produkcyjne" value={String(field.city.productionSlots)} />
                <StatRow label="Bonus obrony" value={String(field.city.defenseBonus)} />
                {(Object.keys(RESOURCE_LABELS) as ResourceId[]).map((resourceId) => (
                  <StatRow
                    key={resourceId}
                    label={`Dochód · ${RESOURCE_LABELS[resourceId]}`}
                    value={String(field.city.income[resourceId])}
                  />
                ))}
              </dl>
              {state.fieldOwners[field.id] === state.playerCountryId ? (
                <ProductionSection state={state} fieldId={field.id} dispatch={dispatch} />
              ) : null}
            </>
          ) : terrain !== null ? (
            <dl className="grid gap-1 text-sm">
              <StatRow label="Koszt ruchu" value={String(movementCostOf(field))} />
              <StatRow
                label="Bonus obrony obrońcy"
                value={terrain.defenderBonus === null ? "—" : `+${terrain.defenderBonus}`}
              />
              <StatRow
                label="Kara atakującego"
                value={terrain.attackerPenalty === null ? "—" : `−${terrain.attackerPenalty}`}
              />
            </dl>
          ) : null}
        </div>
      );
    }
  }

  return (
    <aside className="w-72 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-4" aria-label="Panel szczegółów">
      {body}
    </aside>
  );
}

interface ProductionSectionProps {
  state: GameState;
  fieldId: string;
  dispatch: React.Dispatch<GameAction>;
}

/**
 * Ordering + queue view for a city owned by the player (FR-003): unit types
 * with cost (national bonuses via `unitCostFor`) and build time, plus the
 * city's current queue. Buttons offer only legal orders — no slot or no
 * treasury disables them; the reducer backstop covers the rest.
 */
function ProductionSection({ state, fieldId, dispatch }: ProductionSectionProps) {
  const data = getGameData();
  const unitTypeById = new Map(data.unitTypes.map((unitType) => [unitType.id, unitType]));
  const countryId = state.playerCountryId;
  const treasury = state.resources[countryId];
  const freeSlots = freeProductionSlots(state, fieldId);
  const queue = state.productionQueues[fieldId] ?? [];

  return (
    <section className="grid gap-2" aria-label="Produkcja">
      <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
        Produkcja · wolne sloty: {freeSlots}
      </h3>
      <p className="text-xs text-slate-400">Koszt: pieniądze / stal / rekruci</p>
      <ul className="grid gap-1.5 text-sm">
        {data.unitTypes.map((unitType) => {
          const cost = unitCostFor(countryId, unitType.id);
          const affordable =
            treasury.money >= cost.money && treasury.steel >= cost.steel && treasury.recruits >= cost.recruits;
          return (
            <li
              key={unitType.id}
              className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
            >
              <img src={UNIT_ICON[unitType.id]} alt="" className="h-8 w-8 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{unitType.name}</span>
                <span className="block text-xs text-slate-500">
                  Koszt {cost.money} / {cost.steel} / {cost.recruits} · Czas: {unitType.buildTime} t.
                </span>
              </span>
              <button
                type="button"
                disabled={freeSlots === 0 || !affordable}
                onClick={() => {
                  dispatch({ type: "orderUnit", fieldId, unitTypeId: unitType.id });
                }}
                className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Zamów
              </button>
            </li>
          );
        })}
      </ul>
      {queue.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <h4 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Kolejka</h4>
          <ol className="grid gap-1">
            {queue.map((order, index) => (
              <li key={`${order.typeId}-${index}`} className="flex items-baseline justify-between gap-2">
                <span className="text-slate-700">
                  {index + 1}. {unitTypeById.get(order.typeId)?.name ?? order.typeId}
                </span>
                <span className="text-xs text-slate-500">pozostało {order.remainingTurns} t.</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
