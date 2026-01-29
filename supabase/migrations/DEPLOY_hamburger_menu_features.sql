-- ═══════════════════════════════════════════════════════════════════════════
-- HAMBURGER MENU FEATURE - COMBINED MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor to enable all hamburger menu features
-- Created: 2026-01-29
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: PREFERENCE COLUMNS ON PROFILES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Messenger preferences (notifications, read receipts, active status, sounds)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS messenger_preferences JSONB DEFAULT '{"notifications": true, "readReceipts": true, "activeStatus": true, "messageSounds": true}'::jsonb;

-- Friend preferences (allow requests, show online status, suggestions)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS friend_preferences JSONB DEFAULT '{"allowRequests": true, "showOnlineStatus": true, "friendSuggestions": true}'::jsonb;

-- Reels preferences (autoplay, sound on scroll, data saver, captions)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS reels_preferences JSONB DEFAULT '{"autoplay": true, "soundOnScroll": true, "dataSaver": false, "showCaptions": true}'::jsonb;

-- Store preferences (email receipts, promotional emails)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS store_preferences JSONB DEFAULT '{"emailReceipts": true, "promotionalEmails": false}'::jsonb;

-- Training preferences (auto-advance, hints)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS training_auto_advance BOOLEAN DEFAULT false;
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS training_hints_enabled BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: WISHLISTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wishlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_type TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_price NUMERIC(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);

ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own wishlist" ON wishlists;
CREATE POLICY "Users can view their own wishlist"
    ON wishlists FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add to their own wishlist" ON wishlists;
CREATE POLICY "Users can add to their own wishlist"
    ON wishlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove from their own wishlist" ON wishlists;
CREATE POLICY "Users can remove from their own wishlist"
    ON wishlists FOR DELETE
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: SAVED REELS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_reels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reel_id UUID NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_reels_user ON saved_reels(user_id);

ALTER TABLE saved_reels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their saved reels" ON saved_reels;
CREATE POLICY "Users can view their saved reels"
    ON saved_reels FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can save reels" ON saved_reels;
CREATE POLICY "Users can save reels"
    ON saved_reels FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unsave reels" ON saved_reels;
CREATE POLICY "Users can unsave reels"
    ON saved_reels FOR DELETE
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: BLOCKED USERS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocks" ON blocked_users;
CREATE POLICY "Users can view their own blocks"
    ON blocked_users FOR SELECT
    USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can create their own blocks" ON blocked_users;
CREATE POLICY "Users can create their own blocks"
    ON blocked_users FOR INSERT
    WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "Users can delete their own blocks" ON blocked_users;
CREATE POLICY "Users can delete their own blocks"
    ON blocked_users FOR DELETE
    USING (auth.uid() = blocker_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5: RPC FUNCTIONS FOR PREFERENCE UPDATES
-- ═══════════════════════════════════════════════════════════════════════════

-- Messenger preferences update
CREATE OR REPLACE FUNCTION update_messenger_preferences(p_user_id UUID, p_preferences JSONB)
RETURNS JSONB AS $$
BEGIN
    UPDATE profiles 
    SET messenger_preferences = COALESCE(messenger_preferences, '{}'::jsonb) || p_preferences
    WHERE id = p_user_id;
    
    RETURN p_preferences;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Friend preferences update
CREATE OR REPLACE FUNCTION update_friend_preferences(p_user_id UUID, p_preferences JSONB)
RETURNS JSONB AS $$
BEGIN
    UPDATE profiles 
    SET friend_preferences = COALESCE(friend_preferences, '{}'::jsonb) || p_preferences
    WHERE id = p_user_id;
    
    RETURN p_preferences;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reels preferences update
CREATE OR REPLACE FUNCTION update_reels_preferences(p_user_id UUID, p_preferences JSONB)
RETURNS JSONB AS $$
BEGIN
    UPDATE profiles 
    SET reels_preferences = COALESCE(reels_preferences, '{}'::jsonb) || p_preferences
    WHERE id = p_user_id;
    
    RETURN p_preferences;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Store preferences update
CREATE OR REPLACE FUNCTION update_store_preferences(p_user_id UUID, p_preferences JSONB)
RETURNS JSONB AS $$
BEGIN
    UPDATE profiles 
    SET store_preferences = COALESCE(store_preferences, '{}'::jsonb) || p_preferences
    WHERE id = p_user_id;
    
    RETURN p_preferences;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE! All hamburger menu features are now enabled.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'Hamburger menu migrations complete!' AS status;
