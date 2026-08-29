---
project: "EUROPE 1940"
researched_at: 2026-08-29
recommended_platform: Cloudflare Workers (static assets)
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 SSR (@astrojs/cloudflare@13.5.0, wrangler@4.127.1, astro@6.4.8)
  runtime: Cloudflare Workers (workerd, nodejs_compat)
---

## Recommendation

**Deploy on Cloudflare Workers with static assets.**

The project's starter already ships the native Cloudflare path: `@astrojs/cloudflare` adapter, `wrangler.jsonc` in the Workers static-assets shape, observability enabled — zero migration work. At the project's scale (single-digit users, stateless SSR) the free tier (100k requests/day, free static assets) means $0/month, satisfying the top-weighted interview answer (minimize cost). Cloudflare was also the only candidate scoring Pass on all five agent-friendly criteria with everything GA (wrangler CLI, llms-full.txt docs, official MCP server) and offers co-located free services (D1/R2/KV) matching the co-location preference.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP | Cost at 10k-100k req/mo | Astro adapter |
|---|---|---|---|---|---|---|---|
| Cloudflare | Pass | Pass | Pass | Pass | Pass (GA) | $0 | native (in repo) |
| Netlify | Pass | Pass | Pass | Pass | Pass (GA) | $0 (credit model) | swap to @astrojs/netlify |
| Vercel | Pass | Pass | Pass | Pass | Partial (public beta) | $0 (non-commercial only) | swap to @astrojs/vercel |
| Fly.io | Pass | Pass | Pass | Pass | Partial (experimental) | ~$2-3/mo (no free tier) | swap to @astrojs/node + Dockerfile |
| Railway | Pass | Partial (no dedicated rollback) | Pass | Partial | Pass (GA) | $5/mo minimum | swap to @astrojs/node |
| Render | Pass | Pass | Pass | Pass | Partial (experimental) | $0 w/ cold starts or $7/mo | swap to @astrojs/node |

Research date for all findings: 2026-08-29. Key per-platform notes:

- **Cloudflare**: Workers is the recommended path for new projects (Pages in maintenance); free tier = 100k req/day, 10 ms CPU, 3 MB bundle (10 MB paid); static assets free and not counted as requests; D1 5M reads/day, R2 10 GB, KV 100k reads/day all free.
- **Netlify**: credit-based billing since 2025-09 (300 credits/mo free; SSR browser game ≈ 25-50 credits); exhausting credits pauses ALL projects until cycle end; free serverless Postgres (GA 2026-04) + Blobs ~100 GB free; atomic rollback.
- **Vercel**: Hobby plan restricted to non-commercial use; Postgres/KV retired (migrate to Neon/Upstash), Blob 1 GB free; MCP public beta since 2025-08.
- **Fly.io**: free tier removed 2024-10; smallest machine ≈ $2/mo; Managed Postgres from $38/mo (overkill); 256 MB RAM tight for Astro builds (use remote builder); MCP experimental.
- **Railway**: usage billed per second for always-on RAM/CPU, not requests → $5/mo Hobby minimum regardless of traffic; Nixpacks deprecated in favor of Railpack; Node idle ~400 MB RAM; no dedicated rollback command.
- **Render**: free tier spins down after 15 min idle (~1 min cold start with loading page); free Postgres expires after 30 days.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Won on: native runtime already configured in the repo (no adapter swap), $0 at target scale with the most generous free limits (per-day, not per-month), all five criteria Pass with GA status across the critical path, co-located free services if the game ever needs server state, best-in-class agent docs (llms-full.txt) plus an official GA MCP server.

#### 2. Netlify

Scored second: equally strong agent story (GA MCP, llms.txt, atomic rollback) and $0 at this scale, plus a genuinely free co-located Postgres. Gaps vs Cloudflare: credit-based billing pauses all projects on exhaustion, smaller per-month (not per-day) allowance, and requires swapping the Astro adapter away from the already-configured one.

#### 3. Vercel

Scored third: excellent DX and CLI, $0 on Hobby — but Hobby is limited to non-commercial use, MCP is in public beta, and co-location weakened (Postgres/KV retired; only Blob remains). Chosen over Fly/Railway/Render because those either cost money at zero traffic (Railway $5/mo, Fly ~$2/mo) or degrade UX (Render cold starts).

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Known Astro middleware bug with `compatibility_date >= 2025-09-15` + `nodejs_compat` (SSR returns `[object Object]`, astro#14511); workaround is pinning an older date — the repo's date (2026-05-08) is above the threshold and currently works on astro@6.4.8, but a careless date bump during debugging can regress.
2. Free plan: 10 ms CPU per request — headroom is fine for a light SSR game but not unbounded.
3. 3 MB bundle limit (free tier) — React 19 + Astro SSR fits, but dependencies can push past it unnoticed until deploy.
4. Pages→Workers transition noise: much internet guidance still describes Pages, which is in maintenance — misleading during debugging.
5. Partial Node API compatibility in workerd: a dependency using an exotic Node API can pass local dev yet fail in production (or vice versa).

### Pre-Mortem — How This Could Fail

The team deployed the game on Cloudflare Workers and it worked for weeks — static assets from the CDN, SSR inside the free CPU budget. Then a dependency update: someone raised `compatibility_date` while debugging, and Astro's middleware started returning `[object Object]` in production; nobody connected the date to the regression because the local dev server still worked. The same week, a balance-calculation library added an `fs` dependency that was never exercised locally and crashed the production runtime. Friends reported the game "loading forever"; there were no alerts because observability was never configured and `wrangler tail` was only run reactively. Diagnosis burned an evening; the after-hours project lost two weeks to runtime debugging instead of the game. Success depended on three things nobody wrote down: pinning the compatibility date, verifying a production deploy before sharing the URL, and checking workerd limits whenever a dependency is added.

### Unknown Unknowns

- `wrangler.jsonc` `name` is still `10x-astro-starter` — rename to `europe-1940` before first deploy (it becomes the workers.dev subdomain).
- The adapter auto-creates a KV namespace for Astro sessions on deploy; deleting it in the dashboard silently breaks sessions.
- Workers free plan allows 50 subrequests per request — irrelevant today (no Supabase calls from SSR), relevant the moment anything server-side is added.
- The free `*.workers.dev` subdomain is occasionally throttled in corporate networks; a custom domain on Cloudflare DNS costs $0 extra beyond domain registration.
- Observatory/observability is already enabled in `wrangler.jsonc` (`observability.enabled: true`) — use it from day one rather than installing extra tooling.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` creates an independent version URL for testing before promotion; wrangler preview URLs are protected by default. GitHub-integrated preview builds are not configured in this repo (no CI deploy step yet) — that is M1L5+ / future work.
- **Secrets**: `npx wrangler secret put <NAME>` stores server-only secrets in the Workers vault (Astro env schema declares `SUPABASE_URL`/`SUPABASE_KEY` optional, server-only). The game itself needs none. Rotation = put again; no dashboard required.
- **Rollback**: `npx wrangler rollback` (or `wrangler deployments list` → pick) — seconds, no rebuild; game state lives client-side so there is no server data caveat.
- **Approval**: publishing to production (`wrangler deploy`) and secret changes are human actions; an agent may run `wrangler versions upload` (preview) and read-only commands unattended.
- **Logs**: `npx wrangler tail` for live logs; Workers observability (already enabled) retains logs queryable via dashboard/API without extra setup.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Astro middleware bug at `compatibility_date >= 2025-09-15` + `nodejs_compat` regresses after a date bump | Devil's advocate | L | H | Add a comment in `wrangler.jsonc` warning against date bumps; verify SSR renders after any wrangler/astro upgrade |
| Dependency using unsupported Node API passes local dev, fails in workerd | Devil's advocate / Pre-mortem | M | M | Smoke-test a production deploy (`wrangler versions upload` + visit URL) before sharing with friends; check `nodejs_compat` coverage when adding deps |
| Free-tier limits (10 ms CPU, 3 MB bundle, 50 subrequests) exceeded as game grows | Devil's advocate | L | M | Bundle size visible at deploy; keep game logic in static assets (client-side) so SSR stays minimal |
| Accidental deletion of the auto-created KV session namespace | Unknown unknowns | L | M | Do not hand-manage Cloudflare resources in the dashboard; all changes via wrangler |
| Pages vs Workers doc confusion wastes debugging time | Devil's advocate | M | L | This file records the decision: Workers with static assets; ignore Pages guidance |
| No alerts when production breaks | Pre-mortem | M | M | Observability already enabled in wrangler.jsonc; check Workers dashboards after each deploy |

## Getting Started

Validated against the exact versions in this repo (`@astrojs/cloudflare@13.5.0`, `wrangler@4.127.1`, `astro@6.4.8` — the dev server `npm run dev` already runs the workerd runtime locally, so no separate platform-native dev command is needed):

1. Rename the worker in `wrangler.jsonc`: `"name": "10x-astro-starter"` → `"name": "europe-1940"` (becomes `europe-1940.<account>.workers.dev`).
2. Authenticate once: `npx wrangler login` (opens browser; interactive — run it yourself).
3. Deploy to production: `npm run build && npx wrangler deploy`.
4. Verify before sharing the URL: open the deployed URL, confirm the page renders (not `[object Object]`) and check `npx wrangler tail` while loading.
5. Later (optional): custom domain via Cloudflare DNS on the same account, $0 transfer.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (GitHub Actions deploy-on-merge is a separate, future step)
- Production-scale architecture (multi-region, HA, DR)
