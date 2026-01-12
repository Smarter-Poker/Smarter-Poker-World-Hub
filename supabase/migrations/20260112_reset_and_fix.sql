-- ════════════════════════════════════════════════════════════════════════════════
-- RESET DATABASE - Clear test users and fix player number system
-- Run this in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════════════════

-- Step 1: Delete all profiles (will cascade to related tables if set up)
DELETE FROM profiles;

-- Step 2: Reset the player number sequence to 1
ALTER SEQUENCE IF EXISTS player_number_seq RESTART WITH 1;
DROP SEQUENCE IF EXISTS player_number_seq;
CREATE SEQUENCE player_number_seq START WITH 1 INCREMENT BY 1;

-- Step 3: Recreate the initialize_player_profile function with correct starting values
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
BEGIN
    -- Get the next player number atomically
    SELECT NEXTVAL('player_number_seq') INTO v_player_number;
    
    -- Check if state is restricted (WA, ID, MI, NV, CA)
    v_is_restricted := p_state IN ('WA', 'ID', 'MI', 'NV', 'CA');
    v_access_tier := CASE WHEN v_is_restricted THEN 'Restricted_Tier' ELSE 'Full_Access' END;
    
    -- Insert or update the profile with correct starting values
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
        streak_days,
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
        50,  -- Starting XP (NO PURCHASE NECESSARY)
        300, -- Starting Diamonds (NO PURCHASE NECESSARY)
        1.0,
        0,
        'Newcomer',
        v_access_tier,
        false,  -- Email not verified yet
        false,  -- Phone not verified yet
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
        -- Only set player_number if it's NULL (first time)
        player_number = COALESCE(profiles.player_number, v_player_number);
    
    -- Get the actual player_number (in case of conflict/update)
    SELECT p.player_number INTO v_player_number FROM profiles p WHERE p.id = p_user_id;
    
    RETURN QUERY SELECT v_player_number, true::BOOLEAN, 'Profile initialized successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT USAGE ON SEQUENCE player_number_seq TO authenticated;
GRANT USAGE ON SEQUENCE player_number_seq TO anon;

-- Ensure profiles table has the access_tier column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_tier TEXT DEFAULT 'Full_Access';
