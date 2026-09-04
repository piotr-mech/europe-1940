# Victory Conditions Implementation Plan

## Overview

Implement S-07 / FR-013: the campaign ends the moment one side controls all of the enemy's cities — the player wins by taking every city that initially belonged to the AI's country, and loses when the AI takes all of theirs. The game state gains a terminal `winner` field, the reducer freezes all play once it is set, and a hand-rolled overlay (matching `BattlePopup`'s style) presents the result, with the final map still browsable and a path back to a fresh game.

## Current State Analysis

- No end-state exists anywhere in the code. `GameState` (`src/types.ts:173-192`) has no winner/phase field; the only "Zwycięstwo!/Porażka" strings are battle-level (`BattlePopup.tsx:150`, `DetailPanel.tsx:233,270`).
- City ownership lives in `fieldOwners: Record<string, CountryId>` (`src/types.ts:177-178`); ownership changes only inside `applyMove` (`src/lib/movement.ts:185-196`, free capture of undefended cities at 193-195) and `resolveBattle` (`src/lib/battle.ts:251-260`).
- The reducer (`src/lib/game-state.ts:146-277`) exposes `startGame | moveArmy | attackArmy | orderUnit | endTurn | aiStep`. Ownership-changing cases are `moveArmy` (150-161), `attackArmy` (162-185), and `aiStep`'s move/attack branches (230-275). A comment at `game-state.ts:211` explicitly anticipates S-07 hooking in.
- The AI turn is staged: `endTurn` plans into `aiPlan`; `GameScreen.tsx:81-89` dispatches `aiStep` every 500 ms while `aiPlan.length > 0` (input blocked via `aiTurnActive`, `GameScreen.tsx:77`). The driver pauses while either battle popup is open.
- Battle popups are derived, not stored: newest report per side shows until dismissed (`GameScreen.tsx:73-76`, dismissed-report refs at 61-69).
- The map dataset has 29 fields, 12 cities; `initialOwner` on each `MapField` (`src/types.ts:58`) is the anchor for "enemy's cities". Precedent for filtering a side's cities: `src/lib/ai.ts:179,214`; precedent for `initialOwner` comparison: `ai.ts:386-388`.
- Vitest with colocated `src/**/*.test.ts`; no component tests — UI phases verify manually (convention from S-04…S-06).

### Key Discoveries:

- "Enemy's cities" must be defined by `initialOwner`, not current ownership: victory = a country controls every city whose `initialOwner` is the other country (`src/data/map.ts`). This survives any sequence of captures and recaptures.
- Both sides' win conditions are logically satisfiable at once in a synthetic state, but unreachable in play: with the check run immediately after every ownership change, only the acting side can newly complete its condition, and the game freezes on the first completion. `winnerOf` still needs a deterministic country iteration order (defensive, tested synthetically).
- The replay driver stops by itself once `aiPlan` is cleared — setting `winner` together with `aiPlan: []` in the same reducer return is enough; no driver changes required.
- When the AI's final capture is a battle, the AI battle popup opens from the same `aiStep` that sets `winner`; the victory overlay must wait for that popup to close (both are already-derived UI states in `GameScreen`).
- The overlay→map→new-game flow needs a `resetGame` action returning `null` (the setup screen is `state === null`; there is currently no path back).

## Desired End State

1. `winnerOf(state)` in `src/lib/victory.ts` returns the winning `CountryId`, or `null` while the campaign runs, derived purely from `fieldOwners` + map `initialOwner` data.
2. `GameState` carries `winner: CountryId | null`; the reducer sets it after any ownership-changing action (`moveArmy`, `attackArmy`, `aiStep`), clears `aiPlan` when it does, and ignores every gameplay action (`moveArmy`, `attackArmy`, `orderUnit`, `endTurn`, `aiStep`) once it is set.
3. A `resetGame` action returns the UI to the setup screen.
4. A victory overlay announces the result (Zwycięstwo/Porażka, turn count, city tally) after any pending battle popup closes; "Zobacz mapę" dismisses it leaving a read-only final map; "Nowa gra" returns to setup.
5. Verification: `npm test`, `npm run lint`, `npm run build` pass; a real campaign played to 4 enemy-city captures ends in the victory overlay, and the same flow with swapped countries ends in the defeat overlay.

## What We're NOT Doing

- No key-city (Moscow/Berlin) alternative victory — FR-013's Socratic round locked "all enemy cities".
- No turn-limit, score, or elimination-by-armies conditions; armies without cities do not extend the game.
- No draw handling in UI (unreachable in play; `winnerOf` is merely deterministic defensively).
- No persistence of finished games beyond what `GameState` already carries (S-08 owns persistence).
- No end-of-campaign statistics screen beyond turn count and city tally.

## Implementation Approach

Follow the established slice pattern: a pure engine module first (`src/lib/victory.ts`, mirroring how `src/lib/supply.ts` derives from `fieldOwners` and never stores), then reducer integration in `src/lib/game-state.ts` + `src/types.ts`, then UI last (`VictoryOverlay` + `GameScreen` wiring) with manual verification as the gate.

## Critical Implementation Details

- **State sequencing** — the winner check runs on the success path only, after the `isDomainError` backstops (a swallowed domain error leaves `winner` untouched, as with the rest of the state). When `aiStep` sets `winner` mid-replay, the return must skip the turn rollover and movement reset — the game is over, `aiTurnLog` stays for the summary, `aiPlan` is cleared.
- **Popup-before-overlay ordering** — the victory overlay's visibility derivation must include `battlePopup === null && aiBattlePopup === null` so the deciding battle plays out first; the dismissed state is a plain `useState` boolean reset by `startGame`/`resetGame`.

## Phase 1: Victory engine

### Overview

A pure, headless module deciding the winner from field ownership — fully testable without the reducer or UI.

### Changes Required:

#### 1. Victory module

**File**: `src/lib/victory.ts`

**Intent**: Derive the campaign winner from city ownership per FR-013: a country wins when it controls every city whose `initialOwner` belongs to the other country.

**Contract**: `export function winnerOf(state: GameState): CountryId | null`. Reads `MAP_FIELDS` (`@/data/map`) filtering `field.city !== null`; returns country `C` iff every city field with `initialOwner !== C` has `fieldOwners[field.id] === C`; countries evaluated in dataset order (germany, soviet) so a synthetic double-satisfaction still yields one deterministic winner; returns `null` otherwise (including a fresh game).

#### 2. Unit tests

**File**: `src/lib/victory.test.ts`

**Intent**: Cover the derived rule's full decision table with fixed map data.

**Contract**: Cases — fresh `createInitialGameState` → `null`; all enemy-`initialOwner` cities owned by the player's country → that country; one enemy city still held by the enemy → `null`; enemy-`initialOwner` city captured then recaptured (ownership churn) → `null`; player holds all enemy cities while also losing all own cities → still the player's country (own-city loss is irrelevant); synthetic state satisfying both sides' conditions → deterministic single winner; state with all 12 cities owned by one country → that country.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- (None — engine phase, fully covered by unit tests.)

---

## Phase 2: Reducer integration

### Overview

Wire the engine into `GameState` and the reducer: terminal `winner` field, immediate check after ownership changes, frozen game, `resetGame`.

### Changes Required:

#### 1. State type

**File**: `src/types.ts`

**Intent**: Carry the terminal campaign result in `GameState`.

**Contract**: Add `winner: CountryId | null` to `GameState` (after `aiTurnLog`), documented as "S-07: the campaign's winner once all enemy-initial cities are controlled by one side; null while in progress."

#### 2. Initial state

**File**: `src/lib/game-state.ts`

**Intent**: A fresh campaign is undecided.

**Contract**: `createInitialGameState` (`game-state.ts:65-104`) sets `winner: null` in the `fresh` object.

#### 3. Winner check + game freeze in the reducer

**File**: `src/lib/game-state.ts`

**Intent**: Set `winner` the instant a capture completes the condition; from that moment the reducer ignores all gameplay actions.

**Contract**:
- Add a small private helper (e.g. `withVictoryCheck(state: GameState): GameState`) that returns the state unchanged when `state.winner !== null` or `winnerOf(state) === null`, else `{ ...state, winner: winnerOf(state), aiPlan: [] }` — clearing `aiPlan` stops the replay without touching the driver.
- Apply it to the success-path return of `moveArmy`, `attackArmy`, and `aiStep` (all three mutation kinds inside `aiStep`; on winner, skip the turn rollover/movement-reset branch). `orderUnit` and `endTurn` change no ownership and need no check.
- Add early guards `if (state?.winner !== null) return state;` to `moveArmy`, `attackArmy`, `orderUnit`, `endTurn`, and `aiStep` (after the existing `null`/`aiPlan` guards). `startGame` stays unguarded (restart from a finished game must work).
- Extend `GameAction` with `{ type: "resetGame" }`; the case returns `null`.

#### 4. Reducer tests

**File**: `src/lib/game-state.test.ts`

**Intent**: Lock the freeze semantics and the three trigger paths.

**Contract**: New cases — free-capture `moveArmy` taking the last enemy city sets `winner` (fixed seed, minimal scripted state); `attackArmy` win doing the same; `aiStep` attack setting `winner` mid-replay returns `aiPlan: []`, unchanged `turn`, `aiTurnLog` preserved, and no movement reset; every gameplay action on a finished state is a no-op (deep-equal return); `resetGame` returns `null`; a state where the winner's condition is already met at `startGame` is impossible (assert `createInitialGameState(...).winner === null`).

### Success Criteria:

#### Automated Verification:

- Unit/integration tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- (None — reducer phase, covered by tests; UI behavior verified in Phase 3.)

---

## Phase 3: End-of-game UI

### Overview

The victory overlay, popup ordering, read-only final map, and the return path to a new game.

### Changes Required:

#### 1. Victory overlay component

**File**: `src/components/game/VictoryOverlay.tsx`

**Intent**: Announce the campaign result in the same visual language as `BattlePopup`.

**Contract**: `export function VictoryOverlay({ state, onDismiss, onNewGame }: { state: GameState; onDismiss: () => void; onNewGame: () => void })`. Hand-rolled fixed overlay (`fixed inset-0 z-50 … bg-slate-900/60`, `role="dialog"`, `aria-label="Koniec gry"`) — no shadcn Dialog. Content: title `Zwycięstwo!` (emerald) / `Porażka` (red) by `state.winner === state.playerCountryId`; summary line — final turn number and the city tally (X/12 per country, derived from `fieldOwners` + map data); two buttons: `Zobacz mapę` → `onDismiss`, `Nowa gra` → `onNewGame`.

#### 2. GameScreen wiring

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Show the overlay only after the deciding battle popup closes; block input on the finished game; offer a new game after dismissal.

**Contract**:
- Local state `victoryDismissed: boolean` (reset to `false` on `startGame` dispatch and on `resetGame`).
- Derived: `gameOver = state.winner !== null`; `showVictory = gameOver && !victoryDismissed && battlePopup === null && aiBattlePopup === null`; render `{showVictory && <VictoryOverlay … />}`.
- Input blocks: extend the existing `aiTurnActive` guards in `attack`, `onArmyClick`, `onFieldClick` (`GameScreen.tsx:158,164,184`) with `gameOver`; pass `ordersDisabled={aiTurnActive || gameOver}` to `DetailPanel` (`GameScreen.tsx:252`); disable the end-turn button when `gameOver`.
- Header: when `gameOver`, the end-turn button becomes `Nowa gra` dispatching `{ type: "resetGame" }` (and clearing selection/victoryDismissed).
- Replay driver (`GameScreen.tsx:81-89`): no change needed — `aiPlan` is cleared by the reducer when `winner` is set, so `aiTurnActive` is `false`; the `battlePopup/aiBattlePopup` pause conditions already sequence the overlay.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Victory path: start a game (Germany), play to capturing all 4 Soviet cities — the last battle's popup plays out first, then the victory overlay appears with turn count and 12/0-style city tally
- Overlay interactions: `Zobacz mapę` dismisses the overlay; the map is browsable (panels open on click) but moves, attacks, orders and end-turn do nothing; header shows `Nowa gra`
- Defeat path: start as USSR and let the AI take all 8 German-initial cities (or swap roles) — the red `Porażka` overlay appears after the AI's deciding battle popup
- `Nowa gra` returns to the setup screen with both country pickers functional; starting a new game plays normally
- Mid-replay stop: lose the last city during the AI's replay — remaining planned steps do not execute, the turn counter does not advance

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing the change.

---

## Testing Strategy

### Unit Tests:

- `src/lib/victory.test.ts` — the full decision table for `winnerOf` (see Phase 1).
- `src/lib/game-state.test.ts` — winner set on each trigger path (`moveArmy` free capture, `attackArmy` win, `aiStep` mid-replay), replay stop without turn rollover, no-op freeze of all gameplay actions, `resetGame`, fresh-game `winner === null`.

### Integration Tests:

- A scripted full cycle: fixed-seed `createInitialGameState` → reduced to a state one capture short of victory → the final `attackArmy`/`aiStep` → assert terminal state (`winner` set, `aiPlan` empty, subsequent `endTurn` is a no-op). Covered inside `game-state.test.ts` per existing conventions (no separate harness).

### Manual Testing Steps:

1. Play a real campaign to victory; verify popup→overlay ordering and overlay content.
2. Dismiss the overlay; verify the read-only map and the header `Nowa gra` button.
3. Lose a campaign (or swap countries and rush the loss); verify the defeat overlay and the mid-replay stop.
4. Reset and start a new campaign; verify nothing leaks from the finished game.

## Performance Considerations

`winnerOf` is O(fields) over 29 entries and runs at most once per ownership-changing reducer action — negligible. No memoization needed.

## Migration Notes

None — client-side state only, no persisted data yet. S-08 will persist `winner` as part of `GameState` for free (a finished game restores as finished).

## References

- PRD FR-013 (`context/foundation/prd.md:95-96`), Success Criteria Primary (prd.md:31)
- Roadmap S-07 (`context/foundation/roadmap.md:165-175`), GitHub issue #8, Linear KUR-12
- Prior slices' conventions: `context/archive/2026-09-03-ai-opponent/plan.md`, `context/archive/2026-09-03-supply-lines/plan.md` (derived-never-stored)
- Hook points: `src/lib/game-state.ts:150-185` (player captures), `game-state.ts:230-275` (`aiStep`), `GameScreen.tsx:73-89` (popup derivation + replay driver)
- Lessons: `context/foundation/lessons.md` (isDomainError backstops — checks run on success paths only)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Victory engine

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 3ba487a
- [x] 1.2 Linting passes: `npm run lint` — 3ba487a
- [x] 1.3 Production build passes: `npm run build` — 3ba487a

### Phase 2: Reducer integration

#### Automated

- [x] 2.1 Unit/integration tests pass: `npm test` — 7eb638a
- [x] 2.2 Linting passes: `npm run lint` — 7eb638a
- [x] 2.3 Production build passes: `npm run build` — 7eb638a

### Phase 3: End-of-game UI

#### Automated

- [x] 3.1 Linting passes: `npm run lint`
- [x] 3.2 Production build passes: `npm run build`

#### Manual

- [x] 3.3 Victory path: last battle popup plays first, then victory overlay with turn count and city tally
- [x] 3.4 Overlay dismissal leaves a browsable read-only map; `Nowa gra` in header
- [x] 3.5 Defeat path: red defeat overlay after AI's deciding battle popup
- [x] 3.6 `Nowa gra` returns to a functional setup screen; new game plays normally
- [x] 3.7 Mid-replay stop: remaining AI steps skipped, turn counter frozen
