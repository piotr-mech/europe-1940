---
change_id: remove-auth-scaffold
title: Remove the starter's Supabase auth scaffold; game landing page
status: archived
created: 2026-09-14
updated: 2026-09-14
archived_at: 2026-09-14T20:00:00+02:00
---

## Notes

Retroactively registered (implemented ad-hoc from a direct user request before
this record existed — commit f7ea2a7).

The game has no auth by contract (PRD Access Control: anyone with the URL
plays), so the starter's auth flow was dead weight: middleware, /auth pages,
/api/auth endpoints, /dashboard, auth components, Banner/config-status (the
source of the "Uwaga: Supabase…" alert), the supabase/ config dir, the
@supabase deps, the astro:env schema and the CI build secrets. The build and
runtime now need no secrets at all — the game is fully client-side.

The homepage became the game's landing (slate/amber palette, tagline, CTA into
/game). AGENTS.md, README.md and context/foundation/tech-stack.md updated to
the new reality; the hard rule now records that the scaffold was removed and
auth must not be reintroduced without a PRD change.

Verification: astro sync + tsc + lint + full unit suite + E2E green; zero
supabase references left in src/; CTA navigation asserted; landing reviewed
visually.
