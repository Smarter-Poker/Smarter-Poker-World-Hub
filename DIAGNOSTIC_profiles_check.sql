-- ============================================================================
-- DIAGNOSTIC: Check Profiles Table State
-- Run this in Supabase SQL Editor to diagnose the missing profile data issue
-- ============================================================================

-- 1. Check if profiles table exists and has data
SELECT 
    'Total profiles' as check_name,
    COUNT(*) as count
FROM profiles;

-- 2. Check sample profile data
SELECT 
    id,
    username,
    full_name,
    avatar_url,
    created_at
FROM profiles
LIMIT 10;

-- 3. Check RLS policies on profiles table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'profiles';

-- 4. Check if RLS is enabled
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'profiles';

-- 5. Check for any recent posts with author_ids
SELECT 
    id,
    author_id,
    content,
    created_at
FROM social_posts
ORDER BY created_at DESC
LIMIT 5;

-- 6. Check if those author_ids exist in profiles
SELECT 
    sp.id as post_id,
    sp.author_id,
    p.id as profile_id,
    p.username,
    p.full_name
FROM social_posts sp
LEFT JOIN profiles p ON p.id = sp.author_id
ORDER BY sp.created_at DESC
LIMIT 10;
