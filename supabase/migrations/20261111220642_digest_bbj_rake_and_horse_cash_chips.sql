-- TIER 1: read-only service report. No financial rows or historical snapshots change.
-- BBJ rake for the Central day, the trailing seven Central days (the Weekly Update
-- window) and the Central month to date, from the nightly snapshots of the chip
-- ledger's bbj_contribution rows (table stack to BBJ pool), the same snapshots the
-- email's rake figures come from.
-- The horse fleet's cash result in chips for the same Central days. Every chip cash
-- seat is a horse or another account, and a table's seats together lose exactly the
-- rake and BBJ the hand paid, so the horses' result is the day's cash rake and BBJ
-- (negated) less every other account's result. Other accounts' seats are read from
-- ca_hand_facts by account (a few thousand index reads), not the fleet's ~800,000
-- daily horse seats. The horses' rake and BBJ are what they paid to the house; what
-- is left is what they won or lost against the other players.
BEGIN;
CREATE FUNCTION public.fn_sp_digest_house_figures(p_day date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='30s' AS $$
WITH win AS MATERIALIZED (
 SELECT p_day d, p_day-6 wk, date_trunc('month',p_day)::date mo,
        (SELECT public.fn_diamond_arena_club()) da
), days AS MATERIALIZED (
 SELECT m.day,
 COALESCE((m.metrics#>>'{money,bbj_contributions}')::numeric,0) bbj,
 COALESCE((m.metrics#>>'{money,cash_rake}')::numeric,0) cash_rake,
 (m.metrics#>>'{play,horse_net_bb}')::numeric horse_net_bb_utc
 FROM public.sp_daily_metrics m, win
 WHERE m.day BETWEEN LEAST(win.wk,win.mo) AND win.d
), others AS MATERIALIZED (
 SELECT (f.played_at AT TIME ZONE 'America/Chicago')::date AS day,
 sum(f.net) net, sum(COALESCE(r.rake_amount,0)) rake,
 sum(COALESCE(r.bbj_attributed_contribution,0)) bbj
 FROM win, public.profiles p
 JOIN public.ca_hand_facts f ON f.user_id=p.id AND f.tournament_id IS NULL
 LEFT JOIN public.rake_attributions r ON r.hand_id=f.hand_id AND r.player_id=f.user_id AND r.club_id IS NOT NULL
 WHERE NOT COALESCE(p.is_horse,false)
 AND f.played_at >= LEAST(win.wk,win.mo)::timestamp AT TIME ZONE 'America/Chicago'
 AND f.played_at < (win.d+1)::timestamp AT TIME ZONE 'America/Chicago'
 AND f.club_id IS DISTINCT FROM win.da
 GROUP BY 1
), horse AS (
 SELECT d.day, d.bbj, d.horse_net_bb_utc,
 -(d.cash_rake+d.bbj)-COALESCE(o.net,0) net,
 d.cash_rake-COALESCE(o.rake,0) rake,
 d.bbj-COALESCE(o.bbj,0) bbj_paid,
 -(COALESCE(o.net,0)+COALESCE(o.rake,0)+COALESCE(o.bbj,0)) vs_others
 FROM days d LEFT JOIN others o ON o.day=d.day
), agg AS (
 SELECT
 (SELECT jsonb_build_object('net',round(net,2),'rake',round(rake,2),'bbj',round(bbj_paid,2),
   'vs_others',round(vs_others,2),'net_bb_utc',horse_net_bb_utc,'days',1)
  FROM horse, win WHERE horse.day=win.d) hd,
 (SELECT jsonb_build_object('net',round(sum(net),2),'rake',round(sum(rake),2),'bbj',round(sum(bbj_paid),2),
   'vs_others',round(sum(vs_others),2),'net_bb_utc',sum(horse_net_bb_utc),'days',count(*))
  FROM horse, win WHERE horse.day>=win.mo) hm,
 (SELECT round(bbj,2) FROM days, win WHERE days.day=win.d) bd,
 (SELECT round(sum(bbj),2) FROM days, win WHERE days.day>=win.wk) bw,
 (SELECT count(*) FROM days, win WHERE days.day>=win.wk) bwn,
 (SELECT round(sum(bbj),2) FROM days, win WHERE days.day>=win.mo) bm,
 (SELECT count(*) FROM days, win WHERE days.day>=win.mo) bmn
)
SELECT jsonb_build_object('day',win.d,'week_from',win.wk,'month_from',win.mo,
 'bbj_rake',jsonb_build_object('day',agg.bd,'week',agg.bw,'week_days',agg.bwn,'month',agg.bm,'month_days',agg.bmn),
 'horse_cash',jsonb_build_object('day',agg.hd,'month',CASE WHEN (agg.hm->>'days')::int>0 THEN agg.hm END),
 'basis','Central days from the nightly snapshots. BBJ rake is the cash pots'' bad beat jackpot drop. Horse cash result is chips: the day''s cash rake and BBJ less every other account''s cash result; tournaments are excluded.',
 'generated_at',clock_timestamp())
FROM win, agg;
$$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_house_figures(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_house_figures(date) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.fn_sp_digest_house_figures(date)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fn_sp_digest_house_figures(date)','EXECUTE') THEN
 RAISE EXCEPTION 'Digest house figures ACL failed'; END IF;
END $$;
COMMIT;
-- Rollback: DROP FUNCTION public.fn_sp_digest_house_figures(date);
