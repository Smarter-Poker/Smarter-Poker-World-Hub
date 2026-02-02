-- ═══════════════════════════════════════════════════════════════════════════════
-- CRITICAL FIX: Add All Missing Profile Columns for Signup
-- Run this IMMEDIATELY in Supabase Dashboard → SQL Editor
-- This fixes "Database error saving new user" on account creation
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Add player_number column (required for player ID assignment)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS player_number BIGINT;

-- 2. Add access_tier column (required for restricted state detection)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_tier TEXT DEFAULT 'Full_Access';

-- 3. Add streak_count column (RPC expects this, not streak_days)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0;

-- 4. Ensure email_verified exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- 5. Ensure phone_verified exists  
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- 6. Add avatar_url if missing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 7. Add role column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 8. Add display_name_preference for feed display
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name_preference TEXT DEFAULT 'full_name';

-- 9. Add card_back_preference (was causing errors earlier)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS card_back_preference TEXT DEFAULT 'white';

-- Create unique index on player_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_player_number ON profiles(player_number) WHERE player_number IS NOT NULL;

-- Grant necessary permissions for signup flow
GRANT INSERT ON profiles TO anon;
GRANT UPDATE ON profiles TO anon;

-- Create RLS policy to allow signup without auth (for initial profile creation)
DROP POLICY IF EXISTS "Allow signup profile creation" ON profiles;
CREATE POLICY "Allow signup profile creation" ON profiles
    FOR INSERT WITH CHECK (true);

-- Ensure the sequences exist for player numbers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'public_player_number_seq') THEN
        CREATE SEQUENCE public_player_number_seq START WITH 1250;
        GRANT USAGE ON SEQUENCE public_player_number_seq TO authenticated, anon;
    END IF;
END $$;

-- Verify the columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('player_number', 'access_tier', 'streak_count', 'email_verified', 'phone_verified', 'avatar_url', 'role', 'display_name_preference', 'card_back_preference')
ORDER BY column_name;
