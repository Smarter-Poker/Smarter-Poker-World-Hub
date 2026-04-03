-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Remove xp_total from handle_new_user trigger
-- xp_total column was deleted months ago; trigger must stop referencing it
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_player_num BIGINT;
    generated_username TEXT;
    resolved_full_name TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    -- Resolve full_name from multiple possible metadata keys
    resolved_full_name := COALESCE(
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name', '')), ''),
        NULLIF(TRIM(
            COALESCE(NEW.raw_user_meta_data->>'given_name', '') || ' ' ||
            COALESCE(NEW.raw_user_meta_data->>'family_name', '')
        ), ''),
        ''
    );

    -- Extract first/last name natively
    v_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
    v_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');

    IF v_first_name = '' AND v_last_name = '' AND resolved_full_name != '' THEN
        v_first_name := split_part(resolved_full_name, ' ', 1);
        v_last_name := CASE
            WHEN position(' ' in resolved_full_name) > 0
            THEN substring(resolved_full_name from position(' ' in resolved_full_name) + 1)
            ELSE ''
        END;
    END IF;

    -- Generate username
    generated_username := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'poker_alias', ''),
        NULLIF(REGEXP_REPLACE(resolved_full_name, '[^a-zA-Z0-9]', '', 'g'), ''),
        SPLIT_PART(COALESCE(NEW.email, ''), '@', 1),
        'Player' || FLOOR(RANDOM() * 10000)::TEXT
    );
    generated_username := LEFT(generated_username, 15);

    -- Ensure atomic player sequence exists
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles_player_number_seq') THEN
        CREATE SEQUENCE public.profiles_player_number_seq START WITH 1260;
    END IF;

    SELECT nextval('public.profiles_player_number_seq') INTO next_player_num;

    -- Insert complete profile (xp_total removed — column no longer exists)
    INSERT INTO public.profiles (
        id,
        full_name,
        first_name,
        last_name,
        email,
        username,
        avatar_url,
        player_number,
        streak_count,
        diamonds,
        diamond_multiplier,
        skill_tier,
        access_tier,
        is_vip,
        vip_tier,
        vip_expires_at,
        created_at,
        updated_at,
        last_login,
        last_active,
        is_online
    ) VALUES (
        NEW.id,
        resolved_full_name,
        v_first_name,
        v_last_name,
        COALESCE(NEW.email, ''),
        generated_username,
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture',
            ''
        ),
        next_player_num,
        0,
        500,   -- Welcome diamonds bonus
        1.0,
        'Newcomer',
        CASE
            WHEN NEW.raw_user_meta_data->>'state' IN ('WA', 'ID', 'MI', 'NV', 'CA') THEN 'Restricted_Tier'
            ELSE 'Full_Access'
        END,
        true,
        'monthly',
        NOW() + INTERVAL '30 days',
        NOW(),
        NOW(),
        NOW(),
        NOW(),
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        last_login = NOW(),
        last_active = NOW(),
        is_online = true,
        full_name = CASE
            WHEN COALESCE(profiles.full_name, '') = '' THEN EXCLUDED.full_name
            ELSE profiles.full_name
        END,
        first_name = CASE
            WHEN COALESCE(profiles.first_name, '') = '' THEN EXCLUDED.first_name
            ELSE profiles.first_name
        END,
        last_name = CASE
            WHEN COALESCE(profiles.last_name, '') = '' THEN EXCLUDED.last_name
            ELSE profiles.last_name
        END,
        avatar_url = CASE
            WHEN COALESCE(profiles.avatar_url, '') = '' THEN EXCLUDED.avatar_url
            ELSE profiles.avatar_url
        END,
        player_number = COALESCE(profiles.player_number, EXCLUDED.player_number),
        diamonds = CASE
            WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500
            ELSE profiles.diamonds
        END,
        is_vip = CASE
            WHEN profiles.is_vip IS NULL OR profiles.is_vip = false THEN true
            ELSE profiles.is_vip
        END,
        vip_tier = CASE
            WHEN profiles.vip_tier IS NULL THEN 'monthly'
            ELSE profiles.vip_tier
        END,
        vip_expires_at = CASE
            WHEN profiles.vip_expires_at IS NULL THEN NOW() + INTERVAL '30 days'
            ELSE profiles.vip_expires_at
        END;

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        BEGIN
            INSERT INTO public.profiles (
                id, full_name, first_name, last_name, email, username, 
                diamonds, is_vip, vip_tier, vip_expires_at, created_at, last_login
            )
            VALUES (
                NEW.id,
                resolved_full_name,
                v_first_name,
                v_last_name,
                COALESCE(NEW.email, ''),
                generated_username || FLOOR(RANDOM() * 1000)::TEXT,
                500,
                true,
                'monthly',
                NOW() + INTERVAL '30 days',
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                diamonds = CASE
                    WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500
                    ELSE profiles.diamonds
                END,
                is_vip = CASE
                    WHEN profiles.is_vip IS NULL OR profiles.is_vip = false THEN true
                    ELSE profiles.is_vip
                END,
                vip_tier = CASE
                    WHEN profiles.vip_tier IS NULL THEN 'monthly'
                    ELSE profiles.vip_tier
                END,
                vip_expires_at = CASE
                    WHEN profiles.vip_expires_at IS NULL THEN NOW() + INTERVAL '30 days'
                    ELSE profiles.vip_expires_at
                END;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[ANTIGRAVITY] Profile retry failed: %', SQLERRM;
        END;
        RETURN NEW;
    WHEN OTHERS THEN
        RAISE WARNING '[ANTIGRAVITY] Profile creation failed: %', SQLERRM;
        RETURN NEW;
END;
$$;
