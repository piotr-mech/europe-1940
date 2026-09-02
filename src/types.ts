/**
 * Game domain types (change: game-data-contract, F-01).
 *
 * One canonical dataset shaped by these types lives in `src/data/`
 * and is consumed through `getGameData()` from `src/lib/game-data.ts`.
 */

/** Playable countries on the prototype map (FR-001). */
export type CountryId = "germany" | "soviet";

/** Terrain kinds a non-city field can have (spec §4; port cut per PRD Non-Goals). */
export type TerrainType = "plains" | "forest" | "mountains" | "river";

/** Field kinds: cities plus the four terrain kinds. */
export type FieldType = "city" | TerrainType;

/** MVP resources (PRD FR-002: money, steel, recruits — oil/food cut). */
export type ResourceId = "money" | "steel" | "recruits";

export type ResourceBag = Record<ResourceId, number>;

/** Unit kinds available in the prototype (spec §31). */
export type UnitTypeId = "infantry" | "tank" | "artillery" | "antiTank";

/** National bonus (spec §5); effects are implemented by id in later slices. */
export interface NationalBonus {
  id: string;
  name: string;
  description: string;
}

export interface Country {
  id: CountryId;
  /** Polish display name. */
  name: string;
  /** Hex color used for ownership on the map. */
  color: string;
  nationalBonus: NationalBonus;
}

/** Static city statistics; owned by a `MapField` with `type: "city"`. */
export interface CityData {
  /** Parallel production slots (spec §17: 1–3). */
  productionSlots: number;
  defenseBonus: number;
  /** Per-turn income for the owning country. */
  income: ResourceBag;
}

export interface MapField {
  /** Kebab-case English id, e.g. "warsaw". */
  id: string;
  /** Polish display name, e.g. "Warszawa". */
  name: string;
  type: FieldType;
  /** Ids of adjacent fields; must be symmetric across the dataset. */
  connections: string[];
  initialOwner: CountryId;
  /** SVG coordinates on the 1800x1200 canvas from game_data/*.csv. */
  x: number;
  y: number;
  /** Present iff `type === "city"`. */
  city: CityData | null;
}

export interface UnitType {
  id: UnitTypeId;
  /** Polish display name. */
  name: string;
  attack: number;
  defense: number;
  movement: number;
  /** Extra attack vs tanks; anti-tank guns only. */
  bonusVsTank: number | null;
  /** Flat support bonus to the attacking army's strength (FR-007, spec §12); artillery only. */
  supportBonus: number | null;
  cost: ResourceBag;
  /** Build time in turns. */
  buildTime: number;
}

/** Terrain effects consumed by movement (S-02) and combat (S-04). */
export interface TerrainStats {
  movementCost: number;
  defenderBonus: number | null;
  attackerPenalty: number | null;
}

/** The aggregate served by `getGameData()` (src/lib/game-data.ts). */
export interface GameData {
  countries: readonly Country[];
  terrain: Record<TerrainType, TerrainStats>;
  unitTypes: readonly UnitType[];
  fields: readonly MapField[];
}

// --- Battle (S-04) ---

/** One line of the battle report's "why" (NFR: no unexplainable outcomes). */
export interface BattleModifier {
  /** Polish display label, e.g. "Artyleria (wsparcie)". */
  label: string;
  /** Signed change to the side's strength. */
  amount: number;
}

/** Everything the UI panel shows after a battle (S-04, FR-007). */
export interface BattleReport {
  attackerArmyId: string;
  defenderArmyIds: string[];
  fieldId: string;
  attackerWins: boolean;
  /** Units destroyed on each side (FR-008: the loser loses all). */
  attackerLosses: number;
  defenderLosses: number;
  /** Modified strengths before the random roll. */
  attackStrength: number;
  defenseStrength: number;
  attackModifiers: BattleModifier[];
  defenseModifiers: BattleModifier[];
}

// --- Runtime game state (S-01; persisted client-side from S-08) ---

/** A concrete unit in an army; stats come from its UnitType. */
export interface UnitInstance {
  id: string;
  typeId: UnitTypeId;
}

export interface Army {
  id: string;
  owner: CountryId;
  fieldId: string;
  units: UnitInstance[];
  /** Movement points left this turn; reset to `armySpeed` on end turn (S-02). */
  movementPoints: number;
}

/** One queued build in a city; placed and paid at order time (S-03, FR-003). */
export interface ProductionOrder {
  typeId: UnitTypeId;
  remainingTurns: number;
}

export interface GameState {
  turn: number;
  playerCountryId: CountryId;
  aiCountryId: CountryId;
  /** fieldId -> owning country. */
  fieldOwners: Record<string, CountryId>;
  armies: Army[];
  /** Treasury per country (S-03, FR-002); seeded with turn-1 income at game start. */
  resources: Record<CountryId, ResourceBag>;
  /** fieldId -> queued builds (S-03, FR-003); absent key = empty queue. */
  productionQueues: Record<string, ProductionOrder[]>;
  /** PRNG seed for the next battle (S-04); advanced by every resolveBattle call. */
  rngSeed: number;
  /** The most recent battle's report (S-04); null until the first battle. */
  lastBattleReport: BattleReport | null;
}
