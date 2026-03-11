-- ═══════════════════════════════════════════════════════════════════════════
-- HAMBURGER MENU PREFERENCES - Phase 2
-- Migration: 20260201_hamburger_menu_preferences_phase2
-- Purpose: Add preference columns and content tracking tables for 8 new pages
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PREFERENCE COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════

-- Bankroll Manager preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bankroll_preferences JSONB DEFAULT '{
  "autoSave": true,
  "notifications": true
}'::jsonb;

-- Poker Near Me preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS poker_near_me_preferences JSONB DEFAULT '{
  "geofenceAlerts": true,
  "locationEnabled": true,
  "showNewcomerFriendly": true
}'::jsonb;

-- Video Library preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS video_library_preferences JSONB DEFAULT '{
  "autoplay": true,
  "hdQuality": true,
  "captions": false
}'::jsonb;

-- Diamond Arena preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamond_arena_preferences JSONB DEFAULT '{
  "soundEffects": true,
  "animations": true,
  "autoRebuy": false
}'::jsonb;

-- Trivia preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trivia_preferences JSONB DEFAULT '{
  "soundEffects": true,
  "timerEnabled": true,
  "hintsEnabled": false
}'::jsonb;

-- News preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS news_preferences JSONB DEFAULT '{
  "pushNotifications": false,
  "emailDigest": false
}'::jsonb;

-- Diamond Arcade preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamond_arcade_preferences JSONB DEFAULT '{
  "soundEffects": true,
  "animations": true,
  "hints": false
}'::jsonb;

-- Memory Games preferences
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS memory_games_preferences JSONB DEFAULT '{
  "soundEffects": true,
  "keyboardShortcuts": true,
  "showTimer": true,
  "visualHints": false
}'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTENT TRACKING TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Video Library: Favorites
CREATE TABLE IF NOT EXISTS video_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT,
  video_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_favorites_user_id ON video_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_video_favorites_created_at ON video_favorites(created_at DESC);

-- Video Library: Watch History
CREATE TABLE IF NOT EXISTS video_watch_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT,
  video_source TEXT,
  watched_at TIMESTAMPTZ DEFAULT NOW(),
  progress_seconds INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_watch_history_user_id ON video_watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_video_watch_history_watched_at ON video_watch_history(watched_at DESC);

-- Video Library: Watch Later
CREATE TABLE IF NOT EXISTS video_watch_later (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT,
  video_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_video_watch_later_user_id ON video_watch_later(user_id);
CREATE INDEX IF NOT EXISTS idx_video_watch_later_created_at ON video_watch_later(created_at DESC);

-- News: Bookmarks
CREATE TABLE IF NOT EXISTS news_bookmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  article_title TEXT,
  article_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_news_bookmarks_user_id ON news_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_news_bookmarks_created_at ON news_bookmarks(created_at DESC);

-- News: Read Later
CREATE TABLE IF NOT EXISTS news_read_later (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL,
  article_title TEXT,
  article_source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_news_read_later_user_id ON news_read_later(user_id);
CREATE INDEX IF NOT EXISTS idx_news_read_later_created_at ON news_read_later(created_at DESC);

-- Poker Near Me: Favorites
CREATE TABLE IF NOT EXISTS poker_near_me_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id TEXT NOT NULL,
  venue_name TEXT,
  venue_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_poker_near_me_favorites_user_id ON poker_near_me_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_poker_near_me_favorites_created_at ON poker_near_me_favorites(created_at DESC);

-- Poker Near Me: Search History
CREATE TABLE IF NOT EXISTS poker_near_me_search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  search_query TEXT NOT NULL,
  search_type TEXT, -- 'venue', 'tour', 'series', 'daily'
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_near_me_search_history_user_id ON poker_near_me_search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_poker_near_me_search_history_searched_at ON poker_near_me_search_history(searched_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Video Favorites
ALTER TABLE video_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own video favorites"
  ON video_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add video favorites"
  ON video_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove video favorites"
  ON video_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Video Watch History
ALTER TABLE video_watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own watch history"
  ON video_watch_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to watch history"
  ON video_watch_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update watch history"
  ON video_watch_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete watch history"
  ON video_watch_history FOR DELETE
  USING (auth.uid() = user_id);

-- Video Watch Later
ALTER TABLE video_watch_later ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their watch later list"
  ON video_watch_later FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to watch later"
  ON video_watch_later FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from watch later"
  ON video_watch_later FOR DELETE
  USING (auth.uid() = user_id);

-- News Bookmarks
ALTER TABLE news_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their bookmarks"
  ON news_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add bookmarks"
  ON news_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove bookmarks"
  ON news_bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- News Read Later
ALTER TABLE news_read_later ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their read later list"
  ON news_read_later FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to read later"
  ON news_read_later FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from read later"
  ON news_read_later FOR DELETE
  USING (auth.uid() = user_id);

-- Poker Near Me Favorites
ALTER TABLE poker_near_me_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their venue favorites"
  ON poker_near_me_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add venue favorites"
  ON poker_near_me_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove venue favorites"
  ON poker_near_me_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Poker Near Me Search History
ALTER TABLE poker_near_me_search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their search history"
  ON poker_near_me_search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to search history"
  ON poker_near_me_search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their search history"
  ON poker_near_me_search_history FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Update preference functions for new columns
CREATE OR REPLACE FUNCTION update_page_preferences(
  p_user_id UUID,
  p_column_name TEXT,
  p_preferences JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_prefs JSONB;
  v_sql TEXT;
BEGIN
  -- Verify user is updating their own preferences
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate column name to prevent SQL injection
  IF p_column_name NOT IN (
    'bankroll_preferences',
    'poker_near_me_preferences',
    'video_library_preferences',
    'diamond_arena_preferences',
    'trivia_preferences',
    'news_preferences',
    'diamond_arcade_preferences',
    'memory_games_preferences'
  ) THEN
    RAISE EXCEPTION 'Invalid preference column';
  END IF;

  -- Build and execute dynamic SQL
  v_sql := format(
    'UPDATE profiles SET %I = COALESCE(%I, ''{}''::jsonb) || $1, updated_at = NOW() WHERE id = $2 RETURNING %I',
    p_column_name, p_column_name, p_column_name
  );
  
  EXECUTE v_sql USING p_preferences, p_user_id INTO v_updated_prefs;

  RETURN v_updated_prefs;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN profiles.bankroll_preferences IS 'Bankroll Manager settings: autoSave, notifications';
COMMENT ON COLUMN profiles.poker_near_me_preferences IS 'Poker Near Me settings: geofenceAlerts, locationEnabled, showNewcomerFriendly';
COMMENT ON COLUMN profiles.video_library_preferences IS 'Video Library settings: autoplay, hdQuality, captions';
COMMENT ON COLUMN profiles.diamond_arena_preferences IS 'Diamond Arena settings: soundEffects, animations, autoRebuy';
COMMENT ON COLUMN profiles.trivia_preferences IS 'Trivia settings: soundEffects, timerEnabled, hintsEnabled';
COMMENT ON COLUMN profiles.news_preferences IS 'News settings: pushNotifications, emailDigest';
COMMENT ON COLUMN profiles.diamond_arcade_preferences IS 'Diamond Arcade settings: soundEffects, animations, hints';
COMMENT ON COLUMN profiles.memory_games_preferences IS 'Memory Games settings: soundEffects, keyboardShortcuts, showTimer, visualHints';

COMMENT ON TABLE video_favorites IS 'User favorite videos from Video Library';
COMMENT ON TABLE video_watch_history IS 'User video watch history with progress tracking';
COMMENT ON TABLE video_watch_later IS 'User watch later queue for videos';
COMMENT ON TABLE news_bookmarks IS 'User bookmarked news articles';
COMMENT ON TABLE news_read_later IS 'User read later queue for news articles';
COMMENT ON TABLE poker_near_me_favorites IS 'User favorite poker venues';
COMMENT ON TABLE poker_near_me_search_history IS 'User search history for Poker Near Me';

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
