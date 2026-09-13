# Campaign End-to-End Integrity Implementation Plan

## Overview

Rollout Phase 4 of `context/foundation/test-plan.md`: prove risk #6 — turn-sequencing
integrity as one tested sequence. Three faces: endTurn sequencing (observable
couplings only — no call-order mocks), player-input blocking during AI replay
(pinned via a pure decision helper), and victory/freeze/reset firing from every
trigger path. One scripted full cycle plus a multi-seed structural soak, then
cookbook sync. Test-and-refactor work only: one tiny production refactor (the
`inputBlocked` helper) plus guard delegation in the UI; no game-logic changes, no
new reducer guards (that is a product decision this change deliberately does not
make).

## Current State Analysis

Grounded in `context/changes/testing-campaign-integrity/research.md` (file:line
references live there):

- `endTurn` = `collectIncome` → `advanceProduction` → `planAiTurn`, staging `aiPlan`
  without incrementing the turn; `turn + 1` and the `movementAllowance` reset land
  only when the queue drains (`aiStepTail`, `game-state.ts:216-314`). Supply is
  derived-never-stored (`supply.ts:5-10`) — it is NOT an endTurn step; its evaluation
  point is the drain-time reset.
- The income↔production order is spec-mandated (spec §20) but mechanically
  unobservable (resources-production plan `:59`); the observable couplings are
  economy→AI planning and AI captures→drain-time supply reset.
- Input blocking is UI-only except `endTurn` (reducer guard `game-state.ts:217`).
  `moveArmy`/`attackArmy`/`orderUnit` guard `winner` only; `resetGame`/`startGame`
  are unguarded by design. Every document mandates blocking as a UI contract
  ("the UI must not offer…", ai-opponent plan `:50`).
- Victory anchor (`initialOwner`, static dataset) is correct and unit-tested
  (`victory.test.ts:26-75`); three trigger paths are unpinned at reducer level:
  `aiStep`-move free capture, intermediate-path capture (battle + multi-field
  move), and the skipped-path check in `aiStepTail`.
- Existing pins: endTurn-ignored mid-replay (`game-state.test.ts:189-194`), supply
  cap at rollover (`:196-230`), mid-replay victory (`:674-726`), freeze of all five
  actions (`:728-741`), resetGame → null (`:743-748`).
- Affordances: `drainAiTurn` (`test-utils.ts:72-85`), builders (`:27-62`),
  `assertStructuralInvariants` (`ai-simulation.test.ts:15-30`), the scripted-cycle
  recipe (victory-conditions plan `:203`), and the `persistDecision` extraction
  precedent (Phase 3).

### Key Discoveries:

- Risk #6's phrase "income → production → supply in the mandated order" does not map to a reducer order — the oracle is observable (allowance at rollover, AI orders seeing post-economy treasury), never call-order. A call-order test would be the exact "brittle order assumption" the risk row forbids.
- No draw rule exists: 62% of simulated campaigns stall (test-plan §6.6 Phase 2) — a full cycle ending `winner === null` is a legal outcome, not a failure.
- Spec §30 (key-cities victory) is overridden by PRD FR-013 — never an oracle.
- User decisions for this plan: blocking pinned via a pure `inputBlocked(state, action)` helper (persistDecision pattern, zero behavior change); ALL three victory trigger-path gaps pinned; cycle shape = near-victory fixture + multi-seed soak.

## Desired End State

- `npm test` proves: `inputBlocked`'s contract (endTurn blocked mid-replay and after
  winner; move/attack/order blocked after winner; reset/start never); the three
  missing victory trigger paths; a scripted full cycle on a near-victory fixture
  with terminal assertions (winner set, `aiPlan` empty, no rollover, no movement
  reset, subsequent actions no-op, `resetGame` → null); and a multi-seed soak whose
  structural invariants hold after every phase of every cycle.
- The GameScreen guards delegate to `inputBlocked`, so the tested contract and the
  production UI cannot drift apart.
- `test-plan.md` §6.6 carries the Phase 4 note; §6.3 gains the scripted-cycle
  pattern line if anything non-obvious emerged.

## What We're NOT Doing

- **No reducer-level guard change for move/attack/order mid-replay** — documents
  mandate UI-level blocking; adding a reducer guard is a product decision outside
  this test change (documented as an open possibility, not taken).
- **No component/DOM tests** (§7 defers them) — UI guard wiring is delegated to the
  helper; disabled-button states stay manual.
- **No call-order assertions** — income↔production order is unobservable between the
  two phases; supply is not a reducer step. Observables only.
- **No draw rule / turn-cap verdicts** — `winner === null` is a legal cycle outcome.
- **No victory-oracle changes** — anchor stays `initialOwner` per S-07; spec §30 is
  dead text for this purpose.
- **No CI/workflow changes** — new tests ride the existing suite.

## Implementation Approach

Four phases. Phase 1 extracts the input-blocking decision into a pure helper (new
code — TDD: the helper does not exist, the first assertion is red) and rewires the
GameScreen guards to it. Phase 2 pins the three victory trigger-path gaps as
characterization tests (should pass immediately — freezing correct behavior).
Phase 3 builds the scripted full cycle on a near-victory fixture plus the multi-seed
soak (characterization; `winner === null` accepted). Phase 4 writes the cookbook
note and syncs the test plan.

Oracle sources (assertions derive from these, never from implementation output):
spec §20 (`europe_1940_specyfikacja.md:618-647`), PRD FR-002/003/009/010/011/012/013,
resources-production plan (`:32`, `:59`, `:161`), supply-lines plan (`:31`, `:52`),
ai-opponent plan (`:49-50`, `:138`, `:230-231`), victory-conditions plan (`:19`,
`:28`, `:47`, `:64`, `:72`, `:119-122`, `:203`).

## Critical Implementation Details

- **Helper semantics must mirror today's guards exactly (Phase 1)**:
  `inputBlocked(state, action)` returns `true` for `endTurn` when
  `winner !== null || aiPlan.length > 0`; `true` for `moveArmy`/`attackArmy`/
  `orderUnit` when `winner !== null`; `true` for `aiStep` when
  `winner !== null || aiPlan.length === 0` (guarded both ways today); always
  `false` for `resetGame`/`startGame`; `false` when `state === null` except
  `startGame` (which is the only legal action there — helper stays `false`, the
  null screen simply offers nothing else). The UI delegates its
  `aiTurnActive || gameOver` early-returns to this helper so contract and
  production cannot diverge. Zero behavior change is the bar.
- **Fixture construction (Phase 3)**: near-victory states must respect that moving
  through an already-owned city does not flip it (`movement.ts:189`) and that only
  the acting side can newly complete the condition (S-07 `:20`) — build fixtures
  with `stateWith(armies, ownersOverrides)` one capture short of victory, per the
  S-07 `:203` recipe.
- **Soak bounds (Phase 3)**: reuse `drainAiTurn`'s 50-step loud cap; run
  `assertStructuralInvariants` after economy, after drain, and after each scripted
  player action — the phase boundaries ARE the test points, not incidental.

## Phase 1: Input-Blocking Decision Helper

### Overview

Extract the input-blocking decision into a pure, tested helper; rewire the GameScreen
guards to delegate to it. The UI contract from the documents ("the UI must not offer
moves/attacks/orders while the queue is non-empty") becomes a unit-testable
specification instead of scattered early-returns.

### Changes Required:

#### 1. Pure input-blocking helper

**File**: `src/lib/game-state.ts`

**Intent**: Encode the action-gating contract in one pure function so the documented
UI-level blocking requirement is pinned without component tests.

**Contract**: `export function inputBlocked(state: GameState | null, action: GameAction["type"]): boolean`
— semantics mirror today's reducer guards exactly (see Critical Implementation
Details); export alongside `isDomainError`.

#### 2. GameScreen guards delegate

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Replace the inline `aiTurnActive || gameOver` conditions in the input
handlers (`:182`, `:188`, `:208`) with `inputBlocked(state, "<action>")` so the
tested contract drives production behavior. Button `disabled` states (`:269`, `:296`)
may keep their simpler expressions (they gate presentation, not dispatch).

**Contract**: same observable behavior — dispatch of a blocked action never fires;
`aiTurnActive` remains the replay-driver signal (untouched).

#### 3. Helper contract tests

**File**: `src/lib/game-state.test.ts`

**Intent**: TDD — write the failing tests first (helper absent ⇒ red), then implement.

**Contract**: for each of the seven action types × the relevant states (fresh, mid-
replay non-empty `aiPlan`, finished): `endTurn` blocked mid-replay AND finished;
`moveArmy`/`attackArmy`/`orderUnit` blocked finished, NOT blocked mid-replay (the
documented UI-only boundary — the helper states it, the plan does not fix it);
`aiStep` blocked when the queue is empty or a winner is set; `resetGame`/`startGame`
never blocked. Null state: only `startGame` meaningful — helper returns `false`.

### Success Criteria:

#### Automated Verification:

- `npx vitest run src/lib/game-state.test.ts` — green incl. new contract tests
- `npm run lint` — green (helper + rewritten guards)
- `npm test` — full suite green (guard rewrite is behavior-identical)

#### Manual Verification:

- `npm run dev`: during "Ruch AI…" no move/attack/order/end-turn is possible; after
  victory only "Nowa gra" acts; a mid-replay refresh still resumes.

---

## Phase 2: Victory Trigger-Path Gaps

### Overview

Pin the three ownership-changing paths whose victory check is currently unasserted,
closing the S-07 trigger enumeration at reducer level.

### Changes Required:

#### 1. `aiStep`-move free capture decides the game

**File**: `src/lib/game-state.test.ts`

**Intent**: The mid-replay victory test uses an attack (`:711`); add the move-kind
twin.

**Contract**: a planned `aiStep` move whose destination (undefended enemy city) is
the last missing enemy-initial city sets `winner`, clears `aiPlan`, skips rollover
and movement reset, preserves `aiTurnLog` — same terminal shape as the attack path.

#### 2. Intermediate-path capture decides the game

**File**: `src/lib/game-state.test.ts`

**Intent**: Ownership flips also happen on intermediate fields (battle path
`battle.ts:253-258`; multi-field move `movement.ts:185-193`) — the deciding field
need not be the target.

**Contract**: two tests — an `attackArmy` whose win flips an intermediate enemy-
initial city that completes the condition (target field is a non-city or a
already-owned field), and a multi-field `moveArmy` where the deciding flip is a
passed-through city. Both set `winner` on the same dispatch.

#### 3. Skipped-path victory check

**File**: `src/lib/game-state.test.ts`

**Intent**: `aiStepTail` runs `withVictoryCheck` after a *dropped* action too
(`game-state.ts:280-281` → `:296`) — pin that the skip path cannot swallow a win
that a previous step created.

**Contract**: a state already one-capture-short where the remaining plan entries are
all illegal (stale army ids): each `aiStep` traces `skipped`, and the tail's check
still reflects the already-satisfied condition if one exists — or stays null when
none does; assert both directions.

### Success Criteria:

#### Automated Verification:

- `npx vitest run src/lib/game-state.test.ts` — green (characterization: expected to
  pass immediately; a red result means either fixture or code is wrong — investigate,
  do not adjust the assertion to the code without a source check)

#### Manual Verification:

- None beyond the suite (pure reducer-level tests; terminal behavior already
  manually exercised in prior phases).

---

## Phase 3: Scripted Full Cycle + Structural Soak

### Overview

The integration core of risk #6: one deterministic full cycle driven to a terminal
win, plus a multi-seed soak asserting structural integrity at every phase boundary.

### Changes Required:

#### 1. Scripted full cycle on a near-victory fixture

**File**: `src/lib/campaign-cycle.test.ts` (new)

**Intent**: The S-07 `:203` recipe — the whole turn/campaign flow as one tested
sequence.

**Contract**: fixed seed cited in the title; build a near-victory state via
`stateWith(...)` one capture short; script: player capture → `endTurn` →
`drainAiTurn`; terminal assertions: `winner` set, `aiPlan` empty, `turn` NOT
incremented past the deciding action, movement NOT reset, `aiTurnLog` preserved;
then freeze (every gameplay action returns the identical reference); then
`resetGame` → null. Where the natural AI plan cannot be forced to cooperate, the
deciding capture may be the player's pre-endTurn action — the cycle still covers
economy → planning → staged replay → rollover-or-freeze. Assert the economy
observables inside the cycle (both treasuries grew by the scripted city incomes;
build-time-1 unit placed on the map at the next turn where the fixture orders one).

#### 2. Multi-seed structural soak

**File**: `src/lib/campaign-cycle.test.ts`

**Intent**: Catch emergent cross-phase breakage the scripted fixture cannot see;
legal `winner === null`.

**Contract**: 5 seeds × ~8 turns: per turn — script a player action where legal
(move or order), `endTurn`, `drainAiTurn`; after EACH boundary (post-economy is
observable post-endTurn dispatch, post-drain) run `assertStructuralInvariants`
(moved to or imported from `ai-simulation.test.ts` — extract to `test-utils.ts` if
not exported); additionally assert per-turn: treasuries changed only via income/
spend (monotonicity not required — non-negative and both-countries-ticked is),
movement allowances re-derived at rollover (within `[0, armySpeed]`), and the
endTurn-mid-replay refusal (`inputBlocked` / reference-equality pin). Terminal:
`winner !== null ⇒ frozen + queue empty`; `winner === null ⇒ turn advanced and
queues drained (no stuck campaign — the Phase-1 regression).

### Success Criteria:

#### Automated Verification:

- `npx vitest run src/lib/campaign-cycle.test.ts` — green
- `npm test` — full suite green; runtime stays within the existing suite's budget
  (soak ≈ seconds; cite actual duration in the phase note if > 5s)

#### Manual Verification:

- `npm run dev`: one full turn played by hand matches the scripted observables
  (income added, queued unit appears next turn, AI replays staged, turn advances
  after drain).

---

## Phase 4: Cookbook & Plan Sync

### Overview

Record what the rollout taught and confirm the gates.

### Changes Required:

#### 1. Phase note + cookbook touch-up

**File**: `context/foundation/test-plan.md`

**Intent**: Append the §6.6 Phase 4 note (2-3 lines: helper extraction experience,
whether the fixture/soak split caught anything, soak duration); extend §6.3 with a
one-line scripted-cycle pattern reference (`campaign-cycle.test.ts`) if it proved a
distinct pattern; bump the header date and the §8 ledger line if §6.3 changed.

**Contract**: §6.6 has a Phase 4 bullet; §6.3 references the cycle test only if it
adds a genuinely new pattern; header `Last updated` bumped.

### Success Criteria:

#### Automated Verification:

- `npm test` + `npm run lint` + `npm run build` all green (final run)

#### Manual Verification:

- Read the §6.6 note cold: it tells a contributor what Phase 4 added and anything
  surprising, without re-reading this plan.

---

## Testing Strategy

### Unit Tests:

- `inputBlocked` contract (7 action types × 3 states + null state)
- Three victory trigger-path gaps (aiStep-move capture, intermediate battle/move
  capture, skipped-path check — both directions)

### Integration Tests:

- Scripted full cycle: fixed seed, near-victory fixture, terminal assertions,
  freeze, reset; economy observables asserted in-cycle
- Multi-seed soak: structural invariants at every phase boundary; no-winner legal;
  no stuck campaigns

### Manual Testing Steps:

1. `npm run dev` — during AI replay no input is offered; after victory only "Nowa
   gra"; mid-replay refresh resumes (Phase 1 wiring).
2. One hand-played turn matches the scripted observables (Phase 3).

## Performance Considerations

Negligible: ~10 new unit tests + one soak file (5 seeds × 8 turns ≈ seconds,
comparable to the existing ai-simulation soak). No production hot path touched.

## Migration Notes

None — no schema change, no behavior change (helper extraction is
reference-identical by design; verified by full suite + manual pass).

## References

- Research: `context/changes/testing-campaign-integrity/research.md`
- Test plan: `context/foundation/test-plan.md` §2 risk #6 + guidance row, §3 Phase 4, §6.2/§6.3
- Oracle: spec §20; PRD FR-002/003/009/010-012/013; victory-conditions plan `:19-47,64,72,119-122,203`;
  ai-opponent plan `:49-50,138,230-231`; supply-lines plan `:31,40,52`; resources-production plan `:32,59,161`
- Implementation targets: `src/lib/game-state.ts`, `src/components/game/GameScreen.tsx`,
  `src/lib/game-state.test.ts`, new `src/lib/campaign-cycle.test.ts`, `src/lib/test-utils.ts`
  (`assertStructuralInvariants` extraction if needed)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Input-Blocking Decision Helper

#### Automated

- [x] 1.1 `inputBlocked` contract tests red → implementation green (7 action types × fresh/mid-replay/finished + null) — 7e740b3
- [x] 1.2 GameScreen input guards delegate to `inputBlocked` (full suite + lint green) — 7e740b3

#### Manual

- [x] 1.3 `npm run dev`: no input during AI replay; post-victory only "Nowa gra"; mid-replay refresh resumes — 7e740b3

### Phase 2: Victory Trigger-Path Gaps

#### Automated

- [x] 2.1 `aiStep`-move free-capture victory pinned (winner set, plan cleared, no rollover/reset, log kept) — 9fbc22a
- [x] 2.2 Intermediate-path capture victory pinned (battle intermediate field + multi-field move pass-through) — 9fbc22a
- [x] 2.3 Skipped-path victory check pinned (both directions) — 9fbc22a

### Phase 3: Scripted Full Cycle + Structural Soak

#### Automated

- [x] 3.1 Scripted full cycle on near-victory fixture (terminal + freeze + reset + in-cycle economy observables)
- [x] 3.2 Multi-seed structural soak (5 seeds × ~8 turns, invariants at every boundary, no-winner legal, no stuck campaigns)

#### Manual

- [x] 3.3 `npm run dev`: one hand-played turn matches the scripted observables

### Phase 4: Cookbook & Plan Sync

#### Automated

- [ ] 4.1 `npm test` + `npm run lint` + `npm run build` all green (final run)

#### Manual

- [ ] 4.2 `test-plan.md` §6.6 Phase 4 note appended (§6.3 reference + §8 ledger if §6.3 changed)
