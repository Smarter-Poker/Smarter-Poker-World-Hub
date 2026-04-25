# Phase 4.1 — Edge Runtime Audit (initial pass)

**Date:** 2026-04-25
**Repo:** Smarter-Poker-World-Hub (Next.js 14 Pages Router)
**Auditor:** Claude (Phase 4 ongoing optimization, Task #43)

## Tally

| Category | Count | % |
|---|---|---|
| Total API routes | 785 | 100% |
| Already on edge | 0 | 0% |
| **A. Safe to flip immediately** | **8** | **1%** |
| B. Needs review (likely flippable) | 351 | 45% |
| C. Keep on Node (Node-only API usage) | 426 | 54% |

The plan estimated 50-150 candidates. Initial pass found 8 hard-confirmed
safe routes plus 351 that need a 30s manual look each — most will likely
be flippable.

## Why Category A is small

The auto-classifier was conservative:
- Required ≤80 LOC AND
- `import { createClient } from '@supabase/supabase-js'` OR pure fetch OR
  Headers/Response/Request only

A route using `getSupabase` from `src/lib/supabaseServerClient` was
demoted to Category B because the wrapper file may pull in Node APIs
(it doesn't, but the audit didn't recurse into wrapper files).

Most of the 351 in B are "uses a thin wrapper around supabase-js" — those
are flippable once you confirm the wrapper itself is edge-clean.

## Top blockers across all 785 routes

```
   43  getSupabaseAdmin (admin client — uses service-role key)
   19  Buffer.from       (often base64 / file blobs — sometimes flippable)
    9  createHash        (crypto.createHash — has edge equivalent)
    6  rss-parser        (xml parsing lib — Node-only)
    5  fs                (filesystem)
    3  http/https        (use fetch instead)
    2  process.cwd       (no equivalent on edge)
    2  path              (no equivalent on edge)
    1  puppeteer         (definitive blocker)
```

`getSupabaseAdmin` (43) is the biggest blocker — these routes ALL use
the service-role key for elevated DB writes (audit logs, admin actions,
cron handlers, etc.). They're not appropriate for edge anyway because
they're privileged actions that should run with full Node observability.

## Category A — Safe to flip immediately (8 routes)

```
   53  pages/api/sandbox/custom-drill.js
   54  pages/api/video/analyze-wolfgang.js
   55  pages/api/sandbox/saved-hands.js
   63  pages/api/poker/engine/session-stats.js
   66  pages/api/messenger/gif-search.js
   68  pages/api/sandbox/social-export.js
   70  pages/api/sandbox/save-hand.js
   79  pages/api/youtube/report-embed-failure.js
```

**What they have in common:**
- Read-only or simple-write endpoints
- Use `createClient` from `@supabase/supabase-js` directly (anon key)
  OR pure `fetch()` to an external API (GIPHY, etc.)
- Import only `@sentry/nextjs` for error reporting (edge-compatible)
- Standard `req.method` / `req.query` / `res.status().json()` pattern

**Recommendation:** Flip in a single PR — add
`export const runtime = 'edge'` to each, run E2E suite, verify cold-start
metrics improve in Vercel analytics.

## Category B — Needs review (351 routes)

Auto-flagged because they're 80-150 LOC and don't trip the Node blocker
patterns. Most likely flippable after a quick manual confirm. Common
patterns to watch:

1. **Imports from `src/lib/supabaseServerClient`** — usually edge-safe
   (it's just `createClient(url, key)`), but verify each wrapper file.
2. **JSON response with `res.status(N).json(payload)`** — works on edge,
   returns directly via `Response` object.
3. **Async Supabase queries** — supabase-js supports edge. Just check no
   `getSupabaseAdmin` (service-role) is used.

**Recommendation:** Don't bulk-flip — sample 20 random routes, flip them
in waves of 10, watch Sentry + Vercel logs for regressions.

## Category C — Keep on Node (426 routes)

These hit at least one Node-only API or external lib that won't run on
edge. The biggest sub-categories:

1. **`getSupabaseAdmin` users (43)** — privileged DB ops. Keep on Node
   for full observability. These include all 31 cron handlers in
   `pages/api/cron/` (which are slated for the workers repo anyway).
2. **`Buffer.from` users (19)** — base64 / binary data manipulation.
   Some have edge equivalents (`atob`/`btoa`); most should stay on Node.
3. **`createHash` users (9)** — switch to `crypto.subtle.digest` for
   edge support. Small ports, but not a Phase 4 blocker.
4. **rss-parser, puppeteer, fs/path** — definitive Node blockers.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Flipped route returns 500 because Sentry init fails on edge | Low | Medium | @sentry/nextjs supports edge; verify with one Category A flip first |
| supabase-js timing out on edge | Very Low | Medium | Already supported in supabase-js 2.x; not regressed since 2024 |
| Auth middleware breaks on edge route | Low | High | World Hub middleware is in `middleware.ts` (also edge); should work uniformly |
| Edge cold start slower than Node for some routes | Very Low | Low | Edge cold starts are ~50ms vs Node ~500ms; this is the goal |

## Recommended next step

**Flip Category A in a single PR** — 8 routes, ~500 LOC total. Each gets
`export const runtime = 'edge'` added. Run Playwright E2E to verify no
regressions. Watch Vercel cold-start metrics for 48h. If clean, schedule
a Category B sampling pass.

**Out of scope for this audit:**
- Actual file flips (separate PR)
- Wrapper-file recursion to lift Category B candidates into A (manual)
- Node 18 → Node 20 audit (separate concern)

## Appendix: full Category A diff

```diff
# pages/api/sandbox/custom-drill.js (and 7 similar)
+export const runtime = 'edge';
+
 export default async function handler(req, res) { ... }
```

That's the entire mechanical change.

