---
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
---

## Why this stack

A solo developer shipping a browser board-game MVP in 3 after-hours weeks with no auth, payments, realtime, LLM features, or background jobs (the PRD explicitly rules out logins — anyone with the URL plays). The recommended default for `(web, js)` — Astro + React + TypeScript + Tailwind + Cloudflare — clears all four agent-friendly gates and provides an online URL for friends out of the box, matching the core guardrail "works in the browser for every friend with the link". TypeScript fits a rules-heavy turn-based game with many explicit state transitions (supply, combat modifiers, production queues). The starter's Supabase auth scaffold was removed outright (2026-09-14) — the game has no auth and no server state; game state lives with the player per FR-014. CI on GitHub Actions with auto-deploy-on-merge is the starter's standard shape.
