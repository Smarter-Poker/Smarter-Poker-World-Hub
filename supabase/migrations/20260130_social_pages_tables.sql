-- ============================================================
-- SOCIAL PAGES SYSTEM - All Tables
-- Run in Supabase SQL Editor
-- Safe to re-run (all use IF NOT EXISTS)
-- ============================================================

-- 1. Page Followers (already exists from previous migration)
CREATE TABLE IF NOT EXISTS page_followers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN ('venue', 'tour', 'series')),
  page_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_followers_user ON page_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_page_followers_page ON page_followers(page_type, page_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_followers_unique ON page_followers(user_id, page_type, page_id);

-- 2. Page Activity Feed
CREATE TABLE IF NOT EXISTS page_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_type TEXT NOT NULL CHECK (page_type IN ('venue', 'tour', 'series')),
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('update', 'announcement', 'promotion', 'result')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  likes_count INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_page_activity_page ON page_activity(page_type, page_id);
CREATE INDEX IF NOT EXISTS idx_page_activity_created ON page_activity(created_at DESC);

-- 3. Venue Reviews & Ratings
CREATE TABLE IF NOT EXISTS venue_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  reviewer_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  helpful_count INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue ON venue_reviews(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_rating ON venue_reviews(venue_id, rating);

-- 4. Venue Check-ins
CREATE TABLE IF NOT EXISTS venue_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue ON venue_checkins(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_created ON venue_checkins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_user ON venue_checkins(user_id, venue_id);

-- 5. Live Game Reports
CREATE TABLE IF NOT EXISTS live_games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  stakes TEXT NOT NULL,
  table_count INT DEFAULT 1,
  wait_time INT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '4 hours')
);
CREATE INDEX IF NOT EXISTS idx_live_games_venue ON live_games(venue_id);
CREATE INDEX IF NOT EXISTS idx_live_games_expires ON live_games(expires_at);
CREATE INDEX IF NOT EXISTS idx_live_games_active ON live_games(venue_id, expires_at);

-- 6. Page Claims
CREATE TABLE IF NOT EXISTS page_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_type TEXT NOT NULL CHECK (page_type IN ('venue', 'tour', 'series')),
  page_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  verification_notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_page_claims_page ON page_claims(page_type, page_id);
CREATE INDEX IF NOT EXISTS idx_page_claims_user ON page_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_page_claims_status ON page_claims(status);

-- 7. Page Notifications
CREATE TABLE IF NOT EXISTS page_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_type TEXT NOT NULL CHECK (page_type IN ('venue', 'tour', 'series')),
  page_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('new_event', 'schedule_change', 'promotion', 'result')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_notifications_page ON page_notifications(page_type, page_id);
CREATE INDEX IF NOT EXISTS idx_page_notifications_created ON page_notifications(created_at DESC);

-- 8. Notification Reads
CREATE TABLE IF NOT EXISTS notification_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES page_notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_reads_unique ON notification_reads(notification_id, user_id);

-- 9. Tournament Results
CREATE TABLE IF NOT EXISTS tournament_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  series_id TEXT,
  tour_code TEXT,
  event_name TEXT NOT NULL,
  event_number INT,
  event_date DATE,
  buy_in NUMERIC,
  prize_pool NUMERIC,
  total_entries INT,
  winner_name TEXT NOT NULL,
  winner_prize NUMERIC,
  results_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournament_results_series ON tournament_results(series_id);
CREATE INDEX IF NOT EXISTS idx_tournament_results_tour ON tournament_results(tour_code);
CREATE INDEX IF NOT EXISTS idx_tournament_results_date ON tournament_results(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_tournament_results_winner ON tournament_results(winner_name);

-- ============================================================
-- RLS Policies (allow all for now - tighten later)
-- ============================================================
ALTER TABLE page_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_results ENABLE ROW LEVEL SECURITY;

-- Allow all operations via service role (API uses service role key)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'page_activity', 'venue_reviews', 'venue_checkins', 'live_games',
    'page_claims', 'page_notifications', 'notification_reads', 'tournament_results'
  ]) LOOP
    EXECUTE format('CREATE POLICY IF NOT EXISTS "%s_all" ON %I FOR ALL USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN
  -- policies already exist
  NULL;
END $$;
