---
change_id: delete-save
title: User-initiated save deletion on the setup screen (CRUD Delete half)
status: open
created: 2026-09-13
updated: 2026-09-13
---

## Notes

Motivation: the 10xBuilder certification minimal-criteria check (run
2026-09-13) found exactly one gap — the save's CRUD has Create (startGame →
saveGame), Read (loadGame auto-resume) and Update (autosave per transition),
but no user-facing Delete: `clearGame()` fired only automatically when a
campaign ended, and the sole manual `localStorage.removeItem` lived in an e2e
cleanup. 4/5 criteria met; this change closes the fifth.

Design (single-slot model kept — no save list, no backend):

- `src/lib/persistence.ts` gains `hasSavedGame(): boolean` — a
  non-destructive, presence-only peek (no version check, nothing discarded),
  so the setup screen can offer the delete affordance even for a payload
  `loadGame` would reject.
- `src/components/game/GameScreen.tsx` tracks `savedCampaign` (lazy-init from
  `hasSavedGame()`, mirrored by the autosave effect on its save/clear
  outcomes — the "skip" path on the setup screen leaves it untouched, which
  is exactly the exit-to-menu contract: the save is kept). When true, the
  setup screen shows a resume note plus a destructive "Usuń zapisaną
  kampanię" button calling `clearGame()` + `setSavedCampaign(false)`.
- Deliberately no confirmation dialog: "Rozpocznij grę" already overwrites
  the slot without asking — the two destructive actions stay consistent, and
  the note states both consequences (refresh resumes, new game overwrites).

Tests:

- Unit: `describe("hasSavedGame")` in `src/lib/persistence.test.ts` —
  no-save false, post-save true, post-clear false, presence-only (corrupt
  entry still true), blocked-read and no-storage degradation.
- E2E: `e2e/delete-save.spec.ts` (risk #4) — start → exit to menu →
  delete → affordance hides → reload lands on the setup screen, not the
  resumed board.
- test-plan.md: §4 tooling table now lists five e2e specs; freshness ledger
  updated.
