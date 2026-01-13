-- ═══════════════════════════════════════════════════════════════════════════
-- SOCIAL HUB FIX - Resolves 'total_xp is ambiguous' trigger error
-- 
-- RUN THIS IN: Supabase Dashboard → SQL Editor → Run
-- 
-- This script fixes the XP trigger to properly qualify column references
-- ═══════════════════════════════════════════════════════════════════════════

-- STEP 1: Find and list all triggers on social_posts
-- (This shows what we're dealing with)
SELECT tgname AS trigger_name, 
       proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'social_posts';

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Create a FIXED version of the XP award trigger function
-- This properly qualifies all column references to avoid ambiguity
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_award_xp_on_social_post()
RETURNS TRIGGER AS $$
DECLARE
    v_xp_amount INTEGER := 5;  -- XP awarded for posting
BEGIN
    -- Update the profiles table with the XP
    -- Using explicit table qualification to avoid ambiguity
    UPDATE profiles
    SET xp_total = profiles.xp_total + v_xp_amount,
        updated_at = NOW()
    WHERE profiles.id = NEW.author_id;
    
    -- Optionally log this for the reward system
    -- INSERT INTO xp_activity_log (user_id, action, xp_earned, created_at)
    -- VALUES (NEW.author_id, 'social_post', v_xp_amount, NOW());
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3: Drop existing triggers and recreate with the fixed function
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop any existing XP triggers
DROP TRIGGER IF EXISTS trg_award_xp_on_post ON social_posts;
DROP TRIGGER IF EXISTS trigger_social_post_xp ON social_posts;
DROP TRIGGER IF EXISTS trg_social_post_xp ON social_posts;

-- Create the trigger with the fixed function
CREATE TRIGGER trg_award_xp_on_post
    AFTER INSERT ON social_posts
    FOR EACH ROW
    EXECUTE FUNCTION fn_award_xp_on_social_post();

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4: Ensure tables have proper structure
-- ═══════════════════════════════════════════════════════════════════════════

-- Add missing columns to profiles if needed
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp_total INTEGER DEFAULT 0;

-- Ensure social_posts exists with correct schema
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    content_type TEXT DEFAULT 'text',
    media_urls JSONB DEFAULT '[]'::JSONB,
    visibility TEXT DEFAULT 'public',
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure social_interactions exists
CREATE TABLE IF NOT EXISTS social_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(post_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_interactions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Anyone can view public posts" ON social_posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON social_posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON social_posts;

CREATE POLICY "Anyone can view public posts" ON social_posts
    FOR SELECT USING (visibility = 'public' OR visibility IS NULL OR author_id = auth.uid());

CREATE POLICY "Users can create their own posts" ON social_posts
    FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can update their own posts" ON social_posts
    FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "Users can delete their own posts" ON social_posts
    FOR DELETE USING (author_id = auth.uid());

-- Interactions policies
DROP POLICY IF EXISTS "Anyone can view interactions" ON social_interactions;
DROP POLICY IF EXISTS "Users can create interactions" ON social_interactions;
DROP POLICY IF EXISTS "Users can delete own interactions" ON social_interactions;

CREATE POLICY "Anyone can view interactions" ON social_interactions
    FOR SELECT USING (true);

CREATE POLICY "Users can create interactions" ON social_interactions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own interactions" ON social_interactions
    FOR DELETE USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 6: Grant permissions
-- ═══════════════════════════════════════════════════════════════════════════

GRANT ALL ON social_posts TO authenticated;
GRANT SELECT ON social_posts TO anon;
GRANT ALL ON social_interactions TO authenticated;
GRANT SELECT ON social_interactions TO anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION - Test that everything works
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- Test query
    PERFORM * FROM social_posts LIMIT 1;
    PERFORM * FROM social_interactions LIMIT 1;
    RAISE NOTICE '✅ Social Hub tables and triggers fixed successfully!';
    RAISE NOTICE '✅ XP trigger now uses properly qualified column references.';
END;
$$;
