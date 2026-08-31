import type { TerrainStats, TerrainType } from "@/types";

/**
 * Terrain effects (draft values from spec §4/§11). Combat modifiers are
 * consumed by the battle slice (S-04); movement costs by S-02.
 */
export const TERRAIN = {
  plains: { movementCost: 1, defenderBonus: null, attackerPenalty: null },
  forest: { movementCost: 1, defenderBonus: 2, attackerPenalty: null },
  mountains: { movementCost: 2, defenderBonus: 4, attackerPenalty: null },
  river: { movementCost: 1, defenderBonus: null, attackerPenalty: 3 },
} as const satisfies Record<TerrainType, TerrainStats>;
