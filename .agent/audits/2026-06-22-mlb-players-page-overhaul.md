# MLB Players Page — Team Averages, Rich Stats, Full Detail + Matchup, Tooltips, Title Case

**Date:** 2026-06-22
**Scope:** `https://smarter.poker/hub/MLB-ANALYTICS/players` + the player detail sub-page.
**Data source:** MLB engine DB `nscdmxldtyszyvcxxwgr` (NOT the World Hub DB), via `getMlbSupabase()`.

Dan's 6 requests and status:

## 1. Team averages were blank ("--") — FIXED & LIVE
`v_mlb_standings` has no `era / team_avg / runs_per_game / runs_allowed_per_game` columns,
but the frontend read exactly those → always null. Added engine RPC
`get_mlb_standings_ext()` (R/G·RA/G from `rs/ra/gp`; ERA/WHIP from `agg_team(pitching)`;
team AVG/OBP/SLG/OPS from `agg_team(fg_hitting)`). `standings.ts` now calls it.
Verified live: Cleveland ERA 3.79, AVG .228, R/G 3.97, RA/G 4.06. Daily-fresh (agg_team
is rebuilt by the engine each morning).

## 2. Team-click list needed far more data — DONE & LIVE
New engine RPCs `get_mlb_hitter_directory()` / `get_mlb_pitcher_directory()` return real
season lines from `fg_season`. `/api/mlb/players` calls them; `PlayerCard` now leads with
AVG / HR / RBI then OBP/SLG/OPS/wRC+ for hitters, and ERA / W-L / K then
WHIP/IP/SV/FIP for pitchers. Verified live: Yordan Alvarez AVG .322, 25 HR, 56 RBI, 1.067 OPS.

## 3. Player detail = every stat + today's matchup — DONE & LIVE
New engine RPC `get_mlb_player_detail(p_id)` returns identity + type + the complete
fg_season stat line + profile sim_rates/streaks + today's matchup. `[id].tsx` rebuilt:
- Today's Matchup (prominent): opponent + home/away + first pitch (ET); for hitters the
  probable opposing pitcher's season line and the batter-vs-pitcher career line
  (`agg_bvp`); for pitchers the pitcher-vs-opponent-team line (`agg_pitcher_vs_team`) +
  opponent offense. Built from `fact_games` (today's/next game) + `raw_probables` (probable SP).
- Season stat groups — Standard, Advanced, Statcast & Batted Ball, Plate Discipline
  (hitters) / Standard, Run Prevention, Stuff & Batted Ball (pitchers). ~45 stats each.
- Model Projection (sim_rates) and Recent Form (streaks, last-5 / last-start).
Verified live: Yordan Alvarez vs Toronto, facing Dylan Cease, BvP 3 PA; full season line.

## 4. Hover descriptions on every abbreviation — DONE
New shared `src/lib/mlbStatGlossary.ts` (60+ stat descriptions). Every stat tile/pill on the
list card, team selector, and detail page carries a `title` tooltip via `glossaryFor(label)`.

## 5. Daily save to Supabase — VERIFIED
The engine's daily pipeline (run_daily.sh via Open Claw on Hetzner) persists each day's
games-played stats: `fact_games` finals through 2026-06-21 (28 finals in the last 3 days),
`raw_player_gamelog` through 2026-06-21, and `agg_batter/pitcher/team` rebuilt as_of
2026-06-22 (today). The page reads these daily-refreshed tables, so it is always current.
No new job required.

## 6. Title Case (capitalize every word) — PLAYERS PAGES DONE; platform-wide remaining
The Players list + detail pages were converted from ALL-CAPS to Title Case (removed the
`uppercase` transform; fixed literal caps strings; stat abbreviations like wRC+/FIP/ERA
preserved correctly). Platform-wide is a separate large sweep: sibling MLB pages
(teams, standings, best-bets, hr-tracker, props, etc.) are being Title-cased by their own
concurrent agents; the rest of the platform (World Hub, Club Arena [protected zone], etc.)
remains a dedicated follow-up and was intentionally not touched in this pass to avoid
clobbering other agents' in-flight edits and the protected club-arena zone.

## SQL (engine DB nscdmxldtyszyvcxxwgr) — applied via MCP + recorded in supabase/migrations/
- `20260622090000_mlb_standings_ext_rpc.sql` — get_mlb_standings_ext()
- `20260622091000_mlb_player_directory_rpcs.sql` — get_mlb_hitter_directory(), get_mlb_pitcher_directory()
- `20260622092000_mlb_player_detail_rpc.sql` — get_mlb_player_detail()
All are read-only STABLE functions over daily-refreshed tables; no schema/data mutation.

## Files changed (World Hub repo)
- `pages/api/mlb/standings.ts`, `pages/api/mlb/players.ts`, `pages/api/mlb/players/[id].ts`
- `pages/hub/MLB-ANALYTICS/players.tsx`, `pages/hub/MLB-ANALYTICS/players/[id].tsx`
- `src/lib/mlbStatGlossary.ts` (new)
- 3 migrations above

## Verification
- `tsc --noEmit`: exit 0, zero diagnostics across all changed files.
- Pushed via GitHub Git Data API (local git writes fail on this mount; SSH remote, no keys).
  Commits: `8b7d2ce5` (team averages + rich list + glossary + Title Case),
  `3ed7ed8f` (full detail + matchup + tooltips).
- Live production functional checks (above) confirm standings averages, rich list stats, and
  detail matchup all working.

## Note for future agents
Engine RPCs added here (`get_mlb_*`) follow the established pattern (model-intel/portfolio
RPCs). They read `fg_season` (full stats), `profile` (sim/streaks), `agg_bvp`,
`agg_pitcher_vs_team`, `fact_games`, `raw_probables` — all engine-maintained daily.
