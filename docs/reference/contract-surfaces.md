# Contract Surfaces

Registry of load-bearing names other code depends on. Renaming or reshaping
anything listed here is a breaking change — check consumers before touching it.

| Surface | Kind | Role | Consumers |
| --- | --- | --- | --- |
| `getGameData()` (`src/lib/game-data.ts`) | function | Single import surface: returns the validated canonical dataset, throws with all violations on broken data | All game slices (S-01 … S-08) |
| `validateGameData()` (`src/lib/game-data.ts`) | function | Checks dataset invariants (unique ids, symmetric connections, connectivity, 25–30 fields, city/stat completeness, value ranges); returns violation messages | `getGameData()`, tests, future balance-CSV swaps |
| `buildGameData()` (`src/lib/game-data.ts`) | function | Aggregates the `src/data/*` datasets into `GameData` | `getGameData()` |
| `GameData` (`src/types.ts`) | type | Aggregate: countries, terrain, unitTypes, fields | Every consumer of `getGameData()` |
| `MapField` / `CityData` (`src/types.ts`) | type | Map node + city stats shape | S-01 (map view), S-02 (movement), S-04 (capture), S-05 (supply) |
| `UnitType` / `UnitTypeId` (`src/types.ts`) | type | Unit stats shape + literal union | S-03 (production), S-04 (battle) |
| `Country` / `CountryId` (`src/types.ts`) | type | Country shape + literal union | S-01 (country choice), all ownership logic |
| `TerrainStats` / `TerrainType` (`src/types.ts`) | type | Terrain effects + literal union | S-02 (movement cost), S-04 (combat modifiers) |
| `ResourceBag` / `ResourceId` (`src/types.ts`) | type | money/steel/recruits amounts | S-03 (income/production) |
| `MAP_FIELDS` (`src/data/map.ts`) | data | 29-field prototype map graph (readonly, `as const satisfies`) | `buildGameData()`, `movement.ts`, `game-state.ts`, `production.ts` (engine modules + test suites import directly) |
| `UNIT_TYPES` (`src/data/units.ts`) | data | 4 unit types with draft stats | `buildGameData()`, `game-state.ts`, `production.ts` (engine modules + test suites import directly) |
| `COUNTRIES` (`src/data/countries.ts`) | data | Germany + USSR with colors and national bonuses | Via `buildGameData()` only |
| `TERRAIN` (`src/data/terrain.ts`) | data | Terrain effects for plains/forest/mountains/river | Via `buildGameData()` only |
| `armySpeed(army)` (`src/lib/movement.ts`) | function | Army pace = slowest unit's movement (FR-005); throws on empty army | `createInitialGameState`, `endTurn` reset, S-04 (battle), S-05 (supply penalty) |
| `movementCostOf(field)` (`src/lib/movement.ts`) | function | Field entry cost; cities are flat 1 (no "city" key in `TERRAIN`) | `reachableFields`, `applyMove`, S-04 |
| `reachableFields(state, armyId)` (`src/lib/movement.ts`) | function | Cheapest-path reachability within remaining movement; enemy-army fields impassable, own-army fields passable (merge targets within the 8-unit cap) | GameScreen (highlight set), `planMove`, S-06 (AI) |
| `planMove(state, armyId, targetFieldId)` (`src/lib/movement.ts`) | function | Cheapest path + cost, or null when out of reach | `applyMove`, S-06 (AI) |
| `applyMove(state, armyId, targetFieldId)` (`src/lib/movement.ts`) | function | Pure move application: cost, path walk, non-city ownership flips, ≤8-unit merge; throws on illegal moves | `gameReducer` (`moveArmy`), tests, S-06 (AI) |
| `Army.movementPoints` (`src/types.ts`) | field | Movement points left this turn; reset to `armySpeed` by `endTurn` | Movement engine, GameScreen/BoardMap (S-02 UI), DetailPanel (S-02 UI) |
| `GameAction` variants (`src/lib/game-state.ts`) | union | `moveArmy { armyId, targetFieldId }`, `orderUnit { fieldId, unitTypeId }` (player-only, try/catch backstop), `endTurn` — interaction actions dispatched by the GameScreen island | GameScreen (S-02/S-03 UI), DetailPanel ordering section (S-03 UI), S-06 (AI turn plumbing) |
| `ProductionOrder` (`src/types.ts`) | type | One queued city build: unit type + turns remaining; placed and paid at order time | Production engine (S-03), DetailPanel queue view (S-03 UI), S-08 (persistence) |
| `GameState.resources` (`src/types.ts`) | field | Treasury per country (money/steel/recruits); seeded with turn-1 income at game start | Production engine (S-03), resources HUD (S-03 UI), S-06 (AI production) |
| `GameState.productionQueues` (`src/types.ts`) | field | fieldId → queued builds; absent key = empty queue | Production engine (S-03), DetailPanel queue view (S-03 UI), S-08 (persistence) |
| `unitCostFor(countryId, typeId)` (`src/lib/production.ts`) | function | Unit cost with national bonuses applied (USSR "Rezerwy": infantry −2 recruits); the single source of truth for costs | `applyProductionOrder`, DetailPanel ordering UI (S-03), S-06 (AI) |
| `collectIncome(state)` (`src/lib/production.ts`) | function | Adds each country's owned-city income to its treasury (FR-002); pure | `createInitialGameState` (turn-1 seed), `endTurn`, tests |
| `freeProductionSlots(state, fieldId)` (`src/lib/production.ts`) | function | City slots minus queued builds; 0 for non-city fields; throws on unknown field | `applyProductionOrder`, DetailPanel ordering UI (S-03), S-06 (AI) |
| `applyProductionOrder(state, countryId, fieldId, typeId)` (`src/lib/production.ts`) | function | Pure order placement: upfront cost deduction + queue append; throws on non-city/not-owner/no-slot/cannot-afford | `gameReducer` (`orderUnit`), tests, S-06 (AI) |
| `advanceProduction(state)` (`src/lib/production.ts`) | function | Pure production tick: decrements queues, completes finished builds into a standing army in the city (8-unit cap) or a new deterministic-id army | `endTurn`, tests, S-06 (AI) |
| `DetailPanelProps.dispatch` (`src/components/game/DetailPanel.tsx`) | prop | Widened in S-03: the panel's ordering section dispatches `orderUnit` through GameScreen's reducer | GameScreen (sole call site) |
| `RESOURCE_LABELS` (`src/components/game/DetailPanel.tsx`) | const | Polish resource labels shared by the treasury HUD header and the panel's income rows | GameScreen (S-03 HUD), DetailPanel |
