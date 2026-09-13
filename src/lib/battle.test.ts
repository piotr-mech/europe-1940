import { describe, expect, it } from "vitest";

import { UNIT_TYPES } from "@/data/units";
import { attackerStrength, defenderStrength, resolveBattle, rngStep, ROLL_SPREAD } from "@/lib/battle";
import { gameReducer } from "@/lib/game-state";
import { attackFields } from "@/lib/movement";
import { collectIncome } from "@/lib/production";
import { army, drainAiTurn, failWith, field, findArmy, hasArmy, stateWithArmies } from "@/lib/test-utils";
import type { Army, GameState, UnitTypeId } from "@/types";

const UNIT_BY_ID = new Map(UNIT_TYPES.map((unitType) => [unitType.id, unitType]));

const infantry = (count: number): UnitTypeId[] => Array<UnitTypeId>(count).fill("infantry");
const tanks = (count: number): UnitTypeId[] => Array<UnitTypeId>(count).fill("tank");

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

  it("clamps a penalty-driven strength at 0 — boundary stays arithmetic-consistent (review F4)", () => {
    // Min attack (infantry 3) meets max penalty (river 3): exactly 0, no
    // balancing entry needed — base 3 − penalty 3 already sums to the total.
    const boundary = attackerStrength(army("G", "germany", "poznan", ["infantry"]), field("bzura-river"));
    expect(boundary.total).toBe(0);
    expect(boundary.modifiers).toEqual([{ label: "Atak przez rzekę", amount: -3 }]);
    // Below-zero totals (impossible with current data, defensive) would gain
    // a balancing "Siła nie spada poniżej 0" entry so the report still adds up.
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
    // Both sides on own soil across the border (Lublin -> Volhynia), plains:
    // no modifiers, both supplied — the pure strength comparison.
    const state = stateWithArmies([
      army("G", "germany", "lublin-plains", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "volhynia-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "volhynia-plains", 6);

    expect(report.attackStrength).toBe(18); // 6 x A3
    expect(report.defenseStrength).toBe(20); // 4 x D5, plains: no bonus
    expect(report.attackerWins).toBe(true);
    expect(report.attackerLosses).toBe(5); // heavy price for the upset
    expect(findArmy(next, "G").units.length).toBe(1);
    expect(hasArmy(next, "R")).toBe(false);
  });

  it("clamps winner losses so the winner always survives with >= 1 unit (seed 6)", () => {
    // 2 tanks (A14) vs 2 infantry in the forest (D12): unclamped cap = 2, clamp = 1.
    // Both on own soil: Koenigsberg (German city) and Mazury forest (German,
    // supplied for the Soviet defender via Niemen -> Vilnius).
    const state = stateWithArmies([
      army("G", "germany", "koenigsberg", ["tank", "tank"]),
      army("R", "soviet", "mazury-forest", ["infantry", "infantry"]),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "mazury-forest", 6);

    expect(report.attackerWins).toBe(true);
    expect(report.attackerLosses).toBe(1); // the clamp, not the raw cap of 2
    expect(findArmy(next, "G").units.length).toBe(1);
  });

  it("removes losses from the end of the unit array", () => {
    const state = stateWithArmies([
      army("G", "germany", "lublin-plains", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "volhynia-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { state: next } = resolveBattle(state, "G", "volhynia-plains", 6);
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

  it("defends with every army on the field; losses land on the last defender, clamped (review F6)", () => {
    // Two defender armies (2 + 2 units, D 20 + Brest 3 = 23) vs 4 attacking
    // infantry (A12): the defense always holds. Seed 6 draws a raw loss of 3,
    // but only the last defender absorbs losses and keeps >= 1 unit.
    const state = stateWithArmies([
      army("G", "germany", "bug-river", Array<UnitTypeId>(4).fill("infantry")),
      army("R1", "soviet", "brest", ["infantry", "infantry"]),
      army("R2", "soviet", "brest", ["infantry", "infantry"]),
    ]);
    const { state: next, report } = resolveBattle(state, "G", "brest", 6);

    expect(report.defenderArmyIds).toEqual(["R1", "R2"]);
    expect(report.defenseStrength).toBe(23);
    expect(report.attackerWins).toBe(false);
    expect(hasArmy(next, "G")).toBe(false);
    expect(findArmy(next, "R1").units.length).toBe(2); // first defender untouched
    expect(findArmy(next, "R2").units.length).toBe(1); // last defender: raw draw 3 clamped to 1
    expect(report.defenderLosses).toBe(1); // the applied (clamped) count, not the raw draw
  });

  it("flips the marched path on an attacker victory — one ownership rule with moves (review F1)", () => {
    // German tanks in Warsaw (speed 2) attack Soviet infantry in Brest through
    // the Bug river: warsaw -> bug-river -> brest.
    const winning = stateWithArmies([
      army("G", "germany", "warsaw", ["tank", "tank", "tank", "tank"]),
      army("R", "soviet", "brest", ["infantry"]),
    ]);
    const { state: next, report } = resolveBattle(winning, "G", "brest", 1);
    expect(report.attackerWins).toBe(true);
    expect(next.fieldOwners["bug-river"]).toBe("germany"); // marched through: flips
    expect(next.fieldOwners.brest).toBe("germany"); // fought over: captured

    // A defender victory flips nothing — the attacker died on the way.
    const losing = stateWithArmies([
      army("G", "germany", "warsaw", ["tank", "tank"]),
      army("R", "soviet", "brest", Array<UnitTypeId>(8).fill("infantry")),
    ]);
    const defended = resolveBattle(losing, "G", "brest", 1);
    expect(defended.report.attackerWins).toBe(false);
    expect(defended.state.fieldOwners["bug-river"]).toBe("soviet");
    expect(defended.state.fieldOwners.brest).toBe("soviet");
  });

  it("captures a city: owner flips, queue cancelled, income flows to the winner next turn (FR-009)", () => {
    // German tanks march Warsaw -> Bug river -> Brest (speed 2).
    const before = stateWithArmies([
      army("G", "germany", "warsaw", ["tank", "tank", "tank", "tank", "tank", "tank", "tank", "tank"]),
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

    // And the staged endTurn composes cleanly over a captured state: plan,
    // drain every aiStep, and the turn rolls over.
    const planned = gameReducer(captured, { type: "endTurn" });
    if (planned === null) throw new Error("planned state is null");
    expect(drainAiTurn(planned).turn).toBe(captured.turn + 1);
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

describe("supply penalties in battle (FR-011, S-05)", () => {
  it("subtracts round(25%) from an unsupplied attacker as an integer modifier", () => {
    // 6 infantry: A18, penalty round(4.5) = 5 -> 13.
    const result = attackerStrength(
      army("G", "germany", "berlin", Array<UnitTypeId>(6).fill("infantry")),
      field("oder-plains"),
      true,
    );
    expect(result.total).toBe(13);
    expect(result.modifiers).toEqual([{ label: "Brak zaopatrzenia", amount: -5 }]);
  });

  it("rounds the half-up boundary (14 -> -4 -> 10)", () => {
    const result = attackerStrength(army("G", "germany", "berlin", ["tank", "tank"]), field("oder-plains"), true);
    expect(result.total).toBe(10);
    expect(result.modifiers).toEqual([{ label: "Brak zaopatrzenia", amount: -4 }]);
  });

  it("subtracts round(25%) per unsupplied defender army", () => {
    // Two defenders of 2 infantry each (D10): only R2 cut off, penalty
    // round(2.5) = 3 -> total 10 + 7 = 17.
    const result = defenderStrength(
      [
        army("R1", "soviet", "oder-plains", ["infantry", "infantry"]),
        army("R2", "soviet", "oder-plains", ["infantry", "infantry"]),
      ],
      field("oder-plains"),
      new Set(["R2"]),
    );
    expect(result.total).toBe(17);
    expect(result.modifiers).toEqual([{ label: "Brak zaopatrzenia", amount: -3 }]);
  });

  it("resolveBattle derives supply from live ownership for both sides", () => {
    // German tank army on Oder plains is walled off (Berlin, Poznań, Pomerania
    // Soviet-held): A56 -> -14 -> 42. The defender stands on Soviet Berlin,
    // an own city: supplied, D5 + city 3 = 8.
    const base = stateWithArmies([
      army("G", "germany", "oder-plains", Array<UnitTypeId>(8).fill("tank")),
      army("R", "soviet", "berlin", ["infantry"]),
    ]);
    const state = {
      ...base,
      fieldOwners: {
        ...base.fieldOwners,
        berlin: "soviet" as const,
        poznan: "soviet" as const,
        "pomerania-plains": "soviet" as const,
      },
    };
    const { report } = resolveBattle(state, "G", "berlin", 1);

    expect(report.attackStrength).toBe(42);
    expect(report.defenseStrength).toBe(8);
    expect(report.attackModifiers).toEqual([{ label: "Brak zaopatrzenia", amount: -14 }]);
    // The defender stands on its own city: supplied — only the city bonus shows.
    expect(report.defenseModifiers).toEqual([{ label: "Berlin (miasto)", amount: 3 }]);
  });

  it("keeps the supplied path unchanged (live-game regression)", () => {
    const state = stateWithArmies([
      army("G", "germany", "lublin-plains", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "volhynia-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const { report } = resolveBattle(state, "G", "volhynia-plains", 6);
    expect(report.attackModifiers).toEqual([]);
    expect(report.defenseModifiers).toEqual([]);
    expect(report.attackStrength).toBe(18); // the S-04 upset scenario, unchanged
  });

  it("applies both sides' supply penalties in one battle (plan promise, review F7)", () => {
    // German infantry holds Volhynia (German-owned) walled off by Soviet
    // fields; Soviet infantry holds Lublin walled off by German fields —
    // both sides cut off: A18 - 5 vs D20 - 5.
    const base = stateWithArmies([
      army("G", "germany", "volhynia-plains", Array<UnitTypeId>(6).fill("infantry")),
      army("R", "soviet", "lublin-plains", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const state = {
      ...base,
      fieldOwners: {
        ...base.fieldOwners,
        "volhynia-plains": "germany" as const,
        "lublin-plains": "soviet" as const,
        "carpathians-mountains": "soviet" as const,
        kiev: "soviet" as const,
        "bug-river": "germany" as const, // else Lublin reaches Soviet Brest via the Bug
      },
    };
    const { report } = resolveBattle(state, "G", "lublin-plains", 1);

    expect(report.attackStrength).toBe(13); // 18 - round(4.5)
    expect(report.defenseStrength).toBe(15); // 20 - round(5)
    expect(report.attackModifiers).toEqual([{ label: "Brak zaopatrzenia", amount: -5 }]);
    expect(report.defenseModifiers).toEqual([{ label: "Brak zaopatrzenia", amount: -5 }]);
  });
});

describe("resolveBattle invariant sweep (G5/G6, seeds 0–99)", () => {
  const SEEDS = Array.from({ length: 100 }, (_, seed) => seed);

  interface Matchup {
    label: string;
    armyId: string;
    targetFieldId: string;
    state: () => GameState;
  }

  // Matrix across the strength plane and every modifier family: weaker/equal/
  // stronger attackers, open ground, river crossing, unsupplied attacker,
  // city defense, and a multi-defender city.
  const matchups: Matchup[] = [
    {
      label: "weaker attacker, open plains (A18 vs D20)",
      armyId: "G",
      targetFieldId: "volhynia-plains",
      state: () =>
        stateWithArmies([
          army("G", "germany", "lublin-plains", infantry(6)),
          army("R", "soviet", "volhynia-plains", infantry(4)),
        ]),
    },
    {
      label: "equal strengths, open plains (A15 vs D15)",
      armyId: "G",
      targetFieldId: "oder-plains",
      state: () =>
        stateWithArmies([army("G", "germany", "berlin", infantry(5)), army("R", "soviet", "oder-plains", infantry(3))]),
    },
    {
      label: "stronger attacker, open plains (A56 vs D5)",
      armyId: "G",
      targetFieldId: "oder-plains",
      state: () =>
        stateWithArmies([army("G", "germany", "berlin", tanks(8)), army("R", "soviet", "oder-plains", infantry(1))]),
    },
    {
      label: "weaker attacker across a river (A9 vs D10)",
      armyId: "G",
      targetFieldId: "bzura-river",
      state: () =>
        stateWithArmies([army("G", "germany", "poznan", infantry(4)), army("R", "soviet", "bzura-river", infantry(2))]),
    },
    {
      label: "unsupplied attacker walled off by enemy fields (A42 vs D8)",
      armyId: "G",
      targetFieldId: "berlin",
      state: () => {
        const base = stateWithArmies([
          army("G", "germany", "oder-plains", tanks(8)),
          army("R", "soviet", "berlin", infantry(1)),
        ]);
        return {
          ...base,
          fieldOwners: {
            ...base.fieldOwners,
            berlin: "soviet" as const,
            poznan: "soviet" as const,
            "pomerania-plains": "soviet" as const,
          },
        };
      },
    },
    {
      label: "weaker attacker vs a multi-defender city (A12 vs D23)",
      armyId: "G",
      targetFieldId: "brest",
      state: () =>
        stateWithArmies([
          army("G", "germany", "bug-river", infantry(4)),
          army("R1", "soviet", "brest", infantry(2)),
          army("R2", "soviet", "brest", infantry(2)),
        ]),
    },
  ];

  const attackOf = (typeIds: UnitTypeId[]): number =>
    typeIds.reduce((sum, typeId) => sum + (UNIT_BY_ID.get(typeId) ?? failWith(`unknown unit "${typeId}"`)).attack, 0);
  const defenseOf = (typeIds: UnitTypeId[]): number =>
    typeIds.reduce((sum, typeId) => sum + (UNIT_BY_ID.get(typeId) ?? failWith(`unknown unit "${typeId}"`)).defense, 0);
  const sumModifiers = (modifiers: { amount: number }[]): number =>
    modifiers.reduce((sum, modifier) => sum + modifier.amount, 0);

  /** Every structural invariant one resolution must satisfy, with a named, seed-cited failure message. */
  function assertInvariants(matchup: Matchup, seed: number): void {
    const base = matchup.state();
    const { state: next, report, nextSeed } = resolveBattle(base, matchup.armyId, matchup.targetFieldId, seed);
    const where = `${matchup.label}, seed ${seed}`;
    const defenderIds = report.defenderArmyIds;
    const attackerBefore = findArmy(base, matchup.armyId);
    const defendersBefore = base.armies.filter((candidate) => defenderIds.includes(candidate.id));
    const defenderUnitsBefore = defendersBefore.reduce((sum, defender) => sum + defender.units.length, 0);

    // The winner survives with >= 1 unit; the loser is destroyed entirely (FR-008).
    if (report.attackerWins) {
      expect(findArmy(next, matchup.armyId).units.length, `${where}: winner survival`).toBeGreaterThanOrEqual(1);
      for (const id of defenderIds) {
        expect(hasArmy(next, id), `${where}: loser army "${id}" fully removed`).toBe(false);
      }
      expect(report.defenderLosses, `${where}: loser losses are total`).toBe(defenderUnitsBefore);
      expect(report.attackerLosses, `${where}: winner losses within the survival clamp`).toBeLessThanOrEqual(
        attackerBefore.units.length - 1,
      );
    } else {
      expect(hasArmy(next, matchup.armyId), `${where}: loser attacker fully removed`).toBe(false);
      expect(report.attackerLosses, `${where}: loser losses are total`).toBe(attackerBefore.units.length);
      expect(report.defenderLosses, `${where}: winner losses within the survival clamp`).toBeLessThanOrEqual(
        defenderUnitsBefore - 1,
      );
    }
    expect(report.attackerLosses, `${where}: losses never negative`).toBeGreaterThanOrEqual(0);
    expect(report.defenderLosses, `${where}: losses never negative`).toBeGreaterThanOrEqual(0);

    // No empty or corrupted armies remain anywhere on the board.
    for (const surviving of next.armies) {
      expect(surviving.units.length, `${where}: army "${surviving.id}" keeps >= 1 unit`).toBeGreaterThanOrEqual(1);
    }

    // Exactly one owner per field (G6): every owner stays a valid country, and
    // the fought-over field follows the ownership rule — the attacker's on a
    // win, unchanged after a successful defense.
    for (const owner of Object.values(next.fieldOwners)) {
      expect(["germany", "soviet"], `${where}: owners are valid countries`).toContain(owner);
    }
    expect(next.fieldOwners[matchup.targetFieldId], `${where}: target ownership rule`).toBe(
      report.attackerWins ? attackerBefore.owner : base.fieldOwners[matchup.targetFieldId],
    );

    // Report arithmetic adds up (NFR: no unexplainable outcomes): the
    // composition's base stats plus the signed modifiers equal each side's
    // reported strength, on both sides.
    expect(
      attackOf(report.attackerComposition) + sumModifiers(report.attackModifiers),
      `${where}: attack arithmetic`,
    ).toBe(report.attackStrength);
    expect(
      defenseOf(report.defenderComposition) + sumModifiers(report.defenseModifiers),
      `${where}: defense arithmetic`,
    ).toBe(report.defenseStrength);
    expect(report.attackStrength, `${where}: strength never negative`).toBeGreaterThanOrEqual(0);
    expect(report.defenseStrength, `${where}: strength never negative`).toBeGreaterThanOrEqual(0);

    // The staged deaths match the applied losses.
    expect(report.deathLog.length, `${where}: deathLog covers exactly the losses`).toBe(
      report.attackerLosses + report.defenderLosses,
    );

    // Roll contract: both multipliers stay within ±20% of the pre-roll
    // strength, the higher rolled total wins (a tie holds for the defender),
    // and one battle advances the seed by exactly three draws.
    const rollA = rngStep(seed);
    const rollB = rngStep(rollA.nextSeed);
    const attackRoll = report.attackStrength * (1 - ROLL_SPREAD + rollA.value * 2 * ROLL_SPREAD);
    const defenseRoll = report.defenseStrength * (1 - ROLL_SPREAD + rollB.value * 2 * ROLL_SPREAD);
    expect(report.attackerWins, `${where}: outcome follows the seeded rolls`).toBe(attackRoll > defenseRoll);
    expect(nextSeed, `${where}: seed advanced by exactly three draws`).toBe(rngStep(rollB.nextSeed).nextSeed);
  }

  for (const matchup of matchups) {
    it(`holds every structural invariant across seeds 0–99: ${matchup.label}`, () => {
      for (const seed of SEEDS) {
        assertInvariants(matchup, seed);
      }
    });
  }
});

describe("defensive branches and edge rules (G7)", () => {
  it("a 0-strength attacker vs a 0-strength defender resolves defender-wins (tie rule)", () => {
    // Degenerate by design (the engine never fields an empty army — armySpeed
    // throws): an empty defender army is the only constructible 0 defense, and
    // a lone anti-tank gun (A3) crossing a river (−3) the only 0 attack.
    const emptyDefender: Army = { id: "R", owner: "soviet", fieldId: "bzura-river", units: [], movementPoints: 0 };
    const state = stateWithArmies([army("G", "germany", "poznan", ["antiTank"]), emptyDefender]);

    const { state: next, report } = resolveBattle(state, "G", "bzura-river", 1);

    expect(report.attackStrength).toBe(0);
    expect(report.defenseStrength).toBe(0);
    expect(report.attackerWins).toBe(false); // 0 vs 0 is a tie — a tie holds for the defender
    expect(hasArmy(next, "G")).toBe(false);
    expect(hasArmy(next, "R")).toBe(true);
  });

  it("a multi-hop attack free-captures an ungarrisoned enemy city on its path and cancels that city's queue", () => {
    // Soviet tanks (speed 2) march Lublin -> Warsaw (undefended German city)
    // -> Bzura river (defended by Germany): the intermediate city flips for
    // free with its queue cancelled, exactly like a walk-in capture.
    const base = stateWithArmies([
      army("R", "soviet", "lublin-plains", tanks(8)),
      army("G", "germany", "bzura-river", infantry(4)),
    ]);
    base.productionQueues.warsaw = [{ typeId: "infantry", remainingTurns: 1 }];

    const { state: next, report } = resolveBattle(base, "R", "bzura-river", 1);

    expect(report.attackerWins).toBe(true); // A56 vs D20: the roll bands cannot cross
    expect(next.fieldOwners.warsaw).toBe("soviet"); // free capture of the path city
    expect(next.productionQueues.warsaw).toBeUndefined(); // its queue is cancelled (FR-009)
    expect(next.fieldOwners["bzura-river"]).toBe("soviet"); // the fought-over field flips
    expect(hasArmy(next, "G")).toBe(false);
  });

  it("uses real adjacency for the sweep and branch layouts (guards against data drift)", () => {
    expect(field("lublin-plains").connections).toContain("warsaw");
    expect(field("warsaw").connections).toContain("bzura-river");
    expect(field("poznan").connections).toContain("bzura-river");
  });
});
