-- 20261114155817_digest_daily_results_are_computed_before_the_digest.sql
-- Reserved against origin/main and every remote branch.
-- IRREVERSIBLE: no
--
-- WHY:
-- The 2026-11-13 daily digest said "Daily chip reconciliation could not be
-- verified". That was a failed job, not an accounting finding:
-- fn_sp_digest_daily_results returned "canceling statement due to statement
-- timeout" on all three digest attempts. Run afterwards with a longer budget
-- the same report took 111 s and answered status "balanced", accounted
-- residual 0. It took 37 s for 2026-11-12. The day's volume nearly doubled
-- (1,585,608 cash hand facts against 820,141; 590,169 posted ledger rows
-- against 312,520) while the report is capped at 60 s and runs last of six
-- reports inside the digest route's 300 s, so the cap cannot simply be raised
-- on the digest's own path.
--
-- WHAT:
-- 1. The report body is unchanged (byte for byte the 20261113160502 body) and
--    now lives as fn_sp_digest_daily_results_compute, with no timeout of its
--    own: it inherits its caller's budget.
-- 2. fn_sp_digest_daily_results_refresh(day) computes a CLOSED Chicago day
--    with a 600 s budget and stores the result in
--    sp_digest_daily_results_snapshots.
-- 3. No new schedule: the existing digest precompute job (sp-daily-metrics-
--    snapshot, unchanged schedule) also computes yesterday at its 06:15 Chicago
--    tick, and at 06:45 when no snapshot was stored in the last hour, so the
--    07:00 digest finds it.
-- 4. fn_sp_digest_daily_results keeps its name, its 60 s cap and its callers.
--    It returns a snapshot stored in the last 12 hours (the morning digest,
--    its watchdog and same-morning views) and otherwise computes live exactly
--    as before, so an older day is never answered from a frozen copy.
-- Nothing here writes a balance, a ledger row or a payout.
--
-- ROLLBACK: cron.alter_job(495) back to its metrics statement alone (quoted in
-- the guard below); re-apply fn_sp_digest_daily_results from 20261113160502; DROP the refresh
-- and compute functions and the snapshot table.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sp_digest_daily_results_compute(p_day date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
SET plan_cache_mode='force_custom_plan' AS $$
BEGIN
RETURN (
WITH win AS NOT MATERIALIZED (
 SELECT p_day::timestamp AT TIME ZONE 'America/Chicago' s,
 (p_day+1)::timestamp AT TIME ZONE 'America/Chicago' e, public.fn_diamond_arena_club() da
), facts AS MATERIALIZED (
 SELECT f.hand_id,f.user_id,f.net,f.players_dealt, CASE WHEN p.id IS NULL THEN 'unknown' WHEN COALESCE(p.is_horse,false) THEN 'horses' ELSE 'humans' END cohort
 FROM public.ca_hand_facts f CROSS JOIN win LEFT JOIN public.profiles p ON p.id=f.user_id
 WHERE f.played_at>=win.s AND f.played_at<win.e AND f.tournament_id IS NULL
 AND f.club_id IS DISTINCT FROM win.da
), tday AS MATERIALIZED (
 -- Tournaments whose start (started_at, else scheduled start_time, else
 -- created_at) falls on this Chicago day. Each branch is an index range.
 SELECT t.id FROM public.tournaments t,win WHERE t.started_at>=win.s AND t.started_at<win.e
 UNION
 SELECT t.id FROM public.tournaments t,win WHERE t.started_at IS NULL AND t.start_time>=win.s AND t.start_time<win.e
 UNION
 SELECT t.id FROM public.tournaments t,win WHERE t.started_at IS NULL AND t.start_time IS NULL AND t.created_at>=win.s AND t.created_at<win.e
), posted AS MATERIALIZED (
 SELECT l.from_type,l.to_type,l.from_entity_id,l.to_entity_id,l.amount,l.category,l.tournament_id FROM public.chip_ledger l,win WHERE l.created_at>=win.s AND l.created_at<win.e
 AND l.status='posted' AND l.club_id IS DISTINCT FROM win.da
), ledger AS MATERIALIZED (
 -- Legs with no tournament, or a tournament with no known start, keep their
 -- posting day. Every leg of a tournament that started today is included,
 -- whenever it was posted; legs of tournaments started on other days are not.
 -- The start lookup is a per-row primary-key probe, never a table-wide hash.
 SELECT p.* FROM posted p WHERE p.tournament_id IS NULL
 UNION ALL
 SELECT p.* FROM posted p WHERE p.tournament_id IS NOT NULL
 AND (SELECT COALESCE(t.started_at,t.start_time,t.created_at) FROM public.tournaments t WHERE t.id=p.tournament_id) IS NULL
 UNION ALL
 SELECT l.from_type,l.to_type,l.from_entity_id,l.to_entity_id,l.amount,l.category,l.tournament_id FROM public.chip_ledger l JOIN tday d ON d.id=l.tournament_id,win
 WHERE l.status='posted' AND l.club_id IS DISTINCT FROM win.da
), legs AS MATERIALIZED (
 SELECT l.tournament_id, CASE WHEN l.to_type='player_wallet' THEN l.to_entity_id ELSE l.from_entity_id END user_id,
 CASE WHEN l.to_type='player_wallet' THEN l.amount ELSE -l.amount END net
 FROM ledger l WHERE tournament_id IS NOT NULL AND
 ((from_type='player_wallet' AND to_type='prize_liability') OR (from_type='prize_liability' AND to_type='player_wallet'))
), results AS (
 SELECT 'cash' kind,cohort,user_id,sum(net) net FROM facts GROUP BY 2,3
 UNION ALL
 SELECT 'tournament',CASE WHEN p.id IS NULL THEN 'unknown' WHEN COALESCE(p.is_horse,false) THEN 'horses' ELSE 'humans' END,
 l.user_id,sum(l.net) FROM legs l LEFT JOIN profiles p ON p.id=l.user_id GROUP BY 2,3
), cohorts AS (
 SELECT k.kind,c.cohort,COALESCE(sum(r.net),0) net,
 COALESCE(sum(GREATEST(r.net,0)),0) wins,COALESCE(sum(GREATEST(-r.net,0)),0) losses,
 count(r.user_id) players FROM (VALUES('cash'),('tournament')) k(kind)
 CROSS JOIN (VALUES('horses'),('humans'),('unknown')) c(cohort)
 LEFT JOIN results r ON r.kind=k.kind AND r.cohort=c.cohort GROUP BY 1,2
), amounts AS (
 SELECT COALESCE((SELECT sum(amount) FROM ledger WHERE category='rake' AND from_type='table_stack'),0) cash_rake,
 COALESCE((SELECT sum(amount) FROM ledger WHERE category='rake' AND from_type='prize_liability'),0) tournament_rake,
 COALESCE((SELECT sum(b.amount) FROM public.bbj_contributions b,win WHERE b.created_at>=win.s AND b.created_at<win.e AND b.club_id IS DISTINCT FROM win.da),0) bbj,
 COALESCE((SELECT sum(net) FROM facts),0) cash_net,
 COALESCE((SELECT sum(net) FROM legs),0) tournament_net,
 -- Change in the ledger's prize-liability bucket. Internal transfers cancel.
 COALESCE((SELECT sum((CASE WHEN to_type='prize_liability' THEN amount ELSE 0 END)-(CASE WHEN from_type='prize_liability' THEN amount ELSE 0 END)) FROM ledger),0) prize_liability_change,
 -- External funding out of prize liabilities is positive; funding in negative.
 -- Wallet results and rake are already counted separately above.
 COALESCE((SELECT sum((CASE WHEN from_type='prize_liability' THEN amount ELSE 0 END)-(CASE WHEN to_type='prize_liability' THEN amount ELSE 0 END)) FROM ledger
 WHERE from_type<>'player_wallet' AND to_type<>'player_wallet' AND category<>'rake'),0) other_prize_movements
), coverage AS (
 SELECT count(*) FILTER(WHERE actual<>expected OR invalid>0) incomplete_hands,
 COALESCE(sum(invalid),0) invalid_seats FROM (
 SELECT hand_id,count(DISTINCT user_id) actual,max(players_dealt) expected,
 count(*) FILTER(WHERE net IS NULL OR players_dealt IS NULL) invalid FROM facts GROUP BY hand_id) h
), settlements AS MATERIALIZED (
 SELECT d.* FROM win CROSS JOIN LATERAL public.fn_tournament_conservation_deltas(win.s-interval '1 microsecond',win.e+interval '7 days') d
 WHERE EXISTS(SELECT FROM public.tournaments t WHERE t.id=d.id AND t.club_id IS DISTINCT FROM win.da)
 AND (d.id IN (SELECT id FROM tday) OR (d.ended_at<win.e AND NOT EXISTS(SELECT FROM public.tournaments t WHERE t.id=d.id
 AND COALESCE(t.started_at,t.start_time,t.created_at) IS NOT NULL)))
), supply AS MATERIALIZED (
 SELECT count(*) samples,count(DISTINCT date_trunc('hour',taken_at)) hours,
 count(*) FILTER(WHERE unexplained IS NULL OR basis_version IS NULL) unknown,
 count(*) FILTER(WHERE unexplained<>0) nonzero,count(DISTINCT basis_version) bases,
 COALESCE(sum(abs(unexplained)),0) absolute_unexplained,COALESCE(sum(unexplained),0) net_unexplained,
 min(taken_at) first_at,max(taken_at) last_at
 FROM public.ca_supply_snapshots,win WHERE taken_at>=win.s AND taken_at<win.e
), report AS (
 SELECT jsonb_build_object('day',p_day,'window',jsonb_build_object('start',win.s,'end',win.e),
 'results',(SELECT jsonb_object_agg(kind,groups) FROM (SELECT kind,jsonb_object_agg(cohort,jsonb_build_object('net',net,'wins',wins,'losses',losses,'players',players)) groups FROM cohorts GROUP BY kind) g),
 'kingfish',jsonb_build_object('included',true,'user_id','47965354-0e56-43ef-931c-ddaab82af765',
 'cash_net',COALESCE((SELECT net FROM results WHERE kind='cash' AND user_id='47965354-0e56-43ef-931c-ddaab82af765'),0),
 'tournament_net',COALESCE((SELECT net FROM results WHERE kind='tournament' AND user_id='47965354-0e56-43ef-931c-ddaab82af765'),0)),
 'chip_supply',to_jsonb(supply)||jsonb_build_object('expected_hours',extract(epoch FROM win.e-win.s)/3600,
 'status',CASE WHEN supply.hours<>extract(epoch FROM win.e-win.s)/3600 OR supply.unknown>0 OR supply.bases<>1 THEN 'unverified'
 WHEN supply.absolute_unexplained<>0 THEN 'discrepancy' ELSE 'balanced' END,
 'basis','Existing hourly physical-store inventory versus journaled issuance and retirement, including wallets, cash stacks, BBJ, reserves, prize/ticket liabilities and post-hand transit. Checks intervals ending during this Chicago day; not exact midnight inventory cuts.'),
 'tournament_settlements',jsonb_build_object('checked',(SELECT count(*) FROM settlements),
 'unbalanced',(SELECT count(*) FROM settlements WHERE delta IS NULL OR delta<>0),
 'absolute_drift',COALESCE((SELECT sum(abs(delta)) FROM settlements),0),
 'off',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'delta',delta)) FROM settlements WHERE delta IS NULL OR delta<>0),'[]'::jsonb),
 'basis','Existing independent completed/cancelled paid non-spin tournament conservation check; lifetime event balances for events that started this Chicago day.'),
 'reconciliation',to_jsonb(a)||jsonb_build_object(
 'cash_residual',cash_net+cash_rake+bbj,
 'raw_residual',cash_net+tournament_net+cash_rake+tournament_rake+bbj,
 'accounted_residual',cash_net+tournament_net+cash_rake+tournament_rake+bbj+prize_liability_change+other_prize_movements,
 'incomplete_cash_hands',coverage.incomplete_hands,'invalid_cash_seats',coverage.invalid_seats,
 'unknown_players',(SELECT sum(players) FROM cohorts WHERE cohort='unknown'),
 'status',CASE WHEN NOT EXISTS(SELECT FROM public.sp_daily_metrics WHERE day=p_day) OR p_day>=(statement_timestamp() AT TIME ZONE 'America/Chicago')::date OR supply.hours<>extract(epoch FROM win.e-win.s)/3600 OR supply.unknown>0 OR supply.bases<>1 THEN 'unverified' WHEN supply.absolute_unexplained<>0 OR EXISTS(SELECT FROM settlements WHERE delta IS NULL OR delta<>0) OR coverage.incomplete_hands>0 OR coverage.invalid_seats>0 OR EXISTS(SELECT FROM cohorts WHERE cohort='unknown' AND players>0)
 OR cash_net+cash_rake+bbj<>0 OR cash_net+tournament_net+cash_rake+tournament_rake+bbj+prize_liability_change+other_prize_movements<>0
 THEN 'discrepancy' ELSE 'balanced' END),
 'basis','Chicago calendar day; chips only, Diamond Arena excluded. Wins/losses are positive/negative player net results within each game type. Cash uses recorded completed-hand facts. Tournament uses posted wallet entries, rebuys, add-ons, prizes, bounties and refunds, not tournament play stacks. Kingfish is included among humans. Every tournament leg is recorded on the Chicago day the tournament started, even when posted after midnight. Raw rake + BBJ + wins - losses is shown before the prize-liability and other funding bridge. Balanced verifies these recorded flows, not every physical wallet or unrecorded transaction.') value
 FROM win,amounts a,coverage,supply
) SELECT value FROM report);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_daily_results_compute(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_daily_results_compute(date) TO service_role;

CREATE TABLE IF NOT EXISTS public.sp_digest_daily_results_snapshots (
  day         date PRIMARY KEY,
  result      jsonb NOT NULL,
  computed_at timestamptz NOT NULL,
  compute_ms  integer NOT NULL CHECK (compute_ms >= 0)
);
ALTER TABLE public.sp_digest_daily_results_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sp_digest_daily_results_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sp_digest_daily_results_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.fn_sp_digest_daily_results_refresh(
  p_day date DEFAULT ((clock_timestamp() AT TIME ZONE 'America/Chicago')::date - 1)
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='600s' AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_result  jsonb;
  v_ms      integer;
BEGIN
  -- Only a closed Chicago day: today's report is unverified by its own rule.
  IF p_day IS NULL OR p_day >= (clock_timestamp() AT TIME ZONE 'America/Chicago')::date THEN
    RAISE EXCEPTION 'DIGEST_DAILY_RESULTS_DAY_NOT_CLOSED' USING ERRCODE = '22023';
  END IF;
  v_result := public.fn_sp_digest_daily_results_compute(p_day);
  IF v_result IS NULL THEN
    RETURN jsonb_build_object('stored', false, 'day', p_day);
  END IF;
  v_ms := GREATEST(0, round(extract(epoch FROM clock_timestamp() - v_started) * 1000))::integer;
  INSERT INTO public.sp_digest_daily_results_snapshots AS s (day, result, computed_at, compute_ms)
  VALUES (p_day, v_result, clock_timestamp(), v_ms)
  ON CONFLICT (day) DO UPDATE
    SET result = excluded.result, computed_at = excluded.computed_at, compute_ms = excluded.compute_ms;
  RETURN jsonb_build_object('stored', true, 'day', p_day, 'compute_ms', v_ms,
                            'status', v_result->'reconciliation'->>'status');
END $$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_daily_results_refresh(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_daily_results_refresh(date) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_sp_digest_daily_results(p_day date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='60s' SET plan_cache_mode='force_custom_plan' AS $$
DECLARE v_snapshot jsonb;
BEGIN
  SELECT s.result INTO v_snapshot
    FROM public.sp_digest_daily_results_snapshots s
   WHERE s.day = p_day AND s.computed_at > clock_timestamp() - interval '12 hours';
  IF v_snapshot IS NOT NULL THEN
    RETURN v_snapshot;
  END IF;
  RETURN public.fn_sp_digest_daily_results_compute(p_day);
END $$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_daily_results(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_daily_results(date) TO service_role;

-- No new schedule. The existing digest precompute job (sp-daily-metrics-snapshot,
-- '15,45 5-12 * * *', the job that exists "so the 7 AM email finds it") keeps its
-- schedule and its metrics statement byte for byte, and gains one statement:
-- yesterday's reconciliation at its 06:15 Chicago tick, and at 06:45 only when no
-- snapshot was stored in the last hour.
DO $alter$
DECLARE v_job bigint := (SELECT jobid FROM cron.job WHERE jobname = 'sp-daily-metrics-snapshot');
BEGIN
  IF v_job IS NULL OR (SELECT command FROM cron.job WHERE jobid = v_job) <> $prev$SET statement_timeout = '1500s'; SELECT public.fn_sp_daily_metrics_snapshot()
     WHERE to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') = '00:15'
        OR (to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') IN
              ('00:45','01:15','01:45','02:15','02:45','03:15','03:45','04:45','05:15','05:45','06:15','06:45')
            AND NOT EXISTS (SELECT 1 FROM public.sp_daily_metrics WHERE day = (clock_timestamp() AT TIME ZONE 'America/Chicago')::date - 1));$prev$ THEN
    RAISE EXCEPTION 'sp-daily-metrics-snapshot is not the command this migration was written against';
  END IF;
  PERFORM cron.alter_job(job_id := v_job, command := $cmd$SET statement_timeout = '1500s'; SELECT public.fn_sp_daily_metrics_snapshot()
     WHERE to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') = '00:15'
        OR (to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') IN
              ('00:45','01:15','01:45','02:15','02:45','03:15','03:45','04:45','05:15','05:45','06:15','06:45')
            AND NOT EXISTS (SELECT 1 FROM public.sp_daily_metrics WHERE day = (clock_timestamp() AT TIME ZONE 'America/Chicago')::date - 1));
SELECT public.fn_sp_digest_daily_results_refresh()
     WHERE to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') = '06:15'
        OR (to_char(clock_timestamp() AT TIME ZONE 'America/Chicago','HH24:MI') = '06:45'
            AND NOT EXISTS (SELECT 1 FROM public.sp_digest_daily_results_snapshots
                             WHERE day = (clock_timestamp() AT TIME ZONE 'America/Chicago')::date - 1
                               AND computed_at > clock_timestamp() - interval '1 hour'));$cmd$);
END
$alter$;

DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sp-daily-metrics-snapshot'
                  AND schedule = '15,45 5-12 * * *'
                  AND command LIKE '%fn_sp_daily_metrics_snapshot()%'
                  AND command LIKE '%fn_sp_digest_daily_results_refresh()%') THEN
    RAISE EXCEPTION 'sp-daily-metrics-snapshot was not extended';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sp-digest-daily-results-snapshot') THEN
    RAISE EXCEPTION 'no new schedule may be added';
  END IF;
  IF md5(regexp_replace((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_sp_digest_daily_results_compute(date)'::regprocedure), '\s+', ' ', 'g'))
     <> '65a6ff6764bed88b628499eb80eb472a' THEN
    RAISE EXCEPTION 'fn_sp_digest_daily_results_compute is not the unchanged report body';
  END IF;
END
$assert$;

COMMIT;
