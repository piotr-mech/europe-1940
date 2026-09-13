# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried the game ships unbalanced and boring>" carry the same
   weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (34 commits/30d; top
dirs `src/lib/` with 70 file touches, `src/components/` with 43).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Game ships unbalanced (e.g. trivially easy — AI always loses, economy snowballs) and bores the player; the fun-test that is the product's sole purpose fails | High | High | interview Q1; PRD Success Criteria; archive ai-opponent plan ("draft constants are tunable guesses"); roadmap OQ (balance CSV still pending) |
| 2 | AI behavior regresses after threshold/priority changes — AI quietly stops attacking or defending, or an illegal planned action silently disappears so a plan/execution mismatch goes unnoticed | High | High | interview Q3; hot-spot dir `src/lib/` (70 touches/30d); archive ai-opponent plan (win-prob pinned at 3 boundary points; "illegal queued actions skipped silently" — note: its "40/60/80%" threshold claim is overstated; actual gates are 0.4/0.6 per testing-regression-floor research) |
| 3 | Battle outcomes drift after modifier changes — e.g. the loss clamp stops working and both armies die leaving a field ownerless (an "unexplainable situation" that violates a PRD guardrail) | High | Medium | interview Q3; hot-spot dir `src/lib/` (highest churn); archive battle-city-capture plan (winner-loss clamp, RNG purity) |
| 4 | Save/resume breaks as the state schema evolves — the two most-changed files are exactly where game state and its types live, and save validation is a pragmatic type-guard (catches truncation/version mismatch, not deep corruption), so a drifted save can load as a subtly broken game | High | Medium | PRD FR-014 + Guardrails; hot-spot dirs `src/lib/`, `src/types.ts` (11 touches/30d); archive save-resume plan |
| 5 | Determinism is lost — wall-clock or unseeded randomness enters the reducer path, breaking AI replay after resume and silently invalidating deterministic tests | High | Medium | archive battle-city-capture plan (seeded RNG, no wall-clock in reducer); archive resources-production plan (deterministic ids); archive save-resume plan (mid-replay resume depends on persisted seed) |
| 6 | Turn-sequencing integrity breaks — endTurn phase order changes, player input is not blocked during AI replay, or victory detection (anchored to initial city ownership) or the frozen-state rule stops firing from one of its trigger paths | High | Low | archive army-movement plan (atomic move), ai-opponent plan (input blocking), victory-conditions plan (initialOwner anchor, mid-replay trap) |

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row. Do not invent finer
gradations — the goal is ordering, not false precision.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | campaign lost or unplayable; the product's fun-test fails publicly (friends get the URL) | area changes weekly, or the archive already flags it as a guess/deferred gap |
| Medium | feature degrades, a workaround exists, only some sessions affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no state effect | stable code, rarely touched |

**Abuse / security lens.** Not applicable: the product has no auth (PRD
Access Control), no payments, and no server-side acceptance of user input
(all game logic runs client-side; storage is per-player local). The absence
of abuse rows reflects absent exposure, not an oversight. Re-run this lens
if a server-side game API or any user-content ingestion is ever added.

**Allowed Source citations** (evidence — what made this risk rise to the
top N):

- PRD line / roadmap line / archived slice plan
- Phase 2 interview question number (`interview Q1`, `interview Q3`)
- Hot-spot **directories** with churn counts (`src/lib/ — 34 commits/30d`)
- Tech-stack constraint

**Forbidden Source citations** (anchors — where the failure lives in
code): specific files or `file:line`, function or symbol names, schemas,
modules. These belong in `context/changes/<change-id>/research.md`,
produced by `/10x-research` during each rollout phase.

Risk numbers (#1, #2, …) are referenced by §3 — keep them stable across
refreshes (append new risks at the bottom; never renumber).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Seeded full-campaign AI-vs-AI simulations: in mirrored setups neither side wins 100% of runs; even-strength battles resolve ~50/50 across the seeded distribution; campaigns end within a sane turn band | "symmetric data implies symmetric outcomes" (turn order may confer advantage); oracle must come from the PRD (fun, 1–3h campaign), never from current implementation output | simulation entry point; shape of starting forces (draft values); whether acting first confers advantage; where campaign termination is decided | integration (in-process simulation) | oracle problem — thresholds lifted from current results; happy-path-only single seed |
| #2 | Golden priority scenarios stay green across refactors; determinism of the plan for a fixed seed; an illegal planned action is observable (counted/reported), never silently swallowed | "the AI took its turn, so the plan was valid" (silent skip masks plan/execution mismatch); "3 boundary points prove the win-probability formula everywhere" | priority ladder order; attack/probability thresholds; how the plan queue is executed and what happens to illegal entries | unit (extend existing suite) | implementation mirror — assertions copied from the AI's own logic |
| #3 | Per-modifier strength consistency plus: after EVERY battle resolution the field has exactly one owner (or is empty by rule), unit counts stay ≥ 0, and the seeded ±20% roll distribution stays in bounds | "a side won, so the outcome is correct" (mutual annihilation / negative units); rounding at boundaries | full modifier list and application order; rounding rules; how the seed flows into the roll | unit | snapshot-without-meaning; assertion interchangeable with the implementation |
| #4 | save→load→save round-trips deep-equal; a save from any schema epoch either loads correctly or is cleanly discarded (never plays on as a subtly broken state); a finished game is never resurrected; storage failure degrades to no-persistence without crashing | "the type-guard accepted it, so the state is sane" (it only catches truncation/version) | full persisted-state shape; version envelope; when saves are cleared; which storage calls can throw | unit + integration | round-trip happy path only |
| #5 | A repository-wide invariant that no wall-clock/unseeded randomness reaches the reducer path; replay from a persisted seed reproduces the exact action sequence | "tests pass, so the code is deterministic" (flaky green masks it); refresh mid-AI-replay is the real trigger | where the seed lives; the replay path; what the save captures mid-replay | unit + static rule (lint/grep gate) | over-mocking internal RNG instead of proving real purity |
| #6 | A scripted full cycle: endTurn applies income → production → supply in the mandated order; player input is blocked while the AI plan queue is non-empty; victory fires from every trigger path, freezes the reducer, and reset returns to setup | "each reducer branch works in isolation, so the sequence works" (mid-replay trap); victory counts by initial ownership, not current ownership | endTurn phase order; input-blocking condition; all victory trigger paths; freeze semantics | integration | brittle order assumption without a spec citation |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Regression floor for hot-spots | Freeze battle-resolution and AI-decision behavior where churn is highest, so future changes are not blind | #2, #3 | unit (characterization/golden) | complete | testing-regression-floor |
| 2 | Balance simulation harness | Prove (not assert) the game is not trivial: seeded full-campaign simulations with independent oracles | #1 | integration (in-process simulation) | complete | testing-balance-simulation |
| 3 | Persistence & determinism invariants | Save/resume survives schema evolution; determinism becomes a enforced invariant, not an accident | #4, #5 | unit + integration + static rule | complete | testing-persistence-determinism |
| 4 | Campaign end-to-end integrity | The full turn/campaign flow as one tested sequence: phase order, input blocking, victory, freeze, reset | #6 | integration | complete | testing-campaign-integrity |
| 5 | AI-native review + quality gates | Selective multimodal review of the 1–3 critical screens (map readability is the PRD's most important assumption); verify gates complete in CI | #1 (readability NFR), cross-cutting | AI-native visual review (selective), gates | not started | — |

**Status vocabulary** (fixed — parser literals):

| Value          | Meaning                                                                          |
|----------------|----------------------------------------------------------------------------------|
| `not started`  | No change folder for this rollout phase yet.                                     |
| `change opened` | `context/changes/<id>/` exists with `change.md`; research not done.            |
| `researched`   | `research.md` exists in the change folder.                                       |
| `planned`      | `plan.md` exists with a `## Progress` section.                                   |
| `implementing` | Progress section has at least one `[x]` and at least one `[ ]`.                  |
| `complete`     | Progress section is fully `[x]`.                                                  |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations below are grounded in local manifests/configs plus the
MCP/tools actually exposed in the current session.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | 4.1.11 | configured (`npm test`); 10 test files, clustered in engine/data only |
| component / DOM testing | none yet | — | deliberately deferred (interview Q4); see §7 before adding |
| API mocking | n/a | — | no server-side game API (all logic client-side per PRD) |
| e2e (browser) | Playwright (@playwright/test) | 1.63.0 | added m3l4: `npm run test:e2e`, config with `webServer` on `npm run dev`; two specs — seed (risk #4 reload persistence) + input-blocked AI replay (risk #6 rendered UI); no storageState (no auth, PRD) |
| static determinism rule | lint/grep gate | — | none yet — see §3 Phase 3 |
| (optional) AI-native | multimodal image review via host vision tooling | n/a | selective, 1–3 critical screens only — see §3 Phase 5; when NOT to use: any surface a deterministic test already covers |

**Stack grounding tools (current session):**
- Docs: none — no Context7/framework-docs MCP exposed in this session; local `package.json` + configs used instead; checked: 2026-09-09
- Search: built-in web search of the host — available but not needed for this stack (all recommendations grounded locally); checked: 2026-09-09
- Runtime/browser: Playwright CLI + @playwright/test 1.63.0 installed locally (m3l4); no browser MCP — CLI preferred for token cost; checked: 2026-09-13
- Provider/platform: linear-server MCP — read/issue tooling only, no quality-gate role in this rollout; not used; checked: 2026-09-09

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint (type-checked rules) + build | CI on `main` (wired) | required | syntactic / type drift |
| unit + integration (`npm test`) | CI on `main` (test step wired since F-01; Phase 5 verifies completeness) | required | logic regressions (#1–#6) |
| determinism static rule | local + CI | required — enforced since §3 Phase 3 (checked: 2026-09-13) | wall-clock / unseeded randomness entering the reducer path |
| simulation harness (balance band) | CI on `main` | required after §3 Phase 2 | balance drift (#1) |
| e2e (`npm run test:e2e`) | CI on `main` (wired since m3l4) | required | cross-boundary browser risks (#4 reload persistence, #6 rendered input blocking) |
| multimodal visual review (selective) | on demand / CI on PR | optional after §3 Phase 5 | readability/visual issues deterministic tests cannot see |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test (engine rules)

- **Location**: `src/lib/` (or `src/data/`), next to the module under test.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/battle.test.ts`.
- **Run locally**: `npm test`.

### 6.2 Adding a characterization/golden test (battle & AI)

- **Location**: `src/lib/`, colocated with the module under test (the engine is pure — no mounting, no DOM).
- **Naming**: `<module>.test.ts`; a multi-module simulation gets its own `ai-simulation.test.ts`.
- **Reference tests**:
  - Battle invariant sweep (matchup matrix × seed range, property assertions only): the `resolveBattle invariant sweep` describe in `src/lib/battle.test.ts`.
  - AI gate boundary scenarios (hand-derived closed-form probabilities bracketing the 0.4/0.6 gates): the `attack-gate boundaries` describe in `src/lib/ai.test.ts`.
  - Dropped-action trace / executor semantics: the `aiStep` tests in `src/lib/game-state.test.ts`.
  - Multi-turn structural soak: `src/lib/ai-simulation.test.ts`.
  - Shared fixtures (armies, states, drain helpers): `src/lib/test-utils.ts` — import, never re-copy.
- **Mocking policy**: none — the engine is deterministic (all randomness flows through `rngSeed`); cite the seed (or seed range) in the test title and derive expected values from the rules spec or hand-computed arithmetic, never from re-running the implementation.
- **Run locally**: `npm test`.

### 6.3 Adding a simulation/integration test (balance, full cycle)

- **Location**: harness in `src/lib/balance-simulation.ts` (colocated module), tests in `src/lib/balance-simulation.test.ts`.
- **Naming**: `<domain>-simulation.test.ts` for campaign-level suites; keep instrument self-tests (determinism, termination, metric sanity) in the same file, ahead of any measurement tests.
- **Reference test**: the `baseline grid (mirrored 100-campaign measurement)` describe in `src/lib/balance-simulation.test.ts`.
- **Mocking policy**: none — drive the real reducer (`endTurn` → capped `drainAiTurn` from `@/lib/test-utils` → role swap between turns). One integer seed per campaign (never wall clock); mirrored = the same seed under both role assignments.
- **Report artifacts**: render deterministic markdown (no timestamps), commit it under the change folder, and assert byte-identity in the ordinary test run; regenerate with `BALANCE_WRITE=1 npx vitest run src/lib/balance-simulation.test.ts`.
- **Scripted full cycles (turn/campaign sequencing)**: two-layer pattern in `src/lib/campaign-cycle.test.ts` — (a) a near-victory fixture drives one deterministic cycle to terminal assertions (winner, freeze by reference-equality, reset), (b) a 5-seed acting-player soak runs `assertStructuralInvariants` (from `@/lib/test-utils`) at every phase boundary with `winner === null` legal. Economy expectations are dataset-derived (city incomes, unit costs) — never call-order; UI-level contracts are pinned via pure helpers (`inputBlocked`), not component tests.
- **When NOT to use**: any behavior a unit test already covers cheaper — single battle mechanics, reducer case semantics, planner priorities (§6.2's characterization layer). Simulation is for emergent, campaign-level properties only.
- **Run locally**: `npm test` (the grid rides the suite; ~100 campaigns ≈ seconds).

### 6.4 Adding a persistence / determinism invariant test

- **Location**: `src/lib/` — persistence suites in `persistence.test.ts`; replay-level proofs in `replay.test.ts`; the static rule's self-verification in `determinism-rule.test.ts`.
- **Reference tests**:
  - Persist decision contract + epoch discipline (past/future version discard, old-schema-shape fixture round-trip, late-game save→load→save byte-identity): `src/lib/persistence.test.ts` (the `persistDecision` describe + the version/epoch/round-trip cases).
  - Replay equality (resumed ≡ uninterrupted): `src/lib/replay.test.ts` — equal `aiTurnLog` and deep-equal final state incl. `rngSeed`, at cut points mid-AI-replay.
  - Static rule self-verification: `src/lib/determinism-rule.test.ts` — lints `DETERMINISM_ENGINE_FILES` (exported from `eslint.config.js`; the rule's scope and the test's scope are one constant, so they cannot diverge).
- **Mocking policy**: storage only — `MemoryStorage` from `@/lib/test-utils` via `vi.stubGlobal("localStorage", …)`. The reducer and RNG are never mocked; expectations are run-vs-run comparisons (two real runs compared), never precomputed literals.
- **Schema-evolution rule**: any `GameState` change ships in the same commit with either a `SAVE_VERSION` bump (old saves discard cleanly) or a guard extension + an old-shape epoch fixture round-trip in `persistence.test.ts`. Both routes are sanctioned; neither may ship untested.
- **Engine allowlist**: adding a module to the reducer path means adding it to `DETERMINISM_ENGINE_FILES` in `eslint.config.js` — `src/lib/` is NOT the reducer path (persistence, utils, harnesses live there too). The self-test fails if scope and reality diverge.
- **When NOT to use**: deep/adversarial save validation — guard looseness is deliberate (save-resume review F1); component-level effect testing — extract a pure helper instead (the `persistDecision` pattern).
- **Run locally**: `npm test`; the rule's canary is `npm run lint` with a deliberate violation in an engine file (verified once in Phase 3, then reverted).

### 6.5 Adding an AI-native visual review (critical screens)

- TBD — see §3 Phase 5.

### 6.6 Adding an E2E (browser) test

- **Location**: `e2e/`, one test per file, file name = fs-friendly scenario name.
- **Seed**: `e2e/seed.spec.ts` is the exemplar every generated E2E test is modeled on — role-based selectors (`getByRole`/`getByText`), per-test independence (own setup/action/assertion/cleanup), wait-for-state (never `waitForTimeout`), test name tied to a §2 risk. Generate via `/10x-e2e` (`.agents/skills/10x-e2e/`), not from scratch.
- **Eligibility**: only risks that cross system boundaries or exist solely in the rendered UI (see the `/10x-e2e` gate table). Everything else stays at the cheaper layer.
- **Boundaries**: all real — the game has no external APIs to mock. Persistence is `localStorage` (`europe1940:save`); cleanup is `localStorage.removeItem` in-test (Playwright's fresh context per test is the unique-id equivalent — no user-named entities exist).
- **Break-verify before committing**: deliberately weaken the protected production behavior, confirm the spec goes red, revert, confirm green. Never commit the break.
- **Run locally**: `npm run test:e2e` (starts `npm run dev` itself via `webServer`).

### 6.7 Per-rollout-phase notes

(Optional. After each phase lands, /10x-implement appends a 2–3 line note
here capturing anything surprising the rollout phase taught.)

- **Phase 1 (testing-regression-floor)**: writing the floor found and fixed a real bug — an illegal planned action as the *last* AI plan entry never rolled the turn over (stuck campaign). Also two unconstructibles to remember: exact 0.4/0.6 gate probabilities are irrational in k = D/A (bracket them instead), and consecutive chained mulberry32 draws correlate (≈0.07 analytic-vs-empirical deviation near even strengths) — the coupling test excludes that band until draws are decorrelated.
- **Phase 2 (testing-balance-simulation)**: the first measured baseline says the game is NOT balanced — the USSR wins 100% of decided campaigns (38/38 across 100 mirrored campaigns) and 62% of campaigns stall at the turn cap; Germany's economic head start inverts into a 0.27 income ratio. Bands were deliberately left unpinned (descriptive-first; thresholds from this report would be an implementation-mirror oracle). Research also surfaced dead mechanics — the advertised German "Blitzkrieg" is unimplemented and `bonusVsTank` is never read — queued for the future balance-tuning change.
- **Phase 3 (testing-persistence-determinism)**: the rollout opened on a pre-existing red — the balance baseline's path had moved with its change folder into `context/archive/`, and the byte-identity test followed it (archive moves must update `BASELINE_REPORT_PATH`). The finished-game invariant moved out of UI effect ordering into a tested pure helper (`persistDecision`). The determinism gate is an explicit 12-file engine allowlist — `src/lib/` is not the reducer path, so scope is a maintained list, not a directory glob.
- **Phase 4 (testing-campaign-integrity)**: risk #6's "income → production → supply" turned out NOT to be a reducer order — supply is derived and evaluates at the drain-time movement reset; the oracle is observable (dataset-derived incomes, allowance equality), never call-order. Input blocking became the third pure-contract extraction (`inputBlocked`, after `persistDecision`) — the helper encodes the DOCUMENTED UI contract (player actions not offered mid-replay), which is stricter than the reducer's own guards; that gap stays a documented open product decision. The scripted-cycle + soak split worked well: terminal assertions on a near-victory fixture, emergent coverage on 5 acting-player seeds.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q4/Q5). Future
contributors should respect these unless the underlying assumption changes.

- **No user-requested exclusions** — the owner explicitly wants broad coverage
  (interview Q5: "test everything"). The plan still sequences by cost × signal;
  breadth is delivered by the phased rollout, not by testing everything at once.
- **Broad component/snapshot UI tests** — deprioritized under cost × signal:
  the owner trusts manual verification for UI (interview Q4: no gap feared),
  and map readability gets a selective AI-native review in §3 Phase 5 instead.
  Re-evaluate if UI regressions start reaching players. (Source: interview Q4/Q5.)
- **Scaffold auth code** (`src/middleware.ts`, `src/pages/auth/`) — removable
  reference code per AGENTS.md; spending test budget there is waste.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13 (§5 gate live: determinism static rule; §6.3 scripted-cycle pattern added; m3l4: e2e layer added to §4 stack and §5 gates)
- Stack versions last verified: 2026-09-13 (Playwright 1.63.0 added, m3l4); prior entries 2026-09-09
- AI-native tool references last verified: 2026-09-09

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
