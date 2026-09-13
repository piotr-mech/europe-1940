---
date: 2026-09-13T12:01:25+02:00
researcher: Claude (agent session)
git_commit: af164363559d4bf5deacd99bac5dd4e8d89ebb04
branch: main
repository: piotr-mech/europe-1940
topic: "Ground test-plan rollout Phase 2 risk #1 (game ships unbalanced) in code: simulation entry point, starting-forces shape, first-mover advantage, campaign termination, oracle feasibility"
tags: [research, codebase, ai, battle, balance, simulation, vitest]
status: complete
last_updated: 2026-09-13
last_updated_by: Claude (agent session)
---

# Research: Balance simulation harness (test-plan Phase 2, risk #1)

**Date**: 2026-09-13T12:01:25+02:00
**Researcher**: Claude (agent session)
**Git Commit**: af164363559d4bf5deacd99bac5dd4e8d89ebb04
**Branch**: main
**Repository**: piotr-mech/europe-1940

> Local paths are relative to the repo root at the commit above. Permalink
> base: `https://github.com/piotr-mech/europe-1940/blob/af164363559d4bf5deacd99bac5dd4e8d89ebb04/`.

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` ("Balance simulation harness"). Risk #1: the game ships unbalanced (trivially easy, economy snowballs) and bores the player. Risks to verify, not blindly accept:

- **Response guidance**: seeded full-campaign simulations with independent oracles — in mirrored setups neither side wins 100% of runs; even-strength battles resolve ~50/50 across the seeded distribution; campaigns end within a sane turn band. Challenge "symmetric data implies symmetric outcomes" (turn order may confer advantage). Oracle must come from the PRD (fun, 1–3h campaign), never from current implementation output.
- **What research must ground** (per the risk row): simulation entry point; shape of starting forces (draft values); whether acting first confers advantage; where campaign termination is decided.

## Summary

1. **AI-vs-AI through the reducer is safe via role swap.** Every read of `playerCountryId`/`aiCountryId` was audited: the economy (`collectIncome` credits both sides per endTurn), victory anchoring (`initialOwner` from the dataset), production planning, battle-report slots, and movement reset are all role-agnostic. A harness can alternate the two fields between turns so each side in turn becomes the AI and runs through the identical `planAiTurn`/`aiStep` code — the recommended design.
2. **Campaigns cannot stall (no freeze paths), but a no-winner stalemate is dynamically possible** — there is no draw rule, and conservative AI gates plus adequate garrisons could in principle ping-pong forever. The harness must cap turns and count "no winner by cap" as its own statistic.
3. **"Symmetric data ⇒ asymmetric outcomes" has three structural sources**: the defender-wins tie rule (`battle.ts:220`), an attack ends the attacker's movement (`battle.ts:247`), and — more powerfully — the start is NOT symmetric: Germany's initial position is front-loaded (warsaw is a German-initial city 1 move from Soviet territory, vs 3 moves for the Soviet forward army), Germany earns +6% money / +17% steel, and Germany's advertised Blitzkrieg bonus is **dead code** while the Soviet recruit discount is live.
4. **Two advertised mechanics are dead**: `bonusVsTank` is never read by the engine (antiTank strictly dominated by infantry), and the German national bonus exists only as a UI tooltip. Both are balance findings in themselves, not just harness concerns.
5. **Snowball mechanics compound multiplicatively**: annihilation battles (loser loses everything), winner keeps units, captured cities produce from the next turn (2× relative income swing per capture), and the loser's queued production is cancelled (sunk cost deleted). Expect rich-get-richer dynamics; the harness must measure campaign length and income divergence, not only win-rate.
6. **No fairness oracle exists today**: all 208 tests' winner assertions are engineered states; the idle-player soak asserts structure only. The harness is built from zero — but cheaply: ~10.8 ms per 60-turn idle campaign measured; both-sides driving costs ~2–4×, so ~100 campaigns fit the CI budget with margin.
7. **Oracle discipline constraints**: the mulberry32 consecutive-draw correlation (≈0.07 deviation near even strengths, test-plan §6.6) forbids an exact "50/50 at even strength" assertion — needs a tolerance band; and nothing anywhere defines the numeric "sane turn band" — the PRD says 1–3h campaigns but no turns-per-hour mapping exists (open question for the user).

## Detailed Findings

### A. Simulation entry point — reducer-only with role swap is sound

- The reducer is a pure state machine: `startGame` + `endTurn`/`aiStep` loop suffices (`src/lib/game-state.ts:130-137`). `endTurn` runs `collectIncome` → `advanceProduction` → `planAiTurn` and stages `aiPlan` (`game-state.ts:216-247`); each `aiStep` applies one action; `aiStepTail` (`game-state.ts:295-314`) rolls the turn over and resets movement when the queue drains.
- **Role-swap audit** (every read of the two role fields):
  - `playerCountryId` is read ONLY in `orderUnit` (`game-state.ts:207`).
  - `aiCountryId` is read in `planAiTurn` (`ai.ts:170`), the `aiStep` order case (`game-state.ts:271`), and cosmetically in `aiLogEntry` (`game-state.ts:322-330` — captured-city flag and the AI's report slot; both correct for whichever side currently holds the AI role).
  - `lastBattleReportByCountry` is keyed by country, not role; the reducer writes under `report.attackerOwner` (`game-state.ts:194`, `:266`). Slots never mix.
  - `winnerOf` anchors on `field.initialOwner` from the dataset (`victory.ts:23-33`) — role-blind, with deterministic evaluation order (`COUNTRY_ORDER`, `victory.ts:13`).
  - `planAiProduction` compares against `field.initialOwner === ai` (`ai.ts:386`) — dataset-anchored.
  - `collectIncome` credits both sides every `endTurn` (`production.ts:62-75`) — symmetric and role-agnostic.
- **Hitch**: an idle player never produces units (no auto-production for the player role). In the swap design each side gets its turn as the AI, so production flows through the identical `planAiProduction` for both — an advantage for balance measurement (same algorithm both sides).

### B. Campaign termination

- Winner decided in `winnerOf` (`victory.ts:23-33`); snapshotted by `withVictoryCheck` (`game-state.ts:154-159`) from `moveArmy` (`:171`), `attackArmy` (`:191`), and `aiStepTail` (`:296`). A mid-replay win clears `aiPlan` (stops the driver) and freezes all actions (guards at `game-state.ts:169,181,205,217,249`).
- No freeze paths: an empty plan rolls over immediately (tested: "no freeze, no income farm", `game-state.test.ts:424-451`); a skipped last action still rolls over (`aiStepTail`, tested at `game-state.test.ts:567`).
- **No draw rule exists; a perpetual no-winner state is dynamically possible** (conservative gates + adequate garrisons). The existing soak caps at `MAX_TURNS = 60` (`ai-simulation.test.ts:10`). The harness must treat "no winner by cap" as a reported statistic, not a crash.

### C. First-mover advantage — where asymmetry actually lives

- Economy timing is symmetric per `endTurn` (income for both sides at once). In the swap design both sides spend income right after collection — fully symmetric.
- The player acts first in each cycle (turn 1 starts with the player's move, AI reacts with full information). Mirror configurations (both role assignments) neutralize this for measurement.
- **Structural defender favorites**: tie holds for the defender (`battle.ts:220`, strict `>`), terrain/city defense bonuses are defender-only (`battle.ts:154-166`), and an attack ends the attacker's movement (`battle.ts:247`).
- **Start-position asymmetry (the big one)**: see F below — warsaw is a German-initial front city; G2 starts on it, 1 move from Soviet territory; the Soviet forward army is 3 moves from contact. Germany makes first flip, first threat, first free-capture attempt.

### D. Seeding & reproducibility

- Default seed `1` in `createInitialGameState` (`game-state.ts:66`); the UI passes `Date.now()` (`GameScreen.tsx:162`) — the harness must NOT use this (uncontrolled); use one integer seed per campaign.
- One battle = three draws from the seeded mulberry32 (`battle.ts:215-217`); `nextSeed` is written back into the state by the reducer (`game-state.ts:190-193`, `:262-265`); `planAiTurn` is fully deterministic. **Model: one seed per campaign, advanced per battle, carried in state** — a campaign trajectory is a pure function of (seed, role assignment); win-rate statistics are exactly reproducible.

### E. Existing harness assets

- `src/lib/ai-simulation.test.ts`: soak skeleton — startGame (5 seeds), endTurn + capped `drainAiTurn` loop, per-turn structural invariants, "every planned action executed or traced" assertion.
- `src/lib/test-utils.ts`: `drainAiTurn` with a 50-step cap, `stateWith`/`stateWithArmies`/`army` builders.
- **Missing for balance**: role-swap driver, per-country win counter, campaign-length tracking, "no winner" category, mirrored setups, optionally intermediate metrics (battle count, income divergence — `aiTurnLog` gives skips for free).

### F. Starting forces & economy (draft values)

- Initial armies are exact mirrors (`game-state.ts:32-57`): G1(berlin) = R1(moscow) = 2×infantry + tank + artillery; G2(warsaw) = R2(minsk) = 3×infantry + antiTank. Flagged "S-01 placeholders, re-tunable".
- Per-side economy from `src/data/map.ts`:

| Side | Cities | Money | Steel | Recruits | Slots | Σ defenseBonus |
|---|---|---|---|---|---|---|
| Germany | 6 | **87** | **49** | 42 | 11 | 15 |
| Soviet | 6 | 82 | 42 | **43** | 11 | 15 |

- Asymmetries: Germany +6% money, +17% steel, equal slots. **warsaw (German-initial) sits on the front**: income 15/5/8 vs the Soviet front city brest's 6/2/4 — the German forward city is 2.5× richer. Contact: G2 is 1 move from Soviet territory, R2 is 3 moves from any German-held field. Reinforcement: berlin→warsaw = 4 vs moscow→brest = 6.
- **National bonuses asymmetrically implemented** (`src/data/countries.ts:9-24`): Soviet "Rezerwy" (infantry −2 recruits) is live in `unitCostFor` (`production.ts:53-59`); German "Blitzkrieg" (+1 armored movement) is displayed in the UI (`GameScreen.tsx:42`) but **not implemented** — `armySpeed` (`movement.ts:27-36`) has no country modifier.

### G. Unit stats & battle economics

- From `src/data/units.ts`: infantry is the best defense per money (0.25 def/money, zero steel); artillery has the best raw attack per money AND its `supportBonus` stacks per unit (`battle.ts:86-94`): 8 artillery = 56 attack for 240 money vs 8 tanks = 56 attack for 400 money.
- **`bonusVsTank` is dead** — never read in `battle.ts` (only rendered in `DetailPanel.tsx:131` and echoed by the data-contract check). antiTank (def 4 @ 25+10) is strictly dominated by infantry (def 5 @ 20+0, same build time); the AI still reserves 10% of its production rotation for it (`ai.ts:35`).
- Snowball mechanics (all confirmed in code): annihilation battles (loser's army destroyed entirely; winner's losses clamped to keep ≥1, `battle.ts:222-229`); captured cities produce from the next turn (each capture swings relative income by 2× the city's output); the loser's in-progress queue is cancelled (`battle.ts:261-263`, `movement.ts:197-201`); undefended enemy cities are risk-free free captures (`movement.ts:187-196`), which the AI hunts at probability 1 (`ai.ts:336-343`).
- Defensive counterweight: moscow is both the richest city (35/15/15) and the best fortress (defenseBonus 4) — owned by the economically slightly weaker side.

### H. AI constants (all draft-flagged, `ai.ts:21` "tune after first campaigns")

`ATTACK_PROB_FREE` 0.6 (`ai.ts:24`), `ATTACK_PROB_IMPORTANT` 0.4 (`:25`), `CAPITAL_BONUS` 10 (`:27`), `SUPPLY_CUT_BONUS` 15 (`:29` — the AI values a supply cut above a capital), `DISTANCE_WEIGHT` 2 (`:31`), `GARRISON_RATIO` 1.0 (`:33`), `PRODUCTION_SHARES` 40/30/20/10 (`:35`), `PRODUCTION_ADJUSTMENT` 20 (`:36`); plus `ROLL_SPREAD` 0.2 (`battle.ts:32`).

Structural AI weaknesses a harness oracle can exploit: P1 defends against only the **single biggest** threat and moves only **one** defender (`ai.ts:188-199`) — double threats always break through; the AI never garrisons non-city terrain; the affordability filter (`ai.ts:427-429`) silently under-produces the tank band when steel-poor.

### I. Prior decisions & pending items

- Draft-value disclaimers: `units.ts:4-7`, `map.ts:12-14` ("the user-supplied balance CSV swaps in later").
- `context/foundation/roadmap.md` open question: final balance CSV arrival and column shape — owner: user, blocks nothing.
- `context/archive/2026-09-03-ai-opponent/plan.md:23,76` named all §25 constants "draft-balance"; its impl-review explicitly deferred balance verification to "future balance work" (i.e., this phase).
- Measurement approach already agreed in test-plan §2 risk #1 row (mirrored setups, independent oracle, PRD-derived) — this research grounds it.

### J. Runtime budget

- Full suite: 11 files / 208 tests / ~0.3 s. Soak: 5 campaigns × ≤60 turns ≈ **10.8 ms per campaign** (test-time basis, including per-turn invariant assertions).
- Both-sides driving costs ~2–4× the soak → ~25–50 ms/campaign locally. With a 3× CI factor and a 30 s suite budget: **~200 campaigns fit; 100 is a safe design point**.

### K. Existing fairness signals

None. All winner assertions in `victory.test.ts:26-65` and `game-state.test.ts:606-720` are hand-constructed states; the soak asserts only that the winner is a valid country. No test records who won, in how many turns, or how income evolved.

## Code References

- `src/lib/game-state.ts:130-137` — the seven reducer actions (the harness vocabulary)
- `src/lib/game-state.ts:207` — the only `playerCountryId` read (orderUnit)
- `src/lib/game-state.ts:216-247` — endTurn phase order (income → production → plan)
- `src/lib/game-state.ts:295-314` — aiStepTail: rollover + movement reset, shared by executed and skipped paths
- `src/lib/victory.ts:13,23-33` — COUNTRY_ORDER and initialOwner-anchored victory (role-blind)
- `src/lib/production.ts:53-59,62-75` — Soviet recruit discount (live); income for both sides per endTurn
- `src/lib/movement.ts:27-36` — armySpeed without any country modifier (Blitzkrieg dead)
- `src/lib/battle.ts:86-94,215-229,247,261-263` — artillery support stacking; three draws and loss clamp; attack ends movement; queue cancellation
- `src/lib/ai.ts:21-36,170,188-199,336-343,386,427-429` — draft constants; role reads; single-threat P1; free-capture hunting; affordability filter
- `src/data/map.ts:12-14` + city entries — draft balance disclaimer; per-side economy inputs
- `src/data/units.ts:4-53` — unit economics table source
- `src/data/countries.ts:9-24` — asymmetric national bonus declarations
- `src/components/game/GameScreen.tsx:42,162` — Blitzkrieg tooltip; Date.now campaign seed (harness must avoid)
- `src/lib/ai-simulation.test.ts`, `src/lib/test-utils.ts` — reusable soak skeleton and fixtures

## Architecture Insights

Three viable harness designs:

- **A. Reducer-only with role swap (recommended)**: `startGame(seed)` → loop: `endTurn` → `drainAiTurn` → swap `{playerCountryId, aiCountryId}` → repeat, until `winner !== null` or turn cap. Every subsystem verified role-agnostic (§A); both sides run the identical AI code; victory, economy, supply are untouched. Cost: one non-reducer field mutation between turns (trivial, audited) and two endTurns per full round (harmless — income/production are per-endTurn symmetric).
- **B. Reducer-only without swap, scripted "opening books" via moveArmy/attackArmy/orderUnit**: measures balance against hand-written policies, not the AI. Only sensible for specific scenario probes; `orderUnit` still requires the right role at dispatch time.
- **C. Bypass the reducer (planAiTurn + applyMove/resolveBattle/applyProductionOrder directly)**: maximum control (e.g. simultaneous planning from one snapshot) but re-implements endTurn/aiStepTail semantics — drift risk from the real game and loss of the soak's free invariants. Not recommended as the base.

Cross-cutting requirements for any design: a turn cap with a "no winner" statistic; one integer seed per campaign (never `Date.now`); mirrored role assignments; win-rate, campaign-length, and (ideally) income-divergence metrics; tolerance bands instead of exact 50/50 assertions (mulberry32 correlation, test-plan §6.6).

## Historical Context (from prior changes)

- `context/archive/2026-09-03-ai-opponent/plan.md` — draft-balance constants; "40/60/80%" claim corrected to 0.4/0.6 gates by testing-regression-floor research.
- `context/archive/2026-09-09-*` (testing-regression-floor) — soak skeleton, capped drainAiTurn, gate boundary tests, and the mulberry32 correlation finding recorded in test-plan §6.6.
- `context/foundation/roadmap.md:87,205` — balance CSV open question (owner: user).
- `context/foundation/prd.md` — oracle sources: "A single campaign lasts 1-3 hours" (NFR), "the stronger side usually wins, but not always" (US-01), "no unexplainable random situations" (guardrail).

## Related Research

- `context/archive/2026-09-09-*/research.md` (testing-regression-floor) — engine determinism audit, gate boundaries, mulberry32 correlation.
- `context/foundation/test-plan.md` §2 risk #1 row and §3 Phase 2 row — the contract this research grounds.

## Open Questions

1. **Turn band**: what numeric range counts as a "sane campaign length"? The PRD promises 1–3 hours but nothing maps hours to turns (no per-turn time data). Proposed: treat the first measured distribution as *descriptive* output of the harness (reported, not asserted), then set the band with the user once real numbers exist — explicitly NOT lifting thresholds from implementation output as an oracle, just gathering data for a user decision.
2. **Mirrored fairness criterion**: "neither side wins 100% in mirrored setups" is agreed; a numeric band (e.g. win-rate ∈ [30%, 70%]?) has no PRD source — same proposal: measure first, decide with the user.
3. **Mulberry32 decorrelation**: if the ~0.07 near-even-strength bias matters for the 50/50 oracle, decorrelating the two battle draws is a product change (invalidates pinned battle outcomes) — out of Phase 2 scope unless the user says otherwise.
4. **Dead-mechanics findings** (Blitzkrieg unimplemented, `bonusVsTank` unread, antiTank dominated): balance bugs or intentional cuts? They predate this phase; fixing them changes balance and belongs in the balance-tuning conversation, informed by the harness's measurements.
