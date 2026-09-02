# Battle and City Capture Implementation Plan

## Overview

Implements roadmap slice **S-04 (battle-city-capture) — the north star**: the player moves an army onto an enemy-occupied field, an automatic battle resolves (FR-007), units end the battle operational or destroyed (FR-008), and a defeated city changes owner, producing for the winner from the next turn (FR-009). Completing this slice finishes US-01 end-to-end: production → movement → attack → capture.

## Current State Analysis

The rules engine is a set of pure modules in `src/lib/` driven by a thin reducer (`src/lib/game-state.ts:120-163`: `startGame` | `moveArmy` | `orderUnit` | `endTurn`); UI is a single React island (`GameScreen` → `BoardMap` + `DetailPanel`). No combat code exists — comments in `movement.ts:4` and `terrain.ts:5` explicitly reserve combat for this slice.

What already exists and is reused as-is:

- **Combat-relevant data**: `src/data/units.ts` has `attack`/`defense`/`bonusVsTank` per unit type; `src/data/terrain.ts` has `defenderBonus` (forest 2, mountains 4) and `attackerPenalty` (river 3); `src/data/map.ts` cities carry `defenseBonus` (1–4) and `income`.
- **Ownership flip on movement**: `applyMove` (`src/lib/movement.ts:102-140`) already flips every non-city field on the marched path to the mover's owner — cities are deliberately excluded, waiting for capture.
- **Income from next turn falls out naturally**: `collectIncome` (`src/lib/production.ts:61-74`) reads live `fieldOwners` on every `endTurn`, so a city captured mid-turn yields income to the new owner at the next `endTurn` — no change needed for the income half of FR-009.
- **Queue ownership hazard**: `placeCompletedUnit` (`src/lib/production.ts:163-190`) reads the city's *current* owner, so without explicit handling a captured city's in-progress queue would complete for the capturer. Decision: the queue is **cancelled** on capture.

Key constraints:

- `reachableFields` (`src/lib/movement.ts:47-86`) treats enemy-occupied fields as impassable — this must become "attack target" semantics.
- The codebase is fully deterministic (no `Math.random` anywhere); the reducer is pure. The US-01 random element must not break purity or testability.
- No toast/notification system exists; battle outcome needs a presentation surface.
- Lesson from S-03 (`context/foundation/lessons.md`): bare `catch {}` backstops must rethrow developer errors (`isDomainError` pattern in `game-state.ts:115-117`) — extend, don't bypass.

### Key Discoveries:

- Rivers are **fields**, not connection flags (`src/data/map.ts:87,157`) — "attack across a river" means the defender stands on a `type: "river"` field, so the existing `attackerPenalty` on river terrain is the entire mechanism.
- `armySpeed`/`dominantUnitType` throw on empty armies — destroyed armies must be **removed** from `state.armies`, never left with `units: []`.
- Unit ids are deterministic and sequence-checked (`src/lib/production.ts:163-202`) — the id scheme extends to any new unit creation without collision risk (no new units are created by battle, but tests rely on the scheme).
- `getGameData()` validation (`src/lib/game-data.ts:25-148`) already rejects negative attack/defense/bonus values — a new `supportBonus` field joins the same validation pass.
- Tests are co-located (`src/lib/*.test.ts`, vitest); verification commands are `npm test`, `npm run lint`, `npm run build` (no separate typecheck script).

## Desired End State

1. The player selects their army and clicks an enemy-occupied field within reach → an automatic battle starts immediately (no confirmation dialog, no odds preview).
2. Battle math (all values draft-balance, tunable in data files): modified attack = Σ unit attack + 2 per artillery unit in the attacking army (support) − attackerPenalty if the defender stands on a river field; modified defense = Σ unit defense + terrain `defenderBonus` + city `defenseBonus`. Each side's strength is multiplied by a random factor in [0.8, 1.2]; the higher result wins.
3. The losing side is destroyed entirely (army removed). The winner loses a random number of units from 0 up to `⌈(loserStrength / winnerStrength) × winnerUnitCount⌉`, clamped to `winnerUnitCount − 1` (the winner always survives with at least one unit). Removed units come deterministically from the end of the army's unit array.
4. On an attacker victory: the attacking army enters the field and **its movement ends** (`movementPoints` set to 0). A non-city field flips owner (existing path-flip behavior); a city flips owner, its production queue is cancelled, and its income accrues to the new owner from the next `endTurn`.
5. Entering an enemy field/city with **no defending army** is a regular move (costs movement points as normal, may continue afterwards) that flips ownership — city capture without a battle.
6. After every battle the side panel shows a **battle report**: winner, per-side losses, and the modifiers that applied.
7. The game remains fully deterministic under test: randomness comes from a seeded PRNG whose seed lives in `GameState`.

**Verification**: `npm test` (new battle/reducer suites green), `npm run lint`, `npm run build`, and a manual full run of US-01 on `/game` (produce → move → attack → capture → next-turn income for the captured city).

## What We're NOT Doing

- **Supply modifiers** (unsupplied attacker/defender −25%) — slice S-05; the modifier list in FR-007 is implemented for S-04 scope only (terrain, city, artillery support, river).
- **AI attacks / AI turn** — S-06. The AI's armies are attackable targets, but the AI never attacks in this slice.
- **Victory/defeat check** (all enemy cities captured) — S-07.
- **Persistence** of game state — S-08 (refresh still loses the game; the `GameState` shape change needs no migration because nothing is persisted yet).
- **Odds/strength preview before attack** — removed from the PRD during shaping; not coming back.
- **Damaged unit state and chaos-after-capture** — cut by FR-008/FR-009 Socratic resolutions; binary units, normal production from next turn.
- **General and air superiority modifiers** (spec §12 mentions them) — PRD Non-Goals (no generals, no aviation).
- **Country bonus `blitzkrieg`** (tank +1 movement, `src/data/countries.ts`) — pre-existing unimplemented data; still out of scope.
- **Attack confirmation dialog** — click means attack, board-game immediacy; misclick recovery is not a prototype concern.

## Implementation Approach

Engine-first, mirroring the proven S-02/S-03 pattern: Phase 1 builds the whole battle domain headless in a new pure module `src/lib/battle.ts` (plus the movement.ts attack-target split and the artillery support data field), Phase 2 wires it into the reducer with the seeded-RNG state fields, Phase 3 adds the attack interaction and battle report to the UI with the only manual gate. Each phase lands as one commit and leaves the game playable.

The random element is satisfied without breaking reducer purity: `GameState` gains `rngSeed`; battle resolution consumes a deterministic PRNG step (mulberry32-style) seeded from it and writes the advanced seed back into the new state. Fixed seeds in tests make every outcome assertable.

## Critical Implementation Details

- **RNG purity**: the PRNG step is a pure function `(seed) => { value, nextSeed }` living in `battle.ts`; `resolveBattle` takes the seed as a parameter and returns the advanced seed in its result. `Date.now()` never appears in the reducer — the `startGame` action carries the initial seed from the UI.
- **Winner-loss clamp**: the random loss draw `0…cap` must be clamped to `winnerUnitCount − 1`; an unclamped max would destroy both armies and leave a captured field ownerless-or-wrong with no obvious cause (exactly the "unexplainable situation" the NFR forbids).
- **Empty armies are invalid states**: on any battle outcome, armies reduced to fewer than 1 unit are removed from `state.armies` (only the loser can hit 0 thanks to the clamp, but the removal helper must be defensive).
- **Bare-catch lesson**: any new try/catch in the reducer follows the `isDomainError` rethrow pattern (`game-state.ts:115-117`) — domain errors (illegal attack) are swallowed, developer errors propagate.

## Phase 1: Battle engine (headless)

### Overview

The complete battle domain as pure, throwing functions in `src/lib/battle.ts`, the movement-layer split of move targets vs attack targets, and the artillery support data field — all covered by vitest, no UI.

### Changes Required:

#### 1. Artillery support data field

**File**: `src/types.ts`, `src/data/units.ts`, `src/lib/game-data.ts`

**Intent**: Give artillery its spec-§12 support role as a data-driven flat bonus instead of a hardcoded special case.

**Contract**: `UnitType` gains `supportBonus: number | null` (artillery `2`, others `null`); `game-data.ts` validation rejects negative values alongside the existing attack/defense checks.

#### 2. Battle module

**File**: `src/lib/battle.ts` (new), `src/lib/battle.test.ts` (new)

**Intent**: All battle rules in one pure module following the `movement.ts`/`production.ts` style (pure, throw on illegal input).

**Contract**:
- `type BattleReport = { attackerField… winner, attackerLosses, defenderLosses, modifiers: string[] }` — carries everything the UI panel shows.
- `resolveBattle(state, armyId, targetFieldId, rngSeed)` → `{ state, report, nextSeed }`; throws a domain error when the target holds no enemy army (that path is a move, not a battle).
- Strength contract (draft values): attack = Σ attack + Σ `supportBonus` − river `attackerPenalty` (when defender is on a river field); defense = Σ defense + terrain `defenderBonus` + city `defenseBonus`; both sides × uniform [0.8, 1.2] from the PRNG; loser destroyed; winner loses `randInt(0, min(cap, winnerUnits − 1))` units from the end of the array; attacker victory → attacker enters the field, `movementPoints = 0`, ownership flips (city capture cancels `productionQueues[fieldId]`).
- Deterministic PRNG helper (mulberry32-style) exposed for tests.

#### 3. Attack targets in the movement layer

**File**: `src/lib/movement.ts`, `src/lib/movement.test.ts`

**Intent**: Split today's single "reachable" answer into move targets and attack targets so the reducer and UI can treat them differently.

**Contract**: `reachableFields` keeps returning only fields the army can *move to* (now including undefended enemy fields — free capture via `applyMove`, which must flip city ownership and cancel the queue for those); new `attackFields(state, armyId)` returns enemy-army-occupied fields reachable within movement points as **terminal** destinations (no pathing through any enemy-occupied field, ever). `applyMove` gains the undefended-enemy-field case (ownership flip incl. city + queue cancel).

### Success Criteria:

#### Automated Verification:

- `npm test` — new suites: strength math per modifier (forest/mountains/city/river/artillery support), seeded-outcome battles (specific seed where the weaker side wins), loss draw bounds and clamp, loser-army removal, city capture flips owner + cancels queue, free capture of undefended city, attack targets exclude transit-through-enemy
- `npm run lint`
- `npm run build`

#### Manual Verification:

- None (headless phase; engine exercised through tests only)

---

## Phase 2: Reducer and state wiring

### Overview

Wire the battle module into the game reducer: new `attackArmy` action, RNG seed in state, initial seed at game start.

### Changes Required:

#### 1. State fields

**File**: `src/types.ts`, `src/lib/game-state.ts`

**Intent**: Carry the PRNG seed and the last battle report in state.

**Contract**: `GameState` gains `rngSeed: number` and `lastBattleReport: BattleReport | null` (null at start, replaced on each battle); `createInitialGameState(playerCountryId, aiCountryId, seed)` takes the initial seed; the `startGame` action payload carries it (UI passes `Date.now()`), keeping the reducer pure.

#### 2. attackArmy action

**File**: `src/lib/game-state.ts`, `src/lib/game-state.test.ts`

**Intent**: Expose battle as a reducer action alongside `moveArmy`.

**Contract**: `attackArmy { armyId, targetFieldId }` calls `resolveBattle` with `state.rngSeed`, writes back the advanced seed and `lastBattleReport`; illegal attacks (not an attack target, enemy army, insufficient movement) are swallowed by the existing `isDomainError` backstop. `moveArmy` remains the path for undefended enemy fields (free capture).

### Success Criteria:

#### Automated Verification:

- `npm test` — reducer suite: attackArmy happy path (state advances seed, stores report, flips owner), illegal attack returns state unchanged, developer errors still propagate
- `npm run lint`
- `npm run build`

#### Manual Verification:

- None (headless phase)

---

## Phase 3: Attack UX and battle report

### Overview

The player-facing half: attack targets on the map, click-to-attack, and the battle report panel — the only phase with a manual gate (full US-01 run).

### Changes Required:

#### 1. Attack interaction

**File**: `src/components/game/GameScreen.tsx`, `src/components/game/BoardMap.tsx`

**Intent**: Let the player start a battle with the same select-then-click flow movement already uses.

**Contract**: when an own army is selected, move targets keep the white dashed ring and enemy attack targets (from `attackFields`) get a red dashed ring; clicking an attack target dispatches `attackArmy` (with a `moveArmy`-style bare-catch-aware call); after dispatch the selection clears.

#### 2. Battle report panel

**File**: `src/components/game/DetailPanel.tsx` (or a sibling `BattleReportPanel.tsx` if the panel grows), `src/components/game/GameScreen.tsx`

**Intent**: Show the outcome and — per the readability NFR — the *why*: winner, losses on both sides, modifiers that applied.

**Contract**: after a battle, the side panel renders `state.lastBattleReport` (winner, per-side unit losses, modifier list in plain Polish labels); it stays until the player's next selection action replaces the panel subject.

#### 3. Contract-surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Keep the load-bearing-names registry current, per the convention every S-02/S-03 phase followed.

**Contract**: add `resolveBattle`, `attackFields`, `rngSeed`/`lastBattleReport` (GameState) with their consumers.

### Success Criteria:

#### Automated Verification:

- `npm test`
- `npm run lint`
- `npm run build`

#### Manual Verification:

- Full US-01 flow on `/game` (`npm run dev`): order production in a city, move an army onto an enemy-occupied field, battle resolves with a visible report, on victory the city changes color and its production queue is gone, `endTurn` seeds income from the captured city to the player
- Losing battle verified: attack a much stronger defender, confirm the attacker's army disappears and the report shows the loss

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before the change is considered done.

---

## Testing Strategy

### Unit Tests:

- Strength computation: each modifier in isolation (forest +2, mountains +4, city defenseBonus, river attackerPenalty −3, artillery support +2 each) and stacked.
- Seeded battles: fixed seed where the stronger side wins and another where the ±20% roll flips the outcome (proves the random element without flaky tests).
- Loss draw: bounds 0…cap, clamp at `winnerUnits − 1`, removal from array end, loser army removed from `state.armies`.
- City capture: owner flip, queue cancellation, income accrual to the new owner on the next `endTurn` (compose with `production.ts`).
- Free capture: undefended enemy city entered by move flips owner + cancels queue; undefended terrain field flips as before.
- `attackFields`: enemy-occupied fields reachable as terminals; no transit through enemy-occupied fields; over-cap merges excluded.

### Integration Tests:

- Reducer-level: `attackArmy` → `endTurn` composition proving FR-009's "produces for the winner from the next turn".

### Manual Testing Steps:

1. US-01 end-to-end on `/game` (Phase 3 manual gate, above).
2. Winner-losses sanity: win a battle against a comparable defender and confirm the report shows 1+ losses with units removed from the army panel.

## Performance Considerations

Map is 29 fields, armies ≤ 8 units; battle resolution is O(units) arithmetic on click — no performance surface. The PRNG adds one integer field to state. Nothing to optimize.

## Migration Notes

`GameState` gains `rngSeed` and `lastBattleReport` — no persisted game states exist (S-08 is future), so no migration is required. `UnitType` gains `supportBonus`; `getGameData()` validation extends to it, and all four unit rows in `src/data/units.ts` get explicit values (null for non-artillery).

## References

- Roadmap slice: `context/foundation/roadmap.md` S-04 (lines 129–139)
- PRD: FR-007/008/009, US-01 (`context/foundation/prd.md:45-55, 77-87`)
- Original spec battle/capture sections: `europe_1940_specyfikacja.md` §12–14 (lines 399–474; odds-preview, damaged state, chaos rule already cut by PRD)
- Prior art: `src/lib/movement.ts` (pure-module style), `context/archive/2026-09-01-army-movement/plan.md`, `context/archive/2026-09-01-resources-production/plan.md`
- Lesson: bare-catch backstops (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Battle engine (headless)

#### Automated

- [x] 1.1 `npm test` — battle suite green (strength math per modifier, seeded outcomes incl. an upset win, loss draw bounds/clamp, loser removal, capture + queue cancel, free capture, attack-target terminals) — fa2c865
- [x] 1.2 `npm run lint` — fa2c865
- [x] 1.3 `npm run build` — fa2c865

### Phase 2: Reducer and state wiring

#### Automated

- [x] 2.1 `npm test` — reducer attackArmy suite green (seed advance, report stored, illegal attack unchanged, dev errors propagate) — 7cd29cc
- [x] 2.2 `npm run lint` — 7cd29cc
- [x] 2.3 `npm run build` — 7cd29cc

### Phase 3: Attack UX and battle report

#### Automated

- [x] 3.1 `npm test`
- [x] 3.2 `npm run lint`
- [x] 3.3 `npm run build`

#### Manual

- [x] 3.4 Full US-01 flow on `/game` (produce → move → attack → report → capture → next-turn income)
- [x] 3.5 Losing battle: attacker army disappears, report shows the loss
