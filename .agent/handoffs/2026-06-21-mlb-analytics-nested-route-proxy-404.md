# Handoff: MLB-ANALYTICS nested routes 404 via smarter.poker (proxy gap)

**Date:** 2026-06-21
**Author:** Cowork (engine round-3 audit session)
**Severity:** High — a large share of the MLB-ANALYTICS app is unreachable on the public domain.
**Scope:** Smarter-Poker-World-Hub routing (NOT the engine). The engine is healthy.

## Symptom
Every **nested** (2+ path segment) route under `/hub/MLB-ANALYTICS/` returns the World
Hub 404 ("Page Not Found / Go to Hub") when hit via **https://smarter.poker**, while
single-segment routes work.

Verified 2026-06-21 ~22:05Z:
- 404 via smarter.poker: `/hub/MLB-ANALYTICS/props/backtest`, `/hub/MLB-ANALYTICS/team/147`
  (and by the same pattern: `/player/[id]`, `/game/[id]` — all detail pages).
- 200 via smarter.poker: `/hub/MLB-ANALYTICS/status`, `/hub/MLB-ANALYTICS/props`,
  and the other single-segment pages.
- **The engine itself serves the nested routes correctly.** Direct hit
  `https://mlb-analytics-engine.vercel.app/hub/MLB-ANALYTICS/props/backtest` renders fully
  (Total Graded 122,615, etc.). So this is purely a World-Hub→engine routing gap, not an
  engine bug.

## Root cause (diagnosis)
Nothing in the World Hub **repo** routes `/hub/MLB-ANALYTICS/*` to the engine:
- `vercel.json` `rewrites` only contains `/commander/*` and `/api/commander/*`.
- `next.config.js` `rewrites.beforeFiles` is an empty array.
- `middleware.ts` (line ~78) only does `NextResponse.next()` for `/hub/MLB-ANALYTICS`
  (marks it public for the geo-gate) — it does not proxy.

Therefore the working single-segment routing is configured at the **Vercel dashboard
level** (project path routing / domain config for `hub-vanguard`
`prj_op66GkZyZcygXQKm76iyycfVFAQx`), and that rule matches a single path segment after
`/hub/MLB-ANALYTICS` but not nested paths. Nested requests fall through to the World Hub
Next app, which has no such page → World Hub 404.

## Recommended fix (pick ONE; option A is repo-native and auditable)

**Option A — add a catch-all rewrite in the World Hub repo (preferred):**
In `next.config.js`, populate `rewrites.beforeFiles`:
```js
beforeFiles: [
  {
    source: '/hub/MLB-ANALYTICS/:path*',
    destination: 'https://mlb-analytics-engine.vercel.app/hub/MLB-ANALYTICS/:path*',
  },
],
```
`beforeFiles` runs before filesystem routing, so this supersedes the dashboard
single-segment rule and forwards ALL engine routes (incl. nested) to the engine.
Destination host `mlb-analytics-engine.vercel.app` is verified serving the engine with
its `/hub/MLB-ANALYTICS` basePath. Confirm that is the canonical engine production alias
before shipping (Vercel project `mlb-analytics-engine` = `prj_HkzCNe8TBAIkJHPS9By46GARaX0s`,
team `team_SVD8r7AOPH065G3usBxVvrBc`).

**Option B — fix the dashboard path route:** change the `hub-vanguard` path routing for
`/hub/MLB-ANALYTICS` from single-segment to recursive (`:path*`) so nested paths forward
to the engine.

## Deploy + verify (World Hub rules apply)
- Deploy ONLY via `bash scripts/git-safe-push.sh "fix: proxy nested MLB-ANALYTICS routes to engine"`
  (World Hub CLAUDE.md section 1.3 — never raw git / vercel deploy). Wait for
  `DEPLOY_VERIFIED:true`.
- Post-deploy, confirm these all render (HTTP 200, real content, NOT the "Go to Hub" 404)
  via **https://smarter.poker**:
  - `/hub/MLB-ANALYTICS/props/backtest`  -> "Total Graded 122,615"
  - `/hub/MLB-ANALYTICS/team/147`
  - `/hub/MLB-ANALYTICS/player/<any id>`
  - `/hub/MLB-ANALYTICS/game/<any gamePk>`
- Watch for a redirect/rewrite loop on the live primary domain during the first
  fire-cycle (there shouldn't be — engine host differs from smarter.poker — but verify).

## Context: why this surfaced now
The engine nav (`HubNav.tsx`) previously linked "Backtest" -> `/backtest`, which is a 404
on the engine itself (no such route). Round-3 fixed that link to point at the real route
`/props/backtest`. That link is correct and works engine-direct, but it (like every
player/game/team detail link) 404s on smarter.poker until this proxy gap is fixed.
No regression vs. before (the old link also 404'd via the proxy) — this handoff is to make
the whole nested-route surface reachable on the public domain.
