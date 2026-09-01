# GitHub Task Board — M-1: Playable prototype

> Generated from GitHub Issues on 2026-08-30 via `gh` (milestone **M-1: Playable prototype**).
> Regenerate: `gh issue list --milestone "M-1: Playable prototype" --state all --limit 20`
> Source of truth: `context/foundation/roadmap.md` + GitHub Issues.

## Issues

| Issue | Title | Roadmap ID | Change ID | Blocked by | Blocks | Labels | Status |
| ----- | ----- | ---------- | --------- | ---------- | ------ | ------ | ------ |
| [#1](https://github.com/piotr-mech/europe-1940/issues/1) | F-01: Load prototype map & balance data from data files | F-01 | `game-data-contract` | — | #2 | foundation, stream-core-loop, ready | OPEN |
| [#2](https://github.com/piotr-mech/europe-1940/issues/2) | S-01: New game screen + board-game map view | S-01 | `new-game-map-view` | #1 | #3, #4 | slice, stream-core-loop | OPEN |
| [#3](https://github.com/piotr-mech/europe-1940/issues/3) | S-02: Form armies and move them on the map | S-02 | `army-movement` | #2 | #5 | slice, stream-core-loop | OPEN |
| [#4](https://github.com/piotr-mech/europe-1940/issues/4) | S-03: City income and unit production queues | S-03 | `resources-production` | #2 | #5 | slice, stream-core-loop | OPEN |
| [#5](https://github.com/piotr-mech/europe-1940/issues/5) | S-04: Automatic battle + city capture (US-01) — NORTH STAR | S-04 | `battle-city-capture` | #3, #4 | #6, #7 | slice, north-star, stream-core-loop | OPEN |
| [#6](https://github.com/piotr-mech/europe-1940/issues/6) | S-05: Supply evaluation and unsupplied penalties | S-05 | `supply-lines` | #5 | — | slice, stream-campaign-completion | OPEN |
| [#7](https://github.com/piotr-mech/europe-1940/issues/7) | S-06: Rule-based AI opponent turns | S-06 | `ai-opponent` | #5 | #8 | slice, stream-campaign-completion | OPEN |
| [#8](https://github.com/piotr-mech/europe-1940/issues/8) | S-07: Campaign victory/defeat conditions | S-07 | `victory-conditions` | #7 | #9 | slice, stream-campaign-completion | OPEN |
| [#9](https://github.com/piotr-mech/europe-1940/issues/9) | S-08: Save/resume; state survives refresh | S-08 | `save-resume` | #8 | — | slice, stream-campaign-completion | OPEN |

## Streams

- **A — Core turn loop:** #1 → #2 → #3 ∥ #4 → #5 (path to the north star)
- **B — Campaign completion:** #6 ∥ #7 → #8 → #9

## Notes

- Dependencies live as `#N` references in each issue body (GitHub has no native task dependencies).
- Issue states here are a snapshot; run the regenerate command above (or `gh issue list`) for the live view.
- Parked items and open roadmap questions are tracked in `context/foundation/roadmap.md`, not as issues.
