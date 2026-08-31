# New Game Screen and Board-Game Map View Implementation Plan

## Overview

S-01 delivers the first user-visible screen: a `/game` page with one React island — a new-game screen (choosing the player's and the AI's country from the prototype's two) that transitions into the board-game map view: the geographic `europa_regiony.svg` as background, fields as points (cities large), connections as thick lines, ownership colors from the dataset, and static army tokens from the initial game state. Logic (initial-state factory + reducer) is unit-tested in vitest; the UI is verified through the manual readability gate — the product's most important NFR assumption.

## Current State Analysis

- `getGameData()` (`src/lib/game-data.ts`) serves the validated dataset: 29 fields with x/y on a 1800×1200 SVG canvas, symmetric connections, `initialOwner`, city stats, countries with colors (`germany` `#64748b`, `soviet` `#b91c1c`), Polish display names. Registry: `docs/reference/contract-surfaces.md`.
- No game UI exists — only auth islands; no `/game` route. `src/middleware.ts` is auth scaffold (AGENTS.md: treat as removable reference; it must not guard `/game`).
- vitest configured (node env, `@` alias, `src/**/*.test.ts`); CI runs lint → test → build.
- `game_data/europa_regiony.svg` (untracked, 115 KB) shares the 1800×1200 coordinate system with the dataset — field coordinates overlay it exactly. Image analysis of the preview confirmed: pastel fills (20–30% saturation), thin borders, quiet labels — saturated ownership colors will pop; overlay judged "excellent" with thick strokes + white halos.

## Desired End State

The user opens `/game`, picks their country and the AI's country (must differ), presses start, and sees the board-game map: 29 fields (12 cities as large labeled points) connected by lines, ownership colors matching `initialOwner`, and 4 static army tokens (flag color, unit count, dominant-type symbol). The initial state satisfies US-01's Given: each side controls ≥1 city and ≥1 army. Verified by: `npm test` (factory/reducer), `npm run lint`, `npm run build`, `npm run dev` manual walkthrough, and the human readability verdict.

### Key Discoveries:

- The SVG background and dataset coordinates share one canvas — zero projection work needed, just `<image>` + overlay in the same `viewBox="0 0 1800 1200"`.
- F-01 deliberately left starting armies out of the dataset (game state, not static data) — S-01 introduces the initial-state factory, the home of starting setup until balance CSV work revisits it.
- Readability mitigations from image analysis: thick connection strokes with white casing, white halos on field markers and tokens (`paint-order: stroke`), city markers ≥16px radius, own field-name labels only for cities.

## What We're NOT Doing

- No movement, selection, or inspection interactions — FR-006 (inspect panels) is S-02; tokens are static.
- No resources/production UI (S-03), no battles (S-04), no persistence (S-08 — state lives in the island only; refresh restarts).
- No stripping/recoloring of the background SVG's baked-in labels (revisit only if the readability gate fails).
- No new state-management library; no component-test infrastructure (jsdom/testing-library) — deferred until interactions exist (S-02).
- No mobile/touch support (PRD Non-Goals); no i18n layer (Polish UI strings match the data language).

## Implementation Approach

One island (`GameScreen`) on one page (`/game`), state via `useReducer` with the reducer and initial-state factory in `src/lib/game-state.ts` (testable in vitest without DOM). `BoardMap` is a pure render of `(GameData, GameState) → SVG`. The background SVG is copied into `src/assets/` (committed asset, imported via Vite URL import) — `game_data/` remains the user's untracked source directory. Three phases: state contract → board render with a demo state → setup screen wiring.

## Critical Implementation Details

- **Middleware check**: `src/middleware.ts` (auth scaffold) must not intercept `/game` — verify its matcher on entering Phase 3; if it guards broad paths, exclude `/game` (do not extend the auth flow per AGENTS.md).
- **AI country constraint**: FR-001 has the player choosing both countries; with exactly two, the UI keeps two selects linked so they always differ, and the factory throws on equal ids — the invariant lives in logic, not just UI.

## Phase 1: Initial game state contract

### Overview

Runtime game-state types, the initial-state factory (owners from dataset + draft starting armies), the reducer's first action, and the background asset — all logic testable headlessly.

### Changes Required:

#### 1. Runtime game-state types

**File**: `src/types.ts` (extend)

**Intent**: Types for client-side game state consumed by S-02+ too.

**Contract**: add `UnitInstance { id: string; typeId: UnitTypeId }`, `Army { id: string; owner: CountryId; fieldId: string; units: UnitInstance[] }`, `GameState { turn: number; playerCountryId: CountryId; aiCountryId: CountryId; fieldOwners: Record<string, CountryId>; armies: Army[] }`.

#### 2. Initial-state factory + reducer + dominant-type helper

**File**: `src/lib/game-state.ts` (new)

**Intent**: The single constructor of a fresh campaign: owners copied from `MAP_FIELDS.initialOwner`, draft starting armies satisfying US-01's Given.

**Contract**: `createInitialGameState(playerCountryId, aiCountryId): GameState` — throws if ids equal; `fieldOwners` from dataset; turn 1; armies draft (values human-reviewable): germany — G1 in Berlin (2×infantry, 1×tank, 1×artillery), G2 in Warsaw (3×infantry, 1×antiTank); soviet — R1 in Moscow (2×infantry, 1×tank, 1×artillery), R2 in Minsk (3×infantry, 1×antiTank). Plus `gameReducer(state, action)` handling `{ type: "startGame"; playerCountryId; aiCountryId }` (replaces state with the fresh factory output) and `dominantUnitType(army): UnitTypeId` (highest unit count; tie-break by `UNIT_TYPES` order).

#### 3. Tests

**File**: `src/lib/game-state.test.ts` (new)

**Intent**: Lock the US-01 Given and the invariants S-02+ will rely on.

**Contract**: asserts — owners mirror the dataset; each country has ≥1 army on a field it owns; every army ≤8 units (FR-004); unit/army ids unique; unit `typeId`s exist in `UNIT_TYPES`; factory throws on equal country ids; `dominantUnitType` picks mode with defined tie-break; `startGame` produces the chosen pairing.

#### 4. Background asset

**File**: `src/assets/europe-regions.svg` (new — copy of `game_data/europa_regiony.svg`)

**Intent**: Commit the geographic background the board overlays; `game_data/` stays the user's source directory.

**Contract**: byte-identical copy; imported in Phase 2 via Vite URL import.

### Success Criteria:

#### Automated Verification:

- `npm test` passes (existing 11 + new game-state tests)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Review the draft starting-army values (composition, placement) as the game's designer

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Board map view (demo state)

### Overview

Render the full board — background, fields, connections, ownership, army tokens — as a pure component driven by `(GameData, GameState)`, mounted on `/game` with a fixed demo state so the readability NFR can be judged immediately.

### Changes Required:

#### 1. Board component

**File**: `src/components/game/BoardMap.tsx` (new)

**Intent**: The board-game map render: one SVG, dataset + state in, static board out.

**Contract**: props `{ state: GameState }`; data from `getGameData()`. SVG `viewBox="0 0 1800 1200"` with the background `<image>` (URL import of `@/assets/europe-regions.svg`); connection lines deduplicated by sorted id pair — white casing stroke ~8 under a dark ~5 stroke; terrain fields as circles r≈12 in owner color with white stroke ~3; cities as circles r≈16 with inner white dot and Polish name label with white halo (`paint-order: stroke`); army tokens as small rounded rects near their field (offset below-right): owner-color fill, white border, unit count + dominant-type letter (P/C/A/D) — spec §23 shape, no interactivity.

#### 2. Game page (demo wiring)

**File**: `src/pages/game.astro` (new)

**Intent**: Mount the board so Phase 2 is manually verifiable end-to-end.

**Contract**: minimal page using the existing `Layout`; renders `BoardMap` with `createInitialGameState("germany", "soviet")` — either as a tiny island or SSR'd static markup (implementer's choice; no user input needed yet). Phase 3 replaces this wiring with the GameScreen island.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- `npm run dev` → `/game` shows the full board (29 fields, 12 labeled cities, connections, ownership colors, 4 army tokens over the geographic background) — first readability judgment

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: New game screen and island wiring

### Overview

The actual S-01 flow: setup screen (country choice), reducer-driven transition to the board, final readiness of the `/game` route.

### Changes Required:

#### 1. Game island

**File**: `src/components/game/GameScreen.tsx` (new)

**Intent**: One island, two modes: setup → board, driven by `useReducer` over `gameReducer`.

**Contract**: state starts with a `null` game (or a `setup` marker); setup mode renders Polish UI — "Twój kraj" / "Kraj AI" selects linked to always differ (picking one swaps the other), START button dispatches `startGame`; board mode renders `BoardMap` with the created state. No props required; hydration via `client:load`.

#### 2. Page wiring + middleware check

**File**: `src/pages/game.astro` (edit)

**Intent**: Replace the Phase 2 demo wiring with the real island.

**Contract**: `<GameScreen client:load />`; verify `src/middleware.ts` does not intercept `/game` (exclude the route if its matcher is broad — never extend the auth flow).

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Full flow: `/game` → choose player + AI country (verify they can't be equal) → start → board renders with the chosen pairing; page refresh returns to setup (expected — persistence is S-08)
- Final readability NFR gate: the map reads as a board-game war map at a glance

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `createInitialGameState`: US-01 Given invariants (owners from dataset, ≥1 army per side on own field, ≤8 units/army, unique ids, throws on equal countries).
- `gameReducer` `startGame` transition; `dominantUnitType` mode + tie-break.

### Integration Tests:

- None — no server involvement; the island is client-only.

### Manual Testing Steps:

1. Phase 2: `/game` demo board — readability first pass.
2. Phase 3: full setup flow, country-constraint behavior, refresh behavior.
3. Final gate: judge the board against the map-readability NFR (cities as large points, connections as lines, readable at a glance without a manual).

## Performance Considerations

Static SVG with ~40 shapes — trivial; `client:load` hydration of one island; no data fetching (dataset bundles at build time). No memoization needed at this scale.

## Migration Notes

Starting armies are drafts in the factory; the balance CSV swap (F-01 contract) covers stats, and factory values may be re-tuned in S-02/S-03 without breaking consumers — they read `GameState`, not the factory's constants.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-01 / new-game-map-view)
- Product contract: `context/foundation/prd.md` (FR-001, US-01 Given, NFR map readability)
- Game spec: `europe_1940_specyfikacja.md` (§21 setup flow, §22 UI, §23 map look, §31 prototype map)
- Dataset: `src/lib/game-data.ts`, `src/data/*`; registry: `docs/reference/contract-surfaces.md`
- Background source: `game_data/europa_regiony.svg` (coordinates shared with dataset)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Initial game state contract

#### Automated

- [x] 1.1 `npm test` passes (game-state tests added)
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes

#### Manual

- [x] 1.4 Review of draft starting-army values

### Phase 2: Board map view (demo state)

#### Automated

- [ ] 2.1 `npm test` passes
- [ ] 2.2 `npm run lint` passes
- [ ] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 `/game` demo board — first readability judgment

### Phase 3: New game screen and island wiring

#### Automated

- [ ] 3.1 `npm test` passes
- [ ] 3.2 `npm run lint` passes
- [ ] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 Full setup flow verified (countries, constraint, refresh)
- [ ] 3.5 Final readability NFR gate
