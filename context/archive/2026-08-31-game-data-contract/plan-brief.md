# Game Data Contract — Plan Brief

> Full plan: `context/changes/game-data-contract/plan.md`

## What & Why

F-01 is the foundation every gameplay slice builds on: the game must load the prototype map graph (fields, cities, terrain, connections) and unit/city statistics from one canonical, version-controlled dataset. Without it nothing can render or simulate. Draft values come from the game spec; the user-supplied balance CSV swaps into the same contract when it arrives.

## Starting Point

No game code exists — `src/` is the Astro 6 scaffold with auth only. The user supplied `game_data/*.csv`: all-Europe region/city geometry with SVG coordinates, but no connections, no terrain, no balance values, and missing three prototype cities (Poznań, Królewiec, Smoleńsk). The repo has no test runner.

## Desired End State

A typed TS dataset (`src/data/`) describing the full prototype scenario — 29 fields, 4 unit types, 12 cities, 4 terrains, 2 countries — importable through one validating accessor (`getGameData()`), with vitest invariant tests and a registry of load-bearing names in `docs/reference/contract-surfaces.md`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dataset format | Typed TS files in `src/data/` | Compile-time typing, no runtime parsers, trivial value swaps for the future balance CSV. | Plan |
| Role of `game_data/` CSVs | Coordinate source material only | They hold geometry for all of Europe but no graph/terrain/balance; coordinates are lifted into TS. | Plan |
| Display language | Polish names, English ids | Matches the spec and CSVs; game UI will be Polish. | Plan |
| Correctness guarantees | vitest + invariant validation | A typo in the connection graph must fail CI, not break movement in S-02. | Plan |
| Initial state scope | Static map + stats + `initialOwner` per field | Hands S-01 a complete scenario while armies/resources/queues stay game state. | Plan |
| Terrain set | plains, forest, mountains, river (no port) | Every FR-005/FR-007 modifier has a data source; ports are dead data without navy (Non-Goals). | Plan |
| Map graph design | Agent-designed 29-field graph, human-reviewed | The plan ships a complete, playable design for review instead of a checklist. | Plan |
| Resources | 3 (money, steel, recruits), no oil/food | PRD FR-002 Socratic resolution overrides the spec's 5 resources. | Frame (PRD) |
| Unit states | Binary operational/destroyed, no damaged state | PRD FR-008. | Frame (PRD) |

## Scope

**In scope:** domain types (`src/types.ts`), data modules (`countries`, `terrain`, `units`, `map`), validating accessor (`src/lib/game-data.ts`), vitest setup + invariant/mutation tests, `docs/reference/contract-surfaces.md`.

**Out of scope:** any UI/rendering (S-01), movement/combat/supply logic, runtime game state, CSV parsing in app/build, i18n, oil/food, damaged units, ports, aviation/navy/generals.

## Architecture / Approach

Static data lives in four TS modules under `src/data/`, shaped by types in `src/types.ts`. `getGameData()` (src/lib/game-data.ts) aggregates them and validates invariants once (unique ids, symmetric connections, connectivity, 25–30 fields, city-stat completeness, value ranges), throwing with a message list on violation. Future React islands import `getGameData()` via the `@` alias exactly as tests do.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data contract foundations | Types, vitest, countries + terrain datasets, smoke test | Type design churn if a downstream slice needs different shapes |
| 2. Prototype map graph + stats | 29-field map, unit types, city stats (the game-design deliverable) | Draft balance and graph need human sign-off — core review gate |
| 3. Validation + registry | Accessor, invariant tests, contract-surfaces registry | Missing an invariant class (e.g. connectivity) silently weakens the contract |

**Prerequisites:** none — F-01 is the first item in the milestone.
**Estimated effort:** ~1–2 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- Derived coordinates (Poznań, Królewiec, Smoleńsk, all terrain fields) are interpolations; visual correctness is only verifiable in S-01's map view.
- Draft stats are placeholders by design — the final balance CSV will replace them; only the invariant tests protect against structural mistakes in that swap.
- National bonuses are data (`id` + description) now; their effects get implemented by id in later slices and could force a shape change then.

## Success Criteria (Summary)

- `npm test`, `npm run lint`, `npm run build` all green with the full dataset and invariant tests in place.
- The author reviews and accepts the 29-field map graph and draft stats (Phase 2 manual gate).
- Downstream slices have exactly one import surface: `getGameData()` from `src/lib/game-data.ts`, registered in `docs/reference/contract-surfaces.md`.
