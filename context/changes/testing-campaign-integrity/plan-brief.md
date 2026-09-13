# Campaign End-to-End Integrity — Plan Brief

> Full plan: `context/changes/testing-campaign-integrity/plan.md`
> Research: `context/changes/testing-campaign-integrity/research.md`

## What & Why

Test-plan rollout Phase 4, risk #6: prove turn-sequencing integrity as one tested
sequence instead of isolated reducer branches. Three faces — endTurn sequencing,
player-input blocking during AI replay, and victory/freeze/reset firing from every
trigger path — become integration tests: a scripted full cycle driven to a terminal
win plus a multi-seed structural soak. One tiny production refactor (a pure
`inputBlocked` helper); no game-logic changes.

## Starting Point

Sequencing is already staged (`endTurn` = economy → AI plan; rollover at drain),
input blocking lives in scattered UI early-returns (reducer guards only `endTurn`),
and the victory anchor (`initialOwner`) is unit-tested — but three trigger paths are
unpinned, no test drives a full cycle to a terminal state, and nothing asserts
structural integrity at phase boundaries. Research established that the risk row's
"income → production → supply" is not a reducer order (supply is derived, evaluated
at the rollover reset) — observables, not call-order, are the oracle.

## Desired End State

`npm test` proves the `inputBlocked` contract (UI and production wired through one
tested function), the complete victory trigger enumeration, a deterministic
full-cycle-to-win with freeze and reset, and a soak whose structural invariants hold
at every phase boundary for any seed — with `winner === null` accepted as legal (no
draw rule exists).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Input-blocking pinning | Pure `inputBlocked(state, action)` helper + GameScreen delegation | The documented UI contract becomes unit-testable without component tests (persistDecision precedent), zero behavior change. | Plan (user) |
| Reducer guard for move/attack/order mid-replay | NOT taken — documented as an open product decision | Documents mandate UI-level blocking; a reducer guard is a product change outside a test phase. | Plan (user) |
| Victory trigger gaps | All three pinned (aiStep-move capture, intermediate-path capture, skipped-path check) | Closes the S-07 trigger enumeration completely. | Plan (user) |
| Full-cycle shape | Near-victory fixture + 5-seed structural soak | Deterministic terminal assertions + emergent cross-phase coverage; no-winner outcomes stay legal. | Plan (user) |
| Phase-order assertions | Observables only (economy→AI-planning, captures→supply reset) — never call-order | Income↔production order is mechanically unobservable; a call-order test would be the forbidden brittle assumption. | Research §B |
| Supply as a "phase" | Evaluated at the rollover reset (allowance assertions), not sequenced | Supply is derived-never-stored; no document mandates it as a reducer step. | Research §A |
| Execution modes | TDD for Phase 1 (helper absent ⇒ red); implement for 2–4 (characterization) | Red-test-first only where new code exists. | Plan |

## Scope

**In scope:** `inputBlocked` helper + UI delegation; three victory trigger-path
tests; scripted full cycle + multi-seed soak (`campaign-cycle.test.ts`);
`assertStructuralInvariants` extraction to test-utils if needed; §6.6/§6.3/§8
test-plan sync.

**Out of scope:** reducer guard change (product decision), component tests, call-
order assertions, draw rule, victory-anchor changes, CI workflow changes.

## Architecture / Approach

Phase 1 extracts the gating decision (TDD). Phase 2 pins the missing victory
trigger paths at reducer level. Phase 3 builds the integration layer: one
deterministic scripted cycle (S-07's `:203` recipe — near-victory fixture, terminal
+ freeze + reset assertions, economy observables in-cycle) and a 5-seed soak
asserting structural invariants at every phase boundary. Phase 4 records the
cookbook note.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Input-blocking helper | Tested gating contract + UI delegation | Guard rewrite drifts behavior (mitigated: mirror-exact semantics, full suite) |
| 2. Victory trigger gaps | Complete S-07 trigger enumeration | Fixture mistakes read as code bugs — investigate, never fit assertions to code |
| 3. Full cycle + soak | Terminal-path integration proof + cross-phase invariants | Soak runtime creep (bounded: 5 seeds × 8 turns ≈ seconds) |
| 4. Cookbook & sync | §6.6 note, §6.3 reference | — |

**Prerequisites:** research.md (done); no infra.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- The helper's "NOT blocked mid-replay" rows for move/attack/order deliberately pin
  the documented UI-only boundary — if the product decision is ever taken (reducer
  guard), those rows and this plan's NOT-doing entry flip together.
- The scripted cycle depends on building a genuine one-capture-short fixture; if the
  natural AI plan fights the script, the deciding capture moves to the player's
  pre-endTurn action (still covers the full sequence).
- The soak asserts structure, not balance (62% stall rate is a known, separate
  concern queued for the future balance-tuning change).

## Success Criteria (Summary)

- Every documented turn-sequencing behavior survives as a green test: staged replay,
  drain-time rollover, supply at reset, victory from every trigger path, freeze,
  reset to setup.
- Input blocking is a named, tested contract shared by UI and tests.
- Any future change that breaks the sequence fails the cycle or the soak — not the
  player's campaign.
