import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { aiWinProbability, cityTargetValue, planAiProduction, planAiTurn } from "@/lib/ai";
import { createInitialGameState } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import type { AiAction, Army, CountryId, GameState, UnitInstance, UnitTypeId } from "@/types";

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

/** Initial game (soviet AI) with test armies and ownership overrides. */
function stateWith(armies: Army[], owners: Record<string, CountryId> = {}): GameState {
  const state = createInitialGameState("germany", "soviet");
  return { ...state, armies, fieldOwners: { ...state.fieldOwners, ...owners } };
}

const moves = (plan: AiAction[]) => plan.filter((action) => action.kind !== "order");

describe("aiWinProbability (analytic, FR-012 §27 gate)", () => {
  it("is 50% at equal strengths", () => {
    expect(aiWinProbability(20, 20)).toBeCloseTo(0.5, 10);
  });

  it("is 100% at a 1.5x advantage (the roll bands cannot cross)", () => {
    expect(aiWinProbability(30, 20)).toBe(1);
  });

  it("is 0% at a 2/3 disadvantage or worse", () => {
    expect(aiWinProbability(10, 15)).toBe(0);
    expect(aiWinProbability(5, 20)).toBe(0);
  });

  it("is 0 against a positive defense when the attack is 0 (a tie holds)", () => {
    expect(aiWinProbability(0, 5)).toBe(0);
  });

  it("matches brute-force simulation mid-band (verified 0.614 vs 0.615 sim at 21 vs 20)", () => {
    expect(aiWinProbability(21, 20)).toBeCloseTo(0.6143, 3);
    expect(aiWinProbability(23, 24)).toBeCloseTo(0.3995, 3);
    expect(aiWinProbability(23, 23)).toBeCloseTo(0.5, 3);
  });
});

describe("cityTargetValue (§25 mapping)", () => {
  it("prefers rich, close, weakly defended cities over poor, distant ones", () => {
    const state = stateWith([
      army("R1", "soviet", "bug-river", ["tank"]), // adjacent to Warsaw
      army("G1", "germany", "warsaw", ["infantry"]), // 1 defender
    ]);
    // Warsaw: income 28, distance 1, defense 5 + city 3. Poznań: income 19,
    // distance 3, undefended (an empty city still carries its defense bonus).
    const warsaw = cityTargetValue(state, "soviet", "warsaw");
    const poznan = cityTargetValue(state, "soviet", "poznan");
    expect(warsaw).toBe(28 - 2 - 8);
    expect(poznan).toBe(19 - 6 - 2); // - defenseBonus 2 with no garrison
    expect(warsaw).toBeGreaterThan(poznan);
  });

  it("adds the capital bonus; the empty city still keeps its defense bonus", () => {
    const near = stateWith([army("R1", "soviet", "oder-plains", ["tank"])], { "oder-plains": "soviet" });
    // Berlin: 62 income + 10 capital - 2*1 distance - 3 city defense bonus.
    expect(cityTargetValue(near, "soviet", "berlin")).toBe(62 + 10 - 2 - 3);
  });

  it("throws for non-city fields", () => {
    const state = stateWith([]);
    expect(() => cityTargetValue(state, "soviet", "bug-river")).toThrow("not a city");
  });
});

describe("planAiTurn — priority ladder (§26)", () => {
  it("P1: moves a reachable army to defend a threatened undefended city", () => {
    const state = stateWith([
      army("R1", "soviet", "bialowieza-forest", ["infantry", "infantry", "infantry"]),
      army("G1", "germany", "vilnius", ["infantry", "infantry", "infantry", "infantry"]), // adjacent to Minsk
    ]);
    const plan = moves(planAiTurn(state));
    expect(plan[0]).toEqual({ kind: "move", armyId: "R1", targetFieldId: "minsk" });
  });

  it("P2: an unsupplied army steps toward its nearest own city", () => {
    // Volhynia's connections (Carpathians, Lublin — German by default, Kiev
    // overridden) are all enemy-owned: the Soviet army is cut off.
    const state = stateWith([army("R1", "soviet", "volhynia-plains", ["infantry"])], { kiev: "germany" });
    const plan = moves(planAiTurn(state));
    // Kiev and Lublin both shorten the road to Brest; the lexicographic tie-break picks Kiev.
    expect(plan[0]).toEqual({ kind: "move", armyId: "R1", targetFieldId: "kiev" });
  });

  it("P3: attacks a weakly defended city when P(win) >= 60%", () => {
    const state = stateWith([
      army("R1", "soviet", "bug-river", ["tank", "tank", "tank", "tank", "tank", "tank", "tank", "tank"]),
      army("G1", "germany", "warsaw", ["infantry"]), // defense 5 + city 3 = 8 vs attack 56: P = 1
    ]);
    const plan = moves(planAiTurn(state));
    expect(plan[0]).toEqual({ kind: "attack", armyId: "R1", targetFieldId: "warsaw" });
  });

  it("P3: free-captures an undefended enemy city in reach (move, not attack)", () => {
    const state = stateWith([army("R1", "soviet", "bug-river", ["infantry"])]);
    const plan = moves(planAiTurn(state));
    expect(plan[0]).toEqual({ kind: "move", armyId: "R1", targetFieldId: "warsaw" });
  });

  it("P4: attacks an above-median-value city at 40–60% odds", () => {
    // Soviet army (6 inf + 1 artillery, attack 23) on Soviet-held Oder plains;
    // Berlin holds 4 infantry (defense 23): P = 0.5. Poznań flipped Soviet so
    // the attacker is supplied; Berlin (value 62+10-2-23=47) beats the median.
    const state = stateWith(
      [
        army("R1", "soviet", "oder-plains", [
          "infantry",
          "infantry",
          "infantry",
          "infantry",
          "infantry",
          "infantry",
          "artillery",
        ]),
        army("G1", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      ],
      { "oder-plains": "soviet", poznan: "soviet", "pomerania-plains": "soviet" },
    );
    const plan = moves(planAiTurn(state));
    expect(plan[0]).toEqual({ kind: "attack", armyId: "R1", targetFieldId: "berlin" });
  });

  it("never attacks below 40% odds — falls through to grouping instead", () => {
    const state = stateWith([
      army("R1", "soviet", "bug-river", ["tank", "tank"]),
      army("R2", "soviet", "minsk", ["infantry", "infantry"]),
      army("G1", "germany", "warsaw", Array<UnitTypeId>(8).fill("infantry")), // defense 43 vs attack 14: P = 0
    ]);
    const plan = planAiTurn(state);
    expect(plan.some((action) => action.kind === "attack")).toBe(false);
    // P6: the Minsk army steps toward the best-value objective (Berlin) — the
    // shortest road runs through Vilnius and the northern cities.
    expect(plan).toContainEqual({ kind: "move", armyId: "R2", targetFieldId: "vilnius" });
  });

  it("P5: moves onto the enemy field whose capture cuts an enemy supply line", () => {
    // A German army on German-held Volhynia is supplied only through Lublin
    // (Carpathians flipped Soviet; Kiev is Soviet by default). The Soviet tank
    // army on the Bug can take Lublin in one step; heavily-garrisoned Warsaw
    // keeps priority 3 from consuming the army first.
    const state = stateWith(
      [
        army("R1", "soviet", "bug-river", ["tank", "tank"]),
        army("G1", "germany", "volhynia-plains", ["infantry"]),
        army("G2", "germany", "warsaw", Array<UnitTypeId>(8).fill("infantry")),
      ],
      { "carpathians-mountains": "soviet", "volhynia-plains": "germany" },
    );
    const plan = moves(planAiTurn(state));
    expect(plan).toEqual([{ kind: "move", armyId: "R1", targetFieldId: "lublin-plains" }]);
  });

  it("plans at most one action per army and is fully deterministic", () => {
    const state = stateWith([
      army("R1", "soviet", "bug-river", ["tank", "tank"]),
      army("R2", "soviet", "minsk", ["infantry", "infantry"]),
      army("G1", "germany", "warsaw", Array<UnitTypeId>(4).fill("infantry")),
    ]);
    const first = planAiTurn(state);
    const second = planAiTurn(state);
    expect(first).toEqual(second);
    const armyIds = first.filter((a) => a.kind !== "order").map((a) => (a.kind === "order" ? "" : a.armyId));
    expect(new Set(armyIds).size).toBe(armyIds.length); // no army acts twice
  });
});

describe("planAiProduction (§29)", () => {
  it("follows the 40/30/20/10 rotation within the treasury", () => {
    const state = stateWith([]); // fresh game: 82 money / 42 steel / 43 recruits
    const orders = planAiProduction(state);
    // Cities sorted by id: Brest, Kiev, Minsk — infantry (20 money) fills the
    // first four rotation slots; the fifth slot is a tank the AI cannot afford.
    expect(orders).toEqual([
      { kind: "order", fieldId: "brest", unitTypeId: "infantry" },
      { kind: "order", fieldId: "kiev", unitTypeId: "infantry" },
      { kind: "order", fieldId: "kiev", unitTypeId: "infantry" },
      { kind: "order", fieldId: "minsk", unitTypeId: "infantry" },
    ]);
  });

  it("shifts toward infantry after losing cities", () => {
    const state = stateWith([], { kiev: "germany" }); // one city lost
    const orders = planAiProduction(state);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((order) => order.unitTypeId === "infantry")).toBe(true); // 60% infantry bands
  });

  it("shifts toward tanks on a resource advantage", () => {
    const base = stateWith([]);
    const rich: GameState = {
      ...base,
      resources: { ...base.resources, soviet: { money: 500, steel: 200, recruits: 200 } },
    };
    const orders = planAiProduction(rich);
    expect(orders.some((order) => order.unitTypeId === "tank")).toBe(true);
    expect(orders.filter((order) => order.unitTypeId === "tank").length).toBeGreaterThanOrEqual(4); // 50% tank bands
  });

  it("orders nothing when the treasury is empty", () => {
    const base = stateWith([]);
    const broke: GameState = {
      ...base,
      resources: { germany: base.resources.germany, soviet: { money: 0, steel: 0, recruits: 0 } },
    };
    expect(planAiProduction(broke)).toEqual([]);
  });
});

describe("map sanity for the scenarios", () => {
  it("uses real adjacency (guards the golden setups against data drift)", () => {
    const byId = new Map(MAP_FIELDS.map((field) => [field.id, field]));
    expect((byId.get("vilnius") ?? failWith("missing")).connections).toContain("minsk");
    expect((byId.get("bialowieza-forest") ?? failWith("missing")).connections).toContain("minsk");
    expect((byId.get("kiev") ?? failWith("missing")).connections).toContain("volhynia-plains");
    expect((byId.get("kiev") ?? failWith("missing")).connections).toContain("polesie-forest");
    expect((byId.get("bug-river") ?? failWith("missing")).connections).toContain("warsaw");
  });
});
