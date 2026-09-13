import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";

import {
  BASELINE_GRID,
  BASELINE_REPORT_PATH,
  renderBaselineReport,
  runCampaign,
  runGrid,
} from "@/lib/balance-simulation";
import type { CampaignRecord, CampaignInput } from "@/lib/balance-simulation";
import type { CountryId } from "@/types";

const ROLES: readonly CountryId[] = ["germany", "soviet"];

function run(input: CampaignInput): CampaignRecord {
  return runCampaign(input);
}

describe("runCampaign (harness self-tests, test-plan Phase 2)", () => {
  it("is deterministic per seed and role assignment (seeds 1, 7)", () => {
    for (const seed of [1, 7]) {
      for (const playerCountryId of ROLES) {
        expect(run({ seed, playerCountryId, maxTurns: 40 })).toEqual(run({ seed, playerCountryId, maxTurns: 40 }));
      }
    }
  });

  it("every campaign terminates with a classifiable outcome (seeds 0–4 × both roles)", () => {
    for (const seed of [0, 1, 2, 3, 4]) {
      for (const playerCountryId of ROLES) {
        const record = run({ seed, playerCountryId, maxTurns: 60 });
        // Winner, or the turn cap hit — the harness's own stalemate category.
        expect(
          record.winner !== null || record.endTurn === 60,
          `seed ${seed}, ${playerCountryId} first: winner or cap`,
        ).toBe(true);
        if (record.winner !== null) {
          expect(ROLES, `seed ${seed}, ${playerCountryId} first: winner is a country`).toContain(record.winner);
        }
        expect(record.endTurn, `seed ${seed}, ${playerCountryId} first: at least one turn ran`).toBeGreaterThanOrEqual(
          1,
        );
      }
    }
  });

  it("keeps its metrics internally consistent (seeds 0–4 × both roles)", () => {
    for (const seed of [0, 1, 2, 3, 4]) {
      for (const playerCountryId of ROLES) {
        const record = run({ seed, playerCountryId, maxTurns: 60 });
        expect(record.battles, `seed ${seed}, ${playerCountryId} first`).toBeGreaterThanOrEqual(0);
        expect(record.upsets, `seed ${seed}, ${playerCountryId} first: upsets within battles`).toBeLessThanOrEqual(
          record.battles,
        );
        for (const country of ROLES) {
          expect(
            record.incomeByTurn[country],
            `seed ${seed}, ${playerCountryId} first: ${country} income covers every turn`,
          ).toHaveLength(record.endTurn);
          for (const income of record.incomeByTurn[country]) {
            expect(income).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("a campaign won before the cap exits cleanly with a winner recorded (seed range scan)", () => {
    // Across a seed range at least one campaign should end by victory (the
    // engine has no draw rule; capture-driven snowballing ends games) — the
    // exact seeds are not pinned, only the clean-exit contract.
    const records = [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => run({ seed, playerCountryId: "germany", maxTurns: 60 }));
    expect(records.some((record) => record.winner !== null)).toBe(true);
    for (const record of records) {
      if (record.winner !== null) {
        expect(record.endTurn).toBeLessThanOrEqual(60);
        expect(record.incomeByTurn.germany).toHaveLength(record.endTurn);
      }
    }
  });
});

describe("baseline grid (mirrored 100-campaign measurement)", () => {
  // 100 campaigns is the pinned grid; ~2–4x the idle soak's per-campaign cost.
  // The ceiling is deliberately generous (the local run lands well under it)
  // so CI slowdowns do not flake the budget assertion.
  const TIME_BUDGET_MS = 15_000;

  it("classifies all 100 campaigns, stays deterministic, and fits the time budget", () => {
    const started = performance.now();
    const records = runGrid();
    const elapsed = performance.now() - started;

    expect(records).toHaveLength(BASELINE_GRID.seeds.length * BASELINE_GRID.roles.length);
    for (const record of records) {
      expect(
        record.winner !== null || record.endTurn === BASELINE_GRID.maxTurns,
        `seed grid ${record.playerCountryId}-first campaign: winner or cap`,
      ).toBe(true);
    }

    // Aggregate determinism on a sampled re-run (20 campaigns) — per-campaign
    // determinism is already pinned by the self-tests; this guards the grid
    // order and the aggregation inputs.
    const sample = runGrid({ ...BASELINE_GRID, seeds: BASELINE_GRID.seeds.slice(0, 10) });
    for (let index = 0; index < sample.length; index += 1) {
      expect(sample[index]).toEqual(records[index]);
    }

    expect(elapsed, `grid wall time ${Math.round(elapsed)}ms fits the budget`).toBeLessThan(TIME_BUDGET_MS);
  });

  it("renders the committed baseline report byte-identically (or writes it on BALANCE_WRITE=1)", () => {
    const rendered = renderBaselineReport(runGrid());
    if (process.env.BALANCE_WRITE === "1") {
      writeFileSync(BASELINE_REPORT_PATH, rendered, "utf8");
      return; // generation run: the next ordinary run asserts the byte equality
    }
    const committed = readFileSync(BASELINE_REPORT_PATH, "utf8");
    expect(rendered).toBe(committed);
  });
});
