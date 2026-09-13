---
change_id: testing-campaign-integrity
title: Campaign end-to-end integrity
status: archived
created: 2026-09-13
updated: 2026-09-13
archived_at: 2026-09-13T15:56:46Z
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Campaign end-to-end integrity".
Risk covered: #6 (turn-sequencing integrity breaks — endTurn phase order changes, player input is not blocked during AI replay, or victory detection (anchored to initial city ownership) or the frozen-state rule stops firing from one of its trigger paths).
Test types planned: integration.
Risk response intent:
- A scripted full cycle: endTurn applies income → production → supply in the mandated order; player input is blocked while the AI plan queue is non-empty; victory fires from every trigger path, freezes the reducer, and reset returns to setup.
- Challenge "each reducer branch works in isolation, so the sequence works" (mid-replay trap); victory counts by initial ownership, not current ownership.
- Avoid brittle order assumption without a spec citation.
After creating the folder, follow the downstream continuation rule.
