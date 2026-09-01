---
project: "EUROPE 1940"
version: 1
status: draft
created: 2026-08-29
updated: 2026-09-01
prd_version: 1
main_goal: low-complexity
top_blocker: none
milestone_id: playable-prototype
milestone_seq: 1
milestone_status: open
---

# Roadmap: EUROPE 1940

> Derived from context/foundation/prd.md (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Playable prototype — the four core mechanics** — Status: open

- **Intent:** Deliver the PRD's first prototype: a complete solo game against the rule-based AI on the prototype map, in which the four core mechanics — city capture, unit production, army formation & movement, supply cutting — are playable end-to-end, proving whether the core loop is fun.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 … FR-014, US-01.

## Vision recap

A simple, turn-based, board-game-style strategy game set in Europe 1940 — built by the author for himself, hosted under a URL so friends can play the same solo experience. The niche is empty: existing titles are either complex AAA simulations or closed physical board games. Building the game is part of the pleasure; the prototype exists to test whether four simple mechanics (produce, group, attack, cut supply) make a fun loop.

## North star

**S-04: Player fights a battle and captures an enemy city** — completing US-01's full turn (production → movement → attack → capture) is the smallest end-to-end flow that proves the game works; everything before it is scaffolding and everything after it is completion.

> "North star" here means: the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID   | Change ID            | Outcome (user can …)                                                       | Prerequisites | PRD refs                       | Status   |
| ---- | -------------------- | -------------------------------------------------------------------------- | ------------- | ------------------------------ | -------- |
| F-01 | game-data-contract   | (foundation) game reads the prototype map and balance data from data files | —             | FR-001, OQ-2 (resolved)        | done      |
| S-01 | new-game-map-view    | start a new game (picking own and AI country) and see the board-game map   | F-01          | FR-001, US-01                  | done      |
| S-02 | army-movement        | form armies, move them across the map, inspect cities and armies           | S-01          | FR-004, FR-005, FR-006, US-01  | done |
| S-03 | resources-production | collect city income each turn and order new units in cities                | S-01          | FR-002, FR-003, US-01          | proposed |
| S-04 | battle-city-capture  | attack an enemy field, win an automatic battle, take ownership of a city   | S-02, S-03    | FR-007, FR-008, FR-009, US-01  | proposed |
| S-05 | supply-lines         | see supply status and suffer the penalty when the line is cut              | S-04          | FR-010, FR-011, Business Logic | proposed |
| S-06 | ai-opponent          | end the turn and face an AI opponent acting by rules                       | S-04          | FR-012                         | proposed |
| S-07 | victory-conditions   | win or lose the campaign by controlling all enemy cities                   | S-06          | FR-013                         | proposed |
| S-08 | save-resume          | interrupt a game and continue it later; survive a page refresh             | S-07          | FR-014, Guardrails             | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                                      | Note                                                                          |
| ------ | ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| A      | Core turn loop      | `F-01` → `S-01` → `S-02` → `S-03` → `S-04` | The chain to the validation milestone; `S-02`/`S-03` can fan out in parallel. |
| B      | Campaign completion | `S-05` → `S-06` → `S-07` → `S-08`          | Joins Stream A at `S-04`; turns the single-turn loop into a full campaign.    |

## Baseline

What's already in place in the codebase as of 2026-08-29 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 + Tailwind 4 (`astro.config.mjs`, `src/pages/`, `src/components/ui/`)
- **Backend / API:** partial — only the starter's auth API routes (`src/pages/api/auth/`); no game endpoints (none required — game logic is client-side per PRD)
- **Data:** partial — Supabase client scaffold (`src/lib/supabase.ts`), deliberately unused by the game (state is client-side per FR-014)
- **Auth:** present as scaffold, deliberately unused (PRD Access Control: no auth)
- **Deploy / infra:** present — Cloudflare Workers live at `europe-1940.europe-1940.workers.dev`, CI on `main` (`infrastructure.md`)
- **Observability:** partial — Workers observability enabled (`wrangler.jsonc`); no error tracking (no PRD requirement)

## Foundations

### F-01: Game data contract

- **Outcome:** (foundation) the game loads the prototype map graph (25–30 fields, cities, terrain, connections) and unit/city statistics from version-controlled data files, so every downstream slice reads one canonical dataset — draft values from the game spec now, replaced by the user-supplied CSV when it arrives.
- **Change ID:** game-data-contract
- **PRD refs:** FR-001 (map the new game runs on), resolved Open Question 2 (balance data supplied as CSV)
- **Unlocks:** S-01, S-02, S-03, S-04 (every gameplay slice reads the map and stats)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - When does the final balance CSV arrive, and in what column shape? — Owner: user. Block: no (draft values from the spec cover the whole chain; CSV swaps in later).
- **Risk:** Sequenced first because no slice can render or simulate anything without the dataset; kept as a minimal loading contract — slices above still exercise the data through real gameplay.
- **Status:** done

## Slices

### S-01: New game and board view

- **Outcome:** user can start a new game — choosing their own country and the AI's country from the prototype's two — and see the board-game map: cities as large points, connections as lines, ownership colors, army tokens.
- **Change ID:** new-game-map-view
- **PRD refs:** FR-001, US-01 (Given), NFR map readability
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First user-visible slice; the map's readability NFR is the product's most important assumption, so the board view is validated before any mechanics land on top of it.
- **Status:** done

### S-02: Armies and movement

- **Outcome:** user can combine units into armies (max 8) moving as a single token, move armies between connected fields within movement points (slowest unit sets pace, terrain changes cost), and click cities/armies to inspect their details.
- **Change ID:** army-movement
- **PRD refs:** FR-004, FR-005, FR-006, US-01 (When, partially)
- **Prerequisites:** S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Movement rules feed the battle slice; keeping it free of combat keeps both halves plannable.
- **Status:** done

### S-03: Resources and production

- **Outcome:** user can collect city income each turn (money, steel, recruits) and order unit production in owned cities — cost, build time, per-city production slots, queue completing on later turns.
- **Change ID:** resources-production
- **PRD refs:** FR-002, FR-003, US-01 (When, partially)
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Production timing (1–2 turn builds) shapes the whole turn rhythm; sequenced parallel to movement so neither waits on the other.
- **Status:** proposed

### S-04: Battle and city capture — NORTH STAR

- **Outcome:** user can move an army onto an enemy-occupied field to trigger an automatic battle (terrain, city, artillery, unsupplied and river modifiers; small random element; no odds preview), units end operational or destroyed, and a defeated city changes owner and produces for the winner from the next turn.
- **Change ID:** battle-city-capture
- **PRD refs:** FR-007, FR-008, FR-009, US-01 (full)
- **Prerequisites:** S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The validation milestone — completing US-01 end-to-end. Sequenced the moment both parents land; everything before exists to make this slice possible.
- **Status:** proposed

### S-05: Supply lines and penalties

- **Outcome:** user can see which armies are supplied (unbroken chain of own fields to an own city) and unsupplied armies suffer the flat penalty (movement max 1, attack/defense −25%) — enabling encirclement play.
- **Change ID:** supply-lines
- **PRD refs:** FR-010, FR-011, Business Logic (the domain rule), US-01 (acceptance: supply evaluated at end of turn)
- **Prerequisites:** S-04
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The game's distinguishing rule; sequenced after the north star because cutting supply only means something once battles and captures exist.
- **Status:** proposed

### S-06: AI opponent

- **Outcome:** user can end the turn and the AI acts by rules — priorities: defend threatened city, rescue unsupplied armies, attack per odds thresholds, group armies before strong targets, production proportions adjusted to situation.
- **Change ID:** ai-opponent
- **PRD refs:** FR-012
- **Prerequisites:** S-04
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Rule-based AI must feel logical, not random (NFR: no unexplainable situations; AI turn without long waits); parallel to supply so the campaign loop advances on two fronts.
- **Status:** proposed

### S-07: Victory and defeat

- **Outcome:** user can win the campaign by controlling all enemy cities — or lose when the AI takes all of theirs — with a clear end-of-game result.
- **Change ID:** victory-conditions
- **PRD refs:** FR-013
- **Prerequisites:** S-06
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Needs the AI to be a real opponent (both sides must be able to win); a clean, explanation-free victory condition per PRD.
- **Status:** proposed

### S-08: Save and resume

- **Outcome:** user can interrupt a game and continue it later; game state survives a page refresh mid-campaign (client-side persistence).
- **Change ID:** save-resume
- **PRD refs:** FR-014, Guardrails (state survives refresh)
- **Prerequisites:** S-07
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced last so the persisted state schema covers the complete campaign (units, cities, production queues, AI memory) instead of being reworked as features land.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID            | Suggested issue title                             | Ready for `/10x-plan` | Issue                                                    | Notes                              |
| ---------- | -------------------- | ------------------------------------------------- | --------------------- | -------------------------------------------------------- | ---------------------------------- |
| F-01       | game-data-contract   | Load prototype map & balance data from data files | yes                   | [#1](https://github.com/piotr-mech/europe-1940/issues/1) | Run `/10x-plan game-data-contract` |
| S-01       | new-game-map-view    | New game screen + board-game map view             | no                    | [#2](https://github.com/piotr-mech/europe-1940/issues/2) | Needs F-01 done                    |
| S-02       | army-movement        | Form armies and move them on the map              | no                    | [#3](https://github.com/piotr-mech/europe-1940/issues/3) | Needs S-01; parallel with S-03     |
| S-03       | resources-production | City income and unit production queues            | no                    | [#4](https://github.com/piotr-mech/europe-1940/issues/4) | Needs S-01; parallel with S-02     |
| S-04       | battle-city-capture  | Automatic battle + city capture (US-01)           | no                    | [#5](https://github.com/piotr-mech/europe-1940/issues/5) | North star; needs S-02 + S-03      |
| S-05       | supply-lines         | Supply evaluation and unsupplied penalties        | no                    | [#6](https://github.com/piotr-mech/europe-1940/issues/6) | Needs S-04; parallel with S-06     |
| S-06       | ai-opponent          | Rule-based AI opponent turns                      | no                    | [#7](https://github.com/piotr-mech/europe-1940/issues/7) | Needs S-04; parallel with S-05     |
| S-07       | victory-conditions   | Campaign victory/defeat conditions                | no                    | [#8](https://github.com/piotr-mech/europe-1940/issues/8) | Needs S-06                         |
| S-08       | save-resume          | Save/resume; state survives refresh               | no                    | [#9](https://github.com/piotr-mech/europe-1940/issues/9) | Needs S-07                         |

## Open Roadmap Questions

1. **When does the final balance CSV arrive, and in what column shape?** — Owner: user. Block: none (draft values from the game spec carry all slices; the CSV swaps into F-01's contract when delivered).

## Parked

- **Aviation, navy, generals, diplomacy, tech tree** — Why parked: PRD §Non-Goals; only after the four core mechanics prove fun.
- **Additional maps (year-2000 scenario, full-Europe 80–120 fields)** — Why parked: PRD §Non-Goals; one prototype map of 25–30 fields only.
- **Multiplayer (hotseat or network campaigns)** — Why parked: PRD §Non-Goals; solo vs AI only.
- **Mobile / touch support** — Why parked: PRD §Non-Goals; desktop browsers only.
- **Oil and food resources + army upkeep** — Why parked: cut during shaping (FR-002 Socratic resolution); returns in the full version together with aviation.
- **Pre-battle odds preview, damaged unit state, chaos-after-capture rule, escalating supply penalties** — Why parked: cut during shaping's Socratic round; binary units, no preview, flat penalty are the locked simpler forms.

## Milestone History

(Empty — this is the first milestone.)

## Done

- **F-01: (foundation) game reads the prototype map and balance data from data files** — Archived 2026-08-31 → `context/archive/2026-08-31-game-data-contract/`. Lesson: —.
- **S-01: start a new game (picking own and AI country) and see the board-game map** — Archived 2026-09-01 → `context/archive/2026-08-31-new-game-map-view/`. Lesson: —.
- **S-02: user can combine units into armies (max 8) moving as a single token, move armies between connected fields within movement points (slowest unit sets pace, terrain changes cost), and click cities/armies to inspect their details** — Archived 2026-09-01 → `context/archive/2026-09-01-army-movement/`. Lesson: —.
