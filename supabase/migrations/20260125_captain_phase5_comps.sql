-- =====================================================
-- SMARTER CAPTAIN - PHASE 5 COMPS SYSTEM
-- =====================================================
-- Tables: 4 (Comp Rates, Balances, Transactions, Redemptions)
-- Feature: Player comps tracking and management
-- =====================================================

-- ===================
-- TABLE 1: captain_comp_rates
-- ===================
-- Defines comp earning rates per venue (e.g., $1/hour played)

CREATE TABLE IF NOT EXISTS captain_comp_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Rate info
  name TEXT NOT NULL,
  description TEXT,

  -- Earning method
  rate_type TEXT NOT NULL CHECK (rate_type IN (
    'hourly',      -- $X per hour played
    'buyin',       -- $X per $Y bought in
    'session',     -- $X per session
    'tournament',  -- $X per tournament entry
    'manual'       -- Only issued manually
  )),

  -- Rate values
  comp_value DECIMAL(6,2) NOT NULL,  -- Amount earned
  per_unit DECIMAL(10,2) DEFAULT 1,  -- Per this many units (e.g., 1 hour, $100 buyin)
  unit_label TEXT,                    -- e.g., "hour", "$100"

  -- Conditions
  min_stakes TEXT,                   -- Minimum stakes to qualify
  game_types TEXT[],                 -- Qualifying game types
  min_session_hours DECIMAL(4,2),    -- Minimum session length

  -- Multipliers
  weekday_multiplier DECIMAL(3,2) DEFAULT 1.0,
  weekend_multiplier DECIMAL(3,2) DEFAULT 1.0,
  happy_hour_multiplier DECIMAL(3,2) DEFAULT 1.0,
  vip_multiplier DECIMAL(3,2) DEFAULT 1.0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_rates_venue ON captain_comp_rates(venue_id, is_active);

-- ===================
-- TABLE 2: captain_comp_balances
-- ===================
-- Current comp balance per player per venue

CREATE TABLE IF NOT EXISTS captain_comp_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Balance
  current_balance DECIMAL(10,2) DEFAULT 0,
  lifetime_earned DECIMAL(12,2) DEFAULT 0,
  lifetime_redeemed DECIMAL(12,2) DEFAULT 0,
  lifetime_expired DECIMAL(10,2) DEFAULT 0,
  lifetime_adjusted DECIMAL(10,2) DEFAULT 0,

  -- Last activity
  last_earned_at TIMESTAMPTZ,
  last_redeemed_at TIMESTAMPTZ,

  -- Status
  is_frozen BOOLEAN DEFAULT false,
  frozen_reason TEXT,
  frozen_at TIMESTAMPTZ,
  frozen_by UUID REFERENCES captain_staff(id),

  -- Metadata
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(venue_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_balances_venue ON captain_comp_balances(venue_id);
CREATE INDEX IF NOT EXISTS idx_comp_balances_player ON captain_comp_balances(player_id);
CREATE INDEX IF NOT EXISTS idx_comp_balances_balance ON captain_comp_balances(venue_id, current_balance DESC);

-- ===================
-- TABLE 3: captain_comp_transactions
-- ===================
-- All comp transactions (earn, redeem, adjust, expire)

CREATE TABLE IF NOT EXISTS captain_comp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  balance_id UUID REFERENCES captain_comp_balances(id) ON DELETE CASCADE,

  -- Transaction type
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'earn',       -- Earned from play
    'redeem',     -- Used for something
    'adjust',     -- Manual adjustment (+/-)
    'expire',     -- Expired comps
    'transfer',   -- Transfer between players
    'bonus'       -- Bonus comp award
  )),

  -- Amount
  amount DECIMAL(10,2) NOT NULL,     -- Positive for earn/bonus, negative for redeem/expire
  balance_before DECIMAL(10,2),
  balance_after DECIMAL(10,2),

  -- Source details
  source_type TEXT,                  -- 'session', 'tournament', 'manual', etc.
  source_id UUID,                    -- Reference to session/tournament/etc.
  rate_id UUID REFERENCES captain_comp_rates(id),

  -- Calculation details (for earned comps)
  hours_played DECIMAL(6,2),
  buyin_amount INTEGER,
  multiplier DECIMAL(3,2) DEFAULT 1.0,
  base_amount DECIMAL(10,2),

  -- Approval
  approved_by UUID REFERENCES captain_staff(id),
  approval_notes TEXT,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_transactions_balance ON captain_comp_transactions(balance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_transactions_player ON captain_comp_transactions(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_transactions_venue ON captain_comp_transactions(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comp_transactions_type ON captain_comp_transactions(transaction_type, created_at DESC);

-- ===================
-- TABLE 4: captain_comp_redemptions
-- ===================
-- Track comp redemptions (what they used comps for)

CREATE TABLE IF NOT EXISTS captain_comp_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES captain_comp_transactions(id) ON DELETE CASCADE,
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Redemption details
  redemption_type TEXT NOT NULL CHECK (redemption_type IN (
    'food',          -- Food/beverage
    'merchandise',   -- Gift shop items
    'tournament',    -- Tournament entry
    'cash',          -- Cash out comps
    'hotel',         -- Hotel room
    'other'          -- Other
  )),

  -- Amount
  comp_amount DECIMAL(10,2) NOT NULL,
  cash_value DECIMAL(10,2),

  -- Details
  description TEXT,
  item_details JSONB,  -- What was purchased/redeemed

  -- Processing
  processed_by UUID REFERENCES captain_staff(id),
  processed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'denied', 'voided')),

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_redemptions_venue ON captain_comp_redemptions(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_comp_redemptions_player ON captain_comp_redemptions(player_id);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE captain_comp_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_comp_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_comp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE captain_comp_redemptions ENABLE ROW LEVEL SECURITY;

-- Comp rates: Staff can manage, public can view active
CREATE POLICY comp_rates_select ON captain_comp_rates
  FOR SELECT USING (
    is_active = true OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY comp_rates_insert ON captain_comp_rates
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

CREATE POLICY comp_rates_update ON captain_comp_rates
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Comp balances: Players see their own, staff see venue balances
CREATE POLICY comp_balances_select ON captain_comp_balances
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Comp transactions: Players see their own, staff see venue transactions
CREATE POLICY comp_transactions_select ON captain_comp_transactions
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY comp_transactions_insert ON captain_comp_transactions
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Redemptions: Players see their own, staff see venue redemptions
CREATE POLICY comp_redemptions_select ON captain_comp_redemptions
  FOR SELECT USING (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY comp_redemptions_insert ON captain_comp_redemptions
  FOR INSERT WITH CHECK (
    player_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM captain_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Function to calculate comps from a completed session
CREATE OR REPLACE FUNCTION calculate_session_comps(
  p_session_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_session RECORD;
  v_rate RECORD;
  v_comp_amount DECIMAL(10,2) := 0;
  v_hours_played DECIMAL(6,2);
  v_multiplier DECIMAL(3,2) := 1.0;
  v_is_weekend BOOLEAN;
  v_balance_id UUID;
BEGIN
  -- Get session details
  SELECT * INTO v_session
  FROM captain_player_sessions
  WHERE id = p_session_id AND status = 'completed' AND player_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get active hourly rate for venue
  SELECT * INTO v_rate
  FROM captain_comp_rates
  WHERE venue_id = v_session.venue_id
    AND is_active = true
    AND rate_type = 'hourly'
  ORDER BY is_default DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calculate hours
  v_hours_played := COALESCE(v_session.total_time_minutes, 0) / 60.0;

  -- Check minimum session hours
  IF v_rate.min_session_hours IS NOT NULL AND v_hours_played < v_rate.min_session_hours THEN
    RETURN 0;
  END IF;

  -- Calculate weekend multiplier
  v_is_weekend := EXTRACT(DOW FROM v_session.check_in_time) IN (0, 6);
  IF v_is_weekend THEN
    v_multiplier := v_rate.weekend_multiplier;
  ELSE
    v_multiplier := v_rate.weekday_multiplier;
  END IF;

  -- Calculate comp amount
  v_comp_amount := (v_hours_played / v_rate.per_unit) * v_rate.comp_value * v_multiplier;

  -- Round to 2 decimal places
  v_comp_amount := ROUND(v_comp_amount, 2);

  IF v_comp_amount <= 0 THEN
    RETURN 0;
  END IF;

  -- Get or create balance record
  INSERT INTO captain_comp_balances (venue_id, player_id)
  VALUES (v_session.venue_id, v_session.player_id)
  ON CONFLICT (venue_id, player_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_balance_id;

  -- Update balance
  UPDATE captain_comp_balances
  SET
    current_balance = current_balance + v_comp_amount,
    lifetime_earned = lifetime_earned + v_comp_amount,
    last_earned_at = now(),
    updated_at = now()
  WHERE id = v_balance_id;

  -- Create transaction record
  INSERT INTO captain_comp_transactions (
    venue_id,
    player_id,
    balance_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    source_type,
    source_id,
    rate_id,
    hours_played,
    multiplier,
    base_amount,
    description
  )
  SELECT
    v_session.venue_id,
    v_session.player_id,
    v_balance_id,
    'earn',
    v_comp_amount,
    current_balance - v_comp_amount,
    current_balance,
    'session',
    p_session_id,
    v_rate.id,
    v_hours_played,
    v_multiplier,
    v_rate.comp_value,
    format('Earned from %s hours of play', round(v_hours_played, 1))
  FROM captain_comp_balances WHERE id = v_balance_id;

  RETURN v_comp_amount;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate comps when session completes
CREATE OR REPLACE FUNCTION auto_calculate_session_comps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.player_id IS NOT NULL AND
     (OLD.status IS NULL OR OLD.status != 'completed') THEN
    PERFORM calculate_session_comps(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS session_comps_trigger ON captain_player_sessions;
CREATE TRIGGER session_comps_trigger
AFTER UPDATE ON captain_player_sessions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.player_id IS NOT NULL)
EXECUTE FUNCTION auto_calculate_session_comps();

-- Function to issue manual comps
CREATE OR REPLACE FUNCTION issue_manual_comp(
  p_venue_id INTEGER,
  p_player_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_staff_id UUID
) RETURNS UUID AS $$
DECLARE
  v_balance_id UUID;
  v_transaction_id UUID;
BEGIN
  -- Get or create balance
  INSERT INTO captain_comp_balances (venue_id, player_id)
  VALUES (p_venue_id, p_player_id)
  ON CONFLICT (venue_id, player_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_balance_id;

  -- Update balance
  UPDATE captain_comp_balances
  SET
    current_balance = current_balance + p_amount,
    lifetime_earned = CASE WHEN p_amount > 0 THEN lifetime_earned + p_amount ELSE lifetime_earned END,
    lifetime_adjusted = lifetime_adjusted + p_amount,
    last_earned_at = CASE WHEN p_amount > 0 THEN now() ELSE last_earned_at END,
    updated_at = now()
  WHERE id = v_balance_id;

  -- Create transaction
  INSERT INTO captain_comp_transactions (
    venue_id,
    player_id,
    balance_id,
    transaction_type,
    amount,
    source_type,
    approved_by,
    description
  )
  VALUES (
    p_venue_id,
    p_player_id,
    v_balance_id,
    CASE WHEN p_amount >= 0 THEN 'bonus' ELSE 'adjust' END,
    p_amount,
    'manual',
    p_staff_id,
    p_description
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to redeem comps
CREATE OR REPLACE FUNCTION redeem_comps(
  p_venue_id INTEGER,
  p_player_id UUID,
  p_amount DECIMAL,
  p_redemption_type TEXT,
  p_description TEXT,
  p_staff_id UUID
) RETURNS UUID AS $$
DECLARE
  v_balance RECORD;
  v_transaction_id UUID;
  v_redemption_id UUID;
BEGIN
  -- Get balance
  SELECT * INTO v_balance
  FROM captain_comp_balances
  WHERE venue_id = p_venue_id AND player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No comp balance found for this player';
  END IF;

  IF v_balance.is_frozen THEN
    RAISE EXCEPTION 'Comp balance is frozen';
  END IF;

  IF v_balance.current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient comp balance. Available: %', v_balance.current_balance;
  END IF;

  -- Update balance
  UPDATE captain_comp_balances
  SET
    current_balance = current_balance - p_amount,
    lifetime_redeemed = lifetime_redeemed + p_amount,
    last_redeemed_at = now(),
    updated_at = now()
  WHERE id = v_balance.id;

  -- Create transaction
  INSERT INTO captain_comp_transactions (
    venue_id,
    player_id,
    balance_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    source_type,
    approved_by,
    description
  )
  VALUES (
    p_venue_id,
    p_player_id,
    v_balance.id,
    'redeem',
    -p_amount,
    v_balance.current_balance,
    v_balance.current_balance - p_amount,
    'redemption',
    p_staff_id,
    p_description
  )
  RETURNING id INTO v_transaction_id;

  -- Create redemption record
  INSERT INTO captain_comp_redemptions (
    transaction_id,
    venue_id,
    player_id,
    redemption_type,
    comp_amount,
    description,
    processed_by,
    processed_at,
    status
  )
  VALUES (
    v_transaction_id,
    p_venue_id,
    p_player_id,
    p_redemption_type,
    p_amount,
    p_description,
    p_staff_id,
    now(),
    'completed'
  )
  RETURNING id INTO v_redemption_id;

  RETURN v_redemption_id;
END;
$$ LANGUAGE plpgsql;
