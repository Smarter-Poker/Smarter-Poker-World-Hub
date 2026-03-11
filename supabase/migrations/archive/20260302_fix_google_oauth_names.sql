-- ════════════════════════════════════════════════════════════════════════════════
-- FIX: Google OAuth Profile Names
-- ════════════════════════════════════════════════════════════════════════════════
-- PROBLEM: Google OAuth stores name as 'name' (+ given_name, family_name),
--          but the trigger only reads 'full_name' which is set by email signups.
--          This causes Google users to get blank names.
-- SOLUTION: Read from multiple metadata keys with fallback chain.
-- ════════════════════════════════════════════════════════════════════════════════
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ════════════════════════════════════════════════════════════════════════════════

-- Step 1: Update the trigger to handle Google OAuth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_player_num INT;
    generated_username TEXT;
    resolved_name TEXT;
BEGIN
    -- Resolve full name from multiple possible metadata keys:
    -- Email/password signup: 'full_name'
    -- Google OAuth: 'name', or 'given_name' + 'family_name'
    resolved_name := COALESCE(
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name', '')), ''),
        NULLIF(TRIM(
            COALESCE(NEW.raw_user_meta_data->>'given_name', '') || ' ' ||
            COALESCE(NEW.raw_user_meta_data->>'family_name', '')
        ), ''),
        ''
    );

    -- Generate username from poker_alias, email prefix, or name
    generated_username := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'poker_alias', ''),
        NULLIF(REGEXP_REPLACE(resolved_name, '[^a-zA-Z0-9]', '', 'g'), ''),
        SPLIT_PART(COALESCE(NEW.email, ''), '@', 1),
        'Player' || FLOOR(RANDOM() * 10000)::TEXT
    );

    -- Truncate username to 15 chars
    generated_username := LEFT(generated_username, 15);

    -- Get the next player number
    SELECT COALESCE(MAX(player_number), 1254) + 1 INTO next_player_num FROM public.profiles;

    -- Insert profile with all defaults
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        username,
        avatar_url,
        player_number,
        streak_count,
        xp_total,
        diamonds,
        diamond_multiplier,
        skill_tier,
        access_tier,
        created_at,
        last_login,
        last_active,
        is_online
    ) VALUES (
        NEW.id,
        resolved_name,
        COALESCE(NEW.email, ''),
        generated_username,
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture',
            ''
        ),
        next_player_num,
        0,
        100,   -- Welcome XP bonus
        300,   -- Welcome diamonds bonus
        1.0,
        'Newcomer',
        CASE
            WHEN NEW.raw_user_meta_data->>'state' IN ('WA', 'ID', 'MI', 'NV', 'CA') THEN 'Restricted_Tier'
            ELSE 'Full_Access'
        END,
        NOW(),
        NOW(),
        NOW(),
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login = NOW(),
        last_active = NOW(),
        is_online = true,
        -- Update name/avatar if they were blank before (fixes existing Google users)
        full_name = CASE
            WHEN COALESCE(profiles.full_name, '') = '' THEN EXCLUDED.full_name
            ELSE profiles.full_name
        END,
        avatar_url = CASE
            WHEN COALESCE(profiles.avatar_url, '') = '' THEN EXCLUDED.avatar_url
            ELSE profiles.avatar_url
        END,
        -- Only update these if they're null
        player_number = COALESCE(profiles.player_number, EXCLUDED.player_number),
        xp_total = COALESCE(profiles.xp_total, EXCLUDED.xp_total),
        diamonds = COALESCE(profiles.diamonds, EXCLUDED.diamonds);

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Username already taken - try with a random suffix
        BEGIN
            INSERT INTO public.profiles (id, full_name, email, username, created_at, last_login)
            VALUES (
                NEW.id,
                resolved_name,
                COALESCE(NEW.email, ''),
                generated_username || FLOOR(RANDOM() * 1000)::TEXT,
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[ANTIGRAVITY] Profile creation retry failed for %: %', NEW.id, SQLERRM;
        END;
        RETURN NEW;
    WHEN OTHERS THEN
        -- LOG THE ERROR BUT DON'T FAIL - auth should still succeed
        RAISE WARNING '[ANTIGRAVITY] Profile creation failed for %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Step 2: Recreate the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Step 3: Grant permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;

-- Step 4: Fix existing Google OAuth users with blank names
UPDATE public.profiles p
SET
    full_name = COALESCE(
        NULLIF(TRIM(COALESCE(au.raw_user_meta_data->>'name', '')), ''),
        NULLIF(TRIM(
            COALESCE(au.raw_user_meta_data->>'given_name', '') || ' ' ||
            COALESCE(au.raw_user_meta_data->>'family_name', '')
        ), ''),
        p.full_name
    ),
    avatar_url = CASE
        WHEN COALESCE(p.avatar_url, '') = '' THEN COALESCE(
            au.raw_user_meta_data->>'avatar_url',
            au.raw_user_meta_data->>'picture',
            ''
        )
        ELSE p.avatar_url
    END
FROM auth.users au
WHERE p.id = au.id
  AND (p.full_name IS NULL OR p.full_name = '' OR p.full_name LIKE 'User %')
  AND (
    au.raw_user_meta_data->>'name' IS NOT NULL
    OR au.raw_user_meta_data->>'given_name' IS NOT NULL
  );

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates profile with real name from OAuth providers (Google name/given_name/family_name) or email signup (full_name). Never fails.';

SELECT 'Google OAuth name fix complete!' as status;
