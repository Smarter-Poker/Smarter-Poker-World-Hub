-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: Allow authenticated users to read ALL profiles for Find Friends
-- ═══════════════════════════════════════════════════════════════════════════
-- Issue: New users see infinite "Loading connections..." on /hub/friends
-- Cause: RLS policy only allows users to read their OWN profile
-- Fix: Add policy for authenticated users to read ALL profiles
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop restrictive policy that only allows viewing own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Add policy for authenticated users to read ALL profiles (needed for Find Friends, search, etc.)
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view all profiles" ON public.profiles
    FOR SELECT 
    TO authenticated
    USING (true);

-- Keep the public policy for username availability checks (anon users)
-- This should already exist, but ensure it does
DROP POLICY IF EXISTS "Public can check username availability" ON public.profiles;
CREATE POLICY "Public can check username availability" ON public.profiles
    FOR SELECT 
    TO anon
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ALSO FIX: friendships table needs read access for new users
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow authenticated users to view friendships (needed for mutual friends calculation)
DROP POLICY IF EXISTS "Users can view all friendships" ON public.friendships;
CREATE POLICY "Users can view all friendships" ON public.friendships
    FOR SELECT 
    TO authenticated
    USING (true);

-- Note: Keep existing insert/update/delete policies which correctly restrict to own user
