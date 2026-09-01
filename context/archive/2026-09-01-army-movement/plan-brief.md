# Armies and Movement — Plan Brief

> Full plan: `context/changes/army-movement/plan.md`

## What & Why

Slice S-02 of the playable-prototype milestone: the player can move armies between connected fields within movement points (slowest unit sets the pace, terrain changes the cost), combine own armies into one token (max 8 units), advance the turn to restore movement, and inspect city/army details in a panel. Covers FR-004, FR-005, FR-006, and the movement half of US-01. Combat is deliberately out — it is slice S-04.

## Starting Point

S-01 already delivered a new-game flow and a read-only SVG board: `GameState.armies` exists with four draft starting armies, the dataset already carries `UnitType.movement`, `TerrainStats.movementCost` and the 29-field connection graph, and army tokens render statically on the map. Nothing interactive exists — no clicks, selection, highlights, or panels.

## Desired End State

Click an own army → its reachable fields highlight → click a destination → the army moves along the cheapest path and terrain it enters flips to its owner. Armies on the same field merge (capped at 8 units). An "End turn" button advances the turn and restores movement (no AI yet). Clicking any field or army opens a side panel with its details.

## Key Decisions Made

| Decision                       | Choice            | Why (1 sentence)                                                                                   | Source           |
| ------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------- | ---------------- |
| Turn/movement reset            | Mini "End turn" (turn++, reset, no AI) | Simplest reset consistent with the rules; S-06 only adds the AI.                                  | Plan (questioning) |
| Movement UX                    | Select → highlight reach → click target | Reads like a board game and makes the terrain cost visible through the reach set.                 | Plan (questioning) |
| Army forming (FR-004)          | Merge only, no split | Covers "combine units" with one rule; splitting arrives with production forming in S-03+.          | Plan (questioning) |
| Inspection panel (FR-006)      | Hand-rolled side panel | Zero new dependencies, panel always visible — good for map readability; matches raw-Tailwind pattern. | Plan (questioning) |
| Enemy fields                   | Enemy-army fields impassable; empty enemy fields passable | Consistent with FR-007 (attack = move onto occupied field) without combat; no odd co-location.     | Plan (questioning) |
| Ownership on entry             | Terrain flips to mover's owner; cities never | Cities change owner only through battle (FR-009); terrain flips feed S-05 supply.                | Plan (questioning) |
| National bonuses (Blitzkrieg)  | Both deferred | Bonuses stay data-only until both are mechanically meaningful (Rezerwy needs S-03 costs).          | Plan (questioning) |
| Test coverage                  | Vitest engine tests + manual UI | Proven S-01 pattern; interaction infra deferred again by decision.                                 | Plan (questioning) |
| Movement points representation | `Army.movementPoints` in `GameState` | Keeps rules in the reducer-testable domain layer, UI thin.                                        | Plan (research)  |

## Scope

**In scope:** `Army.movementPoints`; `src/lib/movement.ts` (speed, Dijkstra reachability, pathing, `applyMove` with ownership flips + merge); `moveArmy`/`endTurn` reducer actions; BoardMap click/selection/reach-highlight; GameScreen selection state + End turn button; `DetailPanel` for cities and armies.

**Out of scope:** combat and city capture (S-04); army splitting; national bonuses; AI turn behavior (S-06); supply (S-05); persistence (S-08); component-test infrastructure; undo.

## Architecture / Approach

Rules in the domain layer, UI as a thin shell: `src/lib/movement.ts` owns every movement rule as pure functions; `gameReducer` gains `moveArmy`/`endTurn` calling them; `GameScreen` holds selection as React state, computes the reachable set, and passes callbacks down to `BoardMap`, which stays a pure render of `(GameData, GameState, selection) → SVG`; `DetailPanel` renders the selected subject beside the map.

## Phases at a Glance

| Phase     | What it delivers       | Key risk                  |
| --------- | ---------------------- | ------------------------- |
| 1. Movement engine (domain) | Rules + reducer actions + full vitest coverage, no UI | Rule subtleties (merge cap, city exception) surviving untested |
| 2. Selection & movement UX | Click-to-select, reach highlight, move, merge, end turn | Click vs pan-drag disambiguation breaking zoom/pan |
| 3. Inspection panels | Side panel with city/army details | Content drift from dataset values |

**Prerequisites:** S-01 done (it is). **Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- "End turn" with no AI reaction may briefly confuse a new player — acceptable until S-06, mitigated by the header showing the turn number.
- Moving armies flips only terrain ownership; whether that reads clearly on the map (color changes without a city falling) gets eyeballed in Phase 2's manual pass.
- The merge cap blocking an otherwise-legal move must be visibly understandable (no error toast is planned — the target simply stays unhighlighted); if that proves opaque, a small inline hint is the fallback.

## Success Criteria (Summary)

- A player can select an own army, see its reach, and move it within movement points, with terrain costs respected.
- Merging, turn advance, and inspection (city + army panels) all work on `/game` with `npm test`/`lint`/`build` green.
