---
project: "EUROPE 1940"
context_type: greenfield
created: 2026-08-29
updated: 2026-08-29
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "Missing capability — the niche of a simple, moddable, self-built turn-based strategy game about Europe 1940 is empty"
    - topic: "multiplayer vs solo"
      decision: "Gameplay is solo in the MVP; sharing with friends means hosting the game online under a URL where they can play the same solo experience"
    - topic: "insight"
      decision: "Building the game is part of the pleasure — the project is a goal in itself, not just a product"
    - topic: "access model"
      decision: "No auth — anyone with the URL can play; flat user model, no roles"
    - topic: "mvp timeline"
      decision: "3 weeks of after-hours work; user judges it sufficient for the full MVP flow"
    - topic: "mvp scope"
      decision: "First prototype from the spec: Germany vs USSR, 25-30 fields, 4 unit types (infantry, tanks, artillery, anti-tank guns); no aviation, generals, navy, diplomacy, tech"
    - topic: "victory condition"
      decision: "Capturing ALL enemy cities ends the game (overrides the spec's key-cities variant)"
    - topic: "scenarios"
      decision: "One map in the MVP (prototype map); the 2000 scenario is a later addition"
  frs_drafted: 14
  quality_check_status: accepted
---

## Vision & Problem Statement

The pain is a missing capability: there is no simple, turn-based strategy game in the style of a board game about Europe in 1940 that the player can also shape. The person who feels it is the author himself — a player-designer who, when he wants to play such a game, finds existing titles either too complex or "not his" — closed products that cannot be interfered with. The cost today is playing other people's games with no influence on their design, or not playing at all.

The insight that makes this worth building: building the game is part of the pleasure. The project is a goal in itself — the author wants to play a game like this AND have real influence on how it looks and behaves. The niche of "simple, moddable, self-built Europe-1940 board-game-style strategy" is empty; existing titles are either AAA computer games or physical board games with no room for the player-designer. In the MVP the game is playable solo by the author, and is hosted online under a URL so friends can open it and play the same experience.

## User & Persona

Primary persona: the author himself — a player-designer. Context: wants to spend an evening playing a simple, turn-based, board-game-style strategy game set in Europe 1940; simultaneously wants ownership of the game's design so he can shape and evolve it. The moment he reaches for the product: when he wants to play "his" game and tweak its rules rather than consume someone else's closed product. Secondary audience: friends who receive a URL and play the same solo game — players only, not designers.

## Access Control

No authentication. Anyone with the URL can open the game and play. Flat user model — every visitor is a full player, no roles, no separation between players.

## Success Criteria

### Primary
- A complete game runs end-to-end: new game → country choice (player's and AI's) → turns against the AI (move units, choose city production, attack) → victory by capturing all enemy cities, or defeat when the AI captures all of the player's cities.
- The game is reachable online under a URL, playable by friends with no installation.

### Secondary
- Save / resume: a game in progress can be interrupted and continued later.

### Guardrails
- Works in the browser for every friend with the link — no installation required.
- Rules behave predictably — no unexplainable random situations.
- Game state survives a page refresh mid-game.
- The AI takes its turn without long waits.

## Functional Requirements

### Game setup & map
- FR-001: Player can start a new game on the prototype map (Germany-Poland-western USSR, 25-30 connected fields) and choose which country they play and which country the AI plays (Germany or USSR). Priority: must-have
  > Socrates: Counter-argument considered: "a fixed scenario (Germany vs USSR) gets boring fast — no side choice, no randomized starts." Resolution: originally kept fixed for the prototype; REVISED after shaping closed — the player picks their own country AND the AI's country at game start, from the prototype's two countries.

### Turn & resources
- FR-002: Game can add resources each turn from controlled cities (money, steel, recruits). Priority: must-have
  > Socrates: Counter-argument considered: "5 resource types break the 'understand in one sentence' rule — the prototype needs fewer." Resolution: cut to 3 resources in the MVP (money, steel, recruits); oil and food return in the full version together with aviation and army upkeep. Consequence: tanks do not consume oil for movement in the MVP.
- FR-003: Player can order unit production in owned cities (cost, build time, production slot limit per city). Priority: must-have
  > Socrates: Counter-argument considered: "production queue + slots is hidden complexity — instant purchase would do for the prototype." Resolution: kept in full — the production rhythm (1-2 turn build times) is important to the game's pacing.

### Armies & movement
- FR-004: Player can combine units into armies (max 8 units) that move as a single token. Priority: must-have
  > Socrates: Counter-argument considered: "grouping into armies is an intermediate layer — moving single units would be simpler, just more clicking." Resolution: kept — combining units into armies (max 8) stays; armies are the essence of the Warlords style and map readability.
- FR-005: Player can move an army between connected fields within its movement points (slowest unit sets the army's movement; terrain changes movement cost). Priority: must-have
  > Socrates: Counter-argument considered: "the slowest-unit rule punishes mixing unit types and leads to homogeneous armies." Resolution: stands as written — a simple rule, understandable in one sentence, forcing army-composition decisions.
- FR-006: Player can inspect city and army details (click opens a panel). Priority: must-have
  > Socrates: Counter-argument considered: "city/army panels are the UI of every other FR — duplicate cost with no separate testable value." Resolution: stands as written — data inspection is a separate, testable capability.

### Combat
- FR-007: Player can attack an enemy-occupied field by moving an army onto it — battle is automatic, with modifiers (terrain, city, artillery, unsupplied attacker/defender, river crossing). Priority: must-have
  > Socrates: Counter-argument considered: "automatic battles remove player agency — the game reduces to counting strengths." Resolution: kept — automatic battle is a deliberate "simple board game" choice, not a simulator.
- FR-008: Units are either fully operational or destroyed (removed) — no HP pools, no intermediate damaged state. Priority: must-have
  > Socrates: Counter-argument considered: "the damaged state is a hidden HP pool in disguise — simpler if a unit is alive or not." Resolution: accepted — damaged state cut; units are binary (operational / destroyed), more board-game-like.
  > Note: an earlier draft FR (pre-battle odds preview) was removed in this round — the player judges attacks from the forces visible on the map; no odds or strength preview is shown.

### Cities & supply
- FR-009: Game can change city ownership when its defenders are defeated; the new owner gains its resources from the next turn. Priority: must-have
  > Socrates: Counter-argument considered: "the 'chaos after capture' rule (50% production for one turn) is complexity without much value." Resolution: accepted — chaos rule cut; a captured city produces normally from the next turn.
- FR-010: Game can evaluate supply lines — an army is supplied when an unbroken chain of friendly fields connects it to a friendly city. Priority: must-have
  > Socrates: Counter-argument considered: "supply is the heaviest mechanic in the prototype — algorithmically and cognitively; the game works without it." Resolution: kept in full — cutting supply lines is one of the 4 mechanics the prototype exists to test (spec §32).
- FR-011: Game can apply a single flat penalty to unsupplied armies from the first unsupplied turn: movement max 1 and attack/defense -25%. Priority: must-have
  > Socrates: Counter-argument considered: "a three-step penalty table is hard to grasp — one flat penalty suffices for encirclement to matter." Resolution: accepted — escalating table cut; one flat penalty from the first unsupplied turn.

### AI & end of game
- FR-012: Player can end the turn — the AI then acts by rules (priorities: defend threatened city, rescue unsupplied armies, attack per odds thresholds, group armies before strong targets, production proportions adjusted to situation). Priority: must-have
  > Socrates: Counter-argument considered: "rule-based AI with 6 priorities is the single most expensive element — a dumbest-possible AI would still test whether the mechanics are fun." Resolution: kept — a stupid AI would spoil the fun-test; rule-based AI is not expensive.
- FR-013: Game can end with victory/defeat when one side controls all of the enemy's cities. Priority: must-have
  > Socrates: Counter-argument considered: "'all cities' means long, grinding endgames — key cities (Moscow/Leningrad/Stalingrad vs Berlin) would end games faster." Resolution: kept — a clean condition, understandable without explanation.

### Persistence
- FR-014: Player can save and resume a game in progress. Priority: must-have
  > Socrates: Counter-argument considered: "with 1-3h campaigns and the page-refresh guardrail, save/resume is effectively a must-have, not a bonus." Resolution: accepted — promoted to must-have.

Note: map readability (originally drafted as a separate FR) was resolved during the Socratic round to be a quality requirement, not a capability — it is captured under Non-Functional Requirements.

## Business Logic

An army is only fully effective when an unbroken path of its own side's fields connects it to one of its own cities — the opponent can win not by battle, but by cutting supply.

The rule consumes the geometry of the map from the player's point of view: the position of each army and the ownership of every field along the routes towards the player's cities. The game checks whether an unbroken path of friendly fields leads from the army to any friendly city.

When the rule is not satisfied — the path is cut — the army is unsupplied: its movement is limited to 1 and its attack and defense are reduced by 25%.

The player encounters the rule at the moment he sees an enemy approaching his supply route: the threat of being cut off, not the battle itself, is when the rule shapes his decisions.

## Non-Functional Requirements

- A new player understands the basic rules within minutes — the map and rules are readable without a manual (the project's most important assumption).
- A single campaign lasts 1-3 hours (measurable product promise).
- The AI resolves its turn without perceptibly long waits — the player never waits through multi-minute pauses.
- Game state survives a page refresh or tab close mid-game.
- The game remains usable on the latest two major versions of the mainstream desktop browsers.
- Map readability: the map reads as a board-game war map — cities as large points, connections as lines, armies as tokens with flag, unit count and dominant-type symbol. (Merged here from the Socratic round — quality property, not a capability.)

## Non-Goals

- No aviation, navy, generals, diplomacy or tech tree in the MVP — they come only after the 4 core mechanics prove fun.
- No additional maps in the MVP — no "year 2000" scenario, no full-Europe 80-120 field map; one prototype map of 25-30 fields only.
- No multiplayer — no hotseat, no shared network campaigns; every player plays solo against the AI.
- No mobile/touch support in the MVP — desktop browsers only.

## Open Questions

1. **Which side does the player control in the prototype (Germany or USSR), and which does the AI play?** — RESOLVED after shaping closed: the player chooses their own country and the AI's country at the start of each new game; any of the prototype's countries may be picked. Reflected in FR-001.
2. **Spec source of unit statistics and city income values for the prototype map** — RESOLVED after shaping closed: unit statistics and city parameters will be supplied by the user as a CSV file (final balancing values; the spec's examples are drafts). The game treats this file as the source of balance data at build time.

## Quality cross-check

Run on 2026-08-29. All elements present — no gaps: Access Control, Business Logic (one-sentence rule), project artifacts, timeline-cost acknowledgment (mvp_weeks: 3), Non-Goals (4 entries). Preserved behavior: n/a (greenfield). Status: accepted.

## User Stories

### US-01: Player plays a full turn and captures an enemy city

- **Given** a started game in which the player controls at least one city (producing resources) and one army
- **When** the player orders production in a city and moves an army onto a field occupied by the enemy
- **Then** the battle resolves automatically; on victory the city changes owner and produces for the player from the next turn

#### Acceptance Criteria
- No pre-battle odds or strength preview — the player judges from the forces visible on the map
- Battle outcome includes a small random element — the stronger side usually wins, but not always
- Units end the battle operational or destroyed (no intermediate damaged state)
- At end of turn, supply lines of all armies are evaluated
