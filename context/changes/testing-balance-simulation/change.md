---
change_id: testing-balance-simulation
title: Balance simulation harness (test-plan Phase 2)
status: impl_reviewed
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Open the change folder for rollout Phase 2 of context/foundation/test-plan.md: "Balance simulation harness".
Risk covered: #1 (game ships unbalanced — trivially easy, economy snowballs — and bores the player; the fun-test that is the product's sole purpose fails).
Test types planned: integration (in-process simulation).
Risk response intent:
- #1: seeded full-campaign simulations with independent oracles — in mirrored setups neither side wins 100% of runs; even-strength battles resolve ~50/50 across the seeded distribution; campaigns end within a sane turn band; challenge "symmetric data implies symmetric outcomes" (turn order may confer advantage); the oracle must come from the PRD (fun, 1–3h campaign), never from current implementation output; avoid thresholds lifted from current results and happy-path-only single-seed runs.
Folder created by /10x-research (mirroring /10x-new semantics) on the risks-to-verify brief for risk #1.
