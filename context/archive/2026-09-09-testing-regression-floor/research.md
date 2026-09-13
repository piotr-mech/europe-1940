---
date: 2026-09-09T18:40:38+02:00
researcher: Claude (agent session)
git_commit: 9b84332736faa5f6ba0e517b72d85a2fa794408a
branch: main
repository: piotr-mech/europe-1940
topic: "Ground test-plan rollout Phase 1 risks #2 (AI behavior regression) and #3 (battle outcome drift) in code; verify response guidance; locate extendable tests and cheapest layer"
tags: [research, codebase, ai, battle, testing, vitest]
status: complete
last_updated: 2026-09-09
last_updated_by: Claude (agent session)
---

# Research: Regression floor for battle & AI hot-spots (test-plan Phase 1)

**Date**: 2026-09-09T18:40:38+02:00
**Researcher**: Claude (agent session)
**Git Commit**: 9b84332736faa5f6ba0e517b72d85a2fa794408a
**Branch**: main
**Repository**: piotr-mech/europe-1940

> Local paths are relative to the repo root at the commit above. Permalink
> base: `https://github.com/piotr-mech/europe-1940/blob/9b84332736faa5f6ba0e517b72d85a2fa794408a/`.

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Regression floor for hot-spots"). Risks to verify, not blindly accept:

- **Risk #2** — AI behavior regresses after threshold/priority changes; illegal planned actions silently swallowed. Response guidance: golden priority scenarios stay green; plan determinism per fixed seed; illegal planned actions observable, never silently swallowed; challenge "the AI took its turn, so the plan was valid"; avoid implementation-mirror assertions.
- **Risk #3** — battle outcomes drift after modifier changes; ownerless-field / mutual-annihilation hazard. Response guidance: per-modifier consistency plus after every battle the field has exactly one owner (or is empty by rule), unit counts stay >= 0, seeded roll distribution stays in bounds; challenge "a side won, so the outcome is correct"; avoid snapshot-without-meaning.

Hot-spot evidence that raised the risks (likelihood only, not anchors): `src/lib/` — 34 commits/30d.

## Summary

1. **Risk #2 is confirmed and current.** The silent-swallow failure mode is explicitly implemented (`src/lib/game-state.ts:274-278`): an illegal planned AI action is dropped with no log entry, no counter, and no trace in `aiTurnLog`. A defensive branch in `aiLogEntry` (`game-state.ts:314-330`) intended to log swallowed attacks is dead code for this path. Exactly one test covers illegal-action skip semantics (`game-state.test.ts:463-482`), and the analogous developer-error propagation test exists only for the player path (`game-state.test.ts:381`), not for `aiStep`.
2. **Risk #3 is structural, not current.** Both return paths of `resolveBattle` clamp winner losses (global cap `battle.ts:227-229`, local re-clamp `battle.ts:287-288`); an ownerless field is unreachable because `fieldOwners` has no removal semantics (`src/types.ts:178`). The hazard is drift: the clamp is two independent `Math.min` lines with no shared function, and AI's analytic win probability is coupled to battle rolls only through the shared exported constant `ROLL_SPREAD` (`battle.ts:32`, `ai.ts:56-80`) — nothing but one mid-band test guards that coupling.
3. **The plan's risk wording overstates one detail**: there is no 80% threshold. Gates are `ATTACK_PROB_FREE = 0.6` and `ATTACK_PROB_IMPORTANT = 0.4` (`ai.ts:24-25`). The archive plan's "40/60/80%" was one-third invented. Backport candidate for `test-plan.md` §2.
4. **Cheapest layer confirmed: unit tests in vitest**, extending the existing colocated suite. The exported surface is ideal for characterization/golden tests: `planAiTurn`, `planAiProduction`, `aiWinProbability`, `cityTargetValue` (`ai.ts`); `ROLL_SPREAD`, `rngStep`, `attackerStrength`, `defenderStrength`, `resolveBattle` (`battle.ts`); `gameReducer`, `createInitialGameState` (`game-state.ts`).
5. **Determinism is airtight today**: zero `Math.random`/`Date.now` in `src/lib` (the single `Date.now` is the campaign seed at `GameScreen.tsx:162`); all randomness flows through `state.rngSeed` → `rngStep` (mulberry32). Fixed state + seed ⇒ deterministic plan and execution. Existing tests already pin this (`ai.test.ts:204-215`, `game-state.test.ts:192`).

## Detailed Findings

### A. AI decision logic & plan execution (Risk #2)

Priority ladder in `planAiTurn` (`src/lib/ai.ts:169-305`), executed in order:

| Priority | Location | Threshold |
|---|---|---|
| P1 defend threatened city | ai.ts:175-201 | `GARRISON_RATIO = 1.0` (ai.ts:33) |
| P2 rescue unsupplied armies | ai.ts:203-211 | none — every unsupplied army |
| P3/P4 attacks on enemy cities | ai.ts:213-240 | `ATTACK_PROB_FREE = 0.6`, `ATTACK_PROB_IMPORTANT = 0.4` (ai.ts:24-25) |
| P5 cut enemy supply | ai.ts:242-281 | free move, or attack with p >= 0.6 |
| P6 grouping | ai.ts:283-301 | only when objective p < 0.4 |
| Production | ai.ts:382-446 | 40/30/20/10 mix; `treasuryTotal > 2 * income` shifts toward tanks (ai.ts:398) |

- **Silent attack disappearance**: P3/P4 is one loop over threshold pairs (ai.ts:230-240); `bestAttack` returning `null` means the attack falls through to P5/P6 with no signal. Threshold constants are bare, untested literals — raising `ATTACK_PROB_FREE` or changing `GARRISON_RATIO` can make P1 consume all `acted` armies before P3, and no test notices.
- **Illegal planned action — the load-bearing quote** (`src/lib/game-state.ts:274-278`):

  ```ts
  } catch (error) {
    // An illegal planned action (the world changed under the plan): drop
    // it and move on — the AI is not fatal. Developer errors propagate.
    if (isDomainError(error)) return { ...state, aiPlan: rest };
    throw error;
  }
  ```

  The dropped action never reaches `aiLogEntry` (game-state.ts:280+); plan/execution mismatch is structurally invisible.
- **Input blocking is UI-only**: the reducer guards only `endTurn` during replay (game-state.ts:217). `moveArmy`/`attackArmy`/`orderUnit` check `winner` only (game-state.ts:168-215) — a player action dispatched mid-replay would mutate the world under the plan, feeding the silent-swallow path.
- `aiWinProbability(attack, defense)` (ai.ts:56-80) is a closed-form integral over the exact piecewise roll distribution; it shares `ROLL_SPREAD` with `resolveBattle` by construction, and that constant is the only coupling guard.

### B. Battle resolution mechanics (Risk #3)

- **Modifiers are additive on integers**, in fixed order. Attacker (`attackerStrength`, battle.ts:78-118): base Σ attack → artillery support (+2, only if > 0) → river penalty (−3, not vs city) → unsupplied penalty → clamp at 0 (battle.ts:111-116, labeled `"Siła nie spada poniżej 0"`). Defender (`defenderStrength`, battle.ts:131-174): Σ defense per army → −25% per unsupplied army → city/terrain bonus (only if > 0) → clamp at 0 (battle.ts:167-172, defensive).
- **Rounding**: `supplyPenaltyOf = Math.round(strength * 0.25)` (battle.ts:120-123); the half-up boundary is pinned by `battle.test.ts:379`. Switching to floor/trunc shifts strength by 1 at strength ≡ 2 (mod 4).
- **RNG**: one battle consumes three draws from seeded mulberry32 (`rngStep`, battle.ts:57-63): attacker roll, defender roll, winner-losses roll; multiplier ∈ [0.8, 1.2) (battle.ts:218-219); tie → defender wins (strict `>`, battle.ts:220). `resolveBattle` is pure and returns `nextSeed`; callers must write it back (game-state.ts:190-193, 262-267).
- **Clamp — both return paths guarded**:
  - Attacker wins (battle.ts:232-281): `cap = Math.min(Math.ceil(ratio * winnerUnits), winnerUnits - 1)` (battle.ts:227-229); attacker keeps ≥ 1 unit (battle.ts:246); defenders removed wholesale.
  - Defender wins (battle.ts:284-315): attacker removed; losses land on the last defender army, locally re-clamped `Math.min(winnerLosses, lastDefender.units.length - 1)` (battle.ts:287-288).
- **Ownership**: `fieldOwners` is overwrite-only — ownerless fields are structurally unreachable. Attacker win flips the marched path + target (battle.ts:253-259); captured cities lose production queues via rebuild (battle.ts:261-263).
- **Degenerate input note**: `resolveBattle` does not validate `army.units.length > 0`; a hypothetical zero-unit army would pass with 0 losses (engine never produces one — `armySpeed` throws on empty, movement.ts:28-30).

### C. Existing test coverage and gaps

Conventions (vitest, colocated `src/lib/*.test.ts`, explicit `{describe,it,expect}` imports, no shared test-utils module): fixture builders `units`/`army`/`stateWithArmies` copy-pasted across battle/ai/movement tests; `drainAiTurn` helper in game-state.test.ts:13-21; seeds cited in test titles; map-sanity describes pin real adjacency (ai.test.ts:260-269, victory.test.ts:69-76).

Covered today (do not re-build):
- Battle: per-modifier strength tests (artillery, river, forest, mountains, city, multi-army, supply both sides), winner-loss clamps (attacker battle.test.ts:161, defender :202-220), ownership flip (:222-243), capture + queue cancel + endTurn composition (:245-275), determinism per seed (:277), throw paths (:285-295), deathLog (:306-365).
- AI: all six priority golden scenarios (ai.test.ts:83-187), `aiWinProbability` band edges + brute-force mid-band (:32-52), plan determinism (:204-215), staged drain end-to-end (game-state.test.ts:192), report-slot separation (:399), freeze (:608), one illegal-move skip test (:463-482).

Gaps mapped to the risks:

| # | Gap | Natural home |
|---|-----|--------------|
| G1 | No boundary-value gate tests — no scenario lands exactly on 0.40 / 0.60; threshold constants unpinned | extend `ai.test.ts` (ladder + probability describes) |
| G2 | `aiWinProbability` decoupled from gates — nothing ties computed probability to a planner decision at the boundary | extend `ai.test.ts` |
| G3 | Illegal-action coverage is single-case: untested are stale planned `attack`, illegal `order`, consecutive skips, illegal action as last entry (rollover path, game-state.ts:277 vs :288), and dev-error propagation through `aiStep`'s `isDomainError` (the most pointed gap — the lesson's hazard is tested for `attackArmy` at game-state.test.ts:381 but not for `aiStep`) | extend `game-state.test.ts` (template: :463) |
| G4 | No planner-legality invariant / multi-turn soak ("plan applies cleanly on the state it was planned from"; AI never stalls, never farms income) | new `src/lib/ai-simulation.test.ts` (keep golden files readable) |
| G5 | No seed sweep / distribution invariants — all outcomes pinned at seeds 1/6/99; a modifier tweak can flip outcomes at other seeds silently | extend `battle.test.ts` (sweep describe: invariants over matchup × seed matrix) |
| G6 | Mutual-annihilation guarded only by two single-seed tests; `ratio >= 1` upset space exercised once | same sweep describe |
| G7 | Untested defensive branches: below-zero attacker clamp (battle.ts:111-116, admitted in prose at battle.test.ts:88-89); 0-vs-0 tie (battle.ts:220); intermediate-path free-capture queue cancel (battle.ts:253-263) | extend `battle.test.ts` |

Surprises: no skipped/dead tests; a dead ternary arm in ai.test.ts:213-214; duplicated fixture helpers (candidate shared test-utils — decide during planning); Polish modifier-label assertions make label renames test failures (acceptable: labels are spec-explainable arithmetic).

## Code References

- `src/lib/game-state.ts:274-278` — silent-swallow of illegal planned AI actions (Risk #2 core)
- `src/lib/game-state.ts:314-330` — dead defensive branch for swallowed attacks
- `src/lib/game-state.ts:168-217` — reducer guards `winner` only for player actions; `endTurn` guarded vs `aiPlan`
- `src/lib/ai.ts:24-25,33` — `ATTACK_PROB_FREE/IMPORTANT`, `GARRISON_RATIO` (unpinned literals)
- `src/lib/ai.ts:169-305` — priority ladder; ai.ts:230-240 null-`bestAttack` fallthrough
- `src/lib/ai.ts:56-80` — analytic win probability (closed form)
- `src/lib/battle.ts:32` — `ROLL_SPREAD = 0.2`, exported for the coupling with `aiWinProbability`
- `src/lib/battle.ts:227-229` — global winner-loss cap; `src/lib/battle.ts:287-288` — local re-clamp (last defender)
- `src/lib/battle.ts:111-116` — below-zero attacker clamp (defensive, untested)
- `src/lib/battle.ts:218-220` — roll multiplier [0.8,1.2), tie→defender
- `src/lib/battle.ts:253-263` — path flip + captured-city queue cancel
- `src/types.ts:178,184` — `fieldOwners` overwrite-only; `rngSeed` in `GameState`
- `src/lib/game-state.test.ts:463-482,381` — the single illegal-skip test; the player-path dev-error test (template for G3)
- `src/lib/battle.test.ts:161,202,379` — clamp tests; rounding boundary

## Architecture Insights

- The engine is a pure, deterministic core (`src/lib`) with all randomness behind `state.rngSeed` — an unusually clean surface for characterization tests. Golden tests can pin exact plans and exact battle outcomes per seed.
- The `aiWinProbability` ↔ `resolveBattle` contract lives in one shared constant (`ROLL_SPREAD`). A drift test asserting "analytic probability ≈ seeded simulation frequency across the strength plane" turns that convention into an enforced contract.
- Plan/execution observability is the one genuine design gap surfaced: `aiTurnLog` records executed actions only; dropped actions are unobservable. A regression test can detect drops by comparing `aiPlan` length before vs `aiTurnLog` length after (2 entries per executed action), but a dedicated counter/trace would make the invariant cheap — a small product change to propose in planning (out of Phase 1's test-only scope unless the plan says otherwise).
- Fixture duplication across three test files is a drift risk; a shared `test-utils` module is a natural sub-phase companion when adding the sweep + boundary tests.

## Historical Context (from prior changes)

- `context/archive/2026-09-03-ai-opponent/plan.md` — source of the "40/60/80%" claim; research shows 80% does not exist. Also documented "illegal queued actions skipped silently" as accepted behavior — the risk keeps it as an observability gap, not a bug claim.
- `context/archive/2026-09-02-battle-city-capture/plan.md` — clamp and RNG-purity rationale (verified in code).
- `context/foundation/lessons.md` — "bare catch must not mask developer errors": `aiStep`'s catch filters with `isDomainError` correctly, but is the one backstop without a corresponding propagation test (G3).

## Related Research

- None prior. This is the first `research.md` under `context/changes/` for the testing rollout (Phase 1 of `context/foundation/test-plan.md`).

## Open Questions

1. Should observability of dropped AI actions be added as a tiny counter/field in `aiTurnLog` (product change) during Phase 1, or should tests detect drops only via plan-vs-log length comparison (test-only, per Phase 1 scope)? → decide in `/10x-plan`.
2. Should the duplicated fixture helpers be consolidated into a shared test-utils module as part of this phase, or deferred to keep the diff test-only? → decide in `/10x-plan`.
3. Sweep size: how many seeds × matchups before the sweep costs more runtime than signal (vitest `npm test` runs in CI)? → decide in `/10x-plan` (propose seeding deterministically, e.g. seeds 0..99 over a fixed small matchup matrix).
