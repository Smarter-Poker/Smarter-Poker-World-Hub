# MLB Standings page — deep audit, regression fix, and upgrade (2026-06-20)

**Scope:** `https://smarter.poker/hub/MLB-ANALYTICS/standings`
**Author:** Cowork agent session
**Tier:** 3 (DB view + API + page + cross-DB wiring)

## TL;DR

The standings page was a non-functional stub in production: it always rendered
"STANDINGS UNAVAILABLE". Root cause was a **cross-database wiring regression** —
the `v_mlb_standings` view (and the `w/l/pct/gb` columns it depended on) were
created on the **wrong Supabase project** (PokerIQ-Production
`kuklfnapbkmacvwxktbh`) by the World-Hub migration
`supabase/migrations/20260618232000_mlb_standings.sql`, while the API
(`getMlbSupabase()`) reads from the **mlb-analytics-engine** project
`nscdmxldtyszyvcxxwgr`, where the view never existed. Even on the right DB the
design was a dead stub: it read static `w/l/pct/gb` columns on `dim_teams` that
defaulted to 0 and had no populating job.

Fixed by building a **live** `v_mlb_standings` view on the engine DB computed
from `fact_games`, rewiring the API to return the richer payload, and rebuilding
the page with division grouping, power rankings, run differential, streaks,
L10, home/away splits, and a **team grade that reuses the canonical
`src/lib/betScore.ts` `tier()` + `TIER_STYLE` scale** (ELITE/STRONG/LEAN/THIN/PASS)
used on every other MLB page.

## Context — what the page is supposed to do

Show live MLB standings for the current season. It sits in the MLB-ANALYTICS
section alongside Best Bets, Props, Teams, etc., all of which read the
mlb-analytics-engine Supabase project via `utils/supabase/mlb.ts`.

## Root cause

1. **Wrong-DB migration.** `v_mlb_standings` resolved to NULL on the engine DB
   (`to_regclass('public.v_mlb_standings') = null`) and `dim_teams` there has
   **no** `w/l/pct/gb` columns. The same objects DO exist on PokerIQ
   (`kuklfnapbkmacvwxktbh`) — 30 phantom rows, all zeros — because the
   World-Hub migrations target PokerIQ, not the engine DB. The MLB engine DB is
   managed by the separate `mlb-analytics-engine` repo's own
   `supabase/migrations/`.
2. **Stub-by-design.** The mis-targeted view selected manually-maintained
   `dim_teams.w/l/pct/gb` columns (DEFAULT 0) with no ingestion job — so it
   could only ever show zeros.
3. **Consequence in code.** `pages/api/mlb/standings.ts` did
   `.from('v_mlb_standings')` -> `.error` -> returned `{ teams: [] }` -> page
   showed "STANDINGS UNAVAILABLE". A true production regression, not a flaky
   read.

Additional latent data bug found while building the live view: some
`fact_games` rows have `final = true` with NULL scores; counting `COUNT(*)` as
the denominator (instead of `w + l`) understates PCT. The new view guards
`home_score IS NOT NULL AND away_score IS NOT NULL`.

## Resolution (immediate)

### Database (mlb-analytics-engine `nscdmxldtyszyvcxxwgr`)
- Created live `public.v_mlb_standings` computed from `fact_games` for the
  current season (`MAX(year) WHERE final`), 30 real clubs only
  (`division IS NOT NULL`). Columns: `w, l, pct, gb` (games behind division
  leader), `rs, ra, run_diff`, `home_w/l`, `away_w/l`, `l10_w/l`, `streak`
  (e.g. `W4`/`L2`), and `power_score` (0-100).
- `power_score` is a league-relative z-score of `q = 0.6*win_pct + 0.4*pythag`,
  mapped `score = 58 + 13*z` (clamped 1..99). The web app maps it onto the
  canonical `tier()` thresholds (82/68/52/38), so the grade scale is identical
  to BetScoreBadge everywhere.
- Applied via Supabase MCP `apply_migration` (name `mlb_standings_live_view`).
  Migration file saved at
  `mlb-analytics-engine/supabase/migrations/20260620120000_mlb_standings_live_view.sql`.
- Validation (2026-06-20): 30 teams, all 6 divisions; LAD 49-27 .645 GB 0.0
  diff +145 W4 grade 90 (ELITE); NYY leads AL East GB 0.0 grade 84; COL 29-47
  GB 20.0 grade 36 (PASS). W/L matches the engine's authoritative
  `agg_team.streaks.record` exactly (LAD 49-27 both sources), so Standings and
  Teams pages agree.

### Web Hub (`Smarter-Poker-World-Hub`)
- `pages/api/mlb/standings.ts` — selects the full view, returns
  `{ teams, season, updated }`, resilient empty fallback preserved, cache
  `s-maxage=300, swr=900`.
- `src/components/mlb/TeamGradeBadge.tsx` — NEW. Renders a team's `power_score`
  through the SAME `tier()` + `TIER_STYLE` as `BetScoreBadge`. Single source of
  truth for the grade scale.
- `pages/hub/MLB-ANALYTICS/standings.tsx` — rebuilt: By-Division and Power
  Rankings views, division leader highlight, team logos, W/L/PCT/GB/L10/STRK/
  run-diff/home/away columns, grade chip + legend, mobile-first responsive
  columns, season label, distinct loading/error/empty states.

## What was done vs. not (completeness)

Done: live data wiring, division + power views, canonical grade scale, GB,
run differential, streaks, L10, home/away splits, mobile responsiveness, typed
`TeamStanding` interface, NULL-score data guard.

Deferred (non-blocking, candidate follow-ups): wild-card standings view; a
materialized refresh if the live view ever becomes a hotspot (currently cheap —
~30 teams over ~2.5k current-season games, cached 5 min at the edge);
backfilling `status` on 2026 `fact_games` rows (currently NULL — the view keys
on `final` so it is unaffected).

## Verification

- `npx tsc --noEmit`: exit 0, 0 errors.
- 8 Immutable Rules grep: no `.single()`, no emoji, no raw `@supabase/supabase-js`
  in the API route, no unused hook imports.
- View output validated against authoritative engine records (see above).
- Production deploy verified via `/api/health` SHA match after merge.

## Security notes (out of scope to fix here; flagged for follow-up)

- The `origin` remote URL for this repo embeds a `ghp_` classic PAT in
  plaintext. Recommend rotating it and moving to a credential helper / env.
- `mlb-analytics-engine/apply_latest_migrations.py` hardcodes a Postgres
  connection string (incl. password). Recommend moving to env.
- The phantom `v_mlb_standings` + `dim_teams.w/l/pct/gb` on PokerIQ
  (`kuklfnapbkmacvwxktbh`) are harmless (nothing reads them) and were left in
  place; the World-Hub migration `20260618232000_mlb_standings.sql` is
  superseded by the engine-repo view and should be treated as historical.

## Forward checks

- If standings show all zeros or "unavailable" again: confirm the API is
  pointed at the engine DB and `to_regclass('public.v_mlb_standings')` is
  non-null on `nscdmxldtyszyvcxxwgr`.
- The grade scale must stay sourced from `src/lib/betScore.ts`; do not fork
  thresholds into the standings code.
