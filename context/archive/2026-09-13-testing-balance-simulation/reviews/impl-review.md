<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Balance Simulation Harness

- **Plan**: context/changes/testing-balance-simulation/plan.md
- **Scope**: Full plan review (Phases 1–3, all complete)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence base: two parallel review agents (plan-drift; safety/quality/pattern) over git
range `7af24d2^..ed9455e`, plus live re-verification (214/214 tests, lint exit 0,
byte-identical report regeneration confirmed on disk). Per-item drift verdicts:
10 MATCH, 1 trivial DRIFT, 1 trivial MISSING, 1 justified EXTRA. All four "What
We're NOT Doing" constraints verified in the diff (no product changes, no CI
changes, no bands pinned, no RNG changes). Five targeted claims verified in code:
runner cannot hang (double cap), role swap only between turns, income metric is
spending-immune (live ownership), upset counting matches its claim (strictly
weaker pre-roll side), report byte-identity asserts full contents with no
clock/random leakage.

## Findings

### F1 — Time-budget ceiling 15 s vs the plan's "≤ 10 s"

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/balance-simulation.test.ts:89
- **Detail**: The plan's grid contract and Performance section say a generous
  ceiling of ~10 s; the test sets 15 s (with a comment justifying generosity for
  CI). Local run lands at ~4.8 s, so intent (flakiness protection) is preserved;
  the number is 50% above the documented one.
- **Fix**: Record as accepted deviation (or align plan and test to one number in
  a future plan revision — phase blocks are read-only post-hoc).
- **Decision**: ACCEPTED — 15 s ceiling with justifying comment stands; local run 4.8 s.

### F2 — Missing `console.info` aggregate on failure (planned debugging aid)

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/balance-simulation.test.ts:96
- **Detail**: The plan asked the grid test to "emit the aggregate via console.info
  on failure for debugging only"; no such emission exists — on failure vitest
  shows only the assertion message.
- **Fix**: Add the aggregate to the relevant assertion messages (label strings
  already carry per-record context), or accept the omission.
- **Decision**: FIXED — console.info(summarize(records)) emitted only when the
  budget is about to be exceeded.

### F3 — Test-only module boundary relies on convention (vitest in src/lib graph)

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/balance-simulation.ts:3
- **Detail**: A non-test `src/lib` module imports `@/lib/test-utils`, which
  imports vitest's `expect`. Verified no product import path reaches it (grep
  over src/pages, src/components, middleware: zero hits), so no bundle pulls
  vitest today. If a page/component ever imports `runCampaign`, the build
  breaks or vitest ships.
- **Fix**: State the boundary in the module's doc comment ("test-only: never
  import from pages/components") — or hoist a vitest-free capped drain into the
  harness.
- **Decision**: FIXED — "Test-only measurement tool: never import from
  src/pages or src/components" added to the module doc comment.

### F4 — Report path resolved from cwd (regen from another directory misfires)

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/balance-simulation.test.ts:118
- **Detail**: `BASELINE_REPORT_PATH` is relative; running vitest outside the
  repo root ENOENTs in normal mode (loud) and, under `BALANCE_WRITE=1`, would
  write to the wrong location (silent until git notices). Unreachable via the
  documented commands (they run from the root).
- **Fix**: Anchor with `import.meta.dirname` (Node 22) and `path.join`.
- **Decision**: FIXED — BASELINE_REPORT_PATH anchored via import.meta.dirname;
  verified by running the suite from a foreign cwd.

### F5 — Grid executes ~2.2× per suite (grid test + report test)

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/balance-simulation.test.ts:91
- **Detail**: ~220 campaigns run per suite (100 grid + 20 sample + 100 report);
  measured ~4.8 s total, well within budget. Acceptable now; if the grid grows,
  cache `runGrid()` at module level.
- **Fix**: None now; note kept for future scaling.
- **Decision**: ACCEPTED — 4.8 s measured, well within budget; cache note stands.
