import { describe, expect, it } from "vitest";

import { applyMove, armySpeed, attackFields, movementCostOf, planMove, reachableFields } from "@/lib/movement";
import { army, field, findArmy, stateWithArmies } from "@/lib/test-utils";

describe("armySpeed", () => {
  it("returns the slowest unit's movement (FR-005)", () => {
    expect(armySpeed(army("A", "germany", "berlin", ["infantry", "tank", "artillery"]))).toBe(1);
    expect(armySpeed(army("B", "germany", "berlin", ["tank", "tank"]))).toBe(2);
  });

  it("throws for an empty army", () => {
    expect(() => armySpeed(army("C", "germany", "berlin", []))).toThrow("no units");
  });
});

describe("movementCostOf", () => {
  it("charges 1 for cities and normal terrain, 2 for mountains", () => {
    expect(movementCostOf(field("berlin"))).toBe(1);
    expect(movementCostOf(field("oder-plains"))).toBe(1);
    expect(movementCostOf(field("bzura-river"))).toBe(1);
    expect(movementCostOf(field("carpathians-mountains"))).toBe(2);
  });
});

describe("reachableFields", () => {
  it("reaches exactly the 1-cost neighbors of a speed-1 army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry", "infantry"])]);
    expect([...reachableFields(state, "G").keys()].sort()).toEqual(["oder-plains", "pomerania-plains"]);
  });

  it("excludes mountains for a speed-1 army but includes them for tanks", () => {
    const infantry = stateWithArmies([army("G", "germany", "krakow", ["infantry"])]);
    expect(reachableFields(infantry, "G").has("carpathians-mountains")).toBe(false);

    const tanks = stateWithArmies([army("G", "germany", "krakow", ["tank", "tank"])]);
    expect(reachableFields(tanks, "G").has("carpathians-mountains")).toBe(true);
  });

  it("treats fields occupied by an enemy army as impassable", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["infantry"]),
      army("R", "soviet", "pomerania-plains", ["infantry"]),
    ]);
    expect(reachableFields(state, "G").has("pomerania-plains")).toBe(false);
  });

  it("drops merge targets that would exceed the 8-unit cap (FR-004)", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      army("G2", "germany", "oder-plains", ["infantry", "infantry", "infantry", "infantry", "infantry"]),
    ]);
    expect(reachableFields(state, "G1").has("oder-plains")).toBe(false);
  });

  it("passes through own armies' fields (merge targets)", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry"]),
      army("G2", "germany", "oder-plains", ["infantry"]),
    ]);
    expect(reachableFields(state, "G1").has("oder-plains")).toBe(true);
  });

  it("throws for an unknown army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => reachableFields(state, "nope")).toThrow("unknown army");
  });
});

describe("planMove", () => {
  it("returns null when the target is out of reach", () => {
    const state = stateWithArmies([army("G", "germany", "krakow", ["infantry"])]);
    expect(planMove(state, "G", "carpathians-mountains")).toBeNull();
  });
});

describe("attackFields", () => {
  it("marks an enemy-occupied adjacent field as a terminal attack target", () => {
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["infantry"]),
      army("R", "soviet", "oder-plains", ["infantry"]),
    ]);
    const targets = attackFields(state, "G");
    expect(targets.has("oder-plains")).toBe(true);
    expect(targets.get("oder-plains")).toEqual({ cost: 1, path: ["berlin", "oder-plains"] });
    expect(targets.size).toBe(1); // pomerania-plains has no enemy army
  });

  it("never paths through an enemy-occupied field", () => {
    // Speed-2 tanks in Berlin; the enemy holds Oder plains; Poznan lies beyond it.
    const state = stateWithArmies([
      army("G", "germany", "berlin", ["tank", "tank"]),
      army("R", "soviet", "oder-plains", ["infantry"]),
    ]);
    expect(attackFields(state, "G").has("oder-plains")).toBe(true);
    expect(attackFields(state, "G").has("poznan")).toBe(false); // blocked by the enemy army
  });

  it("excludes mountains beyond a speed-1 army's reach but includes them for tanks", () => {
    const infantry = stateWithArmies([
      army("G", "germany", "krakow", ["infantry"]),
      army("R", "soviet", "carpathians-mountains", ["infantry"]),
    ]);
    expect(attackFields(infantry, "G").has("carpathians-mountains")).toBe(false);

    const tanks = stateWithArmies([
      army("G", "germany", "krakow", ["tank"]),
      army("R", "soviet", "carpathians-mountains", ["infantry"]),
    ]);
    expect(attackFields(tanks, "G").get("carpathians-mountains")).toEqual({
      cost: 2,
      path: ["krakow", "carpathians-mountains"],
    });
  });

  it("returns nothing when no enemy army is on the board", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(attackFields(state, "G").size).toBe(0);
  });

  it("throws for an unknown army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => attackFields(state, "nope")).toThrow("unknown army");
  });
});

describe("applyMove", () => {
  it("moves the army, spends the path cost, and flips enemy terrain and undefended enemy cities", () => {
    // Soviet tank army standing on German Warsaw: speed 2, path warsaw -> bzura-river -> poznan.
    // Poznan is an undefended German city: entering it captures it (S-04, FR-009).
    const state = stateWithArmies([army("R", "soviet", "warsaw", ["tank", "tank"])]);
    const next = applyMove(state, "R", "poznan");

    const moved = findArmy(next, "R");
    expect(moved.fieldId).toBe("poznan");
    expect(moved.movementPoints).toBe(0); // river 1 + city 1
    expect(next.fieldOwners["bzura-river"]).toBe("soviet"); // intermediate terrain flips
    expect(next.fieldOwners.poznan).toBe("soviet"); // undefended enemy city: free capture
  });

  it("keeps same-owner fields unchanged and spends mountain cost", () => {
    const state = stateWithArmies([army("G", "germany", "krakow", ["tank"])]);
    const next = applyMove(state, "G", "carpathians-mountains");
    expect(findArmy(next, "G").movementPoints).toBe(0); // mountains cost 2
    expect(next.fieldOwners["carpathians-mountains"]).toBe("germany");
  });

  it("merges into a standing own army, keeping the standing army's id and movement", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      army("G2", "germany", "oder-plains", ["tank", "tank", "tank", "tank"]),
    ]);
    const next = applyMove(state, "G1", "oder-plains");

    expect(next.armies.length).toBe(1);
    expect(next.armies[0]?.id).toBe("G2");
    expect(next.armies[0]?.units.length).toBe(8);
    expect(next.armies[0]?.movementPoints).toBe(2); // standing army's movement wins
  });

  it("refuses a merge that would exceed the 8-unit cap (FR-004)", () => {
    const state = stateWithArmies([
      army("G1", "germany", "berlin", ["infantry", "infantry", "infantry", "infantry"]),
      army("G2", "germany", "oder-plains", ["infantry", "infantry", "infantry", "infantry", "infantry"]),
    ]);
    // The over-cap target is filtered out of the reach set, so the move reads as unreachable.
    expect(() => applyMove(state, "G1", "oder-plains")).toThrow("not reachable");
  });

  it("captures an undefended enemy city by move, cancelling its production queue (S-04)", () => {
    // Soviet infantry on the Soviet-held Bug river; German Warsaw next door is empty.
    const state = stateWithArmies([army("R", "soviet", "bug-river", ["infantry"])]);
    state.productionQueues.warsaw = [{ typeId: "infantry", remainingTurns: 1 }];

    const next = applyMove(state, "R", "warsaw");
    expect(findArmy(next, "R").fieldId).toBe("warsaw");
    expect(next.fieldOwners.warsaw).toBe("soviet");
    expect(next.productionQueues.warsaw).toBeUndefined();
  });

  it("keeps own cities' queues when passing through them", () => {
    // German army marching Berlin -> Oder plains -> Poznan, all German, queue intact.
    const state = stateWithArmies([army("G", "germany", "berlin", ["tank", "tank"])]);
    state.productionQueues.poznan = [{ typeId: "infantry", remainingTurns: 1 }];

    const next = applyMove(state, "G", "poznan");
    expect(next.fieldOwners.poznan).toBe("germany");
    expect(next.productionQueues.poznan).toEqual([{ typeId: "infantry", remainingTurns: 1 }]);
  });

  it("throws for unreachable or enemy-held targets", () => {
    const blocked = stateWithArmies([
      army("G", "germany", "berlin", ["infantry"]),
      army("R", "soviet", "oder-plains", ["infantry"]),
    ]);
    expect(() => applyMove(blocked, "G", "oder-plains")).toThrow("not reachable");

    const tooFar = stateWithArmies([army("G", "germany", "krakow", ["infantry"])]);
    expect(() => applyMove(tooFar, "G", "carpathians-mountains")).toThrow("not reachable");
  });

  it("throws for an unknown army", () => {
    const state = stateWithArmies([army("G", "germany", "berlin", ["infantry"])]);
    expect(() => applyMove(state, "nope", "oder-plains")).toThrow("unknown army");
  });
});
