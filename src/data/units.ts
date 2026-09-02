import type { UnitType } from "@/types";

/**
 * The prototype's four unit types (spec §9 stats, §17 costs), adapted
 * to the PRD's three resources. Draft balance values; the final
 * balance CSV swaps in later.
 */
export const UNIT_TYPES = [
  {
    id: "infantry",
    name: "Piechota",
    attack: 3,
    defense: 5,
    movement: 1,
    bonusVsTank: null,
    supportBonus: null,
    cost: { money: 20, steel: 0, recruits: 5 },
    buildTime: 1,
  },
  {
    id: "tank",
    name: "Czołgi",
    attack: 7,
    defense: 5,
    movement: 2,
    bonusVsTank: null,
    supportBonus: null,
    cost: { money: 50, steel: 20, recruits: 10 },
    buildTime: 2,
  },
  {
    id: "artillery",
    name: "Artyleria",
    attack: 5,
    defense: 2,
    movement: 1,
    bonusVsTank: null,
    supportBonus: 2,
    cost: { money: 30, steel: 15, recruits: 5 },
    buildTime: 2,
  },
  {
    id: "antiTank",
    name: "Działa przeciwpancerne",
    attack: 3,
    defense: 4,
    movement: 1,
    bonusVsTank: 3,
    supportBonus: null,
    cost: { money: 25, steel: 10, recruits: 5 },
    buildTime: 1,
  },
] as const satisfies readonly UnitType[];
