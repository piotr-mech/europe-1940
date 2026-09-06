# Save & Resume — Plan Brief

> Full plan: `context/changes/save-resume/plan.md`

## What & Why

A campaign in progress must survive interruption: autosave the game state client-side after every action, auto-resume it when the player returns to `/game` (FR-014, roadmap S-08 — the last open slice of M-1). Today a page refresh silently destroys the campaign because the island remounts with empty state.

## Starting Point

The game engine is already persistence-ready: `GameState` is pure serializable JSON (`src/types.ts:173`), all randomness is a seed stored in the state, and the deterministic AI keeps its pending plan in `aiPlan`. Nothing exists on the storage side — zero `localStorage` usage in `src/`; refresh returns to the setup screen (documented debt at `GameScreen.tsx:51`).

## Desired End State

Refresh the page mid-campaign (even mid-AI-replay) and the game continues at the exact turn, fully intact. Finish a campaign and the save is cleared — the next visit offers a fresh start. A corrupt or future-versioned save is discarded silently instead of crashing the game.

## Key Decisions Made

| Decision                              | Choice                                              | Why (1 sentence)                                                                                             | Source |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Save trigger                          | Autosave on every state transition                  | Guardrail "state survives refresh" must hold at any moment; state is a few KB so the cost is negligible       | Plan   |
| Schema evolution                      | Envelope `{ version, state }`, discard incompatible | Cheapest safe behavior for a solo, no-auth game — no migration machinery for saves that don't exist yet      | Plan   |
| Campaign end                          | Clear the save when `winner` is set                 | A finished board game is not resumable; prevents stale "victory" saves accumulating                          | Plan   |
| Multiple tabs                         | One slot, last write wins                           | Solo player with one tab is the real scenario; multi-tab coordination would violate the simplify rule        | Plan   |
| Resume UX                             | Auto-resume, no prompt screen                       | "Interrupt and continue later" with zero extra clicks; setup screen appears only when there is no save       | Plan   |
| Corrupt save                          | Validate structure, remove entry, start fresh       | Never boot from a malformed snapshot; follows the lessons rule of not masking developer errors              | Plan   |
| In-game "new game" button mid-campaign | Not included                                       | Chosen consciously — abandoning a campaign means playing it out; avoids extra UI for an edge desire          | Plan   |
| Popup dismissal flags on resume       | Not persisted — newest battle report re-shows once  | UI-local flags stay cheap; re-showing the latest report after resume is acceptable, arguably informative    | Plan   |

## Scope

**In scope:** `src/lib/persistence.ts` (+ vitest) — versioned envelope, structural validation, save/load/clear; GameScreen wiring — lazy `useReducer` initializer, autosave/clear effect; small `docs/reference/contract-surfaces.md` touch.

**Out of scope:** server-side persistence, multi-tab coordination, save-slot UI, save migrations, in-game new-game button, component-test infrastructure.

## Architecture / Approach

All policy lives in a pure, React-free `src/lib/persistence.ts` module (same pattern as every other `src/lib/` module, fully unit-tested). The island adds two touches: `useReducer(gameReducer, null, loadGame)` for one-shot resume at boot, and one `useEffect` on `state` that saves (or clears, on `winner`). Because the RNG seed and AI plan are part of the state, restore is exact — no replay logic anywhere.

## Phases at a Glance

| Phase | What it delivers                       | Key risk                                                        |
| ----- | -------------------------------------- | --------------------------------------------------------------- |
| 1. Persistence module | Tested save/load/clear + validation   | Validator too strict (rejects valid states) — covered by round-trip tests |
| 2. GameScreen integration | Auto-resume + autosave wired into UI  | Winner-vs-save ordering in the effect; refresh-mid-replay path  |

**Prerequisites:** S-01…S-07 done (full campaign state exists).
**Estimated effort:** ~1 focused session across 2 phases.

## Open Risks & Assumptions

- Storage may be unavailable (privacy mode, blocked cookies) — the module degrades to "no persistence" by design; the game keeps playing.
- The structural validator is pragmatic, not exhaustive — it catches truncation/wrong payloads, not adversarial deep fakes (acceptable: the only writer is the game itself).

## Success Criteria (Summary)

- Refresh at any point mid-campaign resumes the exact same turn — no lost progress, no setup screen
- Refresh after game over lands on the setup screen
- Garbage in the storage key never crashes the game
