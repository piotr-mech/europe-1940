---
change_id: new-game-map-view
title: New game screen and board-game map view
status: implementing
created: 2026-08-31
updated: 2026-08-31
archived_at: null
---

## Notes

S-01 from context/foundation/roadmap.md — first user-visible slice: the user can start a new game (choosing their own country and the AI's country from the prototype's two) and see the board-game map: cities as large points, connections as lines, ownership colors, army tokens. Reads the canonical dataset via `getGameData()` (F-01, archived as game-data-contract). The map readability NFR is the product's most important assumption — the board view is validated before any mechanics land on top.
