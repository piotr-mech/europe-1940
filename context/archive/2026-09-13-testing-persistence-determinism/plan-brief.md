# Persistence & Determinism Invariants — Plan Brief

> Full plan: `context/changes/testing-persistence-determinism/plan.md`
> Research: `context/changes/testing-persistence-determinism/research.md`

## What & Why

Test-plan rollout Phase 3: prove risks #4 and #5. Save/resume must survive schema
evolution (a drifted save is cleanly discarded or loads correctly; a finished game is
never resurrected; storage failure degrades to no-persistence), and determinism must
become an enforced invariant instead of an accident (no wall-clock/unseeded randomness
in the reducer path; replay from a persisted seed reproduces the exact action
sequence). The engine is already clean and persistence already discards on version
mismatch — nothing proves either property today.

## Starting Point

A single localStorage slot behind a `{version, state}` envelope with discard-not-
migrate semantics; the finished-game invariant lives untested in UI effect ordering;
the existing suite covers early-state round-trips and a future-version rejection only.
The engine (closed module set under `src/lib` + `src/data`) has zero entropy/clock
hits, and `eslint.config.js` has no restricted-syntax rules yet.

## Desired End State

`npm test` proves epoch discipline both ways, late-game round-trips, replay equality,
and the never-save-a-winner contract (via a new pure helper); `npm run lint` fails the
moment wall-clock or unseeded randomness enters an engine module, with a
self-verification test keeping that gate honest; the cookbook (§6.4) documents the
pattern for future contributors.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Epoch-discipline enforcement | Pin both routes: version mismatch ⇒ discard AND old-shape fixture round-trips | Both evolution routes are sanctioned by the archive; pinning both closes the drift surface completely. | Plan (user) |
| Ghost saves (guard-passing drifted states failing silently in UI) | Out of scope, documented in NOT-doing | Guard looseness is deliberate (impl-review F1); demanding deep validation would unmake an accepted decision. | Plan (user) |
| Finished-game invariant pinning | Extract pure `persistDecision(state)` helper from the UI effect, test it | Makes an emergent UI-ordering property a unit-testable contract without component tests. | Plan (user) |
| Static rule scope | Explicit engine-module allowlist (12 files), not `src/lib/**` with exclusions | `src/lib` hosts non-engine modules; adding a reducer-path module should be a conscious list edit. | Research §I |
| Banned constructs | `Date.now`, `new Date`, `Math.random`, `performance.now`, crypto entropy — not `setTimeout` | Call sites the AST can catch; `setTimeout` is presentation pacing, UI-only. | Research §H/§I |
| Replay-equality granularity | Equal `aiTurnLog` + deep-equal final state at cut points, exact only | Cheapest full-fidelity proof; distributional assertions would be wrong (mulberry32 correlation). | Research §J |
| Execution modes | TDD for Phase 1 (helper) and Phase 3 (rule); implement for Phase 2 (characterization) | Red-test-first only where new code/behavior exists; Phase 2 freezes existing correct behavior. | Plan |

## Scope

**In scope:** `persistDecision` helper + GameScreen delegation; epoch/version/round-trip
tests; replay-equality test; storage-degradation gap; ESLint determinism rule +
self-verification test; cookbook §6.4 / §6.6 / §5 / §8 updates.

**Out of scope:** deep save validation (ghost saves), SAVE_VERSION bump, component
tests, input blocking (risk #6), RNG decorrelation, `resetGame` mid-campaign guard,
CI workflow changes.

## Architecture / Approach

One tiny production refactor (pure helper in `persistence.ts`, effect delegates to it),
then three test layers: unit (persistence contract + epoch fixtures), integration
(real reducer + real persistence round-trip compared run-vs-run — no precomputed
literals, immune to implementation mirroring), and static (ESLint rule over a shared
engine-module list, self-verified via the ESLint Node API). Phase 4 records the
patterns in the test-plan cookbook.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Helper & epoch discipline | `persistDecision` contract + past-version discard + old-shape fixture round-trip | Effect rewrite drifts behavior (mitigated: byte-identical semantics, full suite gate) |
| 2. Round-trip & replay equality | Late-game round-trip; resumed ≡ uninterrupted drain; `removeItem` degradation | Test accidentally mirrors implementation (mitigated: run-vs-run structural equality) |
| 3. Static determinism rule | ESLint gate on engine allowlist + self-verification test | Allowlist/rule/self-test divergence (mitigated: one shared source of truth) |
| 4. Cookbook & sync | §6.4 pattern, §6.6 note, §5 gate live | — |

**Prerequisites:** research.md (done); no infra, no env setup.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- The old-shape epoch fixture is built from today's types minus the `"skipped"` log
  kind — it represents the last real epoch, not every hypothetical future one; future
  schema changes must add their own fixture in the same change (the discipline the
  tests encode).
- The ESLint self-test programmatically loads the flat config; if the config ever moves
  or splits, the test's import breaks loudly (acceptable — it's a canary by design).
- Replay equality is proven at the unit layer via `drainAiTurn`; the UI timer pacing is
  assumed presentation-only (research §G) and stays untested (risk #6 boundary).

## Success Criteria (Summary)

- A drifted-version save never loads; an old-shape save still loads; a resumed
  mid-replay campaign is provably identical to an uninterrupted one.
- A finished campaign can never come back from storage.
- The determinism gate fails loudly on the first `Math.random()` that sneaks into the
  engine — today and in every future PR.
