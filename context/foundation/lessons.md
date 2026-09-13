# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Bare catch backstops must not mask developer errors

- **Context**: src/lib/game-state.ts reducer backstops (`moveArmy`/`orderUnit`/`attackArmy`) and the GameScreen UI derivations (`computeReach`/`computeAttackTargets`), from the resources-production (S-03) and battle-city-capture (S-04) implementation reviews
- **Problem**: A bare `catch {}` backstop silently swallows every error, including developer mistakes such as a mistyped import (ReferenceError) — which surfaces as a silently dead button instead of a visible failure.
- **Rule**: Every backstop over a `src/lib` domain function must filter with `isDomainError` (exported from `src/lib/game-state.ts`) and rethrow ReferenceError/TypeError/SyntaxError — never a bare `catch {}`.
- **Applies to**: reducer cases in `src/lib/game-state.ts`, UI derivations wrapping domain functions in `src/components/game/`, and any future try/catch backstop over `src/lib` modules.

## Environmental failures must be reported, not just survived

- **Context**: `saveGame()` in `src/lib/persistence.ts`, from the m3l5 swallowed-error sweep (change `autosave-failure-surfacing`)
- **Problem**: A `catch` that returns normally after an environmental failure (quota exceeded, blocked storage) makes the operation look successful — the player kept playing on an unsaved campaign and only a refresh revealed the loss. The game "surviving" the error is not the same as the failure being handled; a survived-but-silent failure is a swallowed error (OWASP A10:2025 class).
- **Rule**: A backstop may keep the game running, but its outcome must be observable: `saveGame` returns `"saved" | "failed"`, and the UI (GameScreen autosave banner) surfaces `"failed"` to the player. Survive AND report — never just survive.
- **Applies to**: persistence calls in `src/lib/persistence.ts` and any future side effect whose silent failure would cost player-visible data.
