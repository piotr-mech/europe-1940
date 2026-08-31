# Game Data Contract Implementation Plan

## Overview

F-01 introduces the canonical game dataset: the prototype map graph (29 fields — 12 cities + 17 terrain fields — with symmetric connections and SVG coordinates), unit types, city statistics, terrain effects, and country definitions, all as typed TS files under `src/data/`, guarded by a validation module and vitest invariant tests. Every downstream slice (S-01 … S-08) reads this single dataset through one accessor. Draft balance values come from the game spec (`europe_1940_specyfikacja.md`), adapted to PRD decisions; coordinates come from the user-supplied CSVs in `game_data/`.

## Current State Analysis

- No game code exists in `src/` — the repo is the Astro 6 scaffold (auth pages/islands only). No `src/types.ts`, no JSON/data imports, no test runner (only `lint` / `format` scripts).
- `game_data/regiony.csv` + `game_data/miasta_regionow.csv` cover **all of Europe** (~93 regions) with SVG coordinates on a 1800×1200 canvas (semicolon-separated, UTF-8 BOM). They contain neither connections, nor terrain, nor balance stats, and miss several prototype cities (Poznań, Królewiec, Smoleńsk).
- The game spec (`europe_1940_specyfikacja.md`) supplies draft values: unit stats (§9), production costs (§17), city income examples (§7), terrain kinds (§4), prototype city list (§31), data model sketch (§33).
- PRD overrides the spec where they conflict: **3 resources** (money, steel, recruits — no oil/food, FR-002), **binary units** (no damaged state, FR-008), **no odds preview**, no aviation/navy/generals.
- `docs/reference/contract-surfaces.md` does not exist yet; this change creates it.
- Alias `@/*` → `./src/*` (tsconfig.json:9-11); islands import via this alias; Vite bundles TS data imports natively.

## Desired End State

The game has one version-controlled, typed dataset that fully describes the prototype scenario: 29 connected fields with owners, 4 unit types with costs and stats, 12 cities with income and production slots, 4 terrain types with movement/combat effects, and 2 countries with colors and national bonuses. A single accessor (`getGameData()`) validates the dataset on first use and returns it; vitest tests fail on any invariant violation (asymmetric connection, disconnected graph, duplicate id, missing city stats). The dataset's public names are registered in `docs/reference/contract-surfaces.md`. Verified by: `npm test`, `npm run lint`, `npm run build`, plus a human review of the map graph and draft stats.

### Key Discoveries:

- `game_data/*.csv` are semicolon-delimited with a UTF-8 BOM — relevant when extracting coordinates during implementation (not parsed by the app).
- 9 of 12 prototype cities have exact SVG coordinates in the CSVs; Królewiec, Poznań, Smoleńsk must be derived by linear interpolation between CSV anchors (lon/lat is monotone in SVG x/y across this region — good enough for draft placement, visually verified in S-01).
- The repo has no test runner; vitest will be the first, configured with the `@` alias so tests import data exactly like the future game islands will.

## What We're NOT Doing

- No UI, no rendering, no map view — S-01 renders the dataset.
- No combat math, movement resolution, or supply evaluation — later slices consume the data.
- No runtime game state (armies, resources, production queues, turn counters) — only static scenario data plus `initialOwner` per field.
- No CSV parsing in the app or build pipeline — CSVs are reference material; the final balance CSV swap is a future data edit (or a follow-up script) inside the same TS contract.
- No i18n layer — Polish display names only, English ids.
- No oil/food resources, no damaged-unit state, no port field type, no aviation/navy/generals data.

## Implementation Approach

Typed TS data modules in `src/data/` (countries, terrain, units, map), domain types in `src/types.ts`, and a validating accessor in `src/lib/game-data.ts` (the repo's convention: services/helpers in `src/lib/`). Vitest guards invariants that types cannot express (graph symmetry/connectivity, value ranges). The map graph below is the designed deliverable for human review — it follows the spec's main corridor (Berlin–Poznań–Warszawa–Brześć–Mińsk–Smoleńsk–Moskwa) plus northern (Gdańsk–Królewiec–Wilno) and southern (Kraków–Karpaty–Kijów) branches.

## Critical Implementation Details

- **CSV extraction gotcha**: `game_data/*.csv` are semicolon-delimited and start with a UTF-8 BOM — strip the BOM before matching headers when reading coordinates during implementation.
- **State sequencing**: `map.ts` must be authored with symmetric connections in one pass (each edge listed on both fields) — the validator in Phase 3 will hard-fail on any asymmetry, so authoring order matters for a clean first test run.

## Phase 1: Data contract foundations (types + test runner + countries/terrain)

### Overview

Establish the typed contract everything else fills in: domain types, vitest, and the two small stable datasets (countries, terrain effects).

### Changes Required:

#### 1. Game domain types

**File**: `src/types.ts` (new)

**Intent**: Define the shared types the dataset and all future game modules use.

**Contract**: exports `CountryId`, `TerrainType` (`'plains' | 'forest' | 'mountains' | 'river'`), `FieldType` (`'city' | TerrainType`), `ResourceId` (`'money' | 'steel' | 'recruits'`), `ResourceBag` (`Record<ResourceId, number>`), `Country`, `NationalBonus`, `CityData`, `MapField`, `UnitTypeId`, `UnitType`, `TerrainStats`, and `GameData` (the aggregate). Shape:

```ts
export interface MapField {
  id: string;              // kebab-case English, e.g. 'warsaw'
  name: string;            // Polish display name, e.g. 'Warszawa'
  type: FieldType;
  connections: string[];   // adjacent field ids; must be symmetric
  initialOwner: CountryId;
  x: number; y: number;    // SVG coords on the 1800x1200 canvas
  city: CityData | null;   // non-null iff type === 'city'
}

export interface UnitType {
  id: UnitTypeId;          // 'infantry' | 'tank' | 'artillery' | 'antiTank'
  name: string;
  attack: number;
  defense: number;
  movement: number;
  bonusVsTank: number | null; // antiTank only
  cost: ResourceBag;
  buildTime: number;       // turns
}
```

#### 2. Test runner

**File**: `package.json`, `vitest.config.ts` (new)

**Intent**: Add vitest as the repo's first test runner, wired to the `@` alias.

**Contract**: devDependency `vitest`; script `"test": "vitest run"`; `vitest.config.ts` resolves `@` → `./src/*` (node environment, include `src/**/*.test.ts`). Note: `eslint.config.js` runs strictTypeChecked + stylisticTypeChecked on all `*.ts` — keep test files fully typed (no `any`), import `describe`/`it`/`expect` from `'vitest'` (not globals).

#### 3. Countries dataset

**File**: `src/data/countries.ts` (new)

**Intent**: The two playable countries with map colors and national bonuses (spec §5).

**Contract**: `export const COUNTRIES = [...] as const satisfies readonly Country[]` — `germany` ('Niemcy', slate gray `#64748b`, bonus `blitzkrieg` — "Armored units get +1 movement"), `soviet` ('ZSRR', red `#b91c1c`, bonus `rezerwy` — "Infantry costs 2 fewer recruits"). `NationalBonus` is `{ id, name, description }`; effects are implemented by id in later slices.

#### 4. Terrain dataset

**File**: `src/data/terrain.ts` (new)

**Intent**: Terrain effects consumed by movement (S-02) and combat (S-04) as data, not code.

**Contract**: `export const TERRAIN: Record<TerrainType, TerrainStats>` — movement cost: plains 1, forest 1, mountains 2, river 1; combat draft values: forest `defenderBonus: 2`, mountains `defenderBonus: 4`, river `attackerPenalty: 3`, plains null/null.

#### 5. Smoke test

**File**: `src/data/countries.test.ts` (new)

**Intent**: Prove the runner, alias, and typing contract work end to end.

**Contract**: asserts `COUNTRIES` has exactly the two ids and unique colors.

### Success Criteria:

#### Automated Verification:

- `npm test` passes (smoke test green)
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Type shapes reviewed against this plan's contract (no runtime behavior to click through yet)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Prototype map graph + unit/city statistics

### Overview

Author the full dataset: the 29-field map graph (the game-design deliverable) and the draft balance values for units and cities.

### Changes Required:

#### 1. Map dataset

**File**: `src/data/map.ts` (new)

**Intent**: The prototype map as one graph — fields, connections, owners, coordinates, city stats.

**Contract**: `export const MAP_FIELDS = [...] as const satisfies readonly MapField[]`. The designed graph (coordinates: exact from CSV where available; derived/interpolated otherwise — mark derived ones with a `// derived` comment; final values may shift a few units at implementation):

| id | name (PL) | type | connections | initialOwner | x, y |
| --- | --- | --- | --- | --- | --- |
| berlin | Berlin | city | oder-plains, pomerania-plains | germany | 760, 695 |
| pomerania-plains | Nizina Pomorska | plains | berlin, gdansk, poznan | germany | 792, 662 |
| oder-plains | Równiny Odry | plains | berlin, poznan | germany | 789, 694 |
| poznan | Poznań | city | oder-plains, pomerania-plains, bzura-river | germany | 819, 693 (derived) |
| gdansk | Gdańsk | city | pomerania-plains, koenigsberg, vistula-river | germany | 842, 637 |
| koenigsberg | Królewiec | city | gdansk, mazury-forest | germany | 871, 612 (derived) |
| mazury-forest | Mazurskie Lasy | forest | koenigsberg, niemen-river | germany | 893, 621 |
| vistula-river | Rzeka Wisła | river | gdansk, warsaw | germany | 866, 664 |
| bzura-river | Rzeka Bzura | river | poznan, warsaw | germany | 854, 692 |
| warsaw | Warszawa | city | bzura-river, vistula-river, radom-plains, lublin-plains, bug-river | germany | 890, 691 |
| radom-plains | Równiny Radomskie | plains | warsaw, krakow | germany | 885, 722 |
| krakow | Kraków | city | radom-plains, carpathians-mountains | germany | 880, 753 |
| carpathians-mountains | Karpaty | mountains | krakow, volhynia-plains | germany | 904, 759 |
| lublin-plains | Wyżyna Lubelska | plains | warsaw, bug-river, volhynia-plains | germany | 912, 716 |
| bug-river | Rzeka Bug | river | warsaw, lublin-plains, brest | soviet | 913, 689 |
| brest | Brześć | city | bug-river, bialowieza-forest, polesie-forest | soviet | 935, 687 |
| vilnius | Wilno | city | niemen-river, minsk | soviet | 947, 610 |
| niemen-river | Rzeka Niemen | river | mazury-forest, vilnius | soviet | 924, 617 |
| minsk | Mińsk | city | vilnius, bialowieza-forest, orsha-plains, gomel-plains | soviet | 988, 623 |
| bialowieza-forest | Puszcza Białowieska | forest | brest, minsk | soviet | 962, 655 |
| polesie-forest | Puszcze Poleskie | forest | brest, kiev | soviet | 998, 695 |
| orsha-plains | Równiny Orszy | plains | minsk, smolensk | soviet | 1018, 600 |
| gomel-plains | Równiny Gomelskie | plains | minsk, smolensk, dniepr-river | soviet | 1008, 662 |
| smolensk | Smoleńsk | city | orsha-plains, gomel-plains, moscow-plains | soviet | 1049, 576 (derived) |
| moscow-plains | Równiny Moskiewskie | plains | smolensk, moscow | soviet | 1087, 550 |
| moscow | Moskwa | city | moscow-plains | soviet | 1125, 524 |
| kiev | Kijów | city | polesie-forest, volhynia-plains, dniepr-river | soviet | 1062, 704 |
| volhynia-plains | Wołyń | plains | carpathians-mountains, lublin-plains, kiev | soviet | 974, 731 |
| dniepr-river | Rzeka Dniepr | river | kiev, gomel-plains | soviet | 1035, 683 |

Design notes: 29 fields (12 cities + 17 terrain: 8 plains, 3 forests, 1 mountains, 5 rivers); the front line runs along the Bug (Germany holds 14 fields, USSR 15); Moscow is a single-approach terminus, thematically one road through Smoleńsk; city stats balance total starting income ~87 (DEU) vs ~82 (USSR) money.

City stats (`CityData` per city field; income = money/steel/recruits per turn):

| city | productionSlots | defenseBonus | money | steel | recruits |
| --- | --- | --- | --- | --- | --- |
| berlin | 3 | 3 | 30 | 20 | 12 |
| moscow | 3 | 4 | 35 | 15 | 15 |
| warsaw | 2 | 3 | 15 | 5 | 8 |
| kiev | 2 | 3 | 15 | 10 | 8 |
| krakow | 2 | 2 | 12 | 8 | 7 |
| gdansk | 2 | 2 | 12 | 6 | 6 |
| minsk | 2 | 2 | 10 | 5 | 6 |
| smolensk | 2 | 2 | 10 | 8 | 6 |
| poznan | 1 | 2 | 10 | 4 | 5 |
| koenigsberg | 1 | 3 | 8 | 6 | 4 |
| brest | 1 | 3 | 6 | 2 | 4 |
| vilnius | 1 | 1 | 6 | 2 | 4 |

#### 2. Unit types dataset

**File**: `src/data/units.ts` (new)

**Intent**: The four prototype unit types with draft stats (spec §9) and costs (spec §17), adapted to 3 resources.

**Contract**: `export const UNIT_TYPES = [...] as const satisfies readonly UnitType[]` — infantry ('Piechota': atk 3, def 5, mv 1, cost 20$/5 rec, build 1), tank ('Czołgi': atk 7, def 5, mv 2, cost 50$/20 st/10 rec, build 2), artillery ('Artyleria': atk 5, def 2, mv 1, cost 30$/15 st/5 rec, build 2), antiTank ('Działa przeciwpancerne': atk 3, def 4, mv 1, bonusVsTank 3, cost 25$/10 st/5 rec, build 1).

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- **Human game-design review**: the map graph (29 fields, connections, front line, terrain variety) and draft stats (units, cities) are what the author wants to play — this is the plan's core review gate

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Validation, accessor, and contract registry

### Overview

Make the dataset safe to consume: an invariant validator, a single accessor entry point, tests, and registry of load-bearing names.

### Changes Required:

#### 1. Validation + accessor

**File**: `src/lib/game-data.ts` (new)

**Intent**: One module every slice imports; validates invariants types cannot express and returns the aggregate dataset.

**Contract**: `export function validateGameData(data: GameData): string[]` returning violation messages (empty = valid) and `export function getGameData(): GameData` aggregating `COUNTRIES`, `TERRAIN`, `UNIT_TYPES`, `MAP_FIELDS`, validating once on first call and throwing with the message list on violation. Invariants: unique field/unit/country ids; every connection points to an existing id and is symmetric; the graph is connected (BFS/DFS from any field reaches all); field count in 25–30; every `type: 'city'` field has non-null `city` and vice versa; unit/city stat values are non-negative; `productionSlots` in 1–3; `initialOwner` is a known `CountryId`.

#### 2. Invariant tests

**File**: `src/lib/game-data.test.ts` (new)

**Intent**: Lock the contract so a typo in `map.ts` fails CI instead of breaking movement in S-02.

**Contract**: asserts `validateGameData(getGameData())` is empty; per-invariant failure cases using mutated copies of the real dataset (asymmetric connection, dangling id, removed edge breaking connectivity, duplicate id); smoke-asserts dataset shape (29 fields, 12 cities, 4 unit types, 2 countries).

#### 3. Contract surfaces registry

**File**: `docs/reference/contract-surfaces.md` (new)

**Intent**: Register the load-bearing names AGENTS.md points to.

**Contract**: a table listing `getGameData()`, `GameData`, `MapField`, `UnitType`, `CityData`, `CountryId`, `MAP_FIELDS`, `UNIT_TYPES`, `COUNTRIES`, `TERRAIN`, `src/types.ts`, `src/data/*`, `src/lib/game-data.ts` — each with its role and consumers (S-01 … S-08).

#### 4. Wire tests into CI

**File**: `.github/workflows/ci.yml`

**Intent**: Make the "fails CI, not S-02" guarantee real — the workflow currently runs lint + build only.

**Contract**: add a `- run: npm test` step after `npm run lint` (no env needed; data tests are pure Node).

### Success Criteria:

#### Automated Verification:

- `npm test` passes (invariants + mutation cases green)
- `npm run lint` passes
- `npm run build` passes
- CI workflow includes the `npm test` step

#### Manual Verification:

- Review `docs/reference/contract-surfaces.md` — the registered surfaces match what downstream slices will import

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Dataset invariants via `validateGameData` on the real dataset (see Phase 3).
- Mutation tests: each invariant violated in isolation must produce a specific message.

### Integration Tests:

- None — no runtime integration exists yet; S-01+ will exercise the dataset through real gameplay.

### Manual Testing Steps:

1. Review the map graph table (Phase 2) as the game's designer: field list, connections, terrain mix, front line.
2. Review draft stats for units and cities against the spec and personal balance intuition.
3. Confirm `docs/reference/contract-surfaces.md` matches the intended public surface.

## Performance Considerations

None — 29 static fields; validation is O(fields × connections) on a tiny graph, executed once per session.

## Migration Notes

When the final balance CSV arrives (resolved OQ-2), its values replace the draft numbers inside `src/data/units.ts` / `map.ts` — the TS contract, accessor, and tests stay untouched; invariant tests re-verify the new values automatically.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01 / game-data-contract)
- Product contract: `context/foundation/prd.md` (FR-001, FR-002, resource cuts)
- Game spec: `europe_1940_specyfikacja.md` (§4, §7, §9, §17, §31, §33)
- Coordinate source: `game_data/regiony.csv`, `game_data/miasta_regionow.csv`
- Progress format: `.agents/skills/10x-plan/references/progress-format.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data contract foundations (types + test runner + countries/terrain)

#### Automated

- [x] 1.1 `npm test` passes (smoke test green) — cc26098
- [x] 1.2 `npm run lint` passes — cc26098
- [x] 1.3 `npm run build` passes — cc26098

#### Manual

- [x] 1.4 Type shapes reviewed against the plan contract — cc26098

### Phase 2: Prototype map graph + unit/city statistics

#### Automated

- [x] 2.1 `npm test` passes — c7788e2
- [x] 2.2 `npm run lint` passes — c7788e2
- [x] 2.3 `npm run build` passes — c7788e2

#### Manual

- [x] 2.4 Human game-design review of map graph and draft stats — c7788e2

### Phase 3: Validation, accessor, and contract registry

#### Automated

- [x] 3.1 `npm test` passes (invariants + mutation cases)
- [x] 3.2 `npm run lint` passes
- [x] 3.3 `npm run build` passes
- [x] 3.5 CI workflow includes the `npm test` step

#### Manual

- [x] 3.4 Review of docs/reference/contract-surfaces.md
