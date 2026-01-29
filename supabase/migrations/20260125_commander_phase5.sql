-- =====================================================
-- CLUB COMMANDER - PHASE 5 DATABASE MIGRATION
-- =====================================================
-- Tables: 5 (Promotions & Analytics)
-- Phase: Promotions, Rewards, Analytics
-- =====================================================

-- ===================
-- TABLE 1: commander_promotions
-- ===================
-- Venue promotions (high hand bonuses, happy hours, etc.)

CREATE TABLE IF NOT EXISTS commander_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  description TEXT,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN (
    'high_hand', 'bad_beat', 'splash_pot', 'happy_hour',
    'new_player', 'referral', 'loyalty', 'tournament_bonus',
    'cash_back', 'drawing', 'other'
  )),

  -- Value
  prize_type TEXT DEFAULT 'cash' CHECK (prize_type IN ('cash', 'chips', 'freeroll', 'merchandise', 'points', 'other')),
  prize_value INTEGER,
  prize_description TEXT,

  -- Schedule
  start_date DATE,
  end_date DATE,
  days_of_week INTEGER[], -- 0=Sunday, 6=Saturday
  start_time TIME,
  end_time TIME,
  is_recurring BOOLEAN DEFAULT false,

  -- Conditions
  min_stakes TEXT,
  min_hours_played DECIMAL(4,2),
  min_buyin INTEGER,
  game_types TEXT[], -- ['nlhe', 'plo', etc.]
  qualifying_hands TEXT, -- e.g., 'Aces full or better'

  -- Tracking
  total_awarded INTEGER DEFAULT 0,
  total_value_awarded INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  is_featured BOOLEAN DEFAULT false,

  -- Display
  image_url TEXT,
  terms_conditions TEXT,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_by UUID REFERENCES commander_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotions_venue ON commander_promotions(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_promotions_type ON commander_promotions(promotion_type, status);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON commander_promotions(start_date, end_date);

-- ===================
-- TABLE 2: commander_promotion_awards
-- ===================
-- Track promotion awards to players

CREATE TABLE IF NOT EXISTS commander_promotion_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID REFERENCES commander_promotions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Recipient
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,

  -- Award details
  award_type TEXT NOT NULL,
  prize_value INTEGER NOT NULL,
  prize_description TEXT,

  -- Context
  session_id UUID REFERENCES commander_player_sessions(id),
  table_id UUID REFERENCES commander_tables(id),
  game_details JSONB, -- Hand info, etc.

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'void')),
  approved_by UUID REFERENCES commander_staff(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_awards_promotion ON commander_promotion_awards(promotion_id, status);
CREATE INDEX IF NOT EXISTS idx_awards_player ON commander_promotion_awards(player_id);
CREATE INDEX IF NOT EXISTS idx_awards_venue ON commander_promotion_awards(venue_id, created_at);

-- ===================
-- TABLE 3: commander_analytics_daily
-- ===================
-- Daily aggregated analytics per venue

CREATE TABLE IF NOT EXISTS commander_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Session metrics
  total_sessions INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  new_players INTEGER DEFAULT 0,
  returning_players INTEGER DEFAULT 0,

  -- Time metrics
  total_play_hours DECIMAL(10,2) DEFAULT 0,
  avg_session_hours DECIMAL(4,2) DEFAULT 0,
  peak_concurrent_players INTEGER DEFAULT 0,
  peak_hour INTEGER, -- 0-23

  -- Financial metrics
  total_buyin INTEGER DEFAULT 0,
  total_cashout INTEGER DEFAULT 0,
  avg_buyin INTEGER DEFAULT 0,

  -- Table metrics
  tables_opened INTEGER DEFAULT 0,
  max_tables_running INTEGER DEFAULT 0,
  table_hours DECIMAL(10,2) DEFAULT 0,

  -- Game breakdown
  nlhe_hours DECIMAL(10,2) DEFAULT 0,
  plo_hours DECIMAL(10,2) DEFAULT 0,
  other_hours DECIMAL(10,2) DEFAULT 0,

  -- Tournament metrics
  tournaments_run INTEGER DEFAULT 0,
  tournament_entries INTEGER DEFAULT 0,
  tournament_prizepool INTEGER DEFAULT 0,

  -- Waitlist metrics
  waitlist_joins INTEGER DEFAULT 0,
  waitlist_seats INTEGER DEFAULT 0,
  avg_wait_time_minutes INTEGER DEFAULT 0,

  -- Promotion metrics
  promotions_awarded INTEGER DEFAULT 0,
  promotion_value_awarded INTEGER DEFAULT 0,

  -- Service metrics
  service_requests INTEGER DEFAULT 0,
  avg_service_time_minutes INTEGER DEFAULT 0,

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_venue ON commander_analytics_daily(venue_id, date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON commander_analytics_daily(date);

-- ===================
-- TABLE 4: commander_player_stats
-- ===================
-- Aggregated player stats per venue

CREATE TABLE IF NOT EXISTS commander_player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Visit metrics
  first_visit DATE,
  last_visit DATE,
  total_visits INTEGER DEFAULT 0,
  visits_this_month INTEGER DEFAULT 0,
  visits_this_year INTEGER DEFAULT 0,

  -- Time metrics
  total_hours DECIMAL(10,2) DEFAULT 0,
  hours_this_month DECIMAL(6,2) DEFAULT 0,
  hours_this_year DECIMAL(8,2) DEFAULT 0,
  avg_session_hours DECIMAL(4,2) DEFAULT 0,
  longest_session_hours DECIMAL(4,2) DEFAULT 0,

  -- Financial metrics
  total_buyin INTEGER DEFAULT 0,
  total_cashout INTEGER DEFAULT 0,
  avg_buyin INTEGER DEFAULT 0,

  -- Game preferences
  preferred_game TEXT,
  preferred_stakes TEXT,
  games_played JSONB DEFAULT '{}', -- {"nlhe": 50, "plo": 10}

  -- Tournament stats
  tournaments_played INTEGER DEFAULT 0,
  tournament_cashes INTEGER DEFAULT 0,
  tournament_wins INTEGER DEFAULT 0,
  total_tournament_earnings INTEGER DEFAULT 0,

  -- Promotion stats
  promotions_won INTEGER DEFAULT 0,
  promotion_earnings INTEGER DEFAULT 0,

  -- Loyalty
  loyalty_points INTEGER DEFAULT 0,
  loyalty_tier TEXT DEFAULT 'bronze' CHECK (loyalty_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond')),

  -- Referrals
  players_referred INTEGER DEFAULT 0,
  referral_bonus_earned INTEGER DEFAULT 0,

  -- Status
  is_vip BOOLEAN DEFAULT false,
  notes TEXT,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_stats_venue ON commander_player_stats(venue_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON commander_player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_loyalty ON commander_player_stats(venue_id, loyalty_tier);

-- ===================
-- TABLE 5: commander_leaderboards
-- ===================
-- Leaderboard entries for competitions

CREATE TABLE IF NOT EXISTS commander_leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Leaderboard info
  name TEXT NOT NULL,
  description TEXT,
  leaderboard_type TEXT NOT NULL CHECK (leaderboard_type IN (
    'hours_played', 'sessions', 'high_hand', 'tournament_points',
    'referrals', 'custom'
  )),

  -- Period
  period_type TEXT DEFAULT 'monthly' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Prizes
  prizes JSONB DEFAULT '[]', -- [{"position": 1, "prize": "$500"}, ...]

  -- Rules
  min_hours DECIMAL(4,2),
  min_sessions INTEGER,
  eligible_games TEXT[],
  rules_description TEXT,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled')),

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_venue ON commander_leaderboards(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_leaderboards_dates ON commander_leaderboards(start_date, end_date);

-- ===================
-- TABLE 6: commander_leaderboard_entries
-- ===================
-- Player entries in leaderboards

CREATE TABLE IF NOT EXISTS commander_leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id UUID REFERENCES commander_leaderboards(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Score
  score DECIMAL(12,2) DEFAULT 0,
  rank INTEGER,

  -- Breakdown
  hours_played DECIMAL(8,2) DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  qualifying_events INTEGER DEFAULT 0,

  -- Prize
  prize_position INTEGER,
  prize_won TEXT,
  prize_paid BOOLEAN DEFAULT false,

  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT now(),

  UNIQUE(leaderboard_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_lb_entries_leaderboard ON commander_leaderboard_entries(leaderboard_id, rank);
CREATE INDEX IF NOT EXISTS idx_lb_entries_player ON commander_leaderboard_entries(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_promotion_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Promotions: Public can view active, staff can manage
CREATE POLICY promotions_select ON commander_promotions
  FOR SELECT USING (
    status = 'active' OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY promotions_insert ON commander_promotions
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY promotions_update ON commander_promotions
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY promotions_delete ON commander_promotions
  FOR DELETE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Awards: Players see their own, staff see venue awards
CREATE POLICY awards_select ON commander_promotion_awards
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY awards_insert ON commander_promotion_awards
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY awards_update ON commander_promotion_awards
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Analytics: Staff only
CREATE POLICY analytics_select ON commander_analytics_daily
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Player stats: Players see their own, staff see venue stats
CREATE POLICY player_stats_select ON commander_player_stats
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY player_stats_update ON commander_player_stats
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Leaderboards: Public can view
CREATE POLICY leaderboards_select ON commander_leaderboards
  FOR SELECT USING (true);

CREATE POLICY leaderboards_insert ON commander_leaderboards
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY leaderboards_update ON commander_leaderboards
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Leaderboard entries: Public can view
CREATE POLICY lb_entries_select ON commander_leaderboard_entries
  FOR SELECT USING (true);

-- ===================
-- FUNCTIONS
-- ===================

-- Update promotion totals when awards are given
CREATE OR REPLACE FUNCTION update_promotion_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid') THEN
    UPDATE commander_promotions
    SET
      total_awarded = total_awarded + 1,
      total_value_awarded = total_value_awarded + NEW.prize_value,
      updated_at = now()
    WHERE id = NEW.promotion_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS promotion_totals_trigger ON commander_promotion_awards;
CREATE TRIGGER promotion_totals_trigger
AFTER INSERT OR UPDATE ON commander_promotion_awards
FOR EACH ROW EXECUTE FUNCTION update_promotion_totals();

-- Update player stats after session
CREATE OR REPLACE FUNCTION update_player_stats_from_session()
RETURNS TRIGGER AS $$
DECLARE
  session_hours DECIMAL(6,2);
BEGIN
  -- Only process completed sessions
  IF NEW.status != 'completed' OR NEW.total_time_minutes IS NULL THEN
    RETURN NEW;
  END IF;

  session_hours := NEW.total_time_minutes / 60.0;

  INSERT INTO commander_player_stats (
    venue_id,
    player_id,
    first_visit,
    last_visit,
    total_visits,
    total_hours,
    total_buyin,
    total_cashout
  )
  VALUES (
    NEW.venue_id,
    NEW.player_id,
    CURRENT_DATE,
    CURRENT_DATE,
    1,
    session_hours,
    COALESCE(NEW.total_buyin, 0),
    COALESCE(NEW.total_cashout, 0)
  )
  ON CONFLICT (venue_id, player_id) DO UPDATE SET
    last_visit = CURRENT_DATE,
    total_visits = commander_player_stats.total_visits + 1,
    total_hours = commander_player_stats.total_hours + session_hours,
    total_buyin = commander_player_stats.total_buyin + COALESCE(NEW.total_buyin, 0),
    total_cashout = commander_player_stats.total_cashout + COALESCE(NEW.total_cashout, 0),
    avg_session_hours = (commander_player_stats.total_hours + session_hours) / (commander_player_stats.total_visits + 1),
    longest_session_hours = GREATEST(commander_player_stats.longest_session_hours, session_hours),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS player_stats_session_trigger ON commander_player_sessions;
CREATE TRIGGER player_stats_session_trigger
AFTER UPDATE ON commander_player_sessions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.player_id IS NOT NULL)
EXECUTE FUNCTION update_player_stats_from_session();

-- Calculate loyalty tier based on hours
CREATE OR REPLACE FUNCTION calculate_loyalty_tier(hours DECIMAL)
RETURNS TEXT AS $$
BEGIN
  IF hours >= 500 THEN RETURN 'diamond';
  ELSIF hours >= 250 THEN RETURN 'platinum';
  ELSIF hours >= 100 THEN RETURN 'gold';
  ELSIF hours >= 50 THEN RETURN 'silver';
  ELSE RETURN 'bronze';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Update leaderboard rankings
CREATE OR REPLACE FUNCTION update_leaderboard_rankings(lb_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE commander_leaderboard_entries
  SET rank = subquery.new_rank
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as new_rank
    FROM commander_leaderboard_entries
    WHERE leaderboard_id = lb_id
  ) AS subquery
  WHERE commander_leaderboard_entries.id = subquery.id;
END;
$$ LANGUAGE plpgsql;
