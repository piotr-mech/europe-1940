# Victory Conditions — Plan Brief

> Full plan: `context/changes/victory-conditions/plan.md`

## What & Why

S-07 / FR-013: the campaign must be able to end. Today a finished campaign just keeps going — no code knows the game is over. We add the one missing loop-closer: the game ends in victory or defeat the moment one side controls all of the enemy's cities, with a clear end-of-game result (roadmap: "a clean, explanation-free victory condition per PRD").

## Starting Point

All six prior slices are done and archived: the map, movement, production, battle/capture, supply, and the staged AI turn all work; ownership lives in `fieldOwners` and changes only in `applyMove`/`resolveBattle`. `GameState` has no winner field, and the reducer's comments explicitly anticipate S-07's check hooking into `endTurn`/`aiStep`.

## Desired End State

A campaign ends the instant a capture completes the condition: the state freezes (`winner` set, all gameplay actions ignored, AI replay stops), the deciding battle popup plays out first, then a victory/defeat overlay shows the result. The player can browse the final map read-only and start a new game from the overlay or the header.

## Key Decisions Made

| Decision                                          | Choice                                                        | Why (1 sentence)                                                                                             | Source |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| When the condition is checked                     | Immediately after every ownership change (move, battle, aiStep) | Ends the game at the causal moment; matches player expectation and FR-013.                                   | Plan   |
| End-state representation                          | `winner: CountryId \| null` field in `GameState`              | Minimal terminal flag; freezes the reducer and persists for free in S-08 — beats UI-only derivation.         | Plan   |
| End screen                                        | Dismissible overlay + read-only map browsing                  | Lets the player inspect the final position after a 1-3 h campaign, in the established BattlePopup style.     | Plan   |
| Definition of "all enemy cities"                  | Cities whose `initialOwner` is the enemy country              | Literal FR-013 reading; robust to any capture/recapture churn; avoids all-12-cities grinding.                | Plan   |
| Victory mid-AI-replay                             | Stop replay immediately; battle popup first, overlay after    | Preserves causality — the deciding battle is seen, no meaningless steps follow.                              | Plan   |
| Armies without cities                             | Irrelevant — cities alone decide                               | FR-013's clean one-sentence rule; no comeback mechanics in the prototype.                                    | Plan   |

## Scope

**In scope:** `src/lib/victory.ts` (`winnerOf`), `GameState.winner` + reducer freeze + `resetGame` action, `VictoryOverlay` component + `GameScreen` wiring, unit/integration tests.

**Out of scope:** key-city victory, draw UI, turn limits/score, army-elimination conditions, persistence (S-08), end-game statistics beyond turn count and city tally.

## Architecture / Approach

Pure engine module derives the winner from `fieldOwners` + map `initialOwner` (the supply-lines "derived, never stored" pattern); the reducer stamps it as terminal state on capture; a hand-rolled overlay (BattlePopup pattern) presents it after any pending battle popup closes.

## Phases at a Glance

| Phase                     | What it delivers                                             | Key risk                                                    |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| 1. Victory engine         | `winnerOf` + full unit-test decision table                   | Misdefining "enemy cities" under ownership churn            |
| 2. Reducer integration    | `winner` field, freeze, replay stop, `resetGame` + tests     | Sequencing: skip turn rollover when winner lands mid-replay |
| 3. End-of-game UI         | `VictoryOverlay`, popup→overlay ordering, read-only map      | Popup/overlay ordering edge cases around the deciding battle |

**Prerequisites:** S-01…S-06 done (they are). **Estimated effort:** ~1-2 sessions; engine and reducer phases are small, the UI phase carries the manual playthrough.

## Open Risks & Assumptions

- Manual verification requires playing a campaign to completion; the Germany side needs only 4 city captures, so this is practical in dev, but the defeat path depends on letting the AI win (country swap may be needed).
- Both sides' conditions satisfying simultaneously is unreachable in play (immediate check + freeze) but `winnerOf` is deterministic defensively; if future changes introduce multi-flip atomic actions, revisit.

## Success Criteria (Summary)

- Capturing the last enemy city ends the campaign: popup first, then the victory overlay — and symmetrically for defeat.
- After the overlay is dismissed, the map is browsable but no input changes the game; `Nowa gra` returns to a working setup screen.
- `npm test`, `npm run lint`, `npm run build` all pass.
