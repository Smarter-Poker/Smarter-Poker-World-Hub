-- TIER 1: optimize the installed read-only report without changing arithmetic.
-- Production EXPLAIN found generic timestamp bounds scanning a user-first cash
-- index and materializing full seat/ledger payloads. Use actual-day custom plans,
-- inline bounds and only the columns this report consumes.
-- Read-only reporting. Recorded cash seat results, tournament wallet legs,
-- and an explicit midnight liability/funding bridge. Never derive a cohort's net
-- as the balancing remainder. Kingfish and every other nonhorse account count.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_sp_digest_daily_results(p_day date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='60s' SET plan_cache_mode='force_custom_plan' AS $$
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
), ledger AS MATERIALIZED (
 SELECT l.from_type,l.to_type,l.from_entity_id,l.to_entity_id,l.amount,l.category,l.tournament_id FROM public.chip_ledger l,win WHERE l.created_at>=win.s AND l.created_at<win.e
 AND l.status='posted' AND l.club_id IS DISTINCT FROM win.da
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
 SELECT d.* FROM win CROSS JOIN LATERAL public.fn_tournament_conservation_deltas(win.s-interval '1 microsecond',win.e) d
 WHERE EXISTS(SELECT FROM public.tournaments t WHERE t.id=d.id AND t.club_id IS DISTINCT FROM win.da)
), report AS (
 SELECT jsonb_build_object('day',p_day,'window',jsonb_build_object('start',win.s,'end',win.e),
 'results',(SELECT jsonb_object_agg(kind,groups) FROM (SELECT kind,jsonb_object_agg(cohort,jsonb_build_object('net',net,'wins',wins,'losses',losses,'players',players)) groups FROM cohorts GROUP BY kind) g),
 'kingfish',jsonb_build_object('included',true,'user_id','47965354-0e56-43ef-931c-ddaab82af765',
 'cash_net',COALESCE((SELECT net FROM results WHERE kind='cash' AND user_id='47965354-0e56-43ef-931c-ddaab82af765'),0),
 'tournament_net',COALESCE((SELECT net FROM results WHERE kind='tournament' AND user_id='47965354-0e56-43ef-931c-ddaab82af765'),0)),
 'tournament_settlements',jsonb_build_object('checked',(SELECT count(*) FROM settlements),
 'unbalanced',(SELECT count(*) FROM settlements WHERE delta IS NULL OR delta<>0),
 'absolute_drift',COALESCE((SELECT sum(abs(delta)) FROM settlements),0),
 'off',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'delta',delta)) FROM settlements WHERE delta IS NULL OR delta<>0),'[]'::jsonb),
 'basis','Existing independent completed/cancelled paid non-spin tournament conservation check; lifetime event balances for events ending this Chicago day.'),
 'reconciliation',to_jsonb(a)||jsonb_build_object(
 'cash_residual',cash_net+cash_rake+bbj,
 'raw_residual',cash_net+tournament_net+cash_rake+tournament_rake+bbj,
 'accounted_residual',cash_net+tournament_net+cash_rake+tournament_rake+bbj+prize_liability_change+other_prize_movements,
 'incomplete_cash_hands',coverage.incomplete_hands,'invalid_cash_seats',coverage.invalid_seats,
 'unknown_players',(SELECT sum(players) FROM cohorts WHERE cohort='unknown'),
 'status',CASE WHEN NOT EXISTS(SELECT FROM public.sp_daily_metrics WHERE day=p_day) OR p_day>=(statement_timestamp() AT TIME ZONE 'America/Chicago')::date THEN 'unverified' WHEN EXISTS(SELECT FROM settlements WHERE delta IS NULL OR delta<>0) OR coverage.incomplete_hands>0 OR coverage.invalid_seats>0 OR EXISTS(SELECT FROM cohorts WHERE cohort='unknown' AND players>0)
 OR cash_net+cash_rake+bbj<>0 OR cash_net+tournament_net+cash_rake+tournament_rake+bbj+prize_liability_change+other_prize_movements<>0
 THEN 'discrepancy' ELSE 'balanced' END),
 'basis','Chicago calendar day; chips only, Diamond Arena excluded. Wins/losses are positive/negative player net results within each game type. Cash uses recorded completed-hand facts. Tournament uses posted wallet entries, rebuys, add-ons, prizes, bounties and refunds, not tournament play stacks. Kingfish is included among humans. Raw rake + BBJ + wins - losses is shown before the midnight prize-liability and other funding bridge. Balanced verifies these recorded flows, not every physical wallet or unrecorded transaction.') value
 FROM win,amounts a,coverage
) SELECT value FROM report);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_daily_results(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_daily_results(date) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.fn_sp_digest_daily_results(date)','EXECUTE')
 OR has_function_privilege('authenticated','public.fn_sp_digest_daily_results(date)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fn_sp_digest_daily_results(date)','EXECUTE') THEN
 RAISE EXCEPTION 'Daily results ACL failed'; END IF;
END $$;
COMMIT;
-- Rollback: DROP FUNCTION public.fn_sp_digest_daily_results(date);
