-- APPLIED TO PRODUCTION 2026-08-30.
--
-- SIGNUP GRANTED A WELCOME BONUS TO ONE HALF OF A MIRRORED PAIR.
--
-- profiles.diamonds and profiles.diamond_balance are a mirrored pair. That is
-- not folklore: two invariants CHECK 10 enforces are named
-- add_diamonds_writes_both_balance_columns and
-- deduct_diamonds_writes_both_balance_columns, and a third,
-- no_profiles_balance_drift, fails the build whenever any profile has the two
-- disagreeing.
--
-- initialize_player_profile inserted the 500 diamond welcome bonus into
-- `diamonds` and never mentioned `diamond_balance`, which took its column
-- default of 0. Every profile it created was born violating the invariant its
-- own repo enforces - and the failure lands on whoever opens the NEXT pull
-- request, as a red "Diamond economy invariants" check that reads exactly like
-- a live currency defect.
--
-- ON CONFLICT is deliberately untouched: its DO UPDATE branch never writes
-- either diamond column, so a returning player's balance is not rewritten by a
-- re-initialise. Only the INSERT branch, which mints the bonus, is corrected.
--
-- THIS CREATES NO CURRENCY. It writes the SAME 500 to the second column of a
-- pair required to hold one value.
--
-- Edited via pg_get_functiondef with asserted replacements rather than
-- retyping ~90 lines of profile bootstrap, referral and VIP logic: a silent
-- no-op replacement in a signup path is the kind of quiet bug this function
-- has already produced once.

DO $$
DECLARE
    v_src text;
    v_new text;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'initialize_player_profile';

    IF v_src IS NULL THEN
        RAISE EXCEPTION 'initialize_player_profile not found';
    END IF;

    IF position('diamond_balance' in v_src) > 0 THEN
        RAISE NOTICE 'initialize_player_profile already writes diamond_balance; no change';
        RETURN;
    END IF;

    IF position('diamonds, diamond_multiplier, streak_count,' in v_src) = 0 THEN
        RAISE EXCEPTION 'column-list anchor not found; the function has changed shape, edit it by hand';
    END IF;
    v_new := replace(v_src,
        'diamonds, diamond_multiplier, streak_count,',
        'diamonds, diamond_balance, diamond_multiplier, streak_count,');

    IF position('        500, 1.0, 0,' in v_new) = 0 THEN
        RAISE EXCEPTION 'values anchor not found; the function has changed shape, edit it by hand';
    END IF;
    v_new := replace(v_new, '        500, 1.0, 0,', '        500, 500, 1.0, 0,');

    IF v_new = v_src THEN
        RAISE EXCEPTION 'replacements produced no change';
    END IF;

    EXECUTE v_new;

    SELECT pg_get_functiondef(p.oid) INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'initialize_player_profile';

    IF position('diamond_balance' in v_src) = 0 THEN
        RAISE EXCEPTION 'post-condition failed: diamond_balance still absent';
    END IF;
    IF position('ON CONFLICT (id) DO UPDATE' in v_src) = 0 THEN
        RAISE EXCEPTION 'post-condition failed: the ON CONFLICT branch was lost';
    END IF;

    RAISE NOTICE 'initialize_player_profile now seeds both diamond columns';
END $$;
