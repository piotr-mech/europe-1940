---
change_id: testing-persistence-determinism
title: Persistence & determinism invariants
status: implemented
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Persistence & determinism invariants".
Risks covered: #4 (save/resume breaks as the state schema evolves — a drifted save can load as a subtly broken game), #5 (determinism is lost — wall-clock or unseeded randomness enters the reducer path, breaking AI replay after resume).
Test types planned: unit + integration + static rule.
Risk response intent:
- #4: prove save→load→save round-trips deep-equal; a save from any schema epoch either loads correctly or is cleanly discarded (never plays on as a subtly broken state); a finished game is never resurrected; storage failure degrades to no-persistence without crashing. Challenge "the type-guard accepted it, so the state is sane". Avoid round-trip happy path only.
- #5: prove a repository-wide invariant that no wall-clock/unseeded randomness reaches the reducer path; replay from a persisted seed reproduces the exact action sequence. Challenge "tests pass, so the code is deterministic". Avoid over-mocking internal RNG instead of proving real purity.
After creating the folder, follow the downstream continuation rule.
