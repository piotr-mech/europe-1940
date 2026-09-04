<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rule-Based AI Opponent

- **Plan**: context/changes/ai-opponent/plan.md
- **Scope**: Full plan review (Phases 1-3 of 3)
- **Date**: 2026-09-04
- **Verdict**: REJECTED at review time (F1 critical) — F1..F4 fixed in triage; see decisions
- **Findings**: 1 critical, 3 warnings, 5 observations

> Reviewer note: the safety/patterns sub-agent terminated on an API rate
> limit mid-run; its checklist was completed in the main session (deep-read
> of all changed files, which the session authored). The drift sub-agent
> completed normally.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (F2 — P5 attack branch missing; F3 — unconditional P6) |
| Scope Discipline | PASS (no "NOT Doing" leaks: no decision randomness, no memory, no oil, greedy one-step execution) |
| Safety & Quality | FAIL (F1 — empty AI plan freezes the turn and enables repeated income) |
| Architecture | PASS (pure planner + staged execution exactly as planned) |
| Pattern Consistency | PASS (module/test/UI conventions followed; no new bare catch) |
| Success Criteria | PASS (149/149 tests, lint, build green; manual 3.4 user-confirmed) |

## Findings

### F1 — An empty AI plan freezes the turn and lets "end turn" farm income

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/lib/game-state.ts:199-213 (endTurn), src/components/game/GameScreen.tsx:81-89 (replay driver)
- **Detail**: `endTurn` always defers the rollover (turn+1, movement reset) to the last `aiStep`. If `planAiTurn` returns an empty list — the AI has no armies and nothing affordable to order, reachable in play once the player has captured all AI cities (S-07's victory check doesn't exist yet, so the game continues) — the replay driver never fires and the turn never rolls over. Worse, clicking "Koniec tury" again is legal (the mid-turn guard only checks a non-empty plan) and re-runs `collectIncome`: infinite income farm.
- **Fix**: In `endTurn`, when the computed plan is empty, apply the rollover immediately (movement reset via `movementAllowance` + `turn + 1`) instead of deferring. Add a reducer test: AI stripped of cities/armies → `endTurn` → `turn` incremented, income applied once.
  - Strength: Four lines reusing the exact last-step logic; the invariant becomes "the turn rolls over when the queue is empty, whenever it became empty".
  - Tradeoff: None significant.
  - Confidence: HIGH — the path was traced through both reducer and driver.
  - Blind spot: None significant.
- **Decision**: FIXED (endTurn rolls the turn over immediately on an empty plan — movement reset + turn+1 inline; reducer test with the AI stripped of cities/armies verifies single income application)

### F2 — P5 (supply cut) never attacks — defended cutting fields are silently skipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — worth pausing; gameplay-design decision
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai.ts:230-242
- **Detail**: The plan specified "a move (or attack) onto an enemy field whose ownership change cuts enemy supply; only when P ≥ 0.6 for attacks". The implementation scans only `reachableFields`, which excludes enemy-army-occupied fields — so a *defended* supply-cutting field (the tactically classic case: fight through the guard to sever the line) is never considered. The omission is undocumented.
- **Fix A ⭐ Recommended**: Extend the P5 scan with `attackFields` candidates (enemy-occupied fields whose capture cuts supply), gated by P ≥ 0.6 via `aiWinProbability`, preferring the higher-value cut.
  - Strength: Completes the plan's P5; the AI can fight for a cut, which is the rule's point.
  - Tradeoff: A few more candidates to score; new golden test needed.
  - Confidence: HIGH — the plumbing (attackCandidates' math) already exists to copy.
  - Blind spot: Balance — an aggressive cut-hunting AI may suicide into guards at exactly 60%.
- **Fix B**: Keep moves-only and document the simplification in the plan/code.
  - Strength: Zero risk; the move-only cut still appears in play (verified by the golden test).
  - Tradeoff: A visible slice of the spec's behavior stays missing.
  - Confidence: MED.
  - Blind spot: How often defended cut fields arise in real campaigns.
- **Decision**: FIXED (Fix A — P5 scans attackFields for defended cutting fields at P >= 60%, moves preferred over attacks; golden test added)

### F3 — P6 (grouping) fires unconditionally

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — worth pausing; behavior-shape decision
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai.ts:244-255
- **Detail**: The plan conditioned grouping on "the best target's best attack P < 0.4"; the implementation always steps every remaining army toward the best-value enemy city. In practice the effect is close (spare armies advance), but the AI advances even when it just captured everything reachable and could consolidate differently.
- **Fix A ⭐ Recommended**: Add the plan's gate — compute the best candidate's probability; only group when it is below 0.4 (or no candidate exists).
  - Strength: Matches the plan and the spec's "group when too weak" narrative; fewer pointless advances.
  - Tradeoff: More idle AI turns visible to the player.
  - Confidence: HIGH.
  - Blind spot: Whether gating makes the AI look passive in early turns.
  - Note: the gate measures the best-value OBJECTIVE's takeability (snapshot before the P3/P4 picks), not remaining candidates.
- **Fix B**: Accept unconditional approach-as-posture and document.
  - Strength: The map always shows AI pressure.
  - Tradeoff: Permanent, plan-diverging aggression.
  - Confidence: MED.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A — P6 groups only when the objective's best candidate is under 40%; golden test added)

### F4 — Stale registry row: GameState.lastBattleReport no longer exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency (docs)
- **Location**: docs/reference/contract-surfaces.md:42
- **Detail**: The old `GameState.lastBattleReport` row survived next to the new `lastBattleReportByCountry` row — S-07/S-08 would read a ghost surface.
- **Fix**: Remove the stale row.
- **Decision**: FIXED (row replaced with a rngSeed-only entry; the report slot row already documents lastBattleReportByCountry)

### F5 — "Cheapest-first on ties" in production not implemented

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai.ts:357-370
- **Detail**: The plan's production contract mentioned cheapest-first tie-breaking; the rotation alone decides (infantry fallback on rounding). The affordability filter makes the omission practically invisible.
- **Fix**: None — accept, or fold into future balance work.
- **Decision**: ACCEPTED (rotation + affordability filter suffice; revisit with future balance work)

### F6 — §25 distance via a private unbounded Dijkstra

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai.ts:86-104
- **Detail**: The plan sketched distance from `attackFields`/`reachableFields` costs; those are bounded by movement points, which cannot express "how far is the target beyond reach" — the unbounded Dijkstra is the correct tool, documented in code.
- **Fix**: None — accept as a justified correction.
- **Decision**: ACCEPTED (reach-costs cannot express beyond-reach distance; documented in code)

### F7 — Mid-band probability tests pin offline-verified constants

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria (tests)
- **Location**: src/lib/ai.test.ts:48-52
- **Detail**: The simulation cross-check ran offline (2M draws) and its values are hardcoded — the plan's "pin mid case against brute-force simulation" is satisfied in intent, not executed in-suite.
- **Fix**: None — a 2M-draw test would be slow and flaky-by-seed.
- **Decision**: ACCEPTED (offline-verified constants; re-derive manually if ROLL_SPREAD changes)

### F8 — Tie-breaking details diverge from "lexicographic"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai.ts:184-186 (P1 iterates MAP_FIELDS order), ai.ts:222-224 (P3/P4 stable sort)
- **Detail**: Determinism holds everywhere (the operative requirement); the *specific* tie orders differ from the plan's blanket "lexicographic" in P1/P3/P4.
- **Fix**: None — determinism is the contract; exact tie order is cosmetic.
- **Decision**: ACCEPTED

### F9 — Panel precedence: player's battle report over the AI summary

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: src/components/game/DetailPanel.tsx:68-77
- **Detail**: With both a player report and an AI log present, the report wins until the player's next battle overwrites the slot or a selection replaces the panel — consistent with the plan's Critical Details (the recap reads the player's slot); the AI summary reappears once the slot clears in a later turn.
- **Fix**: None — accept.
- **Decision**: ACCEPTED
