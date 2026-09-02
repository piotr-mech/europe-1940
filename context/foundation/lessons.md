# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Bare catch backstops must not mask developer errors

- **Context**: src/lib/game-state.ts:123-138 (`moveArmy`/`orderUnit` reducer backstops), resources-production (S-03) implementation review
- **Problem**: A bare `catch {}` backstop silently swallows every error, including developer mistakes such as a mistyped import (ReferenceError) — which surfaces as a silently dead button instead of a visible failure.
- **Rule**: <to be filled in>
- **Applies to**: <to be filled in>
