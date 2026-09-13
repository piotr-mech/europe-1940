---
change_id: testing-regression-floor
title: Regression floor for battle & AI hot-spots (test-plan Phase 1)
status: implemented
created: 2026-09-09
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Regression floor for hot-spots".
Risks covered: #2 (AI behavior regression after threshold/priority changes; illegal planned actions silently swallowed), #3 (battle outcome drift after modifier changes; ownerless-field / mutual-annihilation hazard).
Test types planned: unit (characterization/golden).
Risk response intent:
- #2: prove golden priority scenarios stay green, plan determinism for a fixed seed, and illegal planned actions are observable, never silently swallowed; challenge "the AI took its turn, so the plan was valid"; avoid implementation-mirror assertions copied from the AI logic under test.
- #3: prove per-modifier strength consistency plus: after every battle resolution the field has exactly one owner (or is empty by rule), unit counts stay >= 0, and the seeded roll distribution stays in bounds; challenge "a side won, so the outcome is correct"; avoid snapshot-without-meaning and assertions interchangeable with the implementation.
After creating the folder, follow the downstream continuation rule.
