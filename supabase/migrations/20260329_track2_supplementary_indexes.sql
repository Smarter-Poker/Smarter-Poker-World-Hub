-- ═══════════════════════════════════════════════════════════════
-- Track 2: Database Query Optimization — Supplementary Indexes
-- March 29, 2026 (CORRECTED to match actual production schema)
-- 
-- All CREATE INDEX IF NOT EXISTS — safe to re-run, additive only.
-- ═══════════════════════════════════════════════════════════════

-- 1. venue_reviews: bulk stats query (GET ?stats_only=true&venue_ids=...)
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_rating
  ON venue_reviews (venue_id, rating);

-- 2. venue_reviews: sorted by created_at for pagination
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_created
  ON venue_reviews (venue_id, created_at DESC);

-- 3. venue_live_history: peak activity queries
--    Uses bravo_slug (not venue_id) + snapshot_time
CREATE INDEX IF NOT EXISTS idx_venue_live_history_bravo_snapshot
  ON venue_live_history (bravo_slug, snapshot_time DESC);

-- 4. venue_live_history: venue_name trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_venue_live_history_name_trgm
  ON venue_live_history USING gin (venue_name gin_trgm_ops);

-- 5. venue_checkins: filtered by venue_id, sorted by recency
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue_created
  ON venue_checkins (venue_id, created_at DESC);

-- 6. venue_checkins: user-scoped queries
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user_venue
  ON venue_checkins (user_id, venue_id, created_at DESC);

-- 7. bankroll_sessions: verified player badge lookup
--    Uses venue_name (not venue_id)
CREATE INDEX IF NOT EXISTS idx_bankroll_sessions_user_venue
  ON bankroll_sessions (user_id, venue_name);

-- 8. venue_daily_tournaments: active + venue + day filter
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_active_venue_day
  ON venue_daily_tournaments (is_active, venue_id, day_of_week);

-- 9. venue_news: active + venue + recency
CREATE INDEX IF NOT EXISTS idx_venue_news_venue_active_scraped
  ON venue_news (venue_id, is_active, scraped_at DESC);

-- 10. Add unhelpful_count column to venue_reviews if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venue_reviews' AND column_name = 'unhelpful_count'
  ) THEN
    ALTER TABLE venue_reviews ADD COLUMN unhelpful_count integer DEFAULT 0;
  END IF;
END $$;

-- 11. Add metadata column to venue_reviews if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venue_reviews' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE venue_reviews ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;
