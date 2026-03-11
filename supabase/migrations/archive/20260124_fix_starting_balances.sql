-- ════════════════════════════════════════════════════════════════════════════════
-- FIX: Standard Starting Balances - 300 Diamonds, 100 XP
-- Ensures all new users start with consistent balances
-- ════════════════════════════════════════════════════════════════════════════════

-- Update the initialize_player_profile function with correct starting values
CREATE OR REPLACE FUNCTION initialize_player_profile(
    p_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_city TEXT,
    p_state TEXT,
    p_username TEXT
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
BEGIN
    -- Check if this is an employee (email ends with @smarter.poker)
    v_is_employee := (p_email ILIKE '%@smarter.poker');
    
    -- Assign player number based on tier
    IF v_is_employee THEN
        -- Employee tier: 1-100
        SELECT NEXTVAL('employee_number_seq') INTO v_player_number;
    ELSE
        -- Public player tier: 1250+
        SELECT NEXTVAL('public_player_number_seq') INTO v_player_number;
    END IF;
    
    -- Check if state is restricted (WA, ID, MI, NV, CA)
    v_is_restricted := p_state IN ('WA', 'ID', 'MI', 'NV', 'CA');
    v_access_tier := CASE WHEN v_is_restricted THEN 'Restricted_Tier' ELSE 'Full_Access' END;
    
    -- Insert or update the profile
    -- STANDARD STARTING BALANCES: 100 XP, 300 Diamonds (hardcoded)
    INSERT INTO profiles (
        id,
        player_number,
        full_name,
        email,
        phone,
        city,
        state,
        username,
        xp_total,
        diamonds,
        diamond_multiplier,
        streak_count,
        skill_tier,
        access_tier,
        email_verified,
        phone_verified,
        created_at,
        last_login
    ) VALUES (
        p_user_id,
        v_player_number,
        p_full_name,
        p_email,
        p_phone,
        p_city,
        p_state,
        p_username,
        100, -- HARDCODED: Starting XP = 100
        300, -- HARDCODED: Starting Diamonds = 300
        1.0,
        0,
        'Newcomer',
        v_access_tier,
        false,
        false,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        username = EXCLUDED.username,
        access_tier = EXCLUDED.access_tier,
        last_login = NOW(),
        player_number = COALESCE(profiles.player_number, v_player_number);
    
    -- Get the actual player_number
    SELECT p.player_number INTO v_player_number FROM profiles p WHERE p.id = p_user_id;
    
    RETURN QUERY SELECT v_player_number, true::BOOLEAN, 'Profile initialized'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
