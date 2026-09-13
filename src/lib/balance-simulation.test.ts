import { describe, expect, it } from "vitest";

import { runCampaign } from "@/lib/balance-simulation";
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
