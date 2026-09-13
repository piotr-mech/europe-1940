---
change_id: game-navigation
title: Exit navigation — "Menu główne" from the board, "Strona główna" from setup
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T20:00:00+02:00
---

## Notes

Retroactively registered (implemented ad-hoc from direct user requests before
this record existed — commits d1b73e3 and 6c4b08e).

Navigation is now full in both directions: "Menu główne" in the game header
returns to the setup screen at any time (also mid-AI-turn), and "Strona główna"
on the setup screen navigates to the landing page. Both exits are deliberately
non-destructive: the autosave is kept, so a refresh resumes the exited
campaign, and starting a new game overwrites it — leaving never loses progress
(FR-014). The e2e spec exit-to-menu.spec.ts pins the contract: board → menu →
refresh-resume → menu → landing.

Verification: tsc + lint + full unit suite + E2E (4 specs) green; exit flows
asserted in the spec; header reviewed visually.
