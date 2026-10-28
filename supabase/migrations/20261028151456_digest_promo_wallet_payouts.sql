-- TIER 1: include actual promo-wallet player payments, regardless of category.
-- A wheel/bonus award debits promo_wallet under its game category, not 'promo'.
-- Keep original installed source immutable; no wallet/ledger data changes.
BEGIN;
DO $patch$
DECLARE original text; updated text;
BEGIN
 original:=pg_get_functiondef('public.fn_sp_digest_spins_spend(date)'::regprocedure);
 updated:=replace(original,
 $old$AND l.category IN ('promo_send','promo','leaderboard_payout','club_opening_allocation')$old$,
 $new$AND (l.category IN ('promo_send','promo','leaderboard_payout','club_opening_allocation')
 OR (l.from_label IN ('union_wallets.promo_wallet','clubs.promo_wallet') AND l.to_type='player_wallet'))$new$);
 IF updated=original THEN RAISE EXCEPTION 'Unexpected digest report predecessor'; END IF;
 EXECUTE updated;
 IF has_function_privilege('anon','public.fn_sp_digest_spins_spend(date)','EXECUTE') THEN
 RAISE EXCEPTION 'Report lost its service-only ACL'; END IF;
END $patch$;
COMMIT;
