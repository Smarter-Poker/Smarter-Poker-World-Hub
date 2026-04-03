-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Harden initialize_player_profile RPC
-- • Remove dead xp_total column reference
-- • Standardize diamonds to 500 (was 300)
-- • Add is_vip, vip_tier, vip_expires_at so RPC path grants free VIP trial
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.initialize_player_profile(
    p_user_id UUID,
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_username TEXT DEFAULT NULL
)
RETURNS TABLE (
    player_number BIGINT,
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_player_number BIGINT;
    v_is_restricted BOOLEAN;
    v_access_tier TEXT;
    v_is_employee BOOLEAN;
    v_first_name TEXT;
    v_last_name TEXT;
BEGIN
    -- Split full_name into first/last
    v_first_name := split_part(COALESCE(p_full_name, ''), ' ', 1);
    v_last_name := CASE
      WHEN position(' ' in COALESCE(p_full_name, '')) > 0
      THEN substring(COALESCE(p_full_name, '') from position(' ' in COALESCE(p_full_name, '')) + 1)
      ELSE ''
    END;

    -- Check if this is an employee
    v_is_employee := (COALESCE(p_email, '') ILIKE '%@smarter.poker');

    -- Assign player number
    IF v_is_employee THEN
        SELECT NEXTVAL('employee_number_seq') INTO v_player_number;
    ELSE
        SELECT NEXTVAL('public_player_number_seq') INTO v_player_number;
    END IF;

    -- Check restricted states
    v_is_restricted := COALESCE(p_state, '') IN ('WA', 'ID', 'MI', 'NV', 'CA');
    v_access_tier := CASE WHEN v_is_restricted THEN 'Restricted_Tier' ELSE 'Full_Access' END;

    -- Insert or update profile (xp_total removed, VIP fields added)
    INSERT INTO profiles (
        id, player_number, full_name, first_name, last_name,
        email, phone, city, state, username,
        diamonds, diamond_multiplier, streak_count,
        skill_tier, access_tier, email_verified, phone_verified,
        is_vip, vip_tier, vip_expires_at,
        created_at, last_login
    ) VALUES (
        p_user_id, v_player_number, p_full_name, v_first_name, v_last_name,
        p_email, p_phone, p_city, p_state, p_username,
        500, 1.0, 0,
        'Newcomer', v_access_tier, false, false,
        true, 'monthly', NOW() + INTERVAL '30 days',
        NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        username = EXCLUDED.username,
        access_tier = EXCLUDED.access_tier,
        last_login = NOW(),
        player_number = COALESCE(profiles.player_number, v_player_number),
        -- Only grant VIP if user doesn't already have it
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
        END,
        -- Only grant diamonds if user has none
        diamonds = CASE
            WHEN profiles.diamonds IS NULL OR profiles.diamonds = 0 THEN 500
            ELSE profiles.diamonds
        END;

    -- Get the actual player_number
    SELECT p.player_number INTO v_player_number FROM profiles p WHERE p.id = p_user_id;

    RETURN QUERY SELECT v_player_number, true::BOOLEAN, 'Profile initialized'::TEXT;
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 0::BIGINT, false::BOOLEAN, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
