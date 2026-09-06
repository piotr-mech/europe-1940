# Save & Resume Implementation Plan

## Overview

Client-side persistence for an in-progress campaign (FR-014, roadmap S-08): every game-state change is autosaved to `localStorage` under a versioned envelope, entering `/game` auto-resumes the saved campaign, and the save is cleared when the campaign ends. The game state is already fully JSON-serializable and all randomness is seeded inside the state, so plain JSON persistence is sufficient — no replays, no server.

## Current State Analysis

- `GameState` (`src/types.ts:173-194`) is plain serializable data (no functions, `Map`/`Set`, or `Date`s); `JSON.parse(JSON.stringify(state))` round-trips losslessly. The type comment at `src/types.ts:150` already anticipates S-08.
- Battle randomness is a seeded mulberry32 (`rngSeed` advanced by every `resolveBattle`, `src/lib/battle.ts:57`); the AI is deterministic and stores its pending actions in `aiPlan` (`src/lib/ai.ts`). A restored state reproduces all future behavior exactly.
- No persistence exists today: zero `localStorage` usage in `src/`; the `/game` island (`src/components/game/GameScreen.tsx:48-52`) mounts `client:only` with `useReducer(gameReducer, null)` — a refresh remounts with `state === null` and the game is lost (documented as known debt at `GameScreen.tsx:51`).
- `src/lib/` modules are pure and React-free with vitest tests alongside (`*.test.ts`); React lives only in `src/components/game/`. A persistence module slots into `src/lib/` following the same pattern.
- Game-over is `state.winner !== null` (no phase enum); the reducer freezes all cases once set (`src/lib/game-state.ts:169,181,249`). `resetGame` returns `null` to the setup screen.
- No save-schema version constant exists anywhere yet.
- `docs/reference/contract-surfaces.md:36-45` names the S-08 contract: the persisted snapshot must include `aiPlan`, `aiTurnLog`, `rngSeed`, `productionQueues` — i.e. the whole `GameState`, including mid-AI-replay snapshots.

### Key Discoveries:

- The replay driver (`GameScreen.tsx:89-97`) re-arms from `state` on every change, so a resumed save with a non-empty `aiPlan` continues the staged AI replay automatically — no special handling needed.
- UI-only `useState` flags (selection, popup/overlay dismissal, `GameScreen.tsx:56-73`) are deliberately not persisted: on resume, a pending `lastBattleReportByCountry` entry re-shows its battle popup, and a won game is impossible to resume (the save is cleared at `winner`). Re-showing the newest battle report after resume is acceptable, arguably desirable.
- Storage access can throw for environmental reasons (blocked cookies, quota, sandboxed iframe) even though the island is `client:only`; the module must degrade gracefully there while still letting developer errors (ReferenceError/TypeError) propagate — see the lessons rule about backstops.

## Desired End State

A campaign in progress survives a page refresh, tab close, and returning to the URL later: entering `/game` resumes the saved campaign at the exact turn, with armies, resources, production queues, AI replay state, and battle RNG seed intact. Starting a new campaign overwrites the save; finishing a campaign clears it, so a refresh after game over lands on the setup screen. Corrupt or future-versioned saves are silently discarded (the player starts a fresh game) rather than crashing the game.

## What We're NOT Doing

- No in-game "new game" button during an active campaign — abandoning a campaign mid-game means playing it out (the post-victory header already offers "Nowa gra"). Chosen consciously during planning.
- No resume-prompt screen ("Continue / New game") — pure auto-resume.
- No multi-tab coordination (storage-event listeners, per-tab slots): one save slot, last write wins. Solo game, no auth (PRD Access Control).
- No server-side persistence, no Supabase usage for game data.
- No save-slot management UI (multiple named saves, export/import).
- No migration of old saves to future schema versions — incompatible version ⇒ discard.

## Implementation Approach

Two phases mirroring repo conventions: first a pure, React-free `src/lib/persistence.ts` module with full vitest coverage (the pattern every other `src/lib/` module follows), then the minimal GameScreen integration — a lazy `useReducer` initializer for load, one effect for save/clear. All policy decisions (versioning, discard-on-corrupt, clear-on-victory) live in the lib module and are tested there; the island only wires them.

## Critical Implementation Details

- **Timing & lifecycle** — the save effect must read `state.winner`: `winner !== null` ⇒ `clearGame()` (and no save); `state === null` ⇒ do nothing (the setup screen has nothing to save, and `resetGame` must not resurrect a cleared save). Order inside the effect matters: never save a state that already has a winner.
- **State sequencing** — autosave fires on every reducer transition, including each staged `aiStep`; this is fine (state is a few KB), and it means even a refresh mid-AI-replay resumes correctly.
- **Error handling** — storage-access failures (DOMException: SecurityError, QuotaExceededError, privacy mode) must degrade to "no persistence" without crashing the island; per the lessons rule, never a bare `catch {}` — catch only recognized storage errors and let ReferenceError/TypeError/SyntaxError propagate.

## Phase 1: Persistence module

### Overview

A pure `src/lib/persistence.ts` module owning the save envelope, version constant, structural validation, and all localStorage access — fully unit-tested with a mocked storage, no React anywhere.

### Changes Required:

#### 1. Save envelope + API

**File**: `src/lib/persistence.ts` (new)

**Intent**: Own the whole persistence surface: constant for the storage key and schema version, and three functions the island calls — save, load, clear.

**Contract**:

```ts
export const SAVE_VERSION = 1;
export const SAVE_STORAGE_KEY = "europe1940:save";

/** Persists `state` under a versioned envelope. Environmental storage failures (quota, blocked storage) are swallowed — the game keeps playing without persistence. */
export function saveGame(state: GameState): void;

/** Returns the saved campaign, or null when no save exists, the version differs, or the payload fails structural validation — in every failure case the stored entry is removed. */
export function loadGame(): GameState | null;

/** Removes the stored entry (idempotent). */
export function clearGame(): void;
```

#### 2. Structural validation

**File**: `src/lib/persistence.ts` (new, same file)

**Intent**: Guarantee the game never boots from a malformed snapshot — `loadGame` validates the envelope (`version === SAVE_VERSION`) and the `GameState` shape (required top-level fields present with plausible types: `turn` number, country ids valid, `armies` array with well-formed entries, `resources`/`productionQueues`/`fieldOwners` records, `rngSeed` number, `winner` null-or-valid-country). Not exhaustive per-field typing — a pragmatic type-guard that catches truncation, wrong-version payloads, and random JSON, not adversarial deep fakes.

**Contract**: a private `isValidGameState(value: unknown): value is GameState` predicate; any `false` ⇒ remove the storage entry and return `null` from `loadGame`. Developer errors (typos in the validator itself) propagate — the predicate throws ReferenceError/TypeError rather than silently rejecting everything.

#### 3. Unit tests

**File**: `src/lib/persistence.test.ts` (new)

**Intent**: Cover the module's contract: round-trip fidelity (a real `createInitialGameState()` plus a few reducer steps, saved then loaded, deep-equals the original), version rejection (envelope with `SAVE_VERSION + 1` ⇒ `null` + entry removed), corrupt-JSON rejection (garbage string ⇒ `null` + entry removed), missing-field rejection, `clearGame` idempotency, and a mid-AI-replay snapshot (`aiPlan` non-empty) round-tripping. localStorage is mocked/stubbed per vitest environment.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npx vitest run src/lib/persistence.test.ts`
- Full suite still green: `npx vitest run`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- (none — pure module, fully covered by automated tests)

---

## Phase 2: GameScreen integration

### Overview

Wire the persistence module into the `/game` island: auto-resume on mount, autosave on every state transition, clear on campaign end. Plus the doc note that S-08's contract is now satisfied.

### Changes Required:

#### 1. Auto-resume via lazy initializer

**File**: `src/components/game/GameScreen.tsx`

**Intent**: On mount, restore the saved campaign instead of always starting at the setup screen. The lazy third argument of `useReducer` runs once, so the storage read happens a single time at island boot.

**Contract**: `useReducer(gameReducer, null)` becomes `useReducer(gameReducer, null, loadGame)` — `loadGame` already has the `(no argument) => GameState | null` shape the initializer expects. Update the stale comment block at `GameScreen.tsx:48-52` ("refresh returns to setup (persistence is S-08)") to describe auto-resume instead.

#### 2. Autosave / clear effect

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Persist every state transition and clear the save when the campaign ends.

**Contract**: a single `useEffect` keyed on `[state]`: `state === null` ⇒ return; `state.winner !== null` ⇒ `clearGame()`; otherwise `saveGame(state)`. Ordering inside the effect: winner check before save (Critical Implementation Details). No other component changes — popup dismissal flags etc. stay UI-local by design.

#### 3. Contract-surfaces doc touch

**File**: `docs/reference/contract-surfaces.md`

**Intent**: The doc (lines ~36-45) lists the S-08 persistence contract as a forward requirement; mark it satisfied by pointing at `src/lib/persistence.ts` so the reference stays truthful.

**Contract**: update the S-08 passage to reference the implemented module; no new sections.

### Success Criteria:

#### Automated Verification:

- Full suite still green: `npx vitest run`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Refresh mid-campaign (own turn): game resumes on the same turn with armies, treasury, production queues, selection state cleared — no crash, no setup screen
- Refresh during the AI's staged replay (popup open or "Ruch AI…"): replay continues from where it left off
- Refresh after victory/defeat: setup screen appears (save was cleared); "Rozpocznij grę" starts a fresh campaign
- Corrupt-save drill: with a game in progress, set the storage entry to garbage via devtools, refresh ⇒ setup screen, no console crash
- A resumed game with a pending battle report re-shows that popup once (accepted behavior)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/persistence.test.ts` — round-trip (initial state + reducer steps, deep-equal), version mismatch ⇒ discard, corrupt JSON ⇒ discard, malformed payload ⇒ discard, mid-AI-replay snapshot round-trip, clear idempotency

### Integration Tests:

- None — repo has no component-test infrastructure (no @testing-library); the integration surface is manual (below). Bringing React testing here would widen scope beyond S-08.

### Manual Testing Steps:

1. Start a campaign, make a few moves, refresh ⇒ same turn resumes
2. Refresh mid-AI-replay ⇒ replay continues
3. Win or lose a campaign, refresh ⇒ setup screen
4. Corrupt the storage entry via devtools, refresh ⇒ setup screen, no errors in console
5. Close the tab entirely, reopen the URL ⇒ campaign resumes

## Performance Considerations

The state is a few KB of JSON; serializing on every reducer transition (including each `aiStep`) is negligible. No debouncing needed — simplicity wins (one-sentence rule).

## Migration Notes

No existing saves to migrate (persistence is new). Future schema changes bump `SAVE_VERSION`; old saves are discarded silently by design.

## References

- PRD: `context/foundation/prd.md` — FR-014, Guardrails, Secondary criteria
- Roadmap: `context/foundation/roadmap.md` — S-08
- Contract: `docs/reference/contract-surfaces.md:36-45`
- State type: `src/types.ts:173-194`; reducer: `src/lib/game-state.ts`; island: `src/components/game/GameScreen.tsx:48-97`
- Lessons: bare-catch backstop rule (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Persistence module

#### Automated

- [x] 1.1 Unit tests pass: `npx vitest run src/lib/persistence.test.ts` — 5ad15a5
- [x] 1.2 Full suite still green: `npx vitest run` — 5ad15a5
- [x] 1.3 Linting passes: `npm run lint` — 5ad15a5
- [x] 1.4 Production build passes: `npm run build` — 5ad15a5

### Phase 2: GameScreen integration

#### Automated

- [x] 2.1 Full suite still green: `npx vitest run`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Production build passes: `npm run build`

#### Manual

- [x] 2.4 Refresh mid-campaign (own turn) resumes the same turn
- [x] 2.5 Refresh during AI replay continues the replay
- [x] 2.6 Refresh after game end shows the setup screen
- [x] 2.7 Corrupt-save drill: garbage entry ⇒ setup screen, no crash
- [x] 2.8 Resumed game re-shows a pending battle popup once
