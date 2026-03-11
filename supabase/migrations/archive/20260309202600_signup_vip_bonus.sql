-- ====================================================================================
-- VIP Signup Bonus Grant Migration
-- Grants: 500 Diamonds + 3 Month VIP Card
-- Migration Date: March 9, 2026
-- ORB-0 Hardened: March 9, 2026 — TOCTOU fix, diamond-overwrite fix
-- ====================================================================================

-- FIX-3: Atomic player_number sequence (replaces racy MAX() read-then-write)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'profiles_player_number_seq') THEN
        CREATE SEQUENCE public.profiles_player_number_seq START WITH 1255;
        -- Advance to current max so no collisions
        PERFORM setval('public.profiles_player_number_seq',
            COALESCE((SELECT MAX(player_number) FROM public.profiles), 1254));
    END IF;
END $$;

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
    -- Resolve full name from multiple possible metadata keys
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

    -- Get the next player number (atomic — no TOCTOU race)
    SELECT nextval('public.profiles_player_number_seq') INTO next_player_num;

    -- Insert profile with new VIP and 500 Diamond bonus
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
        is_vip,
        vip_tier,
        vip_expires_at,
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
        500,   -- Welcome diamonds bonus (Updated from 300)
        1.0,
        'Newcomer',
        CASE
            WHEN NEW.raw_user_meta_data->>'state' IN ('WA', 'ID', 'MI', 'NV', 'CA') THEN 'Restricted_Tier'
            ELSE 'Full_Access'
        END,
        true,
        'quarterly',
        NOW() + INTERVAL '3 months',
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
        avatar_url = CASE
            WHEN COALESCE(profiles.avatar_url, '') = '' THEN EXCLUDED.avatar_url
            ELSE profiles.avatar_url
        END,
        player_number = COALESCE(profiles.player_number, EXCLUDED.player_number),
        xp_total = COALESCE(profiles.xp_total, EXCLUDED.xp_total),
        -- ORB-0 FIX: Preserve existing balances — only grant bonus if user has none
        diamonds = CASE
            WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500
            ELSE profiles.diamonds
        END,
        is_vip = CASE
            WHEN profiles.is_vip IS NULL OR profiles.is_vip = false THEN true
            ELSE profiles.is_vip
        END,
        vip_tier = CASE
            WHEN profiles.vip_tier IS NULL THEN 'quarterly'
            ELSE profiles.vip_tier
        END,
        vip_expires_at = CASE
            WHEN profiles.vip_expires_at IS NULL THEN NOW() + INTERVAL '3 months'
            ELSE profiles.vip_expires_at
        END;

    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- Username already taken - try with a random suffix
        BEGIN
            INSERT INTO public.profiles (id, full_name, email, username, diamonds, is_vip, vip_tier, vip_expires_at, created_at, last_login)
            VALUES (
                NEW.id,
                resolved_name,
                COALESCE(NEW.email, ''),
                generated_username || FLOOR(RANDOM() * 1000)::TEXT,
                500,
                true,
                'quarterly',
                NOW() + INTERVAL '3 months',
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                -- ORB-0 FIX: Preserve existing balances in retry path
                diamonds = CASE
                    WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500
                    ELSE profiles.diamonds
                END,
                is_vip = CASE
                    WHEN profiles.is_vip IS NULL OR profiles.is_vip = false THEN true
                    ELSE profiles.is_vip
                END,
                vip_tier = CASE
                    WHEN profiles.vip_tier IS NULL THEN 'quarterly'
                    ELSE profiles.vip_tier
                END,
                vip_expires_at = CASE
                    WHEN profiles.vip_expires_at IS NULL THEN NOW() + INTERVAL '3 months'
                    ELSE profiles.vip_expires_at
                END;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[ANTIGRAVITY] Profile creation retry failed for %: %', NEW.id, SQLERRM;
        END;
        RETURN NEW;
    WHEN OTHERS THEN
        RAISE WARNING '[ANTIGRAVITY] Profile creation failed for %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;
