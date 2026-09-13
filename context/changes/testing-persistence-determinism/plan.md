# Persistence & Determinism Invariants Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md`: prove risk #4 (save/resume survives
schema evolution — a drifted save is cleanly discarded or loads correctly, a finished
game is never resurrected, storage failure degrades gracefully) and risk #5 (determinism
becomes an enforced repository-wide invariant — no wall-clock/unseeded randomness in the
reducer path; replay from a persisted seed reproduces the exact action sequence). This
change is test-and-config work plus one small production refactor (a pure persistence
decision helper); it changes no game logic.

## Current State Analysis

Grounded in `context/changes/testing-persistence-determinism/research.md` (the codebase
baseline — file:line references live there):

- Persistence is a single `localStorage` slot behind a `{ version, state }` envelope
  with `SAVE_VERSION = 1` and discard-not-migrate semantics
  (`src/lib/persistence.ts:15-107`). The load-time guard is deliberately pragmatic
  (shape checks only) — archived impl-review F1 accepted that; tests must not demand
  deep validation.
- The finished-game invariant lives in the autosave effect ordering in the UI
  (`src/components/game/GameScreen.tsx:104-111`: `winner !== null` → `clearGame()`,
  `null` → nothing, else `saveGame`); the guard itself accepts a `winner`-bearing save
  (`persistence.ts:224`). Nothing tests this.
- `SAVE_VERSION` was never bumped while the state schema evolved (guard widened
  instead, twice); the existing suite tests only a *future* version rejection
  (`src/lib/persistence.test.ts:137-142`). No past-version test, no old-shape fixture.
- The engine is determinism-clean today (zero `Math.random`/`Date`/`crypto` in
  `src/lib` engine modules and `src/data`); the only sanctioned wall-clock read is the
  one-time campaign seed `Date.now()` at `startGame` (`GameScreen.tsx:162`), entering
  the reducer as action data. No static rule enforces this; `eslint.config.js` has no
  `no-restricted-*` usage — a clean insertion point.
- Mid-replay resume works architecturally (`aiPlan`/`aiTurnLog`/`rngSeed` in state,
  autosave per `aiStep`), but the existing round-trip test only asserts
  `aiPlan.length === 1` after reload (`persistence.test.ts:99-108`) — it does not prove
  replay equality against an uninterrupted run.

### Key Discoveries:

- Reducer path = the closed engine module set (`src/lib/{game-state,battle,ai,movement,production,supply,victory}.ts` + `src/data/*` + `src/types.ts`); `src/lib/` also hosts non-engine modules (`persistence.ts`, `game-data.ts`, `utils.ts`, `config-status.ts`, `supabase.ts`, `balance-simulation.ts`, `test-utils.ts`) that a static rule must not hit (research §I).
- `drainAiTurn` in `src/lib/test-utils.ts:55-68` drives the full AI turn through the real reducer — the replay-equality test can be pure unit-layer, no component mounting.
- ESLint flat config already runs repo-wide in CI (`npm run lint`) and pre-commit (lint-staged) — a new scoped rule becomes a gate with zero workflow changes.
- The user decisions for this plan: pin BOTH epoch routes (version mismatch ⇒ discard; old shape still round-trips); ghost saves (guard-passing drifted states that fail silently in UI) are explicitly out of scope; the finished-game invariant is pinned via a pure helper extracted from the UI effect.

## Desired End State

- `npm test` proves: version mismatch (past and future) ⇒ `null` + entry removed; an old-schema-shape fixture round-trips after guard extension; a late-game state round-trips deep-equal; a resumed mid-replay campaign drains to the exact same `aiTurnLog` and final state as an uninterrupted run; a state with `winner` is never saved (helper contract); storage failure degrades to no-persistence.
- `npm run lint` fails if wall-clock/unseeded randomness appears in an engine module; a self-verification test proves the rule catches violations and holds on the current engine.
- `test-plan.md` §6.4 documents the persistence/determinism test pattern; §5's determinism static rule gate is live.

## What We're NOT Doing

- **No deep save validation** — guard looseness is deliberate (save-resume impl-review F1: revisit only if saves ever come from an untrusted source). Ghost saves (orphan `fieldId`, `units: []`, negative values) that pass the guard stay untested and undocumented-as-defects.
- **No `SAVE_VERSION` bump** — the schema is not changing in this change; we only pin both sanctioned evolution routes with tests.
- **No component/DOM tests** (test-plan §7 defers them) — the GameScreen effect ordering is pinned via the extracted helper, not by rendering.
- **No input-blocking tests** — UI-side replay blocking is risk #6 (rollout Phase 4).
- **No RNG decorrelation** — mulberry32 consecutive-draw correlation is a product change, deferred by Phase 2 (test-plan §6.6).
- **No `resetGame` mid-campaign guard** — latent F4 stays latent until a mid-game exit UI exists; we only test the today-true negative (post-victory reset leaves storage empty).
- **No CI workflow changes** — the existing lint/test steps pick up the new rule and tests automatically.

## Implementation Approach

Three test phases over one tiny refactor, then documentation. Phase 1 extracts the
autosave decision into a pure, tested helper (new code — TDD: the helper does not
exist, so the first assertion is genuinely red) and pins the epoch discipline both
ways. Phase 2 adds the characterization corpus: late-game round-trip and the
replay-equality proof (these should pass immediately — freezing correct behavior is
the point; implement mode). Phase 3 adds the ESLint determinism rule and its
self-verification test (rule absent ⇒ self-test red; TDD). Phase 4 writes the cookbook
entry and syncs the test plan.

Oracle sources (assertions derive from these, never from implementation output):
save-resume plan contract (`context/archive/2026-09-06-save-resume/plan.md:34,42,69,181`),
battle-city-capture RNG purity rule (`plan.md:65`), ai-opponent replay-from-queue
(`plan.md:15`), regression-floor in-change guard-extension discipline
(`plan.md:43,264`), PRD FR-014 + guardrails (`prd.md:39-40,99-100`).

## Critical Implementation Details

- **State sequencing (Phase 1)**: `persistDecision` must encode the effect's exact
  ordering — `null` → skip, `winner !== null` → clear (never save), otherwise save.
  The GameScreen effect must be rewritten to delegate to the helper so the tested
  contract and the production behavior cannot drift apart.
- **Engine allowlist maintenance (Phase 3)**: the ESLint block targets engine files by
  explicit `files` list, not `src/lib/**` with exclusions — a new engine module added
  later must be added to the list consciously (that is the gate's intent: adding a
  module to the reducer path is a decision). The self-test reads the same file list
  from one shared constant so the rule and its verification cannot diverge.
- **AST limits**: `no-restricted-syntax` catches call sites (`Date.now()`,
  `Math.random()`, `performance.now()`, `new Date`, `crypto.*`), not values flowing in
  from the UI. The seed's flow through `startGame` stays covered by the replay test,
  not by lint. `setTimeout` is NOT banned (presentation pacing is UI-only).

## Phase 1: Persistence Decision Helper & Epoch Discipline

### Overview

Extract the autosave decision into a pure helper and pin the schema-epoch discipline
both ways: version mismatch (past and future) discards; an old-shape save still
round-trips after the guard was widened in-place.

### Changes Required:

#### 1. Pure persistence decision helper

**File**: `src/lib/persistence.ts`

**Intent**: Move the UI effect's save/clear/skip decision into a pure, exportable
function so the finished-game invariant ("never save a state that already has a
winner") becomes a unit-testable contract instead of emergent effect ordering.

**Contract**: `export function persistDecision(state: GameState | null): "save" | "clear" | "skip"`
— `null` → `"skip"`, `winner !== null` → `"clear"`, otherwise `"save"`. Mirror of the
logic currently inline at `GameScreen.tsx:104-111`.

#### 2. Delegate the autosave effect to the helper

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Rewrite the autosave effect (`:104-111`) to switch on `persistDecision(state)`
— `"save"` → `saveGame(state)`, `"clear"` → `clearGame()`, `"skip"` → nothing. Behavior
is byte-for-byte identical; only the location of the decision changes.

**Contract**: same observable storage behavior as today; the effect body becomes a
three-branch dispatch on the helper's result.

#### 3. Helper + epoch discipline tests

**File**: `src/lib/persistence.test.ts`

**Intent**: TDD — write the failing tests first (helper does not exist yet; the
past-version and old-shape cases are untested). Then implement/minimally adjust until
green.

**Contract**:
- `persistDecision`: `null` → `"skip"`; a played state → `"save"`; a state with
  `winner !== null` → `"clear"` (never `"save"` — oracle: save-resume plan line 42);
  post-victory `resetGame` yields `null` ⇒ `"skip"`, so storage stays empty after a
  finished campaign.
- Version mismatch: an envelope with `version: SAVE_VERSION - 1` AND one with
  `SAVE_VERSION + 1` both load as `null` with the entry removed (oracle: line 34/69,
  "incompatible version ⇒ discard"). The existing future-version test stays.
- Old-shape epoch fixture: a save written in the pre-`skipped`-log epoch (a
  `GameState` without `skipped` entries — the shape before commit `e283824`) passes
  the guard and round-trips deep-equal (oracle: regression-floor plan line 264, "old
  saves must load unchanged"). Fixture built via a small local builder next to the
  test, not a committed JSON blob, so it tracks type changes at compile time.

### Success Criteria:

#### Automated Verification:

- `npx vitest run src/lib/persistence.test.ts` — all new + existing tests green
- `npm run lint` — passes (helper + rewritten effect)
- `npm test` — full suite green (no regression from the effect rewrite)

#### Manual Verification:

- `npm run dev`: start a campaign, play a turn, refresh — campaign resumes; finish
  (or seed a quick win), refresh — setup screen, and DevTools shows the save key gone.

---

## Phase 2: Round-Trip Corpus & Replay Equality

### Overview

Freeze the two strongest #4/#5 behaviors as characterization tests: a late-game state
round-trips losslessly, and a campaign resumed mid-AI-replay from a persisted save
drains to the exact same action log and final state as an uninterrupted run.

### Changes Required:

#### 1. Late-game round-trip

**File**: `src/lib/persistence.test.ts`

**Intent**: Close the "happy-path only" gap — round-trip a reducer-reached late-game
state, not a hand-built early one.

**Contract**: Drive the real reducer from `createInitialGameState` through several
`endTurn` + `drainAiTurn` cycles (fixed seed, e.g. 7) until the state has ≥ 3 armies,
non-empty `productionQueues`, and a non-null `lastBattleReportByCountry` entry; then
`saveGame` → `loadGame` deep-equals the saved state, and a second
`saveGame(loadGame(...))` byte-identical envelope (save→load→save).

#### 2. Replay-equality proof

**File**: `src/lib/game-state.test.ts` (or a new `src/lib/replay.test.ts` if the suite
reads cleaner — implementer's call, keep it colocated per cookbook §6.1)

**Intent**: Prove the oracle "a restored state reproduces all future behavior exactly"
(save-resume plan line 10) at the cheapest layer that exercises real persistence.

**Contract**: For a fixed seed and ≥ 2 cut points mid-AI-replay (after `endTurn`
produces a non-empty `aiPlan`, after 1 `aiStep`, after half the queue):
`drainAiTurn(uninterrupted)` vs `saveGame(cutState)` → `loadGame()` →
`drainAiTurn(...)` produce (a) equal `aiTurnLog` arrays and (b) deep-equal final
states. Use `MemoryStorage` stub + `drainAiTurn` from `@/lib/test-utils`. Cite the
seed and cut indices in test titles. Exact equality only — no distributional
assertions (mulberry32 correlation note, test-plan §6.6 Phase 1).

#### 3. Storage-failure degradation gap

**File**: `src/lib/persistence.test.ts`

**Intent**: Cover the one untested degradation branch — `removeItem` throwing
(DOMException) — completing the no-persistence-without-crashing oracle.

**Contract**: a `MemoryStorage` whose `removeItem` throws `DOMException`; `loadGame`
on a corrupt entry still returns `null` without throwing.

### Success Criteria:

#### Automated Verification:

- `npm test` — full suite green; new tests visibly exercise real reducer + real persistence round-trip (no implementation-mirror expected values — expectations are structural equality between two runs, not precomputed literals)

#### Manual Verification:

- `npm run dev`: mid-AI-replay refresh resumes and the AI visibly continues from
  where it stopped (spot-check that the test scenario matches reality).

---

## Phase 3: Static Determinism Rule

### Overview

Turn "the engine is deterministic" from an accident into a gate: an ESLint rule that
fails when wall-clock or unseeded randomness enters an engine module, plus a
self-verification test that proves the rule both holds on the codebase and catches
violations.

### Changes Required:

#### 1. Shared engine-module list

**File**: `eslint.config.js` (exported) or a tiny `determinism-rule.constants.ts` imported by both — implementer's choice, but exactly one source of truth

**Intent**: The rule's file scope and the self-test's file scope must come from one
list so they cannot diverge.

**Contract**: the closed engine set: `src/lib/game-state.ts`, `src/lib/battle.ts`,
`src/lib/ai.ts`, `src/lib/movement.ts`, `src/lib/production.ts`, `src/lib/supply.ts`,
`src/lib/victory.ts`, `src/data/map.ts`, `src/data/terrain.ts`, `src/data/units.ts`,
`src/data/countries.ts`, `src/types.ts`. Adding a module to the reducer path means
adding it here — consciously.

#### 2. ESLint scoped rule block

**File**: `eslint.config.js`

**Intent**: Ban entropy/clock call sites in engine modules.

**Contract**: A `tseslint.config({ files: <engine list>, rules: { … } })` block with
`no-restricted-syntax` (or `no-restricted-properties` where it fits better) rejecting:
`Date.now`, `Date.now()`, `new Date`, `Math.random`, `performance.now`, and
`crypto.randomUUID` / `crypto.getRandomValues`. Error messages should name the
determinism contract and point to `test-plan.md` §5. Not banned: `setTimeout`
(presentation pacing), anything in non-engine modules.

#### 3. Self-verification test

**File**: `src/lib/determinism-rule.test.ts`

**Intent**: TDD — the rule does not exist yet, so the self-test is red first (fixture
violations go unreported). Prove the gate works and holds.

**Contract**: Using the ESLint Node API (flat config) programmatically:
(a) linting the engine module set reports zero determinism-rule messages;
(b) linting an inline fixture (a string module containing `Date.now()`,
`Math.random()`, `new Date()`, `performance.now()`, `crypto.randomUUID()`) reports
one message per banned construct. Keep the fixture as an inline source string (not a
committed .ts file) so it never pollutes type-checking or the production lint run.

### Success Criteria:

#### Automated Verification:

- `npx vitest run src/lib/determinism-rule.test.ts` — green
- `npm run lint` — green (engine is clean today)
- Deliberate canary check (then revert): temporarily add `Math.random()` to
  `src/lib/battle.ts` → `npm run lint` fails with the determinism message

#### Manual Verification:

- `git diff eslint.config.js` reviewed: rule scoped to the engine list only; no
  global behavior change (`npm run lint` output on non-engine files unchanged).

---

## Phase 4: Cookbook & Plan Sync

### Overview

Record the patterns this phase established so future tests follow them, and mark the
gate live.

### Changes Required:

#### 1. Fill cookbook §6.4

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.4 "TBD — see §3 Phase 3" placeholder with the
persistence/determinism pattern.

**Contract**: §6.4 documents: location (`src/lib/persistence.test.ts`,
`src/lib/determinism-rule.test.ts`), reference tests (replay-equality describe,
epoch fixtures, self-verification test), the engine-module allowlist as the static
rule's scope, mocking policy (MemoryStorage stub via `vi.stubGlobal`; real reducer,
never mocked RNG), and when NOT to use (ghost-save validation, component tests).

#### 2. Phase note + gate confirmation

**File**: `context/foundation/test-plan.md`

**Intent**: Append the §6.6 Phase 3 note (2-3 lines: what the rollout taught — e.g.
whether the helper extraction surfaced anything, canary-check experience) and flip the
§5 determinism-static-rule row's status from "required after §3 Phase 3" wording to
live/enforced with a `checked:` date. Update the §8 Freshness Ledger dates touched by
this edit.

**Contract**: §6.4 non-TBD; §6.6 has a Phase 3 bullet; §5 row reflects the gate is
enforced; frontmatter `Last updated` bumped.

### Success Criteria:

#### Automated Verification:

- `npm test` — full suite green (final run)
- `npm run lint` — green
- `npm run build` — green (the effect rewrite is production code)

#### Manual Verification:

- Read §6.4 cold: a contributor who missed this phase could add a
  persistence/determinism test by following it without asking questions.

---

## Testing Strategy

### Unit Tests:

- `persistDecision` contract (3 branches + post-victory reset negative)
- Epoch discipline: past/future version discard; old-shape fixture round-trip
- Late-game save→load→save round-trip (deep-equal + byte-identical envelope)
- Storage degradation: `removeItem` throwing DOMException

### Integration Tests:

- Replay equality: real reducer + real persistence round-trip, fixed seeds, mid-replay
  cut points; uninterrupted vs resumed runs compared structurally (no precomputed
  literals — the oracle is run-vs-run equality, immune to implementation mirroring)
- Determinism-rule self-verification via programmatic ESLint (engine clean + fixture
  caught)

### Manual Testing Steps:

1. `npm run dev` — new campaign, play a turn, refresh mid-AI-replay: resumes and AI
   continues from the persisted queue.
2. Finish a campaign (or force a quick win), refresh: setup screen; save key absent
   in DevTools Application → Local Storage.
3. Canary the lint rule once (add `Math.random()` to an engine file, see
   `npm run lint` fail, revert).

## Performance Considerations

Negligible: a handful of unit/integration tests ride the existing Vitest suite
(seconds); the ESLint self-test adds one programmatic lint of ~12 files (well under
the suite's current runtime). No production hot path is touched.

## Migration Notes

None — no schema change, no version bump, no data to migrate. The helper extraction is
behavior-identical (Phase 1 manual check confirms).

## References

- Research: `context/changes/testing-persistence-determinism/research.md`
- Test plan: `context/foundation/test-plan.md` §2 rows #4/#5, §3 Phase 3, §4, §5, §6.4
- Oracle: `context/archive/2026-09-06-save-resume/plan.md` (persistence contract),
  `context/archive/2026-09-02-battle-city-capture/plan.md:65` (RNG purity),
  `context/archive/2026-09-09-testing-regression-floor/plan.md:43,264` (epoch discipline)
- Implementation targets: `src/lib/persistence.ts`, `src/components/game/GameScreen.tsx:104-111`,
  `eslint.config.js`, `src/lib/test-utils.ts:55-68` (reused as-is)
- Existing suites to extend: `src/lib/persistence.test.ts`, `src/lib/game-state.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Persistence Decision Helper & Epoch Discipline

#### Automated

- [x] 1.1 `persistDecision` helper tests red → implementation green (null→skip, winner→clear, played→save) — 7bdd87f
- [x] 1.2 GameScreen autosave effect delegates to `persistDecision` (full suite + lint green) — 7bdd87f
- [x] 1.3 Past-version (`SAVE_VERSION - 1`) envelope discarded + entry removed — 7bdd87f
- [x] 1.4 Old-shape epoch fixture round-trips deep-equal through the widened guard — 7bdd87f

#### Manual

- [x] 1.5 `npm run dev`: turn-play refresh resumes; post-victory refresh shows setup screen with save key gone — 7bdd87f

### Phase 2: Round-Trip Corpus & Replay Equality

#### Automated

- [x] 2.1 Late-game state save→load→save round-trip (deep-equal state, byte-identical envelope)
- [x] 2.2 Replay-equality proof at ≥ 2 mid-replay cut points (equal `aiTurnLog`, deep-equal final state)
- [x] 2.3 `removeItem` throwing DOMException still degrades without crashing

#### Manual

- [x] 2.4 `npm run dev`: mid-AI-replay refresh visibly continues the AI queue

### Phase 3: Static Determinism Rule

#### Automated

- [ ] 3.1 Self-verification test red → ESLint engine rule green (engine clean, fixture violations caught)
- [ ] 3.2 Canary check: `Math.random()` in an engine file fails `npm run lint`, then reverted
- [ ] 3.3 `npm run lint` green on the untouched repo

#### Manual

- [ ] 3.4 Review `git diff eslint.config.js`: scope limited to the engine allowlist

### Phase 4: Cookbook & Plan Sync

#### Automated

- [ ] 4.1 `npm test` + `npm run lint` + `npm run build` all green (final run)

#### Manual

- [ ] 4.2 `test-plan.md` §6.4 written, §6.6 Phase 3 note appended, §5 gate marked enforced, §8 ledger bumped
