<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Supply Lines and Unsupplied Penalties

- **Plan**: context/changes/supply-lines/plan.md
- **Scope**: Full plan review (Phases 1-2 of 2)
- **Date**: 2026-09-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (F2 — registry entry partially delivered) |
| Scope Discipline | PASS (no "NOT Doing" leaks; GameState untouched) |
| Safety & Quality | WARNING (F1 — misleading movement display) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (123/123 tests, lint, build green; manual 2.4 user-confirmed; F7 notes one promised test case composed away) |

## Findings

### F1 — Panel "Ruch" denominator ignores the supply cap

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UI correctness)
- **Location**: src/components/game/DetailPanel.tsx:93
- **Detail**: The army panel renders `Ruch: movementPoints / armySpeed(army)`. A capped (unsupplied) tank army shows `1 / 2` — reads as "half movement spent" when 1 is actually the full allowance. `movementAllowance` is declared the single source of truth for the cap (contract-surfaces) and sits one row above the new `Zaopatrzenie` row.
- **Fix**: Use `movementAllowance(state, army)` as the denominator.
  - Strength: Display consistent with the cap and the supply row; one-line change.
  - Tradeoff: None significant.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED ("Ruch" row denominator now movementAllowance)

### F2 — contract-surfaces registry incomplete: stale row, missing strength-helper coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: docs/reference/contract-surfaces.md:27-32
- **Detail**: Plan item 6 promised registering the battle-strength signature change with consumers; only `isSupplied`/`movementAllowance` rows were added. Additionally the `Army.movementPoints` row still says "reset to `armySpeed` by `endTurn`" — stale since the reset now goes through `movementAllowance`; and the `resolveBattle` row does not mention supply derivation.
- **Fix**: Update the `Army.movementPoints` row (reset via `movementAllowance`, consumers + S-05), mention supply penalties in the `resolveBattle` row, and add rows for `attackerStrength`/`defenderStrength` (now taking supply params) with their consumers.
  - Strength: Registry matches reality; future slices (S-06) read it as ground truth.
  - Tradeoff: None.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: FIXED (Army.movementPoints row updated, resolveBattle row mentions supply, attackerStrength/defenderStrength rows added)

### F3 — isSupplied never checks the start field's owner (invariant unguarded)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — worth pausing; a durability decision for S-06/S-08
- **Dimension**: Safety & Quality
- **Location**: src/lib/supply.ts:33-51
- **Detail**: The BFS starts at `army.fieldId` without checking ownership; the invariant "armies always stand on their owner's field" was verified to hold across all engine paths today, but it lives only in a comment. If S-06 (AI) or S-08 (persistence/migration) ever breaks it, an army on an enemy city would read as supplied instead of cut off.
- **Fix**: Add `if (state.fieldOwners[army.fieldId] !== army.owner) return false;` as a defensive guard.
  - Strength: One line, matches the module's defensive style, removes the implicit assumption.
  - Tradeoff: Behaviorally dead today (unreachable state).
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (start-field ownership guard added; unknown-id validation preserved via getField; trivial own-city short-circuit; five fixtures relocated to own-soil setups)

### F4 — Asymmetric 0-clamp in defenderStrength

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/battle.ts:163
- **Detail**: `defenderStrength` clamps at 0 without the balancing "Siła nie spada poniżej 0" modifier entry that `attackerStrength` deliberately adds (S-04 review F4). Unreachable with current data (penalty ≤ 25%, bonuses positive) — the same defensive case the attacker side handles.
- **Fix**: Mirror the attacker's balancing-entry logic.
- **Decision**: FIXED (defender-side balancing entry mirrors the attacker's)

### F5 — Amber marker grazes the selection outline and sits outside the token hit-test

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UI polish)
- **Location**: src/components/game/BoardMap.tsx:308-331
- **Detail**: The marker (`cy = tokenY − 4`, r 2.5) overlaps the selected-army outline band (`tokenY−2.75 … tokenY−1.25`) by ~0.5 units, and its top (`tokenY−6.5`) is above the token hit-test padding (`tokenY−3`) — clicking the dot itself selects the field, not the army.
- **Fix**: Move to `cy = tokenY − 5.5` (clears both) or render the marker after the selection rect.
- **Decision**: FIXED (marker moved to cy = tokenY − 5.5)

### F6 — Dead Math.min in movementAllowance

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supply.ts:59
- **Detail**: `Math.min(armySpeed(army), 1)` — every unit type has movement ≥ 1, so the min never binds. Harmless defensive code; noted so future balance work (a 0-movement unit) doesn't misread it.
- **Fix**: None — keep as defensive.
- **Decision**: SKIPPED (kept as deliberate defensive code; noted for future balance work)

### F7 — Two promised test cases composed away

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria (test coverage)
- **Location**: src/lib/battle.test.ts (absent)
- **Detail**: The plan's success criteria mention "both sides unsupplied" and an integration check "move/battle in the same turn still allowed at full pre-cap points"; neither exists verbatim. Coverage is real (attacker-side, defender-side, mixed defenders, reducer cap, and existing move/battle tests exercise the branches) — the combined cases are trivial compositions.
- **Fix**: Add a both-sides-unsupplied battle test (and optionally the same-turn integration test) — a few lines each.
- **Decision**: FIXED (both-sides-unsupplied test added: A18−5 vs D20−5, both modifiers asserted; same-turn integration left composed — covered by existing move/battle suites)

### F8 — Relocated S-04 fixtures and Set-based defender parametrization (accepted deviations)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/battle.test.ts:147-159,174-182; src/lib/battle.ts:127
- **Detail**: Two S-04 fixtures moved to own-soil battles (Lublin/Volhynia) because supply correctly penalizes armies on enemy ground — in-intent (the plan itself notes armies stand on their owner's field after S-04), expectations (18 vs 20, seed 6) unchanged, documented in the commit. `defenderStrength` takes a `Set` of army ids instead of the sketched callback — explicitly the implementer's call per the plan.
- **Fix**: None — accept as documented.
- **Decision**: ACCEPTED (relocations in-intent and documented; Set parametrization explicitly the implementer's call per the plan)
