---
change_id: fullscreen-map
title: Full-viewport map with floating HUD, panel and banner
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T20:00:00+02:00
---

## Notes

Retroactively registered (implemented ad-hoc from a direct user request before
this record existed — commit e0447f2).

The board became the app: the map fills the browser viewport and the header,
detail panel and autosave warning float over it (user-chosen layout among
overlay vs. side-panel options). BoardMap's viewBox aspect now tracks the
element's box via ResizeObserver, and the view is framed on the background
asset's measured ink bounds (the asset carries wide empty sea margins) — so
the drawn map, not the empty canvas, fills the screen at any window size.
Pan/zoom math unchanged (uniform scale preserved).

Verification: tsc + lint + full unit suite + E2E green; geometry asserted at
two viewports (1440×900 and 900×1000); screenshots reviewed visually. Known
cosmetic follow-up: detail panel contrast over the light sea is soft.
