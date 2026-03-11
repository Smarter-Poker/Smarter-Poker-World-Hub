-- Migration: Add poker_venue_id to bankroll_locations
-- Links user venue records to the master PokerNearMe database for geofencing

ALTER TABLE bankroll_locations
  ADD COLUMN IF NOT EXISTS poker_venue_id BIGINT REFERENCES poker_venues(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_bankroll_locations_poker_venue_id
  ON bankroll_locations(poker_venue_id)
  WHERE poker_venue_id IS NOT NULL;

COMMENT ON COLUMN bankroll_locations.poker_venue_id IS
  'FK to poker_venues — links this user venue to the master PokerNearMe database for geofencing and auto-suggest.';
