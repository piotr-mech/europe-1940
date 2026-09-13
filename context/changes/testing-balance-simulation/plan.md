# Balance Simulation Harness — Implementation Plan

## Overview

Build the balance simulation harness for test-plan rollout Phase 2 (`context/foundation/test-plan.md` §3 row 2), covering risk #1 (the game ships unbalanced — trivially easy, economy snowballs — and bores the player). The harness runs seeded full-campaign AI-vs-AI simulations through the real reducer with alternating role assignment, collects a full metric set, and emits a deterministic descriptive report. Per the planning decision, this change is **descriptive-first**: numeric fairness bands are NOT pinned here — the measured distribution becomes the basis for a user-owned decision (and a follow-up change) to pin bands later.

## Current State Analysis

- The engine is a pure state machine; a campaign trajectory is a function of (seed, role assignment) only (`src/lib/game-state.ts:216-314`, research §A, §D). All randomness flows through `state.rngSeed`; `planAiTurn` is deterministic.
- Role swap between turns is safe: every read of `playerCountryId`/`aiCountryId` was audited — economy, victory anchoring (`initialOwner`), production planning, and report slots are role-agnostic (research §A).
- Campaigns cannot freeze (empty plan and skipped-last-action both roll over — `game-state.test.ts:424-451`, `:567`), but a no-winner stalemate is dynamically possible (no draw rule) — the harness must cap turns and count the category.
- Existing assets: soak skeleton (`src/lib/ai-simulation.test.ts`), capped `drainAiTurn` and builders (`src/lib/test-utils.ts`). Runtime basis: ~10.8 ms per 60-turn idle campaign; both-sides driving ≈ 2–4× → ~100 campaigns fit the CI budget with margin (research §J).
- No fairness signal exists today: all winner assertions in the suite are engineered states (research §K).
- Known balance distortions exist (dead Blitzkrieg, dead `bonusVsTank`, front-loaded German start) — deliberately measured as-is (see What We're NOT Doing).

## Desired End State

A committed, deterministic baseline of measured balance: anyone can run `npm test` and get the same campaign-level distribution (win-rate per country, campaign length, no-winner rate, battle upset frequency, income-divergence curve) from ~100 mirrored AI-vs-AI campaigns in a few seconds. The test-plan cookbook §6.3 tells future contributors how to add simulation tests. The measured report is the agreed input for a future balance-tuning change (where numeric bands get pinned and the dead mechanics get decided).

Verification: `npm test` green with the new harness included; total suite stays ≤ ~30 s; the baseline report in the change folder regenerates bit-identically from the pinned seeds; lint green.

### Key Discoveries:

- Role-swap audit clean — reducer-only AI-vs-AI is the recommended harness design (research §A, Architecture Insights option A)
- One integer seed per campaign, never `Date.now()` (`GameScreen.tsx:162` is UI-only; harness avoids it)
- Mulberry32 consecutive-draw correlation (≈0.07 near even strengths, test-plan §6.6) — any future 50/50 oracle needs a tolerance band; descriptive-first sidesteps it for now
- Snowball mechanics compound per capture (annihilation + next-turn income + queue cancellation — research §G); income divergence is the metric that sees it
- The soak's per-turn invariant assertions cost time the balance grid doesn't need — the runner collects metrics instead

## What We're NOT Doing

- **No numeric fairness bands pinned** — descriptive-first decision; bands come in a follow-up change once the user has seen real numbers (explicitly avoiding the "thresholds lifted from current results" anti-pattern).
- **No product/balance changes** — dead mechanics (Blitzkrieg unimplemented in `armySpeed`, `bonusVsTank` never read, antiTank dominated), draft constants, and map asymmetries are measured AS IS and recorded as findings; tuning is a separate future change.
- **No mulberry32 decorrelation** — would change every battle outcome and invalidate pinned Phase-1 tests.
- **No CI pipeline changes** — the harness rides the existing `npm test` step (the §5 "simulation harness" gate is satisfied by its presence in the suite; the "balance band" half of that gate activates when bands are pinned).
- **No UI/e2e testing** — in-process integration only (cheapest layer that sees emergent balance).

## Implementation Approach

Three phases ordered by dependency: the runner module first (infrastructure everything else imports), then the measured grid + descriptive report, closing with the cookbook update mandated by the test-plan orchestrator. Determinism is the load-bearing property throughout: the same seed set must reproduce the same report bit-for-bit, so the baseline is reviewable and diffable.

## Critical Implementation Details

- **State sequencing — the role swap**: the swap `{ ...state, playerCountryId: X, aiCountryId: Y }` happens BETWEEN turns, after `drainAiTurn` returns and before the next `endTurn` — never mid-plan (research §A audited every role read; the swap itself is not a reducer action). One full round = two `endTurn`s (one per side); income/production are per-`endTurn` symmetric for both sides, so the extra cycle is measurement-neutral.
- **Seed discipline**: `startGame` carries one integer seed per campaign (`seed = campaign index`); the harness must never source seeds from wall clock. Mirrored setups = the same seed run under both role assignments.
- **Runtime budget**: drop the soak's per-turn structural assertions inside the balance runner (metrics collection only); target ≤ ~5 s for the full grid locally so CI's 30 s budget holds with margin even at a 3× slowdown.

## Phase 1: Campaign Runner Infrastructure (Setup)

### Overview

The reusable simulation engine: a role-swap campaign driver with a turn cap and a metrics collector, as a colocated module (the `test-utils.ts` precedent) that the future balance-tuning change can import too. No distributional assertions yet — this phase proves the runner itself is deterministic, terminating, and metrically sound.

### Changes Required:

#### 1. Runner module

**File**: `src/lib/balance-simulation.ts` (new)

**Intent**: Single home for the AI-vs-AI campaign driver so the balance test, future tuning changes, and ad-hoc runs share one implementation instead of re-deriving the role-swap loop.

**Contract**: exports a campaign runner — input `{ seed, playerCountryId, maxTurns }`, output a campaign record: `{ winner: CountryId | null, endTurn: number, battles: number, upsets: number, incomeByTurn: { germany: number[]; soviet: number[] } }` (income as per-turn total income per country; upset = a battle where the weaker pre-roll side won, both strengths from the report). The driver loops `endTurn` → `drainAiTurn` → role swap → repeat until `winner !== null` or the turn cap; it reuses `drainAiTurn` from `@/lib/test-utils` and never touches wall-clock randomness. Pure: same input ⇒ same record.

#### 2. Runner self-tests

**File**: `src/lib/balance-simulation.test.ts` (new)

**Intent**: Pin the runner's own contract before any balance claims rest on it.

**Contract**: (a) determinism — the same seed twice yields deep-equal records, across both role assignments; (b) termination — every record has `winner !== null || endTurn === maxTurns` and the run never hangs (the capped `drainAiTurn` fails loudly otherwise); (c) the mid-replay victory path exits cleanly with the winner recorded; (d) metric sanity — `battles ≥ 0`, `0 ≤ upsets ≤ battles`, income arrays have `endTurn` entries each. Seeds cited in test titles per convention.

### Success Criteria:

#### Automated Verification:

- Runner self-tests green: `npm test`
- Lint passes: `npm run lint`

#### Manual Verification:

- Spot-check one campaign record by eye: the turn count, winner, and one income entry look plausible against a hand-driven `npm run dev` session

---

## Phase 2: Mirrored Baseline Grid + Descriptive Report

### Overview

Run the measured grid and freeze it as the baseline artifact: ~100 campaigns (e.g. seeds 0–49 × both role assignments), full metric set, rendered into a committed report the user reviews to make the pin-bands decision later.

### Changes Required:

#### 1. Grid test

**File**: `src/lib/balance-simulation.test.ts` (extend)

**Intent**: One fast test that runs the pinned seed set through the runner, asserts the grid's own integrity, and fails if the runtime budget or determinism breaks.

**Contract**: runs seeds 0–49 × {germany-player, soviet-player}; asserts (a) all 100 records classify (winner or no-winner-by-cap), (b) the aggregate is deterministic (summary object deep-equals a re-run of a sampled subset — full re-run if runtime allows), (c) wall time stays within the budget (wrap the grid in a timing check with a generous ceiling, e.g. ≤ 10 s local). Emits the aggregate via `console.info` on failure for debugging only — the committed report is the canonical artifact.

#### 2. Report generator + baseline artifact

**File**: `src/lib/balance-simulation.ts` (extend: summary/report rendering), `context/changes/testing-balance-simulation/baseline-report.md` (new artifact)

**Intent**: The descriptive deliverable: a deterministic markdown report of the measured distribution, committed for review.

**Contract**: report renders per-role-assignment and combined tables: win-rate per country (decided vs no-winner split), campaign-length distribution (min/median/max), upset frequency, and the income-divergence curve (per-turn mean income ratio); plus the dead-mechanics and map-asymmetry findings as measurement caveats. Generated by a small script or test-run output captured to the file; regenerating with the same seeds reproduces it byte-for-byte. The exact generation mechanism (a `vitest` run writing the file, or a tiny npm script) is the implementer's call — keep it reproducible with one command documented in the report header.

### Success Criteria:

#### Automated Verification:

- Grid test green within the time budget: `npm test` (total suite ≤ ~30 s)
- Report regeneration is byte-identical: regenerate and `git diff --stat` shows no change
- Lint green: `npm run lint`

#### Manual Verification:

- Review the baseline report: are the distributions plausible? Record observations (win-rate skew, stalemate rate, snowball curve shape) — these feed the future pin-bands decision and the §6.6 note
- Confirm nothing in the report contradicts a quick human playthrough intuition

---

## Phase 3: Cookbook Close-Out

### Overview

Mandatory close-out per the test-plan orchestrator: fill the simulation cookbook entry and append the phase note, so later contributors copy the pattern instead of re-inventing the harness.

### Changes Required:

#### 1. Cookbook update (mandatory close-out)

**File**: `context/foundation/test-plan.md`

**Intent**: Fill §6.3 (simulation/integration pattern) and append the §6.6 phase note, per the test plan's contract that each rollout phase ships its cookbook entry.

**Contract**: §6.3 gets location (`src/lib/balance-simulation.ts` + colocated test), naming, reference test (the grid test), mocking policy (none — real reducer, one integer seed per campaign, role-swap driver), the report-regeneration command, and a "When NOT to use" line (any behavior a unit test already covers cheaper — e.g. single battle mechanics); §6.6 gets a 2–3 line note: the measured baseline headline numbers, the descriptive-first decision (bands deliberately unpinned), and the dead-mechanics findings pointing at the future tuning change.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.3 no longer reads "TBD": grep check
- Full suite + lint green: `npm test`, `npm run lint`

#### Manual Verification:

- Review the cookbook entry against what actually shipped (reference test names, commands)

## Testing Strategy

### Unit Tests:

- Runner self-tests (Phase 1): determinism, termination, metric sanity — the runner is the trusted instrument.

### Integration Tests:

- The mirrored grid (Phase 2) is the deliverable: real reducer + real AI + real battle code composed over whole campaigns, asserted structurally (classification, determinism, budget) and reported descriptively (distribution).

### Manual Testing Steps:

1. Phase 1: eyeball one campaign record against a live `npm run dev` session
2. Phase 2: review the baseline report and note observations for the future pin-bands decision
3. Phase 3: verify the cookbook entry matches the shipped artifacts

## Performance Considerations

Basis: ~10.8 ms per 60-turn idle campaign measured (research §J); both-sides driving ≈ 2–4×. Target ≤ ~5 s for 100 campaigns locally; the grid test carries a generous timing ceiling (≤ 10 s) so CI slowdowns don't flake it. If the budget bursts: reduce seeds before reducing max turns (campaigns that end early cost proportionally less; the turn cap is the stalemate guard and must stay).

## Migration Notes

No data migration; no product state changes. The baseline report is a new committed artifact under the change folder; it moves to `context/archive/` with the change when archived — the canonical copy for future tuning work is whatever the regeneration command produces from the pinned seeds.

## References

- Research: `context/changes/testing-balance-simulation/research.md` (role-swap audit, termination, seeding, economy tables, red flags, runtime basis)
- Test plan: `context/foundation/test-plan.md` §2 risk #1 row, §3 Phase 2, §6.3 (to fill), §6.6
- Reusable assets: `src/lib/test-utils.ts` (`drainAiTurn`, builders), `src/lib/ai-simulation.test.ts` (soak precedent)
- PRD oracle sources: `context/foundation/prd.md` (1–3h campaign NFR; US-01 "stronger side usually wins, but not always")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Campaign Runner Infrastructure (Setup)

#### Automated

- [x] 1.1 Runner self-tests green: determinism (both role assignments), termination, mid-replay victory exit, metric sanity (`npm test`)
- [x] 1.2 Lint green (`npm run lint`)

#### Manual

- [x] 1.3 Spot-check one campaign record against a live `npm run dev` session

### Phase 2: Mirrored Baseline Grid + Descriptive Report

#### Automated

- [ ] 2.1 Grid test green: 100 campaigns classified, aggregate deterministic, within time budget; total suite ≤ ~30s (`npm test`)
- [ ] 2.2 Baseline report committed and byte-identical on regeneration
- [ ] 2.3 Lint green (`npm run lint`)

#### Manual

- [ ] 2.4 Review baseline report; record distribution observations for the future pin-bands decision

### Phase 3: Cookbook Close-Out

#### Automated

- [ ] 3.1 test-plan.md §6.3 filled (no "TBD"); §6.6 note appended
- [ ] 3.2 Full suite + lint green (`npm test`, `npm run lint`)

#### Manual

- [ ] 3.3 Review cookbook entry accuracy against shipped artifacts
