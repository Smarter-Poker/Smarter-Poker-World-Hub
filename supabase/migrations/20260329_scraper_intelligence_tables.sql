-- Migration: Scraper Intelligence Tables
-- Date: 2026-03-29
-- Creates: scraper_watchdog_state, venue_game_alerts, venue_aliases

-- 1. Scraper Watchdog State (persistent alert cooldown tracking)
CREATE TABLE IF NOT EXISTS scraper_watchdog_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Venue Game Alerts (push notification subscriptions)
CREATE TABLE IF NOT EXISTS venue_game_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  venue_name TEXT NOT NULL,
  game_type TEXT NOT NULL,
  alert_via TEXT DEFAULT 'push' CHECK (alert_via IN ('push', 'sms', 'email')),
  active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_venue_game_alerts_user 
  ON venue_game_alerts(user_id, active);

-- Index for cron matching
CREATE INDEX IF NOT EXISTS idx_venue_game_alerts_active 
  ON venue_game_alerts(active) WHERE active = true;

-- Prevent duplicate alerts
CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_game_alerts_unique 
  ON venue_game_alerts(user_id, venue_name, game_type) WHERE active = true;

-- 3. Venue Aliases (for cross-source deduplication)
CREATE TABLE IF NOT EXISTS venue_aliases (
  id SERIAL PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  alias_name TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast alias lookups
CREATE INDEX IF NOT EXISTS idx_venue_aliases_alias 
  ON venue_aliases(alias_name);

CREATE INDEX IF NOT EXISTS idx_venue_aliases_canonical 
  ON venue_aliases(canonical_name);

-- Seed initial alias data
INSERT INTO venue_aliases (canonical_name, alias_name, source) VALUES
  ('Bellagio', 'Bellagio Hotel & Casino', 'manual'),
  ('Bellagio', 'Bellagio Poker Room', 'manual'),
  ('ARIA Resort & Casino', 'Aria', 'manual'),
  ('ARIA Resort & Casino', 'ARIA', 'manual'),
  ('Wynn Las Vegas', 'Wynn', 'manual'),
  ('Wynn Las Vegas', 'Wynn Poker Room', 'manual'),
  ('The Venetian Resort', 'Venetian', 'manual'),
  ('The Venetian Resort', 'The Venetian', 'manual'),
  ('MGM Grand', 'MGM Grand Hotel & Casino', 'manual'),
  ('Commerce Casino', 'Commerce', 'manual'),
  ('Bicycle Hotel & Casino', 'The Bike', 'manual'),
  ('Bicycle Hotel & Casino', 'Bicycle Casino', 'manual'),
  ('Seminole Hard Rock Hollywood', 'Hard Rock Hollywood', 'manual'),
  ('Borgata Hotel Casino & Spa', 'Borgata', 'manual'),
  ('Parx Casino', 'Parx', 'manual'),
  ('Foxwoods Resort Casino', 'Foxwoods', 'manual'),
  ('Mohegan Sun', 'Mohegan Sun Casino', 'manual'),
  ('Turning Stone Resort Casino', 'Turning Stone', 'manual')
ON CONFLICT (alias_name) DO NOTHING;
