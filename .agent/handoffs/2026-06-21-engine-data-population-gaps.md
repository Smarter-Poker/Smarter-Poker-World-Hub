# Handoff: engine data-population gaps (situational splits / recent form / streaks / explainability)

**Date:** 2026-06-21
**Author:** Cowork (MLB-ANALYTICS round-4 audit)
**Severity:** Medium — pages render but several analytics sections show "No data yet" / "—".
**Scope:** ENGINE repo `mlb-analytics-engine` (Python extractors + the package builder). The web
frontend already degrades gracefully, so this is missing-data, NOT wrong-data. Handed off (not
fixed in-session) because every fix here can only be verified by a full enrich/predict pipeline
run that writes `agg_batter` / `pred_game_packages` from the MLB API — not validatable from a code
edit alone.

## Symptoms (live-verified 2026-06-21 on the engine deploy)
- `/player/[id]`: "Situational Splits — No data yet" and "Recent Form — No data yet" for ~all
  players; Streaks show "0-game hit streak (long 0)", literal "? g since HR", "0 multi-hit g" for
  some stars (Aaron Judge 592450, Ohtani 660271) while others (Soto 665742) populate correctly.
- `/game/[id]` LineupSection: the "matchup K%" and "matchup BABIP" columns are "—" for every batter.
- `/game/[id]` ExplainabilityPanel: only ever shows the pitcher SIERA/FIP fallback; the
  engine-driven weather/park/umpire insights never appear.

## Root causes (DB-verified)
1. **Situational splits null.** `v_hitter_profile.splits` = `agg_batter.metrics->'splits'`
   (window_kind='profile', vs_hand='A'). The buckets exist (keys `a,d,g,h,n,preas`) but every
   bucket has `rates: null, pa: 0`. Producer: `engine/extractors/player_splits.py` (invoked by
   `engine/pipeline/daily_enrich.py:38` `player_splits.run(date, client)`). It emits bucket shells
   without filling rates.
2. **Recent form null.** Same pattern via `engine/extractors/player_recent.py` →
   `agg_batter.metrics->'recent'` has null rates.
3. **Streaks inconsistent per player.** `metrics->'streaks'` populates for some players but leaves
   `games_since_hr` / `current_hitting_streak` / `multi_hit_games` null/0 for others (Judge,
   Ohtani). Streaks extractor isn't filling all qualified player_ids.
4. **LineupSection wrong split source.** `web/src/app/game/[id]/LineupSection.tsx` looks up
   `splits["vl"/"vr"]` (handedness) but the profile splits are situational (`a/d/g/h/n`) at
   vs_hand='A'. Handedness splits (vs_hand 'L'/'R') aren't surfaced in `v_hitter_profile`, so even
   once rates populate, this lookup key never matches — it needs a handedness-split data source.
5. **ExplainabilityPanel dead.** `web/src/lib/data.ts:639` reads
   `pkgs[0].package_json.features.explainability`, but `pred_game_packages.package_json` has NO
   `features` key (verified across recent rows) -> always null. The engine package builder
   (`engine/pipeline/daily_predict.py`) never writes `features.explainability`. Separately, the
   panel's park branch reads `park.name` / `park.park_factor_runs`, but `agg_park` has neither
   (columns are `run_factor` / `hr_factor`, no `name`).

## Recommended work
1. `player_splits.py`: debug why the MLB-API split parse yields null rates; populate `rates`+`pa`
   per bucket. Verify `agg_batter.metrics->'splits'->'<k>'->'rates'` is non-null after an enrich run.
2. `player_recent.py`: same — fill recent-window rates.
3. Streaks extractor: fill `games_since_hr`/`current_hitting_streak`/`multi_hit_games` for all
   qualified players (compare a working id like 665742 vs a broken one like 592450).
4. LineupSection: source handedness splits (`agg_batter` vs_hand 'L'/'R') for the matchup column,
   or relabel it to a situational split that exists. Frontend-only once the source is chosen.
5. ExplainabilityPanel: either (a) have `daily_predict` write `features.explainability`
   (weather_mod / park_run / park_hr / umpire_k_adj / umpire_bb_adj) into
   `pred_game_packages.package_json`, or (b) repoint `data.ts` + the panel to the real source of
   those modifiers; and fix the park field names (`run_factor`/`hr_factor`, no `name`).

## Verify after
- `/player/<id>`: Situational Splits + Recent Form populated; Streaks correct for Judge/Ohtani.
- `/game/<pk>`: LineupSection matchup K%/BABIP populated; ExplainabilityPanel shows
  weather/park/umpire insights (not just the pitcher fallback).

## Already shipped this round (context — do NOT redo)
Round-4 commit `e15008c8` (engine, deployed READY) fixed: line-movement raw_odds 1k-row
truncation, LiveScoreboard dark theme, StadiumWeather wind_dir_deg/roof_state wiring, pitcher
directory `.limit(900)` truncation, team/[id] ET->CT, model selection humanization,
ExplainabilityPanel SIERA/FIP rounding, daily_push.py pred_calibration truthy-result bug, and
migration `20260621231259` (pred_bet_log IDOR + dedupe pred_*/sim_* permissive policies).
