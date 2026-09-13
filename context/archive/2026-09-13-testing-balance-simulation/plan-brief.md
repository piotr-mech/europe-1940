# Balance Simulation Harness — Plan Brief

> Full plan: `context/changes/testing-balance-simulation/plan.md`
> Research: `context/changes/testing-balance-simulation/research.md`

## What & Why

Test-plan rollout Phase 2, risk #1: the game could ship unbalanced (trivially easy, economy snowballs) and bore the player — and today nothing in 208 tests measures who wins or how long campaigns take. We build a seeded AI-vs-AI simulation harness that runs full campaigns through the real reducer and emits a deterministic descriptive baseline of the game's balance.

## Starting Point

The engine is a pure state machine where a campaign is a function of (seed, role assignment); research audited every role read and confirmed a role-swap driver is safe. A soak skeleton (`ai-simulation.test.ts`) and capped `drainAiTurn` exist; runtime basis ~11 ms/campaign means ~100 campaigns fit CI with margin. Known distortions (dead Blitzkrieg, dead `bonusVsTank`, front-loaded German start) are measured as-is.

## Desired End State

`npm test` runs ~100 mirrored AI-vs-AI campaigns in seconds and a committed, byte-reproducible baseline report shows win-rates, campaign lengths, no-winner rate, upset frequency, and the income-divergence curve. The report is the agreed input for a future balance-tuning change where numeric bands get pinned.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Fairness oracle | Descriptive first, pin bands later | Avoids thresholds lifted from implementation output (the test plan's own anti-pattern); user owns the numbers | Plan |
| Dead mechanics (Blitzkrieg, bonusVsTank) | Out of scope — record as findings | Keeps this change test-only; measurements before tuning | Plan |
| Metrics | Full set (win-rate, length, no-winner, upsets, income divergence) | Each maps to a distinct failure mode of risk #1; nearly free from the runner | Plan |
| Harness design | Reducer-only with role swap | Research audited every role read — economy, victory, production, report slots are role-agnostic; both sides run identical AI code | Research |
| Placement | `src/lib/balance-simulation.ts` colocated module | `test-utils.ts` precedent; reusable by the future tuning change; CI gate free via `npm test` | Plan |
| Seeding | One integer seed per campaign, mirrored role assignments | Full reproducibility; never `Date.now()` | Research |

## Scope

**In scope:** runner module + self-tests; mirrored 100-campaign grid; committed descriptive report; cookbook §6.3/§6.6 update.

**Out of scope:** numeric fairness bands; product/balance changes (incl. fixing dead mechanics); mulberry32 decorrelation; CI pipeline changes; UI/e2e.

## Architecture / Approach

`src/lib/balance-simulation.ts` exports a pure campaign runner — `{seed, playerCountryId, maxTurns}` in, a campaign record out — driving `endTurn` → capped `drainAiTurn` → role swap → repeat until winner or turn cap. The test file pins the runner's determinism/termination, runs the grid, and the report renderer freezes the aggregate into `baseline-report.md`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Campaign runner infrastructure (setup) | Deterministic, terminating role-swap driver + metrics | A flaky runner poisons every later number |
| 2. Mirrored baseline grid + report | 100 committed campaigns, descriptive distribution | Runtime budget in CI |
| 3. Cookbook close-out | §6.3 pattern + §6.6 note; findings recorded | — |

**Prerequisites:** research read; test-plan §2 risk #1 contract.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- The measured baseline may be badly skewed (research red flags suggest German tilt) — that is a finding, not a failure of this change.
- Future pin-bands change depends on the user reviewing the report (manual step 2.4).
- Mulberry32 near-even correlation (~0.07) means any future "50/50 at even strength" assertion needs a tolerance band.

## Success Criteria (Summary)

- `npm test` green, suite ≤ ~30 s, harness included.
- Baseline report regenerates byte-identically from pinned seeds.
- Cookbook §6.3 filled; §6.6 records the baseline headline + descriptive-first decision.
