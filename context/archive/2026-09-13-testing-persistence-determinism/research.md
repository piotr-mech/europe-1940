---
date: 2026-09-13T16:50:19+02:00
researcher: Claude Code (10x-research)
git_commit: cb0a0e9897f7684c6365e06ebd21b7878b169857
branch: main
repository: europe-1940 (kurs)
topic: "Persistence & determinism invariants — oracle and ground truth for test-plan rollout Phase 3 (risks #4 and #5)"
tags: [research, codebase, persistence, determinism, game-state, localStorage, rng]
status: complete
last_updated: 2026-09-13
last_updated_by: Claude Code (10x-research)
---

# Research: Persistence & determinism invariants (rollout Phase 3, risks #4 + #5)

**Date**: 2026-09-13T16:50:19+02:00
**Researcher**: Claude Code (10x-research)
**Git Commit**: cb0a0e9897f7684c6365e06ebd21b7878b169857
**Branch**: main
**Repository**: europe-1940 (kurs)

## Research Question

Ground the two Phase-3 risks from `context/foundation/test-plan.md` §2 and produce the
oracle (from sources, not implementation) for the tests that will prove them:

- **#4** — save/resume breaks as the state schema evolves: a drifted save can load as a
  subtly broken game. Wanted proofs: save→load→save round-trips deep-equal; a save from
  any schema epoch either loads correctly or is cleanly discarded; a finished game is
  never resurrected; storage failure degrades to no-persistence without crashing.
- **#5** — determinism is lost: wall-clock or unseeded randomness enters the reducer
  path, breaking AI replay after resume. Wanted proofs: a repository-wide invariant that
  no wall-clock/unseeded randomness reaches the reducer path; replay from a persisted
  seed reproduces the exact action sequence.

## Summary

- **Persistence is a single localStorage slot behind a versioned envelope with no
  migration path** — by design. `SAVE_VERSION = 1`, strict-equality check, any mismatch
  ⇒ discard (`src/lib/persistence.ts:15-107`). The load-time type-guard is *deliberately
  pragmatic* (shape checks, not referential integrity, not numeric ranges, not key
  sets) — the archived save-resume impl-review F1 explicitly skipped deep validation.
  The protection against "a drifted save loads as a subtly broken game" is therefore
  **not** the guard's depth; it is (a) version discipline on schema change and (b) the
  in-change pattern "extend the guard + round-trip fixtures in the same change"
  established by the regression-floor rollout.
- **That discipline is currently informal and untested.** `SAVE_VERSION` has never been
  bumped while `GameState` changed at least four times after the envelope was
  introduced (`winner` in 7eb638a, `aiTurnLog` "skipped" kind in e283824, …) — each
  change widened the guard instead of moving the epoch. Both routes are sanctioned by
  the archive, but nothing on disk *proves* the resulting saves stay safe. This is the
  exact drift surface risk #4 names.
- **The finished-game invariant lives in UI effect ordering, not in the load path.**
  Today's writer never saves `winner !== null` (`src/components/game/GameScreen.tsx:104-111`),
  and the guard *accepts* a winner-bearing save (`src/lib/persistence.ts:224`); a
  hand-planted finished save loads frozen, then self-heals by clearing on the mount
  autosave. Untested today.
- **The engine is determinism-clean right now** — zero `Math.random` / `Date` /
  `crypto` hits in `src/lib` or `src/data`; the only sanctioned wall-clock read in the
  whole `src/` is the one-time campaign seed `Date.now()` at `startGame`
  (`GameScreen.tsx:162`). Risk #5 is *unverified*, not broken: no test proves
  replay-equality from a persisted seed, and no static rule exists to keep the engine
  clean (`test-plan.md` §4: "static determinism rule — none yet").
- **Mid-replay resume is architecturally sound**: `aiPlan` (remaining queue), `aiTurnLog`
  (executed prefix), and `rngSeed` all live in `GameState`, and autosave fires after
  every `aiStep`, so a refresh mid-AI-replay resumes from the queue. But the existing
  round-trip test only checks `aiPlan.length === 1` after reload — it does **not** prove
  that resumed replay produces the same action sequence and final state as an
  uninterrupted run.

## Detailed Findings

### A. Persisted-state shape and the save/load path (risk #4 ground truth)

- Storage: `localStorage`, single key `"europe1940:save"` (`src/lib/persistence.ts:17`).
- Envelope: `{ version: number; state: GameState }` (`persistence.ts:20-23`).
- `GameState` (`src/types.ts:175-196`): `turn`, `playerCountryId`/`aiCountryId`,
  `fieldOwners` (fieldId→CountryId), `armies[]` (id, owner, fieldId,
  units[{id,typeId}], movementPoints), `resources` per country, `productionQueues`,
  `rngSeed`, `lastBattleReportByCountry` (full `BattleReport | null` per country,
  `types.ts:130-150`), `aiPlan[]`, `aiTurnLog[]`, `winner`. Everything is
  JSON-serializable; no Date/UUID fields anywhere in state (`persistence.ts:10-11`
  comment).
- Save path: `gameReducer` → React `useEffect` autosave in the `/game` island
  (`GameScreen.tsx:104-111`) → `saveGame(state)` → `setItem(JSON.stringify(envelope))`
  (`persistence.ts:47-57`). Synchronous, no debounce; the island is
  `client:only="react"` (`src/pages/game.astro:7`) so nothing runs under SSR/workerd.
- Load path: `useReducer(gameReducer, null, loadGame)` — one synchronous read at mount
  (`GameScreen.tsx:56`); `loadGame` = getItem → JSON.parse → record check → version
  strict-equality → `isValidGameState` (`persistence.ts:60-91`).
- `localStorage` appears nowhere else in the codebase (grep: only `persistence.ts`, its
  test, and a comment in `GameScreen.tsx:52`).

### B. Version envelope and the real schema-evolution discipline

- `SAVE_VERSION = 1` with the in-code contract "Bump on any future GameState schema
  change; old saves are discarded, not migrated" (`persistence.ts:15`). No migration
  code exists — mismatch ⇒ `discardSave` + return `null` (`persistence.ts:86-89`,
  `100-107`).
- Churn evidence (the drift surface): `src/types.ts` has 13 commits since 2026-08-31;
  state-shape-relevant changes after the envelope landed in `5ad15a5` (2026-09-06):
  `winner` added (`7eb638a`, 09-04 — before the envelope, absorbed into v1),
  `aiTurnLog` "skipped" entry kind (`e283824`, 09-12 — *after*, guard widened:
  `isAiActionShaped` + skipped-entry validation). `src/lib/game-state.ts`: 14 commits
  in the same window. `SAVE_VERSION` was never bumped.
- So "version 1" already spans more than one real schema epoch, and epoch separation
  has in practice relied on widening the guard. The archive sanctions both routes:
  save-resume plan ("bump version ⇒ discard silently", `context/archive/2026-09-06-save-resume/plan.md:181`)
  and regression-floor plan (extend an existing structure + extend the guard **in the
  same change**, `context/archive/2026-09-09-testing-regression-floor/plan.md:43`).
  What is missing is a *proof obligation* — nothing fails today if a schema change
  ships without either bumping the version or extending the guard + fixtures.

### C. What the type-guard checks — and the deliberate holes

`isValidGameState` (`persistence.ts:155-227`) checks: `turn` integer ≥ 1; valid,
distinct country ids; `fieldOwners` record with valid *values*; armies with typed
shape and valid unit `typeId`s; full resource bags per known country; typed
`productionQueues`; `rngSeed: number`; loosely-shaped battle reports
(`isBattleReportShaped`, `persistence.ts:131-139`); fully-shaped `aiPlan`; `aiTurnLog`
with shaped `skipped` entries and kind-enum check for the rest; `winner: null |
CountryId`.

Concrete drifted saves that **pass** the guard today (each a candidate fixture):

- `army.fieldId: "atlantis"` — any string passes (`persistence.ts:174`); movement then
  throws a *domain* error that the UI backstop swallows (`GameScreen.tsx:327-337`) —
  the army becomes a silent ghost (selectable-looking, unmovable).
- `fieldOwners` missing keys (or `{}`) — only values are checked (`persistence.ts:166`);
  `winnerOf` reads ownership by field id (`src/lib/victory.ts:23-30`), so victory can
  silently become unreachable.
- Numeric ranges: `movementPoints: -50`, negative resources, `remainingTurns: -7`,
  `rngSeed: 1e999` (→ `Infinity`, `typeof number` passes) — all accepted (only `turn`
  has a range check).
- Army with `units: []` — passes; `dominantUnitType` throws a domain error
  (`game-state.ts:124-126`) that reducer backstops swallow.
- Duplicate army ids — pass; first-match wins in selection/targeting
  (`GameScreen.tsx:188`).
- `aiPlan` naming non-existent armies/fields — *shaped*, so accepted; at execution
  `aiStep` catches the domain error and logs `skipped` (deliberate trace, `e283824`).
  A fabricated save whose `aiPlan` targets a **player** army throws out of the reducer —
  recorded as deliberate fail-loudly behavior (regression-floor impl-review F2).
- Loose battle reports / `aiTurnLog` `move|battle|order` payloads — essentially
  unchecked (`persistence.ts:219`); popups would render undefined counts.

**Oracle note (binding):** validator looseness is *accepted*, not a defect — save-resume
impl-review F1: revisit only if saves ever come from an untrusted source. Tests for #4
must therefore NOT demand adversarial deep validation; the oracle protection is
version/epoch discipline + round-trip + the in-change guard-extension pattern.

### D. Finished-game lifecycle and resurrection

- The autosave effect clears instead of saves when `state.winner !== null`
  (`GameScreen.tsx:106-109`, "never save a state that already has a winner"); the
  winner is snapshotted by `withVictoryCheck` on every ownership-changing action
  (`game-state.ts:154-159`), so the clear lands the same render the win does.
- `resetGame` returns `null` and the effect early-returns — reset itself does not
  touch storage (`game-state.ts:166-167`, `GameScreen.tsx:105`). Safe today only
  because both reset buttons render exclusively when `gameOver` is true (save already
  cleared). Latent gap: a future mid-campaign reset would resurrect the abandoned
  campaign on refresh (save-resume impl-review F4, SKIPPED with a guard condition).
- The load path does not itself refuse finished games: the guard accepts
  `winner: CountryId` (`persistence.ts:224`). A planted finished save loads
  frozen/overlaid and self-heals via the mount autosave clear. No *playable*
  resurrection exists via the current writer — but the invariant is an emergent
  property of UI effect ordering, and nothing tests it.

### E. Storage failure handling

- Centralised `getStorage` (`persistence.ts:34-44`): `localStorage` read in try/catch;
  `null` when absent (workerd/tests) or DOMException (SecurityError); rethrows
  non-DOMException — consistent with the lessons.md no-bare-catch rule.
- `saveGame` quota/DOMException → silent no-op, game continues (`persistence.ts:51-56`);
  `loadGame` blocked → `null`, JSON SyntaxError → discard, non-SyntaxError parse errors
  rethrown (`persistence.ts:65-83`); `discardSave`/`clearGame` idempotent, removeItem
  failures ignored (`persistence.ts:94-107`).

### F. Determinism architecture (risk #5 ground truth)

- RNG: mulberry32 as a pure step `rngStep(seed) → { value, nextSeed }`
  (`src/lib/battle.ts:57-63`); three draws per battle (`battle.ts:215-217`),
  consumed only inside `resolveBattle` (`battle.ts:189`).
- Seed lifecycle: initialized once at new game (`createInitialGameState(..., rngSeed)`,
  `game-state.ts:66`; default `1` for direct test calls); the UI passes `Date.now()`
  as the `startGame` payload (`GameScreen.tsx:162`) — the single sanctioned wall-clock
  read, entering the reducer as *action data*, keeping the reducer pure
  (battle-city-capture plan `plan.md:65`, `:134`). The reducer writes the advanced seed
  back after each battle: `attackArmy` (`game-state.ts:186-195`) and `aiStep` attack
  (`game-state.ts:257-267`).
- AI planning is deterministic, no randomness (`src/lib/ai.ts` header `:1-16`;
  `aiWinProbability` is analytic, `ai.ts:56-80`); tie-breaking is field-id-then-army-id
  lexicographic (ai-opponent plan `plan.md:92`).
- Ids: starting units `${armyId}-u${i}` (`game-state.ts:77-80`); produced armies
  `${fieldId}-${turn}-${seq}` with collision counter (`src/lib/production.ts:175-190`);
  appended units deduped (`production.ts:194-203`). No timestamps/UUIDs anywhere in
  state (§A).

### G. Replay path after a mid-AI-replay refresh

- `endTurn` plans the whole AI turn into `state.aiPlan` at once
  (`game-state.ts:224-246`); each `aiStep` pops the head and keeps the tail
  (`game-state.ts:250`, `aiStepTail` `:295-314`). There is no separate action index —
  remaining queue length *is* the index; `aiTurnLog` is the executed prefix.
- The UI drives `aiStep` on a 500 ms timer, pausing at battle popups
  (`GameScreen.tsx:90-98`) — presentation only.
- Autosave fires after every state change including each `aiStep`
  (`GameScreen.tsx:104-111`, in-code comment: "even a refresh mid-AI-replay resumes
  correctly"). On mount, `aiTurnActive = state.aiPlan.length > 0` (`GameScreen.tsx:82`)
  and the driver continues the queue from the persisted `rngSeed`.

### H. Entropy/clock audit — every hit in `src/`

| Location | What | Classification |
| --- | --- | --- |
| `GameScreen.tsx:162` | `seed: Date.now()` at `startGame` | UI-only — sanctioned initial seed, enters reducer as action payload |
| `GameScreen.tsx:92` | `setTimeout` — aiStep pacing | UI-only (presentation) |
| `BattlePopup.tsx:87,94` | `setTimeout` — death-reveal staging | UI-only (presentation) |
| `balance-simulation.test.ts:93,95` | `performance.now()` — grid time budget | test/dev tooling |

Zero hits in `src/lib/` and `src/data/` (engine). No uuid/nanoid; iteration orders are
insertion-ordered (deterministic).

### I. Reducer-path boundary — what a static rule must target

- Reducer path (closed set): `src/lib/{game-state,battle,ai,movement,production,supply,victory}.ts`
  + `src/data/{map,terrain,units,countries}.ts` + `src/types.ts`. All pure functions
  over `GameState`.
- Import direction is clean: `src/lib` and `src/data` import nothing from
  `@/components`/`@/pages` (grep: zero hits). UI imports the engine one-way
  (`GameScreen.tsx:7-11`, `DetailPanel.tsx:1-5`, `BoardMap.tsx:5-7`, `BattlePopup.tsx:4`,
  `VictoryOverlay.tsx:2`).
- Blur to account for: `src/lib/` also hosts non-engine modules outside the reducer
  path — `persistence.ts`, `game-data.ts`, `utils.ts`, `config-status.ts`,
  `supabase.ts`, and test-only `balance-simulation.ts` / `test-utils.ts`. A static rule
  must therefore target the **engine module set** (allowlist or per-file overrides), not
  all of `src/lib/`.
- AST-level caveat: `no-restricted-syntax` catches call *sites* (`Date.now()`,
  `Math.random()`), not values passed in from UI — the seed's flow through `startGame`
  stays a job for tests, not lint.

### J. Existing tests — covered vs missing

Persistence (`src/lib/persistence.test.ts`, 15 tests): envelope+version round-trip for
played and two mid-replay/skipped-log states (`:92-123`); malformed skipped action,
future version, corrupt JSON, non-object, missing `rngSeed`, bad `typeId` — rejected +
removed (`:125-176`); quota setItem swallowed (`:63-76`); security-blocked getItem
(`:178-189`); storage-unavailable no-ops (`:78-84`, `:191-195`, `:214-219`);
`clearGame` idempotence (`:198-212`). Uses a `MemoryStorage` stub via `vi.stubGlobal`
(`:8-33`).

Missing (mapped to wanted proofs):

- No late-game round-trip (multi-army, full queues, populated reports/death logs).
- No finished-game proof: `winner !== null` never saved / never resurrected (both the
  guard's accepted-winner branch and the clear-vs-save effect ordering are untested).
- No drifted-save corpus from §C (orphan fieldId, empty-units army, negative values,
  `fieldOwners` holes, duplicate ids, loose reports).
- No **past**-version test (`version: 0`) — only `SAVE_VERSION + 1`.
- No test that reset-after-victory leaves storage empty (the F4 negative).
- `removeItem` throwing is untested.

Determinism: self-consistency of `drainAiTurn` (`game-state.test.ts:182-187` — same
input twice ⇒ equal outputs; idempotence, not replay-from-persist); `attackArmy`
advances `rngSeed` (`game-state.test.ts:312-340`); per-seed determinism of
`runCampaign` and byte-identical baseline report (`balance-simulation.test.ts:23-29`,
`:120-128`); soak on fixed seeds (`ai-simulation.test.ts:10`). Missing: the
replay-equality invariant (save→load→drain ≡ uninterrupted drain, same action sequence
+ deep-equal final state) and any static rule (§K).

### K. Tooling available for the static determinism rule

- ESLint flat config `eslint.config.js` — `strictTypeChecked` + `stylisticTypeChecked`
  (`:15`), `projectService: true` (`:17`); **no existing `no-restricted-syntax` /
  `no-restricted-imports`** — a clean insertion point for a scoped block
  (`files: ["src/lib/**", "src/data/**"]` + engine-set targeting per §I, candidates:
  `no-restricted-syntax` / `no-restricted-properties` / `no-restricted-globals`).
- Pre-commit (husky + lint-staged) runs `eslint --fix` on changed `*.{ts,tsx,astro}` —
  the rule becomes a pre-commit gate automatically; CI runs `npm run lint` repo-wide
  (`.github/workflows/ci.yml`), so CI enforcement needs no workflow change.
  This satisfies test-plan §5 "determinism static rule — required after §3 Phase 3".

## Oracle (from sources — PRD, archived plans; NOT from implementation)

### Binding sources

- PRD FR-014 (must-have): "Player can save and resume a game in progress"
  (`context/foundation/prd.md:99-100`); success criterion "a game in progress can be
  interrupted and continued later" (`:35`); guardrails "no unexplainable random
  situations" + "Game state survives a page refresh mid-game" (`:39-40`); NFR "Game
  state survives a page refresh or tab close mid-game" (`:107`).
- Tech-stack: game state lives with the player, Supabase unused
  (`context/foundation/tech-stack.md:24`) — browser-local persistence is by design.
- save-resume plan (canonical #4 contract): versioned envelope, discard-not-migrate
  (`plan.md:34`, `:181`); every load failure removes the entry (`:69`); `winner !== null`
  ⇒ clear, never save (`:42`); storage failures degrade to no-persistence (`:44`,
  `:66`); "a restored state reproduces all future behavior exactly" (`:10`); whole-state
  snapshot incl. mid-AI-replay (`:43`, `:15`).
- battle-city-capture plan (canonical #5 RNG purity): "the PRNG step is a pure
  function… `Date.now()` never appears in the reducer — the `startGame` action carries
  the initial seed from the UI" (`plan.md:65`); reducer stays pure (`:21`, `:61`).
- resources-production plan: deterministic, collision-checked ids
  (`plan.md:60`).
- ai-opponent plan: whole AI turn deterministic given state; "a mid-turn refresh
  resumes naturally from the queue" (`plan.md:15`, `:27`); deterministic tie-breaking
  (`:92`); input blocking while the queue is non-empty (`:50` — risk #6 territory, see
  Open Questions).
- regression-floor plan: schema extension must ride existing structures and extend the
  guard in the same change, with round-trip fixtures against the pre-change shape
  (`plan.md:43`); "old saves must load unchanged" (`plan.md:264`).
- balance-simulation plan: one integer seed per campaign, never wall clock; determinism
  is load-bearing (`plan.md:40`, `:45`).
- lessons.md: no bare `catch {}` over `src/lib` domain functions — filter with
  `isDomainError`, rethrow ReferenceError/TypeError/SyntaxError.

### Candidate oracle statements — #4 (persistence)

1. A save→load round-trip of any reducer-reachable state (including mid-AI-replay with
   non-empty `aiPlan`) deep-equals the original state.
2. An envelope version different from `SAVE_VERSION` (past or future) loads as `null`
   and the stored entry is removed — never played on.
3. A structurally invalid payload (corrupt JSON, truncation, missing required field)
   loads as `null` with the entry removed, without an error reaching the UI; developer
   errors (ReferenceError/TypeError/SyntaxError) still propagate.
4. A finished campaign is never resurrected: `winner !== null` is never saved; a load
   that somehow yields a finished game cannot be played on; reset after victory leaves
   storage empty.
5. Storage-environment failures (quota, blocked, privacy mode, absent storage) degrade
   to no-persistence without crashing.
6. The persisted snapshot covers the whole campaign (`rngSeed`, `aiPlan`, `aiTurnLog`,
   `productionQueues`, resources, ownership) — resuming reproduces all future behavior
   exactly.
7. Schema evolution follows the sanctioned discipline: either bump `SAVE_VERSION`
   (discard) or extend structure + guard + round-trip fixtures in the same change; old
   saves load unchanged otherwise.
8. Validator looseness is deliberate: the guard owes shape/truncation/version checks —
   NOT adversarial deep validation. Tests must not pin guard depth beyond the contract.

### Candidate oracle statements — #5 (determinism)

1. No wall-clock or unseeded randomness in the reducer path (engine module set, §I);
   the only sanctioned wall-clock read is the UI's one-time initial campaign seed.
2. The RNG step is pure; every consumer writes the advanced seed back — equal
   `(state, action)` ⇒ equal next state.
3. Replay from a persisted mid-replay save, under the persisted seed, reproduces the
   exact action sequence and deep-equal final state of an uninterrupted run.
4. All game-generated ids are deterministic functions of game events, collision-checked
   campaign-wide.
5. AI planning is a pure function of state with deterministic tie-breaking.
6. A static rule (lint gate) fails the build when `Math.random` / `Date.now` /
  `performance.now` / `new Date` / crypto entropy enters the engine module set.
7. Exactness caveat: assert exact reproduction, never distributional expectations
   (consecutive mulberry32 draws correlate ≈0.07 — §6.6 Phase 1 note).

## Code References

- `src/lib/persistence.ts:15-107` — envelope, version check, load/discard/clear, storage failure handling
- `src/lib/persistence.ts:131-153` — `isBattleReportShaped`, `isAiActionShaped` (loose/tight guard halves)
- `src/lib/persistence.ts:155-227` — `isValidGameState` (full guard; holes per §C)
- `src/types.ts:175-196` — `GameState` (persisted shape); `:130-150` — `BattleReport`
- `src/lib/game-state.ts:66`, `:77-80` — initial state, seeded unit ids
- `src/lib/game-state.ts:154-159`, `:162-167` — `withVictoryCheck`, `resetGame`
- `src/lib/game-state.ts:186-195`, `:224-246`, `:250`, `:257-267`, `:295-314` — seed write-back, `endTurn` planning, `aiStep`/`aiStepTail`
- `src/lib/battle.ts:57-63`, `:189`, `:215-217` — `rngStep`, `resolveBattle`, three draws per battle
- `src/lib/ai.ts:1-16`, `:56-80` — deterministic planner, analytic win probability
- `src/lib/production.ts:175-203` — deterministic army/unit ids
- `src/lib/victory.ts:23-30` — ownership-based victory read
- `src/components/game/GameScreen.tsx:56`, `:82`, `:90-98`, `:104-111`, `:162` — load initializer, replay driver, autosave/clear effect, initial seed
- `src/components/game/BattlePopup.tsx:87,94` — presentation timers
- `src/lib/persistence.test.ts` — current persistence suite (gaps in §J)
- `src/lib/game-state.test.ts:182-187`, `:312-340` — determinism self-consistency, seed advancement
- `src/lib/balance-simulation.test.ts:23-29`, `:120-128` — per-seed determinism, byte-identical report
- `eslint.config.js:15-17` — flat config, no restricted-syntax yet (insertion point)
- `src/pages/game.astro:7` — `client:only` island (no SSR persistence exposure)

## Architecture Insights

- Persistence and determinism are one system, not two risks: the seed *is* persisted
  state, and the resume contract is "a restored state reproduces all future behavior
  exactly" (save-resume plan `:10`). A replay-equality test is the single strongest
  proof spanning both #4 and #5.
- The invariant "finished games never resurrect" is emergent (writer discipline + effect
  ordering + mount-time clear), not enforced by any single checkable seam — tests must
  pin the emergent behavior, not one branch.
- Static-rule scope must be an allowlist of engine modules: `src/lib/` is not equal to
  "reducer path" (`persistence.ts` etc. live there legitimately outside it).
- The schema-evolution proof obligation is the real Phase-3 deliverable for #4: a
  fixture/builder that represents "a save from a previous epoch" (both routes: version
  mismatch ⇒ discard; guard-widening ⇒ old saves still round-trip).

## Historical Context (from prior changes)

- `context/archive/2026-09-06-save-resume/plan.md` + `reviews/impl-review.md` — canonical
  persistence contract; F1 (loose validator, deliberate), F3 (impure lazy initializer,
  StrictMode note), F4 (unguarded mid-campaign `resetGame`, latent), F5 (RESOURCE_IDS
  coupling — validator ↔ production constant).
- `context/archive/2026-09-02-battle-city-capture/plan.md` — RNG purity rule, seed-in-
  action pattern, winner-loss clamp.
- `context/archive/2026-09-01-resources-production/plan.md` — deterministic-id rule.
- `context/archive/2026-09-03-ai-opponent/plan.md` — queue-based replay, mid-turn
  refresh resume, deterministic tie-breaking, input blocking.
- `context/archive/2026-09-09-testing-regression-floor/plan.md:43,264` — in-change
  guard-extension discipline; `impl-review.md` F2 — fabricated `aiPlan` fail-loudly is
  deliberate.
- `context/archive/2026-09-13-testing-balance-simulation/` — one-seed-per-campaign
  model; determinism as load-bearing property; mulberry32 correlation note.
- `context/foundation/lessons.md` — no-bare-catch rule (applies to storage backstops).

## Related Research

- `context/archive/2026-09-09-testing-regression-floor/research.md` — §Summary #5
  (determinism audit: airtight as of 09-09), line 72 (three draws per battle), line 110
  (input blocking is UI-only — risk #6).
- `context/archive/2026-09-13-testing-balance-simulation/research.md` — §D seed model,
  Open Question #3 (draw decorrelation is a product change, out of scope).
- `context/foundation/test-plan.md` §2 risks #4/#5, §2 Risk Response Guidance rows,
  §3 Phase 3, §4 static-rule row, §5 gate.

## Open Questions

1. **Epoch discipline vs guard-widening (for `/10x-plan`):** the in-code comment says
   "bump on any schema change", practice widened the guard twice without bumping, and
   the regression-floor plan sanctions widening-with-fixtures. Which route should the
   Phase-3 tests *enforce* — likely: pin both behaviors (version mismatch ⇒ discard;
   old-shape fixture still round-trips after guard extension) rather than pick one.
2. **Silent-ghost drifted saves (§C):** an orphan `fieldId` or empty-units army loads
   and then fails *silently* via UI/reducer backstops. Documents accept guard looseness
   (F1) but do not resolve whether "loads ⇒ playable" is part of the #4 oracle or
   whether discarding is only owed at version/shape level. Flag for the plan — per the
   lesson's stop-and-ask rule this is a genuine ambiguity, not something to guess.
3. **Static-rule mechanics:** ESLint scoped block on the engine allowlist vs
   `src/lib/**` with overrides — plan decision (§I/§K give both shapes). Also whether
   `setTimeout` belongs in the rule (currently classified UI-only/presentation).
4. **Replay-equality granularity:** assert via `aiTurnLog` sequence equality + final
   state deep-equal, or additionally per-step state snapshots? Cheap at unit layer
   using `drainAiTurn` from `src/lib/test-utils.ts`.
5. **Out of scope confirmations:** input blocking during replay is risk #6 (Phase 4);
   mulberry32 decorrelation is a product change (Phase 2 deferred); `resetGame`
   mid-campaign guard only if a mid-game exit UI ever appears (F4 condition).
