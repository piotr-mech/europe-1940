# Battle and City Capture — Plan Brief

> Full plan: `context/changes/battle-city-capture/plan.md`

## What & Why

Implements S-04, the roadmap's north star: the player moves an army onto an enemy-occupied field, the battle resolves automatically, and a defeated city changes owner and produces for the winner from the next turn. This completes US-01 end-to-end (production → movement → attack → capture) — the smallest slice that proves the game works; everything before it was scaffolding, everything after it is completion.

## Starting Point

S-02 (armies & movement) and S-03 (resources & production) are done: a pure-module rules engine (`src/lib/`), a thin reducer, and one React island render the map and handle moves/orders. Combat-relevant data (unit attack/defense, terrain and city defense bonuses, river attacker penalty) already sits in the data files, and movement already flips non-city field ownership — but enemy-occupied fields are impassable, there is no combat code, and the codebase contains zero randomness.

## Desired End State

Clicking an enemy-occupied field with a selected army starts an automatic battle; the modified-strength comparison (with a small seeded random element) decides the winner; the loser is destroyed, the winner may lose a few units; a won battle moves the attacker onto the field, flips a city's ownership, cancels its production queue, and its income flows to the capturer from the next turn. The side panel explains every outcome (winner, losses, modifiers).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Battle resolution | Strength ratio × random ±20% per side, injectable PRNG | Satisfies US-01's "stronger usually wins, not always" while keeping the reducer pure and tests deterministic. | Plan |
| Unit losses | Loser destroyed entirely; winner loses a random 0…⌈(loser/winner) × units⌉, clamped to survivor ≥ 1 | Both sides bleed (user preference), but the clamp prevents an unexplainable both-destroyed outcome. | Plan |
| Artillery | New `supportBonus` data field (+2 per artillery in the attacking army) | Honors spec §12's artillery-support modifier without hardcoding a unit-type special case. | Plan |
| Captured city's queue | Cancelled on capture | An in-progress enemy order completing for the capturer is exactly the "unexplainable situation" the NFR forbids. | Plan |
| Movement after a won battle | Attack ends the army's movement | Simple, prevents blitz chains across half the map in one turn. | Plan |
| Undefended enemy field/city | Regular move that flips ownership (capture without battle) | No defenders = no defense is intuitive and forces garrisoning decisions. | Plan |
| Battle outcome UI | Battle report in the side panel (winner, losses, modifiers) | Reuses the existing DetailPanel pattern and explains *why* — the readability NFR. | Plan |
| RNG mechanics | `rngSeed` in `GameState`, mulberry32-style pure step, seed passed via `startGame` | Keeps the reducer pure and every test deterministic with fixed seeds. | Plan |

## Scope

**In scope:** battle module (`src/lib/battle.ts`) with terrain/city/artillery/river modifiers; attack targets in the movement layer; `attackArmy` reducer action; city capture + queue cancellation + next-turn income; free capture of undefended fields; attack interaction and battle report panel.

**Out of scope:** supply modifiers (S-05), AI turns (S-06), victory/defeat (S-07), persistence (S-08), odds preview / damaged state / chaos rule (cut by PRD), generals & air superiority (Non-Goals), attack confirmation dialog.

## Architecture / Approach

Engine-first, per the S-02/S-03 pattern: Phase 1 builds the battle domain headless (pure functions + vitest, no UI), Phase 2 wires the `attackArmy` action and RNG seed into the reducer, Phase 3 adds the map attack interaction (red target rings, click = attack) and the battle report panel — the only manual gate (a full US-01 run). Each phase is one commit and leaves the game playable.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Battle engine (headless) | `battle.ts` with all rules, seeded outcomes, capture + queue cancel; attack targets in movement layer | Battle math bugs — mitigated by exhaustive vitest coverage incl. an upset-seed test |
| 2. Reducer & state wiring | `attackArmy` action, `rngSeed`/`lastBattleReport` in state | Seed handling breaking reducer purity — seed passed in via action payload |
| 3. Attack UX & battle report | Red target rings, click-to-attack, panel report; full US-01 manual run | Report clarity (NFR) — verified manually at the gate |

**Prerequisites:** S-02, S-03 (done). **Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- All numeric values (±20% roll band, +2 artillery support, loss cap formula) are draft balance — tunable in data/constants, expected to need playtesting after the manual gate.
- "Stronger usually wins" with ±20%: if two evenly matched sides meet, outcomes approach a coin flip — acceptable per US-01 but worth watching in playtests.
- The battle report's modifier labels are UI copy in Polish — first user-facing text beyond labels; keep them one-line simple.

## Success Criteria (Summary)

- A player can complete US-01 start to finish: produce, move, attack, capture, and receive the captured city's income next turn.
- Every battle outcome is explainable from the report (winner, losses, modifiers) — no unexplainable situations.
- `npm test` / `npm run lint` / `npm run build` green at every phase; battle tests fully deterministic.
