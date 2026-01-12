-- ════════════════════════════════════════════════════════════════════════════════
-- PLAYER NUMBER SYSTEM
-- Universal identifier across PokerIQ, Diamond Arena, Club Arena
-- Used for referrals and role identification
-- ════════════════════════════════════════════════════════════════════════════════

-- Add player_number column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS player_number BIGINT UNIQUE;

-- Create sequence for player numbers starting at 1
CREATE SEQUENCE IF NOT EXISTS player_number_seq START WITH 1 INCREMENT BY 1;

-- Create function to get next player number atomically
CREATE OR REPLACE FUNCTION get_next_player_number()
RETURNS BIGINT AS $$
DECLARE
    next_num BIGINT;
BEGIN
    SELECT NEXTVAL('player_number_seq') INTO next_num;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Create function to initialize user profile with player number
-- This ensures atomic assignment of player numbers
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
BEGIN
    -- Get the next player number atomically
    v_player_number := get_next_player_number();
    
    -- Insert or update the profile
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
        0,
        0,
        1.0,
        0,
        'Newcomer',
        true,
        true,
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
        email_verified = true,
        phone_verified = true,
        last_login = NOW(),
        -- Only set player_number if it's NULL (first time)
        player_number = COALESCE(profiles.player_number, v_player_number);
    
    -- Get the actual player_number (in case of conflict/update)
    SELECT p.player_number INTO v_player_number FROM profiles p WHERE p.id = p_user_id;
    
    RETURN QUERY SELECT v_player_number, true::BOOLEAN, 'Profile initialized successfully'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Create index for fast player number lookups
CREATE INDEX IF NOT EXISTS idx_profiles_player_number ON profiles(player_number);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_next_player_number() TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_player_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Add role column for Club Arena roles
-- player, agent, super_agent, club_admin, club_owner, union_owner
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS club_role TEXT DEFAULT 'player';

-- Add referred_by column for referral tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by BIGINT REFERENCES profiles(player_number);

-- Create index for referral lookups
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);

COMMENT ON COLUMN profiles.player_number IS 'Universal player identifier across PokerIQ, Diamond Arena, and Club Arena';
COMMENT ON COLUMN profiles.club_role IS 'Club Arena role: player, agent, super_agent, club_admin, club_owner, union_owner';
COMMENT ON COLUMN profiles.referred_by IS 'Player number of the user who referred this player';
