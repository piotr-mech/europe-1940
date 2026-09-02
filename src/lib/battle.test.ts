import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { gameReducer, createInitialGameState } from "@/lib/game-state";
import { armySpeed, attackFields } from "@/lib/movement";
import { collectIncome } from "@/lib/production";
import { attackerStrength, defenderStrength, resolveBattle, rngStep } from "@/lib/battle";
import type { Army, CountryId, GameState, MapField, UnitInstance, UnitTypeId } from "@/types";

const FIELD_BY_ID = new Map(MAP_FIELDS.map((field) => [field.id, field]));

function field(fieldId: string): MapField {
  return FIELD_BY_ID.get(fieldId) ?? failWith(`unknown field "${fieldId}"`);
}

function failWith(message: string): never {
  throw new Error(message);
}

function units(...typeIds: UnitTypeId[]): UnitInstance[] {
  return typeIds.map((typeId, index) => ({ id: `u${index + 1}`, typeId }));
}

function army(id: string, owner: CountryId, fieldId: string, typeIds: UnitTypeId[]): Army {
  const base: Army = { id, owner, fieldId, units: units(...typeIds) };
  return { ...base, movementPoints: armySpeed(base) };
}

/** Initial game with the armies replaced by the test setup. */
function stateWithArmies(armies: Army[]): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, armies };
}

function findArmy(state: GameState, armyId: string) {
  return state.armies.find((candidate) => candidate.id === armyId) ?? failWith(`unknown army "${armyId}"`);
}

function hasArmy(state: GameState, armyId: string) {
  return state.armies.some((candidate) => candidate.id === armyId);
}

describe("rngStep", () => {
  it("is deterministic per seed and advances the seed", () => {
    const first = rngStep(42);
    const second = rngStep(42);
    expect(first).toEqual(second);
    expect(first.value).toBeGreaterThanOrEqual(0);
    expect(first.value).toBeLessThan(1);
    expect(first.nextSeed).not.toBe(42);
  });
});

describe("attackerStrength", () => {
  it("sums unit attack with no modifiers on neutral ground", () => {
    const result = attackerStrength(
      army("G", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      field("oder-plains"),
    );
    expect(result.total).toBe(12); // 4 x infantry A3
    expect(result.modifiers).toEqual([]);
  });

  it("adds artillery support (+2 per artillery unit, FR-007 spec §12)", () => {
    const result = attackerStrength(
      army("G", "germany", "berlin", ["infantry", "infantry", "artillery"]),
      field("oder-plains"),
    );
    expect(result.total).toBe(13); // 3 + 3 + 5 + 2
    expect(result.modifiers).toEqual([{ label: "Artyleria (wsparcie)", amount: 2 }]);
  });

  it("subtracts the river-crossing penalty when the defender stands on a river field", () => {
    const result = attackerStrength(
      army("G", "germany", "poznan", ["infantry", "infantry", "artillery"]),
      field("bzura-river"),
    );
    expect(result.total).toBe(10); // 13 - 3
    expect(result.modifiers).toContainEqual({ label: "Atak przez rzekę", amount: -3 });
  });

  it("clamps a penalty-driven strength at 0", () => {
    const result = attackerStrength(army("G", "germany", "poznan", ["infantry"]), field("bzura-river"));
    expect(result.total).toBe(0); // 3 - 3
  });
});

describe("defenderStrength", () => {
  it("adds the forest defender bonus (FR-007 terrain modifier)", () => {
    const result = defenderStrength(
      [army("R", "soviet", "bialowieza-forest", ["infantry", "infantry"])],
      field("bialowieza-forest"),
    );
    expect(result.total).toBe(12); // 2 x D5 + 2
    expect(result.modifiers).toEqual([{ label: "Puszcza Białowieska (teren)", amount: 2 }]);
  });

  it("adds the mountains defender bonus", () => {
    const result = defenderStrength(
      [army("R", "soviet", "carpathians-mountains", ["infantry", "infantry"])],
      field("carpathians-mountains"),
    );
    expect(result.total).toBe(14); // 10 + 4
  });

  it("adds the city defense bonus", () => {
    const result = defenderStrength([army("R", "soviet", "brest", ["infantry", "infantry"])], field("brest"));
    expect(result.total).toBe(13); // 10 + 3
    expect(result.modifiers).toEqual([{ label: "Brześć (miasto)", amount: 3 }]);
  });

  it("defends with all enemy armies on the field together", () => {
    const defenders = [
      army("R1", "soviet", "bialowieza-forest", ["infantry", "infantry"]),
      army("R2", "soviet", "bialowieza-forest", ["infantry", "infantry"]),
    ];
    expect(defenderStrength(defenders, field("bialowieza-forest")).total).toBe(22); // 20 + 2
  });
});

describe("resolveBattle", () => {
  it("attacker wins: defender destroyed, attacker enters the field, movement ends (seed 1)", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["tank", "tank", "tank", "tank", "tank", "tank", "tank", "tank"]),
      army("R", "soviet", "oder-plains", ["infantry"]),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "oder-plains", 1);

    expect(report.attackerWins).toBe(true);
    expect(hasArmy(next, "R")).toBe(false); // loser destroyed entirely (FR-008)
    const attacker = findArmy(next, "G");
    expect(attacker.fieldId).toBe("oder-plains");
    expect(attacker.movementPoints).toBe(0); // an attack ends the army's movement
    expect(attacker.units.length).toBe(8); // seed 1 draws 0 losses
    expect(report.attackerLosses).toBe(0);
    expect(report.defenderLosses).toBe(1);
  });

  it("weaker attacker can win on the random roll (US-01: not entirely predictable, seed 6)", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "oder-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "oder-plains", 6);

    expect(report.attackStrength).toBe(18); // 6 x A3
    expect(report.defenseStrength).toBe(20); // 4 x D5, plains: no bonus
    expect(report.attackerWins).toBe(true);
    expect(report.attackerLosses).toBe(5); // heavy price for the upset
    expect(findArmy(next, "G").units.length).toBe(1);
    expect(hasArmy(next, "R")).toBe(false);
  });

  it("clamps winner losses so the winner always survives with >= 1 unit (seed 6)", () => {
    // 2 tanks (A14) vs 2 infantry in the forest (D12): unclamped cap = 2, clamp = 1.
    const state = stateWithArmies([
      army("G", "germany", "minsk", ["tank", "tank"]),
      army("R", "soviet", "bialowieza-forest", ["infantry", "infantry"]),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "bialowieza-forest", 6);

    expect(report.attackerWins).toBe(true);
    expect(report.attackerLosses).toBe(1); // the clamp, not the raw cap of 2
    expect(findArmy(next, "G").units.length).toBe(1);
  });

  it("removes losses from the end of the unit array", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "oder-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { state: next } = resolveBattle(state, "G", "oder-plains", 6);
    const remaining = findArmy(next, "G").units;
    expect(remaining.map((unit) => unit.id)).toEqual(["u1"]); // u2..u6 destroyed
  });

  it("defender wins: attacker destroyed, defender loses units but holds the field (seed 6)", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["infantry"]),
      army("R", "soviet", "oder-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "oder-plains", 6);

    expect(report.attackerWins).toBe(false);
    expect(hasArmy(next, "G")).toBe(false);
    const defender = findArmy(next, "R");
    expect(defender.fieldId).toBe("oder-plains");
    expect(defender.units.length).toBe(3); // 1 loss off the end
    expect(report.attackerLosses).toBe(1);
    expect(next.fieldOwners["oder-plains"]).toBe("germany"); // ownership unchanged
  });

  it("captures a city: owner flips, queue cancelled, income flows to the winner next turn (FR-009)", () => {
    const before = stateWithArmies([
      army("G", "germany", "bug-river", ["tank", "tank", "tank", "tank", "tank", "tank", "tank", "tank"]),
      army("R", "soviet", "brest", ["infantry"]),
    ]);
    before.productionQueues.brest = [{ typeId: "infantry", remainingTurns: 1 }];

    const { state: captured, report } = resolveBattle(before, "G", "brest", 1);
    expect(report.attackerWins).toBe(true);
    expect(captured.fieldOwners.brest).toBe("germany");
    expect(captured.productionQueues.brest).toBeUndefined(); // captured queue is cancelled
    expect(findArmy(captured, "G").fieldId).toBe("brest");

    // FR-009's "from the next turn": endTurn's collectIncome pays the captured
    // city's income to the new owner. Compare collectIncome directly (the same
    // path endTurn runs) before vs after the capture.
    const incomeBefore = collectIncome(before).resources.germany;
    const incomeAfter = collectIncome(captured).resources.germany;
    expect(incomeAfter.money - incomeBefore.money).toBe(6); // brest income
    expect(incomeAfter.steel - incomeBefore.steel).toBe(2);
    expect(incomeAfter.recruits - incomeBefore.recruits).toBe(4);

    // And the full endTurn composes cleanly over a captured state.
    expect(gameReducer(captured, { type: "endTurn" }).turn).toBe(captured.turn + 1);
  });

  it("is fully deterministic per seed", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["tank", "tank", "tank", "tank"]),
      army("R", "soviet", "oder-plains", ["infantry", "infantry"]),
    ]);
    expect(resolveBattle(state, "G", "oder-plains", 99)).toEqual(resolveBattle(state, "G", "oder-plains", 99));
  });

  it("throws for an unknown army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => resolveBattle(state, "nope", "oder-plains", 1)).toThrow("unknown army");
  });

  it("throws when the field holds no enemy army (that path is a move)", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => resolveBattle(state, "G", "oder-plains", 1)).toThrow("not a battle");
  });

  it("throws for a field out of attack reach", () => {
    // Speed-1 infantry in Krakow cannot reach the Carpathians (entry cost 2).
    const state = stateWithArmies([
      army("G", "germany", "krakow", ["infantry"]),
      army("R", "soviet", "carpathians-mountains", ["infantry"]),
    ]);
    expect(() => resolveBattle(state, "G", "carpathians-mountains", 1)).toThrow("not an attack target");
    expect(attackFields(state, "G").has("carpathians-mountains")).toBe(false);
  });
});

describe("deathLog (staged popup reveal)", () => {
  it("alternates sides starting with the heavier-losing side; counts match losses (seed 6)", () => {
    // Upset scenario: attacker 6 infantry (losses 5) vs defender 4 infantry (losses 4).
    const state = stateWithArmies([
      army("G", "germany", "berlin", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "oder-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { report } = resolveBattle(state, "G", "oder-plains", 6);

    expect(report.attackerLosses).toBe(5);
    expect(report.defenderLosses).toBe(4);
    expect(report.deathLog).toHaveLength(9);
    expect(report.deathLog.map((death) => death.side)).toEqual([
      "attacker",
      "defender",
      "attacker",
      "defender",
      "attacker",
      "defender",
      "attacker",
      "defender",
      "attacker",
    ]);
    for (const death of report.deathLog) {
      expect(death.unitTypeId).toBe("infantry");
    }
  });

  it("kills within a side from the end of the unit array, matching engine removal", () => {
    // Attacker [tank, tank, inf, inf] (A20) vs 2 infantry in the forest (D12),
    // seed 6: attacker wins with 3 losses — the infantry die before the tank.
    const state = stateWithArmies([
      army("G", "germany", "minsk", ["tank", "tank", "infantry", "infantry"]),
      army("R", "soviet", "bialowieza-forest", ["infantry", "infantry"]),
    ]);
    const { report, state: next } = resolveBattle(state, "G", "bialowieza-forest", 6);

    expect(report.attackerWins).toBe(true);
    expect(report.attackerLosses).toBe(3);
    // Engine removal order: end of the array first — inf, inf, tank.
    expect(report.deathLog.filter((death) => death.side === "attacker").map((death) => death.unitTypeId)).toEqual([
      "infantry",
      "infantry",
      "tank",
    ]);
    expect(findArmy(next, "G").units.map((unit) => unit.id)).toEqual(["u1"]); // the lead tank survives
  });

  it("carries pre-battle compositions for both sides", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["tank", "tank", "tank", "tank", "tank", "tank", "tank", "tank"]),
      army("R", "soviet", "oder-plains", ["infantry", "antiTank"]),
    ]);
    const { report } = resolveBattle(state, "G", "oder-plains", 1);
    expect(report.attackerComposition).toEqual(Array<UnitTypeId>(8).fill("tank"));
    expect(report.defenderComposition).toEqual(["infantry", "antiTank"]);
    expect(report.deathLog).toHaveLength(2); // 0 attacker + 2 defender deaths
    expect(report.deathLog.every((death) => death.side === "defender")).toBe(true);
  });
});
