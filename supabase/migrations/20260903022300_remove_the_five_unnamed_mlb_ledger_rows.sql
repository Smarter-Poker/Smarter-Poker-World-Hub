-- Companion to 20260903021500_remove_every_trace_of_mlb_analytics_engine.sql
-- (2026-09-03, applied via apply_migration). Five MLB migrations were named
-- for their objects rather than the project - v_daily_slate, raw_games, brier,
-- dim_teams - and escaped the name ~* 'mlb' filter. Their .sql files leave
-- this repo in the same pull request:
--   20260618230500_v_daily_slate_fix.sql
--   20260618230501_add_raw_games_table.sql
--   20260618231200_add_brier_to_pred_market_output.sql
--   20260618231600_rebuild_v_daily_slate.sql
--   20260619180000_dim_teams_extended_stats.sql
DELETE FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260618230500','20260618230501','20260618231200','20260618231600','20260619180000');
DO $$
DECLARE v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations
   WHERE name ~* 'daily_slate|raw_games|brier|dim_teams|pred_props';
  IF v_n <> 0 THEN RAISE EXCEPTION 'post-apply: % MLB ledger row(s) still present', v_n; END IF;
END $$;
