-- ═══════════════════════════════════════════════════════════════════════════
-- HAMBURGER MENU PREFERENCES - Database Schema
-- Migration: 20260129_hamburger_menu_preferences
-- Purpose: Add all preference columns and tables for hamburger menu features
-- ═══════════════════════════════════════════════════════════════════════════

-- Add messenger preferences to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS messenger_preferences JSONB DEFAULT '{
  "notifications": true,
  "read_receipts": true,
  "active_status": true,
  "message_sounds": true
}'::jsonb;

-- Add friend preferences to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS friend_preferences JSONB DEFAULT '{
  "allow_requests": true,
  "show_online_status": true,
  "friend_suggestions": true
}'::jsonb;

-- Add reels preferences to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reels_preferences JSONB DEFAULT '{
  "autoplay": true,
  "sound_on_scroll": true,
  "data_saver": false,
  "show_captions": true
}'::jsonb;

-- Add store preferences to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS store_preferences JSONB DEFAULT '{
  "email_receipts": true,
  "promotional_emails": false
}'::jsonb;

-- Update existing training_preferences to include new fields
-- Current schema: { view_mode, sound_enabled, timer_enabled }
-- Adding: auto_advance, show_hints
COMMENT ON COLUMN profiles.training_preferences IS 'Training settings: view_mode, sound_enabled, timer_enabled, auto_advance, show_hints';

-- ═══════════════════════════════════════════════════════════════════════════
-- WISHLISTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('diamond', 'vip', 'merchandise')),
  product_name TEXT,
  product_price DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Index for fast user wishlist lookups
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_type ON wishlists(product_type);

-- RLS Policies for wishlists
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wishlist"
  ON wishlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their own wishlist"
  ON wishlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from their own wishlist"
  ON wishlists FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- SAVED REELS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_reels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reel_id UUID NOT NULL REFERENCES social_reels(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reel_id)
);

-- Index for fast user saved reels lookups
CREATE INDEX IF NOT EXISTS idx_saved_reels_user_id ON saved_reels(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reels_reel_id ON saved_reels(reel_id);
CREATE INDEX IF NOT EXISTS idx_saved_reels_saved_at ON saved_reels(saved_at DESC);

-- RLS Policies for saved_reels
ALTER TABLE saved_reels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved reels"
  ON saved_reels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save reels"
  ON saved_reels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave reels"
  ON saved_reels FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update messenger preferences
CREATE OR REPLACE FUNCTION update_messenger_preferences(
  p_user_id UUID,
  p_preferences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_prefs JSONB;
BEGIN
  -- Verify user is updating their own preferences
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Merge new preferences with existing ones
  UPDATE profiles
  SET messenger_preferences = COALESCE(messenger_preferences, '{}'::jsonb) || p_preferences,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING messenger_preferences INTO v_updated_prefs;

  RETURN v_updated_prefs;
END;
$$;

-- Function to update friend preferences
CREATE OR REPLACE FUNCTION update_friend_preferences(
  p_user_id UUID,
  p_preferences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_prefs JSONB;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE profiles
  SET friend_preferences = COALESCE(friend_preferences, '{}'::jsonb) || p_preferences,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING friend_preferences INTO v_updated_prefs;

  RETURN v_updated_prefs;
END;
$$;

-- Function to update reels preferences
CREATE OR REPLACE FUNCTION update_reels_preferences(
  p_user_id UUID,
  p_preferences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_prefs JSONB;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE profiles
  SET reels_preferences = COALESCE(reels_preferences, '{}'::jsonb) || p_preferences,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING reels_preferences INTO v_updated_prefs;

  RETURN v_updated_prefs;
END;
$$;

-- Function to update store preferences
CREATE OR REPLACE FUNCTION update_store_preferences(
  p_user_id UUID,
  p_preferences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_prefs JSONB;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE profiles
  SET store_preferences = COALESCE(store_preferences, '{}'::jsonb) || p_preferences,
      updated_at = NOW()
  WHERE id = p_user_id
  RETURNING store_preferences INTO v_updated_prefs;

  RETURN v_updated_prefs;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN profiles.messenger_preferences IS 'Messenger settings: notifications, read_receipts, active_status, message_sounds';
COMMENT ON COLUMN profiles.friend_preferences IS 'Friend settings: allow_requests, show_online_status, friend_suggestions';
COMMENT ON COLUMN profiles.reels_preferences IS 'Reels settings: autoplay, sound_on_scroll, data_saver, show_captions';
COMMENT ON COLUMN profiles.store_preferences IS 'Store settings: email_receipts, promotional_emails';

COMMENT ON TABLE wishlists IS 'User wishlist for Diamond Store products';
COMMENT ON TABLE saved_reels IS 'User saved reels for later viewing';

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
