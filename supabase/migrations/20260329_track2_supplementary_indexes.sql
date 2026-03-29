-- ═══════════════════════════════════════════════════════════════
-- Track 2: Database Query Optimization — Supplementary Indexes
-- March 29, 2026 (Sprint: Performance + Intelligence Hardening)
-- 
-- All CREATE INDEX IF NOT EXISTS — safe to re-run, additive only.
-- Targets: venue_reviews, venue_live_history, venue_checkins,
--          bankroll_sessions (verified player badge lookup),
--          venue_daily_tournaments (schedule queries)
-- ═══════════════════════════════════════════════════════════════

-- 1. venue_reviews: bulk stats query (GET ?stats_only=true&venue_ids=...)
--    Also covers single-venue review listing (GET ?venue_id=X)
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_rating
  ON venue_reviews (venue_id, rating);

-- 2. venue_reviews: sorted by created_at for pagination
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_created
  ON venue_reviews (venue_id, created_at DESC);

-- 3. venue_live_history: game predictions + peak activity queries
--    Both APIs filter by venue_id + snapshot_time range
CREATE INDEX IF NOT EXISTS idx_venue_live_history_venue_snapshot
  ON venue_live_history (venue_id, snapshot_time DESC);

-- 4. venue_live_history: game_type filter for per-game predictions
CREATE INDEX IF NOT EXISTS idx_venue_live_history_venue_game_snapshot
  ON venue_live_history (venue_id, game_type, snapshot_time DESC);

-- 5. venue_live_history: venue_name ilike search (peak-activity API)
CREATE INDEX IF NOT EXISTS idx_venue_live_history_name_trgm
  ON venue_live_history USING gin (venue_name gin_trgm_ops);

-- 6. venue_checkins: filtered by venue_id, sorted by recency
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue_created
  ON venue_checkins (venue_id, created_at DESC);

-- 7. venue_checkins: user-scoped queries (check if user already checked in)
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user_venue
  ON venue_checkins (user_id, venue_id, created_at DESC);

-- 8. bankroll_sessions: verified player badge lookup
--    Used by reviews API to check if user played at this venue
CREATE INDEX IF NOT EXISTS idx_bankroll_sessions_user_venue
  ON bankroll_sessions (user_id, venue_id);

-- 9. venue_daily_tournaments: active + venue + day filter
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_active_venue_day
  ON venue_daily_tournaments (is_active, venue_id, day_of_week);

-- 10. venue_news: active + venue + recency
CREATE INDEX IF NOT EXISTS idx_venue_news_venue_active_scraped
  ON venue_news (venue_id, is_active, scraped_at DESC);

-- 11. Add unhelpful_count column to venue_reviews if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venue_reviews' AND column_name = 'unhelpful_count'
  ) THEN
    ALTER TABLE venue_reviews ADD COLUMN unhelpful_count integer DEFAULT 0;
  END IF;
END $$;

-- 12. Add metadata column to venue_reviews if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venue_reviews' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE venue_reviews ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;
