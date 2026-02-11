-- 005: Dealer Time System
-- Pre-paid time balance on member cards, active table sessions with countdowns

-- Add time balance to members (minutes pre-purchased on their card)
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS time_balance_minutes integer DEFAULT 0;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS membership_active boolean DEFAULT true;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS membership_expires_at timestamptz;

-- Active table sessions - tracks who is seated where with countdown timers
CREATE TABLE IF NOT EXISTS commander_table_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL,
  member_id uuid REFERENCES commander_members(id),
  player_name text NOT NULL,
  table_number integer NOT NULL,
  seat_number integer NOT NULL,
  
  -- Time tracking
  time_allocated_minutes integer NOT NULL DEFAULT 0,  -- how many minutes assigned at seating
  time_added_minutes integer NOT NULL DEFAULT 0,      -- additional time added during session
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  
  -- Computed: time_remaining = (time_allocated + time_added) * 60 - EXTRACT(EPOCH FROM (now() - started_at))
  
  -- Membership snapshot at time of seating
  membership_tier text,
  member_number text,
  
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired', 'removed')),
  ended_by text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Only one active session per seat per table
  CONSTRAINT unique_active_seat UNIQUE (venue_id, table_number, seat_number, status)
);

-- Note: The unique constraint above won't work perfectly for 'ended' status rows.
-- We use a partial unique index instead:
DROP INDEX IF EXISTS idx_active_seat_unique;
CREATE UNIQUE INDEX idx_active_seat_unique 
  ON commander_table_sessions (venue_id, table_number, seat_number) 
  WHERE status = 'active';

-- One active session per member at a time
CREATE UNIQUE INDEX idx_active_member_unique
  ON commander_table_sessions (venue_id, member_id)
  WHERE status = 'active';

-- Fast lookups
CREATE INDEX idx_table_sessions_table ON commander_table_sessions (venue_id, table_number, status);
CREATE INDEX idx_table_sessions_member ON commander_table_sessions (member_id, status);

-- RLS
ALTER TABLE commander_table_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_table_sessions"
  ON commander_table_sessions FOR ALL USING (true) WITH CHECK (true);

-- Add time purchase log for audit trail
CREATE TABLE IF NOT EXISTS commander_time_purchases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id uuid NOT NULL,
  member_id uuid REFERENCES commander_members(id),
  minutes_purchased integer NOT NULL,
  amount_paid numeric(10,2),
  payment_method text, -- cash, card, comp
  purchased_by text,   -- staff who processed
  created_at timestamptz DEFAULT now()
);

ALTER TABLE commander_time_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commander_time_purchases"
  ON commander_time_purchases FOR ALL USING (true) WITH CHECK (true);
