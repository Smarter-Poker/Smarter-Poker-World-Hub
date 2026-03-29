-- ClawBot Infrastructure Tables
-- Migration: 2026-03-29
-- Creates: clawbot_audit_log, clawbot_task_state, sentry_error_log

-- ═══════════════════════════════════════════════════════════════════
-- 1. ClawBot Audit Log — Every automation action is tracked here
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clawbot_audit_log (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  clawbot_version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by task and time
CREATE INDEX IF NOT EXISTS idx_clawbot_audit_task_time ON clawbot_audit_log (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clawbot_audit_severity ON clawbot_audit_log (severity) WHERE severity IN ('error', 'critical');

-- Auto-cleanup: keep 90 days of audit logs
-- (Run via cron or manual: DELETE FROM clawbot_audit_log WHERE created_at < NOW() - INTERVAL '90 days')

-- ═══════════════════════════════════════════════════════════════════
-- 2. ClawBot Task State — Persistent state for each task
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clawbot_task_state (
  task_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'success', 'failed', 'skipped')),
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_details JSONB DEFAULT '{}',
  run_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to increment run_count on status change
CREATE OR REPLACE FUNCTION increment_clawbot_run_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('success', 'failed') AND (OLD.status IS NULL OR OLD.status != NEW.status) THEN
    NEW.run_count = COALESCE(OLD.run_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clawbot_run_count_trigger ON clawbot_task_state;
CREATE TRIGGER clawbot_run_count_trigger
  BEFORE UPDATE ON clawbot_task_state
  FOR EACH ROW
  EXECUTE FUNCTION increment_clawbot_run_count();

-- ═══════════════════════════════════════════════════════════════════
-- 3. Sentry Error Log — Daily snapshots of Sentry issues
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sentry_error_log (
  id BIGSERIAL PRIMARY KEY,
  sentry_issue_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  culprit TEXT,
  level TEXT DEFAULT 'error',
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  user_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  page_url TEXT,
  category TEXT,
  is_new BOOLEAN DEFAULT false,
  sentry_link TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique per issue per day (prevents duplicate snapshots)
  UNIQUE (sentry_issue_id, snapshot_date)
);

-- Index for querying by date and impact
CREATE INDEX IF NOT EXISTS idx_sentry_log_date ON sentry_error_log (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentry_log_impact ON sentry_error_log (user_count DESC, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentry_log_category ON sentry_error_log (category, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentry_log_new ON sentry_error_log (is_new, snapshot_date DESC) WHERE is_new = true;

-- ═══════════════════════════════════════════════════════════════════
-- 4. RLS Policies — Service role only (no user access)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE clawbot_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE clawbot_task_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentry_error_log ENABLE ROW LEVEL SECURITY;

-- Service role gets full access
CREATE POLICY "service_role_full_access_audit" ON clawbot_audit_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_state" ON clawbot_task_state
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_sentry" ON sentry_error_log
  FOR ALL USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════
-- Done
-- ═══════════════════════════════════════════════════════════════════
