-- ═══════════════════════════════════════════════════════════════════════════
-- CRITICAL FIX: Add Missing SELECT Policy on Profiles Table
-- 
-- ROOT CAUSE: The profiles table only has an INSERT policy for signup,
-- but NO SELECT policy, which prevents ANY queries from reading profile data.
-- This causes all usernames and avatars to show as "Player" with default images.
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS on profiles table (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Allow signup profile creation" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT POLICY: Allow everyone (authenticated + anon) to read ALL profiles
-- This is CRITICAL for social features - users need to see other users' profiles
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT
    USING (true);  -- Allow all users to read all profiles

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT POLICY: Allow profile creation during signup (anon) and by authenticated users
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can insert own profile" ON profiles
    FOR INSERT
    WITH CHECK (true);  -- Allow signup flow to create profiles

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE POLICY: Users can only update their own profile
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════════════════
-- DELETE POLICY: Users can delete their own profile
-- ═══════════════════════════════════════════════════════════════════════════
CREATE POLICY "Users can delete own profile" ON profiles
    FOR DELETE
    USING (auth.uid() = id);

-- Verify policies were created
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;
