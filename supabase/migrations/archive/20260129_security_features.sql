-- ============================================================================
-- SETTINGS PAGE SECURITY FEATURES - Database Schema
-- Two-Factor Authentication (2FA) and Session Management
-- Created: 2026-01-29
-- ============================================================================

-- ============================================================================
-- TABLE 1: user_sessions - Track active login sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name TEXT,
    ip_address TEXT,
    user_agent TEXT,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_active ON user_sessions(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, last_active DESC);

-- Enable Row Level Security
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own sessions
CREATE POLICY "user_sessions_select_own" ON user_sessions 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_sessions_insert_own" ON user_sessions 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sessions_update_own" ON user_sessions 
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_sessions_delete_own" ON user_sessions 
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- TABLE 2: user_mfa_factors - Store 2FA secrets
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_mfa_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    secret TEXT NOT NULL, -- TOTP secret (should be encrypted in production)
    backup_codes TEXT[], -- Recovery codes (should be hashed in production)
    enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_user_mfa_factors_user_id ON user_mfa_factors(user_id);

-- Enable Row Level Security
ALTER TABLE user_mfa_factors ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own MFA data
CREATE POLICY "user_mfa_factors_select_own" ON user_mfa_factors 
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_mfa_factors_insert_own" ON user_mfa_factors 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_mfa_factors_update_own" ON user_mfa_factors 
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_mfa_factors_delete_own" ON user_mfa_factors 
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to clean up old sessions (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions 
    WHERE last_active < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SUCCESS! Security features tables are ready.
-- Next: Create API endpoints for 2FA and session management
-- ============================================================================
