# Unit images on map tokens and in the detail panel — Implementation Plan

## Overview

Show the user-supplied unit pictures on the board map (inside a larger army token, replacing the dominant-type letter) and in the DetailPanel's unit rows. Off-roadmap presentation change between S-02 and S-03; S-03 (production queues) will reuse the icon map.

## Desired End State

Map tokens render as an owner-colored rounded rect containing the dominant unit type's image plus the unit count; the DetailPanel army view shows one thumbnail per unit-type row. `plane1.png` (aviation, PRD Non-Goal) is not shipped.

## Phase 1: Assets, icon map, token, panel

### Changes Required:

1. `src/assets/units/{soldier1,tank1,artillery1,anti-tank1}.webp` — cwebp-resized 256px versions of the raw PNGs in `game_data/obrazki jednostek/` (raw folder stays user-owned source).
2. `src/components/game/unit-icons.ts` (new) — `UNIT_ICON: Record<UnitTypeId, string>` via `?url` imports (pattern of `europe-regions.svg?url` in BoardMap).
3. `src/components/game/BoardMap.tsx` — token grows to ~28×18; `<image>` of `UNIT_ICON[dominantUnitType(army)]` (~14×14) + count text replace the `count·letter` text; drop `DOMINANT_LETTER`; selection ring and hit-test follow the new `TOKEN_W/TOKEN_H` constants.
4. `src/components/game/DetailPanel.tsx` — thumbnail (`UNIT_ICON[typeId]`) on each grouped unit-type row.

### Success Criteria:

#### Automated Verification:

- `npm test` passes (41 tests, no regressions)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Tokens show the dominant unit's image + count, readable at default and zoomed view; owner color still identifies the side (G1/G2 soldier-dominant, tanks in R1 etc.)
- Selection ring, reach rings, click hit-test, pan/zoom/double-click unaffected by the larger token
- DetailPanel army view shows one thumbnail per unit-type row; city/terrain views unchanged

## References

- Session plan: `~/.claude/plans/w-ktorym-kroku-dodac-vectorized-wall.md`
- Raw assets: `game_data/obrazki jednostek/`
- PRD NFR map readability (deliberately extended: symbol → image)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Assets, icon map, token, panel

#### Automated

- [x] 1.1 `npm test` passes (41 tests, no regressions)
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` passes

#### Manual

- [x] 1.4 Map tokens and panel thumbnails verified on `/game` (readability, hit-test, interactions intact)
