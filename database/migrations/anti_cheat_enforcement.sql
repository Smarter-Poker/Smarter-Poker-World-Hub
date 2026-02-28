-- ═══════════════════════════════════════════════════════════════
-- 🛡️ ANTI-CHEAT ENFORCEMENT TABLES
-- ═══════════════════════════════════════════════════════════════
-- Run this migration to create the tables needed for anti-cheat
-- enforcement: flags, active sessions, and audit events.
-- ═══════════════════════════════════════════════════════════════

-- 1. Anti-cheat flags — persisted from in-memory detection
CREATE TABLE IF NOT EXISTS anti_cheat_flags (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id       UUID REFERENCES clubs(id) ON DELETE SET NULL,
  table_id      UUID REFERENCES tables(id) ON DELETE SET NULL,
  flag_type     TEXT NOT NULL CHECK (flag_type IN (
    'ip_conflict', 'multi_account', 'downline_limit', 'gps_proximity',
    'emulator', 'bot_timing', 'bot_pattern', 'bot_speed',
    'collusion', 'rate_limit', 'manual'
  )),
  reason        TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,
  flagged_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for flag lookups
CREATE INDEX IF NOT EXISTS idx_acf_player ON anti_cheat_flags(player_id);
CREATE INDEX IF NOT EXISTS idx_acf_club ON anti_cheat_flags(club_id);
CREATE INDEX IF NOT EXISTS idx_acf_table ON anti_cheat_flags(table_id);
CREATE INDEX IF NOT EXISTS idx_acf_type ON anti_cheat_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_acf_status ON anti_cheat_flags(status);
CREATE INDEX IF NOT EXISTS idx_acf_severity ON anti_cheat_flags(severity, status);
CREATE INDEX IF NOT EXISTS idx_acf_flagged ON anti_cheat_flags(flagged_at DESC);

-- 2. Table sessions — track active player sessions with IP/GPS/fingerprint
CREATE TABLE IF NOT EXISTS table_sessions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id      UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id       UUID REFERENCES clubs(id) ON DELETE SET NULL,
  seat_index    SMALLINT NOT NULL,
  ip_address    INET,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  fingerprint   TEXT,
  user_agent    TEXT,
  seated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at       TIMESTAMPTZ,
  kick_reason   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one active session per player per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_ts_active_player_table
  ON table_sessions(table_id, player_id) WHERE is_active = TRUE;

-- Indexes for session queries
CREATE INDEX IF NOT EXISTS idx_ts_table_active ON table_sessions(table_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ts_player ON table_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_ts_club ON table_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_ts_ip ON table_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_ts_fingerprint ON table_sessions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_ts_seated ON table_sessions(seated_at DESC);

-- 3. Anti-cheat audit events — log every enforcement action
CREATE TABLE IF NOT EXISTS anti_cheat_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'seat_blocked', 'seat_warned', 'player_kicked', 'flag_created',
    'flag_reviewed', 'flag_dismissed', 'flag_actioned',
    'session_started', 'session_ended'
  )),
  player_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_id       UUID REFERENCES clubs(id) ON DELETE SET NULL,
  table_id      UUID REFERENCES tables(id) ON DELETE SET NULL,
  details       JSONB NOT NULL DEFAULT '{}',
  triggered_by  TEXT, -- 'system' or admin user_id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ace_player ON anti_cheat_events(player_id);
CREATE INDEX IF NOT EXISTS idx_ace_club ON anti_cheat_events(club_id);
CREATE INDEX IF NOT EXISTS idx_ace_type ON anti_cheat_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ace_created ON anti_cheat_events(created_at DESC);

-- 4. RLS policies — club owners/admins can read their club's data
ALTER TABLE anti_cheat_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE anti_cheat_events ENABLE ROW LEVEL SECURITY;

-- Club admins can view flags for their club
CREATE POLICY acf_club_admin_read ON anti_cheat_flags
  FOR SELECT USING (
    club_id IN (
      SELECT club_id FROM club_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Club admins can update flag status (review/dismiss/action)
CREATE POLICY acf_club_admin_update ON anti_cheat_flags
  FOR UPDATE USING (
    club_id IN (
      SELECT club_id FROM club_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Club admins can view sessions for their club
CREATE POLICY ts_club_admin_read ON table_sessions
  FOR SELECT USING (
    club_id IN (
      SELECT club_id FROM club_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Club admins can view events for their club
CREATE POLICY ace_club_admin_read ON anti_cheat_events
  FOR SELECT USING (
    club_id IN (
      SELECT club_id FROM club_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- Service role can do everything (for API endpoints using service key)
CREATE POLICY acf_service_all ON anti_cheat_flags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY ts_service_all ON table_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY ace_service_all ON anti_cheat_events FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Function to get active sessions at a table (for anti-cheat lookups)
CREATE OR REPLACE FUNCTION get_table_sessions(p_table_id UUID)
RETURNS TABLE (
  player_id UUID,
  seat_index SMALLINT,
  ip_address INET,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  fingerprint TEXT,
  seated_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT player_id, seat_index, ip_address, latitude, longitude, fingerprint, seated_at
  FROM table_sessions
  WHERE table_id = p_table_id AND is_active = TRUE
  ORDER BY seat_index;
$$;

-- Function to get open flags for a club
CREATE OR REPLACE FUNCTION get_club_flags(p_club_id UUID, p_status TEXT DEFAULT 'open')
RETURNS SETOF anti_cheat_flags
LANGUAGE sql STABLE AS $$
  SELECT * FROM anti_cheat_flags
  WHERE club_id = p_club_id AND status = p_status
  ORDER BY flagged_at DESC
  LIMIT 100;
$$;

-- Function to close a session when player leaves
CREATE OR REPLACE FUNCTION close_table_session(p_table_id UUID, p_player_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  UPDATE table_sessions
  SET is_active = FALSE, left_at = NOW(), kick_reason = p_reason
  WHERE table_id = p_table_id AND player_id = p_player_id AND is_active = TRUE;
$$;
