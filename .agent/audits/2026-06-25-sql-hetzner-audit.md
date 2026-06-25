# MLB Analytics Engine Audit - 2026-06-25

## 1. RPC functions (`get_*`)
Many RPC functions used to return bare `null` if the underlying query yielded no results. This breaks the expected API contracts for clients which expect empty arrays (`[]`) or empty objects (`{}`).
We fixed:
*   `get_mlb_hitter_directory` (Added `COALESCE(jsonb_agg(...), '[]'::jsonb)`)
*   `get_mlb_standings_ext` (Added `COALESCE(jsonb_agg(...), '[]'::jsonb)`)
*   `get_mlb_pitcher_directory` (Added `COALESCE(jsonb_agg(...), '[]'::jsonb)`)
*   `get_mlb_league_averages` (Added `COALESCE(jsonb_object_agg(...), '{}'::jsonb)`)
*   `get_mlb_validation_stats` (Added `COALESCE(jsonb_object_agg(...), '{}'::jsonb)`)
*   `get_portfolio_stats` (Added `COALESCE(jsonb_agg(...), '[]'::jsonb)`)

## 2. Hetzner automated scripts
*   `run_daily.sh` correctly executes the entire pipeline (eval -> heal -> ingest -> compute -> enrich -> predict -> ... -> export) with an automated retraining cron on Mondays.
*   The `run_daily.py` orchestrator catches all exceptions at the stage-level and reports them via `alert.send_alert()` rather than dropping them silently.
*   Added some missing `alert.send_alert` calls inside swallowed exception blocks in `daily_ingest.py` (specifically for transactions API ingest failures, which we want to hear about if the MLB Stats API route breaks).

## 3. Empty exception swallowing
*   Found a bug in `daily_predict.py` line 1155 where a bad datetime parse (`first_pitch_utc` missing a valid format string) would trigger a generic "WARN: Swallowed exception" logger but not actually tell you *why* or for *who* the hangover calculation failed. Updated the log line to include the `home_team_id` / exception message clearly.

## 4. Unused indexes & constraints
*   Dropped the metrics triggers earlier via `20260625170000_drop_metrics_triggers.sql`.
*   All `best_bets` ledger edge cases in `fn_settle_best_bets` are currently mapped properly: DNP `void` for player props in finalized games without gamelogs, and `win`/`loss`/`push`/`void` are propagated through properly.
