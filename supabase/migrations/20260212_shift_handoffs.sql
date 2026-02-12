-- Shift Handoff system for floor staff transitions
-- Outgoing floor passes context (open tables, issues, notes) to incoming

CREATE TABLE IF NOT EXISTS commander_shift_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  outgoing_staff_id UUID NOT NULL,
  outgoing_staff_name TEXT NOT NULL,
  incoming_staff_id UUID,
  incoming_staff_name TEXT,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  handoff_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'expired')),

  -- Snapshot of floor state at handoff
  open_tables_count INTEGER DEFAULT 0,
  active_players_count INTEGER DEFAULT 0,
  waitlist_count INTEGER DEFAULT 0,
  open_incidents_count INTEGER DEFAULT 0,

  -- Staff notes
  notes TEXT,
  issues TEXT,
  vip_alerts TEXT,
  pending_actions TEXT,

  -- Table-level detail (JSON array of table snapshots)
  table_snapshot JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_handoffs_venue ON commander_shift_handoffs(venue_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS idx_shift_handoffs_status ON commander_shift_handoffs(venue_id, status);
