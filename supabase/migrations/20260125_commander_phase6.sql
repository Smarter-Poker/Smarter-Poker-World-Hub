-- =====================================================
-- CLUB COMMANDER - PHASE 6 DATABASE MIGRATION
-- =====================================================
-- Tables: 4 (Audit Logs, Rate Limits, System Health, Admin)
-- Phase: Scale & Polish
-- =====================================================

-- ===================
-- TABLE 1: commander_audit_logs
-- ===================
-- Complete audit trail for all actions

CREATE TABLE IF NOT EXISTS commander_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE SET NULL,

  -- Actor
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES commander_staff(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'staff', 'system', 'api')),
  actor_name TEXT,

  -- Action
  action TEXT NOT NULL,
  action_category TEXT NOT NULL CHECK (action_category IN (
    'auth', 'waitlist', 'game', 'table', 'tournament', 'player',
    'promotion', 'comp', 'settings', 'staff', 'export', 'admin'
  )),

  -- Target
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,

  -- Details
  changes JSONB,  -- {field: {old: x, new: y}}
  metadata JSONB DEFAULT '{}',

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,

  -- Result
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure', 'warning')),
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_venue ON commander_audit_logs(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON commander_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON commander_audit_logs(action_category, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON commander_audit_logs(created_at DESC);

-- Partition by month for performance (optional - implement if needed)
-- CREATE INDEX IF NOT EXISTS idx_audit_logs_month ON commander_audit_logs(date_trunc('month', created_at));

-- ===================
-- TABLE 2: commander_rate_limits
-- ===================
-- Track API rate limiting per user/IP

CREATE TABLE IF NOT EXISTS commander_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifier
  identifier TEXT NOT NULL,  -- user_id, ip_address, or api_key
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('user', 'ip', 'api_key', 'venue')),

  -- Endpoint
  endpoint TEXT NOT NULL,  -- e.g., '/api/commander/waitlist'

  -- Counts
  request_count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT now(),
  window_minutes INTEGER DEFAULT 1,

  -- Limits
  max_requests INTEGER DEFAULT 60,
  is_blocked BOOLEAN DEFAULT false,
  blocked_until TIMESTAMPTZ,
  block_reason TEXT,

  -- Metadata
  last_request_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(identifier, identifier_type, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON commander_rate_limits(identifier, identifier_type);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked ON commander_rate_limits(is_blocked, blocked_until);

-- ===================
-- TABLE 3: commander_system_health
-- ===================
-- System health metrics for monitoring

CREATE TABLE IF NOT EXISTS commander_system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Metrics
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'api_latency', 'db_latency', 'realtime_lag', 'error_rate',
    'active_connections', 'queue_depth', 'memory_usage'
  )),
  metric_value DECIMAL(12,4) NOT NULL,
  metric_unit TEXT,

  -- Context
  endpoint TEXT,
  details JSONB,

  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_venue ON commander_system_health(venue_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_type ON commander_system_health(metric_type, recorded_at DESC);

-- Auto-cleanup old health metrics (keep 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_health_metrics()
RETURNS void AS $$
BEGIN
  DELETE FROM commander_system_health
  WHERE recorded_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ===================
-- TABLE 4: commander_admin_settings
-- ===================
-- Platform-wide admin settings

CREATE TABLE IF NOT EXISTS commander_admin_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope TEXT NOT NULL CHECK (scope IN ('global', 'venue', 'user')),
  scope_id TEXT,  -- venue_id or user_id if scoped

  -- Setting
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  setting_type TEXT DEFAULT 'json' CHECK (setting_type IN ('string', 'number', 'boolean', 'json', 'array')),

  -- Description
  description TEXT,
  is_sensitive BOOLEAN DEFAULT false,

  -- Metadata
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(scope, scope_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_settings_scope ON commander_admin_settings(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON commander_admin_settings(setting_key);

-- ===================
-- TABLE 5: commander_export_jobs
-- ===================
-- Track data export requests

CREATE TABLE IF NOT EXISTS commander_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Requester
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Export config
  export_type TEXT NOT NULL CHECK (export_type IN (
    'players', 'sessions', 'waitlist', 'tournaments', 'analytics',
    'promotions', 'comps', 'audit_logs', 'full_backup'
  )),
  date_from DATE,
  date_to DATE,
  filters JSONB DEFAULT '{}',
  format TEXT DEFAULT 'csv' CHECK (format IN ('csv', 'json', 'xlsx')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
  progress INTEGER DEFAULT 0,  -- 0-100

  -- Result
  file_url TEXT,
  file_size INTEGER,
  row_count INTEGER,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_venue ON commander_export_jobs(venue_id, status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_user ON commander_export_jobs(requested_by, created_at DESC);

-- ===================
-- TABLE 6: commander_api_keys
-- ===================
-- API keys for external integrations

CREATE TABLE IF NOT EXISTS commander_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id INTEGER REFERENCES poker_venues(id) ON DELETE CASCADE,

  -- Key details
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,  -- SHA-256 hash of the key
  key_prefix TEXT NOT NULL,  -- First 8 chars for identification

  -- Permissions
  permissions TEXT[] DEFAULT '{}',  -- ['read:waitlist', 'write:games', etc.]

  -- Limits
  rate_limit INTEGER DEFAULT 1000,  -- requests per hour
  allowed_ips TEXT[],  -- IP whitelist (empty = any)

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_venue ON commander_api_keys(venue_id, is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON commander_api_keys(key_prefix);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_api_keys ENABLE ROW LEVEL SECURITY;

-- Audit logs: Staff managers+ can view their venue's logs
CREATE POLICY audit_logs_select ON commander_audit_logs
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Rate limits: System only (via service role)
-- No user policies needed

-- System health: Managers can view their venue
CREATE POLICY system_health_select ON commander_system_health
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- Admin settings: Based on scope
CREATE POLICY admin_settings_select ON commander_admin_settings
  FOR SELECT USING (
    scope = 'global' OR
    (scope = 'venue' AND scope_id IN (SELECT venue_id::text FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)) OR
    (scope = 'user' AND scope_id = auth.uid()::text)
  );

CREATE POLICY admin_settings_update ON commander_admin_settings
  FOR UPDATE USING (
    (scope = 'venue' AND scope_id IN (SELECT venue_id::text FROM commander_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)) OR
    (scope = 'user' AND scope_id = auth.uid()::text)
  );

-- Export jobs: Users can view their own, staff can view venue exports
CREATE POLICY export_jobs_select ON commander_export_jobs
  FOR SELECT USING (
    requested_by = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

CREATE POLICY export_jobs_insert ON commander_export_jobs
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role IN ('owner', 'manager') AND is_active = true)
  );

-- API keys: Owners only
CREATE POLICY api_keys_select ON commander_api_keys
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

CREATE POLICY api_keys_insert ON commander_api_keys
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

CREATE POLICY api_keys_update ON commander_api_keys
  FOR UPDATE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

CREATE POLICY api_keys_delete ON commander_api_keys
  FOR DELETE USING (
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true)
  );

-- ===================
-- FUNCTIONS
-- ===================

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
  p_venue_id INTEGER,
  p_user_id UUID,
  p_staff_id UUID,
  p_actor_type TEXT,
  p_action TEXT,
  p_action_category TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_changes JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO commander_audit_logs (
    venue_id, user_id, staff_id, actor_type,
    action, action_category,
    target_type, target_id, changes, metadata
  ) VALUES (
    p_venue_id, p_user_id, p_staff_id, p_actor_type,
    p_action, p_action_category,
    p_target_type, p_target_id, p_changes, p_metadata
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_identifier_type TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_minutes INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
  v_record RECORD;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;

  -- Get or create rate limit record
  SELECT * INTO v_record
  FROM commander_rate_limits
  WHERE identifier = p_identifier
    AND identifier_type = p_identifier_type
    AND endpoint = p_endpoint
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Create new record
    INSERT INTO commander_rate_limits (
      identifier, identifier_type, endpoint,
      request_count, window_start, window_minutes, max_requests
    ) VALUES (
      p_identifier, p_identifier_type, p_endpoint,
      1, now(), p_window_minutes, p_max_requests
    );
    RETURN true;
  END IF;

  -- Check if blocked
  IF v_record.is_blocked AND v_record.blocked_until > now() THEN
    RETURN false;
  END IF;

  -- Check if window expired
  IF v_record.window_start < v_window_start THEN
    -- Reset window
    UPDATE commander_rate_limits
    SET request_count = 1, window_start = now(), is_blocked = false, blocked_until = NULL
    WHERE id = v_record.id;
    RETURN true;
  END IF;

  -- Check if over limit
  IF v_record.request_count >= p_max_requests THEN
    -- Block for window duration
    UPDATE commander_rate_limits
    SET is_blocked = true, blocked_until = now() + (p_window_minutes || ' minutes')::INTERVAL
    WHERE id = v_record.id;
    RETURN false;
  END IF;

  -- Increment counter
  UPDATE commander_rate_limits
  SET request_count = request_count + 1, last_request_at = now()
  WHERE id = v_record.id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to record system health metric
CREATE OR REPLACE FUNCTION record_health_metric(
  p_venue_id INTEGER,
  p_metric_type TEXT,
  p_metric_value DECIMAL,
  p_metric_unit TEXT DEFAULT NULL,
  p_endpoint TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO commander_system_health (
    venue_id, metric_type, metric_value, metric_unit, endpoint, details
  ) VALUES (
    p_venue_id, p_metric_type, p_metric_value, p_metric_unit, p_endpoint, p_details
  );
END;
$$ LANGUAGE plpgsql;

-- Cleanup function for expired data
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- Clean old rate limit records (older than 1 day)
  DELETE FROM commander_rate_limits
  WHERE last_request_at < now() - INTERVAL '1 day';

  -- Clean old health metrics (older than 7 days)
  DELETE FROM commander_system_health
  WHERE recorded_at < now() - INTERVAL '7 days';

  -- Mark expired exports
  UPDATE commander_export_jobs
  SET status = 'expired'
  WHERE status = 'completed'
    AND expires_at < now();

  -- Clean old audit logs (keep 90 days by default)
  -- Uncomment if needed:
  -- DELETE FROM commander_audit_logs
  -- WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Insert default global settings
INSERT INTO commander_admin_settings (scope, setting_key, setting_value, description)
VALUES
  ('global', 'rate_limit_default', '{"requests": 60, "window_minutes": 1}', 'Default API rate limit'),
  ('global', 'export_retention_days', '7', 'Days to keep export files'),
  ('global', 'audit_retention_days', '90', 'Days to keep audit logs'),
  ('global', 'session_timeout_minutes', '480', 'Max session duration before auto-checkout'),
  ('global', 'waitlist_max_entries', '50', 'Max waitlist entries per player per venue'),
  ('global', 'notification_cooldown_minutes', '5', 'Min time between notifications to same player')
ON CONFLICT (scope, scope_id, setting_key) DO NOTHING;
