import { COUNTRIES } from "@/data/countries";
import { MAP_FIELDS } from "@/data/map";
import { TERRAIN } from "@/data/terrain";
import { UNIT_TYPES } from "@/data/units";
import type { GameData } from "@/types";

/** Prototype map size range (PRD FR-001). */
const FIELD_COUNT_MIN = 25;
const FIELD_COUNT_MAX = 30;

/** Aggregates the version-controlled datasets into the canonical GameData. */
export function buildGameData(): GameData {
  return {
    countries: COUNTRIES,
    terrain: TERRAIN,
    unitTypes: UNIT_TYPES,
    fields: MAP_FIELDS,
  };
}

/**
 * Checks invariants the type system cannot express. Returns violation
 * messages; an empty array means the dataset is valid.
 */
export function validateGameData(data: GameData): string[] {
  const violations: string[] = [];

  // --- Unique ids ---
  const countryIds = new Set<string>();
  for (const country of data.countries) {
    if (countryIds.has(country.id)) {
      violations.push(`duplicate country id "${country.id}"`);
    }
    countryIds.add(country.id);
  }

  const unitTypeIds = new Set<string>();
  for (const unitType of data.unitTypes) {
    if (unitTypeIds.has(unitType.id)) {
      violations.push(`duplicate unit type id "${unitType.id}"`);
    }
    unitTypeIds.add(unitType.id);
  }

  const fieldsById = new Map<string, GameData["fields"][number]>();
  for (const field of data.fields) {
    if (fieldsById.has(field.id)) {
      violations.push(`duplicate field id "${field.id}"`);
    } else {
      fieldsById.set(field.id, field);
    }
  }

  // --- Field count range ---
  if (data.fields.length < FIELD_COUNT_MIN || data.fields.length > FIELD_COUNT_MAX) {
    violations.push(`map must have ${FIELD_COUNT_MIN}-${FIELD_COUNT_MAX} fields, got ${data.fields.length}`);
  }

  // --- Connections: exist, symmetric, known owner, city consistency ---
  for (const field of data.fields) {
    for (const connectionId of field.connections) {
      const neighbor = fieldsById.get(connectionId);
      if (neighbor === undefined) {
        violations.push(`field "${field.id}" connects to unknown field "${connectionId}"`);
      } else if (!neighbor.connections.includes(field.id)) {
        violations.push(`asymmetric connection: "${field.id}" -> "${connectionId}" is not declared back`);
      }
    }

    if (!countryIds.has(field.initialOwner)) {
      violations.push(`field "${field.id}" has unknown initial owner "${field.initialOwner}"`);
    }

    if (field.type === "city" && field.city === null) {
      violations.push(`field "${field.id}" of type "city" must carry city data`);
    }
    if (field.type !== "city" && field.city !== null) {
      violations.push(`field "${field.id}" of type "${field.type}" must not carry city data`);
    }
  }

  // --- Connectivity (BFS from the first field) ---
  const start = data.fields.at(0);
  if (start === undefined) {
    violations.push("map has no fields");
  } else {
    const reachable = new Set<string>([start.id]);
    const queue = [start.id];
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined) break;
      const current = fieldsById.get(currentId);
      if (current === undefined) continue;
      for (const connectionId of current.connections) {
        if (!reachable.has(connectionId)) {
          reachable.add(connectionId);
          queue.push(connectionId);
        }
      }
    }
    const unreachable = data.fields.filter((field) => !reachable.has(field.id)).map((field) => field.id);
    if (unreachable.length > 0) {
      violations.push(`map graph is not connected, unreachable fields: ${unreachable.join(", ")}`);
    }
  }

  // --- Value ranges ---
  for (const unitType of data.unitTypes) {
    const numbers: (readonly [string, number])[] = [
      ["attack", unitType.attack],
      ["defense", unitType.defense],
      ["movement", unitType.movement],
      ["buildTime", unitType.buildTime],
      ["cost.money", unitType.cost.money],
      ["cost.steel", unitType.cost.steel],
      ["cost.recruits", unitType.cost.recruits],
    ];
    if (unitType.bonusVsTank !== null) {
      numbers.push(["bonusVsTank", unitType.bonusVsTank]);
    }
    if (unitType.supportBonus !== null) {
      numbers.push(["supportBonus", unitType.supportBonus]);
    }
    for (const [label, value] of numbers) {
      if (value < 0) {
        violations.push(`unit type "${unitType.id}" has negative ${label}`);
      }
    }
  }

  for (const field of data.fields) {
    if (field.city === null) continue;
    const city = field.city;
    const numbers: (readonly [string, number])[] = [
      ["defenseBonus", city.defenseBonus],
      ["income.money", city.income.money],
      ["income.steel", city.income.steel],
      ["income.recruits", city.income.recruits],
    ];
    for (const [label, value] of numbers) {
      if (value < 0) {
        violations.push(`city "${field.id}" has negative ${label}`);
      }
    }
    if (city.productionSlots < 1 || city.productionSlots > 3) {
      violations.push(`city "${field.id}" must have 1-3 production slots, got ${city.productionSlots}`);
    }
  }

  return violations;
}

let cached: GameData | null = null;

/**
 * The single import surface for every game slice: returns the validated
 * canonical dataset, throwing with all violations if the data is broken.
 */
export function getGameData(): GameData {
  if (cached === null) {
    const data = buildGameData();
    const violations = validateGameData(data);
    if (violations.length > 0) {
      throw new Error(`Invalid game data:\n- ${violations.join("\n- ")}`);
    }
    cached = data;
  }
  return cached;
}
