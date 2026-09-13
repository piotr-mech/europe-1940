<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Regression Floor for Battle & AI Hot-Spots

- **Plan**: context/changes/testing-regression-floor/plan.md
- **Scope**: Full plan review (Phases 1–5, all complete)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence base: two parallel review agents (plan-drift detection; safety/quality/pattern
compliance) over git range `801f542^..HEAD`. Per-item drift verdicts: 17 MATCH,
2 minor DRIFT (intent preserved, documented), 0 MISSING, 2 benign EXTRA. Success
criteria re-verified live: 208/208 tests in ~0.5s, `npm run lint` exit 0,
`npm run build` exit 0; all Manual Progress rows `[x]` with user confirmation.

## Findings

### F1 — Benign scope extras (strengthened tests beyond the plan letter)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/persistence.test.ts:124, src/lib/battle.test.ts:641
- **Detail**: Two additions not in the plan: a persistence test rejecting a malformed
  `skipped` action, and map-sanity guards covering the Phase 3 layouts (the plan
  required them for Phase 4 layouts only). The sweep also pins two invariants beyond
  the contract (deathLog length, 3-draw seed advance). All strengthen coverage inside
  the plan's intent and files; none are product behavior.
- **Fix**: Record as accepted additions — no code change needed (they are the
  cookbook's reference patterns now).
- **Decision**: ACCEPTED — recorded as intentional additions; no code change.

### F2 — aiLogEntry invariant throw escapes the reducer without a backstop

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/game-state.ts:331
- **Detail**: The new `throw new Error("executed attack ... left no battle report")`
  runs outside aiStep's try/catch, so a domain Error would propagate out of the
  reducer and crash the React island. Unreachable through the engine (the executor
  always writes the AI's report slot); the only path is a hand-fabricated save whose
  aiPlan names a player army — self-harm the persistence guard explicitly does not
  defend against ("pragmatic, not adversarial").
- **Fix**: Leave as a deliberate fail-loudly invariant, or route it through the same
  skip-trace path if fabrication-resilience is ever wanted.
- **Decision**: ACCEPTED — deliberate fail-loudly invariant; unreachable via the
  engine, only via self-harming save fabrication the guard explicitly ignores.

### F3 — Shared drainAiTurn has no step cap (hang instead of loud failure)

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/test-utils.ts:46
- **Detail**: For a hand-built state with `winner !== null` and a non-empty `aiPlan`
  (not constructible by the engine — withVictoryCheck always clears the plan; the
  freeze test builds one explicitly), aiStep is a no-op returning the same state, so
  the shared helper loops forever. The soak suite deliberately uses its own capped
  variant; existing call sites are safe.
- **Fix**: Move the step cap into the shared `drainAiTurn` (fail loudly at ~50 steps)
  and reuse it from the soak suite.
- **Decision**: FIXED — cap hoisted into `drainAiTurn` in `src/lib/test-utils.ts`
  (50 steps, labeled failure message); soak suite now imports the shared helper.

### F4 — Phase 5 soak does not literally "use Phase 1 fixtures"

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/ai-simulation.test.ts:14
- **Detail**: The plan's contract said the soak "uses Phase 1 fixtures"; the file
  defines its own capped drain helper and needs no army fixtures (it drives the
  reducer from `startGame`). Justified by the cap requirement (the shared helper has
  none — see F3) and by the soak's nature; the letter of the contract is unmet, the
  intent (shared, non-duplicated harness code) is partially met.
- **Fix**: Resolved together with F3 — hoisting the cap into test-utils makes the
  soak a genuine Phase 1 fixture consumer.
- **Decision**: FIXED — via F3: the soak now imports `drainAiTurn` from
  `@/lib/test-utils` (Phase 1 fixtures).

### F5 — Scenario (b) trigger differs from the plan's example

- **Severity**: 📌 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/game-state.test.ts:513
- **Detail**: The plan exemplified scenario (b) as "city lost between plan and step";
  the implementation triggers the same rule class with an intra-plan interaction
  (the plan's own first order fills Brest's last production slot). Reason: the
  planned trigger is unconstructible via a legal AI plan (the AI's own actions never
  lose it a city; the player cannot act mid-replay). Documented in the test comment
  and surfaced to the user during implementation.
- **Fix**: None needed — recorded here as the plan-vs-reality note.
- **Decision**: ACCEPTED — same rule class as the plan's example; trigger
  substitution documented in the test comment.
