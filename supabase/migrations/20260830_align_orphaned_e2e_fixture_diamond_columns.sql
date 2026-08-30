-- APPLIED TO PRODUCTION 2026-08-30.
--
-- CHECK 10 of the Pre-Deploy Safety Checks ("Diamond economy invariants") was
-- failing on `no_profiles_balance_drift` for EVERY World Hub pull request.
-- One profile drifted: club-arena-prod-e2e-2-20260830115258, created 17:00:14,
-- diamonds 500, diamond_balance 0 - a throwaway account left behind by the
-- "Post-Deploy E2E (production)" workflow, which ended "skipped" and never
-- cleaned up. The violation stopped being transient and became permanent, and
-- it blocks the whole estate with a message that reads like a live currency
-- defect.
--
-- Aligned DOWN to diamond_balance, never up: aligning up would MINT 500
-- diamonds from a migration, which is exactly the unledgered currency creation
-- the economy invariants exist to catch.
--
-- The CAUSE was in initialize_player_profile and is fixed separately, in
-- 20260830_signup_writes_both_diamond_columns.sql. This file only corrects the
-- row that was already there.

DO $$
DECLARE
    v_target int;
    v_fixed  int;
    v_left   int;
BEGIN
    SELECT count(*) INTO v_target
      FROM profiles
     WHERE username LIKE 'club-arena-prod-e2e%'
       AND coalesce(diamonds, 0) <> coalesce(diamond_balance, 0)
       AND created_at < now() - interval '10 minutes';

    IF v_target > 25 THEN
        RAISE EXCEPTION
            'refusing to rewrite % fixture profiles: that is not a stray test account', v_target;
    END IF;

    UPDATE profiles
       SET diamonds = coalesce(diamond_balance, 0),
           updated_at = now()
     WHERE username LIKE 'club-arena-prod-e2e%'
       AND coalesce(diamonds, 0) <> coalesce(diamond_balance, 0)
       AND created_at < now() - interval '10 minutes';
    GET DIAGNOSTICS v_fixed = ROW_COUNT;

    IF v_fixed <> v_target THEN
        RAISE EXCEPTION 'aligned % rows but had targeted %', v_fixed, v_target;
    END IF;

    SELECT count(*) INTO v_left
      FROM profiles
     WHERE coalesce(diamonds, 0) <> coalesce(diamond_balance, 0);

    IF v_left > 0 THEN
        RAISE EXCEPTION
            'aligned % fixture row(s) but % profile(s) still drift - these are not CI fixtures, investigate before deploying',
            v_fixed, v_left;
    END IF;

    RAISE NOTICE 'aligned % orphaned fixture profile(s); no balance drift remains', v_fixed;
END $$;
