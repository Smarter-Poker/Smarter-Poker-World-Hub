-- ============================================================================
-- FIX: every new signup created 500 diamonds of balance drift.
--
-- SYMPTOM
-- The economy invariant `no_profiles_balance_drift` was failing, which is what
-- turned CI red on main (CHECK 10). One profile: diamonds = 500,
-- diamond_balance = 0, zero rows in diamond_transactions.
--
-- ROOT CAUSE
-- public.handle_new_user (the AFTER INSERT trigger on auth.users) grants a
-- 500-diamond welcome bonus, but writes only `diamonds`:
--
--     INSERT INTO public.profiles (... diamonds, diamond_multiplier ...)
--          VALUES (... 500,          1.0 ...)
--
-- `diamond_balance` defaults to 0 and was never set. The two columns are
-- mirrors of each other -- add_diamonds and deduct_diamonds were fixed in
-- 20260806180000 to write both -- but signup was still writing only one. So
-- EVERY new user drifted by 500 until their first credit or debit happened to
-- resync the pair. It is not a one-off: it recurs on every signup.
--
-- Reproduced end-to-end before writing this fix, by inserting into auth.users
-- inside a transaction that was then rolled back:
--
--     signup trigger fired -> diamonds=500 diamond_balance=0 => DRIFT
--
-- and asserted again after the fix, below.
--
-- WHY diamonds IS THE AUTHORITATIVE SIDE
-- The 500 is a deliberate welcome bonus written by the trigger; the 0 is merely
-- an unset default. So the reconciliation sets diamond_balance := diamonds, and
-- the user keeps the bonus they were meant to get.
--
-- SCOPE OF THE FIX -- deliberately minimal.
-- This mirrors the column and nothing else. It does NOT add a
-- diamond_transactions row for the welcome bonus, even though the absence of
-- one means the 500 is unledgered. Writing to a second table from inside the
-- signup trigger would put profile creation at risk: the trigger body is
-- wrapped in EXCEPTION WHEN OTHERS, so a failure in a ledger INSERT would
-- abort the whole block and the profile row with it. Logged as follow-up
-- instead. The welcome-bonus AMOUNT is not changed either -- that is Dan's
-- call, not a defect.
-- ============================================================================

DO $$
DECLARE
    def       text;
    patched   text;
    n         int;

    -- Exact source fragments, read from pg_get_functiondef immediately before
    -- writing this migration.
    col_old   text := 'player_number, streak_count, diamonds, diamond_multiplier, skill_tier,';
    col_new   text := 'player_number, streak_count, diamonds, diamond_balance, diamond_multiplier, skill_tier,';

    val_old   text := 'next_player_num, 0, 500, 1.0, ''Newcomer'',';
    val_new   text := 'next_player_num, 0, 500, 500, 1.0, ''Newcomer'',';

    upd_old   text := 'diamonds      = CASE WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500 ELSE profiles.diamonds END,';
    upd_new   text := 'diamonds      = CASE WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500 ELSE profiles.diamonds END,'
                   || E'\n        diamond_balance = CASE WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500 ELSE profiles.diamonds END,';
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
     WHERE n2.nspname = 'public' AND p.proname = 'handle_new_user';

    IF def IS NULL THEN
        RAISE EXCEPTION 'handle_new_user not found';
    END IF;

    -- Idempotency: if diamond_balance is already handled, do nothing.
    IF position('diamond_balance' in def) > 0 THEN
        RAISE NOTICE 'handle_new_user already writes diamond_balance; skipping patch';
        RETURN;
    END IF;

    -- Each fragment must appear EXACTLY once. If the function has been edited
    -- since, abort rather than patch the wrong place or silently no-op.
    FOR n, patched IN
        SELECT 1, x FROM (VALUES (col_old), (val_old), (upd_old)) v(x)
    LOOP
        IF (length(def) - length(replace(def, patched, ''))) / NULLIF(length(patched), 0) <> 1 THEN
            RAISE EXCEPTION
                'pre-flight: expected exactly 1 occurrence of fragment, found a different count. Fragment: %',
                left(patched, 80);
        END IF;
    END LOOP;

    patched := replace(def, col_old, col_new);
    patched := replace(patched, val_old, val_new);
    patched := replace(patched, upd_old, upd_new);

    IF patched = def THEN
        RAISE EXCEPTION 'pre-flight: patch produced no change';
    END IF;

    EXECUTE patched;
END $$;

-- ---------------------------------------------------------------------------
-- RECONCILE existing drift.
--
-- Only rows whose drift is explained by the signup bug are touched: no ledger
-- history at all, so nothing can have legitimately moved the two columns apart.
-- Any OTHER drifting row is left alone deliberately and made to fail the
-- assertion below, because it would mean a cause this migration has not
-- diagnosed -- and guessing at a balance is how you mint or destroy money.
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
   SET diamond_balance = p.diamonds
 WHERE p.diamond_balance IS DISTINCT FROM p.diamonds
   AND NOT EXISTS (SELECT 1 FROM public.diamond_transactions t WHERE t.user_id = p.id);

-- ---------------------------------------------------------------------------
-- POST-APPLY ASSERTIONS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    n_drift int;
    detail  text;
    uid     uuid := gen_random_uuid();
    d int; b int;
BEGIN
    -- 1. No drift remains anywhere.
    SELECT count(*), string_agg(id::text || ' (' || diamonds || ' vs ' || coalesce(diamond_balance, -1) || ')', ', ')
      INTO n_drift, detail
      FROM public.profiles
     WHERE diamond_balance IS DISTINCT FROM diamonds;
    IF n_drift > 0 THEN
        RAISE EXCEPTION
            'post-apply: % profile(s) still drifting, and they have ledger history so this migration will not guess: %',
            n_drift, detail;
    END IF;

    -- 2. The invariant the CI check runs must now pass.
    IF NOT (SELECT ok FROM public.economy_invariants() WHERE check_name = 'no_profiles_balance_drift') THEN
        RAISE EXCEPTION 'post-apply: economy invariant no_profiles_balance_drift still reports failure';
    END IF;

    -- 3. BEHAVIOURAL, end to end: drive a real signup through the trigger and
    --    require the two columns to agree. This is the same probe that
    --    reproduced the bug (diamonds=500, diamond_balance=0) before the fix.
    --    Rolled back via the surrounding subtransaction.
    BEGIN
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                                email_confirmed_at, created_at, updated_at,
                                raw_user_meta_data, raw_app_meta_data)
        VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'drift-assert-' || uid || '@example.invalid', '', now(), now(), now(),
                '{}'::jsonb, '{}'::jsonb);

        SELECT diamonds, diamond_balance INTO d, b FROM public.profiles WHERE id = uid;

        IF d IS NULL THEN
            RAISE EXCEPTION 'ASSERT_FAIL: signup trigger created no profile row';
        END IF;
        IF d IS DISTINCT FROM b THEN
            RAISE EXCEPTION 'ASSERT_FAIL: new signup still drifts -- diamonds=% diamond_balance=%', d, b;
        END IF;
        IF d <> 500 THEN
            RAISE EXCEPTION 'ASSERT_FAIL: welcome bonus changed unexpectedly -- expected 500, got %', d;
        END IF;

        -- Undo the probe. Raise to roll the subtransaction back cleanly.
        RAISE EXCEPTION 'ROLLBACK_PROBE_OK';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE 'ASSERT_FAIL:%' THEN
                RAISE;                        -- a real failure: propagate
            ELSIF SQLERRM <> 'ROLLBACK_PROBE_OK' THEN
                RAISE EXCEPTION 'post-apply: signup probe errored unexpectedly: %', SQLERRM;
            END IF;
            -- ROLLBACK_PROBE_OK: assertions passed, probe rolled back.
    END;

    RAISE NOTICE 'post-apply: 0 drift, invariant green, and a simulated signup now writes both columns';
END $$;
