-- TIER 1: read-only service report. No financial rows or historical snapshots change.
-- Diamond Spins cohort uses the spin's Central day and immutable entry conversion.
-- Bonus rounds and card awards are followed through settlement; open liabilities
-- make profit provisional. Wheel awards are not confused with poker Spin tournaments.
BEGIN;
CREATE FUNCTION public.fn_sp_digest_spins_spend(p_day date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
SET statement_timeout='20s' AS $$
WITH spins AS MATERIALIZED (
 SELECT w.*, CASE WHEN p.is_horse THEN 'horses' WHEN p.id IS NULL THEN 'unknown' ELSE 'humans' END party
 FROM public.wheel_spins w LEFT JOIN public.profiles p ON p.id=w.user_id
 WHERE w.created_at >= p_day::timestamp AT TIME ZONE 'America/Chicago'
 AND w.created_at < (p_day+1)::timestamp AT TIME ZONE 'America/Chicago'
 AND NOT COALESCE(w.is_fixture,false)
), facts AS (
 SELECT w.party,w.id,
 COALESCE((w.receipt_v2->>'player_cost_diamonds')::numeric,w.spin_price_diamonds) collected,
 COALESCE((w.receipt_v2->>'player_cost_diamonds')::numeric,w.spin_price_diamonds)/NULLIF(w.diamonds_per_chip,0) entry_value,
 CASE WHEN w.outcome_kind='chips' THEN w.outcome_amount
      WHEN w.receipt_v2#>>'{secondary,outcome,kind}'='chips' THEN (w.receipt_v2#>>'{secondary,outcome,amount}')::numeric ELSE 0 END direct_chips,
 COALESCE(b.chips,0) bonus_chips, COALESCE(b.extra_diamonds,0) extra_diamonds,
 COALESCE(b.extra_diamonds,0)/NULLIF(w.diamonds_per_chip,0) extra_value,
 COALESCE(c.paid_diamonds,0) diamond_payout,
 COALESCE(c.paid_diamonds,0)/NULLIF(w.diamonds_per_chip,0) diamond_cost,
 COALESCE(b.pending,0)+CASE WHEN c.id IS NOT NULL AND c.picked_at IS NULL THEN 1 ELSE 0 END pending
 FROM spins w
 LEFT JOIN public.wheel_card_awards c ON c.spin_id=w.id
 LEFT JOIN LATERAL (
 SELECT sum(COALESCE(r.payout_chips,0)) chips,
 sum(GREATEST(COALESCE(r.bet_diamonds,0)-a.base_diamonds,0)) extra_diamonds,
 count(*) FILTER(WHERE r.id IS NULL OR r.settled_at IS NULL) pending
 FROM public.wheel_bonus_awards a LEFT JOIN public.diamond_game_round_book r
 ON r.id::text=COALESCE(a.result->>'id',a.result->>'round_id')
 WHERE a.spin_id=w.id
 ) b ON true
), groups AS (
 SELECT party,count(*) spins,sum(collected+extra_diamonds) diamonds_collected,
 round(sum(direct_chips),2) direct_chips_paid,round(sum(bonus_chips),2) bonus_chips_paid,
 round(sum(direct_chips+bonus_chips),2) chips_paid,sum(diamond_payout) diamonds_paid,
 round(sum(entry_value+extra_value-direct_chips-bonus_chips-diamond_cost),2) profit_chip_equivalent,
 sum(pending) pending_awards
 FROM facts GROUP BY GROUPING SETS ((party),())
), spend AS MATERIALIZED (
 SELECT l.category,l.from_type,l.to_type,l.amount,
 COALESCE(p.username,c.name,u.name,l.to_label,l.to_entity_id::text,'Unknown') recipient,
 CASE WHEN p.is_horse THEN 'horse' WHEN p.id IS NOT NULL THEN 'human' ELSE 'internal' END recipient_kind
 FROM public.chip_ledger l LEFT JOIN public.profiles p ON p.id=l.to_entity_id AND l.to_type='player_wallet'
 LEFT JOIN public.clubs c ON c.id=l.to_entity_id AND l.to_type='club_treasury'
 LEFT JOIN public.unions u ON u.id=l.to_entity_id AND l.to_type='union_wallet'
 WHERE l.created_at >= p_day::timestamp AT TIME ZONE 'America/Chicago'
 AND l.created_at < (p_day+1)::timestamp AT TIME ZONE 'America/Chicago'
 AND l.category IN ('promo_send','promo','leaderboard_payout','club_opening_allocation')
), recipients AS (
 SELECT category,from_type,to_type,recipient,recipient_kind,round(sum(amount),2) amount,count(*) transactions
 FROM spend GROUP BY 1,2,3,4,5
)
SELECT jsonb_build_object('day',p_day,'basis','Spin-day cohort; includes linked bonus-game and picked-card payouts as of report generation. Profit converts diamonds at each spin receipt rate, less actual chip and diamond payouts. Unsettled awards make profit provisional; this is not cash revenue.',
 'spins',COALESCE((SELECT jsonb_object_agg(COALESCE(party,'total'),to_jsonb(g)-'party') FROM groups g),'{}'),
 'spend',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY amount DESC,recipient) FROM recipients r),'[]'),
 'generated_at',clock_timestamp());
$$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_spins_spend(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_spins_spend(date) TO service_role;
DO $$ BEGIN
 IF has_function_privilege('anon','public.fn_sp_digest_spins_spend(date)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.fn_sp_digest_spins_spend(date)','EXECUTE') THEN
 RAISE EXCEPTION 'Digest financial report ACL failed'; END IF;
END $$;
COMMIT;
-- Rollback: DROP FUNCTION public.fn_sp_digest_spins_spend(date);
