<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Armies and Movement Implementation Plan

- **Plan**: `context/changes/army-movement/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-01
- **Verdict**: REVISE
- **Findings**: [0 critical] [4 warnings] [3 observations]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

Grounding: 7/7 paths ✓, 6/6 symbols ✓, brief↔plan ✓
Deep verification: Claim 1 CONFIRMS (with wording caveat), Claim 2 CONTRADICTS (onClick vs pointer capture), Claim 3 CONTRADICTS (merge needs one End Turn), Claim 4 CONTRADICTS (required field breaks test literals).

## Findings

### F1 — onClick on SVG children unreliable with existing pointer capture

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Click handling on the map
- **Detail**: `BoardMap.tsx:81-84` calls `setPointerCapture` unconditionally on every pointerdown; with active capture, pointer events and the synthesized click are retargeted to the SVG root, so plain `onClick` on `<circle>`/`<rect>` children is unreliable. The plan promises both "field circles get click handlers" (Phase 2 contract) and a down/up distance threshold (Critical Implementation Details) — mutually exclusive approaches.
- **Fix A ⭐ Recommended**: Manual click detection on the root — record down coords on pointerdown; on pointerup, if the distance is under a threshold, hit-test the nearest field/token by `field.x`/`field.y` from the dataset.
  - Strength: existing pan stays untouched; one uniform click mechanism for terrain circles (r=4), cities (r=6), and token rects (18×9) regardless of element size.
  - Tradeoff: own hit-testing instead of DOM `event.target`.
  - Confidence: HIGH — the render is a pure function of (GameData, GameState) and field coords live in the data.
  - Blind spot: the pixel threshold must account for zoom (scale with the viewBox ratio).
- **Fix B**: Defer `setPointerCapture` until the drag threshold is exceeded, letting genuine clicks pass through to children.
  - Strength: real clicks reach children — plain onClick works.
  - Tradeoff: complicates pan (delayed capture start); two mechanisms instead of one.
  - Confidence: MEDIUM — retargeting subtleties with late capture are unverified in this project.
  - Blind spot: none significant.
- **Decision**: FIXED

### F2 — DetailPanel contract lacks a terrain-field variant promised by Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — DetailPanel props
- **Detail**: The `selected` union has only `kind: "city" | "army"`, but Phase 3 wiring says "terrain fields render owner + terrain info" and the Desired End State says "click any field or army". The implementer hits a contract gap mid-build.
- **Fix**: Extend the union with `{ kind: "field"; fieldId: string }` and add a terrain view (owner, terrain type, movementCost, defensive bonus).
- **Decision**: FIXED

### F3 — `movementPoints` is not additive: breaks three Army literals in tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Army movement points; Migration Notes
- **Detail**: `game-state.test.ts:68,82,95` constructs `Army` literals with explicit type annotations — a new required field is a compile error there, and `game-state.ts:55-61` (INITIAL_ARMIES mapping) also needs the field. The plan's Migration Notes call the change "additive", which is false in light of the tests.
- **Fix**: State explicitly in the Phase 1 contract: update the three literals in `game-state.test.ts` and the construction in `createInitialGameState`; soften the Migration Notes wording.
- **Decision**: FIXED

### F4 — Phase 2 criterion "enemy army click selects nothing" contradicts Phase 3

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 vs Phase 3 — manual criteria
- **Detail**: Phase 2 manual: "clicking an enemy army selects nothing"; Phase 3: "clicking an enemy army shows its composition". Sequentially contradictory — Phase 2's criterion is immediately superseded.
- **Fix**: Unify: an enemy-army click never creates a movement selection, but (from Phase 3) opens the inspection panel. Reword the Phase 2 criterion to "no movement selection or highlight".
- **Decision**: FIXED

### F5 — movement.ts contract wording: city cost special-case and applyMove ownership sentence

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — movement module contract
- **Detail**: (a) `TERRAIN` has no "city" key (`Record<TerrainType, …>`), so cost 1 for cities doesn't follow "from the missing entry" — the engine must explicitly special-case `FieldType "city"`. (b) The "any army may be moved … not special-cased" sentence is convoluted; the planning decision was: the UI restricts to own armies, the engine accepts any army (useful in tests; the AI arrives in S-06).
- **Fix**: Add a city-cost special-case clause; rewrite the applyMove ownership sentence as the crisp two-part rule.
- **Decision**: FIXED

### F6 — contract-surfaces.md registry update not planned

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 / References
- **Detail**: New load-bearing names (`movement.ts`: `armySpeed`/`reachableFields`/`planMove`/`applyMove`; `Army.movementPoints`; new `GameAction` variants) won't be in the registry unless a step says so — S-04/S-05 consume these surfaces.
- **Fix**: Add a Phase 1 step: update `docs/reference/contract-surfaces.md`.
- **Decision**: FIXED

### F7 — Merge not manually testable on turn 1

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Manual Verification
- **Detail**: Berlin and Warsaw share no common neighbor within one 1-cost step each (berlin → oder-plains/pomerania-plains; warsaw → bzura-river/vistula-river/radom-plains/lublin-plains/bug-river). Shortest rendezvous is poznan: T1 G1→oder-plains and G2→bzura-river, End Turn, T2 both → poznan (merge 4+4=8).
- **Fix**: Extend manual criterion 2.4 with the two-turn scenario (which also exercises the movement reset).
- **Decision**: FIXED
