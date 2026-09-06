import { COUNTRIES } from "@/data/countries";
import { UNIT_TYPES } from "@/data/units";
import type { CountryId, GameState, UnitTypeId } from "@/types";

/**
 * Client-side campaign persistence (S-08, FR-014): every game-state change is
 * autosaved to localStorage under a versioned envelope; entering /game resumes
 * the saved campaign; the save is cleared when the campaign ends. The game
 * state is fully JSON-serializable and all randomness is seeded inside it,
 * so plain JSON round-trips losslessly — no replays, no server.
 */

/** Bump on any future GameState schema change; old saves are discarded, not migrated. */
export const SAVE_VERSION = 1;

export const SAVE_STORAGE_KEY = "europe1940:save";

/** The persisted shape: the state wrapped in a version discriminator. */
interface SaveEnvelope {
  version: number;
  state: GameState;
}

const COUNTRY_IDS: ReadonlySet<CountryId> = new Set(COUNTRIES.map((country) => country.id));
const UNIT_TYPE_IDS: ReadonlySet<UnitTypeId> = new Set(UNIT_TYPES.map((unitType) => unitType.id));
const RESOURCE_IDS = ["money", "steel", "recruits"] as const;

/**
 * Resolves localStorage, or null where storage is unavailable (non-DOM runtime,
 * privacy mode, sandboxed iframe, blocked cookies). The property access itself
 * can throw a SecurityError in locked-down contexts — environmental failures
 * degrade to "no persistence"; developer errors propagate (lesson: no bare catch).
 */
function getStorage(): Storage | null {
  try {
    // DOM typings mark localStorage as always present; non-DOM runtimes (tests,
    // workers) leave it undefined, so the slot is declared optional here.
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? null;
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
}

/** Persists `state` under a versioned envelope. Environmental storage failures (quota, blocked storage) are swallowed — the game keeps playing without persistence. */
export function saveGame(state: GameState): void {
  const storage = getStorage();
  if (storage === null) return;
  const envelope: SaveEnvelope = { version: SAVE_VERSION, state };
  try {
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

/** Returns the saved campaign, or null when no save exists, the version differs, or the payload fails structural validation — in every failure case the stored entry is removed. */
export function loadGame(): GameState | null {
  const storage = getStorage();
  if (storage === null) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_STORAGE_KEY);
  } catch (error) {
    if (error instanceof DOMException) return null;
    throw error;
  }
  if (raw === null) return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch (error) {
    // Corrupt JSON — SyntaxError is the only thing JSON.parse throws, so this
    // filters the expected case without masking anything of ours.
    if (error instanceof SyntaxError) {
      discardSave(storage);
      return null;
    }
    throw error;
  }

  if (!isRecord(envelope) || envelope.version !== SAVE_VERSION || !isValidGameState(envelope.state)) {
    discardSave(storage);
    return null;
  }
  return envelope.state;
}

/** Removes the stored entry (idempotent). */
export function clearGame(): void {
  const storage = getStorage();
  if (storage === null) return;
  discardSave(storage);
}

function discardSave(storage: Storage): void {
  try {
    storage.removeItem(SAVE_STORAGE_KEY);
  } catch (error) {
    if (error instanceof DOMException) return;
    throw error;
  }
}

// --- Structural validation --------------------------------------------------
//
// A pragmatic type guard: catches truncated saves, wrong-version payloads and
// random JSON — not adversarial deep fakes (a player corrupting their own save
// only harms their own session).

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCountryId(value: unknown): value is CountryId {
  return typeof value === "string" && COUNTRY_IDS.has(value as CountryId);
}

function isUnitTypeId(value: unknown): value is UnitTypeId {
  return typeof value === "string" && UNIT_TYPE_IDS.has(value as UnitTypeId);
}

function isResourceBag(value: unknown): boolean {
  return isRecord(value) && RESOURCE_IDS.every((id) => typeof value[id] === "number");
}

/** Loose BattleReport check — enough to spot truncation/garbage without re-validating every modifier. */
function isBattleReportShaped(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.attackerArmyId === "string" &&
    typeof value.fieldId === "string" &&
    typeof value.attackerWins === "boolean"
  );
}

function isValidGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  if (!Number.isInteger(value.turn) || value.turn < 1) return false;
  if (
    !isCountryId(value.playerCountryId) ||
    !isCountryId(value.aiCountryId) ||
    value.playerCountryId === value.aiCountryId
  ) {
    return false;
  }

  if (!isRecord(value.fieldOwners) || !Object.values(value.fieldOwners).every(isCountryId)) return false;

  if (!Array.isArray(value.armies)) return false;
  for (const army of value.armies) {
    if (
      !isRecord(army) ||
      typeof army.id !== "string" ||
      !isCountryId(army.owner) ||
      typeof army.fieldId !== "string" ||
      typeof army.movementPoints !== "number" ||
      !Array.isArray(army.units)
    ) {
      return false;
    }
    for (const unit of army.units) {
      if (!isRecord(unit) || typeof unit.id !== "string" || !isUnitTypeId(unit.typeId)) return false;
    }
  }

  if (!isRecord(value.resources)) return false;
  for (const countryId of COUNTRY_IDS) {
    if (!isResourceBag(value.resources[countryId])) return false;
  }

  if (!isRecord(value.productionQueues)) return false;
  for (const queue of Object.values(value.productionQueues)) {
    if (!Array.isArray(queue)) return false;
    for (const order of queue) {
      if (!isRecord(order) || !isUnitTypeId(order.typeId) || !Number.isInteger(order.remainingTurns)) {
        return false;
      }
    }
  }

  if (typeof value.rngSeed !== "number") return false;

  if (!isRecord(value.lastBattleReportByCountry)) return false;
  for (const countryId of COUNTRY_IDS) {
    const report = value.lastBattleReportByCountry[countryId];
    if (report !== null && !isBattleReportShaped(report)) return false;
  }

  if (!Array.isArray(value.aiPlan)) return false;
  for (const action of value.aiPlan) {
    if (!isRecord(action)) return false;
    switch (action.kind) {
      case "move":
      case "attack":
        if (typeof action.armyId !== "string" || typeof action.targetFieldId !== "string") return false;
        break;
      case "order":
        if (typeof action.fieldId !== "string" || !isUnitTypeId(action.unitTypeId)) return false;
        break;
      default:
        return false;
    }
  }

  if (!Array.isArray(value.aiTurnLog)) return false;
  for (const entry of value.aiTurnLog) {
    if (!isRecord(entry) || !["move", "battle", "order"].includes(entry.kind as string)) return false;
  }

  if (value.winner !== null && !isCountryId(value.winner)) return false;

  return true;
}
