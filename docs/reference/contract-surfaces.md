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
| `MAP_FIELDS` (`src/data/map.ts`) | data | 29-field prototype map graph (readonly, `as const satisfies`) | Via `buildGameData()` only |
| `UNIT_TYPES` (`src/data/units.ts`) | data | 4 unit types with draft stats | Via `buildGameData()` only |
| `COUNTRIES` (`src/data/countries.ts`) | data | Germany + USSR with colors and national bonuses | Via `buildGameData()` only |
| `TERRAIN` (`src/data/terrain.ts`) | data | Terrain effects for plains/forest/mountains/river | Via `buildGameData()` only |
| `armySpeed(army)` (`src/lib/movement.ts`) | function | Army pace = slowest unit's movement (FR-005); throws on empty army | `createInitialGameState`, `endTurn` reset, S-04 (battle), S-05 (supply penalty) |
| `movementCostOf(field)` (`src/lib/movement.ts`) | function | Field entry cost; cities are flat 1 (no "city" key in `TERRAIN`) | `reachableFields`, `applyMove`, S-04 |
| `reachableFields(state, armyId)` (`src/lib/movement.ts`) | function | Cheapest-path reachability within remaining movement; enemy-army fields impassable, own-army fields passable (merge targets within the 8-unit cap) | GameScreen (highlight set), `planMove`, S-06 (AI) |
| `planMove(state, armyId, targetFieldId)` (`src/lib/movement.ts`) | function | Cheapest path + cost, or null when out of reach | `applyMove`, S-06 (AI) |
| `applyMove(state, armyId, targetFieldId)` (`src/lib/movement.ts`) | function | Pure move application: cost, path walk, non-city ownership flips, ≤8-unit merge; throws on illegal moves | `gameReducer` (`moveArmy`), tests, S-06 (AI) |
| `Army.movementPoints` (`src/types.ts`) | field | Movement points left this turn; reset to `armySpeed` by `endTurn` | Movement engine, GameScreen/BoardMap (S-02 UI), DetailPanel (S-02 UI) |
| `GameAction` variants (`src/lib/game-state.ts`) | union | `moveArmy { armyId, targetFieldId }`, `endTurn` — interaction actions dispatched by the GameScreen island | GameScreen (S-02 UI), S-06 (AI turn plumbing) |
