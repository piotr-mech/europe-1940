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

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
