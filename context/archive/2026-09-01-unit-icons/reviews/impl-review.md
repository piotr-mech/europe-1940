<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Unit images on map tokens and in the detail panel

- **Plan**: `context/changes/unit-icons/plan.md`
- **Scope**: Phase 1 of 1 (commits c4138f0, c54420e)
- **Date**: 2026-09-01
- **Verdict**: APPROVED
- **Findings**: [0 critical] [0 warnings] [4 observations]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria evidence

- `npm test` — 41/41 pass. `npm run lint` — pass. `npm run build` — pass (re-run during review).
- Manual item 1.4 confirmed by the user in-session (token readability, interactions intact).
- Plan-vs-code sweep (agent): every planned item MATCH; plane1.png not shipped (Non-Goal guardrail respected); `src/lib/` and `src/types.ts` untouched; `DOMINANT_LETTER` fully removed (grep zero hits); webp sizes 10–16 KB.

## Findings

### F1 — Counter font size is small at full view

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/BoardMap.tsx:307-316
- **Detail**: `fontSize={7}` in SVG units renders ~4 px physically at full view — identical to the existing city labels, and the map has wheel zoom; a consistent pre-existing scale, not a regression of this change.
- **Fix**: None needed; revisit only if full-view readability becomes a complaint.
- **Decision**: SKIPPED (conscious trade-off, no action recommended)

### F2 — Token may overlap a neighbour's reach ring by ~3 px

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/BoardMap.tsx:252-270
- **Detail**: Worst-case adjacent fields (bug-river/brest, 22.1 units apart) produce ~3 px overlap of the token over the reach ring; draw order (rings under tokens) is the right choice.
- **Fix**: None.
- **Decision**: SKIPPED (conscious trade-off, no action recommended)

### F3 — Enlarged token creates a small click-capture zone near adjacent fields

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/BoardMap.tsx:143-157
- **Detail**: With `TOKEN_HIT_PADDING=3`, a click 1–2 px below brest's center can be captured by an army token on adjacent bug-river (tokens win the hit-test by design). Subtle and acceptable.
- **Fix**: None; documented trade-off ("tokens win over field circles").
- **Decision**: SKIPPED (conscious trade-off, no action recommended)

### F4 — Counter contrast depends on the owner color

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/game/BoardMap.tsx:313
- **Detail**: The white counter fill could contrast poorly over a light owner color (e.g. yellow). Both current country colors (slate/red) are fine; pre-existing style, not a regression.
- **Fix**: None; add a text shadow or darkening if a light country color is ever added.
- **Decision**: SKIPPED (conscious trade-off, no action recommended)
