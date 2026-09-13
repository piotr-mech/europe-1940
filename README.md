# EUROPE 1940

A turn-based, board-game-style strategy game (solo vs a rule-based AI) running in the browser.
No accounts, no setup — anyone with the URL plays, and a campaign survives a page refresh.

## Tech Stack

- [Astro](https://astro.build/) v6 — server-first rendering
- [React](https://react.dev/) v19 — the interactive game board island
- [TypeScript](https://www.typescriptlang.org/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Cloudflare Workers](https://workers.cloudflare.com/) — deployment runtime
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) — unit/integration and E2E tests

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/piotr-mech/europe-1940.git
cd europe-1940
```

2. Install dependencies and start the dev server (no secrets needed — the game has no backend):

```bash
npm install
npm run dev
```

## Available Scripts

- `npm run dev` — start development server (Cloudflare workerd runtime)
- `npm run build` — build for production
- `npm run preview` — preview production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier
- `npm test` — unit + integration tests (Vitest)
- `npm run test:e2e` — browser E2E tests (Playwright; starts the dev server itself)

## Project Structure

```md
.
├── src/
│ ├── components/game/ # Game UI (React island + board map, panels, popups)
│ ├── lib/ # Game rules engine, persistence, services
│ ├── data/ # Map, countries, terrain, unit datasets
│ ├── layouts/ # Astro layouts
│ └── pages/ # Astro pages (/ landing, /game board)
├── e2e/ # Playwright E2E specs
├── context/ # 10xWorkflow docs (PRD, test plan, lessons, archive)
└── wrangler.jsonc # Cloudflare Workers config
```

## Game state & persistence

The whole campaign lives client-side: every state transition is autosaved to `localStorage`
under a versioned envelope, and entering `/game` resumes the saved campaign (PRD FR-014).
A save that cannot persist is surfaced as a warning banner — never silently swallowed.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

```bash
npm run build
npx wrangler deploy
```

No secrets are required for the build or the runtime.

## CI

GitHub Actions runs lint + tests + E2E + build on every push and PR to `main`.

## License

MIT
