# MLB-ANALYTICS Teams Page — Deep Audit & Upgrade (2026-06-20)

Scope: `/hub/MLB-ANALYTICS/teams` (list) + `/hub/MLB-ANALYTICS/teams/[team_id]` (detail)
and their APIs `pages/api/mlb/teams.ts`, `pages/api/mlb/teams/[team_id].ts`.
Data source: MLB engine Supabase project `nscdmxldtyszyvcxxwgr` (separate from the
hub project). All changes are in the API/UI layer — no MLB schema migration required.

## 1. Grading scale standardization (req #1)
The canonical bet-quality scale is `src/lib/betScore.ts` -> `betScore(pWin, price,
{pMarket, lineupLocked})` (0-100) + `tier()` (ELITE>=82 / STRONG>=68 / LEAN>=52 /
THIN>=38 / PASS) rendered by `src/components/mlb/BetScoreBadge.tsx`. It is the
documented single source of truth used by index, props, game and model-intel.
The teams pages used NONE of it (only a binary "EDGE" dot + raw edge_pts).
Fix: both teams APIs now compute the canonical Bet Score per prop and surface it via
the same `BetScoreBadge` (identical scale/labels/colors to the rest of the app):
  - List: each club card shows its best active prop's Bet Score + tier; header shows
    ELITE/STRONG counts; new "BET SCORE" sort.
  - Detail: header "Top Edge" chip + every prop row renders a BetScoreBadge.
Bet side is inferred from model-vs-market (prob_over vs market_novig_over) because
`pred_props.rec` is a Kelly-stake string, never "over"/"under".

## 2. Bugs / gaps / regressions fixed (req #2)
- Detail OVERVIEW was blank: `agg_team` has ~57 daily "season" rows per team, so
  `.eq('window_kind','season').maybeSingle()` errored on multiple rows -> stats null
  -> all advanced stats rendered "-". Fixed (order by as_of desc + dedupe).
- Detail header showed " . " : `v_team_profile` has no league/division; the API
  returned the profile row verbatim. Fixed by merging `dim_teams` league/division.
- GAMES tab was permanently "No games found": it queried non-existent text columns
  `raw_games.home_team/away_team` (schema only has `home_team_id/away_team_id`) and
  mapped non-existent fields (`start_time`, top-level scores). Rebuilt on `fact_games`
  (one row/game, real scores, `final` flag, first_pitch_utc, records) -> recent +
  upcoming with W/L and opponent.
- List `agg_team` fetch selected ALL season rows (30x57=2052 > PostgREST 1000 cap)
  then took an arbitrary `[0]` -> truncated/stale stats. Fixed (latest snapshot only).
- Non-MLB rows (Sacramento River Cats, Springfield Cardinals, Sultanes de Monterrey,
  Sugar Land Space Cowboys, AL/NL All-Stars) leaked into the list. Now filtered to the
  30 clubs that have a division in `dim_teams`.
- Redundant league label ("AL AL West"); now shows the division alone.

## 3. Completeness upgrade (req #3)
Team advanced stats are split across window_kinds (verified 30/30 coverage):
  - season       -> ops, avg, obp, slg, wrc_plus, woba
  - fg_pitching  -> era, fip, xfip, siera
  - fg_hitting   -> hr, sb, avg
Old code read only "season", so ERA/FIP/xFIP/SIERA/HR/SB rendered "-" and team WAR
(null everywhere in the data) showed a misleading "0.0". Both APIs now merge the three
windows into one stat line. UI now features only populated metrics:
  - List card quartet: wRC+, ERA, OPS, FIP (was WAR/FIP/OPS/OAA — WAR & OAA are null).
  - Telemetry drawer: OBP/SLG replaces null DRS/UZR.
  - Detail OVERVIEW: TEAM VALUE (wRC+/wOBA/OPS), PITCHING (ERA/FIP/xFIP/SIERA),
    HITTING (AVG/OBP/SLG/HR/SB). Removed the empty WAR & FIELDING panels.
  - Detail props now show side (OVER/UNDER), line, EV% and edge alongside Bet Score.
Genuine data gaps (not code): team hitting_war / pitching_war and def/uzr/drs/oaa are
null for all 30 clubs in agg_team — left out of the UI rather than shown as 0/"-".

## 4. SQL
No migration required. All logic is in the API layer; the MLB engine database schema
is owned by the Python engine and was not modified.

## Verification
- Type-check (`tsc --noEmit`) clean for the changed files (build also has
  typescript.ignoreBuildErrors).
- Live API checks post-deploy: `/api/mlb/teams` -> 30 clubs, grades present, summary;
  `/api/mlb/teams/147` -> league/division populated, stats populated, fact_games
  schedule, props with Bet Scores.
