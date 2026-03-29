-- ═══════════════════════════════════════════════════════════════
-- PNM Database Query Optimization — Composite Indexes
-- March 29, 2026 (CORRECTED to match actual production schema)
-- 
-- All CREATE INDEX IF NOT EXISTS — safe to re-run, additive only.
-- Targets high-traffic queries from the Poker Near Me intelligence engine.
-- ═══════════════════════════════════════════════════════════════

-- 1. Venues: filtered by state, venue_type, sorted by trust_score
--    Used by /api/poker/venues?state=IL&venue_type=casino&sort=trust
CREATE INDEX IF NOT EXISTS idx_poker_venues_state_type_trust
  ON poker_venues (state, venue_type, trust_score DESC);

-- 2. Daily tournaments: filtered by day_of_week, joined to venues
--    Table is venue_daily_tournaments (not daily_tournaments)
CREATE INDEX IF NOT EXISTS idx_daily_tournaments_day_venue
  ON venue_daily_tournaments (day_of_week, venue_id);

-- 3. Venue live tables: bravo_slug + scrape_timestamp
--    Note: venue_live_tables uses bravo_slug (not venue_id) and has no status column
CREATE INDEX IF NOT EXISTS idx_venue_live_tables_bravo_timestamp
  ON venue_live_tables (bravo_slug, scrape_timestamp DESC);

-- 4. Premium feature access: checked on every VIP gate
--    Used by premiumFeatureGate.js checkFeatureAccess()
CREATE INDEX IF NOT EXISTS idx_premium_feature_access_user_key_expires
  ON premium_feature_access (user_id, feature_key, expires_at DESC);

-- 5. Search history: user lookup with recency for autocomplete
--    Used by pokerNearMeSearchHistory.js getSearchHistory()
CREATE INDEX IF NOT EXISTS idx_search_history_user_time
  ON poker_near_me_search_history (user_id, searched_at DESC);
