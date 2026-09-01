# Armies and Movement Implementation Plan

## Overview

Slice S-02 of roadmap milestone M-1: the player can move armies between connected fields within movement points (slowest unit sets the pace, terrain changes the cost), combine own armies into one (max 8 units), advance the turn to reset movement, and inspect city and army details in a side panel. Covers FR-004, FR-005, FR-006 and the "When" half of US-01's movement step. Combat stays out (S-04).

## Current State Analysis

S-01 (`context/archive/2026-08-31-new-game-map-view/`) delivered the new-game flow and a read-only board map:

- `GameState` already carries `armies: Army[]` (`src/types.ts:103-117`) with four draft starting armies (`INITIAL_ARMIES`, `src/lib/game-state.ts:17-42`); the ≤8-units invariant is already tested (`src/lib/game-state.test.ts:36-49`).
- Movement data already exists in the validated dataset: `UnitType.movement` (`src/types.ts:66-78`; infantry 1, tank 2, artillery 1, antiTank 1), `TerrainStats.movementCost` (`src/types.ts:81-85`; mountains 2, rest 1), and the symmetric `connections` graph over 29 fields (`src/data/map.ts`).
- `gameReducer` has a single `startGame` action and explicitly anticipates S-02 interaction actions (`src/lib/game-state.ts:88-104`).
- `BoardMap.tsx` renders one SVG with zoom/pan and static army tokens (rect + `count·dominant-letter`), but no click/selection/highlight interactions (`src/components/game/BoardMap.tsx:53-58, 188-211`).
- No panel components exist anywhere (shadcn has only `ui/button.tsx` installed); game screens use raw Tailwind.
- State is in-memory `useReducer` in `GameScreen.tsx` (persistence is S-08).

### Key Discoveries:

- `BoardMap` currently takes only `state: GameState` and self-loads `getGameData()` (`BoardMap.tsx:21-23, 60`) — interaction props (selection, reachable set, callbacks) are additive, the render stays pure.
- The pointer handlers on the SVG root implement pan-drag (`BoardMap.tsx:81-102`); field clicks must be disambiguated from pans by a movement threshold.
- `gameReducer`'s discriminant check carries an `eslint-disable` that becomes unnecessary once a second action variant lands (`game-state.ts:96-99`).
- Pan-drag and zoom use slate colors `#f8fafc`/`#475569`/`#1e293b` (`BoardMap.tsx:145-146, 170`) — highlights should stay in that family.
- Germany's Blitzkrieg (+1 tank movement) and USSR's Rezerwy bonuses are description strings only (`src/data/countries.ts`) — deferred by decision.

## Desired End State

On `/game`, after starting a game, the player can:

1. Click an own army token → its reachable fields highlight (bounded by remaining movement points and terrain cost) → click a destination → the army moves there along the cheapest path.
2. Move an own army onto a field holding another own army → they merge into one token (blocked when the result would exceed 8 units).
3. Click "End turn" → turn number advances, all armies' movement points reset (the AI does nothing until S-06).
4. Click any field or army → a side panel shows details: city (owner, income, production slots, defense bonus) or army (owner, units with stats, remaining movement / speed).

Entering an enemy-owned field without an enemy army is allowed and flips that field's (non-city) ownership to the moving army's owner; fields containing an enemy army are impassable until S-04.

Verification: `npm test`, `npm run lint`, `npm run build` all pass; the four interactions above work on the live board (`npm run dev` → `/game`).

## What We're NOT Doing

- **No combat** — no battles, no city capture by force, no unit destruction (all S-04). City ownership never changes in S-02.
- **No split** — armies can merge but not split; splitting arrives with production-driven forming in S-03+.
- **No national bonuses** — Blitzkrieg and Rezerwy stay data-only descriptions until both are mechanically meaningful (Rezerwy needs S-03 costs).
- **No AI behavior** — "End turn" advances the turn and resets movement; the AI opponent acts from S-06.
- **No supply, no undo, no persistence** — supply is S-05, state persistence is S-08.
- **No component-test infrastructure** — UI verified manually; engine covered by vitest (matches S-01's deferral decision, reaffirmed in planning).

## Implementation Approach

Rules live in the domain layer (testable headlessly), UI stays a thin shell: a new `src/lib/movement.ts` owns speed/reachability/pathing; `gameReducer` gains `moveArmy` and `endTurn` actions that call it; `Army` gains `movementPoints` (remaining this turn, set to the slowest unit's `movement` on reset); `GameScreen` holds selection as React UI state and passes callbacks + the reachable set down to `BoardMap`; a hand-rolled `DetailPanel` component renders city/army details.

## Critical Implementation Details

- **State sequencing** — `moveArmy` must apply path, cost, ownership flips, and merge as one reducer step; recomputing reachability after a partial update would let a stale set authorize an illegal second move.
- **Click vs pan** — the SVG root captures the pointer unconditionally on pointerdown (`BoardMap.tsx:81-84`), which retargets subsequent pointer events (and the synthesized click) to the root — plain `onClick` on child circles/rects is therefore unreliable. Clicks must be detected manually on the root: record the down coordinates, and on pointerup treat a sub-threshold distance as a click, hit-testing the nearest field/token from the dataset's `field.x`/`field.y` (the threshold scales with the current viewBox ratio).

## Phase 1: Movement engine (domain)

### Overview

All movement rules as pure functions + reducer actions, fully covered by vitest. No UI changes.

### Changes Required:

#### 1. Army movement points

**File**: `src/types.ts`

**Intent**: Track each army's remaining movement for the current turn.

**Contract**: `Army` gains `movementPoints: number` (remaining points this turn). `createInitialGameState` initializes it to the army's speed. This is not a purely additive change: the construction in `createInitialGameState` (`src/lib/game-state.ts:55-61`) and the three `Army` literals with explicit type annotations in `src/lib/game-state.test.ts` (around lines 68, 82, 95) must all carry the new field or fail to compile.

#### 2. Movement module

**File**: `src/lib/movement.ts` (new)

**Intent**: Own every movement rule in one place: speed, reachability, pathing.

**Contract**:

- `armySpeed(army): number` — `min` over the army's units of `UnitType.movement` (slowest unit sets the pace, FR-005).
- `movementCostOf(field): number` — the field's movement cost; city fields are explicitly special-cased to cost 1 (`TERRAIN` is keyed only by the four terrain types — `FieldType "city"` has no entry to read).
- `reachableFields(state, armyId): Map<fieldId, { cost: number; path: string[] }>` — Dijkstra over `connections` from the army's field, edge cost = `movementCostOf` of the destination field, only entries with `cost <= army.movementPoints`; nodes containing an enemy army (any army whose `owner` differs) are impassable; the army's own field and fields holding own armies are passable (merge targets).
- `planMove(state, armyId, targetFieldId): { path: string[]; cost: number } | null` — the cheapest path from `reachableFields`, `null` when unreachable.
- `applyMove(state, armyId, targetFieldId): GameState` — pure; throws on illegal moves (unreachable target, merge result over 8 units). The engine accepts moving any army regardless of owner (no AI exists until S-06, and tests move both sides' armies); the UI layer restricts movement commands to the player's own armies. Effects: subtract `cost` from `movementPoints`, set `fieldId` to the target, flip ownership of every **non-city** field entered along `path` (excluding the start field) to the moving army's owner, and if an own army occupies the target, merge (moving army removed from `armies`, its units appended to the standing army; id and position of the standing army win).

#### 3. Reducer actions

**File**: `src/lib/game-state.ts`

**Intent**: Expose movement and turn advance through the existing reducer.

**Contract**: `GameAction` union gains:
- `{ type: "moveArmy"; armyId: string; targetFieldId: string }` → `applyMove(state, ...)`
- `{ type: "endTurn" }` → `turn + 1` and every army's `movementPoints` reset to `armySpeed(army)`

The now-unnecessary `eslint-disable @typescript-eslint/no-unnecessary-condition` on the switch is removed.

#### 4. Contract-surfaces registry update

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Keep the load-bearing-names registry current so S-04/S-05 consume the new surfaces knowingly.

**Contract**: add rows for `movement.ts` (`armySpeed`, `movementCostOf`, `reachableFields`, `planMove`, `applyMove`), `Army.movementPoints`, and the new `GameAction` variants, with their consumers.

#### 5. Engine tests

**File**: `src/lib/movement.test.ts` (new), additions to `src/lib/game-state.test.ts`

**Intent**: Lock the rules before the UI exists.

**Contract**: cover — slowest-unit speed (mixed army moves 1, tank-only moves 2); mountains cost 2 (one mountain step exhausts an infantry army); unreachable targets rejected; enemy-army fields impassable; enemy-owned empty field passable and its ownership flips; city ownership never flips; merge under the 8-cap succeeds and over it throws; `movementPoints` decreases by path cost; `endTurn` resets movement and increments turn; initial armies start with full movement.

### Success Criteria:

#### Automated Verification:

- `npm test` passes (new movement tests + existing suite)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- None — phase is headless; UI lands in Phase 2.

**Implementation Note**: No manual gate needed; proceed to Phase 2 after automated checks pass.

---

## Phase 2: Selection and movement UX (map)

### Overview

Make the board interactive: click an own army to see its reach, click a destination to move, end the turn.

### Changes Required:

#### 1. Selection state and dispatch wiring

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Own the UI-only selection state and the reachable-set computation.

**Contract**: `useState<string | null>(selectedArmyId)`; whenever a selection exists, compute `reachableFields(state, selectedArmyId)` (memoized) and pass `{ selectedArmyId, reachable, onArmyClick, onFieldClick }` to `BoardMap`; `onArmyClick` selects (or deselects when already selected), `onFieldClick` dispatches `moveArmy` when the field is a reachable target of the selection (otherwise selects nothing / clears selection); header gains an "End turn" button dispatching `{ type: "endTurn" }` and displays the current turn (already present).

#### 2. Click handling on the map

**File**: `src/components/game/BoardMap.tsx`

**Intent**: Let field circles, city circles, and army tokens receive clicks without breaking pan-drag.

**Contract**: extend props with the Phase-2 contract above; clicks are detected manually on the SVG root (record pointerdown coordinates; on pointerup, a down/up distance under a zoom-aware threshold counts as a click and is hit-tested against the nearest field by `field.x`/`field.y` and army tokens by their offset positions — plain `onClick` on children is unreliable under the existing unconditional pointer capture); drags never fire clicks; own-player army tokens get a visible cursor affordance (`cursor-pointer`), enemy tokens and unselectable elements do not.

#### 3. Reach highlighting

**File**: `src/components/game/BoardMap.tsx`

**Intent**: Show where the selected army can go this turn.

**Contract**: reachable target fields render with a highlight ring (white/slate casing family consistent with existing strokes; distinct treatment for city vs terrain targets optional); the selected army token renders a selection ring; the highlight set re-derives purely from the `reachable` prop.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm test` still passes (no engine regressions)

#### Manual Verification:

- On `/game` (start any vs-AI game): clicking an own army highlights its reachable fields; clicking a highlighted field moves the army and the highlight collapses; movement respects terrain (an infantry army cannot cross two mountains); clicking an enemy army creates no movement selection or highlight (its inspection panel comes in Phase 3); drag-pan and wheel-zoom still work and never trigger a move; "End turn" increments the turn and restores movement (an exhausted army can move again); moving onto an own army merges tokens and an over-8 merge is refused with no state change; entering an enemy field recolors it but city fields never recolor.
- Merge is not reachable on turn 1 (Berlin and Warsaw share no common 1-cost neighbor); use the two-turn rendezvous: turn 1 move G1 Berlin→oder-plains and G2 Warsaw→bzura-river, press "End turn", then on turn 2 move both into poznan and verify the tokens merge into one 8-unit army — this also exercises the movement reset.

---

## Phase 3: Inspection panels (FR-006)

### Overview

A side panel showing details of the clicked field (city) or army.

### Changes Required:

#### 1. Detail panel component

**File**: `src/components/game/DetailPanel.tsx` (new)

**Intent**: One hand-rolled panel component rendering city or army details from the canonical dataset.

**Contract**: props `{ state, selected: { kind: "city"; fieldId: string } | { kind: "field"; fieldId: string } | { kind: "army"; armyId: string } | null }`; city view: name, owner country name/color swatch, income (`ResourceBag`), production slots, defense bonus; terrain-field view: name, owner, terrain type with its movement cost and defensive bonus; army view: owner, per-unit list (name, attack, defense, movement, bonusVsTank when set), aggregate `movementPoints / armySpeed`, dominant type marker; raw Tailwind, slate palette, Polish labels — no new dependencies.

#### 2. Panel wiring

**File**: `src/components/game/GameScreen.tsx`, `src/components/game/BoardMap.tsx`

**Intent**: Every clickable thing selects an inspectable subject.

**Contract**: selection state from Phase 2 widens to the panel's `selected` shape (army click selects the army, city/field click selects the field — cities render city details, terrain fields render owner + terrain info); board layout gains a side column showing `DetailPanel` beside `BoardMap`; deselect (click on empty map background) clears the panel.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `npm test` still passes

#### Manual Verification:

- Clicking a city opens the panel with its stats and owner; clicking an own army shows its units and remaining movement (updates immediately after a move and after "End turn"); clicking an enemy army shows its composition; clicking the map background closes the panel; panel content matches dataset values for at least one known city (e.g. Berlin: 3 slots) and army (e.g. G1: 2×infantry, 1×tank, 1×artillery, movement 1/1).

---

## Testing Strategy

### Unit Tests:

- `src/lib/movement.test.ts` — the full rule matrix listed in Phase 1 (speed, costs, reachability, blocking, ownership flips, merge cap, reset).
- `src/lib/game-state.test.ts` — reducer action coverage (`moveArmy`, `endTurn`) and initial `movementPoints`.

### Integration Tests:

- None — the game is a client-side island; cross-system integration is manual on `/game`.

### Manual Testing Steps:

1. Start a game as Germany vs USSR; verify all Phase 2 manual criteria.
2. Verify all Phase 3 panel criteria.
3. Refresh mid-game returns to setup (expected — persistence is S-08, not a regression).

## Performance Considerations

- `reachableFields` runs Dijkstra over 29 nodes on each selection — trivial; memoize per `(armies, selectedArmyId)` change and nothing more.

## Migration Notes

- `Army.movementPoints` adds a required field — see the Phase 1 contract for the existing construction sites that must be updated (three test literals plus `createInitialGameState`). No persisted state exists yet (S-08 later), so no data migration; the serialized shape simply grows before anything persists it.
- `INITIAL_ARMIES` drafts stay as-is this slice (tuning was noted for S-02/S-03 but no gameplay evidence demands a change yet; retune in S-03 when production meets movement).

## References

- Roadmap item: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` FR-004, FR-005, FR-006, US-01
- Predecessor plan: `context/archive/2026-08-31-new-game-map-view/plan.md`
- Load-bearing names: `docs/reference/contract-surfaces.md`
- Key code: `src/lib/game-state.ts:17-104`, `src/types.ts:95-117`, `src/components/game/BoardMap.tsx`, `src/components/game/GameScreen.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Movement engine (domain)

#### Automated

- [x] 1.1 `npm test` passes (new movement tests + existing suite)
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes

#### Manual

(none — headless phase)

### Phase 2: Selection and movement UX (map)

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run build` passes
- [ ] 2.3 `npm test` still passes (no engine regressions)

#### Manual

- [ ] 2.4 Board interactions verified on `/game` (selection, reach highlight, move, merge, end turn, pan/zoom intact)

### Phase 3: Inspection panels (FR-006)

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes
- [ ] 3.3 `npm test` still passes

#### Manual

- [ ] 3.4 Panel content verified for city and army (values match dataset; updates after move/end turn)
