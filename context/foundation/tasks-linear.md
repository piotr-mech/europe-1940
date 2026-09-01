# Linear Task Board — M-1: Playable prototype

> Mirrored from GitHub Issues on 2026-08-30 via the Linear MCP server (workspace `kurs`, team `Kurs`, key `KUR`).
> Source of truth: `context/foundation/roadmap.md` · GitHub mirror: `context/foundation/tasks-github.md`
> Linear project: [M-1: Playable prototype](https://linear.app/kurs-10x/project/m-1-playable-prototype-632a9eeb52ed)

## What exists in Linear

Created in this session (all on 2026-08-30), mirroring the GitHub milestone 1:1:

- **1 project** — `M-1: Playable prototype` (status: Backlog), the Linear counterpart of the GitHub milestone. Its description carries the milestone intent, both stream chains, and links back to the roadmap and GitHub task board.
- **6 team labels** — same names and colors as on GitHub: `foundation` (#0e8a16), `slice` (#1d76db), `north-star` (#b60205), `stream-core-loop` (#fbca04), `stream-campaign-completion` (#c5def5), `ready` (#006b75, F-01 only).
- **9 issues** — KUR-5 … KUR-13, one per roadmap item (F-01 + S-01…S-08), all in status `Backlog`, all attached to the project. Each issue body carries: Roadmap ID, Change ID, status, PRD refs, a link to its GitHub counterpart (`#1`…`#9`), and the sections Outcome / Dependencies / Risk / Unknowns taken verbatim from the roadmap.
- **9 dependency relations** — set as native Linear `blocks`/`blocked by` relations (unlike GitHub, where dependencies are plain `#N` text references in issue bodies).

## GitHub ↔ Linear mapping

| GitHub | Linear | Roadmap ID | Change ID | Title |
| ------ | ------ | ---------- | --------- | ----- |
| #1 | KUR-5 | F-01 | `game-data-contract` | F-01: Load prototype map & balance data from data files |
| #2 | KUR-6 | S-01 | `new-game-map-view` | S-01: New game screen + board-game map view |
| #3 | KUR-7 | S-02 | `army-movement` | S-02: Form armies and move them on the map |
| #4 | KUR-8 | S-03 | `resources-production` | S-03: City income and unit production queues |
| #5 | KUR-9 | S-04 | `battle-city-capture` | S-04: Automatic battle + city capture (US-01) — NORTH STAR |
| #6 | KUR-10 | S-05 | `supply-lines` | S-05: Supply evaluation and unsupplied penalties |
| #7 | KUR-11 | S-06 | `ai-opponent` | S-06: Rule-based AI opponent turns |
| #8 | KUR-12 | S-07 | `victory-conditions` | S-07: Campaign victory/defeat conditions |
| #9 | KUR-13 | S-08 | `save-resume` | S-08: Save/resume; state survives refresh |

Note: Linear identifiers start at KUR-5 (KUR-1…4 predate this mirror / were consumed by the workspace), so GitHub `#N` and Linear `KUR-NN` numbers do **not** align — always map via the table above or via the Change ID.

## Dependency graph (native Linear relations)

Edges set via `blocks` (each edge also shows automatically as `blocked by` on the target):

- KUR-5 (F-01) → blocks KUR-6 (S-01)
- KUR-6 (S-01) → blocks KUR-7 (S-02), KUR-8 (S-03)
- KUR-7 (S-02) → blocks KUR-9 (S-04)
- KUR-8 (S-03) → blocks KUR-9 (S-04)
- KUR-9 (S-04) → blocks KUR-10 (S-05), KUR-11 (S-06)
- KUR-11 (S-06) → blocks KUR-12 (S-07)
- KUR-12 (S-07) → blocks KUR-13 (S-08)

Verified via `get_issue KUR-9`: blocked by KUR-7/KUR-8, blocks KUR-10/KUR-11 — matching the roadmap exactly.

Streams as Linear paths:

- **A — Core turn loop:** KUR-5 → KUR-6 → KUR-7 ∥ KUR-8 → KUR-9 (north star)
- **B — Campaign completion:** KUR-10 ∥ KUR-11 → KUR-12 → KUR-13

## How the mirror was created (session log)

1. Inspected the workspace: team `Kurs` existed with only default labels (`Improvement`, `Feature`, `Bug`) and no projects — nothing to reconcile.
2. Created the project `M-1: Playable prototype` (team: Kurs) with a description mirroring the milestone intent.
3. Created the 6 labels as team-scoped labels, copying names, colors, and descriptions from GitHub.
4. Created the 9 issues in roadmap order (pass 1), each with title, body, project, and labels.
5. Set dependencies in a second pass (pass 2) — one `save_issue` update per source issue with its `blocks` list; 7 updates covered all 9 edges.
6. Verified with `get_issue` + `includeRelations` on the north star (KUR-9).

## Keeping the three boards in sync

- `context/foundation/roadmap.md` — canonical planning document (statuses: `ready` / `proposed` / `planning` / …). Status changes flow outward from here.
- GitHub Issues — created via `gh` CLI (milestone `M-1: Playable prototype`, issues #1–#9, dependencies as `#N` references).
- Linear — the mirror described here. No automatic sync exists; when a slice's status changes (e.g. `/10x-plan` flips a roadmap item to `planning`), update all three manually or ask the agent to do it.
- Parked items and open roadmap questions are tracked only in `roadmap.md` — they exist neither as GitHub issues nor as Linear issues.
