# Repository Guidelines

EUROPE 1940 — a turn-based, board-game-style strategy game (solo vs rule-based AI) running in the browser. Stack: Astro 6 SSR + React 19 islands + TypeScript + Tailwind 4 + Supabase (unused by the game) + Cloudflare Workers. Product contract: @context/foundation/prd.md.

## Hard rules

- The game has **no auth** — anyone with the URL plays (PRD Access Control). Do not extend the scaffold's auth flow (`src/middleware.ts`, `src/pages/auth/`, `src/pages/api/auth/`); treat it as removable reference code.
- Game state is client-side; a campaign must survive page refresh (PRD FR-014).
- Never modify anything under `context/archive/` (immutable 10xWorkflow trail).
- Every game rule must be explainable in one sentence — prefer simplifying over adding systems (PRD Non-Goals).

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (astro + tailwindcss plugins)
- Pre-commit (husky + lint-staged): `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`

## Structure & conventions

- `src/pages/` — Astro pages; API endpoints in `src/pages/api/` export uppercase `GET`/`POST` and validate input with zod.
- `src/components/` — Astro for static content/layout; React only for interactive islands (game board). `src/components/ui/` holds shadcn/ui (new-york). No Next.js directives.
- `src/lib/` — services/helpers (game rules engine belongs here); shared types in `src/types.ts`.
- `@/*` maps to `./src/*`. Merge Tailwind classes only via `cn()` from `@/lib/utils`.
- `supabase/migrations/` — naming `YYYYMMDDHHmmss_short_description.sql`; RLS required on new tables.
- `context/` — 10xWorkflow docs (PRD, tech-stack, shape-notes); consult before scoping changes.

## Environment & CI

- Node 22.14.0 (@.nvmrc). Secrets `SUPABASE_URL`/`SUPABASE_KEY` via `.env` / `.dev.vars` (gitignored) — see @README.md.
- CI (@.github/workflows/ci.yml): lint + build on push/PR to `main`; build step reads those secrets as repo secrets.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
