# Regression Floor for Battle & AI Hot-Spots — Plan Brief

> Full plan: `context/changes/testing-regression-floor/plan.md`
> Research: `context/changes/testing-regression-floor/research.md`

## What & Why

Test-plan rollout Phase 1: freeze battle-resolution and AI-decision behavior where churn is highest (`src/lib/` — 34 commits/30d), so future changes fail loudly instead of drifting silently. Covers test-plan risks #2 (AI behavior regression; illegal planned actions silently swallowed) and #3 (battle outcome drift; structural clamp/coupling hazards).

## Starting Point

A deterministic, pure engine (all randomness behind `GameState.rngSeed`) with 10 vitest files clustered in `src/lib/` — but zero seed-sweep/distribution tests, zero boundary tests on the AI attack gates (0.4/0.6), one single-case illegal-action test, and an executor that drops illegal AI actions with no trace (`game-state.ts:274-278`). Fixture helpers are copy-pasted across four test files.

## Desired End State

Any change to a battle modifier, clamp, threshold constant, or AI priority produces a named test failure. Every dropped AI action leaves an observable trace. The suite still runs in seconds, and the test plan's cookbook (§6.2) tells contributors how to add characterization tests here.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dropped-action detection | Trace entry in existing `aiTurnLog` (small product change) | Makes the plan↔execution invariant directly assertable and cheap; rides an already-persisted structure so old saves stay compatible | Plan |
| Fixture duplication | Consolidate into `src/lib/test-utils.ts` now | ~40 new tests would otherwise create 4th/5th copies of the same helpers | Research |
| Sweep size | 6 matchups × seeds 0–99 (~600 resolutions) | Pure-function cost (<2s) catches drift at any seed without exact-outcome snapshots | Plan |
| Soak depth | 60 turns × ~5 start seeds, structural invariants only | Catches "AI quietly stalls" without overlapping rollout Phase 2's fairness harness | Plan |
| Oracles | Spec + hand-computed boundary arithmetic + property invariants | Avoids the oracle problem — assertions never lifted from the code under test | Test plan / Research |

## Scope

**In scope:** test-utils module; skipped-action trace in `aiStep`; battle invariant sweep + defensive-branch tests; gate-boundary + probability-coupling tests; AI soak suite; cookbook §6.2 update.

**Out of scope:** balance tuning or threshold value changes; UI component tests; balance/fairness harness (rollout Phase 2); CI pipeline changes.

## Architecture / Approach

Five dependency-ordered phases: fixtures → product change (trace) → battle sweep → AI boundary tests → soak + cookbook. All tests are unit-level in vitest, colocated in `src/lib/`; the soak suite drives only the reducer. One deliberate product change (Phase 2) stays persistence-compatible by extending `aiTurnLog` entries rather than adding top-level state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared test-utils | Single fixture module; existing tests rewired | Mechanical refactor accidentally changes a test's meaning |
| 2. Dropped-action trace + aiStep tests | Observable skips; executor semantics pinned | State-shape change breaks old saves (mitigated: aiTurnLog extension + round-trip test) |
| 3. Battle invariant sweep | Property sweep 6×100 seeds + defensive branches | Runtime creep (capped, property-only assertions) |
| 4. Gate boundary tests | Exact 0.40/0.60 scenarios + analytic↔simulation coupling | Boundary arithmetic computed wrong by hand (spec-derived, double-checked) |
| 5. Soak + cookbook | 60-turn campaigns, structural invariants; §6.2 filled | Soak runtime; campaigns ending early in victory (allowed) |

**Prerequisites:** research.md complete; `npm test` green at baseline.
**Estimated effort:** ~2–3 sessions across 5 phases.

## Open Risks & Assumptions

- Persistence type-guard behavior with the new `aiTurnLog` entry kind is assumed permissive; if it enumerates kinds it must be extended in Phase 2 (same change).
- Soak assumes campaigns either end in victory or reach 60 turns without stalling; an iteration cap turns any stall into a test failure rather than a hang.
- Coupling tolerance (0.05) assumed adequate for 100-seed empirical frequencies; widen seeds, not tolerance, if flaky.

## Success Criteria (Summary)

- Deliberately flipping one clamp/threshold/modifier locally fails a named test (verified by spot-checks 3.4/4.4)
- `npm test` green, suite ≤ ~30s; lint + build green
- `context/foundation/test-plan.md` §6.2 no longer "TBD"
