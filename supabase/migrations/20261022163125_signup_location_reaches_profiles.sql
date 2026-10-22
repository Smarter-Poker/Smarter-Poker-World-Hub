-- ═══════════════════════════════════════════════════════════════════════
-- 20261022163125_signup_location_reaches_profiles.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (signup country audit, 2026-10-22)
-- AFFECTS:     function public.handle_new_user (trigger on_auth_user_created);
--              public.profiles.city / state / country (backfill, null-only)
-- IRREVERSIBLE: no
--
-- WHY:
-- Signup writes city, state and (since PR #2530) country into auth user
-- metadata. handle_new_user creates the profile row first and never copied
-- them, so /api/auth/ensure-profile always found an existing profile and its
-- insert (the only code that copied them) never ran. Measured 2026-10-22: of
-- 33 signups in 60 days with a state in metadata, 0 had it on the profile,
-- and the first player to sign up from outside the US lost the country.
--
-- WHAT:
-- 1. handle_new_user, otherwise byte-for-byte unchanged, now inserts city,
--    state and country from metadata, and on conflict fills them only where
--    the profile has none (never overwriting a value the player set).
-- 2. Backfill, null-only: copy metadata city/state/country onto profiles that
--    lack them. Signups before 2026-10-22 could only choose a US state, so a
--    metadata state with no metadata country means United States.
--
-- ROLLBACK: re-apply handle_new_user from
-- 20261007220628_welcome_package_earned_by_phone_verification.sql. The
-- backfill only filled empty fields with what the player typed at signup.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    next_player_num TEXT;
    generated_username TEXT;
    resolved_full_name TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
    v_city TEXT;
    v_state TEXT;
    v_country TEXT;
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

    -- Signup location (pages/auth/signup.js). Country is set by every email
    -- signup since 2026-10-22; state only for players in the United States.
    v_city    := LEFT(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'city', '')), ''), 100);
    v_state   := LEFT(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'state', '')), ''), 100);
    v_country := LEFT(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'country', '')), ''), 100);

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

    SELECT public.fn_next_player_number() INTO next_player_num;

    -- THE WELCOME PACKAGE IS EARNED BY PHONE VERIFICATION (2026-10-07).
    -- The profile is born with no VIP card and 0 diamonds. Verifying a phone
    -- on /hub/verify-phone is what pays the 30-day VIP card and the 500
    -- welcome diamonds (pages/api/sms/verify-otp.js, Mint op id signup:<id>).
    INSERT INTO public.profiles (
        id, full_name, first_name, last_name, email, username, avatar_url,
        player_number, streak_count, diamonds, diamond_balance, diamond_multiplier, skill_tier,
        access_tier, is_vip, vip_tier, vip_expires_at,
        city, state, country,
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
        v_city, v_state, v_country,
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
        city          = CASE WHEN COALESCE(profiles.city, '') = '' THEN EXCLUDED.city ELSE profiles.city END,
        state         = CASE WHEN COALESCE(profiles.state, '') = '' THEN EXCLUDED.state ELSE profiles.state END,
        country       = CASE WHEN COALESCE(profiles.country, '') = '' THEN EXCLUDED.country ELSE profiles.country END,
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

-- Backfill: null-only, from what each player typed at signup.
UPDATE public.profiles p
SET city    = CASE WHEN COALESCE(p.city, '') = ''
                   THEN LEFT(NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'city', '')), ''), 100)
                   ELSE p.city END,
    state   = CASE WHEN COALESCE(p.state, '') = ''
                   THEN LEFT(NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'state', '')), ''), 100)
                   ELSE p.state END,
    country = CASE WHEN COALESCE(p.country, '') = ''
                   THEN COALESCE(
                       LEFT(NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'country', '')), ''), 100),
                       CASE WHEN NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'state', '')), '') IS NOT NULL
                            THEN 'United States' END)
                   ELSE p.country END
FROM auth.users u
WHERE u.id = p.id
  AND (
        (COALESCE(p.city, '') = ''    AND NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'city', '')), '') IS NOT NULL)
     OR (COALESCE(p.state, '') = ''   AND NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'state', '')), '') IS NOT NULL)
     OR (COALESCE(p.country, '') = '' AND (NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'country', '')), '') IS NOT NULL
                                           OR NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'state', '')), '') IS NOT NULL))
  );

-- Assert: no profile is left missing a location its signup supplied.
DO $assert$
DECLARE v_missing int;
BEGIN
    SELECT count(*) INTO v_missing
    FROM public.profiles p JOIN auth.users u ON u.id = p.id
    WHERE (COALESCE(p.state, '') = '' AND NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'state', '')), '') IS NOT NULL)
       OR (COALESCE(p.country, '') = '' AND NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'country', '')), '') IS NOT NULL)
       OR (COALESCE(p.city, '') = '' AND NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'city', '')), '') IS NOT NULL);
    IF v_missing <> 0 THEN
        RAISE EXCEPTION 'signup location backfill left % profiles without their signup location', v_missing;
    END IF;
END
$assert$;

COMMIT;
