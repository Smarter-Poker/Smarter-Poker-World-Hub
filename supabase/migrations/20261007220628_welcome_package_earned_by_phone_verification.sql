-- ═══════════════════════════════════════════════════════════════════════
-- 20261007220628_welcome_package_earned_by_phone_verification.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (Cowork session), owner instruction Dan 2026-10-07
-- AFFECTS:     function public.handle_new_user (trigger on auth.users)
-- IRREVERSIBLE: no (the previous body is reproduced in the rollback note)
--
-- WHY:
--   The signup form no longer collects a phone number (it was below the fold
--   on phones and blocked account creation). The welcome package - the 30-day
--   VIP card and the 500 welcome diamonds - is now EARNED by verifying a phone
--   on /hub/verify-phone after first login, and paid there by
--   pages/api/sms/verify-otp.js (VIP update + fn_ca_mint under signup:<uid>).
--   handle_new_user still granted both at birth, which would pay every new
--   account before any handset was proven. Phone verification is the single
--   strongest anti-multi-account control; the package now sits behind it.
--
-- HOW:
--   * handle_new_user inserts the profile with is_vip=false, vip_tier=NULL,
--     vip_expires_at=NULL instead of a 30-day card.
--   * The ON CONFLICT branch no longer re-grants VIP to an existing row.
--   * The fn_ca_mint('signup:<id>') call at birth is removed. The op id is
--     unchanged, so verify-otp.js mints under the same key and a player who
--     was already granted under the old flow replays as a no-op.
--   * Everything else (names, username, player number, restricted tier,
--     forensic signup_errors trail) is byte-for-byte the live behaviour.
--
-- ROLLBACK: reinstall the previous body (read from pg_get_functiondef on
--   2026-10-07 before this ran; it is the one in
--   20260813040000_fix_signup_diamond_balance_drift.sql plus the Mint block
--   added 2026-09-08) - or simply re-run the previous migration file.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'handle_new_user') THEN
        RAISE EXCEPTION 'pre-flight failed: public.handle_new_user not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone_verified') THEN
        RAISE EXCEPTION 'pre-flight failed: profiles.phone_verified not found';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    next_player_num BIGINT;
    generated_username TEXT;
    resolved_full_name TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    resolved_full_name := COALESCE(
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name', '')), ''),
        NULLIF(TRIM(
            COALESCE(NEW.raw_user_meta_data->>'given_name', '') || ' ' ||
            COALESCE(NEW.raw_user_meta_data->>'family_name', '')
        ), ''),
        ''
    );

    v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last_name  := COALESCE(NEW.raw_user_meta_data->>'last_name',  '');

    IF v_first_name = '' AND v_last_name = '' AND resolved_full_name <> '' THEN
        v_first_name := split_part(resolved_full_name, ' ', 1);
        v_last_name  := CASE
            WHEN position(' ' in resolved_full_name) > 0
            THEN substring(resolved_full_name from position(' ' in resolved_full_name) + 1)
            ELSE ''
        END;
    END IF;

    generated_username := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'poker_alias', ''),
        -- Never the legal name or the email's local part (ruling 25):
        -- a public handle the owner can change, unique by construction.
        'Player' || LEFT(REPLACE(NEW.id::text, '-', ''), 9)
    );
    generated_username := LEFT(generated_username, 15);

    -- If the derived username is reserved, fall back to Player<N> so the row
    -- never lands as @admin / @support / @smarterpoker / etc.
    IF public.is_reserved_username(generated_username) THEN
        generated_username := 'Player' || FLOOR(RANDOM() * 100000)::TEXT;
    END IF;

    SELECT nextval('public.profiles_player_number_seq') INTO next_player_num;

    -- THE WELCOME PACKAGE IS EARNED BY PHONE VERIFICATION (2026-10-07).
    -- The profile is born with no VIP card and 0 diamonds. Verifying a phone
    -- on /hub/verify-phone is what pays the 30-day VIP card and the 500
    -- welcome diamonds (pages/api/sms/verify-otp.js, Mint op id signup:<id>).
    INSERT INTO public.profiles (
        id, full_name, first_name, last_name, email, username, avatar_url,
        player_number, streak_count, diamonds, diamond_balance, diamond_multiplier, skill_tier,
        access_tier, is_vip, vip_tier, vip_expires_at,
        created_at, updated_at, last_login, last_active, is_online
    ) VALUES (
        NEW.id, resolved_full_name, v_first_name, v_last_name,
        COALESCE(NEW.email, ''), generated_username,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url',
                 NEW.raw_user_meta_data->>'picture', ''),
        next_player_num, 0, 0, 0, 1.0, 'Newcomer',
        CASE
            WHEN NEW.raw_user_meta_data->>'state' IN ('WA','ID','MI','NV','CA') THEN 'Restricted_Tier'
            ELSE 'Full_Access'
        END,
        false, NULL, NULL,
        NOW(), NOW(), NOW(), NOW(), true
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login    = NOW(),
        last_active   = NOW(),
        is_online     = true,
        full_name     = CASE WHEN COALESCE(profiles.full_name, '') = '' THEN EXCLUDED.full_name ELSE profiles.full_name END,
        first_name    = CASE WHEN COALESCE(profiles.first_name, '') = '' THEN EXCLUDED.first_name ELSE profiles.first_name END,
        last_name     = CASE WHEN COALESCE(profiles.last_name, '') = '' THEN EXCLUDED.last_name ELSE profiles.last_name END,
        avatar_url    = CASE WHEN COALESCE(profiles.avatar_url, '') = '' THEN EXCLUDED.avatar_url ELSE profiles.avatar_url END,
        player_number = COALESCE(profiles.player_number, EXCLUDED.player_number);

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Defensive: never block auth.users INSERT, but DO leave a forensic trail.
    BEGIN
      INSERT INTO public.signup_errors (user_id, email, trigger_name, error_code, error_msg, raw_meta)
      VALUES (NEW.id, NEW.email, 'handle_new_user', SQLSTATE, SQLERRM, NEW.raw_user_meta_data);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END;
$function$;

-- POST-APPLY ASSERTIONS
DO $$
DECLARE v_src TEXT;
BEGIN
    SELECT pg_get_functiondef('public.handle_new_user'::regproc) INTO v_src;
    IF v_src LIKE '%fn_ca_mint%' THEN
        RAISE EXCEPTION 'post-apply failed: handle_new_user still mints at birth';
    END IF;
    IF v_src NOT LIKE '%EARNED BY PHONE VERIFICATION%' THEN
        RAISE EXCEPTION 'post-apply failed: new handle_new_user body not installed';
    END IF;
END $$;

COMMIT;
