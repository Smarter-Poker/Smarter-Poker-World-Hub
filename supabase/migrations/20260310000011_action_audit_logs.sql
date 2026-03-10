-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: action_audit_logs — Immutable audit trail for ALL financial operations
-- Date: 2026-03-10
-- ORB-5 MANDATE: Every transaction, movement, and mutation MUST be tracked.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS action_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type   TEXT NOT NULL,
  user_id       UUID,                    -- Who performed the action
  target_user_id UUID,                   -- Who was affected (player, agent, etc.)
  club_id       UUID,                    -- Which club context
  amount        NUMERIC(14,2),           -- Financial amount (if applicable)
  ip_address    TEXT,                     -- IP for forensics
  details       JSONB DEFAULT '{}',      -- Full action details (immutable snapshot)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. INDEXES — Fast lookup by club, user, action type, and time range
CREATE INDEX IF NOT EXISTS idx_audit_logs_club_time
  ON action_audit_logs(club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time
  ON action_audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
  ON action_audit_logs(action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user
  ON action_audit_logs(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- 3. RLS — Service role only (immutable — no user-facing writes or deletes)
ALTER TABLE action_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to READ their own audit logs (for transparency)
DROP POLICY IF EXISTS "audit_logs_select_own" ON action_audit_logs;
CREATE POLICY "audit_logs_select_own" ON action_audit_logs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR auth.uid() = target_user_id
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users
-- Only service_role (supabaseAdmin) can write — enforced by RLS

-- 4. ENABLE REALTIME (optional — for live admin dashboards)
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS action_audit_logs;

-- 5. COMMENT
COMMENT ON TABLE action_audit_logs IS 'ORB-5 immutable audit trail. Records every financial transaction, agent action, and chip movement. Service-role write only.';
