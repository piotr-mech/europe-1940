# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Bare catch backstops must not mask developer errors

- **Context**: src/lib/game-state.ts reducer backstops (`moveArmy`/`orderUnit`/`attackArmy`) and the GameScreen UI derivations (`computeReach`/`computeAttackTargets`), from the resources-production (S-03) and battle-city-capture (S-04) implementation reviews
- **Problem**: A bare `catch {}` backstop silently swallows every error, including developer mistakes such as a mistyped import (ReferenceError) — which surfaces as a silently dead button instead of a visible failure.
- **Rule**: Every backstop over a `src/lib` domain function must filter with `isDomainError` (exported from `src/lib/game-state.ts`) and rethrow ReferenceError/TypeError/SyntaxError — never a bare `catch {}`.
- **Applies to**: reducer cases in `src/lib/game-state.ts`, UI derivations wrapping domain functions in `src/components/game/`, and any future try/catch backstop over `src/lib` modules.
