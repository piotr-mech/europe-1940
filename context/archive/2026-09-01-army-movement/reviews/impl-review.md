<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Armies and Movement Implementation Plan

- **Plan**: `context/changes/army-movement/plan.md`
- **Scope**: Phases 1–3 of 3 (full plan; commits 5e0dbff, 44e1e5f, 6f25e4c, dbbb8cb)
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: [0 critical] [2 warnings] [3 observations]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria evidence

- `npm test` — 40/40 pass. `npm run lint` — pass. `npm run build` — pass (re-run during review).
- Manual items 2.4 and 3.4 confirmed by the user in-session (board interactions; panel content).
- Plan-vs-code sweep (agent): every planned item MATCH; no MISSING, no EXTRA scope, all "NOT Doing" guardrails respected.

## Findings

### F1 — Merge-cap overflow targets are highlighted but unclickable-movable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/movement.ts:108-110, src/components/game/GameScreen.tsx:135-140
- **Detail**: `reachableFields` treats own-army fields as passable merge targets and `BoardMap` draws reach rings on them, but the reach computation ignores the 8-unit cap that `applyMove` enforces. Clicking such a highlighted field dispatches `moveArmy`, `applyMove` throws "would exceed the 8-unit limit", and the throw escapes the reducer into the event handler: the move silently fails with only a console error. Latent today (the four draft armies are 4+4=8, which passes), but unit production in S-03 makes it ordinary gameplay.
- **Fix**: Exclude merge targets that would exceed the 8-unit cap from the reach set (filter in `computeReach` or inside `reachableFields`), so the highlight never promises a move the engine would reject.
  - Strength: Removes the whole failure class at the source — UI and engine agree by construction.
  - Tradeoff: `reachableFields` needs the cap rule (one extra condition) or the filter lives one layer up.
  - Confidence: HIGH — same pattern as the existing enemy-army blocking inside `reachableFields`.
  - Blind spot: None significant.
- **Decision**: FIXED (filter in `reachableFields` + test + registry row update)

### F2 — Reducer's moveArmy branch is a partial function; throws escape dispatch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/game-state.ts:100-101
- **Detail**: `gameReducer` calls `applyMove` unsafely. `onFieldClick` guards with `reachable.has(fieldId)` against the same render, so the race is practically unreachable today, but `computeReach` wraps its engine call in try/catch while the dispatch path — the only one that mutates state — does not; the asymmetry is inverted. With F1 unfixed, any throw becomes a silent no-op.
- **Fix**: Wrap the `moveArmy` branch in try/catch returning the unchanged state on error (totality by contract), pairing with F1's source fix.
- **Decision**: FIXED (try/catch backstop in the reducer)

### F3 — Plan said "memoized reachable set"; code recomputes per render

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/game/GameScreen.tsx:117
- **Detail**: The plan's Phase 2 contract says "(memoized)"; `computeReach` is a plain function called every render. Functionally equivalent at 29 nodes — the only measurable drift the plan-vs-code sweep found.
- **Fix**: Wrap in `useMemo` on `[state, selectedArmyId]`, or accept as-is and treat plan wording as aspiration.
- **Decision**: SKIPPED (29 nodes — no effect; plan wording treated as aspiration)

### F4 — Merge discards the mover's spent movement

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/movement.ts:112-123
- **Detail**: In the merge branch, `plan.cost` is never subtracted and the merged stack keeps the standing army's movement points (a test locks this deliberately). Consequence: a fully-spent army can merge into a fresh stack and the combined units move again this turn. Acceptable prototype simplification; confirm intent vs the spec when S-03/S-04 make it observable.
- **Fix**: None now — revisit at S-03 and adjust the rule or the test if the free-remount exploit matters.
- **Decision**: SKIPPED (deliberate simplification; revisit at S-03/S-04)

### F5 — pointercancel treated as a click

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/BoardMap.tsx:197
- **Detail**: `onPointerCancel={onPointerUp}` means a browser-cancelled gesture with sub-threshold movement runs the full click hit-test and may change selection on an interrupted gesture. Unlikely and mild.
- **Fix**: Early-return on cancel (separate handler that only clears dragRef).
- **Decision**: FIXED (dedicated `onPointerCancel` handler)
