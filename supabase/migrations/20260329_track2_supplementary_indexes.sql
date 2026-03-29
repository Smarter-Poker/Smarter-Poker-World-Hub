-- ═══════════════════════════════════════════════════════════════
-- Track 2: Database Query Optimization — Supplementary Indexes
-- March 29, 2026 (CORRECTED to match actual production schema)
-- 
-- All CREATE INDEX IF NOT EXISTS — safe to re-run, additive only.
-- Targets: venue_reviews, venue_checkins, venue_daily_tournaments,
--          venue_news, venue_live_history
-- ═══════════════════════════════════════════════════════════════

-- 1. venue_reviews: bulk stats query (GET ?stats_only=true&venue_ids=...)
--    Also covers single-venue review listing (GET ?venue_id=X)
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_rating
  ON venue_reviews (venue_id, rating);

-- 2. venue_reviews: sorted by created_at for pagination
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue_created
  ON venue_reviews (venue_id, created_at DESC);

-- 3. venue_live_history: uses bravo_slug (not venue_id) + snapshot_time
CREATE INDEX IF NOT EXISTS idx_venue_live_history_slug_snapshot
  ON venue_live_history (bravo_slug, snapshot_time DESC);

-- 4. venue_checkins: filtered by venue_id, sorted by recency
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue_created
  ON venue_checkins (venue_id, created_at DESC);

-- 5. venue_checkins: user-scoped queries (check if user already checked in)
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user_venue
  ON venue_checkins (user_id, venue_id, created_at DESC);

-- 6. venue_daily_tournaments: active + venue + day filter
CREATE INDEX IF NOT EXISTS idx_venue_daily_tournaments_active_venue_day
  ON venue_daily_tournaments (is_active, venue_id, day_of_week);

-- 7. venue_news: active + venue + recency
CREATE INDEX IF NOT EXISTS idx_venue_news_venue_active_scraped
  ON venue_news (venue_id, is_active, scraped_at DESC);

-- 8. Add unhelpful_count column to venue_reviews if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venue_reviews' AND column_name = 'unhelpful_count'
  ) THEN
    ALTER TABLE venue_reviews ADD COLUMN unhelpful_count integer DEFAULT 0;
  END IF;
END $$;

-- 9. Add metadata column to venue_reviews if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'venue_reviews' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE venue_reviews ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;
