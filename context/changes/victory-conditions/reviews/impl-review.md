<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Victory Conditions Implementation Plan

- **Plan**: context/changes/victory-conditions/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-09-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Review evidence

- **Plan drift (agent 1)**: 17/17 contract items MATCH, 0 MISSING, 0 DRIFT. Both Critical Implementation Details honored (success-path-only winner check after isDomainError backstops, verified in game-state.ts moveArmy/attackArmy/aiStep; popup-before-overlay ordering via `showVictory` requiring both popups closed). "What We're NOT Doing" list clean — no key-city rule, no turn limit/score, no draw UI, no persistence, no extra stats. Commits touch only planned files.
- **Safety/quality/patterns (agent 2)**: no CRITICAL/WARNING findings. Freeze is airtight (only applyMove/resolveBattle mutate fieldOwners; both wrapped in withVictoryCheck; all gameplay actions guarded; startGame/resetGame are the intended exits). aiStep mid-replay win preserves aiTurnLog, skips rollover + movement reset, clears aiPlan (driver stops itself); subsequent aiStep is a no-op. winnerOf handles missing fieldOwners keys conservatively; O(fields), success-path only, never in render. No XSS surface. victory.ts follows supply.ts derived-module pattern; VictoryOverlay matches BattlePopup's modal language; tests follow src/lib/*.test.ts conventions; all backstops filter via isDomainError (lessons.md rule). Targeted vitest run 44/44.
- **Success criteria**: `npm test` 166/166, `npm run lint` 0 errors, `npm run build` pass. Manual items 3.3–3.7 checked off on user confirmation after live play-through (2026-09-05).

## Findings

### F1 — `dismissedReport`/`dismissedAiReport` survive a game reset

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/GameScreen.tsx:62,67
- **Detail**: `victoryDismissed`, `selectedArmyId`, `selectedSubject` are reset on all three exit paths, but the two dismissed-report refs are never cleared. Harmless in practice: popups compare by reference and every battle produces a fresh report object, so stale refs can never suppress a popup in a new game. Pre-existing behavior (startGame never cleared them before this change either).
- **Fix**: Skip (or clear both refs next to `setVictoryDismissed(false)` for symmetry — zero urgency).
- **Decision**: SKIPPED (harmless — reference comparison; pre-existing behavior)

### F2 — `showVictory` does not check `aiTurnActive` (safe by reducer invariant)

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/GameScreen.tsx:84-85
- **Detail**: The overlay visibility derivation relies on the reducer invariant `winner !== null ⇒ aiPlan === []` rather than an explicit `!aiTurnActive` term. Correct today (withVictoryCheck always clears aiPlan; there is no other way to set winner mid-replay), but the guarantee comes from game-state.ts, not from the UI condition itself.
- **Fix**: Skip now; if S-08 (persistence) introduces state hydration from outside the reducer, add `&& !aiTurnActive` as cheap defense.
- **Decision**: SKIPPED (safe by reducer invariant; revisit at S-08 if hydration appears)

### F3 — `state?.winner !== null` treats the setup screen like a frozen game

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/game-state.ts:169,181,205,217
- **Detail**: With `state === null`, `state?.winner` is `undefined`, so the guard returns null state — correct (gameplay actions on the setup screen are no-ops), and it is the exact form the plan prescribed. But the idiom is subtle: a future edit that drops the optional chain would throw on null. Used consistently in all four cases.
- **Fix**: Skip; on the next edit of this file consider an explicit two-line guard in the hot cases.
- **Decision**: SKIPPED (plan-prescribed form, used consistently)

### F4 — Map-sanity test block beyond the plan's case list

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/victory.test.ts:69-76
- **Detail**: A `describe("map sanity …")` block asserting the 6/6 city split is not among the plan's listed test cases. Benign test hardening: it guards the fixtures (`SOVIET_CITIES`/`GERMAN_CITIES`) against map-data drift, which the "all 12 cities" case implicitly depends on. Related nit from agent 1: the plan's "chained integration" scenario exists as two separate tests (victory action; endTurn no-op) rather than one chain — coverage is complete either way.
- **Fix**: Accept as-is (test hardening, consistent with supply.test.ts's sanity block).
- **Decision**: ACCEPTED (desirable test hardening)
