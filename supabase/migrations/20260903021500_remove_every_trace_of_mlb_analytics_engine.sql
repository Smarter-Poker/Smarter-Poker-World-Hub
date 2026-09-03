-- ============================================================================
-- REMOVE EVERY TRACE OF mlb-analytics-engine
-- ============================================================================
-- Tier: 3 (DROP)                                 IRREVERSIBLE: yes (see ROLLBACK)
-- Applied to production 2026-09-03 via apply_migration. Dan, verbatim:
-- "REMOVE ANYTHING AND EVERYTHING THAT HAS MLB-ANALYTICS AND ANY TRACE OF IT".
--
-- WHAT THIS WAS. A baseball betting-analytics side project (June 2026) that
-- lived in its own repo (Smarter-Poker/mlb-analytics-engine, deleted) and its
-- own Supabase project (nscdmxldtyszyvcxxwgr, deleted), but ALSO wrote 47
-- migrations into THIS production database between 2026-06-18 and 2026-06-25:
-- tables, views, RPCs, a pg_cron job, and realtime publication entries. The
-- RPCs and the cron were removed by later mlb migrations (the "purge
-- hallucinations" pass on 2026-06-25); what remained is below.
--
-- WHAT IT COST. GitHub Actions on the deleted repo: 14,385 hosted Linux
-- minutes in August 2026 (420-855 every day until the repo was removed on
-- 2026-08-23), about 86 USD gross at 0.006/min. Zero minutes in September.
--
-- WHAT IS REMOVED HERE, read from pg_catalog on 2026-09-03 before writing
-- this (every table is 16-48 kB; row counts in brackets):
--   function  public.get_status_dashboard()            reads pred_* and pred_props (gone)
--   view      public.v_daily_slate, public.v_model_health
--   tables    agg_model[0] agg_team[30] dim_teams[30] pred_best_bets[0]
--             pred_market_output[0] raw_games[0] raw_odds[0]
--             backtest_accuracy backtest_market_output[0] v_team_profile[0]
--             sim_baseline_compare sim_bet_grade_summary sim_equity_daily
--             sim_market_summary sim_risk_metrics
--   ledger    the 47 supabase_migrations.schema_migrations rows those
--             migrations wrote, listed by version at the bottom, so the one
--             record of this subsystem is THIS file and nothing else.
-- NOT touched: pb_calibration_profiles (PepNationLab), commander_league_standings
-- (Commander), messenger_labels' idx_mlb_user / mlb_all_self (an abbreviation of
-- messenger_labels, not baseball).
-- ============================================================================

BEGIN;

-- ── PRE-FLIGHT ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM public.pred_market_output;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'pre-flight: pred_market_output has % rows, expected 0', v_rows; END IF;
  SELECT count(*) INTO v_rows FROM public.raw_games;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'pre-flight: raw_games has % rows, expected 0', v_rows; END IF;
  SELECT count(*) INTO v_rows FROM public.pred_best_bets;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'pre-flight: pred_best_bets has % rows, expected 0', v_rows; END IF;
  SELECT count(*) INTO v_rows FROM cron.job WHERE command ~* 'mlb|pred_market_output|raw_games|get_status_dashboard';
  IF v_rows <> 0 THEN RAISE EXCEPTION 'pre-flight: % pg_cron job(s) still reference MLB objects', v_rows; END IF;
END $$;

-- ── CHANGE ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_status_dashboard();
DROP VIEW IF EXISTS public.v_daily_slate;
DROP VIEW IF EXISTS public.v_model_health;

DROP TABLE IF EXISTS public.backtest_accuracy;
DROP TABLE IF EXISTS public.backtest_market_output;
DROP TABLE IF EXISTS public.pred_best_bets;
DROP TABLE IF EXISTS public.pred_market_output;
DROP TABLE IF EXISTS public.raw_odds;
DROP TABLE IF EXISTS public.raw_games;
DROP TABLE IF EXISTS public.agg_model;
DROP TABLE IF EXISTS public.agg_team;          -- FK agg_team_team_id_fkey -> dim_teams, so before it
DROP TABLE IF EXISTS public.dim_teams;
DROP TABLE IF EXISTS public.v_team_profile;
DROP TABLE IF EXISTS public.sim_baseline_compare;
DROP TABLE IF EXISTS public.sim_bet_grade_summary;
DROP TABLE IF EXISTS public.sim_equity_daily;
DROP TABLE IF EXISTS public.sim_market_summary;
DROP TABLE IF EXISTS public.sim_risk_metrics;

-- The migration ledger. These 47 rows are the last place the subsystem's
-- name would appear; their .sql files leave the World Hub repo in the same
-- pull request as this file, so the repo and the ledger agree afterwards
-- (applied-migrations-recorded compares the two).
DELETE FROM supabase_migrations.schema_migrations
 WHERE name ~* 'mlb'
    OR version IN ('20260621144004','20260622133653','20260622143935','20260622150156');

-- ── POST-APPLY ASSERTIONS ───────────────────────────────────────────────────
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM pg_tables
   WHERE schemaname='public' AND tablename IN ('agg_model','agg_team','dim_teams','pred_best_bets',
     'pred_market_output','raw_games','raw_odds','backtest_accuracy','backtest_market_output',
     'v_team_profile','sim_baseline_compare','sim_bet_grade_summary','sim_equity_daily',
     'sim_market_summary','sim_risk_metrics');
  IF v_n <> 0 THEN RAISE EXCEPTION 'post-apply: % MLB table(s) still present', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE proname='get_status_dashboard';
  IF v_n <> 0 THEN RAISE EXCEPTION 'post-apply: get_status_dashboard still present'; END IF;
  SELECT count(*) INTO v_n FROM pg_views WHERE viewname IN ('v_daily_slate','v_model_health');
  IF v_n <> 0 THEN RAISE EXCEPTION 'post-apply: MLB view(s) still present'; END IF;
  SELECT count(*) INTO v_n FROM supabase_migrations.schema_migrations WHERE name ~* 'mlb';
  IF v_n <> 0 THEN RAISE EXCEPTION 'post-apply: % mlb ledger row(s) still present', v_n; END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (Tier 3): there is none that restores data, and there is nothing to
-- restore - every table was empty except two 30-row team lists. To recreate the
-- schema, check out World Hub commit 6a2fc5ac83 (the last with the files) and
-- re-apply supabase/migrations/2026061[89]*_mlb_*.sql through 20260625*_mlb_*.sql
-- in version order. Do not: the subsystem is retired by Dan's instruction.
--
-- Ledger versions removed (47):
--   20260618 20260618000000 20260618000001 20260618000002 20260618000003
--   20260618000004 20260618000005 20260618000006 20260618000007 20260618000008
--   20260618000009 20260618225423 20260618230000 20260618230600 20260618230700
--   20260618231501 20260618231700 20260618232000 20260618233500 20260619
--   20260619100001 20260619160000 20260619170000 20260619230000 20260621000000
--   20260621004109 20260621144004 20260621150000 20260621160000 20260621180000
--   20260621180001 20260622000000 20260622090000 20260622093000 20260622133653
--   20260622143935 20260622150000 20260622150156 20260622153000 20260622154000
--   20260622160000 20260622170000 20260622170001 20260622180000 20260622180001
--   20260625000000 20260625160000
-- ============================================================================
