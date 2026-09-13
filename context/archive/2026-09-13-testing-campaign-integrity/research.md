---
date: 2026-09-13T17:32:46+02:00
researcher: Claude Code (10x-research)
git_commit: 5ad4233ddfb9e30434c5cf5b41638f358989220e
branch: main
repository: europe-1940 (kurs)
topic: "Campaign end-to-end integrity — oracle and ground truth for test-plan rollout Phase 4 (risk #6)"
tags: [research, codebase, game-state, endTurn, victory, freeze, reset, input-blocking, supply]
status: complete
last_updated: 2026-09-13
last_updated_by: Claude Code (10x-research)
---

# Research: Campaign end-to-end integrity (rollout Phase 4, risk #6)

**Date**: 2026-09-13T17:32:46+02:00
**Researcher**: Claude Code (10x-research)
**Git Commit**: 5ad4233ddfb9e30434c5cf5b41638f358989220e
**Branch**: main
**Repository**: europe-1940 (kurs)

## Research Question

Ground risk #6 from `context/foundation/test-plan.md` §2 and produce the oracle (from
sources, not implementation) for the integration tests that will prove it:
"Turn-sequencing integrity breaks — endTurn phase order changes, player input is not
blocked during AI replay, or victory detection (anchored to initial city ownership) or
the frozen-state rule stops firing from one of its trigger paths." Risk response
guidance: a scripted full cycle; challenge "each reducer branch works in isolation, so
the sequence works" (mid-replay trap); victory counts by initial ownership; **no
brittle order assumption without a spec citation**.

## Summary

- **The risk row's phrase "income → production → supply" does not map to the code —
  and no document mandates it as a reducer order.** `endTurn` runs income → production
  tick → AI planning (`src/lib/game-state.ts:216-247`); **supply is not an endTurn
  step at all** — it is always derived from live ownership (`src/lib/supply.ts:5-10`)
  and materializes once per cycle as the `movementAllowance` reset at turn rollover
  (`game-state.ts:303-311`, `supply.ts:68-70`). The only spec-mandated order
  (europe_1940_specyfikacja.md §20: Faza 1 zasoby → Faza 2 produkcja) is, per the
  archived plan's own admission, **mechanically unobservable** between those two
  phases (`context/archive/2026-09-01-resources-production/plan.md:59`). An
  order-pinning test on income-vs-production output would be vacuous; the *observable*
  ordering couplings are treasury/slots → `planAiTurn`'s order set, and AI captures →
  the drain-time supply reset.
- **Turn rollover is deferred by design**: `endTurn` stages `aiPlan` without
  incrementing the turn; `turn + 1` and the movement/supply reset land only when the
  queue drains (`aiStepTail`, `game-state.ts:295-314`). Victory is checked after every
  ownership-changing action and, on a mid-replay win, exits *before* the rollover.
- **Input blocking is UI-only — verified still true.** `endTurn` is the single action
  the reducer guards against a non-empty `aiPlan` (`game-state.ts:217`);
  `moveArmy`/`attackArmy`/`orderUnit` have no such guard (winner-only, `:169/:181/:205`);
  `resetGame` is guarded at neither level. Every document formulates blocking as
  UI-level ("the UI must not offer…", ai-opponent plan `:50`) — the reducer gap is
  documented (`context/archive/2026-09-09-testing-regression-floor/research.md:70`),
  not an accident.
- **Victory anchor is correct and well-tested at unit level, but two trigger paths are
  unpinned at reducer level**: no test of `aiStep` kind `move` free-capture deciding
  the game, none of a deciding capture on an *intermediate* path field (battle or
  multi-field move), none of the skipped-path `aiStepTail` running `withVictoryCheck`.
- **A full-cycle integration harness already exists in pieces**: `drainAiTurn`
  (`src/lib/test-utils.ts:72-85`), state builders, `assertStructuralInvariants`
  (`ai-simulation.test.ts:15-30`), and the scripted-cycle test pattern is pre-figured
  in the victory-conditions plan (`:203`) and ai-opponent plan (`:230-231`).

## Detailed Findings

### A. The exact `endTurn` path and its mandate

`gameReducer` case `endTurn` (`game-state.ts:216-247`), entry guard `winner !== null ||
aiPlan.length > 0` (`:217`):

1. `collectIncome(state)` (`:224` → `production.ts:62-75`) — both treasuries (FR-002).
2. `advanceProduction(withIncome)` (`:225` → `production.ts:141-161`) — queue ticks,
   completed orders spawn units (`production.ts:164-191`).
3. `planAiTurn(withProduction)` (`:226` → `ai.ts:169+`) — the staged AI turn incl.
   `planAiProduction` (`ai.ts:383+`).
4a. Empty plan ⇒ immediate rollover: `turn + 1` (`:235`), every army
    `movementPoints: movementAllowance(...)` (`:236-239`).
4b. Non-empty plan ⇒ stage only (`:242-246`): no increment, no reset.

Mandate citations: in-code comment `game-state.ts:218-223` ("Spec §20 ordering: Faza 1
zasoby → Faza 2 produkcja → the AI acts… turn rolls over and movement resets only when
the queue drains"); spec §20 (`europe_1940_specyfikacja.md:618-647`); resources-
production plan `:59` + `:161`; plan-brief `:21,45`. **The PRD itself does not state a
phase order** — the mandate lives in spec + archive.

### B. Where the order is load-bearing (and where it is not)

- **income ↔ production: mechanically independent** — `advanceProduction` never reads
  `resources`, `collectIncome` never reads queues (resources-production plan `:59`).
  Order between them is spec-mandated only; **not observable** in endTurn's output.
- **(income ∪ production) → planAiTurn: load-bearing and observable.** The AI's
  production arm filters slots and affordability against the post-economy state
  (`ai.ts:427-449`) and spawns feed `garrisonPower`/threat detection (`ai.ts:174-239`).
- **AI captures → drain-time reset: load-bearing** — `movementAllowance` derives
  supply from *current* ownership; a reset before the AI's last capture would mis-cap
  the player's opening move (pinned: `game-state.test.ts:196-230`).
- **victory check → rollover: load-bearing** — `aiStepTail` checks before rolling
  (`:296-302`); after-rollover would hand the player an extra turn + income in a
  decided campaign (pinned: `game-state.test.ts:674-726`).
- **turn-at-drain → deterministic ids** — new-army ids embed `state.turn`
  (`production.ts:177`); comment `game-state.ts:219`.

### C. Input blocking — reducer vs UI (the boundary, precisely)

Reducer (`game-state.ts`): `endTurn` guarded vs non-empty `aiPlan` (`:217`); `aiStep`
guarded vs empty plan/winner/null (`:249`); `moveArmy`/`attackArmy`/`orderUnit` guard
**winner only** (`:169/:181/:205`) — a mid-replay dispatch would mutate the world under
the plan and feed the silent-skip path (`:274-281`); `resetGame` (`:166-167`) and
`startGame` (`:164-165`) unguarded by design (restart must work — victory-conditions
plan `:120`).

UI (`GameScreen.tsx`): `aiTurnActive = aiPlan.length > 0` (`:82`); `attack`/`onArmyClick`/
`onFieldClick` early-return on `aiTurnActive || gameOver` (`:182/:188/:208`); end-turn
button `disabled={aiTurnActive}` (`:269`); `ordersDisabled={aiTurnActive || gameOver}`
(`:296` → `DetailPanel.tsx:364`); replay driver pauses at battle popups (`:91`).

Verification of the prior claim: regression-floor research `:70` ("input blocking is
UI-only") is **still true** in current code; only line numbers shifted.

### D. Victory, freeze, reset — trigger-path enumeration

- `winnerOf` (`src/lib/victory.ts:23-33`): country C wins iff it controls every city
  field with `initialOwner !== C`. Anchor = static dataset (`src/data/map.ts`, type
  `types.ts:58`) — NOT a GameState field, so save/load-safe; `GameState` carries only
  current `fieldOwners` (`types.ts:180`). Tie-break: evaluation order
  `["germany","soviet"]` (`victory.ts:13`). 12 cities, 6/6 split. No neutral country.
- Ownership is mutated in exactly two domain functions, both wrapped by
  `withVictoryCheck` at every dispatch path: `applyMove` (`movement.ts:185-193`) via
  `moveArmy` (`game-state.ts:171`) and `aiStep` move (`:255` → `:296`);
  `resolveBattle` attacker-win branch (`battle.ts:251-260`) via `attackArmy` (`:191`)
  and `aiStep` attack (`:257-268` → `:296`). `orderUnit`/`endTurn` change no ownership
  and are deliberately unwrapped (victory-conditions plan `:119-121`); the skipped
  `aiStep` path also runs the tail check (`:281`).
- `withVictoryCheck` (`game-state.ts:154-159`): sets `winner`, clears `aiPlan` (this is
  what stops the UI driver — `aiTurnActive` flips false).
- Freeze: reducer early-returns on `winner !== null` for all five gameplay actions
  (`:169/:181/:205/:217/:249`); `startGame`/`resetGame` stay legal. Mid-replay win:
  return before rollover — no `turn + 1`, no movement reset, `aiTurnLog` preserved,
  remaining plan dropped (`:296-302`).
- `resetGame` returns `null` unconditionally (`:166-167`); storage was already cleared
  when the winner landed (`persistDecision` "clear", Phase 3); UI local state reset by
  the click handlers (`GameScreen.tsx:257-261`, `316-321`).
- Moving through an already-owned city does not flip it (`movement.ts:189`) — relevant
  when building near-victory fixtures.

### E. Existing tests — covered vs missing

Covered (reducer level, `game-state.test.ts`): staged plan + rollover + movement reset
(`:166-180`); determinism (`:182-187`); **endTurn ignored mid-replay** (`:189-194` — the
only reducer-level input-blocking pin); supply cap at rollover (`:196-230`); both-
country income (`:232-243`); production timing N/N+1 (`:245-284`); empty-plan rollover,
income exactly once (`:424-451`); skip paths incl. illegal-last-entry rollover
(`:453-584`); developer-error propagation (`:586-602`); mid-replay victory
(`:674-726`); freeze of all five actions (`:728-741`); resetGame → null (`:743-748`).
`victory.test.ts:26-75`: full `winnerOf` decision table. `ai-simulation.test.ts`:
5-seed soak with structural invariants. `replay.test.ts` (Phase 3): mid-replay
resume equality.

Missing (facts): no reducer test dispatching `moveArmy`/`attackArmy`/`orderUnit` with
non-empty `aiPlan` (the boundary unpinned in *both* directions); no victory-deciding
`aiStep` **move** (free capture) test; no intermediate-path deciding-capture test
(battle path `battle.ts:253-258` or multi-field move); no skipped-path victory-check
test; no component tests at all (§7 defers them); endTurn guard ordering
(`winner` vs `aiPlan`) undistinguished.

### F. Test affordances

`drainAiTurn` (`test-utils.ts:72-85`, 50-step loud cap); builders `field/units/army/
stateWithArmies/stateWith` (`:27-62`); `assertStructuralInvariants`
(`ai-simulation.test.ts:15-30` — units ≥ 1, 0 ≤ movement ≤ speed, valid owners,
non-negative treasuries); `runCampaign` (`balance-simulation.ts:90-129`) — caveat: an
AI-vs-AI role-swapping harness, never exercises player input; `plannedTurn`/
`replaySteps` patterns (`replay.test.ts:26-48`).

## Oracle (from sources — spec, archived plans; NOT from implementation)

### Binding sources

- Spec §20 (`europe_1940_specyfikacja.md:618-647`): the ONLY phase-order mandate —
  Faza 1 zasoby → Faza 2 produkcja (…→ Faza 5 zaopatrzenie → Faza 6 ruch komputera).
  Note: spec §30 (key-cities victory) is **overridden** by PRD FR-013 (Socratic round
  rejected key-cities) — never use §30 as an oracle.
- PRD: FR-002 income (`prd.md:64`), FR-003 production (`:66`), FR-009 capture
  (`:85`), FR-010/011 supply (`:87,89`), FR-012 end turn → AI acts (`:93`), FR-013
  victory = all enemy cities (`:95-96`), supply evaluated at end of turn (US-01
  acceptance, `:55`), no unexplainable situations (`:39`).
- resources-production plan: income-before-ticks for spec alignment, mechanically
  independent (`:59`, `:161`); economy for both countries (`:5`, `:94`); build-time-1
  unit on map at turn N+1 (`:32`).
- supply-lines plan: supply derived-never-stored; cap applied at the endTurn reset via
  `movementAllowance` (`:31`, `:52`, `:109`); no mid-turn re-evaluation by
  construction (`:40`).
- ai-opponent plan: endTurn = economy → stage plan; rollover/movement reset only at
  drain (`:49`, `:138`); **input blocking is a UI contract** ("the UI must not offer
  moves/attacks/orders", `:50`, `:176`); illegal actions skipped-not-fatal with
  observable trace (`:138`); scripted full-cycle test pattern (`:230-231`).
- victory-conditions plan: initial-ownership anchor (`:19`, `:64`); trigger-path
  enumeration and freeze list (`:28`, `:119-121`); `startGame` unguarded (`:120`);
  mid-replay trap — no rollover, log kept, plan cleared (`:47`); decision table
  (churn → null; own-city loss irrelevant; deterministic double-satisfaction) (`:72`);
  scripted-cycle test recipe (`:203`).
- save-resume plan: finished game never saved/written (`:42`, `:127`) — already
  pinned by Phase 3 (`persistDecision`).
- regression-floor: stuck-campaign regression — illegal *last* plan entry must still
  roll the turn over (test-plan §6.6 Phase 1); input-blocking-is-UI-only documented
  (`research.md:70`).
- lessons.md: backstops filter `isDomainError`, rethrow developer errors.

### Candidate oracle statements — #6 (each with its spec citation)

1. `endTurn` collects city income before production ticks — spec §20 Faza 1→2;
   resources-production plan `:59`. (Observable face: economy-then-planning — the AI's
   orders reflect the post-income treasury and post-tick free slots.)
2. Economy runs for both countries every `endTurn` — resources-production plan `:5,94`.
3. A build-time-1 unit ordered on turn N is on the map at the start of turn N+1 —
   plan `:32`.
4. After the turn rolls over, an unsupplied army's allowance is 1; a supplied one
   keeps full speed — PRD FR-011; supply-lines plan `:28,70`. (Supply's evaluation
   point = the rollover reset; there is no reducer "supply step" to order-assert.)
5. `endTurn` stages the AI turn; `turn + 1` and movement reset land only when the
   queue drains — ai-opponent plan `:49,138`.
6. While the AI queue is non-empty the UI offers no moves/attacks/orders/end-turn —
   ai-opponent plan `:50,176`. (Reducer-level: `endTurn` is refused mid-replay —
   same plan `:138`.)
7. Victory = controlling every city whose `initialOwner` is the other country;
   capture-and-recapture churn still ⇒ null — victory-conditions plan `:19,64,72`;
   PRD FR-013.
8. Losing all one's own cities while holding all enemy-initial cities still wins —
   plan `:72`.
9. `winner` is set immediately after every ownership-changing action (`moveArmy`,
   `attackArmy`, both `aiStep` kinds); `orderUnit`/`endTurn` are not trigger paths —
   plan `:28,119-121`.
10. A mid-replay win skips the rollover and movement reset, preserves `aiTurnLog`,
    clears `aiPlan` — plan `:47`.
11. Once `winner` is set, all five gameplay actions are no-ops; `startGame` works;
    `resetGame` returns null to setup — plan `:28,120-122`.
12. An illegal planned AI action is skipped with an observable trace, and as the
    *last* entry still forces the rollover (stuck-campaign regression) — ai-opponent
    plan `:138`; test-plan §6.6.
13. Full-cycle pattern: fixed-seed init → scripted actions → endTurn → drain →
    terminal assertions; no mocking, one integer seed per campaign, seed cited in the
    test title — victory-conditions plan `:203`; cookbook §6.2/§6.3.

## Code References

- `src/lib/game-state.ts:154-167` — `withVictoryCheck`, `startGame`, `resetGame`
- `src/lib/game-state.ts:169-247` — action guards; `endTurn` sequencing
- `src/lib/game-state.ts:248-314` — `aiStep` + `aiStepTail` (skip paths, victory-before-rollover)
- `src/lib/victory.ts:13,23-33` — evaluation order, `winnerOf`
- `src/lib/movement.ts:185-193` — ownership flip on move (own cities skipped)
- `src/lib/battle.ts:251-260` — attacker-win path flips (incl. intermediate fields)
- `src/lib/production.ts:62-75,141-191` — `collectIncome`, `advanceProduction`, deterministic ids
- `src/lib/supply.ts:5-10,33-70` — derived supply, `movementAllowance`
- `src/lib/ai.ts:169-239,383-449` — planning ladder, production arm (treasury/slot reads)
- `src/components/game/GameScreen.tsx:82-98,105-112,182-296` — replay driver, autosave, UI guards
- `src/lib/test-utils.ts:27-85` — builders, `drainAiTurn`
- `europe_1940_specyfikacja.md:618-647` — §20 phase order (the mandate)
- Tests: `game-state.test.ts:166-194,196-243,424-451,453-602,674-748`;
  `victory.test.ts:26-75`; `ai-simulation.test.ts:15-30`

## Architecture Insights

- Risk #6's three faces have different testability: phase order is only partially
  observable (income↔production is not; economy→planning and captures→reset are);
  input blocking splits into a reducer pin (`endTurn`) that already exists and a UI
  contract documents alone mandate; victory/freeze/reset is the richest reducible
  surface with concrete unpinned trigger paths.
- The strongest integration shape is the scripted full cycle (victory-conditions plan
  `:203`): one fixed seed, drive player actions + endTurn + drain, assert terminal
  state and per-phase observables — not call-order mocks.
- `aiTurnActive` is one boolean expression over state; if the UI contract needs a
  pin without component tests, the Phase-3 `persistDecision` pattern (extract pure
  decision, test it) is the established precedent.

## Historical Context (from prior changes)

- `context/archive/2026-09-01-army-movement/plan.md:95` — original endTurn (turn+1, reset), later reworked by S-03/S-06.
- `context/archive/2026-09-01-resources-production/plan.md:59,161` — order mandate + admission of mechanical independence.
- `context/archive/2026-09-03-supply-lines/plan.md:31,40,52,109` — derived supply, cap-at-reset decision (why "supply phase" is not a reducer step).
- `context/archive/2026-09-03-ai-opponent/plan.md:49-50,138,230-231` — staging, UI-level blocking contract, skip semantics, cycle-test pattern.
- `context/archive/2026-09-04-victory-conditions/plan.md:19,28,47,64,72,119-122,203` — anchor, triggers, freeze, mid-replay trap, decision table, test recipe.
- `context/archive/2026-09-06-save-resume/plan.md:42,127` — never save a winner (pinned in Phase 3).
- `context/archive/2026-09-09-testing-regression-floor/` — stuck-campaign bug fix; input-blocking-is-UI-only finding.
- `context/archive/2026-09-13-testing-balance-simulation/research.md §A/§B` — sequencing recap; no draw rule (a no-winner outcome of a full cycle is legal, not a failure).
- `context/archive/2026-09-13-testing-persistence-determinism/` — replay equality, `persistDecision` extraction precedent.

## Related Research

- `context/archive/2026-09-13-testing-persistence-determinism/research.md` — §G replay path; §I reducer-path boundary.
- `context/archive/2026-09-09-testing-regression-floor/research.md` — §Summary #5; line 70 (input blocking).
- `context/foundation/test-plan.md` §2 risk #6 + Risk Response Guidance row; §3 Phase 4; §6.2/§6.3 cookbook.

## Open Questions

1. **Input blocking — what does Phase 4 pin?** All documents mandate UI-level
   blocking; the reducer's missing `aiPlan` guard for `moveArmy`/`attackArmy`/
   `orderUnit` is documented, not accidental. Options for `/10x-plan`: (a) pin the
   reducer-level contract that IS specified (`endTurn` refused mid-replay — already
   pinned, extend to a full-cycle context), (b) extract a pure `inputBlocked(state,
   action)` decision à la `persistDecision` and pin that, (c) propose a product
   change (reducer guard) as part of this change — a scope decision the documents
   leave open. Stop-and-ask candidate.
2. **Supply "order"**: assert observables only (allowance after rollover, both sides)
   — any call-order assertion would be the exact "brittle order assumption" the risk
   row forbids. The income→production order is likewise unobservable; the observable
   face is economy→AI-planning. Confirm with the user how literally to take the
   "income → production → supply" phrasing.
3. **Trigger-path gaps**: which of the three unpinned victory paths (aiStep-move
   free capture, intermediate-path capture, skipped-path check) enter the scripted
   cycle vs stay unit-level additions to `game-state.test.ts`.
4. **No-winner full cycle is legal** (no draw rule — 62% of simulated campaigns
   stall): the scripted cycle's terminal assertions must accept `winner === null`
   or engineer a near-victory fixture per victory-conditions plan `:203`.
5. **Component tests stay out** (§7) — UI-level blocking (button disabled states,
   popup-before-overlay) remains manual, per the deferred-UI exclusion, unless the
   user reopens it.
