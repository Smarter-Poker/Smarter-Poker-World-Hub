-- ═══════════════════════════════════════════════════════════════
-- CLUB ARENA — Full Supabase Migration
-- Creates the complete club poker system (PokerBros-style)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. CLUBS — Each club is a poker room
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,                    -- 6-char join code (e.g. "ABC123")
  description text DEFAULT '',
  logo_url text,
  banner_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  
  -- Economy
  chip_treasury bigint DEFAULT 0,               -- Club's chip bank
  rake_percent numeric(5,2) DEFAULT 5.0,        -- Default rake %
  rake_cap_bb numeric(8,2) DEFAULT 3.0,         -- Default rake cap in BB
  
  -- Settings
  settings jsonb DEFAULT '{}'::jsonb,           -- { allowSelfCredit, maxCredit, actionTime, ... }
  game_variants text[] DEFAULT ARRAY['nlh'],    -- Allowed variants
  max_tables integer DEFAULT 20,
  max_members integer DEFAULT 500,
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  member_count integer DEFAULT 1,
  table_count integer DEFAULT 0,
  hands_played bigint DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clubs_code ON clubs(code);
CREATE INDEX IF NOT EXISTS idx_clubs_owner ON clubs(owner_id);
CREATE INDEX IF NOT EXISTS idx_clubs_status ON clubs(status);

-- ─────────────────────────────────────────────────────────────
-- 2. CLUB_MEMBERS — Players within a club
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  
  -- Role
  role text DEFAULT 'player' CHECK (role IN ('owner', 'agent', 'player')),
  
  -- Chip balance (the core of the PokerBros model)
  chip_balance bigint DEFAULT 0,
  chips_won bigint DEFAULT 0,
  chips_lost bigint DEFAULT 0,
  
  -- Credit system (agents can extend credit)
  credit_limit bigint DEFAULT 0,
  credit_used bigint DEFAULT 0,
  
  -- Agent fields
  agent_id uuid REFERENCES club_members(id),    -- Which agent recruited this player
  commission_rate numeric(5,2) DEFAULT 0,       -- Agent commission %
  rakeback_rate numeric(5,2) DEFAULT 0,         -- Player rakeback %
  
  -- Stats
  hands_played integer DEFAULT 0,
  sessions_played integer DEFAULT 0,
  total_rake_paid bigint DEFAULT 0,
  biggest_pot bigint DEFAULT 0,
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'pending', 'banned', 'left')),
  nickname text,
  notes text,                                   -- Admin notes
  
  joined_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  
  UNIQUE(club_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members(club_id, status);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_club_members_agent ON club_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_club_members_balance ON club_members(club_id, chip_balance DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. CLUB_TABLES — Tables within a club (wraps poker_tables)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  
  -- Table config
  name text NOT NULL,
  game_variant text DEFAULT 'nlh',              -- nlh, plo4, plo5, plo6, plo8, short_deck
  betting_structure text DEFAULT 'no_limit',
  small_blind integer NOT NULL DEFAULT 1,
  big_blind integer NOT NULL DEFAULT 2,
  ante integer DEFAULT 0,
  min_buy_in integer NOT NULL,
  max_buy_in integer NOT NULL,
  max_players integer DEFAULT 9 CHECK (max_players BETWEEN 2 AND 10),
  
  -- Features
  action_time_seconds integer DEFAULT 30,
  run_it_twice boolean DEFAULT false,
  straddle_allowed boolean DEFAULT false,
  bomb_pot_enabled boolean DEFAULT false,
  auto_rebuy boolean DEFAULT false,
  
  -- Rake (inherits from club if not set)
  rake_percent numeric(5,2),
  rake_cap_bb numeric(8,2),
  
  -- Live state
  status text DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'paused', 'closed')),
  current_players integer DEFAULT 0,
  hands_played integer DEFAULT 0,
  total_pot bigint DEFAULT 0,
  
  -- Who created it
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_tables_club ON club_tables(club_id, status);
CREATE INDEX IF NOT EXISTS idx_club_tables_status ON club_tables(status);

-- ─────────────────────────────────────────────────────────────
-- 4. CLUB_TRANSACTIONS — Every chip movement
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES club_members(id) ON DELETE CASCADE,
  
  type text NOT NULL CHECK (type IN (
    'cash_buyin', 'cash_cashout', 'cash_rake',
    'tournament_buyin', 'tournament_rebuy', 'tournament_addon',
    'tournament_payout', 'tournament_refund', 'tournament_rake',
    'chip_grant', 'chip_revoke',
    'credit_issue', 'credit_repay',
    'settlement', 'rakeback', 'agent_fee',
    'jackpot_contribution', 'transfer'
  )),
  
  amount bigint NOT NULL,                       -- Positive = credit, negative = debit
  balance_after bigint NOT NULL,                -- Balance after this transaction
  
  -- Context
  table_id uuid,                                -- Which table (if game-related)
  hand_number integer,                          -- Which hand (if game-related)
  tournament_id uuid,
  performed_by uuid REFERENCES auth.users(id),  -- Who initiated (agent/owner/system)
  note text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_transactions_member ON club_transactions(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_transactions_club ON club_transactions(club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_transactions_type ON club_transactions(club_id, type);

-- ─────────────────────────────────────────────────────────────
-- 5. CLUB_HAND_HISTORIES — Permanent record of every hand
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS club_hand_histories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  table_id uuid NOT NULL,
  hand_number integer NOT NULL,
  
  -- Game info
  game_variant text NOT NULL,
  small_blind integer NOT NULL,
  big_blind integer NOT NULL,
  ante integer DEFAULT 0,
  
  -- Hand data
  players jsonb NOT NULL,                       -- [{ userId, seatIndex, stack, cards, ... }]
  community_cards text[],                       -- ['Ah', 'Kd', '2c', 'Js', '9h']
  actions jsonb NOT NULL,                       -- [{ street, player, action, amount, ... }]
  pots jsonb NOT NULL,                          -- [{ amount, winners, ... }]
  
  -- Summary
  pot_total bigint NOT NULL,
  rake bigint DEFAULT 0,
  winners jsonb NOT NULL,                       -- [{ userId, amount, hand_name }]
  
  played_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_hand_histories_club ON club_hand_histories(club_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_hand_histories_table ON club_hand_histories(table_id, hand_number DESC);

-- ─────────────────────────────────────────────────────────────
-- 6. RLS POLICIES
-- ─────────────────────────────────────────────────────────────

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_hand_histories ENABLE ROW LEVEL SECURITY;

-- Service role: full access (engine runs server-side)
CREATE POLICY "Service full access on clubs" ON clubs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service full access on club_members" ON club_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service full access on club_tables" ON club_tables FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service full access on club_transactions" ON club_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service full access on club_hand_histories" ON club_hand_histories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Clubs: anyone can view active clubs, owners can update
CREATE POLICY "View active clubs" ON clubs FOR SELECT TO authenticated USING (status = 'active');
CREATE POLICY "Owners update clubs" ON clubs FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Users create clubs" ON clubs FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

-- Members: club members can see other members
CREATE POLICY "Members see club members" ON club_members FOR SELECT TO authenticated
  USING (club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND status = 'active'));
CREATE POLICY "Users join clubs" ON club_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Tables: club members can see tables
CREATE POLICY "Members see club tables" ON club_tables FOR SELECT TO authenticated
  USING (club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND status = 'active'));

-- Transactions: members see own transactions
CREATE POLICY "Members see own transactions" ON club_transactions FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM club_members WHERE user_id = auth.uid()));

-- Hand histories: club members can view
CREATE POLICY "Members see hand histories" ON club_hand_histories FOR SELECT TO authenticated
  USING (club_id IN (SELECT club_id FROM club_members WHERE user_id = auth.uid() AND status = 'active'));

-- ─────────────────────────────────────────────────────────────
-- 7. REALTIME — Enable for live updates
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE club_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE club_members;

-- ─────────────────────────────────────────────────────────────
-- 8. HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Generate unique 6-char club code
CREATE OR REPLACE FUNCTION generate_club_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    -- Make sure it's unique
    IF NOT EXISTS (SELECT 1 FROM clubs WHERE code = result) THEN
      RETURN result;
    END IF;
  END LOOP;
END;
$$;

-- Atomic chip transfer (prevents race conditions)
CREATE OR REPLACE FUNCTION transfer_chips(
  p_member_id uuid,
  p_amount bigint,
  p_type text,
  p_club_id uuid,
  p_performed_by uuid DEFAULT NULL,
  p_table_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS bigint  -- returns new balance
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance bigint;
BEGIN
  -- Atomic update
  UPDATE club_members
  SET chip_balance = chip_balance + p_amount,
      last_active_at = now()
  WHERE id = p_member_id
    AND club_id = p_club_id
  RETURNING chip_balance INTO v_new_balance;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  
  -- Prevent negative balance (except credit)
  IF v_new_balance < 0 AND p_type NOT IN ('credit_issue') THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Record transaction
  INSERT INTO club_transactions (club_id, member_id, type, amount, balance_after, performed_by, table_id, note)
  VALUES (p_club_id, p_member_id, p_type, p_amount, v_new_balance, p_performed_by, p_table_id, p_note);
  
  RETURN v_new_balance;
END;
$$;

-- Update club treasury atomically
CREATE OR REPLACE FUNCTION update_club_treasury(
  p_club_id uuid,
  p_amount bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_treasury bigint;
BEGIN
  UPDATE clubs
  SET chip_treasury = chip_treasury + p_amount,
      updated_at = now()
  WHERE id = p_club_id
  RETURNING chip_treasury INTO v_new_treasury;
  
  RETURN v_new_treasury;
END;
$$;

COMMENT ON TABLE clubs IS 'Poker clubs — each is an independent poker room with its own economy';
COMMENT ON TABLE club_members IS 'Club memberships with chip balances, roles, and agent relationships';
COMMENT ON TABLE club_tables IS 'Active tables within clubs';
COMMENT ON TABLE club_transactions IS 'Complete ledger of all chip movements';
COMMENT ON TABLE club_hand_histories IS 'Permanent record of every poker hand played';
