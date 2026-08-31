<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Game Data Contract Implementation Plan

- **Plan**: `context/changes/game-data-contract/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-31
- **Verdict**: SOUND (after fixes: SOUND)
- **Findings**: [0 critical] [1 warning] [2 observations]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

5/5 existing paths ✓ (package.json, tsconfig.json, .github/workflows/ci.yml, eslint.config.js, src/lib/); 3/3 symbols ✓ (`@/*` alias tsconfig.json:11, scripts, lint-staged); brief↔plan ✓. Map graph verified mechanically: 29 fields, symmetric connections, connected graph, 14:15 owner split.

## Findings

### F1 — Tests not wired into CI despite the plan promising CI protection

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots (promise gap)
- **Location**: Phase 3 — Testing Strategy / plan-brief
- **Detail**: Plan claims a connection-graph typo "must fail CI, not break movement in S-02", but `.github/workflows/ci.yml` runs only `npx astro sync` + `npm run lint` + `npm run build`; no phase adds an `npm test` step.
- **Fix**: Add a Phase 3 change item for `.github/workflows/ci.yml` (`- run: npm test` after `npm run lint`) + Automated success criterion + Progress row 3.5.
- **Decision**: FIXED — Fixed via single fix (Phase 3 item 4, success criterion, Progress 3.5).

### F2 — Ambiguous data-export type wording

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 item 3 / Phase 2 item 1
- **Detail**: "export const COUNTRIES: readonly Country[] typed `satisfies`" mixes a type annotation with the satisfies operator.
- **Fix**: Unify on `export const X = [...] as const satisfies readonly T[]` for COUNTRIES, MAP_FIELDS, UNIT_TYPES.
- **Decision**: FIXED — all three exports unified in the plan.

### F3 — Test files subject to strictTypeChecked ESLint

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — test runner
- **Detail**: eslint.config.js applies strictTypeChecked + stylisticTypeChecked with projectService to all `*.ts`; new `*.test.ts` and `vitest.config.ts` are linted by strict rules, and lint is both a phase gate and a pre-commit hook.
- **Fix**: Note in Phase 1: keep test files fully typed (no `any`), import `describe`/`it`/`expect` from `'vitest'` (not globals).
- **Decision**: FIXED — note added to the Phase 1 test-runner contract.
