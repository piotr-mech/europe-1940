# Rule-Based AI Opponent Implementation Plan

## Overview

Implements roadmap slice **S-06 (ai-opponent)**, FR-012: ending the player's turn makes the AI act by rules — six priorities in strict order (defend a threatened city, rescue unsupplied armies, attack a weakly defended city, attack an important economic city, cut the enemy's supply, group armies before a strong target), targets scored by the spec §25 value formula, attacks gated by analytic win probability against the 40/60/80% thresholds (§27), and production in the 40/30/20/10 proportions with two situational adjustments (§29). Everything is deterministic (NFR: predictable, explainable; no unexplainable situations) and the AI's turn is replayed to the player step by step.

## Current State Analysis

Every primitive the AI needs already exists as a pure, tested function: `reachableFields`/`attackFields`/`applyMove` (`movement.ts`), `resolveBattle` with modifier-stacked strengths and reports (`battle.ts`), `isSupplied`/`movementAllowance` (`supply.ts`), `applyProductionOrder`/`freeProductionSlots`/`unitCostFor` (`production.ts`). `endTurn` (`game-state.ts`) already runs both countries' economy and resets movement. The reducer is pure with `rngSeed` in `GameState` — AI decisions derive from state alone; randomness stays only inside battles.

Presentation is the open gap: `lastBattleReport` is a single slot (AI battles would clobber the player's report) and the battle popup assumes the player attacks. Nothing today visualizes "what the AI just did".

### Key Discoveries:

- **Staged application makes replay trivial**: instead of the reducer applying the whole AI turn atomically and the UI faking animation over a final state, `endTurn` can *plan* the AI turn (`planAiTurn(state)`) into a pending queue in state, and a new `aiStep` reducer action applies one queued action per dispatch — the map genuinely steps forward, the reducer stays pure, and a mid-turn refresh (S-08) resumes naturally from the queue.
- Initial armies sit on capitals, so on turn 1 the AI's priorities resolve to production + grouping — a natural smoke scenario.
- The analytic win probability has clean boundaries to pin with tests: equal modified strengths → 50%, strength ratio ≥ 1.5 → 100% (the ±20% bands cannot cross), ratio ≤ 2/3 → 0%.
- `attackFields` already returns cost + path — the distance term of the §25 formula and one-step rescue moves come free.

## Desired End State

1. The player clicks "Koniec tury"; the AI turn executes as a visible sequence: each AI action (move, attack, free capture, order) appears on the map with a short pause (~0.5 s); AI-initiated battles open the same staged battle popup; at the end the panel summarizes what the AI did, until the player's next selection.
2. AI decisions follow the strict priority ladder (§26) with the §25 target-value mapping: `Σ city income + 10 if capital (Berlin/Moscow) + 15 if the capture cuts enemy supply − 2 × movement distance − modified defender strength` (all constants draft-balance).
3. The AI never attacks below a 40% analytic win probability; 40–60% only for above-median-value targets; ≥60% freely (§27). Win probability is computed analytically from the ±20% roll distribution (no sampling).
4. Unsupplied AI armies step one field toward their nearest own city (priority 2); when the best target is out of reach or too strong, nearby armies step toward it (priority 6, grouping-as-approach).
5. AI production follows 40/30/20/10 (infantry/tanks/artillery/anti-tank) with the two MVP adjustments — cities lost since the start shift the mix toward infantry, resource advantage toward tanks — within slots and treasury.
6. Battle reports are per-side (the player's slot is never overwritten by an AI battle); the whole turn is deterministic given the game state.
7. The AI turn resolves without perceptible waits (NFR): planning is instant at this map size; pacing pauses are presentation-only.

**Verification**: `npm test` (per-priority golden scenarios, threshold boundaries, analytic probability cases, production mix, full-turn integration), `npm run lint`, `npm run build`, and a manual run on `/game` watching a complete AI turn.

## What We're NOT Doing

- **AI difficulty levels / personalities** — one fixed rule set (prototype).
- **AI-side randomness in decisions** — deterministic from state only (battles keep their seeded rolls).
- **Coordinated multi-army offensives in a single turn** — grouping means stepping toward the target; the joint attack happens in a later turn when odds allow.
- **Full pathfinding for rescue/grouping** — greedy one-step moves per turn (each army: one action per turn).
- **Oil-based production adjustment** (§29) — oil is cut from the MVP (FR-002 resolution).
- **AI memory between turns** — stateless planning from the live map; "AI memory" in the roadmap's S-08 note reduces to ordinary game state.
- **AI targeting non-city fields except supply cuts** — priorities 3/4 target cities; priority 5 may target a cutting terrain field.
- **Fog of war, cheat detection, performance work** — nothing beyond the tiny-map reality.

## Implementation Approach

Engine-first in three phases. Phase 1 builds the whole decision engine headless (`ai.ts`): target scoring, analytic win probability, the strict priority ladder producing a deterministic action list, and production planning — pinned by golden scenario tests. Phase 2 integrates execution: `endTurn` stages the AI plan into a pending queue in `GameState`, a new `aiStep` action applies one queued action at a time through the existing engine functions, battle reports split into per-side slots, and the turn composes deterministically. Phase 3 adds the visible replay — timed `aiStep` dispatches, popup queue for AI battles, turn summary — closing with the manual gate.

## Critical Implementation Details

- **Staged application ordering**: `endTurn` runs economy (income → production tick) *then* plans the AI turn into the queue; each `aiStep` applies exactly one queued action (moves/attacks via `applyMove`/`resolveBattle` with the advancing seed; orders via `applyProductionOrder`); movement reset and `turn+1` land only when the queue empties (the player's next turn starts after the AI visibly finishes).
- **Input blocking during replay**: while the AI queue is non-empty, the UI must not offer moves/attacks/orders (guards or an overlay) — otherwise the player acts inside the AI's turn.
- **Per-side battle slots**: `lastBattleReport` becomes `Record<CountryId, BattleReport | null>`; the popup opens for the *viewer's relevant* battle (AI battles surface via the replay queue, the player's via their own attacks); the side-panel recap reads the player's slot.
- **Analytic probability**: with both rolls uniform in [0.8, 1.2], `P(attack·ra > defense·rd)` is a closed-form trapezoid integral — pin the three boundary cases in tests rather than trusting the derivation.

## Phase 1: AI decision engine (headless)

### Overview

The complete decision logic as pure functions in `src/lib/ai.ts` — no reducer, no UI, vitest only.

### Changes Required:

#### 1. Win probability

**File**: `src/lib/ai.ts` (new), `src/lib/ai.test.ts` (new)

**Intent**: The §27 attack gate needs an exact estimate, not a guess.

**Contract**: `aiWinProbability(attackStrength: number, defenseStrength: number): number` — closed-form P(A·ra > D·rd) for ra, rd ~ U[0.8, 1.2] (a tie holds for the defender, matching `resolveBattle`). Tests pin: A = D → 50%; A ≥ 1.5·D → 100%; A ≤ (2/3)·D → 0%; one mid case against brute-force simulation values.

#### 2. Target scoring

**File**: `src/lib/ai.ts`

**Intent**: The §25 value formula mapped to MVP data.

**Contract**: `cityTargetValue(state, aiCountry, fieldId): number` = Σ income (money+steel+recruits) + 10 if Berlin/Moscow + 15 if a hypothetical capture cuts at least one enemy army's supply (checked via `isSupplied` on the flipped ownership) − 2 × movement distance from the nearest AI army (from `attackFields`/`reachableFields` costs) − modified defender strength (via `defenderStrength`). Constants are named draft-balance consts.

#### 3. Priority ladder and plan

**File**: `src/lib/ai.ts`

**Intent**: §26 strict order: execute the best action of the highest priority that has a sensible action before moving down; one action per army per turn; armies processed in state order.

**Contract**: `planAiTurn(state): AiAction[]` where `AiAction = { kind: "move" | "attack"; armyId; targetFieldId } | { kind: "order"; fieldId; unitTypeId }`. The ladder:
1. **Defend**: an own city inside any enemy army's `attackFields` → move the strongest reachable AI army onto/reinforcing it (skip if already adequately garrisoned — draft threshold).
2. **Rescue**: each unsupplied AI army steps one field along the shortest passable path toward its nearest own city.
3. **Attack weakly defended city**: among reachable enemy-city attacks with P ≥ 0.6, execute the best by target value (one attack; further eligible armies fall through to lower priorities).
4. **Attack important city**: same but gate P ≥ 0.4 and require above-median target value.
5. **Cut supply**: a move (or attack) onto an enemy field whose ownership change makes ≥1 enemy army unsupplied; only when P ≥ 0.6 for attacks.
6. **Group**: if the best target's best attack P < 0.4, step remaining acted-free armies one field toward it.

Deterministic tie-breaking (field id then army id lexicographic).

#### 4. Production planning

**File**: `src/lib/ai.ts`

**Intent**: §29 proportions with the two MVP adjustments, in slots and treasury.

**Contract**: `planAiProduction(state): Extract<AiAction, { kind: "order" }>[]` — 40/30/20/10 rotation over unit types; +20pp shift to infantry when the AI owns fewer cities than at game start, +20pp to tanks when its treasury exceeds (draft) 2× its per-turn income; one order per free slot per city, affordability-filtered, cheapest-first on ties.

### Success Criteria:

#### Automated Verification:

- `npm test` — ai suite: probability boundaries; per-priority golden scenarios (each priority isolated by construction — threatened city → defense move; cut-off army → rescue step; weak city → attack; strong target → grouping steps; undefended city → free capture via move); threshold gates (0.39/0.41/0.61 behavior); production mix and adjustments; determinism (same state → identical plan)
- `npm run lint`
- `npm run build`

#### Manual Verification:

- None (headless phase)

---

## Phase 2: Turn integration and execution

### Overview

The staged `aiStep` machinery: `endTurn` plans, steps execute through the existing engine, reports split per side.

### Changes Required:

#### 1. State shape

**File**: `src/types.ts`, `src/lib/game-state.ts`

**Intent**: Carry the pending AI plan and per-side reports.

**Contract**: `GameState` gains `aiPlan: AiAction[]` (empty = no pending turn) and `aiTurnLog: AiTurnLogEntry[]` (what the AI did this turn, for the summary); `lastBattleReport: BattleReport | null` becomes `lastBattleReportByCountry: Record<CountryId, BattleReport | null>` (battle popups/reports route by the attacking side). Migration is trivial — nothing persists yet.

#### 2. Staged execution

**File**: `src/lib/game-state.ts`, `src/lib/game-state.test.ts`

**Intent**: The AI turn applies one action per dispatch; the turn rolls over when the queue empties.

**Contract**: `endTurn` = income → production tick → `aiPlan = planAiTurn(state)` + empty `aiTurnLog` (turn NOT yet incremented). New action `aiStep` pops the first queued action: move/attack applied via `applyMove`/`resolveBattle` (seed advanced, report written to the AI's slot, entry appended to `aiTurnLog`), order via `applyProductionOrder`; when the last action pops — movement allowance reset for all armies, `turn + 1`. Illegal actions (backstop semantics) are skipped, not fatal.

#### 3. Battle slot routing

**File**: `src/lib/battle.ts` (no change expected — reports already carry `attackerOwner`), `src/lib/game-state.ts`, `src/components/game/GameScreen.tsx` (player slot read)

**Intent**: The player's report survives AI battles.

**Contract**: the reducer writes each battle report to `lastBattleReportByCountry[attackerOwner]`; the player's popup/recap reads their own slot; the popup for AI battles is Phase 3's replay concern.

### Success Criteria:

#### Automated Verification:

- `npm test` — reducer suite: full AI turn from a fixed seed is deterministic; AI capture writes to the AI slot and leaves the player's untouched; `aiStep` sequence ends with turn+1 and movement reset; illegal queued action skipped
- `npm run lint`
- `npm run build`

#### Manual Verification:

- None (headless phase)

---

## Phase 3: Sequential replay UI

### Overview

The player watches the AI turn: timed steps, popup queue, turn summary — the manual gate.

### Changes Required:

#### 1. Replay driver

**File**: `src/components/game/GameScreen.tsx`

**Intent**: Drive `aiStep` on a timer while the queue is non-empty.

**Contract**: a `useEffect` interval (~500 ms) dispatches `aiStep` while `state.aiPlan.length > 0`; player interactions (selection, moves, attacks, orders, end turn) are blocked while the queue is non-empty; after the final step the log stays for the summary.

#### 2. AI battle popups

**File**: `src/components/game/GameScreen.tsx`, `src/components/game/BattlePopup.tsx` (if it needs a "skippable/queued" prop)

**Intent**: AI-initiated battles get the same staged popup, in order.

**Contract**: when an `aiStep` produced a battle (AI slot report changed), the popup opens for it and pauses the replay timer until it closes (the existing backdrop-click skip works); the replay resumes afterwards. Multiple battles queue sequentially.

#### 3. Turn summary

**File**: `src/components/game/DetailPanel.tsx`

**Intent**: The NFR's explainability for the whole turn.

**Contract**: while no other subject is selected and the log is non-empty, the panel lists this turn's AI actions (moves as "→ field", attacks with the report line, orders) in plain Polish; the next selection replaces it.

#### 4. Contract-surfaces registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Registry current per convention.

**Contract**: rows for `aiWinProbability`, `cityTargetValue`, `planAiTurn`, `planAiProduction`, `GameState.aiPlan`/`aiTurnLog`, `lastBattleReportByCountry`, the `aiStep` action.

### Success Criteria:

#### Automated Verification:

- `npm test`
- `npm run lint`
- `npm run build`

#### Manual Verification:

- Full AI turn on `/game`: click "Koniec tury" → AI actions appear one by one (~0.5 s apart); an AI attack opens the battle popup and the replay waits for it; input is blocked during the turn; after the last step the panel summarizes the AI's actions; the map state matches the summary; the player's own next turn works normally afterwards

**Implementation Note**: pause for manual confirmation after automated checks pass.

---

## Testing Strategy

### Unit Tests:

- Analytic probability boundaries and mid-case vs simulated values.
- Per-priority golden scenarios (isolated constructions per priority).
- Threshold gates (sub-40 no attack / 40–60 important-only / ≥60 free).
- Production mix, both adjustments, slot/treasury limits.
- Determinism: identical states produce identical plans.

### Integration Tests:

- Full `endTurn` + `aiStep` drain from fixed seeds: turn number, ownership changes, report slots, movement reset.
- AI acting under supply penalties (its own unsupplied armies move max 1 — priority 2 must respect the allowance).

### Manual Testing Steps:

1. Phase 3 gate (above).
2. Watch the AI rescue a cut-off army and lose the −25% marker after reconnecting (live S-05 verification).

## Performance Considerations

Planning is scoring over ≤29 fields and ≤ a handful of armies — microseconds; the only pacing is the deliberate ~0.5 s presentation pause (NFR: no long waits).

## Migration Notes

`lastBattleReport` → `lastBattleReportByCountry` is an in-memory shape change; no persisted state exists (S-08 later will persist the final shape including `aiPlan`/`aiTurnLog`).

## References

- Roadmap slice: `context/foundation/roadmap.md` S-06
- PRD: FR-012, NFRs (`context/foundation/prd.md:93, 104-108`)
- Spec: `europe_1940_specyfikacja.md` §24–29 (lines 740–876)
- Prior art: all engine modules (`src/lib/`), `context/archive/2026-09-02-battle-city-capture/`, `context/archive/2026-09-03-supply-lines/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: AI decision engine (headless)

#### Automated

- [x] 1.1 `npm test` — ai suite green (probability boundaries, per-priority golden scenarios, threshold gates, production mix + adjustments, determinism) — a84b64e
- [x] 1.2 `npm run lint` — a84b64e
- [x] 1.3 `npm run build` — a84b64e

### Phase 2: Turn integration and execution

#### Automated

- [x] 2.1 `npm test` — staged turn suite green (deterministic full turn, per-side report slots, aiStep drain ends with turn+1, illegal action skipped) — 71b87d0
- [x] 2.2 `npm run lint` — 71b87d0
- [x] 2.3 `npm run build` — 71b87d0

### Phase 3: Sequential replay UI

#### Automated

- [x] 3.1 `npm test` — 4f3f10f
- [x] 3.2 `npm run lint` — 4f3f10f
- [x] 3.3 `npm run build` — 4f3f10f

#### Manual

- [x] 3.4 Full AI turn on `/game`: sequential visible actions, popup queue, blocked input, panel summary, clean player turn afterwards — 4f3f10f
