# Supply Lines and Unsupplied Penalties Implementation Plan

## Overview

Implements roadmap slice **S-05 (supply-lines)** — the game's distinguishing rule (PRD Business Logic): an army is supplied when an unbroken chain of its side's fields connects it to one of its side's cities. Unsupplied armies suffer the flat penalty from the first unsupplied turn (FR-011): movement max 1 and attack/defense −25%. This unlocks encirclement play and completes the last of the four core mechanics.

## Current State Analysis

The engine is a set of pure modules (`src/lib/`: movement, battle, production) over an immutable `GameState` with a thin reducer; UI is the `GameScreen` island (`BoardMap` + `DetailPanel` + `BattlePopup`). All of S-04 (battle & capture) landed and was reviewed (`context/archive/2026-09-02-battle-city-capture/`).

Key facts the design builds on:

- **Armies always stand on their owner's field**: after S-04, both `applyMove` and a victorious `resolveBattle` flip every field on the marched path (including undefended cities) to the mover's owner (`movement.ts`, `battle.ts`). A side's own moves can therefore only *improve* its supply — only enemy action can cut a line. A supply function derived from live `fieldOwners` is always consistent; no snapshot state is needed.
- **Supply source**: any city owned by the army's owner (PRD FR-010 — not capitals specifically); cities carry `city !== null` in `MAP_FIELDS`.
- **Battle integration point**: `attackerStrength`/`defenderStrength` (`src/lib/battle.ts`) build modifier lists with integer `amount`s (`BattleModifier`) — the −25% penalty must stay integer to keep the report's arithmetic explainable.
- **Movement reset point**: `endTurn` (`src/lib/game-state.ts`) resets every army's `movementPoints` to `armySpeed(army)` — the supply cap slots in here.
- **No army can currently be unsupplied in live play**: the AI never moves (S-06) and both starting armies sit on their own capitals (`INITIAL_ARMIES`, `game-state.ts`). The full unsupplied paths are verifiable by unit tests only until S-06 lands — the Phase 2 manual gate covers the positive path.

### Key Discoveries:

- Initial armies: G1 Berlin, G2 Warsaw (Germany), R1 Moscow, R2 Minsk (Soviet) — all on own cities, trivially supplied.
- `BattleModifier` amounts are plain numbers rendered verbatim in the panel (`DetailPanel.tsx` ModifierList) — an integer penalty needs no UI change.
- Multiple defender armies on one field (possible since S-04's joint-defense) may have *different* supply statuses — the penalty must be evaluated per defender army, not per field.

## Desired End State

1. `isSupplied(state, army)` — a pure function: true iff a path over map connections exists from the army's field to any city owned by the army's owner, passing only through fields owned by that owner (the army's own field starts the chain).
2. An unsupplied army's movement allowance is 1 (even tanks): `endTurn` resets `movementPoints` to `min(armySpeed, 1)` for unsupplied armies, `armySpeed` otherwise.
3. In battle, an unsupplied side loses `round(25%)` of its modified strength as an integer penalty, listed in the report as a `Brak zaopatrzenia` modifier (applies independently to attacker and each defender army).
4. The player sees supply status for **both sides' armies**: an unsupplied army's token carries a marker on the map, and the army panel shows a `Zaopatrzenie` row (`Tak` / `Brak` with the penalty spelled out).
5. Nothing is stored: supply is derived from `fieldOwners` at read time — reducer purity and the S-08 persistence schema stay untouched.

**Verification**: `npm test` (BFS cases, battle penalties, capped reset), `npm run lint`, `npm run build`, plus a manual positive-path run on `/game`.

## What We're NOT Doing

- **Escalating supply penalties** — cut by PRD FR-011 (one flat penalty from the first unsupplied turn; no three-step table).
- **Supply-line rendering on the map** (highlighting the chain itself) — out of scope; the status marker plus panel explanation suffice for the prototype.
- **AI behavior around supply** (rescuing unsupplied armies is an S-06 priority) — engine support only, symmetric for both sides.
- **Mid-turn supply invalidation** — impossible by construction (own moves only improve own supply; see Current State), so no re-evaluation triggers on move/attack actions.
- **New state fields** — `GameState` is untouched; no migration, S-08 schema unaffected.
- **Dev-only scenarios / cheat seeds to force unsupplied armies in play** — the live-game path activates naturally in S-06.

## Implementation Approach

Engine-first, two phases. Phase 1 adds the pure supply module and wires the penalty into the battle strength math (both headless, vitest-only). Phase 2 wires the capped movement reset into `endTurn` and adds the map marker + panel row, closing with the manual gate. Supply is always derived, never stored.

## Critical Implementation Details

- **Integer penalty, applied pre-roll**: the penalty is `Math.round(0.25 × strength-after-other-modifiers)`, subtracted before the ±20% random rolls — keeping all reported strengths integers so the report's modifier arithmetic still adds up.
- **Per-army defender evaluation**: with multiple defending armies, each contributes its defense summed with its own supply penalty; the report's `Brak zaopatrzenia` modifier carries the combined penalty amount (one line per side).
- **No mid-turn cap enforcement**: the movement cap applies at the `endTurn` reset only (an army's already-spent points are untouched); attack penalties apply at battle time from live ownership — both trivially correct because ownership cannot change against a side during its own turn.

## Phase 1: Supply engine (headless)

### Overview

The pure supply functions and the battle-math integration, fully covered by vitest — no UI, no reducer.

### Changes Required:

#### 1. Supply module

**File**: `src/lib/supply.ts` (new), `src/lib/supply.test.ts` (new)

**Intent**: The domain rule in one pure module, following the movement/battle/production style.

**Contract**:
- `isSupplied(state: GameState, army: Army): boolean` — BFS from `army.fieldId` over `MAP_FIELDS` connections; a field is traversable iff `state.fieldOwners[fieldId] === army.owner`; returns true on reaching any field with `city !== null`. The army's own field starts the chain (traversable by definition — armies always stand on their owner's field after S-04).
- `movementAllowance(state: GameState, army: Army): number` — `isSupplied ? armySpeed(army) : min(armySpeed(army), 1)`; the single source of truth for the FR-011 movement cap.
- Throws on unknown army field ids (same defensive style as `getField` helpers elsewhere).

#### 2. Battle penalty integration

**File**: `src/lib/battle.ts`, `src/lib/battle.test.ts`

**Intent**: FR-011's −25% attack/defense as an integer battle modifier, evaluated per army.

**Contract**: `attackerStrength(army, targetField, unsupplied: boolean)` and `defenderStrength(defenders, field, unsuppliedByArmy: (army: Army) => boolean)` (or equivalent parametrization — the exact shape is the implementer's call, tests pin the behavior): after other modifiers, an unsupplied side loses `Math.round(0.25 × runningTotal)`, recorded as `{ label: "Brak zaopatrzenia", amount: −penalty }`. `resolveBattle` feeds both from `isSupplied`. Existing call sites (tests, reducer) updated; report shape unchanged apart from the new modifier rows.

### Success Criteria:

#### Automated Verification:

- `npm test` — new supply suite: supplied via adjacent own city, supplied through an own-field chain, unsupplied when the chain is walled by enemy-owned fields, unsupplied when the reachable own component has no own city, own city anywhere in the component counts; battle suite: unsupplied attacker (18 → −5 → 13), unsupplied defender, both sides unsupplied, per-army defender evaluation, `Brak zaopatrzenia` in the report; allowance: tanks 2→1 unsupplied, infantry 1→1, unchanged when supplied
- `npm run lint`
- `npm run build`

#### Manual Verification:

- None (headless phase)

---

## Phase 2: Reducer and UI wiring

### Overview

The capped movement reset, the map marker, the panel row — and the manual gate.

### Changes Required:

#### 1. Capped movement reset

**File**: `src/lib/game-state.ts`, `src/lib/game-state.test.ts`

**Intent**: `endTurn` applies the FR-011 movement cap.

**Contract**: the `endTurn` reset uses `movementAllowance(withProduction, army)` instead of `armySpeed(army)`; `createInitialGameState` keeps using `armySpeed` (starting armies are on own cities — trivially supplied — and the allowance reads live ownership anyway, so either is correct; keep the existing call for clarity).

#### 2. Supply status on the map

**File**: `src/components/game/BoardMap.tsx`

**Intent**: The cut-off threat visible at a glance (PRD: the moment the rule shapes decisions).

**Contract**: an unsupplied army's token (both sides — `isSupplied` per army) renders a small marker (e.g. an orange dot at the token's corner); supplied armies render nothing extra.

#### 3. Supply row in the army panel

**File**: `src/components/game/DetailPanel.tsx`

**Intent**: The panel explains the marker (FR-006 inspection pattern).

**Contract**: the army branch gains a `Zaopatrzenie` stat row — `Tak` when supplied, `Brak — ruch max 1, atak/obrona −25%` when not.

#### 4. Contract-surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Keep the registry current per the S-02…S-04 convention.

**Contract**: add `isSupplied`, `movementAllowance` and the battle-strength signature change with their consumers.

### Success Criteria:

#### Automated Verification:

- `npm test` — reducer: tank army unsupplied (constructed state: enemy owns the cutting field) resets to 1 movement on `endTurn`, supplied army unchanged
- `npm run lint`
- `npm run build`

#### Manual Verification:

- Positive path on `/game`: army panel shows `Zaopatrzenie: Tak`; no markers on any token; a battle report contains no `Brak zaopatrzenia` modifier. (Unsupplied paths are unit-tested only — no army can be cut off in live play until the AI moves, S-06.)

**Implementation Note**: pause for manual confirmation after automated checks pass.

---

## Testing Strategy

### Unit Tests:

- BFS correctness: adjacency-chain supplied, walled-by-enemy unsupplied, own-component-without-city unsupplied, distant own city in the same component supplied.
- Battle: penalty math per side (rounding at .5 boundaries included), both-unsupplied symmetry, per-defender-army evaluation with mixed statuses, report modifier rows.
- Movement allowance: tank 2→1, infantry 1→1, supplied unchanged.
- Reducer: `endTurn` applies the cap; supplied armies reset as before.

### Integration Tests:

- Reducer-level: construct a state where the enemy owns the field cutting a tank army off; `endTurn` → `movementPoints === 1`; move/battle in the same turn still allowed at full pre-cap points.

### Manual Testing Steps:

1. Phase 2 gate (above) — the positive path.
2. From S-06 on: cut an enemy army's supply in play and watch the marker, panel row, movement cap, and battle modifier appear end-to-end.

## Performance Considerations

`isSupplied` is a BFS over ≤29 fields, called per army per render and per battle — negligible. No memoization needed (the "tiny dataset" convention).

## Migration Notes

None — no schema or state-shape changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-05
- PRD: FR-010, FR-011, Business Logic section, US-01 acceptance (`context/foundation/prd.md:85-91, 111-119, 54`)
- Prior art: `src/lib/battle.ts` (modifier pattern), `src/lib/movement.ts` (BFS over connections), `context/archive/2026-09-02-battle-city-capture/`
- Lesson: bare-catch backstops (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Supply engine (headless)

#### Automated

- [x] 1.1 `npm test` — supply suite green (BFS cases incl. walled-off and cityless component; battle penalties per side with rounding and per-army defenders; movement allowance caps) — 8fc4b04
- [x] 1.2 `npm run lint` — 8fc4b04
- [x] 1.3 `npm run build` — 8fc4b04

### Phase 2: Reducer and UI wiring

#### Automated

- [x] 2.1 `npm test` — reducer endTurn cap suite green (unsupplied tank resets to 1) — 7d2d2a7
- [x] 2.2 `npm run lint` — 7d2d2a7
- [x] 2.3 `npm run build` — 7d2d2a7

#### Manual

- [x] 2.4 Positive path on `/game`: panel shows Zaopatrzenie: Tak, no markers, no supply modifier in battle reports — 7d2d2a7
