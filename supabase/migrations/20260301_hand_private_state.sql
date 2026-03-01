-- ================================================================
-- hand_private_state — Restricted hole card storage for crash recovery
-- SECURITY: No SELECT policy for regular users. Only service_role can read.
-- This prevents the hole card exposure via tables.live_state RLS.
-- ================================================================

CREATE TABLE IF NOT EXISTS hand_private_state (
  table_id UUID PRIMARY KEY REFERENCES tables(id) ON DELETE CASCADE,
  hand_number INTEGER NOT NULL,
  hole_cards JSONB NOT NULL DEFAULT '{}',
  saved_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS with NO policies — only service_role bypasses
ALTER TABLE hand_private_state ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies = zero access via anon/authenticated
-- Service role key (used by StateSerializer) bypasses RLS automatically

COMMENT ON TABLE hand_private_state IS 
  'Restricted: stores player hole cards during live hands for crash recovery. '
  'NO RLS policies = only accessible via service_role key (server-side).';
