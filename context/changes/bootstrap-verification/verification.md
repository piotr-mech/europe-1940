---
bootstrapped_at: 2026-08-29T12:00:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: europe-1940
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: europe-1940
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

## Why this stack

A solo developer shipping a browser board-game MVP in 3 after-hours weeks with no auth, payments, realtime, LLM features, or background jobs (the PRD explicitly rules out logins — anyone with the URL plays). The recommended default for `(web, js)` — Astro + React + TypeScript + Tailwind + Cloudflare — clears all four agent-friendly gates and provides an online URL for friends out of the box, matching the core guardrail "works in the browser for every friend with the link". TypeScript fits a rules-heavy turn-based game with many explicit state transitions (supply, combat modifiers, production queues). Supabase ships with the starter but is largely unused in the MVP — game state lives with the player per FR-014 — and remains a convenient extension point for later features. CI on GitHub Actions with auto-deploy-on-merge is the starter's standard shape.

## Pre-scaffold verification

| Signal             | Value                                             | Severity | Notes                                                     |
| ------------------ | ------------------------------------------------- | -------- | --------------------------------------------------------- |
| npm package        | not run                                           | n/a      | cmd_template starts with `git clone` — npm step skipped   |
| GitHub repo        | przeprogramowani/10x-astro-starter last pushed 2026-08-22 | fresh | from card.docs_url, via unauthenticated GitHub API (`gh` CLI not installed) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 entries (incl. node_modules, src, public, supabase, config files)
**Conflicts (.scaffold siblings)**: CLAUDE.md
**.gitignore handling**: moved silently (absent in cwd before run)
**.bootstrap-scaffold cleanup**: deleted
**Starter .git removal**: deleted before move-up (upstream history not inherited)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: 3 direct of 23 total (astro, supabase, wrangler are direct dependencies with advisories; the rest are transitive)

#### CRITICAL findings

- **tar** (range `<=7.5.20`) — transitive; fix available. Advisories: file smuggling via PAX size override on GNU long-name/long-link headers (GHSA-vmf3-w455-68vh), process crash via PAX numeric path type confusion (GHSA-w8wr-v893-vjvp), decompression/parse DoS via unlimited input (GHSA-23hp-3jrh-7fpw). Fix: `npm audit fix` or update the dependency chain pulling node-tar.

#### HIGH findings

- astro, brace-expansion, devalue, fast-uri, js-yaml, miniflare, nanoid, postcss, sharp, svgo, undici, vite — transitive advisories in the build/dev toolchain (dev-time exposure for most; not all ship to the Cloudflare runtime).

#### MODERATE findings

- @astrojs/language-server, @cloudflare/vite-plugin, supabase, volar-service-yaml, wrangler, yaml, yaml-language-server

#### LOW / INFO findings

- @babel/core, esbuild

## Hints recorded but not acted on

| Hint                       | Value               |
| -------------------------- | ------------------- |
| bootstrapper_confidence    | first-class         |
| quality_override           | false               |
| path_taken                 | standard            |
| self_check_answers         | null                |
| team_size                  | solo                |
| deployment_target          | cloudflare-pages    |
| ci_provider                | github-actions      |
| ci_default_flow            | auto-deploy-on-merge |
| has_auth                   | false               |
| has_payments               | false               |
| has_realtime               | false               |
| has_ai                     | false               |
| has_background_jobs        | false               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
