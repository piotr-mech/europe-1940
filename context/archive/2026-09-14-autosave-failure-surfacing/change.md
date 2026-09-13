---
change_id: autosave-failure-surfacing
title: Surface swallowed autosave failures (saveGame contract + UI banner)
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T19:00:00+02:00
---

## Notes

M3L5 practical task: find and fix a swallowed error (a catch that does not
propagate the failure). Codebase sweep found one in the game code:
`saveGame()` in `src/lib/persistence.ts` swallowed environmental storage
failures (quota exceeded, blocked storage) — the game kept playing with no
signal that nothing was being persisted, so a refresh silently lost turns
(FR-014 violation from the player's perspective). The remaining candidates
(`src/pages/api/auth/signout.ts`, `src/middleware.ts`) sit in the removable
auth scaffold and are out of scope.

Evidence trail (lesson method — diagnosis from multiple sources):

- Symptom: autosave looks successful (no error anywhere), but after a refresh
  `loadGame()` returns the last successful save or null.
- Code: `persistence.ts` catch on `setItem` returned void for `DOMException`.
- Prior test pinned the swallow as intended UX (`persistence.test.ts`
  "swallows quota-exceeded instead of crashing the game") — this change is a
  deliberate contract change, not a bugfix against an unpinned behavior.

Decision: `saveGame` keeps not throwing (game stays playable) but returns
`"saved" | "failed"`; `GameScreen` shows a dismissible warning banner on
failure so the player knows the campaign is not being persisted. Verified by
a red-first unit test (debug-as-test) plus an E2E test that fails localStorage
writes via an init script. Auth-scaffold swallowed errors deliberately left
alone (removable reference code per AGENTS.md).
