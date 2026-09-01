# New Game Screen and Board-Game Map View — Plan Brief

> Full plan: `context/changes/new-game-map-view/plan.md`

## What & Why

S-01 is the first user-visible slice and the validation of the product's most important assumption: that the map reads as a board-game war map. The user starts a new game (choosing their own and the AI's country from the prototype's two) and sees the board: cities as large points, connections as lines, ownership colors, army tokens.

## Starting Point

F-01 (archived) delivered the canonical dataset behind `getGameData()`: 29 fields with SVG coordinates on a 1800×1200 canvas, connections, owners, country colors. No game UI exists — only the Astro scaffold with auth islands, vitest for logic, CI running lint → test → build.

## Desired End State

`/game` shows a setup screen; after picking countries (player ≠ AI) and pressing start, the board renders: geographic background (`europa_regiony.svg`), 29 fields with ownership colors, 12 labeled cities, connection lines, and 4 static army tokens. The initial state satisfies US-01's Given (each side ≥1 city, ≥1 army).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Starting armies | Initial-state factory in `src/lib/game-state.ts` | Setup is game state, not dataset — keeps F-01's boundary while meeting S-01's "army tokens" outcome. | Plan |
| Map rendering | Own SVG in React over the geographic `europa_regiony.svg` background | User's design call — pastel fills (image-verified) let saturated ownership colors pop; coordinates share one canvas with the dataset. | Plan |
| Background colors | Full colors, no dimming | User's aesthetic choice; readability secured by white casings/halos and ≥16px city markers; NFR manual gate arbitrates. | Plan |
| Routing | One `/game` page, one island with setup → board modes | No navigation means no state handoff; persistence is S-08 anyway. | Plan |
| State | `useReducer` + `GameState` type, reducer/factory in `src/lib` | Testable headlessly in vitest; no library needed at this size. | Plan |
| Tokens | Static (flag color, unit count, dominant-type letter) | Interaction/inspection is S-02 (FR-006); S-01 stays render-only. | Plan |
| Tests | Logic in vitest, UI manual | The slice's risk is visual (readability NFR); component-test infra deferred to S-02. | Plan |

## Scope

**In scope:** `GameState`/`Army`/`UnitInstance` types, `createInitialGameState` + `gameReducer` + `dominantUnitType` (tested), `src/assets/europe-regions.svg` (committed copy), `BoardMap.tsx`, `GameScreen.tsx`, `src/pages/game.astro`, middleware non-interference check.

**Out of scope:** movement/inspection interactions (S-02), resources/production UI (S-03), battles (S-04), persistence (S-08), background recoloring, component-test infra, mobile support.

## Architecture / Approach

`GameScreen` island hydrates on `/game`; `useReducer(gameReducer)` holds `GameState` (or setup mode); `startGame` builds state via the factory. `BoardMap` is a pure `(GameData, GameState) → SVG` render: background image + deduped connection lines with white casing + ownership-colored field markers (cities large, labeled) + army tokens. All logic lives in `src/lib/game-state.ts`, unit-tested without DOM.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Initial game state contract | Types, factory (draft armies), reducer, tests, background asset | Draft setup values need designer sign-off |
| 2. Board map view (demo state) | `BoardMap` + `/game` demo wiring | Readability over the geographic background — first judgment |
| 3. New game screen and wiring | Setup UI, island, final `/game` flow | Middleware interference; country-constraint UX |

**Prerequisites:** F-01 done ✓ (dataset live).
**Estimated effort:** ~1–2 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- Background label density could clutter the board; mitigation (halos, casings) is planned, and stripping baked-in labels is the fallback if the gate fails.
- Draft starting armies are placeholders — re-tuning in S-02/S-03 is expected and non-breaking.
- `GameState` shape will grow (resources, queues in S-03; supply flags in S-05) — additive fields, consumers keep reading the same type.

## Success Criteria (Summary)

- `/game` full flow works: country choice (never equal) → board with correct ownership and 4 tokens.
- Initial state satisfies US-01's Given; all logic tests green in CI.
- The human verdict: the map reads as a board-game war map at a glance.
