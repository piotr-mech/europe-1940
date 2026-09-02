<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Resources and Production Implementation Plan

- **Plan**: context/changes/resources-production/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-09-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Review evidence

- Plan drift scan: 16/16 planned change items MATCH; 0 MISSING, 0 DRIFT, 0 out-of-scope EXTRA. Deliberate deviations: two `collectIncome` test fixtures pinned to an explicit zero baseline (anticipated by the plan's Migration Notes). All "What We're NOT Doing" boundaries held (no AI ordering, no queue cancellation, no manual placement, no `INITIAL_ARMIES` retuning, engine-only tests, no persistence, no balance-data changes).
- Safety/quality/pattern scan: campaign-wide id uniqueness verified (monotonic turns + collision-checked `${fieldId}-${turn}-${seq}` army ids, `nextUnit` skips taken ids); purity/immutability verified; no negative-resource path (dataset validation + per-resource affordability checks); reducer/React semantics clean (endTurn intentionally uncaught — no illegal variants; `getGameData()` per render is the established cached pattern). Test suite run: 72/72 passed.
- Success criteria re-verified: `npm test` (72/72), `npm run lint`, `npm run build` — all pass. Manual item 3.4 confirmed by the user.

## Findings

### F1 — Stale consumers column in the contract-surfaces registry

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: docs/reference/contract-surfaces.md:17-20
- **Detail**: The `MAP_FIELDS` / `UNIT_TYPES` rows claim consumption "Via `buildGameData()` only", already outdated before this change (`movement.ts`, `game-state.ts` import directly) and now further off — `production.ts` imports both datasets directly (src/lib/production.ts:8-9), as do the test suites. The registry exists to name real consumers before reshaping; leaving the drift unrecorded deepens it.
- **Fix**: Update the Consumers column of the `MAP_FIELDS` and `UNIT_TYPES` rows to list `buildGameData()`, `movement.ts`, `production.ts`, `game-state.ts`.
- **Decision**: FIXED — Consumers column updated in both rows (2026-09-02).

### F2 — Bare `catch {}` backstops can swallow developer errors

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/game-state.ts:123-127,133-138
- **Detail**: The backstop pattern itself is deliberate (established by `movement.ts` and the plan — not flagged). A typo (e.g. a misspelled import) would surface as a `ReferenceError` inside the bare catch and manifest as a silently dead button instead of a visible failure. Risk is bounded: both reducer paths are exercised directly by tests (`game-state.test.ts`), so this class of bug is caught by CI before merge.
- **Fix**: Accept as-is. If hardening is ever wanted without breaking the pattern, narrow the catch to known error-message prefixes.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Bare catch backstops must not mask developer errors — reducer backstops now rethrow ReferenceError/TypeError/SyntaxError via `isDomainError` (src/lib/game-state.ts); lesson appended to context/foundation/lessons.md (2026-09-02).

### F3 — Redundant optional chaining in the city income rows

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/DetailPanel.tsx:144
- **Detail**: `field.city?.income[resourceId] ?? 0` sits inside the `isCity && field.city !== null` guard, so the `?.` and `?? 0` are dead code. Zero risk; cosmetic.
- **Fix**: Skip or clean to `field.city.income[resourceId]` on the next edit of this file — not worth a dedicated commit.
- **Decision**: FIXED — cleaned to `field.city.income[resourceId]` (2026-09-02).

### F4 — Affordability logic duplicated inline in the UI

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/DetailPanel.tsx:206-207
- **Detail**: The per-resource comparison re-implements the check in `applyProductionOrder` (src/lib/production.ts:111-115). The engine stays the source of truth and the reducer backstop covers drift, so divergence would only produce a button that looks enabled but does nothing. With the fixed three-resource set (PRD Non-Goals), drift is unlikely.
- **Fix**: Consciously skip. If a fourth resource ever arrives, extract `canAfford(treasury, cost)` into `production.ts` and use it in both places.
- **Decision**: SKIPPED — conscious skip at fixed three resources; revisit if a fourth resource arrives (2026-09-02).

### F5 — Duplicated starting-income helper across test suites

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/production.test.ts:46-57 vs src/lib/game-state.test.ts:12-24
- **Detail**: `initialIncome` and `startingIncome` compute the same income sum from two different data sources (`MAP_FIELDS` vs `getGameData().fields`) — which doubles as a cross-check — but is duplication that could drift when incomes change. Per-file self-contained helpers match the established `movement.test.ts` split; no shared test-helper module exists to move it to.
- **Fix**: Skip. The per-suite duplication is deliberately self-contained and the cross-source scaling has diagnostic value.
- **Decision**: SKIPPED — conscious skip; per-suite self-contained helpers match the established movement.test.ts split (2026-09-02).
