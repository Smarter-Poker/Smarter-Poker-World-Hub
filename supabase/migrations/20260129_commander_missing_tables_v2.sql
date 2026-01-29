-- ============================================================
-- Club Commander: Missing Tables (v2)
-- Tables referenced by API code but not in any migration
-- ============================================================

-- High Hands table (used by /api/commander/high-hands/)
CREATE TABLE IF NOT EXISTS commander_high_hands (
  id BIGSERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES poker_venues(id),
  promotion_id BIGINT REFERENCES commander_promotions(id),
  player_id UUID REFERENCES profiles(id),
  table_id BIGINT REFERENCES commander_tables(id),
  game_id BIGINT REFERENCES commander_games(id),
  hand_rank TEXT NOT NULL,
  cards TEXT[],
  board_cards TEXT[],
  prize_amount DECIMAL(10,2) DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commander_high_hands_venue ON commander_high_hands(venue_id);
CREATE INDEX IF NOT EXISTS idx_commander_high_hands_promotion ON commander_high_hands(promotion_id);
CREATE INDEX IF NOT EXISTS idx_commander_high_hands_player ON commander_high_hands(player_id);

ALTER TABLE commander_high_hands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage high hands" ON commander_high_hands
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM commander_staff
      WHERE user_id = auth.uid()
      AND venue_id = commander_high_hands.venue_id
    )
  );

CREATE POLICY "Players can view own high hands" ON commander_high_hands
  FOR SELECT USING (player_id = auth.uid());

-- Leads table (used by /api/commander/leads)
CREATE TABLE IF NOT EXISTS commander_leads (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  source TEXT DEFAULT 'landing_page',
  referrer TEXT,
  interested_plan TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'demo_scheduled', 'converted', 'lost')),
  visit_count INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commander_leads_email ON commander_leads(email);

ALTER TABLE commander_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage leads" ON commander_leads
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- XP Transactions table (used by /src/lib/commander/xp.js)
CREATE TABLE IF NOT EXISTS commander_xp_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  venue_id INTEGER REFERENCES poker_venues(id),
  event_type TEXT NOT NULL,
  xp_amount INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commander_xp_user ON commander_xp_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_commander_xp_venue ON commander_xp_transactions(venue_id);

ALTER TABLE commander_xp_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own XP" ON commander_xp_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role manages XP" ON commander_xp_transactions
  FOR ALL USING (TRUE) WITH CHECK (TRUE);
