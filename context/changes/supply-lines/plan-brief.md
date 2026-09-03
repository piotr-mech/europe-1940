# Supply Lines and Unsupplied Penalties — Plan Brief

> Full plan: `context/changes/supply-lines/plan.md`

## What & Why

Implements S-05, the game's distinguishing rule: an army is supplied when an unbroken chain of its side's fields connects it to one of its side's cities; an unsupplied army suffers a flat penalty from the first unsupplied turn — movement max 1, attack/defense −25%. The threat of being cut off, not the battle itself, is where the rule shapes decisions — this slice makes encirclement play possible.

## Starting Point

The engine (movement, battle, production) and UI island are in place through S-04; battles resolve automatically with integer modifier lists, `endTurn` resets movement from unit stats, and ownership flips along every marched path. A key property discovered in planning: after S-04, armies always stand on their owner's field, so a side's own moves can only improve its supply — only the enemy can cut a line, which means a supply status derived live from field ownership is always correct without storing anything.

## Desired End State

Both sides' armies show their supply status: unsupplied tokens carry a marker on the map and the army panel explains the penalty (`Brak — ruch max 1, atak/obrona −25%`); unsupplied armies move at most 1 field per turn and fight at −25%; battle reports list `Brak zaopatrzenia` among the modifiers. Nothing is stored — the status is a pure function of field ownership.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Status representation | Derived pure function (`isSupplied`), never stored | Always consistent with the map (own moves can only improve own supply), no new state for S-08 to persist. | Plan |
| −25% penalty form | Integer: −`round(25%` of modified strength`)`, applied pre-roll | Keeps every reported strength an integer so the report's modifier arithmetic adds up. | Plan |
| Penalty evaluation | Per army (attacker and each defender separately) | Multiple defending armies on one field can have different supply statuses. | Plan |
| UI presentation | Marker on the token + `Zaopatrzenie` row in the panel | Visible at a glance (the cut-off threat is the point of the rule) with the panel explaining it. | Plan |
| Visibility | Both sides' armies | When the AI (S-06) attacks at −25%, the player must see why — NFR: no unexplainable situations. | Plan |
| Movement cap timing | Applied at the `endTurn` reset only | Already-spent points are untouched; ownership cannot change against a side during its own turn. | Plan |

## Scope

**In scope:** `src/lib/supply.ts` (`isSupplied`, `movementAllowance`), battle-math penalty integration, capped `endTurn` reset, map marker, panel row, contract-surfaces update.

**Out of scope:** escalating penalties (cut by PRD), supply-chain rendering on the map, AI supply behavior (S-06), new state fields, dev cheats to force unsupplied armies in play.

## Architecture / Approach

Two phases, engine-first: Phase 1 builds the pure BFS module and wires the integer penalty into the battle strength math (vitest only); Phase 2 applies the capped movement reset in `endTurn` and adds the map marker and panel row, closing with the manual gate.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Supply engine (headless) | `isSupplied` BFS, `movementAllowance` cap, battle −25% modifiers | Penalty/rounding bugs — pinned by exhaustive vitest incl. rounding boundaries |
| 2. Reducer & UI wiring | Capped `endTurn` reset, token marker, panel row | Manual gate can exercise the positive path only — no army can be cut off in play until S-06 (unit tests cover the rest) |

**Prerequisites:** S-04 done. **Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- **No live unsupplied state until S-06**: the AI never moves and initial armies sit on own cities — every unsupplied path (marker, cap, battle penalty) is verified by unit tests only; the S-06 slice should re-verify them in play.
- The "armies always stand on their owner's field" invariant is load-bearing for "own moves can't cut own supply" — if a future slice breaks it (e.g. retreats), revisit mid-turn evaluation.

## Success Criteria (Summary)

- A supplied army behaves exactly as before (no regression — the marker, row, and battle report show the supplied state).
- Unit tests prove the full unsupplied path: cap 1 movement, −25% in battle with the report modifier, marker data.
- `npm test` / `npm run lint` / `npm run build` green; no `GameState` shape change.
