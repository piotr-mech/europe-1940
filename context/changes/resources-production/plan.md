# Resources and Production Implementation Plan

## Overview

Slice S-03 (roadmap `resources-production`, PRD FR-002 + FR-003, US-01 "When" partially): the player collects city income each turn (money, steel, recruits) and orders unit production in owned cities — cost paid upfront, 1–2 turn build time, per-city production slots, queues completing on later turns. Economy runs for both countries in `endTurn`; the AI orders nothing until S-06.

## Current State Analysis

What exists (verified):

- Static data is complete — no data work in this slice:
  - `ResourceBag` / `ResourceId` (`src/types.ts:17-20`), reserved for S-03 in `docs/reference/contract-surfaces.md`.
  - `CityData.income` and `CityData.productionSlots` (1–3) populated for all 12 cities (`src/data/map.ts`).
  - `UnitType.cost` and `UnitType.buildTime` (infantry/antiTank 1 turn, tank/artillery 2) in `src/data/units.ts`.
- Runtime state has no economy: `GameState` (`src/types.ts:112-119`) holds only `turn`, countries, `fieldOwners`, `armies`.
- `endTurn` (`src/lib/game-state.ts:110-117`) increments the turn and resets movement points — nothing else.
- No resources HUD anywhere; `GameScreen.tsx:155-172` header shows only turn + countries.
- `DetailPanel.tsx` city branch (lines 131–142) renders income/slots statically and has no `dispatch` — inspection only.

Patterns to follow (established in S-02, `src/lib/movement.ts`):

- One domain module per mechanic with **pure functions over `GameState`** returning new immutable state, **throwing on illegal operations** with descriptive messages.
- Query helpers + apply function (`armySpeed` / `reachableFields` / `applyMove`).
- Reducer actions are thin wrappers with try/catch backstop (UI only offers legal options).
- Phase 1 = headless engine + Vitest; later phases wire UI.

## Desired End State

1. Starting a game seeds each country's treasury with its turn-1 city income (decision: zero + income at start of turn; no separate starting treasury).
2. During the player's turn, selecting an owned city shows a production section: unit types with cost (USSR pays 2 fewer recruits for infantry — national bonus "Rezerwy" now real), build time, and free slots; the player can order units. Cost is deducted at order time; queues cannot be cancelled.
3. "Koniec tury" for both countries: collects income → ticks production queues → completes finished units into an army standing in that city (owner match, under the 8-unit cap), else a new army in the city field → resets movement.
4. Infantry ordered on turn N (build time 1) is on the map at the start of turn N+1.
5. The player's treasury (money/steel/recruits) is visible in the header at all times.

**Verification:** `npm test`, `npm run lint`, `npm run build` pass; manual flow on `/game` — order units in Berlin, end turn, see treasury rise and units appear.

### Key Discoveries:

- `INITIAL_ARMIES` retuning was deferred to S-03 by the S-02 plan — decided: keep as-is, retune only if manual testing shows a problem (battles arrive in S-04 anyway).
- USSR "Rezerwy" (`src/data/countries.ts:23-27`) is description-only today; this slice makes it mechanical (decision).
- The AI's economy must run (income + queue ticks) without any ordering logic — S-06 adds ordering on top, no rework.

## What We're NOT Doing

- **AI production decisions** — S-06 (FR-012 "production proportions adjusted to situation"). AI only accumulates income here.
- **Queue cancellation** — orders are commitments (decision; board-game simplicity).
- **Manual unit placement / city garrison concept** — completed units auto-place into an army in the city or form a new one (decision; no new state concept, no extra UI step).
- **Retuning `INITIAL_ARMIES`** — deferred to when battles exist (S-04).
- **Component tests** — engine-only Vitest, as decided in S-02; UI verified manually.
- **Persistence** — S-08; refresh still returns to setup.
- **New balance data** — draft values in `src/data/` carry the slice; the user-supplied CSV swaps in later (unchanged F-01 contract).

## Implementation Approach

Three phases: headless engine rules with tests → turn-cycle integration in the reducer → UI (HUD + ordering panel). Each phase lands as one commit and leaves the game playable (new state fields default to empty/zero until the next phase gives them meaning).

## Critical Implementation Details

- **State sequencing in `endTurn`:** income must be collected **before** queue ticks only for spec alignment (§20: Faza 1 zasoby → Faza 2 produkcja) — mechanically they are independent, but keep the order so future phases (e.g. upkeep) can rely on it. `createInitialGameState` must seed the turn-1 treasury by the same income computation, not by hardcoded numbers.
- **Unit placement edge cases:** when several orders complete in the same city on the same turn, place them one by one (an army that hits the 8-unit cap mid-batch forces the next unit into a different/new army). New unit and army ids must be deterministic and unique across the whole campaign (derive from city id + turn + sequence, not from `Math.random`/timestamp).

## Phase 1: Production Engine (Headless)

### Overview

New runtime types and a pure rules module with the full rule matrix in tests — no UI, no reducer changes beyond constructing the new fields.

### Changes Required:

#### 1. Runtime economy types

**File**: `src/types.ts`

**Intent**: Add the per-country treasury and per-city production queue to the runtime state.

**Contract**: `GameState` gains `resources: Record<CountryId, ResourceBag>` and `productionQueues: Record<string, ProductionOrder[]>` (keyed by field id; absent key = empty queue). New exported type:

```ts
/** One queued build in a city; placed and paid at order time (S-03). */
export interface ProductionOrder {
  typeId: UnitTypeId;
  remainingTurns: number;
}
```

#### 2. Production rules module

**File**: `src/lib/production.ts` (new)

**Intent**: All production rules as pure functions over `GameState`, following the `movement.ts` pattern (throw on illegal operations with descriptive messages, never mutate).

**Contract**:
- `unitCostFor(countryId: CountryId, typeId: UnitTypeId): ResourceBag` — spec cost, with the USSR "Rezerwy" modifier (infantry: recruits −2, floor 0). Single source of truth for costs; the UI renders from it.
- `collectIncome(state: GameState): GameState` — for **both** countries, sums `CityData.income` of owned cities into `state.resources`.
- `freeProductionSlots(state: GameState, fieldId: string): number` — `city.productionSlots` minus queue length; 0 for non-city fields.
- `applyProductionOrder(state: GameState, countryId: CountryId, fieldId: string, typeId: UnitTypeId): GameState` — throws unless: field is a city, `countryId` owns it, a slot is free, treasury covers `unitCostFor`; on success deducts cost and appends `{ typeId, remainingTurns: buildTime }`.
- `advanceProduction(state: GameState): GameState` — decrements every queue entry; completed orders (remainingTurns hits 0) spawn units into the city field per the placement rule (existing army of the owner standing there with < 8 units — deterministic choice, e.g. first by army id; else a new army) and are removed from the queue.

#### 3. Construction sites for the new fields

**File**: `src/lib/game-state.ts`

**Intent**: Keep the code compiling: `createInitialGameState` returns `resources: { germany: zero, soviet: zero }` (turn-1 seeding arrives in Phase 2) and `productionQueues: {}`.

**Contract**: Zero `ResourceBag` helper local to the module; no other behavior change.

#### 4. Rule-matrix tests

**File**: `src/lib/production.test.ts` (new)

**Intent**: Cover every rule branch with small hand-built states, reusing the `stateWithArmies`-style helpers from `src/lib/movement.test.ts`.

**Contract**: cost with/without "Rezerwy"; income sums per owner; free-slots math incl. `productionSlots` boundary; `applyProductionOrder` throws (non-city, not owner, no slot, insufficient each resource) and succeeds (deduct + append, buildTime 1 and 2); `advanceProduction` decrements, completes on time, places into existing army / new army, respects the 8-unit cap mid-batch, leaves other cities' queues untouched.

#### 5. Contract surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the new surfaces (S-02 convention).

**Contract**: Rows for `ProductionOrder`, `GameState.resources`, `GameState.productionQueues`, `unitCostFor`, `collectIncome`, `freeProductionSlots`, `applyProductionOrder`, `advanceProduction`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- None — headless phase; behavior is unchanged on `/game`.

**Implementation Note**: After completing this phase and all automated verification passes, the phase is done — no manual gate needed (no user-visible change).

---

## Phase 2: Turn Cycle — Income Seeding and endTurn

### Overview

Wire the economy into the game flow: turn-1 treasury seeding in `createInitialGameState` and the full `endTurn` sequence.

### Changes Required:

#### 1. Turn-1 income seed

**File**: `src/lib/game-state.ts`

**Intent**: Implement "zero + income at start of turn" — a fresh game starts with each country's treasury equal to its turn-1 city income, so the player can order on turn 1.

**Contract**: `createInitialGameState` builds the zeroed state, then runs `collectIncome` on it (same code path as `endTurn`, no hardcoded numbers).

#### 2. endTurn economy

**File**: `src/lib/game-state.ts`

**Intent**: Extend the `endTurn` reducer case with the S-03 phases.

**Contract**: `endTurn` → `collectIncome(state)` → `advanceProduction(...)` → `{ ...result, turn: turn + 1, armies: reset movementPoints }` (income before production per spec §20 ordering). AI included (income + queue ticks; its queues stay empty).

#### 3. Reducer and state tests

**File**: `src/lib/game-state.test.ts`

**Intent**: Cover the new state transitions.

**Contract**: initial treasury equals summed starting-city income per country (both player/AI assignments); `endTurn` adds income, ticks queues (buildTime 1 completes after one endTurn — i.e. available on turn N+1), resets movement, leaves `productionQueues` consistent; AI-only queues also tick.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- None in the UI yet (no ordering UI); engine behavior observable only through tests. Playable-UI verification happens in Phase 3.

**Implementation Note**: Phase 2 has no user-visible manual gate; the manual verification of the whole economy happens in Phase 3.

---

## Phase 3: UI — Resources HUD and Production Ordering

### Overview

Make the economy visible and operable: treasury in the header, ordering + queue view in the city panel.

### Changes Required:

#### 1. orderUnit reducer action

**File**: `src/lib/game-state.ts`

**Intent**: Give the UI a dispatch target for ordering, with the established backstop.

**Contract**: `GameAction` gains `{ type: "orderUnit"; fieldId: string; unitTypeId: UnitTypeId }`; the case wraps `applyProductionOrder(state, state.playerCountryId, ...)` in try/catch and returns state unchanged on throw (UI only offers legal orders — same contract comment as `moveArmy`).

#### 2. Resources HUD

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Show the player's treasury at all times.

**Contract**: In the header (lines 155–172), add the player's three resource values (Polish labels as in `RESOURCE_LABELS`) next to the turn/country line. Raw Tailwind, slate palette; no new dependencies.

#### 3. Production section in the city panel

**File**: `src/components/game/DetailPanel.tsx`

**Intent**: Let the player order units and watch queues in owned cities.

**Contract**:
- Props widen to receive `dispatch` (GameScreen owns the reducer); `SelectedSubject` unchanged.
- City branch, gated on `state.fieldOwners[field.id] === state.playerCountryId`: orderable unit types (reuse `UNIT_ICON` thumbnails + the slate row idiom from the army list, lines 86–108) showing name, cost from `unitCostFor`, build time; order button disabled when `freeProductionSlots(...) === 0` or treasury insufficient (UI only offers legal options).
- Below: current queue — unit name + remaining turns per entry (in queue order).
- Enemy/neutral cities keep the current read-only stat rows.

#### 4. Registry rows

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Register the phase surfaces.

**Contract**: Rows for the `orderUnit` `GameAction` variant and the production-section surfaces of `DetailPanel` (props delta).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Start a game as Germany: header shows the treasury equal to Berlin+Poznań+Gdańsk+Królewiec+Warszawa+Kraków income sums; it rises by the same amounts after "Koniec tury".
- Select Berlin (own city): production section lists 4 unit types with costs and build time; ordering infantry deducts 20/0/5 and the queue shows "1 turn"; ordering more than 3 items is impossible (slots).
- Order infantry in Berlin, end turn: the unit appears in army G1 in Berlin (or a new army if G1 is full); treasury rose by income; infantry ordered turn 1 is on the map on turn 2.
- Select an enemy city (e.g. Moscow when playing Germany): read-only stats, no ordering UI.
- Play as USSR: infantry costs 20/0/3 (Rezerwy), both in the panel and at deduction.
- Treasury too low for a tank: its order button is disabled.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to wrap-up.

---

## Testing Strategy

### Unit Tests:

- `src/lib/production.test.ts` — full rule matrix (see Phase 1).
- `src/lib/game-state.test.ts` — initial treasury, `endTurn` economy sequence, `orderUnit` reducer (legal + backstop).

### Integration Tests:

- None — the engine is pure functions; "integration" is the reducer suite above (established S-02 split).

### Manual Testing Steps:

1. Full flow on `/game` as Germany: turn-1 order in Berlin → end turn → unit on map, treasury updated.
2. Same as USSR — verify Rezerwy discount end-to-end.
3. Fill all slots in a 1-slot city (Poznań) — ordering must be blocked.
4. Let a 2-turn build (tank) complete — spawns on the second endTurn.

## Performance Considerations

Trivial at prototype scale: queue operations are O(units in city) on end turn; income sums ≤ 12 cities. No memoization needed beyond existing per-render computations.

## Migration Notes

- `GameState` gains two required fields — every construction site must set them: `createInitialGameState` (`src/lib/game-state.ts:46-66`) and any test helpers building states by hand (`src/lib/movement.test.ts:31-35` style — prefer spreading `createInitialGameState` output and overriding).
- `DetailPanelProps` widens (`dispatch`) — `GameScreen.tsx:183` is the only call site.
- No persisted-state migration: persistence arrives in S-08, after this slice.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-03, PRD FR-002/FR-003)
- Pattern reference: `src/lib/movement.ts` + `context/archive/2026-09-01-army-movement/plan.md`
- Deferred decisions trail: `context/archive/2026-08-31-game-data-contract/` (Rezerwy), `context/archive/2026-09-01-army-movement/plan.md:42,240` (army forming/retuning)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Production Engine (Headless)

#### Automated

- [x] 1.1 Unit tests pass (`npm test`) — production rule matrix — 324cbf0
- [x] 1.2 Linting passes (`npm run lint`) — 324cbf0
- [x] 1.3 Build passes (`npm run build`) — 324cbf0

### Phase 2: Turn Cycle — Income Seeding and endTurn

#### Automated

- [x] 2.1 Unit tests pass (`npm test`) — initial treasury + endTurn economy — 437ac4e
- [x] 2.2 Linting passes (`npm run lint`) — 437ac4e
- [x] 2.3 Build passes (`npm run build`) — 437ac4e

### Phase 3: UI — Resources HUD and Production Ordering

#### Automated

- [x] 3.1 Unit tests pass (`npm test`) — orderUnit reducer coverage
- [x] 3.2 Linting passes (`npm run lint`)
- [x] 3.3 Build passes (`npm run build`)

#### Manual

- [x] 3.4 Manual flow on /game: treasury HUD, ordering in Berlin, completion into army, Rezerwy discount, slot limits, disabled buttons
