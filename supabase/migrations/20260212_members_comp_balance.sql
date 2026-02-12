-- Add comp_balance to commander_members for staff-facing comp tracking
-- This is the simpler model: each venue member has a direct comp balance
-- that staff can award/deduct via PIN authorization

ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_lifetime_earned DECIMAL(10,2) DEFAULT 0;
ALTER TABLE commander_members ADD COLUMN IF NOT EXISTS comp_lifetime_redeemed DECIMAL(10,2) DEFAULT 0;

-- Comp transaction log tied to members (not auth profiles)
CREATE TABLE IF NOT EXISTS commander_member_comp_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER NOT NULL REFERENCES poker_venues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES commander_members(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'award', -- 'award', 'redeem', 'adjustment'
  reason TEXT,
  authorized_by TEXT,
  authorized_pin BOOLEAN DEFAULT false,
  processed_by UUID,
  balance_after DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_comp_log_venue ON commander_member_comp_log(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_comp_log_member ON commander_member_comp_log(member_id, created_at DESC);
