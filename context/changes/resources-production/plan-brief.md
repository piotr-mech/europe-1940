# Resources and Production — Plan Brief

> Full plan: `context/changes/resources-production/plan.md`

## What & Why

Slice S-03 (PRD FR-002 + FR-003): the player collects city income each turn (money, steel, recruits) and orders unit production in owned cities — cost, build time, per-city production slots, queues completing on later turns. Production timing (1–2 turn builds) shapes the whole turn rhythm, which is why the PRD kept queues and slots in full despite their complexity.

## Starting Point

The map, cities, and unit datasets are already complete — every city has `income` and `productionSlots`, every unit type has `cost` and `buildTime` (F-01). Armies and movement work end-to-end (S-02). What's missing is entirely runtime: no treasury in `GameState`, no queue concept, `endTurn` only resets movement, and no resources UI anywhere.

## Desired End State

A fresh game starts with each country's turn-1 income in its treasury. Selecting an owned city shows unit types with costs and lets the player order them (paid upfront, no cancellation). Each "Koniec tury" collects income for both countries, ticks every queue, and drops completed units into an army standing in that city — or a new one. The player's treasury is always visible in the header.

## Key Decisions Made

| Decision                              | Choice                                                     | Why (1 sentence)                                                                                              | Source           |
| ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------- |
| Starting treasury                     | Zero + income at start of turn (turn-1 seeded in startGame) | Spec §20 phase order; no magic numbers; player can order on turn 1.                                           | Plan (questions) |
| Completed unit placement              | Into an army in the city, else a new army                  | One explainable sentence, no new state concept or UI step.                                                    | Plan (questions) |
| USSR "Rezerwy" bonus (−2 recruits inf.) | Implement now                                              | Mechanically meaningful exactly from this slice; otherwise the UI shows a bonus that doesn't work.            | Plan (questions) |
| Queue cancellation                    | None — orders are commitments                              | Board-game simplicity; zero refund edge cases.                                                                | Plan (questions) |
| AI economy                            | Income + queue ticks, no ordering                          | endTurn ready for S-06 to add ordering on top, with no rework.                                                 | Plan (questions) |
| Build timing                          | Tick on endTurn; buildTime 1 ready on turn N+1              | Matches FR-003's "1–2 turn builds" rhythm.                                                                     | Plan (questions) |
| Tests                                 | Engine-only Vitest, no component tests                     | Established S-02 split; UI verified manually.                                                                  | Plan (questions) |
| Initial armies retuning               | Keep as-is                                                 | Balancing without battles (S-04) is guesswork; revisit later.                                                  | Plan (questions) |

## Scope

**In scope:** runtime treasury + production queues (`src/types.ts`, `src/lib/production.ts`), turn-1 income seeding, economy phases in `endTurn`, `orderUnit` action, resources HUD in the header, production ordering + queue view in the city panel, "Rezerwy" cost modifier, contract-surfaces registry rows.

**Out of scope:** AI production decisions (S-06), queue cancellation, manual unit placement/garrisons, `INITIAL_ARMIES` retuning (S-04), component tests, persistence (S-08), new balance data (CSV swap unchanged).

## Architecture / Approach

Follows the S-02 shape exactly: Phase 1 adds pure engine functions in a new `src/lib/production.ts` (throw on illegal orders, immutable state) with a full rule-matrix test suite; Phase 2 wires them into `createInitialGameState` and `endTurn`; Phase 3 adds the UI (header HUD + `DetailPanel` production section behind an ownership gate, dispatch passed down). Each phase is one commit and keeps the game playable.

## Phases at a Glance

| Phase     | What it delivers                                            | Key risk                                                     |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Engine | Treasury/queue types + pure production rules + tests        | Placement rule edge cases (8-unit cap mid-batch)             |
| 2. Cycle  | Turn-1 income seed + endTurn economy for both countries     | Ordering of phases must stay spec-aligned (§20)              |
| 3. UI     | Resources HUD + ordering/queue UI in the city panel         | Disabled-state correctness (cost incl. Rezerwy, free slots)  |

**Prerequisites:** S-01, S-02 done (they are); F-01 data complete.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Draft balance values (not the user CSV) determine affordability — a full 3-slot Berlin each turn may drain the treasury slower/faster than feels right; tuning is expected later with battles in place.
- Placement picks "an army in the city" deterministically; if players want to steer reinforcements into a specific army they'll do it by positioning — acceptable for the prototype, revisit with S-04 feedback.
- Deterministic unit/army id scheme must stay collision-free across long campaigns (plan pins this in Critical Implementation Details).

## Success Criteria (Summary)

- On turn 1 the player can order a unit in an owned city and sees the exact cost deducted; the queue shows remaining turns.
- After "Koniec tury": treasury rises by city income, build timers tick, and completed units stand in the city's army on the right turn (buildTime 1 → turn N+1).
- USSR sees and pays 2 fewer recruits for infantry; enemy cities show no ordering UI.
