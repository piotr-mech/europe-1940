<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Battle and City Capture

- **Plan**: context/changes/battle-city-capture/plan.md
- **Scope**: Full plan review (Phases 1-4 of 4)
- **Date**: 2026-09-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 7 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (minor in-intent drifts documented as F9) |
| Scope Discipline | PASS (no "NOT Doing" leaks; Phase 4 added to plan as addendum before implementation) |
| Safety & Quality | WARNING (F1, F2) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (npm test 104/104, lint, build green; manual 3.4/3.5/4.4 user-confirmed) |

## Findings

### F1 — Attack victory does not flip intermediate path fields (move vs attack inconsistency)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (rules consistency)
- **Location**: src/lib/battle.ts:189 vs src/lib/movement.ts:184-193
- **Detail**: `applyMove` flips every non-city field on the marched path, but a victorious attack flips only the target field — the same physical march produces different ownership. A winning attacker can end up standing on captured enemy ground surrounded by enemy terrain (an enclave behind lines). The rule is one-sentence explainable but differs from its move-side twin (FR-009 ownership consistency).
- **Fix A ⭐ Recommended**: Flip intermediate non-city fields on attacker victory (mirror `applyMove`'s path flip; `attackFields` gains a path in its result)
  - Strength: One consistent rule — "fields the army marched through become its owner's" — regardless of move or attack; removes the enclave oddity.
  - Tradeoff: `attackFields`/`resolveBattle` change plus tests; slightly stronger capture by attack (balance shifts).
  - Confidence: HIGH — the mechanism already exists in `applyMove` to copy.
  - Blind spot: Playtest feel — path capture on attack makes deep strikes stronger.
- **Fix B**: Keep as-is and document the intentional difference in the plan/code comment
  - Strength: Zero code change; defensible as "only the fought-over field changes hands".
  - Tradeoff: Two subtly different ownership rules for the same traversal.
  - Confidence: MED — explainable, but the asymmetry will resurface in S-05 supply evaluation.
  - Blind spot: How S-05 supply pathing treats the enclave.
- **Decision**: FIXED (Fix A — attacker victory flips the marched path exactly like `applyMove`; `attackFields` carries paths; test coverage added; 105 tests green)

### F2 — BattlePopup playback does not reset when the report changes (latent)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/game/BattlePopup.tsx:82 + src/components/game/GameScreen.tsx
- **Detail**: `deathsShown` is component state and `<BattlePopup>` renders without a `key`; a new report mid-playback would inherit the old counter (playback starts mid-way or instantly "finished"). Unreachable today (the overlay blocks every dispatch path), but S-06 (AI turn) and S-08 (persistence) may break that assumption.
- **Fix**: Give the popup a per-battle key (e.g. `key={state.rngSeed}`, which advances every battle) so a new report remounts the component with a fresh counter.
  - Strength: One attribute; removes the entire latent class regardless of future dispatch paths.
  - Tradeoff: None significant.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (BattlePopup keyed by `state.rngSeed` — a mid-playback report change remounts with a fresh counter)

### F3 — Bare `catch {}` in UI derivations (lesson pattern) + unfilled lessons.md placeholders

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/game/GameScreen.tsx:233,243; context/foundation/lessons.md:9-10
- **Detail**: `computeReach`/`computeAttackTargets` swallow all errors (pre-existing pattern for computeReach, extended to attack targets); a TypeError inside would silently show no highlights. Also, the registered lesson's `Rule`/`Applies to` fields are still `<to be filled in>`.
- **Fix**: Extract `isDomainError` to a shared helper used by both the reducer and the UI derivations; fill in the lessons.md placeholders.
- **Decision**: FIXED (`isDomainError` exported from game-state.ts, used in computeReach/computeAttackTargets with rethrow; lessons.md Rule/Applies-to filled)

### F4 — Attack-strength clamp at 0 desynchronizes from the report's modifier list

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (NFR: explainable outcomes)
- **Location**: src/lib/battle.ts:81-92
- **Detail**: `attackerStrength` clamps `total` at 0 but keeps raw modifier amounts — a lone infantry across a river reports "Siła ataku 0" next to modifiers summing to −1.
- **Fix**: Add a balancing modifier entry when the clamp engages (e.g. "Kara przewagi −1") or annotate the report.
- **Decision**: FIXED (balancing entry "Siła nie spada poniżej 0" added for below-zero totals; verified the current-data boundary 3−3=0 is already arithmetic-consistent — test documents both)

### F5 — Battle popup has no skip and no focus management

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; UX/a11y decision, not a bug
- **Dimension**: Safety & Quality (UX/a11y)
- **Location**: src/components/game/BattlePopup.tsx:85-114
- **Detail**: A 9-death battle blocks the screen ~10 s with no Escape/overlay-click skip; `role="dialog"` without `aria-modal` or a focus trap. Timers are correctly cleaned up; functionality is correct.
- **Fix**: Overlay click / Escape = immediate close; optionally `aria-modal="true"`. Could also land as UI polish in a later slice.
- **Decision**: FIXED (backdrop click = immediate close, card click stopped; Escape/focus-trap left for UI polish)

### F6 — Multi-defender battle path untested

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria (test coverage)
- **Location**: src/lib/battle.ts:165-167,217-219
- **Detail**: The most bespoke branch — global cap but losses applied to the last defending army with a per-army clamp — has no `resolveBattle` test through two defender armies (only `defenderStrength` sums them).
- **Fix**: Add a test: 2 defender armies (4+1 units), attacker loses — assert applied losses ≤ 4, last army keeps ≥1 unit, `defenderLosses === appliedLosses`.
- **Decision**: FIXED (test added: 2+2 defenders vs 4 infantry, seed 6 — raw draw 3 clamped to 1 on the last defender, report shows the applied count)

### F7 — Zero-strength attack is offered by the UI

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — conscious game-design decision to confirm
- **Dimension**: Safety & Quality
- **Location**: src/lib/battle.ts:92,159-161 + src/components/game/BoardMap.tsx:280-295
- **Detail**: A 0-strength attacker (lone infantry across a river) always loses, yet gets the red attack ring — the player can throw an army away with zero chance. Explainable, so within contract; recorded for conscious acceptance.
- **Fix**: None required — accept as designed (or hide zero-chance rings later if playtesting flags it).
- **Decision**: ACCEPTED (conscious design: an explainable rule — a zero-strength attack always loses; revisit only if playtesting flags it)

### F8 — Test helpers duplicated across suites

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/battle.test.ts:10-41 vs src/lib/movement.test.ts:8-35
- **Detail**: `field`/`failWith`/`units`/`army`/`stateWithArmies`/`findArmy` copied 1:1 — consistent with the repo's deliberate per-suite self-containment (same decision was consciously SKIPPED in the S-03 review).
- **Fix**: Revisit only if S-06 adds a third copy (extract `src/lib/test-utils.ts` then).
- **Decision**: SKIPPED (deliberate per-suite self-containment, same call as the S-03 review; extract on the third copy)

### F9 — Minor plan drifts, all in-intent (documented)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/game/GameScreen.tsx:56-61,124-125; src/types.ts:114-134; GameScreen.tsx:142-146; battle.ts:142-144
- **Detail**: (a) popup opens via a derived `dismissedReport` marker instead of the planned `useEffect` — forced by `react-hooks/set-state-in-effect`, behavior-equivalent; (b) `BattleReport` is richer than the plan sketch (`attackerWins` + structured per-side modifiers instead of `winner` + `string[]`) — serves the stated intent; (c) clicking an enemy army token also attacks (not just the field ring) — matches the select-then-click flow; (d) multi-army defense generalized defensively (unreachable in S-04 since the AI never moves). No MISSING items; every planned change is implemented.
- **Fix**: None — accept deviations as documented.
- **Decision**: ACCEPTED (all four deviations in-intent and documented here and in code comments)
