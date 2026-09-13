# Regression Floor for Battle & AI Hot-Spots — Implementation Plan

## Overview

Build the regression floor for the two highest-churn engine areas (battle resolution, AI decision logic), delivering test-plan rollout Phase 1 (`context/foundation/test-plan.md`). The floor consists of: shared test fixtures, observable dropped-action tracing in the AI plan executor (small product change), a seeded invariant sweep over battle outcomes, boundary-value tests for the AI attack gates, and a multi-turn AI soak simulation. Together these close gaps G1–G7 from `research.md`.

## Current State Analysis

- Engine is pure and fully deterministic: all randomness flows through `GameState.rngSeed` → `rngStep` (mulberry32); zero `Math.random`/`Date.now` in `src/lib` (research §A, §B).
- `aiStep` silently drops illegal planned actions (`src/lib/game-state.ts:274-278`) with no trace in `aiTurnLog`; a defensive branch meant to log swallowed attacks is dead code (`game-state.ts:314-330`).
- Winner-loss clamps guard both `resolveBattle` return paths (`battle.ts:227-229` global cap, `battle.ts:287-288` local re-clamp), but are two independent `Math.min` lines with no shared function — drift-prone under refactor.
- AI attack gates are bare unexported literals `ATTACK_PROB_FREE = 0.6`, `ATTACK_PROB_IMPORTANT = 0.4` (`ai.ts:24-25`); no test lands on either boundary; `aiWinProbability` (`ai.ts:56-80`) is coupled to battle rolls only via shared `ROLL_SPREAD` (`battle.ts:32`).
- Fixture helpers (`units`/`army`/`stateWithArmies`/`failWith`/`drainAiTurn`) are copy-pasted across `battle.test.ts`, `ai.test.ts`, `movement.test.ts`, `game-state.test.ts` with small variations.
- Existing suite: 10 files, colocated `src/lib/*.test.ts`, vitest 4 (`npm test`), explicit vitest imports, seeds cited in test titles, map-sanity describes pin real adjacency.

## Desired End State

A change to any battle modifier, clamp, threshold constant, or AI priority produces a loud, named test failure instead of silent behavior drift. Every illegal planned AI action leaves an observable trace. The suite runs in CI in a few seconds. The cookbook entry (§6.2 of the test plan) tells future contributors how to add characterization/golden tests in this codebase.

Verification: `npm test` green with all new tests; `npm run lint` and `npm run build` green; deliberately flipping one threshold/clamp value locally makes a named test fail (spot-check during implementation, revert after).

### Key Discoveries:

- Silent-swallow implementation and dead logging branch — `src/lib/game-state.ts:274-278`, `:314-330` (research §A)
- Both clamp sites and their independence — `src/lib/battle.ts:227-229`, `:287-288` (research §B)
- `ROLL_SPREAD` is the only AI↔battle coupling guard — `battle.ts:32` vs `ai.ts:56-80`
- Single existing illegal-action test (template for G3) — `game-state.test.ts:463-482`; player-path dev-error test (the lesson's pattern) — `game-state.test.ts:381`
- Persistence envelope wraps the whole `GameState` (research archive S-08) — any state-shape change must survive old saves

## What We're NOT Doing

- No balance tuning, no threshold value changes, no AI logic changes beyond the dropped-action trace (behavior of legal plans unchanged).
- No test infrastructure for UI components (deliberately deferred per test-plan §7).
- No balance simulation harness with win-rate oracles — that is rollout Phase 2 (`testing-balance-simulation`), not this change. The soak here asserts structural invariants only, not fairness.
- No CI/pipeline changes beyond what already runs `npm test`.

## Implementation Approach

Five phases ordered by dependency: fixtures first (everything imports them), then the product change that later tests assert against, then the three test surfaces (battle sweep, AI boundaries, soak), closing with the cookbook update. All new tests are characterization tests: their expected values come from the rules spec (PRD FR-007/008/010/012, research-verified behavior), never from re-running the implementation to capture output.

## Critical Implementation Details

- **Persistence compatibility (Phase 2)**: the dropped-action trace must ride the existing `aiTurnLog` structure (a new entry kind or explicit field), NOT a new top-level `GameState` field. `src/lib/persistence.ts` validates saved state with a pragmatic type-guard; extending `aiTurnLog` entries must stay acceptable to that guard for old saves (verify by running `persistence.test.ts` round-trips against a pre-change save shape fixture). If the guard enumerates entry kinds, extend it in the same change.
- **Oracle discipline**: expected values in gate-boundary tests come from `aiWinProbability` arithmetic computed by hand from the spec formula — do not copy gate behavior from the planner code under test. In sweep tests, assert invariants (properties), not exact outcomes, so the sweep can never green-light a behavior bug by mirroring it.
- **Seeds in test titles**: existing convention cites the seed (`"(seed 6)"`); sweep tests cite the seed range instead.

## Phase 1: Shared Test-Fixtures Module

### Overview

Extract the duplicated fixture helpers into one module so the ~40 new tests added in Phases 2–5 do not create a fourth and fifth copy of the same code.

### Changes Required:

#### 1. New test-utils module

**File**: `src/lib/test-utils.ts`

**Intent**: Single home for the helpers currently copy-pasted across test files, so new suites import instead of re-copying.

**Contract**: exports `units(...)`, `army(...)`, `stateWithArmies(...)` (plus the `stateWith`/`owners` variants actually shared), `failWith(...)`, and `drainAiTurn(state)` with behavior identical to the current copies (unit ids `u1..uN`, `movementPoints: armySpeed(base)`, base from `createInitialGameState("germany", "soviet")` spread). File-local variations that genuinely differ (e.g. production's army-id-prefixed unit ids, `production.test.ts:24`) stay in their files — only hoist what is truly common.

#### 2. Rewire existing test files to the shared module

**File**: `src/lib/battle.test.ts`, `src/lib/ai.test.ts`, `src/lib/movement.test.ts`, `src/lib/game-state.test.ts`

**Intent**: Delete the local helper copies and import from `@/lib/test-utils`; zero behavior change — the suite must stay green and count-identical.

**Contract**: pure mechanical refactor; no test bodies change. `battle.test.ts:270-274` inline drain loop replaced by `drainAiTurn`.

### Success Criteria:

#### Automated Verification:

- Full suite green, same test count as before refactor: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- `git diff` shows only helper extraction + import changes; no assertion edits

---

## Phase 2: Observable Dropped-Action Tracing (Product Change) + aiStep Tests

### Overview

Make plan/execution mismatch visible: an illegal planned AI action leaves a trace instead of vanishing, then pin the executor's skip/dev-error semantics with tests (gap G3).

### Changes Required:

#### 1. Trace skipped actions in `aiStep`

**File**: `src/lib/game-state.ts`

**Intent**: When the executor's catch drops a domain-illegal planned action (`game-state.ts:274-278`), append a distinguishable entry to `aiTurnLog` describing the skipped action, so tests and the turn summary can count drops.

**Contract**: new `aiTurnLog` entry marks kind/action as skipped (e.g. kind `"skipped"` carrying the planned action summary); executed-action entries unchanged; developer errors still rethrow per the lessons.md rule (`isDomainError` filter). The dead defensive branch at `game-state.ts:314-330` is either removed or superseded by this path — implementer verifies which. UI must not crash on the new entry kind (it renders `aiTurnLog` in the AI turn summary).

#### 2. aiStep executor tests (G3)

**File**: `src/lib/game-state.test.ts`

**Intent**: Pin skip semantics beyond the single existing case, and give `aiStep` the dev-error propagation test the lesson mandates.

**Contract**: scenarios — (a) stale planned `attack` (target army removed by an earlier action in the same plan), (b) illegal `order` (city lost between plan and step), (c) two consecutive skips then a legal action, (d) illegal action as the last plan entry still triggers turn rollover (`game-state.ts:277` vs `:288`), (e) a `TypeError` thrown inside an applied action propagates out of `aiStep` (template: `game-state.test.ts:381`). Each skip scenario asserts the new trace entry exists (observable, never silent). Expected behaviors derive from the code's documented contract ("drop and move on") plus this change's trace contract — not from re-running the planner.

### Success Criteria:

#### Automated Verification:

- New aiStep tests green: `npm test`
- Persistence round-trips unaffected: `persistence.test.ts` green; add one round-trip case whose save contains a skipped entry
- Build green (state shape touched): `npm run build`
- Lint green: `npm run lint`

#### Manual Verification:

- `npm run dev`, play a turn with battles: AI turn summary renders without errors; skipped actions (if any occur naturally) appear in the summary or are at least harmless

---

## Phase 3: Battle Invariant Sweep + Defensive Branches

### Overview

A seeded property sweep pinning the structural invariants of every battle outcome (gaps G5, G6), plus the admitted-untested defensive branches and the intermediate-path queue cancel (G7).

### Changes Required:

#### 1. Invariant sweep describe

**File**: `src/lib/battle.test.ts`

**Intent**: Assert outcome invariants across a fixed matchup matrix × seed range, so any modifier/clamp drift flips a named assertion at some seed.

**Contract**: matrix of ~6 matchups (attacker weaker / equal / stronger; with and without modifiers — river, unsupplied, city defense, multi-defender) × seeds 0–99 via `resolveBattle` on fixture states. Invariants per resolution: winner keeps ≥ 1 unit; loser armies fully removed; every remaining army has `units.length ≥ 1` and no negative counts; target field owner after attacker win is the attacker's country, after defender win unchanged (always a valid `CountryId`); report arithmetic `Σ(base + modifiers) === total` for both sides; roll multiplier bounds respected (report totals within [0.8, 1.2) × pre-roll strength). Property assertions only — no exact-outcome snapshots.

#### 2. Defensive-branch and edge tests (G7)

**File**: `src/lib/battle.test.ts`

**Intent**: Cover the branches current data never reaches but a refactor must not break.

**Contract**: (a) attacker strength driven below 0 by stacked penalties clamps at 0 with the balancing modifier line (`battle.ts:111-116`; existing test at `battle.test.ts:82` covers only exactly 0); (b) 0-strength vs 0-strength resolves defender-wins (tie rule, `battle.ts:220`); (c) multi-hop attack whose intermediate field is an ungarrisoned enemy city: that city is free-captured AND its production queue cancelled (`battle.ts:253-263`).

### Success Criteria:

#### Automated Verification:

- Sweep + branch tests green: `npm test`
- Suite runtime still ≤ ~10s total: time `npm test`
- Lint green: `npm run lint`

#### Manual Verification:

- Spot-check: temporarily change `supplyPenaltyOf` to `Math.floor` locally — sweep or boundary test must fail; revert

---

## Phase 4: AI Gate Boundary Tests + Probability Coupling

### Overview

Pin the exact attack-gate boundaries (gap G1) and turn the `aiWinProbability` ↔ `resolveBattle` convention into an enforced contract (gap G2).

### Changes Required:

#### 1. Export the gate constants

**File**: `src/lib/ai.ts`

**Intent**: Tests must pin the gate values, not magic 0.4/0.6 duplicates.

**Contract**: export `ATTACK_PROB_FREE` and `ATTACK_PROB_IMPORTANT` (values unchanged); tests import them.

#### 2. Boundary-value gate scenarios (G1, G2)

**File**: `src/lib/ai.test.ts`

**Intent**: No future threshold change passes silently; the analytic probability is tied to actual gate decisions at the boundary.

**Contract**: scenarios with strengths engineered so `aiWinProbability` is exactly `ATTACK_PROB_FREE` and exactly `ATTACK_PROB_IMPORTANT`: at 0.60 the free-attack priority fires; just below it does not; at 0.40 the important-target band fires given the above-median condition; just below it falls through to grouping. Expected gate behavior derives from the priority-ladder spec (FR-012, research §A table), with boundary arithmetic computed by hand from the closed-form formula — never by observing the planner. Follow existing conventions: map-sanity guard block for any new board layout, seed cited in titles.

#### 3. Analytic-vs-simulation coupling test (G2)

**File**: `src/lib/ai.test.ts`

**Intent**: Guard the `ROLL_SPREAD` coupling — if battle rolls or the analytic model drift apart, this fails.

**Contract**: for a grid of strength pairs (e.g. attack/defense ratios 0.5–2.0), `|aiWinProbability(a, d) − empirical attacker-win frequency of resolveBattle over seeds 0–99| ≤ 0.05`. This replaces today's single mid-band check (`ai.test.ts:48-52`) as the standing contract, which may then be simplified or kept — implementer's call, keep the file readable.

### Success Criteria:

#### Automated Verification:

- Boundary + coupling tests green: `npm test`
- Lint green: `npm run lint`

#### Manual Verification:

- Spot-check: temporarily raise `ATTACK_PROB_FREE` to 0.7 locally — a boundary test must fail by name; revert

---

## Phase 5: AI Soak Simulation + Cookbook Update

### Overview

Multi-turn structural soak (gap G4) proving the AI turn machinery never stalls or corrupts state across long campaigns, then close out by writing the cookbook pattern into the test plan.

### Changes Required:

#### 1. Soak simulation suite

**File**: `src/lib/ai-simulation.test.ts` (new)

**Intent**: The "AI quietly stops working" failure mode becomes a loud timeout/assertion, not a player report.

**Contract**: scripted campaigns driven purely through the reducer: repeat `endTurn` (player takes no actions) up to 60 turns × ~5 start seeds. Per turn invariants: the aiStep loop drains (each `endTurn` eventually returns a state with empty `aiPlan` and `turn` incremented — guard with an iteration cap that fails the test if exceeded); no empty armies (`units.length ≥ 1`); every field owner is a valid country; resources never negative; skipped-action count per turn ≤ plan length (each entry is either executed or traced — with Phase 2's trace this is now directly assertable). Uses Phase 1 fixtures. Campaign may end in victory before 60 turns — that also passes, provided invariants held to the end.

#### 2. Cookbook update (mandatory close-out)

**File**: `context/foundation/test-plan.md`

**Intent**: Fill §6.2 (characterization/golden pattern) and append a §6.6 phase note, per the test plan's own contract that each rollout phase ships its cookbook entry.

**Contract**: §6.2 gets location (`src/lib/` colocated), naming (`<module>.test.ts` / `ai-simulation.test.ts`), reference tests (sweep describe in `battle.test.ts`, boundary describe in `ai.test.ts`, trace tests in `game-state.test.ts`), mocking policy (none — pure engine, explicit seeds), and run command (`npm test`); §6.6 gets a 2–3 line note of anything surprising the phase taught.

### Success Criteria:

#### Automated Verification:

- Soak green: `npm test`; total suite runtime ≤ ~30s
- Lint + build green: `npm run lint`, `npm run build`
- `context/foundation/test-plan.md` §6.2 no longer reads "TBD"

#### Manual Verification:

- Review the cookbook entry for accuracy against what actually shipped

## Testing Strategy

### Unit Tests:

- All new tests are the deliverable (Phases 2–5). Characterization oracles: rules spec + hand-computed boundary arithmetic + property invariants; never captured implementation output.

### Integration Tests:

- Soak suite (Phase 5) is the integration layer: reducer + AI + battle composed over many turns.

### Manual Testing Steps:

1. Phase 2: play one turn with battles in `npm run dev`; AI summary renders cleanly
2. Phase 3/4 spot-checks: flip a modifier/threshold locally, watch a named test fail, revert
3. Final: note `npm test` wall-clock time in the PR description

## Performance Considerations

Sweep (600 resolutions) and coupling grid (~7 ratios × 100 seeds) are pure-function calls — expected well under 2s combined. Soak (5 campaigns × 60 turns × plan+steps) is the only real cost; cap it so the whole suite stays ≤ ~30s in CI. If soak exceeds that, reduce seeds before reducing turns.

## Migration Notes

No data migration. Persistence compatibility is a constraint, not a change: old saves must load unchanged after Phase 2 (the `aiTurnLog` extension must pass the existing type-guard; extend the guard only if it enumerates entry kinds).

## References

- Research: `context/changes/testing-regression-floor/research.md` (gaps G1–G7, all file:line grounding)
- Test plan: `context/foundation/test-plan.md` §2 risks #2/#3, §3 Phase 1
- Lessons: `context/foundation/lessons.md` (bare-catch rule — Phase 2 test (e))
- Existing templates: `game-state.test.ts:463-482` (illegal skip), `game-state.test.ts:381` (dev-error), `battle.test.ts:161/:202` (clamps), `ai.test.ts:204-215` (determinism)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared Test-Fixtures Module

#### Automated

- [x] 1.1 Full suite green with identical test count after helper extraction (`npm test`) — 801f542
- [x] 1.2 Lint passes (`npm run lint`) — 801f542

#### Manual

- [x] 1.3 Diff review: only helper extraction + imports, no assertion edits — 801f542

### Phase 2: Observable Dropped-Action Tracing + aiStep Tests

#### Automated

- [x] 2.1 Skipped-action trace lands in aiTurnLog; suite green (`npm test`) — e283824
- [x] 2.2 Persistence round-trips unaffected incl. one save containing a skipped entry — e283824
- [x] 2.3 Build + lint green (`npm run build`, `npm run lint`) — e283824

#### Manual

- [x] 2.4 Dev playthrough: AI turn summary renders without errors after the state change — e283824

### Phase 3: Battle Invariant Sweep + Defensive Branches

#### Automated

- [x] 3.1 Sweep describe (6 matchups × seeds 0–99) green with all invariants — 3d8aae2
- [x] 3.2 Defensive-branch + intermediate-path queue-cancel tests green — 3d8aae2
- [x] 3.3 Suite runtime ≤ ~10s; lint green — 3d8aae2

#### Manual

- [x] 3.4 Spot-check: supplyPenaltyOf → Math.floor flips a named test; reverted — 3d8aae2

### Phase 4: AI Gate Boundary Tests + Probability Coupling

#### Automated

- [x] 4.1 Gate constants exported; boundary scenarios at exactly 0.40/0.60 green — a1ae389
- [x] 4.2 Analytic-vs-simulation coupling test green (tolerance 0.05) — a1ae389
- [x] 4.3 Lint green — a1ae389

#### Manual

- [x] 4.4 Spot-check: ATTACK_PROB_FREE → 0.7 flips a named boundary test; reverted — a1ae389

### Phase 5: AI Soak Simulation + Cookbook Update

#### Automated

- [x] 5.1 Soak suite green (60 turns × ~5 seeds, all per-turn invariants) — 64c2a9f
- [x] 5.2 Total suite ≤ ~30s; lint + build green — 64c2a9f
- [x] 5.3 test-plan.md §6.2 filled, §6.6 note appended — 64c2a9f
