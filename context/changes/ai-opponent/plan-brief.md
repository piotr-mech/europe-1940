# Rule-Based AI Opponent — Plan Brief

> Full plan: `context/changes/ai-opponent/plan.md`

## What & Why

Implements S-06 (FR-012): ending the turn makes the rule-based AI act — six spec priorities in strict order, targets scored by the §25 value formula, attacks gated by analytic win probability (40/60/80% thresholds), production in 40/30/20/10 proportions with situational adjustments. This turns the single-turn loop into a real campaign and finally exercises S-05's supply rules in live play.

## Starting Point

Every primitive the AI needs exists as a pure, tested function (movement, battles with reports, supply, production); `endTurn` already runs both economies. The gaps are decision logic (nothing scores or chooses actions today) and presentation: one battle-report slot and a popup that assumes the player attacks; nothing visualizes the AI's turn.

## Desired End State

The player clicks "Koniec tury" and watches the AI's turn as a visible sequence — each action appears on the map with a short pause, AI battles open the same staged popup, and the panel summarizes the turn. The AI defends threatened cities, rescues cut-off armies, attacks by odds thresholds, cuts supply, groups before strong targets, and produces proportionally — deterministically, so identical situations play out identically (NFR: no unexplainable situations).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Architecture | Pure planning module `ai.ts` (`planAiTurn(state) → actions`), applied by the reducer | Testable like the rest of the engine; reducer stays thin. | Plan |
| Determinism | Fully deterministic decisions (state only; randomness stays in battles) | NFR "predictable, logical"; replayable tests; S-08 saves resume cleanly. | Plan |
| MVP scope | All 6 priorities, each in its simplest faithful form; grouping = step toward target | FR-012 complete in one change without gold-plating each rule. | Plan |
| Odds estimation | Analytic P(win) from the ±20% roll distribution vs §27 thresholds | Thresholds get real probabilistic meaning; exact and cheap. | Plan |
| Priority mechanics | Strict ladder 1→6 (best action per priority before descending) | Reads like the spec, debuggable and testable per priority. | Plan |
| Target value | Σ income + 10 capital + 15 supply-cut − 2×distance − defender strength (draft constants) | Every term explainable from existing data. | Plan |
| Turn presentation | Staged execution: `endTurn` plans into a queue; `aiStep` applies one action per timed dispatch | The map genuinely steps (no fake animation over a final state), reducer stays pure, refresh-safe. | Plan |
| AI battles in UI | Same popup, battle reports split per side (player's slot never clobbered) | Symmetry and explainability for the game's most visible moments. | Plan |
| AI memory | Stateless — plan from the live map every turn | Simplest thing that satisfies the spec; S-08 persists only game state. | Plan |
| AI production | 40/30/20/10 + losing-cities→infantry, advantage→tanks (oil rule cut from MVP) | Faithful to §29 within MVP resources. | Plan |

## Scope

**In scope:** `src/lib/ai.ts` (win probability, target scoring, priority ladder, production planning), staged `aiStep` execution in the reducer, per-side battle report slots, replay UI (timed steps, popup queue, turn summary), contract-surfaces update.

**Out of scope:** difficulty levels/personalities, AI decision randomness, single-turn coordinated offensives, full pathfinding (greedy one-step moves), oil-based production, AI memory, fog of war.

## Architecture / Approach

Three phases, engine-first: (1) the whole decision engine headless with golden scenario tests per priority; (2) staged turn integration — `endTurn` plans into `GameState.aiPlan`, `aiStep` pops one action through the existing engine functions, reports split per side; (3) the visible replay — timed `aiStep` dispatches, AI battle popups that pause the replay, and a turn summary in the panel.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. AI decision engine (headless) | `ai.ts`: scoring, analytic P(win), priority ladder, production | Rule bugs — mitigated by one golden scenario per priority |
| 2. Turn integration & execution | Staged `aiStep`, per-side report slots, deterministic full turn | Ordering subtleties (economy → plan → steps → turn+1) — pinned by integration tests |
| 3. Sequential replay UI | Timed replay, popup queue, blocked input, turn summary | Timing/popup interplay — verified at the manual gate |

**Prerequisites:** S-04 done (S-05 also done — AI respects supply symmetrically). **Estimated effort:** ~3–4 sessions across 3 phases.

## Open Risks & Assumptions

- All scoring constants (capital bonus, supply-cut bonus, distance weight, defense threshold) are draft balance — expect tuning after first campaigns.
- A strict priority ladder can look "robotic" (skips a great low-priority opportunity for a mediocre high-priority one) — acceptable per the spec's "simple and logically predictable".
- The AI's first turn does little (armies on capitals, nothing threatened) — the manual gate should play 2–3 turns to see priorities engage.

## Success Criteria (Summary)

- A complete AI turn is visible, sequential, and explainable end-to-end on `/game`, with input blocked until it finishes.
- Unit tests pin every priority, threshold boundary, and the determinism contract.
- `npm test` / `npm run lint` / `npm run build` green at every phase.
