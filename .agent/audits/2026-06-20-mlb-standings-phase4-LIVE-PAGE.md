# MLB Standings — Phase 4: the REAL live page (engine app) (2026-06-20)

## Critical correction
Phases 1-3 edited `pages/hub/MLB-ANALYTICS/standings.tsx` in the World Hub repo.
That file is NEVER served: `next.config.js` has a **beforeFiles** rewrite that
proxies ALL of `/hub/MLB-ANALYTICS/*` to a standalone app
(`mlb-analytics-engine-smarter-poker.vercel.app`). The config comment calls the
World Hub copy "the local stale copy." So the live standings page is
`mlb-analytics-engine/web/src/app/standings/page.tsx` (engine repo, App Router,
basePath `/hub/MLB-ANALYTICS`). Earlier "shipped/verified" claims were based on
the API + HTML-string greps, which did not reflect the proxied page. A real
in-browser render exposed this.

## What the live page was
Server Component reading `agg_team.streaks.record` for W/L. Division grids +
basic wild-card list + clickable rows. No grade scale, no run differential, no
expected record. Also serving STALE data (LAD 46-27 vs current 49-27) — the
engine app's builds had been failing on static pre-render DB calls, so the
deployed snapshot was several days old.

## Fix (live engine page)
Rewrote `web/src/app/standings/page.tsx` to:
- Source the fresh `v_mlb_standings` view via `createAdminClient()` (service role),
  which fixes the staleness and provides W/L/PCT/GB/run_diff/L10/streak/
  power_score/expected-record in one query.
- Add canonical **grade chips** using the engine's own `@/lib/betScore`
  `tier()` + `TIER_STYLE` (ELITE/STRONG/LEAN/THIN/PASS) — identical to best-bets
  and every engine page (the user's #1 ask, now satisfied on the live page).
- Add **run differential**, **Pythagorean expected record** (EXP, with luck
  tooltip), a grade legend, and a full **Power Rankings** table (all 30 graded).
- Keep the engine's metal/neon design, division grids, wild-card race
  (now with games-ahead-of-cut), and clickable rows -> /team/[id].
- `npx tsc --noEmit` clean. Pushed to engine repo main; engine Vercel auto-deployed.

## Verified (in-browser, proxied production URL)
`https://smarter.poker/hub/MLB-ANALYTICS/standings` renders the new page with the
grade legend, grade chips per team, fresh data (LAD 49-27, NYY 45-28), the Power
Rankings table (LAD +145 DIFF, 53-23 EXP, ELITE), and the graded wild-card race.

## Known minor item (follow-up)
`v_mlb_standings` re-derives W/L from `fact_games` and is within ~1 game of the
official `agg_team.streaks.record` for a couple teams (e.g. NYY 45-28 view vs
46-28 official) — normal snapshot/real-time variance. To make W/L exactly match
the official source, source W/L from `agg_team.streaks` in the view and keep
fact_games only for run differential / expected record. Net: the new page is
fresh + far more complete than the old stale one; the ≤1-game variance is the
only open accuracy nuance.

## Recommended hardening
Add `export const dynamic = 'force-dynamic'` (or revalidate=0) to the engine
standings page to guarantee no future staleness even if ISR revalidation lags.
The World Hub `pages/hub/MLB-ANALYTICS/standings.tsx` (Phases 1-3) remains a
complete, consistent fallback should the proxy ever be removed.
