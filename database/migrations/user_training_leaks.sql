-- ═══════════════════════════════════════════════════════════════════════════
-- 🕵️ USER TRAINING LEAKS TABLE
-- Persists detected strategic leaks for Jarvis coaching
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_training_leaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    leak_type TEXT NOT NULL,
    leak_name TEXT NOT NULL,
    description TEXT,
    count INTEGER DEFAULT 1,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    fixed_at TIMESTAMPTZ,
    recommended_drill TEXT,
    metadata JSONB DEFAULT '{}',
    jarvis_notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_user_training_leaks_user_id ON user_training_leaks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_training_leaks_active ON user_training_leaks(user_id, fixed_at) WHERE fixed_at IS NULL;

-- RLS Policies
ALTER TABLE user_training_leaks ENABLE ROW LEVEL SECURITY;

-- Users can read their own leaks
CREATE POLICY "Users can read own leaks"
    ON user_training_leaks FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own leaks
CREATE POLICY "Users can insert own leaks"
    ON user_training_leaks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own leaks
CREATE POLICY "Users can update own leaks"
    ON user_training_leaks FOR UPDATE
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 📬 JARVIS LEAK ALERTS TABLE (for PA inbox)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jarvis_leak_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    leak_id UUID REFERENCES user_training_leaks(id) ON DELETE SET NULL,
    leak_type TEXT NOT NULL,
    message TEXT NOT NULL,
    recommended_action TEXT,
    read BOOLEAN DEFAULT FALSE,
    dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_leak_alerts_user_id ON jarvis_leak_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_leak_alerts_unread ON jarvis_leak_alerts(user_id, read) WHERE read = FALSE;

-- RLS Policies
ALTER TABLE jarvis_leak_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own alerts"
    ON jarvis_leak_alerts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
    ON jarvis_leak_alerts FOR UPDATE
    USING (auth.uid() = user_id);

-- Service role can insert alerts
CREATE POLICY "Service can insert alerts"
    ON jarvis_leak_alerts FOR INSERT
    WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔧 HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Get active (unfixed) leaks for a user
CREATE OR REPLACE FUNCTION get_active_leaks(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    leak_type TEXT,
    leak_name TEXT,
    description TEXT,
    count INTEGER,
    detected_at TIMESTAMPTZ,
    recommended_drill TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.leak_type,
        l.leak_name,
        l.description,
        l.count,
        l.detected_at,
        l.recommended_drill
    FROM user_training_leaks l
    WHERE l.user_id = p_user_id
      AND l.fixed_at IS NULL
    ORDER BY l.count DESC, l.detected_at DESC;
END;
$$;

-- Get unread Jarvis leak alerts
CREATE OR REPLACE FUNCTION get_unread_leak_alerts(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    leak_type TEXT,
    message TEXT,
    recommended_action TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.leak_type,
        a.message,
        a.recommended_action,
        a.created_at
    FROM jarvis_leak_alerts a
    WHERE a.user_id = p_user_id
      AND a.read = FALSE
      AND a.dismissed = FALSE
    ORDER BY a.created_at DESC
    LIMIT 5;
END;
$$;
