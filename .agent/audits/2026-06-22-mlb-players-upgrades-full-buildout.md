# MLB Players — Full Upgrade Build-Out + Deep Audit (2026-06-22)

Implements the 8 improvement recommendations for the MLB Players feature, then a
read-only deep audit (gaps / stubs / regressions / bugs / wiring) with every
finding verified against the live engine DB before action.

## What was built (all 8 recommendations)

1. **Sortable / filterable directory** — `players.tsx`: sort dropdown (hitters: wRC+, AVG,
   HR, RBI, OPS, SB; pitchers: K, ERA, WHIP, W, SV, IP) with correct asc/desc per stat;
   position filter for hitters (C/1B/2B/3B/SS/OF/DH, OF groups LF/CF/RF/OF).
2. **Role + lead stats on list cards** — `cardRole()` chip: Starter/Backup for hitters
   (from `dim_players.player_class`), SP/RP/CL for pitchers (from gs/g/sv); hitter chip
   also shows position.
3. **Situational splits (detail)** — reads `agg_batter` window `situational`
   (high_leverage/runners_on/bases_empty/low_leverage/grass/turf/month/dow/extra_innings wOBA).
   (Reframed from vs-LHP/RHP: engine stores `vs_hand='A'` only, no platoon data exists.)
4. **vs Pitch-Type / Velocity (detail)** — reads `agg_batter` window `historical_trends`
   (velo <90 / 90-95 / 95+, FB-heavy, offspeed-heavy, best/worst park wOBA).
   (Reframed from time-series trend charts: engine has no per-game time series.)
5. **Prop bets inline + compare** — detail page "Today's Prop Bets" table from `pred_props`;
   new `/players/compare` page: pick any two players, full stat lines side-by-side, better
   value highlighted, URL-shareable (`?a=&b=`), same-type guard.
6. **Percentile / color coding** — new `get_mlb_league_averages()` RPC + `/api/mlb/league-averages`
   route; detail stat tiles render green/red vs league average (direction-aware per stat).
7. **Bench list pagination** — Load-More (50/page) replaces the hard 50 cap; live count.
8. **IL / injury status** — detail "Injury Watch" banner from `agg_*` window `health` (notes).

## SQL applied to engine DB `nscdmxldtyszyvcxxwgr` (recorded in supabase/migrations/)

- `get_mlb_player_detail()` — added situational, tendencies, health, props keys.
- `get_mlb_league_averages()` — league means over qualified players (distinct-on latest
  snapshot per player to avoid a statement timeout); used for color-coding.
- `get_mlb_hitter_directory()` — added `player_class` + `position`.
Migration file: `20260622100000_mlb_players_upgrades_situational_props_league.sql`.

## Deep audit — findings + resolution (verified against live DB, not assumptions)

A subagent audit raised 3 HIGH/MEDIUM items that turned out to be **false positives**
once checked against the engine DB:

- **"`wBsR` should be `BsR`"** — FALSE. DB: `BsR` is null, `wBsR`=1.12 for batter 663538.
  The code reads `wBsR` (correct). No change.
- **"Situational / tendencies sections are permanently empty"** — FALSE. `agg_batter`
  has `window_kind='situational'` and `'historical_trends'` rows with **exactly** the keys
  the page reads (grass_woba, month_woba_avg, velo_*_woba, *_park_woba, …). Sections render
  real data. No change.
- **"`K/9` missing from league averages"** — FALSE. Live endpoint returns `pitcher.K/9`=8.43.
  No change.

Two **real** improvements were applied (commit c594d817):

- **Empty-state on partial API failure** — `players.tsx`: a tab with an empty list during a
  soft `fetchError` (one directory failed) showed a blank area; now shows the empty-state.
- **Hide no-sample split tiles** — `[id].tsx`: situational/tendency tiles with wOBA = 0
  (no/tiny sample) are hidden so `.000` noise isn't presented as a signal.

Audit PASS items: no `.single()`, no emoji, no raw `@supabase/supabase-js` in API routes,
no merge markers in the touched files; compare-page wiring correct; no regression to
search / team-selector / tabs / suggestions; standings / league-averages / players API
field mappings all match their RPC outputs.

## Commits (pushed to main via Git Data API; Vercel hub-vanguard auto-deploys)

- `ffc2a8ac` — detail upgrades (situational, tendencies, injury, props, color-coding) + league-averages route + migration
- `774f152a` — list sort / position filter / role badges / pagination
- `0d0818be` — compare page + list entry link
- `c594d817` — audit fixes (empty-state, hide no-sample tiles)

## Verification

- `npx tsc --noEmit`: 0 errors in any MLB players file (2 pre-existing errors remain in an
  unrelated co-edited file, `pages/api/mlb/sync-alerts.ts`; `next.config.js` has
  `typescript.ignoreBuildErrors`).
- Live `GET /api/mlb/league-averages` returns full hitter+pitcher means.
- Engine DB confirmed: detail RPC returns situational/tendencies/health/props for sample players.
