import { describe, expect, it } from "vitest";

import { MAP_FIELDS } from "@/data/map";
import { createInitialGameState } from "@/lib/game-state";
import { armySpeed } from "@/lib/movement";
import {
  advanceProduction,
  applyProductionOrder,
  collectIncome,
  freeProductionSlots,
  unitCostFor,
} from "@/lib/production";
import type { Army, CountryId, GameState, ProductionOrder, ResourceBag, UnitTypeId } from "@/types";

function bag(money: number, steel: number, recruits: number): ResourceBag {
  return { money, steel, recruits };
}

function order(typeId: UnitTypeId, remainingTurns: number): ProductionOrder {
  return { typeId, remainingTurns };
}

function army(id: string, owner: CountryId, fieldId: string, typeIds: UnitTypeId[]): Army {
  const units = typeIds.map((typeId, index) => ({ id: `${id}-u${index + 1}`, typeId }));
  const base: Army = { id, owner, fieldId, units, movementPoints: 0 };
  return { ...base, movementPoints: armySpeed(base) };
}

interface StateOptions {
  resources?: Record<CountryId, ResourceBag>;
  productionQueues?: Record<string, ProductionOrder[]>;
  armies?: Army[];
}

/** Initial game with the economy/armies replaced by the test setup. */
function stateWith(options: StateOptions = {}): GameState {
  const state = createInitialGameState("germany", "soviet");
  return {
    ...state,
    resources: options.resources ?? state.resources,
    productionQueues: options.productionQueues ?? {},
    armies: options.armies ?? state.armies,
  };
}

/** Germany starts with 6 owned cities, the USSR with 6 (dataset initialOwner). */
function initialIncome(owner: CountryId): ResourceBag {
  const sum = bag(0, 0, 0);
  for (const field of MAP_FIELDS) {
    if (field.city !== null && field.initialOwner === owner) {
      sum.money += field.city.income.money;
      sum.steel += field.city.income.steel;
      sum.recruits += field.city.income.recruits;
    }
  }
  return sum;
}

describe("unitCostFor", () => {
  it("returns the spec cost for Germany", () => {
    expect(unitCostFor("germany", "infantry")).toEqual(bag(20, 0, 5));
    expect(unitCostFor("germany", "tank")).toEqual(bag(50, 20, 10));
  });

  it("applies the USSR Rezerwy bonus to infantry only (−2 recruits)", () => {
    expect(unitCostFor("soviet", "infantry")).toEqual(bag(20, 0, 3));
    expect(unitCostFor("soviet", "tank")).toEqual(bag(50, 20, 10));
    expect(unitCostFor("soviet", "artillery")).toEqual(bag(30, 15, 5));
    expect(unitCostFor("soviet", "antiTank")).toEqual(bag(25, 10, 5));
  });

  it("returns a copy — mutating it never touches UNIT_TYPES", () => {
    const cost = unitCostFor("germany", "infantry");
    cost.recruits = 999;
    expect(unitCostFor("germany", "infantry").recruits).toBe(5);
  });
});

describe("collectIncome", () => {
  it("adds each country's owned-city income to its treasury (FR-002)", () => {
    const state = stateWith({ resources: { germany: bag(10, 0, 0), soviet: bag(0, 5, 0) } });
    const next = collectIncome(state);

    const germanIncome = initialIncome("germany");
    const sovietIncome = initialIncome("soviet");
    expect(next.resources.germany).toEqual(bag(10 + germanIncome.money, germanIncome.steel, germanIncome.recruits));
    expect(next.resources.soviet).toEqual(bag(sovietIncome.money, 5 + sovietIncome.steel, sovietIncome.recruits));
  });

  it("counts only owned cities after ownership drifts from the dataset", () => {
    const state = stateWith();
    const flipped = { ...state, fieldOwners: { ...state.fieldOwners, moscow: "germany" } };
    const next = collectIncome(flipped);

    const germanIncome = initialIncome("germany");
    const moscow = MAP_FIELDS.find((field) => field.id === "moscow")?.city;
    expect(moscow).toBeDefined();
    expect(next.resources.germany.money).toBe(germanIncome.money + (moscow?.income.money ?? 0));
    // The USSR lost Moscow's income entirely.
    expect(next.resources.soviet.money).toBe(initialIncome("soviet").money - (moscow?.income.money ?? 0));
  });

  it("does not mutate the input state", () => {
    const state = stateWith();
    collectIncome(state);
    expect(state.resources.germany).toEqual(bag(0, 0, 0));
  });
});

describe("freeProductionSlots", () => {
  it("reports the city's productionSlots minus queued builds", () => {
    const state = stateWith({ productionQueues: { berlin: [order("infantry", 1)] } });
    expect(freeProductionSlots(state, "berlin")).toBe(2); // 3 slots, 1 queued
  });

  it("is 0 for non-city fields and full queues", () => {
    expect(freeProductionSlots(stateWith(), "oder-plains")).toBe(0);
    const full = stateWith({ productionQueues: { poznan: [order("infantry", 1)] } }); // Poznań: 1 slot
    expect(freeProductionSlots(full, "poznan")).toBe(0);
  });

  it("throws for an unknown field", () => {
    expect(() => freeProductionSlots(stateWith(), "atlantis")).toThrow("unknown field");
  });
});

describe("applyProductionOrder", () => {
  it("deducts the cost upfront and queues the build with its build time", () => {
    const state = stateWith({ resources: { germany: bag(100, 50, 50), soviet: bag(0, 0, 0) } });
    const next = applyProductionOrder(state, "germany", "berlin", "tank"); // buildTime 2

    expect(next.resources.germany).toEqual(bag(50, 30, 40));
    expect(next.productionQueues.berlin).toEqual([order("tank", 2)]);
  });

  it("applies the Rezerwy discount when the USSR orders infantry", () => {
    const state = stateWith({ resources: { germany: bag(0, 0, 0), soviet: bag(20, 0, 3) } });
    const next = applyProductionOrder(state, "soviet", "moscow", "infantry");

    expect(next.resources.soviet).toEqual(bag(0, 0, 0));
    expect(next.productionQueues.moscow).toEqual([order("infantry", 1)]);
  });

  it("appends in queue order up to the slot limit", () => {
    let state = stateWith({ resources: { germany: bag(200, 50, 50), soviet: bag(0, 0, 0) } });
    state = applyProductionOrder(state, "germany", "berlin", "infantry");
    state = applyProductionOrder(state, "germany", "berlin", "antiTank");
    expect(state.productionQueues.berlin).toEqual([order("infantry", 1), order("antiTank", 1)]);
  });

  it("throws for a non-city field", () => {
    const state = stateWith({ resources: { germany: bag(100, 50, 50), soviet: bag(0, 0, 0) } });
    expect(() => applyProductionOrder(state, "germany", "oder-plains", "infantry")).toThrow("not a city");
  });

  it("throws when the country does not own the city", () => {
    const state = stateWith({ resources: { germany: bag(100, 50, 50), soviet: bag(0, 0, 0) } });
    expect(() => applyProductionOrder(state, "germany", "moscow", "infantry")).toThrow("not owned");
  });

  it("throws when no production slot is free", () => {
    let state = stateWith({ resources: { germany: bag(200, 50, 50), soviet: bag(0, 0, 0) } });
    state = applyProductionOrder(state, "germany", "poznan", "infantry"); // Poznań: 1 slot
    expect(() => applyProductionOrder(state, "germany", "poznan", "infantry")).toThrow("no free production slot");
  });

  it("throws naming the first short resource", () => {
    const poor = stateWith({ resources: { germany: bag(100, 0, 0), soviet: bag(0, 0, 0) } });
    expect(() => applyProductionOrder(poor, "germany", "berlin", "tank")).toThrow("steel");

    const noRecruits = stateWith({ resources: { germany: bag(100, 50, 0), soviet: bag(0, 0, 0) } });
    expect(() => applyProductionOrder(noRecruits, "germany", "berlin", "tank")).toThrow("recruits");

    const noMoney = stateWith({ resources: { germany: bag(0, 50, 50), soviet: bag(0, 0, 0) } });
    expect(() => applyProductionOrder(noMoney, "germany", "berlin", "tank")).toThrow("money");
  });
});

describe("advanceProduction", () => {
  it("completes a buildTime-1 order into an army standing in the city", () => {
    const g1 = army("G1", "germany", "berlin", ["infantry"]);
    const state = stateWith({
      productionQueues: { berlin: [order("infantry", 1)] },
      armies: [g1, ...stateWith().armies.filter((candidate) => candidate.id !== "G1")],
    });
    const next = advanceProduction(state);

    expect(next.productionQueues.berlin).toBeUndefined(); // emptied queues drop out
    const host = next.armies.find((candidate) => candidate.id === "G1");
    expect(host?.units.length).toBe(2);
    expect(host?.units.at(-1)?.typeId).toBe("infantry");
  });

  it("decrements a buildTime-2 order without spawning on the first tick", () => {
    const state = stateWith({
      productionQueues: { berlin: [order("tank", 2)] },
      armies: [army("G1", "germany", "berlin", ["tank"])],
    });
    const first = advanceProduction(state);

    expect(first.productionQueues.berlin).toEqual([order("tank", 1)]);
    expect(first.armies.find((candidate) => candidate.id === "G1")?.units.length).toBe(1);

    const second = advanceProduction(first);
    expect(second.productionQueues.berlin).toBeUndefined();
    expect(second.armies.find((candidate) => candidate.id === "G1")?.units.length).toBe(2);
  });

  it("forms a new army when no army of the owner stands in the city", () => {
    const state = stateWith({
      productionQueues: { krakow: [order("tank", 1)] },
      armies: [army("G1", "germany", "berlin", ["infantry"])], // nothing in Kraków
    });
    const next = advanceProduction(state);

    expect(next.armies.length).toBe(2);
    const spawned = next.armies.find((candidate) => candidate.fieldId === "krakow");
    expect(spawned?.owner).toBe("germany");
    expect(spawned?.units).toEqual([expect.objectContaining({ typeId: "tank" })]);
    expect(spawned?.movementPoints).toBe(2); // single tank: armySpeed
  });

  it("respects the 8-unit cap mid-batch: overflow forms a new army", () => {
    const units = Array.from({ length: 7 }, (_, index) => ({
      id: `G1-u${index + 1}`,
      typeId: "infantry" as const,
    }));
    const nearlyFull: Army = { id: "G1", owner: "germany", fieldId: "berlin", units, movementPoints: 1 };
    const state = stateWith({
      productionQueues: { berlin: [order("infantry", 1), order("antiTank", 1)] },
      armies: [nearlyFull],
    });
    const next = advanceProduction(state);

    const host = next.armies.find((candidate) => candidate.id === "G1");
    expect(host?.units.length).toBe(8); // first completion fills the army
    expect(host?.units.at(-1)?.typeId).toBe("infantry");

    const overflow = next.armies.find((candidate) => candidate.id !== "G1");
    expect(overflow?.fieldId).toBe("berlin"); // second completion forms a new army
    expect(overflow?.units.map((unit) => unit.typeId)).toEqual(["antiTank"]);
  });

  it("gives a full enemy army no claim on the completing city", () => {
    const state = stateWith({
      productionQueues: { moscow: [order("infantry", 1)] },
      armies: [army("G1", "germany", "moscow", ["infantry"])], // German army besieging Moscow
    });
    const next = advanceProduction(state);

    const host = next.armies.find((candidate) => candidate.id === "G1");
    expect(host?.units.length).toBe(1); // not the owner — no merge
    const spawned = next.armies.find((candidate) => candidate.owner === "soviet");
    expect(spawned?.fieldId).toBe("moscow");
  });

  it("leaves other cities' queues untouched", () => {
    const state = stateWith({
      productionQueues: { berlin: [order("tank", 2)], moscow: [order("infantry", 1)] },
      armies: [army("R1", "soviet", "moscow", ["infantry"])],
    });
    const next = advanceProduction(state);

    expect(next.productionQueues.berlin).toEqual([order("tank", 1)]);
    expect(next.armies.find((candidate) => candidate.id === "R1")?.units.length).toBe(2);
  });

  it("is a no-op for a state without queues", () => {
    const state = stateWith();
    expect(advanceProduction(state)).toEqual(state);
  });

  it("funnels a same-turn batch into one deterministic new army", () => {
    const state = stateWith({
      productionQueues: { krakow: [order("infantry", 1), order("tank", 1), order("artillery", 1)] },
      armies: [],
    });
    const next = advanceProduction(state);

    // Batch applies one by one: the first completion forms krakow-1-1, the
    // rest join it while it has room — one army, three units, queue order kept.
    expect(next.armies.map((candidate) => candidate.id)).toEqual(["krakow-1-1"]);
    const spawned = next.armies[0];
    expect(spawned.units.map((unit) => unit.typeId)).toEqual(["infantry", "tank", "artillery"]);
    expect(new Set(spawned.units.map((unit) => unit.id)).size).toBe(3);
  });
});
